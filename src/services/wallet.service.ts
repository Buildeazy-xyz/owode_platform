import { prisma } from '../config/database'
import { v4 as uuidv4 } from 'uuid'

// Get wallet balance
export const getWalletBalance = async (userId: string) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  })

  if (!wallet) {
    throw new Error('Wallet not found')
  }

  return wallet
}

// Credit wallet — add money
export const creditWallet = async (
  userId: string,
  amount: number,
  description: string
) => {
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }

  // Find wallet
  const wallet = await prisma.wallet.findUnique({
    where: { userId }
  })

  if (!wallet) {
    throw new Error('Wallet not found')
  }

  if (wallet.isLocked) {
    throw new Error('Wallet is locked')
  }

  const newBalance = wallet.balance + amount

  // Update wallet and create transaction in one operation
  const [updatedWallet, transaction] = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: {
        balance: newBalance,
        totalSaved: wallet.totalSaved + amount
      }
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'CREDIT',
        amount,
        balance: newBalance,
        description,
        reference: uuidv4(),
        status: 'SUCCESS'
      }
    })
  ])

  return { wallet: updatedWallet, transaction }
}

// Debit wallet — remove money
export const debitWallet = async (
  userId: string,
  amount: number,
  description: string
) => {
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }

  const wallet = await prisma.wallet.findUnique({
    where: { userId }
  })

  if (!wallet) {
    throw new Error('Wallet not found')
  }

  if (wallet.isLocked) {
    throw new Error('Wallet is locked')
  }

  if (wallet.balance < amount) {
    throw new Error('Insufficient balance')
  }

  const newBalance = wallet.balance - amount

  const [updatedWallet, transaction] = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: {
        balance: newBalance,
        totalPayout: wallet.totalPayout + amount
      }
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'DEBIT',
        amount,
        balance: newBalance,
        description,
        reference: uuidv4(),
        status: 'SUCCESS'
      }
    })
  ])

  return { wallet: updatedWallet, transaction }
}