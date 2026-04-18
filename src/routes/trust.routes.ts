import { Router, Response } from 'express'
import { calculateTrustScore, updateTrustScore, getTrustLabel, getTrustColor } from '../services/trust.service'
import { getGuaranteePoolStatus } from '../services/guarantee.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// GET /api/trust/my-score
router.get('/my-score', protect, async (req: any, res: Response) => {
  try {
    const score = await calculateTrustScore(req.user.userId)
    await updateTrustScore(req.user.userId)
    res.status(200).json({
      success: true,
      data: {
        score,
        label: getTrustLabel(score),
        color: getTrustColor(score),
        breakdown: {
          base: 50,
          bvnBonus: '+10 for BVN',
          ninBonus: '+10 for NIN',
          verifiedBonus: '+10 for verification',
          groupBonus: '+5 per completed group',
          defaultPenalty: '-15 per default'
        }
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/trust/score/:userId (Admin only)
router.get('/score/:userId', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Admin only' })
      return
    }
    const score = await calculateTrustScore(req.params.userId)
    res.status(200).json({
      success: true,
      data: { score, label: getTrustLabel(score), color: getTrustColor(score) }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/trust/guarantee-pool (Admin only)
router.get('/guarantee-pool', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Admin only' })
      return
    }
    const pool = await getGuaranteePoolStatus()
    res.status(200).json({ success: true, data: pool })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router