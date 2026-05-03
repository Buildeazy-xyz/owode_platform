import { Router, Response } from 'express'
import {
  createGuaranteedGroup,
  joinGuaranteedGroup,
  makeGuaranteedContribution,
  getGuaranteedGroupDetails,
  getAllGuaranteedGroups,
  checkAndHandleDefaults
} from '../services/guaranteed-ajo.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/guaranteed-ajo/create
router.post('/create', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Only OWODE admins can create Guaranteed Ajo groups' })
      return
    }


// POST /api/guaranteed-ajo/join
router.post('/join', protect, async (req: any, res: Response) => {
  try {
    const { groupId } = req.body
    if (!groupId) { res.status(400).json({ success: false, message: 'groupId is required' }); return }
    const result = await joinGuaranteedGroup({ groupId, userId: req.user.userId })
    res.status(200).json({ success: true, message: 'Successfully joined Guaranteed Ajo group!', data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/guaranteed-ajo/contribute
router.post('/contribute', protect, async (req: any, res: Response) => {
  try {
    const { groupId, transactionPin } = req.body
    if (!groupId || !transactionPin) {
      res.status(400).json({ success: false, message: 'groupId and transactionPin are required' })
      return
    }
    const result = await makeGuaranteedContribution({
      groupId, userId: req.user.userId, transactionPin
    })
    res.status(200).json({ success: true, message: 'Contribution successful!', data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/guaranteed-ajo/groups
router.get('/groups', protect, async (req: any, res: Response) => {
  try {
    const groups = await getAllGuaranteedGroups()
    res.status(200).json({ success: true, data: groups })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/guaranteed-ajo/groups/:id
router.get('/groups/:id', protect, async (req: any, res: Response) => {
  try {
    const group = await getGuaranteedGroupDetails(req.params.id)
    res.status(200).json({ success: true, data: group })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/guaranteed-ajo/check-defaults/:groupId (Admin only)
router.post('/check-defaults/:groupId', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Admin only' })
      return
    }
    const results = await checkAndHandleDefaults(req.params.groupId)
    res.status(200).json({ success: true, data: results })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})
import { assessGroupRisk } from '../services/trust.service'

// GET /api/guaranteed-ajo/risk/:groupId
router.get('/risk/:groupId', protect, async (req: any, res: Response) => {
  try {
    const assessment = await assessGroupRisk(req.params.groupId)
    res.status(200).json({ success: true, data: assessment })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})
export default router