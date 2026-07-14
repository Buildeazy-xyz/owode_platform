import { prisma } from '../config/database'
import { v4 as uuidv4 } from 'uuid'
import { notify } from './notification.service'
import bcrypt from 'bcryptjs'

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
  if (!wallet) throw new Error('Wallet not found')
  return wallet
}

// Credit wallet
export const creditWallet = async (userId: string, amount: number, description: string) => {
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

// Debit wallet
export const debitWallet = async (userId: string, amount: number, description: string) => {
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

export const transferFunds = async (
  senderId: string,
  recipientPhone: string,
  amount: number,
  description: string,
  transactionPin: string
) => {
  if (amount <= 0) throw new Error('Amount must be greater than 0')
  if (amount < 100) throw new Error('Minimum transfer amount is ₦100')

  const senderUser = await prisma.user.findUnique({ where: { id: senderId } })
  if (!senderUser) throw new Error('Sender not found')

  // Allow biometric auth bypass OR verify PIN
  if (transactionPin !== 'BIOMETRIC_AUTH') {
    if (!senderUser.transactionPin) throw new Error('Please set a transaction PIN first')
    const isPinValid = await bcrypt.compare(transactionPin, senderUser.transactionPin)
    if (!isPinValid) throw new Error('Invalid transaction PIN')
  }

  // Rest of transfer logic stays same...
  // Find sender wallet
  const senderWallet = await prisma.wallet.findUnique({ where: { userId: senderId } })
  if (!senderWallet) throw new Error('Sender wallet not found')
  if (senderWallet.isLocked) throw new Error('Your wallet is locked')
  if (senderWallet.balance < amount) throw new Error('Insufficient balance')

  // Find recipient
  const recipient = await prisma.user.findUnique({
    where: { phone: recipientPhone },
    include: { wallet: true }
  })
  if (!recipient) throw new Error('Recipient not found — check the phone number')
  if (!recipient.wallet) throw new Error('Recipient wallet not found')
  if (recipient.wallet.isLocked) throw new Error('Recipient wallet is locked')
  if (recipient.id === senderId) throw new Error('You cannot transfer to yourself')

  const senderNewBalance = senderWallet.balance - amount
  const recipientNewBalance = recipient.wallet.balance + amount
  const reference = `TRF-${Date.now()}-${senderId.slice(0, 8)}`

  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: senderId },
      data: { balance: senderNewBalance, totalPayout: senderWallet.totalPayout + amount }
    }),
    prisma.transaction.create({
      data: {
        walletId: senderWallet.id,
        type: 'DEBIT',
        amount,
        balance: senderNewBalance,
        description: `Transfer to ${recipient.fullName} — ${description}`,
        reference: `${reference}-OUT`,
        status: 'SUCCESS'
      }
    }),
    prisma.wallet.update({
      where: { userId: recipient.id },
      data: { balance: recipientNewBalance }
    }),
    prisma.transaction.create({
      data: {
        walletId: recipient.wallet.id,
        type: 'CREDIT',
        amount,
        balance: recipientNewBalance,
        description: `Transfer from ${senderUser.fullName} — ${description}`,
        reference: `${reference}-IN`,
        status: 'SUCCESS'
      }
    })
  ])


  await notify.transactionAlert({
      phone: recipient.phone,
      email: recipient.email,
      fullName: recipient.fullName,
      type: 'CREDIT',
      amount,
      sender: senderUser.fullName
    })

  await notify.walletDebited({
    phone: senderUser.phone,
    email: senderUser.email,
    amount,
    balance: senderNewBalance,
    fullName: senderUser.fullName
  })

  await notify.walletCredited({
    phone: recipient.phone,
    email: recipient.email,
    amount,
    balance: recipientNewBalance,
    fullName: recipient.fullName
  })

  return {
    success: true,
    amount,
    recipient: recipient.fullName,
    recipientPhone,
    newBalance: senderNewBalance,
    reference
  }
}