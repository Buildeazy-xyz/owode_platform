import { prisma } from '../config/database'
import { v4 as uuidv4 } from 'uuid'

// Create a new savings goal
export const createSavingsGoal = async (data: {
  userId: string
  title: string
  description?: string
  goalAmount: number
  autoDebitAmount?: number
  autoDebitFreq?: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  targetDate: string
  initialDeposit?: number
}) => {
  const wallet = await prisma.wallet.findUnique({ where: { userId: data.userId } })
  if (!wallet) throw new Error('Wallet not found')
  if (wallet.isLocked) throw new Error('Your wallet is locked')

  if (data.goalAmount <= 0) throw new Error('Goal amount must be greater than 0')
  if (new Date(data.targetDate) <= new Date()) throw new Error('Target date must be in the future')

  // Deduct initial deposit if provided
  let currentAmount = 0
  if (data.initialDeposit && data.initialDeposit > 0) {
    if (wallet.balance < data.initialDeposit) throw new Error('Insufficient balance for initial deposit')

    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: data.userId },
        data: { balance: { decrement: data.initialDeposit } }
      }),
      prisma.transaction.create({
        data: {
          id: uuidv4(),
          walletId: wallet.id,
          type: 'DEBIT',
          amount: data.initialDeposit,
          balance: wallet.balance - data.initialDeposit,
          description: `Initial deposit — ${data.title}`,
          reference: `SAV-INIT-${Date.now()}`,
          status: 'SUCCESS'
        }
      })
    ])
    currentAmount = data.initialDeposit
  }

  const goal = await prisma.savingsGoal.create({
    data: {
      id: uuidv4(),
      userId: data.userId,
      title: data.title,
      description: data.description,
      goalAmount: data.goalAmount,
      currentAmount,
      autoDebitAmount: data.autoDebitAmount || 0,
      autoDebitFreq: data.autoDebitFreq,
      targetDate: new Date(data.targetDate),
      isLocked: true,
      status: 'ACTIVE'
    }
  })

  // Record initial deposit contribution
  if (currentAmount > 0) {
    await prisma.savingsContribution.create({
      data: {
        id: uuidv4(),
        goalId: goal.id,
        amount: currentAmount,
        type: 'MANUAL',
        description: 'Initial deposit'
      }
    })
  }

  return goal
}

// Add money to savings goal
export const depositToGoal = async (data: {
  userId: string
  goalId: string
  amount: number
}) => {
  if (data.amount <= 0) throw new Error('Amount must be greater than 0')

  const goal = await prisma.savingsGoal.findUnique({ where: { id: data.goalId } })
  if (!goal) throw new Error('Savings goal not found')
  if (goal.userId !== data.userId) throw new Error('Unauthorized')
  if (goal.status !== 'ACTIVE') throw new Error('This savings goal is no longer active')

  const wallet = await prisma.wallet.findUnique({ where: { userId: data.userId } })
  if (!wallet) throw new Error('Wallet not found')
  if (wallet.isLocked) throw new Error('Your wallet is locked')
  if (wallet.balance < data.amount) throw new Error('Insufficient balance')

  const newCurrentAmount = goal.currentAmount + data.amount
  const isCompleted = newCurrentAmount >= goal.goalAmount

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: data.userId },
      data: { balance: { decrement: data.amount } }
    }),
    prisma.transaction.create({
      data: {
        id: uuidv4(),
        walletId: wallet.id,
        type: 'DEBIT',
        amount: data.amount,
        balance: wallet.balance - data.amount,
        description: `Savings deposit — ${goal.title}`,
        reference: `SAV-DEP-${Date.now()}`,
        status: 'SUCCESS'
      }
    }),
    prisma.savingsGoal.update({
      where: { id: data.goalId },
      data: {
        currentAmount: newCurrentAmount,
        isCompleted,
        status: isCompleted ? 'COMPLETED' : 'ACTIVE'
      }
    }),
    prisma.savingsContribution.create({
      data: {
        id: uuidv4(),
        goalId: data.goalId,
        amount: data.amount,
        type: 'MANUAL',
        description: `Manual deposit`
      }
    })
  ])

  return {
    success: true,
    newAmount: newCurrentAmount,
    goalAmount: goal.goalAmount,
    progress: Math.round((newCurrentAmount / goal.goalAmount) * 100),
    isCompleted,
    message: isCompleted
      ? '🎉 Congratulations! You reached your savings goal!'
      : `✅ Deposit successful! ${Math.round((newCurrentAmount / goal.goalAmount) * 100)}% of goal reached`
  }
}

// Withdraw from savings goal
export const withdrawFromGoal = async (data: {
  userId: string
  goalId: string
}) => {
  const goal = await prisma.savingsGoal.findUnique({ where: { id: data.goalId } })
  if (!goal) throw new Error('Savings goal not found')
  if (goal.userId !== data.userId) throw new Error('Unauthorized')
  if (goal.currentAmount <= 0) throw new Error('No savings to withdraw')
  if (goal.status === 'WITHDRAWN') throw new Error('Already withdrawn')

  const wallet = await prisma.wallet.findUnique({ where: { userId: data.userId } })
  if (!wallet) throw new Error('Wallet not found')

  const now = new Date()
  const targetDate = new Date(goal.targetDate)
  const isEarly = now < targetDate

  let withdrawAmount = goal.currentAmount
  let penaltyAmount = 0

  // Apply penalty for early withdrawal
  if (isEarly && !goal.isCompleted) {
    penaltyAmount = goal.currentAmount * (goal.penaltyPercent / 100)
    withdrawAmount = goal.currentAmount - penaltyAmount
  }

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: data.userId },
      data: { balance: { increment: withdrawAmount } }
    }),
    prisma.transaction.create({
      data: {
        id: uuidv4(),
        walletId: wallet.id,
        type: 'CREDIT',
        amount: withdrawAmount,
        balance: wallet.balance + withdrawAmount,
        description: `Savings withdrawal — ${goal.title}${isEarly ? ' (early withdrawal)' : ''}`,
        reference: `SAV-WITH-${Date.now()}`,
        status: 'SUCCESS'
      }
    }),
    prisma.savingsGoal.update({
      where: { id: data.goalId },
      data: {
        status: 'WITHDRAWN',
        isActive: false,
        currentAmount: 0
      }
    }),
    prisma.savingsContribution.create({
      data: {
        id: uuidv4(),
        goalId: data.goalId,
        amount: withdrawAmount,
        type: 'WITHDRAWAL',
        description: isEarly ? `Early withdrawal — ${goal.penaltyPercent}% penalty applied` : 'Matured withdrawal'
      }
    })
  ])

  return {
    success: true,
    withdrawAmount,
    penaltyAmount,
    isEarly,
    message: isEarly
      ? `⚠️ Early withdrawal! ₦${penaltyAmount.toLocaleString()} penalty deducted. ₦${withdrawAmount.toLocaleString()} credited to wallet.`
      : `✅ ₦${withdrawAmount.toLocaleString()} credited to your wallet!`
  }
}

// Get all savings goals for user
export const getUserSavingsGoals = async (userId: string) => {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId, isActive: true },
    include: {
      contributions: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return goals.map(goal => ({
    ...goal,
    progress: Math.round((goal.currentAmount / goal.goalAmount) * 100),
    daysLeft: Math.max(0, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
    canWithdrawFree: new Date() >= new Date(goal.targetDate)
  }))
}

// Get single savings goal
export const getSavingsGoal = async (goalId: string, userId: string) => {
  const goal = await prisma.savingsGoal.findUnique({
    where: { id: goalId },
    include: {
      contributions: {
        orderBy: { createdAt: 'desc' }
      }
    }
  })

  if (!goal) throw new Error('Savings goal not found')
  if (goal.userId !== userId) throw new Error('Unauthorized')

  return {
    ...goal,
    progress: Math.round((goal.currentAmount / goal.goalAmount) * 100),
    daysLeft: Math.max(0, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
    canWithdrawFree: new Date() >= new Date(goal.targetDate)
  }
}