import { Router, Request, Response } from 'express'
import { registerUser, loginUser, setAppPin, verifyAppPin, verifyTransactionPin } from '../services/user.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/users/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { fullName, phone, email, password, transactionPin } = req.body

    if (!fullName || !phone || !password || !transactionPin) {
      res.status(400).json({ success: false, message: 'fullName, phone, password and transactionPin are required' })
      return
    }

    const result = await registerUser({ fullName, phone, email, password, transactionPin })
    res.status(201).json({ success: true, message: 'User registered successfully', data: result })
  } catch (error: any) {
    if (error.message === 'Phone number already registered') {
      res.status(409).json({ success: false, message: error.message })
      return
    }
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

// POST /api/users/app-pin/set
router.post('/app-pin/set', protect, async (req: any, res: Response) => {
  try {
    const { appPin } = req.body
    if (!appPin) { res.status(400).json({ success: false, message: 'appPin is required' }); return }
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
    if (!appPin) { res.status(400).json({ success: false, message: 'appPin is required' }); return }
    const result = await verifyAppPin(req.user.userId, appPin)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message })
  }
})

// POST /api/users/transaction-pin/verify
router.post('/transaction-pin/verify', protect, async (req: any, res: Response) => {
  try {
    const { transactionPin } = req.body
    if (!transactionPin) { res.status(400).json({ success: false, message: 'transactionPin is required' }); return }
    const result = await verifyTransactionPin(req.user.userId, transactionPin)
    res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message })
  }
})

export default router