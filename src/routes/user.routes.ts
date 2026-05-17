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

// In-memory OTP store (expires in 10 minutes)
const otpStore: Record<string, { otp: string; expires: number }> = {}

// POST /api/users/send-otp
router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body
    if (!phone) {
      res.status(400).json({ success: false, message: 'Phone number is required' })
      return
    }

    // Check if phone already registered
    const existing = await prisma.user.findUnique({ where: { phone } })
    if (existing) {
      res.status(400).json({ success: false, message: 'Phone number already registered' })
      return
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = Date.now() + 10 * 60 * 1000 // 10 minutes

    // Store OTP
    otpStore[phone] = { otp, expires }

    // Format phone for Nigeria
    const formattedPhone = phone.startsWith('0')
      ? '+234' + phone.substring(1)
      : phone

    // Send via Twilio
    await twilioClient.messages.create({
      body: `Your OWODE verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    })

    console.log(`OTP sent to ${formattedPhone}: ${otp}`)

    res.status(200).json({
      success: true,
      message: `OTP sent to ${phone}`
    })
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

    const stored = otpStore[phone]
    if (!stored) {
      res.status(400).json({ success: false, message: 'OTP not found. Please request a new one.' })
      return
    }

    if (Date.now() > stored.expires) {
      delete otpStore[phone]
      res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' })
      return
    }

    if (stored.otp !== otp) {
      res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' })
      return
    }

    // OTP verified — remove from store
    delete otpStore[phone]

    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully!'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/users/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { fullName, phone, email, password, dateOfBirth } = req.body
    if (!fullName || !phone || !password) {
      res.status(400).json({ success: false, message: 'fullName, phone and password are required' })
      return
    }
    const result = await registerUser({ fullName, phone, email, password, dateOfBirth })
    res.status(201).json({ success: true, message: 'User registered successfully', data: result })
  } catch (error: any) {
    console.error('FULL ERROR:', JSON.stringify(error, null, 2))
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
    const result = await loginUser({ phone, password })
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