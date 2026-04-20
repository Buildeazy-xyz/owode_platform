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

// GET /api/admin/stats — platform overview
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
  activeDefaults
] = await Promise.all([
  prisma.user.count({ where: { role: 'CONTRIBUTOR' } }),
  prisma.user.count({ where: { role: 'AGENT' } }),
  prisma.ajoGroup.count(),
  prisma.transaction.count(),
  prisma.user.count({ where: { isVerified: true } }),
  prisma.ajoGroup.count({ where: { isActive: true } }),
  prisma.ajoGroup.count({ where: { isGuaranteed: true } }),
  prisma.defaultRecord.count(),
  prisma.defaultRecord.count({ where: { recoveryStatus: { in: ['PENDING', 'SOFT_RECOVERY', 'HARD_RECOVERY'] } } })
])

    // Total money in platform
    const wallets = await prisma.wallet.aggregate({
      _sum: { balance: true, totalSaved: true }
    })

    // Recent transactions
    const recentTransactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { wallet: { include: { user: true } } }
    })

    // Daily transaction volume for last 7 days
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
  const safeUsers = users.map(u => ({
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
// POST /api/admin/ajo/create — Admin creates Ajo group
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

router.delete('/ajo/:id', protect, adminOnly, async (req: any, res: Response) => {
  try {
    await prisma.ajoMember.deleteMany({ where: { groupId: req.params.id } })
    await prisma.ajoGroup.delete({ where: { id: req.params.id } })
    res.status(200).json({ success: true, message: 'Group deleted' })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

 // GET /api/admin/security-log
router.get('/security-log', protect, adminOnly, async (req: any, res: Response) => {
  try {
    // Get recent login activities from transactions as proxy
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

export default router