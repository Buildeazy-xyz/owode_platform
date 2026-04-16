import { Router, Request, Response } from 'express'
import { submitBVN, submitNIN, verifyUser, getKYCStatus } from '../services/kyc.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/kyc/bvn — submit BVN
router.post('/bvn', protect, async (req: any, res: Response) => {
  try {
    const { bvn } = req.body
    if (!bvn) {
      res.status(400).json({ success: false, message: 'BVN is required' })
      return
    }
    const result = await submitBVN({ userId: req.user.userId, bvn })
    res.status(200).json({ success: true, message: result.message, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/kyc/nin — submit NIN
router.post('/nin', protect, async (req: any, res: Response) => {
  try {
    const { nin } = req.body
    if (!nin) {
      res.status(400).json({ success: false, message: 'NIN is required' })
      return
    }
    const result = await submitNIN({ userId: req.user.userId, nin })
    res.status(200).json({ success: true, message: result.message, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/kyc/verify/:userId — verify a user (admin only)
router.post('/verify/:userId', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Only admins can verify users' })
      return
    }
    const result = await verifyUser(req.params.userId)
    res.status(200).json({ success: true, message: result.message, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/kyc/status — get my KYC status
router.get('/status', protect, async (req: any, res: Response) => {
  try {
    const result = await getKYCStatus(req.user.userId)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

export default router