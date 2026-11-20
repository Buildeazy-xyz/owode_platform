import { Router, Request, Response } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { protect } from '../middleware/auth.middleware'
import {
  alatpayConfigured, alatpayMode, getAccount, startAccount, verifyAccount,
  signatureValid, ipAllowed, handleWebhook, listEvents, resolveEvent, markIgnored, reconcile,
} from '../services/alatpay.service'

const router = Router()

const adminOnly = (req: any, res: Response, next: any) => {
  if (req.user?.role !== 'ADMIN') { res.status(403).json({ success: false, message: 'Admin access required' }); return }
  next()
}

// OTP endpoints: at most 10 tries per 15 minutes per customer/IP.
const otpLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userId || ipKeyGenerator(req.ip || ''),
  message: { success: false, message: 'Too many attempts. Please wait 15 minutes.' },
})

const fail = (res: Response, e: any, code = 400) => res.status(code).json({ success: false, message: e?.message || 'Something went wrong' })

router.get('/status', (_req: Request, res: Response) => {
  res.json({ success: true, data: { configured: alatpayConfigured(), mode: alatpayMode() } })
})

// The customer's Wema account number (or what they need to get one).
router.get('/account', protect, async (req: any, res: Response) => {
  try { res.json({ success: true, data: await getAccount(req.user.userId) }) } catch (e) { fail(res, e) }
})

router.post('/account/start', protect, otpLimiter, async (req: any, res: Response) => {
  try { res.json({ success: true, data: await startAccount(req.user.userId, req.body?.bvn) }) } catch (e) { fail(res, e) }
})

router.post('/account/verify', protect, otpLimiter, async (req: any, res: Response) => {
  try { res.json({ success: true, data: await verifyAccount(req.user.userId, req.body?.otp) }) } catch (e) { fail(res, e) }
})

// ALATPay calls this when money lands in a customer's account.
// index.ts gives this route the RAW body so the signature can be checked byte for byte.
router.post('/webhook', async (req: Request, res: Response) => {
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}))
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || ''

  if (!signatureValid(raw, req.header('x-signature'))) {
    console.log('alatpay webhook: bad signature from', ip)
    res.status(401).json({ success: false, message: 'Invalid signature' })
    return
  }
  if (!ipAllowed(ip)) {
    // The signature already proves it's ALATPay; in live mode we also insist on their IP.
    console.log(`alatpay webhook from unexpected IP ${ip} (${alatpayMode()} mode)`)
    if (alatpayMode() === 'live') { res.status(403).json({ success: false, message: 'Forbidden' }); return }
  }

  let body: any
  try { body = JSON.parse(raw.toString('utf8')) } catch { res.status(400).json({ success: false, message: 'Invalid JSON' }); return }

  try {
    const r = await handleWebhook(body)
    console.log('alatpay webhook:', r.status, r.credited ? `₦${r.credited}` : '', r.note || '')
    // 200 for everything we've recorded (including duplicates) so ALATPay stops retrying.
    res.status(200).json({ success: true, status: r.status })
  } catch (e: any) {
    console.error('alatpay webhook error:', e?.message)
    // 500 makes ALATPay retry later; nothing was credited.
    res.status(500).json({ success: false, message: 'Temporary failure' })
  }
})

// ---------- admin ----------

router.get('/admin/events', protect, adminOnly, async (req: any, res: Response) => {
  try { res.json({ success: true, data: await listEvents(req.query.status as string | undefined, Number(req.query.take) || 100) }) } catch (e) { fail(res, e) }
})

router.post('/admin/events/:id/credit', protect, adminOnly, async (req: any, res: Response) => {
  try { res.json({ success: true, data: await resolveEvent(req.params.id, req.user.userId, req.body?.userId) }) } catch (e) { fail(res, e) }
})

router.post('/admin/events/:id/dismiss', protect, adminOnly, async (req: any, res: Response) => {
  try { await markIgnored(req.params.id, req.user.userId, String(req.body?.reason || 'Dismissed by admin')); res.json({ success: true }) } catch (e) { fail(res, e) }
})

router.get('/admin/reconcile', protect, adminOnly, async (req: any, res: Response) => {
  try { res.json({ success: true, data: await reconcile(Math.min(Number(req.query.days) || 2, 30)) }) } catch (e) { fail(res, e) }
})

export default router
