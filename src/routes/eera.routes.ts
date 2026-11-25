// ÈÈRÀ 06 reads OWODE's business report here. Read-only, aggregates only.
// Auth: header X-EERA-Reports-Key must equal EERA_REPORTS_KEY (set the same value in ÈÈRÀ).
// If EERA_REPORTS_KEY isn't set (or is short), the route is switched off.
import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { buildReport } from '../services/eera.service'
import { protect } from '../middleware/auth.middleware'
import { prisma } from '../config/database'

const router = Router()
const limiter = rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: (req: any) => ipKeyGenerator(req.ip || ''), standardHeaders: true, legacyHeaders: false })

const keyOk = (given: string) => {
  const want = process.env.EERA_REPORTS_KEY || ''
  if (want.length < 32 || !given) return false
  const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(want).digest()
  return crypto.timingSafeEqual(a, b)
}

router.get('/report', limiter, async (req: Request, res: Response) => {
  if ((process.env.EERA_REPORTS_KEY || '').length < 32) { res.status(404).json({ success: false, message: 'Not found' }); return }
  if (!keyOk(String(req.header('x-eera-reports-key') || ''))) { res.status(401).json({ success: false, message: 'Invalid reports key' }); return }
  try {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ success: true, data: await buildReport(Number(req.query.days) || 35) })
  } catch (e: any) {
    console.log('eera report error:', e?.message)
    res.status(500).json({ success: false, message: 'Could not build the report' })
  }
})

// ---------- Customers chat with ÈÈRÀ 01 inside the OWODE app ----------
// App → here (customer's normal login) → ÈÈRÀ /v1/chat with the server-held key + the customer's own token.
// ÈÈRÀ then reads ONLY that customer's account through OWODE's normal API (read-only).
// Env: EERA_API_URL (e.g. https://eera-console.onrender.com), EERA_API_KEY (an ÈÈRÀ key marked "Real OWODE customers"),
//      EERA_CHAT_PHONES: "all" for everyone, or a comma list of pilot phone numbers. Empty = off.
const last10 = (p: any) => String(p || '').replace(/\D/g, '').slice(-10)
const chatAllowed = (phone?: string | null) => {
  const v = String(process.env.EERA_CHAT_PHONES || '').trim()
  if (!process.env.EERA_API_URL || !process.env.EERA_API_KEY || !v) return false
  if (v.toLowerCase() === 'all') return true
  return v.split(',').map(last10).filter((x) => x.length === 10).includes(last10(phone))
}
const chatLimiter = rateLimit({ windowMs: 60_000, limit: 12, keyGenerator: (req: any) => 'eera-chat:' + (req.user?.userId || ipKeyGenerator(req.ip || '')), standardHeaders: true, legacyHeaders: false, message: { success: false, message: "You're sending messages too fast. Please wait a minute." } })

const phoneOf = async (userId: string) => (await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }))?.phone

router.get('/chat/status', protect, async (req: any, res: Response) => {
  res.json({ success: true, data: { available: chatAllowed(await phoneOf(req.user.userId)) } })
})

router.post('/chat', protect, chatLimiter, async (req: any, res: Response) => {
  if (!chatAllowed(await phoneOf(req.user.userId))) { res.status(404).json({ success: false, message: 'ÈÈRÀ chat is coming soon.' }); return }
  const message = String(req.body?.message || '').trim().slice(0, 1000)
  if (!message) { res.status(400).json({ success: false, message: 'Type a message first.' }); return }
  const history = (Array.isArray(req.body?.history) ? req.body.history : []).slice(-10)
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 2000) }))
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  try {
    const r = await fetch(String(process.env.EERA_API_URL).replace(/\/+$/, '') + '/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-EERA-Key': String(process.env.EERA_API_KEY).trim() },
      body: JSON.stringify({ message, history, customerToken: token }),
      signal: AbortSignal.timeout(45_000),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || j.success === false) {
      console.log('eera chat error:', r.status)
      res.status(r.status === 429 ? 429 : 502).json({ success: false, message: r.status === 429 ? "You're sending messages too fast. Please wait a minute." : "ÈÈRÀ couldn't answer just now. Please try again, or contact support on WhatsApp." })
      return
    }
    res.json({ success: true, data: { reply: String(j.data?.reply || ''), ticket: j.data?.ticket || null } })
  } catch (e: any) {
    console.log('eera chat error:', e?.name || e?.message)
    res.status(502).json({ success: false, message: "ÈÈRÀ couldn't answer just now. Please try again, or contact support on WhatsApp." })
  }
})

export default router
