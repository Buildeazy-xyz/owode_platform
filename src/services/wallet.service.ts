import { prisma } from '../config/database'
import { v4 as uuidv4 } from 'uuid'
import { notify } from './notification.service'
import { toAmount, debitInTx, creditInTx } from '../utils/money'
import { verifyTransactionPinOrThrow } from '../utils/pinGuard'
import { shield } from './shield.service'

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

// Credit wallet (kept for internal use only - no public route calls it any more)
export const creditWallet = async (userId: string, amountIn: number, description: string) => {
  const amount = toAmount(amountIn)

  const pre = await prisma.wallet.findUnique({ where: { userId } })
  if (!pre) throw new Error('Wallet not found')
  if (pre.isLocked) throw new Error('Wallet is locked')

  const { updatedWallet, transaction } = await prisma.$transaction(async (tx) => {
    const updatedWallet = await creditInTx(tx, userId, amount, { countAsSaved: true })
    const transaction = await tx.transaction.create({
      data: {
        walletId: updatedWallet.id,
        type: 'CREDIT',
        amount,
        balance: updatedWallet.balance,
        description,
        reference: uuidv4(),
        status: 'SUCCESS'
      }
    })
    return { updatedWallet, transaction }
  })

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user) {
    await notify.walletCredited({
      phone: user.phone,
      email: user.email,
      amount,
      balance: updatedWallet.balance,
      fullName: user.fullName
    })
  }

  return { wallet: updatedWallet, transaction }
}

// Debit wallet (kept for internal use only - no public route calls it any more)
export const debitWallet = async (userId: string, amountIn: number, description: string) => {
  const amount = toAmount(amountIn)

  const { updatedWallet, transaction } = await prisma.$transaction(async (tx) => {
    const updatedWallet = await debitInTx(tx, userId, amount, { countAsPayout: true })
    const transaction = await tx.transaction.create({
      data: {
        walletId: updatedWallet.id,
        type: 'DEBIT',
        amount,
        balance: updatedWallet.balance,
        description,
        reference: uuidv4(),
        status: 'SUCCESS'
      }
    })
    return { updatedWallet, transaction }
  })

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user) {
    await notify.walletDebited({
      phone: user.phone,
      email: user.email,
      amount,
      balance: updatedWallet.balance,
      fullName: user.fullName
    })
  }

  return { wallet: updatedWallet, transaction }
}

export const transferFunds = async (
  senderId: string,
  recipientPhone: string,
  amountIn: number,
  description: string,
  transactionPin: string,
  location?: { latitude: number; longitude: number } | null
) => {
  const amount = toAmount(amountIn)
  if (amount < 100) throw new Error('Minimum transfer amount is ₦100')

  const senderUser = await prisma.user.findUnique({ where: { id: senderId } })
  if (!senderUser) throw new Error('Sender not found')

  // Biometrics only unlock the real PIN on-device; the server always checks it.
  await verifyTransactionPinOrThrow(senderUser, transactionPin)

  // Early checks give the customer a clear message. The real guard is the
  // conditional debit inside the transaction below.
  const senderWallet = await prisma.wallet.findUnique({ where: { userId: senderId } })
  if (!senderWallet) throw new Error('Sender wallet not found')
  if (senderWallet.isLocked) throw new Error('Your wallet is locked')
  if (senderWallet.balance < amount) throw new Error('Insufficient balance')

  const recipient = await prisma.user.findUnique({
    where: { phone: recipientPhone },
    include: { wallet: true }
  })
  if (!recipient) throw new Error('Recipient not found — check the phone number')
  if (!recipient.wallet) throw new Error('Recipient wallet not found')
  if (recipient.wallet.isLocked) throw new Error('Recipient wallet is locked')
  if (recipient.id === senderId) throw new Error('You cannot transfer to yourself')

  const reference = `TRF-${Date.now()}-${senderId.slice(0, 8)}`

  // ATOMIC: the debit only happens if the money is really there at that
  // instant, and both sides commit together or not at all.
  const { senderNewBalance, recipientNewBalance } = await prisma.$transaction(async (tx) => {
    const s = await debitInTx(tx, senderId, amount, { countAsPayout: true })
    await tx.transaction.create({
      data: {
        walletId: s.id,
        type: 'DEBIT',
        amount,
        balance: s.balance,
        description: `Transfer to ${recipient.fullName} — ${description}`,
        reference: `${reference}-OUT`,
        status: 'SUCCESS',
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null
      }
    })
    const r = await creditInTx(tx, recipient.id, amount)
    await tx.transaction.create({
      data: {
        walletId: r.id,
        type: 'CREDIT',
        amount,
        balance: r.balance,
        description: `Transfer from ${senderUser.fullName} — ${description}`,
        reference: `${reference}-IN`,
        status: 'SUCCESS'
      }
    })
    return { senderNewBalance: s.balance, recipientNewBalance: r.balance }
  })
  shield('transfer_out', { account: senderId, to_account: recipient.id, amount })

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

// Full transaction list for the wallet screen and statement export.
// getWalletBalance stays capped at 10 for the dashboard preview; this one
// returns the real set so totals and filters are computed on actual data.
export const getWalletTransactions = async (
  userId: string,
  opts?: { from?: string; to?: string; type?: string }
) => {
  const where: any = {}
  if (opts?.from || opts?.to) {
    where.createdAt = {}
    if (opts.from) where.createdAt.gte = new Date(opts.from)
    if (opts.to) {
      const end = new Date(opts.to)
      end.setHours(23, 59, 59, 999)
      where.createdAt.lte = end
    }
  }
  if (opts?.type === 'CREDIT' || opts?.type === 'DEBIT') where.type = opts.type

  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        where,
        orderBy: { createdAt: 'desc' },
        take: 1000
      }
    }
  })
  if (!wallet) throw new Error('Wallet not found')
  return wallet
}
