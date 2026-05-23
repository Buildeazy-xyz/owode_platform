import { Router, Request, Response } from 'express'
import { registerUser, loginUser, setAppPin, verifyAppPin, setTransactionPin } from '../services/user.service'
import { protect } from '../middleware/auth.middleware'
import twilio from 'twilio'
import { prisma } from '../config/database'

const router = Router()

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const otpStore: Record<string, { otp: string; expires: number }> = {}

const normalizePhone = (phone: string): string => {
  const stripped = phone.replace(/\s+/g, '').trim()
  if (stripped.startsWith('+234')) return '0' + stripped.substring(4)
  if (stripped.startsWith('234')) return '0' + stripped.substring(3)
  if (stripped.startsWith('0')) return stripped
  return '0' + stripped
}

const formatForTwilio = (phone: string, dialCode: string = '+234'): string => {
  const normalized = normalizePhone(phone)
  if (normalized.startsWith('0')) return dialCode + normalized.substring(1)
  return dialCode + normalized
}

// GET /api/users/me — get current user with fresh wallet data
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
        dateOfBirth: user.dateOfBirth,
        country: user.country,
        bvn: user.bvn ? '***masked***' : null,
        nin: user.nin ? '***masked***' : null,
        hasBVN: !!user.bvn,
        hasNIN: !!user.nin,
        wallet: user.wallet
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/users/send-otp
router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone, dialCode } = req.body
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
    const twilioPhone = formatForTwilio(phone, dialCode || '+234')
    await twilioClient.messages.create({
      body: `Your OWODE verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: twilioPhone
    })
    console.log(`✅ OTP sent to ${twilioPhone}: ${otp}`)
    res.status(200).json({ success: true, message: `OTP sent to ${twilioPhone}` })
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
    const { fullName, phone, email, password, dateOfBirth, country } = req.body
    if (!fullName || !phone || !password) {
      res.status(400).json({ success: false, message: 'fullName, phone and password are required' })
      return
    }
    const normalizedPhone = normalizePhone(phone)
    const result = await registerUser({ fullName, phone: normalizedPhone, email, password, dateOfBirth, country })
    res.status(201).json({ success: true, message: 'User registered successfully', data: result })
  } catch (error: any) {
    console.error('Register error:', error.message)
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/users/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body
    if (!phone || !password) {
      res.status(400).json({ success: false, message: 'phone and password are required' })
      return
    }
    const normalizedPhone = normalizePhone(phone)
    const result = await loginUser({ phone: normalizedPhone, password })
    res.status(200).json({ success: true, message: 'Login successful', data: result })
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message })
  }
})

// POST /api/users/transaction-pin/set
router.post('/transaction-pin/set', protect, async (req: any, res: Response) => {
  try {
    const { transactionPin } = req.body
    if (!transactionPin) {
      res.status(400).json({ success: false, message: 'transactionPin is required' })
      return
    }
    const result = await setTransactionPin(req.user.userId, transactionPin)
    res.status(200).json({ success: true, message: result.message })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/users/app-pin/set
router.post('/app-pin/set', protect, async (req: any, res: Response) => {
  try {
    const { appPin } = req.body
    if (!appPin) {
      res.status(400).json({ success: false, message: 'appPin is required' })
      return
    }
    const result = await setAppPin(req.user.userId, appPin)
    res.status(200).json({ success: true, message: result.message })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/users/app-pin/verify
router.post('/app-pin/verify', protect, async (req: any, res: Response) => {
  try {
    const { appPin } = req.body
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

export default router

// PUT /api/users/update-email

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
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { email }
    })
    res.status(200).json({ success: true, message: 'Email updated successfully!' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})
