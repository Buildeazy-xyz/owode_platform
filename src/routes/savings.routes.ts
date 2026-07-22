import { Router, Response } from 'express'
import {
  createSavingsGoal,
  depositToGoal,
  withdrawFromGoal,
  getUserSavingsGoals,
  getSavingsGoal
} from '../services/savings.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/savings/create
router.post('/create', protect, async (req: any, res: Response) => {
  try {
    const { title, description, goalAmount, autoDebitAmount, autoDebitFreq, targetDate, initialDeposit } = req.body
    if (!title || !goalAmount || !targetDate) {
      res.status(400).json({ success: false, message: 'title, goalAmount and targetDate are required' })
      return
    }
    const goal = await createSavingsGoal({
      userId: req.user.userId,
      title, description, goalAmount, autoDebitAmount,
      autoDebitFreq, targetDate, initialDeposit
    })
    res.status(201).json({ success: true, message: '🎯 Savings goal created!', data: goal })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/savings/deposit
router.post('/deposit', protect, async (req: any, res: Response) => {
  try {
    const { goalId, amount, transactionPin } = req.body
    if (!goalId || !amount) {
      res.status(400).json({ success: false, message: 'goalId and amount are required' })
      return
    }
    const result = await depositToGoal({ userId: req.user.userId, goalId, amount, transactionPin })
    res.status(200).json({ success: true, message: result.message, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/savings/withdraw
router.post('/withdraw', protect, async (req: any, res: Response) => {
  try {
    const { goalId, transactionPin } = req.body
    if (!goalId) {
      res.status(400).json({ success: false, message: 'goalId is required' })
      return
    }
    const result = await withdrawFromGoal({ userId: req.user.userId, goalId, transactionPin })
    res.status(200).json({ success: true, message: result.message, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/savings/goals
router.get('/goals', protect, async (req: any, res: Response) => {
  try {
    const goals = await getUserSavingsGoals(req.user.userId)
    res.status(200).json({ success: true, data: goals })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET /api/savings/goals/:id
router.get('/goals/:id', protect, async (req: any, res: Response) => {
  try {
    const goal = await getSavingsGoal(req.params.id, req.user.userId)
    res.status(200).json({ success: true, data: goal })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

export default router