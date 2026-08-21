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

// TEMPORARY: confirms the server can reach Providus. Remove after testing.
router.get('/reachtest', async (_req, res) => {
  const url = process.env.PROVIDUS_BASE_URL || 'http://154.113.16.142:8088/appdevapi/api/'
  const started = Date.now()
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    res.json({ reachable: true, status: r.status, ms: Date.now() - started, url })
  } catch (e: any) {
    res.json({ reachable: false, error: e.message, ms: Date.now() - started, url })
  }
})

// TEMPORARY: raw TCP check, equivalent to telnet. Remove after testing.
router.get('/porttest', async (_req, res) => {
  const net = await import('net')
  const host = process.env.PROVIDUS_HOST || '102.209.190.54'
  const port = 8088
  const started = Date.now()
  const result = await new Promise((resolve) => {
    const sock = new net.Socket()
    sock.setTimeout(15000)
    sock.on('connect', () => { sock.destroy(); resolve({ open: true }) })
    sock.on('timeout', () => { sock.destroy(); resolve({ open: false, reason: 'timeout' }) })
    sock.on('error', (e: any) => { resolve({ open: false, reason: e.message }) })
    sock.connect(port, host)
  })
  res.json({ ...(result as any), host, port, ms: Date.now() - started })
})

// TEMPORARY: tries several ports so we stop guessing. Remove after.
router.get('/portscan', async (req, res) => {
  const net = await import('net')
  const host = String(req.query.host || '102.209.190.54')
  const ports = [8088, 80, 443, 8080, 8443, 9080]
  const out: any[] = []
  for (const port of ports) {
    const r = await new Promise((resolve) => {
      const sock = new net.Socket()
      sock.setTimeout(5000)
      sock.on('connect', () => { sock.destroy(); resolve('open') })
      sock.on('timeout', () => { sock.destroy(); resolve('timeout') })
      sock.on('error', (e: any) => resolve(e.code || 'error'))
      sock.connect(port, host)
    })
    out.push({ port, result: r })
  }
  res.json({ host, results: out })
})

// TEMPORARY: creates a real Providus account for one user. Remove after.
router.get('/testaccount/:phone', async (req, res) => {
  try {
    const { prisma } = await import('../config/database')
    const user = await prisma.user.findUnique({ where: { phone: req.params.phone } })
    if (!user) { res.json({ ok: false, message: 'no user with that phone' }); return }
    const data = await createReservedAccount(user.id)
    res.json({ ok: true, data })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

export default router
