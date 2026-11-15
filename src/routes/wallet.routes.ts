import { Router, Request, Response } from 'express'
import { getWalletBalance, transferFunds, getWalletTransactions } from '../services/wallet.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// GET /api/wallet/balance
router.get('/transactions', protect, async (req: any, res: Response) => {
  try {
    const { from, to, type } = req.query
    const wallet = await getWalletTransactions(req.user.userId, {
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      type: type ? String(type) : undefined
    })
    res.status(200).json({ success: true, data: wallet })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

router.get('/balance', protect, async (req: any, res: Response) => {
  try {
    const wallet = await getWalletBalance(req.user.userId)
    res.status(200).json({ success: true, data: wallet })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// /api/wallet/credit and /api/wallet/debit were removed: any logged-in user
// could add money to their own wallet. Money only enters a wallet through a
// bank settlement, an agent collection, an Ajo payout or a savings withdrawal.

// POST /api/wallet/transfer
router.post('/transfer', protect, async (req: any, res: Response) => {
  try {
    const { recipientPhone, amount, description, transactionPin, location } = req.body
    if (!recipientPhone || !amount || !description || !transactionPin) {
      res.status(400).json({ success: false, message: 'recipientPhone, amount, description and transactionPin are required' })
      return
    }
    const result = await transferFunds(req.user.userId, recipientPhone, amount, description, transactionPin, location)
    res.status(200).json({ success: true, message: `₦${result.amount.toLocaleString()} sent successfully!`, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})
export default router