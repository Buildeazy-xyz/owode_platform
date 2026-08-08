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
  const sessionId = req.body?.sessionId || ''
  try {
    const sig = req.header('X-Auth-Signature') || req.header('x-auth-signature')
    if (!verifyWebhookSignature(sig)) {
      res.status(200).json({ requestSuccessful: true, sessionId, responseMessage: 'rejected transaction', responseCode: '02' })
      return
    }
    const r = await handleSettlement(req.body)
    res.status(200).json({ requestSuccessful: true, sessionId: r.sessionId || sessionId, responseMessage: r.message, responseCode: r.code })
    console.log('providus settlement:', r)
  } catch (e: any) {
    console.error('providus webhook error:', e.message)
    // System failure -> 03 tells Providus to retry later.
    res.status(200).json({ requestSuccessful: true, sessionId, responseMessage: 'system failure', responseCode: '03' })
  }
})

// TEMPORARY: reports the server's outbound IP for Providus whitelisting. Remove after.
router.get('/myip', async (_req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json')
    const data = await r.json()
    res.json({ outboundIp: data.ip })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router
