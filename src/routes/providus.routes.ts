import { Router, Request, Response } from 'express'
import { protect } from '../middleware/auth.middleware'
import { providusConfigured, createReservedAccount, verifyWebhookSignature, handleSettlement } from '../services/providus.service'

const router = Router()

router.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, data: { configured: providusConfigured() } })
})

router.post('/account', protect, async (req: any, res: Response) => {
  try {
    if (!providusConfigured()) { res.status(503).json({ success: false, message: 'Bank funding is coming soon' }); return }
    res.json({ success: true, data: await createReservedAccount(req.user.userId) })
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }) }
})

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const sig = req.header('X-Auth-Signature') || req.header('x-auth-signature')
    if (!verifyWebhookSignature(sig)) { res.status(401).json({ requestSuccessful: false, responseMessage: 'Invalid signature' }); return }
    const result = await handleSettlement(req.body)
    res.status(200).json({ requestSuccessful: true, responseMessage: 'success', sessionId: req.body?.sessionId })
    console.log('providus settlement:', result)
  } catch (e: any) {
    console.error('providus webhook error:', e.message)
    res.status(200).json({ requestSuccessful: false, responseMessage: e.message })
  }
})

export default router
