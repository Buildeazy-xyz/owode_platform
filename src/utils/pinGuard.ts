import bcrypt from 'bcryptjs'
import { shield } from '../services/shield.service'
import { sendPush } from './push'

// ---------- Transaction PIN ----------
// A 4-digit PIN has only 10,000 combinations, so guesses are tightly limited:
//   3 wrong → money actions locked for 30 minutes
//   locked twice within 24 hours → PIN blocked until the owner resets it with the SMS code ("Forgot PIN")
// Every money action (transfer, Ajọ, savings, guaranteed Ajọ, PIN change) goes through here.
// Counts live in memory: a server restart clears them.
const MAX_TRIES = 3
const LOCK_MS = 30 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000
type PinState = { tries: number; until: number; locks: number[]; blocked: boolean }
const failures: Record<string, PinState> = {}

const warnOwner = (token: string | null | undefined, title: string, body: string) => {
  if (token) sendPush([token], title, body, { type: 'security' }).catch(() => {})
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const verifyTransactionPinOrThrow = async (
  user: { id: string; transactionPin: string | null; pushToken?: string | null },
  pin: unknown
) => {
  const f = failures[user.id] || { tries: 0, until: 0, locks: [], blocked: false }
  if (f.blocked) {
    throw new Error('Your transaction PIN is blocked after too many wrong tries. Tap "Forgot PIN" to reset it with the code we text you.')
  }
  if (Date.now() < f.until) {
    const mins = Math.ceil((f.until - Date.now()) / 60000)
    throw new Error(`Too many wrong PINs. Try again in ${plural(mins, 'minute', 'minutes')}.`)
  }
  if (!user.transactionPin) throw new Error('Please set a transaction PIN first')

  const ok = await bcrypt.compare(String(pin ?? ''), user.transactionPin)
  if (ok) {
    f.tries = 0
    if (f.locks.length) failures[user.id] = f
    else delete failures[user.id]
    return
  }

  f.tries++
  shield('pin_failed', { account: user.id })
  if (f.tries < MAX_TRIES) {
    failures[user.id] = f
    throw new Error(`Wrong transaction PIN. ${plural(MAX_TRIES - f.tries, 'try', 'tries')} left.`)
  }
  const now = Date.now()
  f.tries = 0
  f.until = now + LOCK_MS
  f.locks = f.locks.filter((t) => now - t < DAY).concat(now)
  shield('lockout', { account: user.id, channel: 'pin' })
  if (f.locks.length >= 2) {
    f.blocked = true
    failures[user.id] = f
    warnOwner(user.pushToken, 'Transaction PIN blocked', 'Your PIN was entered wrongly too many times today, so we blocked it. If this was not you, reset your PIN and contact support.')
    throw new Error('Too many wrong PINs today, so your transaction PIN is now blocked. Tap "Forgot PIN" to reset it with the code we text you.')
  }
  failures[user.id] = f
  warnOwner(user.pushToken, 'Wrong PIN entered', 'Someone entered a wrong transaction PIN on your account 3 times. If this was not you, change your PIN and contact support.')
  throw new Error('Too many wrong PINs. Money actions are locked for 30 minutes.')
}

// After a PIN reset with the SMS code (or a successful PIN change) the slate is clean.
export const clearPinLock = (userId: string) => { delete failures[userId] }

// ---------- Login password ----------
//   5 wrong → locked for 15 minutes (only WRONG tries count)
//   locked 3 times within 24 hours → must reset the password with "Forgot password"
const LOGIN_TRIES = 5
const LOGIN_LOCK_MS = 15 * 60 * 1000
type LoginState = { tries: number; until: number; locks: number[]; mustReset: boolean }
const loginFails: Record<string, LoginState> = {}

export const loginBlockMessage = (key: string) => {
  const f = loginFails[key]
  if (!f) return null
  if (f.mustReset) return 'Too many wrong passwords. For your safety, reset your password with "Forgot password".'
  if (Date.now() < f.until) {
    const mins = Math.ceil((f.until - Date.now()) / 60000)
    return `Too many wrong passwords. Try again in ${plural(mins, 'minute', 'minutes')}, or use "Forgot password".`
  }
  return null
}

// Returns what to tell the person after a wrong password.
export const loginFailed = (key: string): { locked: boolean; mustReset: boolean; message: string } => {
  const f = loginFails[key] || { tries: 0, until: 0, locks: [], mustReset: false }
  f.tries++
  if (f.tries < LOGIN_TRIES) {
    loginFails[key] = f
    return { locked: false, mustReset: false, message: `Wrong phone number or password. ${plural(LOGIN_TRIES - f.tries, 'try', 'tries')} left.` }
  }
  const now = Date.now()
  f.tries = 0
  f.until = now + LOGIN_LOCK_MS
  f.locks = f.locks.filter((t) => now - t < DAY).concat(now)
  f.mustReset = f.locks.length >= 3
  loginFails[key] = f
  return {
    locked: true,
    mustReset: f.mustReset,
    message: f.mustReset
      ? 'Too many wrong passwords. For your safety, reset your password with "Forgot password".'
      : 'Too many wrong passwords. Try again in 15 minutes, or use "Forgot password".',
  }
}
export const loginSucceeded = (key: string) => { delete loginFails[key] }
export const clearLoginLock = (key: string) => { delete loginFails[key] }

// ---------- App unlock PIN (the 6-digit PIN that opens the app) ----------
// 5 wrong → signed out; the next unlock needs the password again.
const APP_TRIES = 5
const appFails: Record<string, { tries: number; out: boolean }> = {}
export const appPinSignedOut = (userId: string) => !!appFails[userId]?.out
export const appPinFailed = (userId: string) => {
  const f = appFails[userId] || { tries: 0, out: false }
  f.tries++
  if (f.tries >= APP_TRIES) f.out = true
  appFails[userId] = f
  return { signedOut: f.out, left: Math.max(0, APP_TRIES - f.tries) }
}
export const appPinOk = (userId: string) => { delete appFails[userId] }

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
