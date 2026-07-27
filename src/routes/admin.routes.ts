import { Router, Response } from 'express'
import { prisma } from '../config/database'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// Middleware — admin only
const adminOnly = (req: any, res: Response, next: any) => {
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Admin access required' })
    return
  }
  next()
}

// GET /api/admin/stats
router.get('/stats', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const [
      totalUsers,
      totalAgents,
      totalGroups,
      totalTransactions,
      verifiedUsers,
      activeGroups,
      guaranteedGroups,
      totalDefaults,
      activeDefaults,
      totalSavingsGoals,
      activeSavingsGoals
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'CONTRIBUTOR' } }),
      prisma.user.count({ where: { role: 'AGENT' } }),
      prisma.ajoGroup.count(),
      prisma.transaction.count(),
      prisma.user.count({ where: { isVerified: true } }),
      prisma.ajoGroup.count({ where: { isActive: true } }),
      prisma.ajoGroup.count({ where: { isGuaranteed: true } }),
      prisma.defaultRecord.count(),
      prisma.defaultRecord.count({ where: { recoveryStatus: { in: ['PENDING', 'SOFT_RECOVERY', 'HARD_RECOVERY'] } } }),
      prisma.savingsGoal.count(),
      prisma.savingsGoal.count({ where: { status: 'ACTIVE' } })
    ])

    const wallets = await prisma.wallet.aggregate({
      _sum: { balance: true, totalSaved: true }
    })

    const savingsAggregate = await prisma.savingsGoal.aggregate({
      _sum: { currentAmount: true }
    })

    const recentTransactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { wallet: { include: { user: true } } }
    })

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const dailyVolume = await prisma.transaction.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: sevenDaysAgo }, status: 'SUCCESS' },
      _sum: { amount: true },
      _count: true
    })

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalAgents,
        totalGroups,
        totalTransactions,
        verifiedUsers,
        activeGroups,
        guaranteedGroups,
        totalDefaults,
        activeDefaults,
        totalSavingsGoals,
        activeSavingsGoals,
        totalSavingsAmount: savingsAggregate._sum.currentAmount || 0,
        totalBalance: wallets._sum.balance || 0,
        totalSaved: wallets._sum.totalSaved || 0,
        recentTransactions,
        dailyVolume
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/admin/users
router.get('/users', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { wallet: true }
    })
    const safeUsers = users.map((u: any) => ({
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
      email: u.email,
      role: u.role,
      isVerified: u.isVerified,
      isActive: u.isActive,
      trustScore: u.trustScore,
      createdAt: u.createdAt,
      wallet: u.wallet
    }))
    res.status(200).json({ success: true, data: safeUsers })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/admin/transactions
router.get('/transactions', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { wallet: { include: { user: true } } }
    })
    res.status(200).json({ success: true, data: transactions })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/admin/ajo-groups
router.get('/ajo-groups', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const groups = await prisma.ajoGroup.findMany({
      orderBy: { createdAt: 'desc' },
      include: { members: true }
    })
    res.status(200).json({ success: true, data: groups })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/admin/ajo/create
router.post('/ajo/create', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const { name, amount, frequency, totalMembers } = req.body
    if (!name || !amount || !frequency || !totalMembers) {
      res.status(400).json({ success: false, message: 'All fields required' })
      return
    }
    if (totalMembers < 6 || totalMembers > 12) {
      res.status(400).json({ success: false, message: 'Members must be between 6 and 12' })
      return
    }
    const group = await prisma.ajoGroup.create({
      data: {
        name, amount, frequency, totalMembers,
        currentCycle: 0, isActive: true,
        isGuaranteed: false,
        createdBy: req.user.userId
      }
    })
    res.status(201).json({ success: true, message: 'Ajo group created!', data: group })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// DELETE /api/admin/ajo/:id
router.delete('/ajo/:id', protect, adminOnly, async (req: any, res: Response) => {
  try {
    await prisma.ajoMember.deleteMany({ where: { groupId: req.params.id } })
    await prisma.ajoGroup.delete({ where: { id: req.params.id } })
    res.status(200).json({ success: true, message: 'Group deleted' })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/admin/agents
router.get('/agents', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const agents = await prisma.user.findMany({
      where: { role: 'AGENT' },
      include: { wallet: true }
    })
    res.status(200).json({ success: true, data: agents })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/admin/wallet/lock/:userId
router.post('/wallet/lock/:userId', protect, adminOnly, async (req: any, res: Response) => {
  try {
    await prisma.wallet.update({
      where: { userId: req.params.userId },
      data: { isLocked: true }
    })
    res.status(200).json({ success: true, message: 'Wallet locked successfully' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/admin/wallet/unlock/:userId
router.post('/wallet/unlock/:userId', protect, adminOnly, async (req: any, res: Response) => {
  try {
    await prisma.wallet.update({
      where: { userId: req.params.userId },
      data: { isLocked: false }
    })
    res.status(200).json({ success: true, message: 'Wallet unlocked successfully' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/admin/security-log
router.get('/security-log', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const recentActivity = await prisma.user.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fullName: true,
        phone: true,
        isVerified: true,
        trustScore: true,
        updatedAt: true,
        role: true
      }
    })
    res.status(200).json({ success: true, data: recentActivity })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/admin/savings/goals
router.get('/savings/goals', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const goals = await prisma.savingsGoal.findMany({
      include: {
        user: { select: { fullName: true, phone: true } },
        contributions: { orderBy: { createdAt: 'desc' }, take: 3 }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.status(200).json({ success: true, data: goals })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/admin/savings/stats
router.get('/savings/stats', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const [total, active, completed, withdrawn] = await Promise.all([
      prisma.savingsGoal.count(),
      prisma.savingsGoal.count({ where: { status: 'ACTIVE' } }),
      prisma.savingsGoal.count({ where: { status: 'COMPLETED' } }),
      prisma.savingsGoal.count({ where: { status: 'WITHDRAWN' } })
    ])

    const aggregate = await prisma.savingsGoal.aggregate({
      _sum: { currentAmount: true, goalAmount: true }
    })

    res.status(200).json({
      success: true,
      data: {
        total,
        active,
        completed,
        withdrawn,
        totalSaved: aggregate._sum.currentAmount || 0,
        totalTarget: aggregate._sum.goalAmount || 0
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/admin/notifications/send
router.post('/notifications/send', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const { title, body, type } = req.body
    if (!title || !body) {
      res.status(400).json({ success: false, message: 'Title and body are required' })
      return
    }

    // Get users based on type
    let users: any[] = []
    if (type === 'verified') {
      users = await prisma.user.findMany({ where: { isVerified: true, role: 'CONTRIBUTOR' } })
    } else if (type === 'unverified') {
      users = await prisma.user.findMany({ where: { isVerified: false, role: 'CONTRIBUTOR' } })
    } else {
      users = await prisma.user.findMany({ where: { role: 'CONTRIBUTOR' } })
    }

    // For now log the notification — push notifications will be added with Expo push tokens
    console.log(`📢 Admin notification sent to ${users.length} users: ${title}`)

    res.status(200).json({
      success: true,
      message: `Notification sent to ${users.length} users!`,
      data: { sent: users.length, title, body }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})
// POST /api/admin/kyc/reject/:userId  { reason }
// Clears the submitted identifiers so the customer can resubmit, and tells
// them why. Rejection without a reason is a dead end for the customer.
router.post('/kyc/reject/:userId', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const { reason } = req.body
    if (!reason || String(reason).trim().length < 5) {
      res.status(400).json({ success: false, message: 'A reason is required' })
      return
    }
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { bvn: null, nin: null, isVerified: false },
      select: { id: true, fullName: true, pushToken: true }
    })
    const { sendPush } = await import('../utils/push')
    await sendPush(
      [user.pushToken],
      'Verification not approved',
      `Your identity verification could not be approved: ${String(reason).trim()}. Please resubmit from the KYC screen.`,
      { type: 'kyc_rejected' }
    )
    res.status(200).json({ success: true, message: 'Rejected and customer notified' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/admin/kyc/pending
router.get('/kyc/pending', protect, adminOnly, async (req: any, res: Response) => {
  try {
    const pending = await prisma.user.findMany({
      where: {
        isVerified: false,
        OR: [
          { bvn: { not: null } },
          { nin: { not: null } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        bvn: true,
        nin: true,
        isVerified: true,
        createdAt: true,
        trustScore: true
      }
    })
    res.status(200).json({ success: true, data: pending })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router