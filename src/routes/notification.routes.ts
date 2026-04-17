import { Router, Request, Response } from 'express'
import { sendSMS, sendEmail } from '../services/notification.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/notifications/sms — send a test SMS (admin only)
router.post('/sms', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Unauthorized' })
      return
    }
    const { to, message } = req.body
    if (!to || !message) {
      res.status(400).json({ success: false, message: 'to and message are required' })
      return
    }
    const result = await sendSMS({ to, message })
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/notifications/email — send a test email (admin only)
router.post('/email', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Unauthorized' })
      return
    }
    const { to, subject, message } = req.body
    if (!to || !subject || !message) {
      res.status(400).json({ success: false, message: 'to, subject and message are required' })
      return
    }
    const result = await sendEmail({ to, subject, message })
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router