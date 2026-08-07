import { Router, Request, Response } from 'express'
import { registerUser, loginUser, setAppPin, verifyAppPin, setTransactionPin } from '../services/user.service'
import { protect } from '../middleware/auth.middleware'
import { prisma } from '../config/database'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const router = Router()

const otpStore: Record<string, { otp: string; expires: number }> = {}


const sendOTPviaEmail = async (email: string, otp: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return { success: false, error: 'Resend not configured' }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `OWODE Alajo <${process.env.SENDER_EMAIL || 'onboarding@resend.dev'}>`,
        to: email,
        subject: `${otp} is your OWODE verification code`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#0d47a1,#1565c0);padding:24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="color:#fff;margin:0;letter-spacing:4px">OWODE</h1>
          </div>
          <div style="padding:28px;background:#f9f9f9;border-radius:0 0 12px 12px">
            <p style="font-size:15px;color:#333">Your OWODE verification code is:</p>
            <p style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0d47a1;text-align:center;margin:16px 0">${otp}</p>
            <p style="font-size:13px;color:#666">This code expires in 10 minutes. Do not share it with anyone.</p>
          </div>
        </div>`
      })
    })
    const result: any = await response.json()
    if (result.id) return { success: true }
    return { success: false, error: result.message || JSON.stringify(result) }
  } catch (error: any) { return { success: false, error: error.message } }
}

const sendOTPviaTermii = async (phone: string, message: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const apiKey = process.env.TERMII_API_KEY
    const senderId = process.env.TERMII_SENDER_ID || 'OWODE'
    if (!apiKey) return { success: false, error: 'Termii not configured' }
    const response = await fetch('https://v4.api.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey, to: phone, from: senderId,
        sms: message, type: 'plain', channel: 'dnd'
      })
    })
    const result: any = await response.json()
    if (result.message_id) return { success: true }
    return { success: false, error: result.message || JSON.stringify(result) }
  } catch (error: any) { return { success: false, error: error.message } }
}

const normalizePhone = (phone: string): string => {
  const stripped = phone.replace(/\s+/g, '').trim()
  if (stripped.startsWith('+234')) return '0' + stripped.substring(4)
  if (stripped.startsWith('234')) return '0' + stripped.substring(3)
  if (stripped.startsWith('0')) return stripped
  return '0' + stripped
}

const formatE164 = (phone: string, dialCode: string = '+234'): string => {
  const normalized = normalizePhone(phone)
  if (normalized.startsWith('0')) return dialCode + normalized.substring(1)
  return dialCode + normalized
}

// GET /api/users/me
router.get('/me', protect, async (req: any, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { wallet: true }
    })
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        hasTransactionPin: user.transactionPin !== '',
        trustScore: user.trustScore,
        dateOfBirth: (user as any).dateOfBirth,
        country: (user as any).country,
        hasBVN: !!user.bvn,
        hasNIN: !!user.nin,
        referralCode: (user as any).referralCode,
        referralCount: (user as any).referralCount || 0,
        wallet: user.wallet
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/users/referral
router.get('/referral', protect, async (req: any, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }
    }) as any

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    let referralCode = user.referralCode
    if (!referralCode) {
      referralCode = 'OWD' + user.id.substring(0, 5).toUpperCase()
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { referralCode } as any
      })
    }

    const referredUsers = await (prisma.user as any).findMany({
      where: { referredBy: referralCode },
      select: { fullName: true, createdAt: true, isVerified: true }
    })

    res.status(200).json({
      success: true,
      data: {
        referralCode,
        referralCount: referredUsers.length,
        referralLink: `https://owodeagent.com/join?ref=${referralCode}`,
        referredUsers
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// ---------------------------------------------------------------------------
// PASSWORD RESET
//
// This endpoint takes no auth - a locked-out user has no token. That means
// anyone on the internet can call it, so it is hardened deliberately:
//   1. Identical response whether or not the account exists, so it cannot be
//      used to discover which phone numbers belong to OWODE customers
//   2. Rate limited per phone AND per IP
//   3. Constant response time, so timing cannot leak what the text does not
//   4. Attempts logged for the admin security view
//   5. OTP guess attempts capped
// ---------------------------------------------------------------------------

const resetByPhone: Record<string, { count: number; reset: number }> = {}
const resetByIp: Record<string, { count: number; reset: number }> = {}
const resetAttempts: Record<string, { tries: number; until: number }> = {}

const hitLimit = (
  store: Record<string, { count: number; reset: number }>,
  key: string,
  max: number,
  windowMs: number
) => {
  const now = Date.now()
  const e = store[key]
  if (!e || now > e.reset) { store[key] = { count: 1, reset: now + windowMs }; return false }
  e.count++
  return e.count > max
}

// Always take at least this long, so "found" and "not found" cannot be told
// apart by how fast the server replies.
const MIN_MS = 700
const settle = async (started: number) => {
  const left = MIN_MS - (Date.now() - started)
  if (left > 0) await new Promise(r => setTimeout(r, left))
}

// POST /api/users/forgot-password  { phone }
router.post('/forgot-password', async (req: Request, res: Response) => {
  const started = Date.now()
  const SAME_ANSWER = {
    success: true,
    message: 'If that number has an OWODE account, we have sent a 6-digit code to it.'
  }
  try {
    const raw = String(req.body?.phone || '')
    const phone = normalizePhone(raw)
    const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim()

    if (!raw) {
      await settle(started)
      res.status(400).json({ success: false, message: 'Phone number is required' })
      return
    }

    // 3 per number per hour, 20 per IP per hour
    if (hitLimit(resetByPhone, phone, 3, 3600000) || hitLimit(resetByIp, ip, 20, 3600000)) {
      console.log(`[reset] rate limited ip=${ip}`)
      await settle(started)
      res.status(429).json({ success: false, message: 'Too many attempts. Please try again later.' })
      return
    }

    const user = await prisma.user.findUnique({ where: { phone } })
    console.log(`[reset] requested ip=${ip} exists=${!!user}`)

    if (user && user.isActive) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      otpStore[phone] = { otp, expires: Date.now() + 10 * 60 * 1000 }
      delete resetAttempts[phone]
      const termiiPhone = formatE164(phone, '+234').replace(/^\+/, '')
      const sms = await sendOTPviaTermii(
        termiiPhone,
        `Your OWODE password reset Pin is ${otp}. It expires in 10 minutes. OWODE Digital Services Limited`
      )
      if (!sms.success && user.email) {
        await sendOTPviaEmail(user.email, otp)
      }
    }

    await settle(started)
    res.status(200).json(SAME_ANSWER)
  } catch (error: any) {
    console.error('[reset] error:', error?.message)
    await settle(started)
    res.status(200).json(SAME_ANSWER)
  }
})

// POST /api/users/reset-password  { phone, otp, newPassword }
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { otp, newPassword } = req.body
    const phone = normalizePhone(String(req.body?.phone || ''))
    if (!phone || !otp || !newPassword) {
      res.status(400).json({ success: false, message: 'Phone, code and new password are required' })
      return
    }
    if (String(newPassword).length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
      return
    }

    const att = resetAttempts[phone]
    if (att && Date.now() < att.until) {
      res.status(429).json({ success: false, message: 'Too many wrong codes. Try again in an hour.' })
      return
    }

    const stored = otpStore[phone]
    if (!stored || Date.now() > stored.expires) {
      delete otpStore[phone]
      res.status(400).json({ success: false, message: 'Code has expired. Please request a new one.' })
      return
    }
    if (stored.otp !== otp) {
      const cur = resetAttempts[phone] || { tries: 0, until: 0 }
      cur.tries++
      if (cur.tries >= 5) { cur.until = Date.now() + 3600000; cur.tries = 0; delete otpStore[phone] }
      resetAttempts[phone] = cur
      res.status(400).json({ success: false, message: 'Invalid code. Please try again.' })
      return
    }

    const user = await prisma.user.findUnique({ where: { phone } })
    if (!user) { res.status(400).json({ success: false, message: 'Invalid code. Please try again.' }); return }

    delete otpStore[phone]
    delete resetAttempts[phone]
    const hashed = await bcrypt.hash(String(newPassword), 10)
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })
    console.log(`[reset] password changed for ${user.id}`)

    const { sendPush } = await import('../utils/push')
    await sendPush(
      [user.pushToken],
      'Password changed',
      'Your OWODE password was just changed. If this was not you, contact support immediately.',
      { type: 'password_changed' }
    )

    res.status(200).json({ success: true, message: 'Password changed. You can now log in.' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/users/send-otp
router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone, dialCode, email } = req.body
    if (!phone) {
      res.status(400).json({ success: false, message: 'Phone number is required' })
      return
    }
    const normalizedPhone = normalizePhone(phone)
    const existing = await prisma.$queryRaw`
      SELECT id FROM "User" WHERE phone = ${normalizedPhone} LIMIT 1
    ` as any[]
    if (Array.isArray(existing) && existing.length > 0) {
      res.status(400).json({ success: false, message: 'Phone number already registered' })
      return
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = Date.now() + 10 * 60 * 1000
    otpStore[normalizedPhone] = { otp, expires }
    const e164Phone = formatE164(phone, dialCode || '+234')
    const termiiPhone = e164Phone.replace(/^\+/, '')
    const smsResult = await sendOTPviaTermii(termiiPhone, `Your OWODE Verification Pin is ${otp}. It expires in 30 minutes. OWODE Digital Services Limited`)
    if (!smsResult.success) {
      console.error(`❌ Termii OTP send failed: ${smsResult.error}`)
      if (email) {
        const emailResult = await sendOTPviaEmail(email, otp)
        if (emailResult.success) {
          console.log(`✅ OTP sent via EMAIL to ${email}: ${otp}`)
          res.status(200).json({ success: true, message: `OTP sent to your email ${email}`, channel: 'email' })
          return
        }
        console.error(`❌ Email OTP also failed: ${emailResult.error}`)
      }
      res.status(500).json({ success: false, message: 'Could not send OTP. Try again.' })
      return
    }
    console.log(`✅ OTP sent to ${e164Phone}: ${otp}`)
    res.status(200).json({ success: true, message: `OTP sent to ${e164Phone}` })
  } catch (error: any) {
    console.error('OTP send error:', error)
    res.status(500).json({ success: false, message: 'Could not send OTP. Try again.' })
  }
})

// POST /api/users/verify-otp
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body
    if (!phone || !otp) {
      res.status(400).json({ success: false, message: 'Phone and OTP are required' })
      return
    }
    const normalizedPhone = normalizePhone(phone)
    const stored = otpStore[normalizedPhone]
    if (!stored) {
      res.status(400).json({ success: false, message: 'OTP not found. Please request a new one.' })
      return
    }
    if (Date.now() > stored.expires) {
      delete otpStore[normalizedPhone]
      res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' })
      return
    }
    if (stored.otp !== otp) {
      res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' })
      return
    }
    delete otpStore[normalizedPhone]
    res.status(200).json({ success: true, message: 'Phone number verified successfully!' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/users/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { fullName, phone, email, password, dateOfBirth, country, referralCode } = req.body
    if (!fullName || !phone || !password) {
      res.status(400).json({ success: false, message: 'fullName, phone and password are required' })
      return
    }
    const normalizedPhone = normalizePhone(phone)
    const result = await registerUser({ fullName, phone: normalizedPhone, email, password, dateOfBirth, country })

    // Generate referral code for new user
    const newUserCode = 'OWD' + result.user.id.substring(0, 5).toUpperCase()
    await prisma.user.update({
      where: { id: result.user.id },
      data: { referralCode: newUserCode } as any
    })

    // Handle referral bonus
    if (referralCode) {
      const referrer = await (prisma.user as any).findFirst({ where: { referralCode } })
      if (referrer) {
        await prisma.user.update({
          where: { id: result.user.id },
          data: { referredBy: referralCode } as any
        })
        await prisma.user.update({
          where: { id: referrer.id },
          data: {
            referralCount: { increment: 1 },
            trustScore: { increment: 5 }
          } as any
        })
      }
    }

    res.status(201).json({ success: true, message: 'User registered successfully', data: result })
  } catch (error: any) {
    console.error('Register error:', error.message)
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/users/login

// --- Admin 2FA: short-lived in-memory OTP store (admins only) ---
const adminOtpStore = new Map<string, { code: string; expires: number }>()
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000))

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body
    if (!phone || !password) {
      res.status(400).json({ success: false, message: 'phone and password are required' })
      return
    }
    const normalizedPhone = normalizePhone(phone)
    const result = await loginUser({ phone: normalizedPhone, password })

    // Admins get a second factor: password alone is not enough.
    if (result.user.role === 'ADMIN') {
      const code = genOtp()
      adminOtpStore.set(result.user.id, { code, expires: Date.now() + 5 * 60 * 1000 })
      const termiiPhone = formatE164(result.user.phone, '+234').replace(/^\\+/, '')
      await sendOTPviaTermii(termiiPhone, `Your OWODE admin login code is ${code}. It expires in 5 minutes.`)
      res.status(200).json({ success: true, requiresOtp: true, userId: result.user.id, message: 'Enter the code sent to your phone' })
      return
    }

    res.status(200).json({ success: true, message: 'Login successful', data: result })
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message })
  }
})

// POST /api/users/admin/verify-otp — second step of admin login
router.post('/admin/verify-otp', async (req: Request, res: Response) => {
  try {
    const { userId, code } = req.body
    if (!userId || !code) { res.status(400).json({ success: false, message: 'userId and code are required' }); return }
    const pending = adminOtpStore.get(userId)
    if (!pending || pending.expires < Date.now()) { res.status(401).json({ success: false, message: 'Code expired, please log in again' }); return }
    if (pending.code !== String(code)) { res.status(401).json({ success: false, message: 'Incorrect code' }); return }
    adminOtpStore.delete(userId)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.role !== 'ADMIN') { res.status(403).json({ success: false, message: 'Not authorized' }); return }

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'owode_secret', { expiresIn: '7d' })
    res.status(200).json({ success: true, message: 'Login successful', data: {
      token,
      user: { id: user.id, fullName: user.fullName, phone: user.phone, email: user.email, role: user.role }
    }})
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/users/transaction-pin/set
router.post('/transaction-pin/set', protect, async (req: any, res: Response) => {
  try {
    const { transactionPin, currentPin } = req.body
    if (!transactionPin) {
      res.status(400).json({ success: false, message: 'transactionPin is required' })
      return
    }
    const result = await setTransactionPin(req.user.userId, transactionPin, currentPin)
    res.status(200).json({ success: true, message: result.message })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/users/app-pin/set
router.post('/app-pin/set', protect, async (req: any, res: Response) => {
  try {
    const { appPin, currentPin } = req.body
    if (!appPin) {
      res.status(400).json({ success: false, message: 'appPin is required' })
      return
    }
    const result = await setAppPin(req.user.userId, appPin, currentPin)
    res.status(200).json({ success: true, message: result.message })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/users/app-pin/verify
router.post('/app-pin/verify', protect, async (req: any, res: Response) => {
  try {
    const { appPin, currentPin } = req.body
    if (!appPin) {
      res.status(400).json({ success: false, message: 'appPin is required' })
      return
    }
    const result = await verifyAppPin(req.user.userId, appPin)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message })
  }
})

// POST /api/users/push-token
router.post('/push-token', protect, async (req: any, res: Response) => {
  try {
    const { pushToken } = req.body
    if (!pushToken) {
      res.status(400).json({ success: false, message: 'Push token required' })
      return
    }
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { pushToken }
    })
    res.status(200).json({ success: true, message: 'Push token saved' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT /api/users/update-email
router.put('/update-email', protect, async (req: any, res: Response) => {
  try {
    const { email } = req.body
    if (!email || !email.includes('@')) {
      res.status(400).json({ success: false, message: 'Valid email is required' })
      return
    }
    const existing = await prisma.user.findFirst({ where: { email, NOT: { id: req.user.userId } } })
    if (existing) {
      res.status(400).json({ success: false, message: 'Email already used by another account' })
      return
    }
    await prisma.user.update({ where: { id: req.user.userId }, data: { email } })
    res.status(200).json({ success: true, message: 'Email updated successfully!' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/users/transaction-pin/reset - verify OTP then set new PIN (no current PIN needed)
router.post('/transaction-pin/reset', protect, async (req: any, res: Response) => {
  try {
    const { otp, newPin } = req.body
    if (!otp || !newPin) {
      res.status(400).json({ success: false, message: 'OTP and new PIN are required' })
      return
    }
    if (newPin.length !== 4 || isNaN(Number(newPin))) {
      res.status(400).json({ success: false, message: 'PIN must be exactly 4 digits' })
      return
    }
    const pinUser = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!pinUser) { res.status(404).json({ success: false, message: 'User not found' }); return }
    const np = normalizePhone(pinUser.phone)
    const stored = otpStore[np]
    if (!stored) { res.status(400).json({ success: false, message: 'OTP not found. Please request a new one.' }); return }
    if (Date.now() > stored.expires) { delete otpStore[np]; res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' }); return }
    if (stored.otp !== otp) { res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' }); return }
    delete otpStore[np]
    const hashed = await bcrypt.hash(newPin, 10)
    await prisma.user.update({ where: { id: req.user.userId }, data: { transactionPin: hashed } })
    res.status(200).json({ success: true, message: 'Transaction PIN reset successfully' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/users/lookup   { phone }  -> { fullName }
// Returns ONLY the name. Never any other field, or the user base could be
// enumerated. Staff and platform accounts are invisible here.
router.post('/lookup', protect, async (req: any, res: Response) => {
  try {
    const digits = String(req.body?.phone || '').replace(/\D/g, '')
    if (digits.length !== 11) {
      res.status(400).json({ success: false, message: 'Enter a valid 11-digit number' })
      return
    }
    const user = await prisma.user.findUnique({
      where: { phone: digits },
      select: { id: true, fullName: true, role: true, isActive: true }
    })
    if (!user || !user.isActive || user.role !== 'CONTRIBUTOR') {
      res.status(404).json({ success: false, message: 'No OWODE account found for this number' })
      return
    }
    if (user.id === req.user.userId) {
      res.status(400).json({ success: false, message: 'You cannot send money to yourself' })
      return
    }
    res.status(200).json({ success: true, data: { fullName: user.fullName } })
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Could not check this number' })
  }
})

export default router
