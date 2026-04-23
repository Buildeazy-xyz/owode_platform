import { Router, Response } from 'express'
import { verifyFace, livenessCheck, getFaceVerificationStatus } from '../services/face-verification.service'
import { protect } from '../middleware/auth.middleware'
import { prisma } from '../config/database'

const router = Router()

// POST /api/face/verify — verify face against government ID
router.post('/verify', protect, async (req: any, res: Response) => {
  try {
    const { selfieBase64, idType, idNumber } = req.body

    if (!selfieBase64) {
      res.status(400).json({ success: false, message: 'Selfie image is required' })
      return
    }

    // Get user BVN/NIN if not provided
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return }

    const idTypeToUse = idType || (user.bvn ? 'BVN' : user.nin ? 'NIN' : null)
    const idNumberToUse = idNumber || user.bvn || user.nin

    if (!idTypeToUse || !idNumberToUse) {
      res.status(400).json({
        success: false,
        message: 'Please submit your BVN or NIN first before face verification'
      })
      return
    }

    // First do liveness check
    const liveness = await livenessCheck({
      userId: req.user.userId,
      selfieBase64
    })

    if (!liveness.live) {
      res.status(400).json({
        success: false,
        message: 'Liveness check failed — please ensure you are a real person and try again'
      })
      return
    }

    // Then verify face against ID
    const result = await verifyFace({
      userId: req.user.userId,
      selfieBase64,
      idType: idTypeToUse,
      idNumber: idNumberToUse
    })

    res.status(200).json({ success: true, message: result.message, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/face/liveness — just check liveness
router.post('/liveness', protect, async (req: any, res: Response) => {
  try {
    const { selfieBase64 } = req.body
    if (!selfieBase64) {
      res.status(400).json({ success: false, message: 'Image is required' })
      return
    }
    const result = await livenessCheck({ userId: req.user.userId, selfieBase64 })
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/face/status — get face verification status
router.get('/status', protect, async (req: any, res: Response) => {
  try {
    const result = await getFaceVerificationStatus(req.user.userId)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

export default router