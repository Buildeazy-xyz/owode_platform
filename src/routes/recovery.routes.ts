import { Router, Response } from 'express'
import { runRecoveryChecks, getAllDefaults, getUserDefaults, writeOffDefault } from '../services/recovery.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/recovery/run — trigger recovery checks (Admin)
router.post('/run', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Admin only' })
      return
    }
    const results = await runRecoveryChecks()
    res.status(200).json({ success: true, data: results })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/recovery/defaults — all defaults (Admin)
router.get('/defaults', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Admin only' })
      return
    }
    const defaults = await getAllDefaults()
    res.status(200).json({ success: true, data: defaults })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/recovery/my-defaults — user's own defaults
router.get('/my-defaults', protect, async (req: any, res: Response) => {
  try {
    const defaults = await getUserDefaults(req.user.userId)
    res.status(200).json({ success: true, data: defaults })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/recovery/write-off/:id — write off a default (Admin)
router.post('/write-off/:id', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Admin only' })
      return
    }
    const record = await writeOffDefault(req.params.id)
    res.status(200).json({ success: true, message: 'Default written off', data: record })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router