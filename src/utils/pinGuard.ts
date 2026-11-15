import bcrypt from 'bcryptjs'

// A 4-digit PIN has only 10,000 combinations. Without a limit, anyone holding
// a logged-in session could try them all in minutes. Five wrong tries locks
// money actions for 30 minutes.
const MAX_TRIES = 5
const LOCK_MS = 30 * 60 * 1000
const failures: Record<string, { tries: number; until: number }> = {}

export const verifyTransactionPinOrThrow = async (
  user: { id: string; transactionPin: string | null },
  pin: unknown
) => {
  const f = failures[user.id]
  if (f && Date.now() < f.until) {
    const mins = Math.ceil((f.until - Date.now()) / 60000)
    throw new Error(`Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`)
  }
  if (!user.transactionPin) throw new Error('Please set a transaction PIN first')

  const ok = await bcrypt.compare(String(pin ?? ''), user.transactionPin)
  if (!ok) {
    const cur = failures[user.id] && Date.now() >= failures[user.id].until
      ? failures[user.id]
      : { tries: 0, until: 0 }
    cur.tries++
    if (cur.tries >= MAX_TRIES) {
      cur.tries = 0
      cur.until = Date.now() + LOCK_MS
    }
    failures[user.id] = cur
    throw new Error('Invalid transaction PIN')
  }
  delete failures[user.id]
}

// Small in-memory limiter for routes where the key is a phone number or user id
// rather than an IP (Render sits behind a proxy, so IPs are unreliable).
const buckets: Record<string, { count: number; reset: number }> = {}
export const tooManyAttempts = (key: string, max: number, windowMs: number) => {
  const now = Date.now()
  const b = buckets[key]
  if (!b || now > b.reset) {
    buckets[key] = { count: 1, reset: now + windowMs }
    return false
  }
  b.count++
  return b.count > max
}
