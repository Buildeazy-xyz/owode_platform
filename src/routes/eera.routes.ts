// ÈÈRÀ 06 reads OWODE's business report here. Read-only, aggregates only.
// Auth: header X-EERA-Reports-Key must equal EERA_REPORTS_KEY (set the same value in ÈÈRÀ).
// If EERA_REPORTS_KEY isn't set (or is short), the route is switched off.
import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { buildReport } from '../services/eera.service'

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

export default router
