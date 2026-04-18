import { Router, Request, Response } from 'express'
import { getWalletBalance, creditWallet, debitWallet, transferFunds } from '../services/wallet.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// GET /api/wallet/balance
router.get('/balance', protect, async (req: any, res: Response) => {
  try {
    const wallet = await getWalletBalance(req.user.userId)
    res.status(200).json({ success: true, data: wallet })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/wallet/credit
router.post('/credit', protect, async (req: any, res: Response) => {
  try {
    const { amount, description } = req.body
    if (!amount || !description) {
      res.status(400).json({ success: false, message: 'amount and description are required' })
      return
    }
    const result = await creditWallet(req.user.userId, amount, description)
    res.status(200).json({ success: true, message: 'Wallet credited', data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/wallet/debit
router.post('/debit', protect, async (req: any, res: Response) => {
  try {
    const { amount, description } = req.body
    if (!amount || !description) {
      res.status(400).json({ success: false, message: 'amount and description are required' })
      return
    }
    const result = await debitWallet(req.user.userId, amount, description)
    res.status(200).json({ success: true, message: 'Wallet debited', data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/wallet/transfer
router.post('/transfer', protect, async (req: any, res: Response) => {
  try {
    const { recipientPhone, amount, description, transactionPin } = req.body
    if (!recipientPhone || !amount || !description || !transactionPin) {
      res.status(400).json({ success: false, message: 'recipientPhone, amount, description and transactionPin are required' })
      return
    }
    const result = await transferFunds(req.user.userId, recipientPhone, amount, description, transactionPin)
    res.status(200).json({ success: true, message: `₦${amount.toLocaleString()} sent successfully!`, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})
export default router