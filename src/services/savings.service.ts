import { prisma } from '../config/database'
import { creditPlatform } from './platform.service'
import { sendPush } from '../utils/push'
import bcrypt from 'bcryptjs'
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

  const currentAmount = data.initialDeposit && data.initialDeposit > 0 ? data.initialDeposit : 0

  if (currentAmount > 0 && wallet.balance < currentAmount) {
    throw new Error('Insufficient balance for initial deposit')
  }

  // ATOMIC: deduct, create goal and record the contribution together.
  // If any step fails the whole thing rolls back, so money can never leave
  // the wallet without a goal existing to hold it.
  const goal = await prisma.$transaction(async (tx) => {
    if (currentAmount > 0) {
      const fresh = await tx.wallet.findUnique({ where: { userId: data.userId } })
      if (!fresh) throw new Error('Wallet not found')
      if (fresh.balance < currentAmount) throw new Error('Insufficient balance for initial deposit')

      await tx.wallet.update({
        where: { userId: data.userId },
        data: { balance: { decrement: currentAmount } }
      })

      await tx.transaction.create({
        data: {
          id: uuidv4(),
          walletId: wallet.id,
          type: 'DEBIT',
          amount: currentAmount,
          balance: fresh.balance - currentAmount,
          description: `Initial deposit — ${data.title}`,
          reference: `SAV-INIT-${Date.now()}`,
          status: 'SUCCESS'
        }
      })
    }

    const created = await tx.savingsGoal.create({
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

    if (currentAmount > 0) {
      await tx.savingsContribution.create({
        data: {
          id: uuidv4(),
          goalId: created.id,
          amount: currentAmount,
          type: 'MANUAL',
          description: 'Initial deposit'
        }
      })
    }

    return created
  })

  return goal
}

// Add money to savings goal
export const depositToGoal = async (data: {
  userId: string
  goalId: string
  amount: number
  transactionPin: string
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

  const depUser = await prisma.user.findUnique({ where: { id: data.userId } })
  if (!depUser) throw new Error('User not found')
  if (data.transactionPin !== 'BIOMETRIC_AUTH') {
    if (!depUser.transactionPin) throw new Error('Please set a transaction PIN first')
    const pinOk = await bcrypt.compare(data.transactionPin, depUser.transactionPin)
    if (!pinOk) throw new Error('Incorrect transaction PIN')
  }

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
  transactionPin: string
}) => {
  const goal = await prisma.savingsGoal.findUnique({ where: { id: data.goalId } })
  if (!goal) throw new Error('Savings goal not found')
  if (goal.userId !== data.userId) throw new Error('Unauthorized')
  if (goal.currentAmount <= 0) throw new Error('No savings to withdraw')
  if (goal.status === 'WITHDRAWN') throw new Error('Already withdrawn')

  const wallet = await prisma.wallet.findUnique({ where: { userId: data.userId } })
  if (!wallet) throw new Error('Wallet not found')

  const wdUser = await prisma.user.findUnique({ where: { id: data.userId } })
  if (!wdUser) throw new Error('User not found')
  if (data.transactionPin !== 'BIOMETRIC_AUTH') {
    if (!wdUser.transactionPin) throw new Error('Please set a transaction PIN first')
    const wpinOk = await bcrypt.compare(data.transactionPin, wdUser.transactionPin)
    if (!wpinOk) throw new Error('Incorrect transaction PIN')
  }

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

  const withdrawRef = `SAV-WITH-${Date.now()}`

  await prisma.$transaction(async (tx) => {
    const freshWallet = await tx.wallet.findUnique({ where: { userId: data.userId } })
    if (!freshWallet) throw new Error('Wallet not found')

    await tx.wallet.update({
      where: { userId: data.userId },
      data: { balance: { increment: withdrawAmount } }
    })

    await tx.transaction.create({
      data: {
        id: uuidv4(),
        walletId: freshWallet.id,
        type: 'CREDIT',
        amount: withdrawAmount,
        balance: freshWallet.balance + withdrawAmount,
        description: `Savings withdrawal — ${goal.title}${isEarly ? ' (early withdrawal)' : ''}`,
        reference: withdrawRef,
        status: 'SUCCESS'
      }
    })

    await tx.savingsGoal.update({
      where: { id: data.goalId },
      data: { status: 'WITHDRAWN', isActive: false, currentAmount: 0 }
    })

    await tx.savingsContribution.create({
      data: {
        id: uuidv4(),
        goalId: data.goalId,
        amount: withdrawAmount,
        type: 'WITHDRAWAL',
        description: isEarly ? `Early withdrawal — ${goal.penaltyPercent}% penalty applied` : 'Matured withdrawal'
      }
    })

    // The penalty is company income. Credit it somewhere real, with its own
    // ledger row, so it can be reported and reconciled.
    if (penaltyAmount > 0) {
      await tx.savingsContribution.create({
        data: {
          id: uuidv4(),
          goalId: data.goalId,
          amount: penaltyAmount,
          type: 'PENALTY',
          description: `Early withdrawal penalty (${goal.penaltyPercent}%)`
        }
      })
      await creditPlatform(tx, {
        amount: penaltyAmount,
        description: `Early withdrawal penalty — ${goal.title}`,
        reference: `FEE-PEN-${Date.now()}`
      })
    }
  })

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
        orderBy: { createdAt: 'asc' }
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

// ---------------------------------------------------------------------------
// AUTO-DEBIT RUNNER  (POST /api/cron/auto-debit)
// Mirrors the manual deposit path: every movement inside one $transaction
// with a fresh in-lock balance read, always writing a matching Transaction row.
// ---------------------------------------------------------------------------

const FREQ_DAYS: Record<string, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30 }

export const runAutoDebits = async () => {
  const now = new Date()
  const result = { checked: 0, debited: 0, skippedNotDue: 0, shortBalance: 0, completed: 0, errors: 0 }

  const goals = await prisma.savingsGoal.findMany({
    where: {
      status: 'ACTIVE',
      isActive: true,
      autoDebitAmount: { gt: 0 },
      NOT: { autoDebitFreq: null }
    },
    include: { user: { select: { id: true, fullName: true, pushToken: true } } }
  })

  for (const goal of goals) {
    result.checked++

    if (new Date(goal.targetDate).getTime() < now.getTime()) {
      result.skippedNotDue++
      continue
    }

    const days = FREQ_DAYS[String(goal.autoDebitFreq)] || 7
    if (goal.lastAutoDebitAt) {
      const elapsed = now.getTime() - new Date(goal.lastAutoDebitAt).getTime()
      if (elapsed < days * 86400000 - 7200000) {
        result.skippedNotDue++
        continue
      }
    }

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const fresh = await tx.savingsGoal.findUnique({ where: { id: goal.id } })
        if (!fresh || fresh.status !== 'ACTIVE') return 'skip'

        const remaining = fresh.goalAmount - fresh.currentAmount
        if (remaining <= 0) {
          await tx.savingsGoal.update({
            where: { id: fresh.id },
            data: { status: 'COMPLETED', isCompleted: true }
          })
          return 'complete'
        }

        const amount = Math.min(fresh.autoDebitAmount, remaining)

        const wallet = await tx.wallet.findUnique({ where: { userId: fresh.userId } })
        if (!wallet) return 'skip'
        if (wallet.balance < amount) return 'short'

        await tx.wallet.update({
          where: { userId: fresh.userId },
          data: { balance: { decrement: amount } }
        })

        await tx.transaction.create({
          data: {
            id: uuidv4(),
            walletId: wallet.id,
            type: 'DEBIT',
            amount,
            balance: wallet.balance - amount,
            description: `Auto-save \u2014 ${fresh.title}`,
            reference: `SAV-AUTO-${Date.now()}-${fresh.id.slice(0, 8)}`,
            status: 'SUCCESS'
          }
        })

        await tx.savingsContribution.create({
          data: {
            id: uuidv4(),
            goalId: fresh.id,
            amount,
            type: 'AUTO_DEBIT',
            description: `Automatic ${String(fresh.autoDebitFreq).toLowerCase()} saving`
          }
        })

        const newTotal = fresh.currentAmount + amount
        const reached = newTotal >= fresh.goalAmount

        await tx.savingsGoal.update({
          where: { id: fresh.id },
          data: {
            currentAmount: { increment: amount },
            lastAutoDebitAt: now,
            ...(reached ? { status: 'COMPLETED', isCompleted: true } : {})
          }
        })

        return reached ? 'debited-complete' : 'debited'
      })

      if (outcome === 'short') {
        result.shortBalance++
        await sendPush(
          [goal.user?.pushToken],
          'Auto-save skipped',
          `We could not move your auto-save for "${goal.title}" \u2014 your wallet balance was too low. Top up and it will try again.`,
          { type: 'auto_debit_skipped', goalId: goal.id }
        )
      } else if (outcome === 'complete') {
        result.completed++
      } else if (outcome === 'debited' || outcome === 'debited-complete') {
        result.debited++
        if (outcome === 'debited-complete') result.completed++
        await sendPush(
          [goal.user?.pushToken],
          outcome === 'debited-complete' ? 'Savings goal reached' : 'Auto-save successful',
          outcome === 'debited-complete'
            ? `You have reached your target for "${goal.title}". Well done.`
            : `We moved your ${String(goal.autoDebitFreq).toLowerCase()} auto-save into "${goal.title}".`,
          { type: 'auto_debit', goalId: goal.id }
        )
      }
    } catch (e: any) {
      result.errors++
      console.log('auto-debit failed for goal', goal.id, e?.message)
    }
  }

  console.log('auto-debit run:', result)
  return result
}
