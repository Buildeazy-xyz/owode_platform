import { prisma } from '../config/database'
import { v4 as uuidv4 } from 'uuid'
import { notify } from './notification.service'

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
  if (amount <= 0) throw new Error('Amount must be greater than 0')

  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  if (!wallet) throw new Error('Wallet not found')
  if (wallet.isLocked) throw new Error('Wallet is locked')

  const newBalance = wallet.balance + amount

  const [updatedWallet, transaction] = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: newBalance, totalSaved: wallet.totalSaved + amount }
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

  // Send notification
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user) {
    await notify.walletCredited({
      phone: user.phone,
      email: user.email,
      amount,
      balance: newBalance,
      fullName: user.fullName
    })
  }

  return { wallet: updatedWallet, transaction }
}

// Debit wallet — remove money
export const debitWallet = async (
  userId: string,
  amount: number,
  description: string
) => {
  if (amount <= 0) throw new Error('Amount must be greater than 0')

  const wallet = await prisma.wallet.findUnique({ where: { userId } })
  if (!wallet) throw new Error('Wallet not found')
  if (wallet.isLocked) throw new Error('Wallet is locked')
  if (wallet.balance < amount) throw new Error('Insufficient balance')

  const newBalance = wallet.balance - amount

  const [updatedWallet, transaction] = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId },
      data: { balance: newBalance, totalPayout: wallet.totalPayout + amount }
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

  // Send notification
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user) {
    await notify.walletDebited({
      phone: user.phone,
      email: user.email,
      amount,
      balance: newBalance,
      fullName: user.fullName
    })
  }

  return { wallet: updatedWallet, transaction }
}