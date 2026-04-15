import { Router, Request, Response } from 'express'
import { createAjoGroup, joinAjoGroup, getAllGroups, getGroupById } from '../services/ajo.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/ajo/create — create a new ajo group
router.post('/create', protect, async (req: any, res: Response) => {
  try {
    const { name, amount, frequency, totalMembers } = req.body

    if (!name || !amount || !frequency || !totalMembers) {
      res.status(400).json({
        success: false,
        message: 'name, amount, frequency and totalMembers are required'
      })
      return
    }

    if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(frequency)) {
      res.status(400).json({
        success: false,
        message: 'frequency must be DAILY, WEEKLY or MONTHLY'
      })
      return
    }

    const group = await createAjoGroup({
      name,
      amount,
      frequency,
      totalMembers,
      createdBy: req.user.userId
    })

    res.status(201).json({
      success: true,
      message: 'Ajo group created successfully',
      data: group
    })

  } catch (error: any) {
    if (error.message === 'Group name already exists') {
      res.status(409).json({ success: false, message: error.message })
      return
    }
    res.status(500).json({ success: false, message: 'Something went wrong' })
  }
})

// POST /api/ajo/join — join an ajo group
router.post('/join', protect, async (req: any, res: Response) => {
  try {
    const { groupId } = req.body

    if (!groupId) {
      res.status(400).json({ success: false, message: 'groupId is required' })
      return
    }

    const result = await joinAjoGroup({
      groupId,
      userId: req.user.userId
    })

    res.status(200).json({
      success: true,
      message: 'Successfully joined Ajo group',
      data: result
    })

  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/ajo/groups — get all active groups
router.get('/groups', protect, async (req: any, res: Response) => {
  try {
    const groups = await getAllGroups()
    res.status(200).json({ success: true, data: groups })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Something went wrong' })
  }
})

// GET /api/ajo/groups/:id — get a single group
router.get('/groups/:id', protect, async (req: any, res: Response) => {
  try {
    const group = await getGroupById(req.params.id)
    res.status(200).json({ success: true, data: group })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

export default router