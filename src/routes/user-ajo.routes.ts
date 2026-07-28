import { Router, Response } from 'express'
import { protect } from '../middleware/auth.middleware'
import {
  createUserAjo, joinByCode, setPayoutOrder, getMyAjoGroups,
  getPendingApproval, approveAjo, rejectAjo
} from '../services/user-ajo.service'
import { prisma } from '../config/database'

const router = Router()

const adminOnly = (req: any, res: Response, next: any) => {
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Admin only' })
    return
  }
  next()
}

// POST /api/user-ajo/create
router.post('/create', protect, async (req: any, res: Response) => {
  try {
    const { name, amount, frequency, totalMembers } = req.body
    const group = await createUserAjo({
      userId: req.user.userId,
      name, amount: Number(amount), frequency,
      totalMembers: Number(totalMembers)
    })
    res.status(201).json({ success: true, data: group })
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message })
  }
})

// GET /api/user-ajo/preview/:code  - look before you join
router.get('/preview/:code', protect, async (req: any, res: Response) => {
  try {
    const group = await prisma.ajoGroup.findFirst({
      where: { inviteCode: String(req.params.code).trim().toUpperCase() },
      select: {
        id: true, name: true, amount: true, frequency: true,
        totalMembers: true, approvalStatus: true, isUserCreated: true,
        members: { select: { userId: true, user: { select: { fullName: true } } } }
      }
    })
    if (!group || !group.isUserCreated) {
      res.status(404).json({ success: false, message: 'No group found with that code' })
      return
    }
    res.status(200).json({
      success: true,
      data: {
        id: group.id,
        name: group.name,
        amount: group.amount,
        frequency: group.frequency,
        totalMembers: group.totalMembers,
        joined: group.members.length,
        approvalStatus: group.approvalStatus,
        alreadyIn: !!group.members.find(m => m.userId === req.user.userId),
        memberNames: group.members.map(m => m.user?.fullName).filter(Boolean)
      }
    })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message })
  }
})

// POST /api/user-ajo/join   { code }
router.post('/join', protect, async (req: any, res: Response) => {
  try {
    const out = await joinByCode({ userId: req.user.userId, code: req.body?.code })
    res.status(200).json({ success: true, data: out })
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message })
  }
})

// POST /api/user-ajo/order   { groupId, order: [userId, ...] }
router.post('/order', protect, async (req: any, res: Response) => {
  try {
    const out = await setPayoutOrder({
      userId: req.user.userId,
      groupId: req.body?.groupId,
      order: req.body?.order || []
    })
    res.status(200).json({ success: true, data: out })
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message })
  }
})

// GET /api/user-ajo/mine
router.get('/mine', protect, async (req: any, res: Response) => {
  try {
    res.status(200).json({ success: true, data: await getMyAjoGroups(req.user.userId) })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message })
  }
})

// ---- admin ----

// GET /api/user-ajo/admin/pending
router.get('/admin/pending', protect, adminOnly, async (_req: any, res: Response) => {
  try {
    res.status(200).json({ success: true, data: await getPendingApproval() })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message })
  }
})

// POST /api/user-ajo/admin/approve/:groupId
router.post('/admin/approve/:groupId', protect, adminOnly, async (req: any, res: Response) => {
  try {
    res.status(200).json({ success: true, data: await approveAjo(req.params.groupId, req.user.userId) })
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message })
  }
})

// POST /api/user-ajo/admin/reject/:groupId   { reason }
router.post('/admin/reject/:groupId', protect, adminOnly, async (req: any, res: Response) => {
  try {
    res.status(200).json({ success: true, data: await rejectAjo(req.params.groupId, req.user.userId, req.body?.reason) })
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message })
  }
})

export default router
