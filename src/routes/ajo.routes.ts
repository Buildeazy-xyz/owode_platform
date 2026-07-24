import { Router, Request, Response } from 'express'
import { createAjoGroup, joinAjoGroup, getAllGroups, getGroupById, makeContribution } from '../services/ajo.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/ajo/create — ADMIN ONLY
router.post('/create', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Only OWODE admins can create Ajo groups' })
      return
    }

    const { name, amount, frequency, totalMembers } = req.body
    if (!name || !amount || !frequency || !totalMembers) {
      res.status(400).json({ success: false, message: 'name, amount, frequency and totalMembers are required' })
      return
    }

    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(frequency)) {
      res.status(400).json({ success: false, message: 'frequency must be DAILY, WEEKLY or MONTHLY' })
      return
    }

    const group = await createAjoGroup({
      name, amount, frequency, totalMembers,
      createdBy: req.user.userId,
      isAdmin: true
    })

    res.status(201).json({ success: true, message: 'Ajo group created successfully', data: group })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/ajo/join
router.post('/join', protect, async (req: any, res: Response) => {
  try {
    const { groupId } = req.body
    if (!groupId) { res.status(400).json({ success: false, message: 'groupId is required' }); return }
    const result = await joinAjoGroup({ groupId, userId: req.user.userId })
    res.status(200).json({ success: true, message: result.message, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/ajo/groups
router.get('/groups', protect, async (req: any, res: Response) => {
  try {
    const groups = await getAllGroups()
    res.status(200).json({ success: true, data: groups })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Something went wrong' })
  }
})

// GET /api/ajo/groups/:id
router.get('/groups/:id', protect, async (req: any, res: Response) => {
  try {
    const group = await getGroupById(req.params.id)
    res.status(200).json({ success: true, data: group })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/ajo/contribute
router.post('/contribute', protect, async (req: any, res: Response) => {
  try {
    const { groupId, transactionPin } = req.body
    if (!groupId) { res.status(400).json({ success: false, message: 'groupId is required' }); return }
    if (!transactionPin) { res.status(400).json({ success: false, message: 'Transaction PIN is required' }); return }
    const result = await makeContribution({ groupId, userId: req.user.userId, transactionPin })
    res.status(200).json({ success: true, message: 'Contribution successful', data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

export default router