import { Router, Request, Response } from 'express'
import { registerUser, loginUser } from '../services/user.service'


const router = Router()

// POST /api/users/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    // Step 1 — Get data from request body
    const { fullName, phone, email, pin } = req.body

    // Step 2 — Validate required fields
    if (!fullName || !phone || !pin) {
      res.status(400).json({
        success: false,
        message: 'fullName, phone and pin are required'
      })
      return
    }

    // Step 3 — PIN must be exactly 4 digits
    if (pin.length !== 4 || isNaN(Number(pin))) {
      res.status(400).json({
        success: false,
        message: 'PIN must be exactly 4 digits'
      })
      return
    }

    // Step 4 — Call the user service
    const result = await registerUser({ fullName, phone, email, pin })

    // Step 5 — Return success response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result
    })

  } catch (error: any) {
    // Handle known errors
    if (error.message === 'Phone number already registered') {
      res.status(409).json({
        success: false,
        message: error.message
      })
      return
    }

    // Handle unknown errors
    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.'
    })
  }
})

// POST /api/users/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, pin } = req.body

    if (!phone || !pin) {
      res.status(400).json({ success: false, message: 'phone and pin are required' })
      return
    }

    const result = await loginUser({ phone, pin })

    res.status(200).json({ success: true, message: 'Login successful', data: result })

  } catch (error: any) {
    if (error.message === 'Invalid phone or PIN') {
      res.status(401).json({ success: false, message: error.message })
      return
    }
    res.status(500).json({ success: false, message: 'Something went wrong' })
  }
})


export default router
