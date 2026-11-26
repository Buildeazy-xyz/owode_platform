// OWODE Shield → ÈÈRÀ 07. Tells ÈÈRÀ what happens (wrong passwords, codes, PINs, sign-ups,
// security changes, money out) so it can spot attacks and alert staff. ÈÈRÀ is alert only.
//
// Never slows the app and never breaks a request: events are queued and sent in the background,
// a failed send is dropped. Off unless EERA_API_URL and a key are set.
// Env: EERA_API_URL (e.g. https://eera-console.onrender.com)
//      EERA_EVENTS_KEY (an ÈÈRÀ "Security events" key) — falls back to EERA_API_KEY.
//
// Privacy: no phone numbers, emails, names, passwords, PINs or codes are ever sent. Accounts are
// sent as the internal user id; a phone with no account is sent as a one-way code ("ph-…").
// Network addresses are cut to their first two parts (102.89.x.x) before they leave OWODE.
import crypto from 'crypto'
import { AsyncLocalStorage } from 'async_hooks'

type Ctx = { ip?: string; device?: string }
const store = new AsyncLocalStorage<Ctx>()

// Express middleware: remembers this request's network and phone id for any event raised while handling it.
export const shieldContext = (req: any, _res: any, next: () => void) => {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
  const device = String(req.headers['x-device-id'] || '').trim()
  store.run({ ip, device: /^[A-Za-z0-9_.:-]{6,64}$/.test(device) ? device : undefined }, next)
}

const shortIp = (ip?: string) => {
  const s = String(ip || '').replace(/^::ffff:/, '')
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
  if (v4) return `${v4[1]}.${v4[2]}.x.x`
  const v6 = s.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4}):/i)
  return v6 ? `${v6[1]}:${v6[2]}:x` : undefined
}

// A phone that has no account becomes a stable one-way code with no digits in it.
export const phoneCode = (phone: string) => {
  const salt = process.env.EERA_EVENTS_KEY || process.env.EERA_API_KEY || 'owode'
  const hex = crypto.createHmac('sha256', salt).update(String(phone).replace(/\D/g, '').slice(-10)).digest('hex').slice(0, 16)
  return 'ph-' + hex.replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)])
}

type ShieldType = 'login_failed' | 'login_success' | 'otp_requested' | 'otp_verified' | 'otp_failed' | 'pin_failed' | 'pin_changed'
  | 'password_changed' | 'email_changed' | 'signup' | 'lockout' | 'transfer_out' | 'withdrawal' | 'kyc_failed'

const queue: any[] = []
let timer: NodeJS.Timeout | null = null
const MAX_QUEUE = 2000

const target = () => {
  const url = String(process.env.EERA_API_URL || '').replace(/\/+$/, '')
  const key = process.env.EERA_EVENTS_KEY || process.env.EERA_API_KEY || ''
  return url && key ? { url, key } : null
}

async function flush() {
  timer = null
  const t = target()
  if (!t) { queue.length = 0; return }
  while (queue.length) {
    const batch = queue.splice(0, 100)
    try {
      const r = await fetch(t.url + '/v1/security/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-eera-key': t.key },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(5000),
      })
      if (!r.ok) console.log(`[shield] ÈÈRÀ answered ${r.status}; ${batch.length} events dropped`)
    } catch (e: any) {
      console.log(`[shield] could not reach ÈÈRÀ (${e?.name || 'error'}); ${batch.length} events dropped`)
    }
  }
}

// Record one event. Safe to call anywhere: it never throws and never waits.
export const shield = (type: ShieldType, extra: { account?: string | null; to_account?: string | null; amount?: number; channel?: string } = {}) => {
  try {
    if (!target()) return
    const ctx = store.getStore() || {}
    const ev: any = { type, at: new Date().toISOString() }
    if (extra.account) ev.account = String(extra.account).slice(0, 64)
    if (extra.to_account) ev.to_account = String(extra.to_account).slice(0, 64)
    if (typeof extra.amount === 'number' && isFinite(extra.amount)) ev.amount = extra.amount
    if (extra.channel) ev.channel = extra.channel
    const ip = shortIp(ctx.ip)
    if (ip) ev.ip = ip
    if (ctx.device) ev.device = ctx.device
    if (queue.length >= MAX_QUEUE) queue.shift()
    queue.push(ev)
    if (!timer) { timer = setTimeout(() => { flush().catch(() => {}) }, 2000); timer.unref?.() }
  } catch {}
}
