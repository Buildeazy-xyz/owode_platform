import { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

// Turns whatever the client sent into a safe naira amount, or throws.
export const toAmount = (value: unknown): number => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be greater than 0')
  return Math.round(n * 100) / 100
}

// Takes money out of a wallet with ONE conditional UPDATE.
// Postgres re-checks "balance >= amount" after it has locked the row, so two
// requests racing for the same naira cannot both succeed, and a balance can
// never go below zero. Returns the wallet as it is after the debit.
export const debitInTx = async (
  tx: Tx,
  userId: string,
  amount: number,
  opts: { countAsPayout?: boolean } = {}
) => {
  const res = await tx.wallet.updateMany({
    where: { userId, isLocked: false, balance: { gte: amount } },
    data: {
      balance: { decrement: amount },
      ...(opts.countAsPayout ? { totalPayout: { increment: amount } } : {})
    }
  })
  const wallet = await tx.wallet.findUnique({ where: { userId } })
  if (res.count !== 1) {
    if (!wallet) throw new Error('Wallet not found')
    if (wallet.isLocked) throw new Error('Your wallet is locked')
    throw new Error('Insufficient balance')
  }
  return wallet!
}

// Adds money with an atomic increment and returns the wallet after the credit.
// Never computes "old balance + amount" in app code, so a credit can never
// overwrite a debit that happened at the same moment.
export const creditInTx = async (
  tx: Tx,
  userId: string,
  amount: number,
  opts: { countAsSaved?: boolean } = {}
) =>
  tx.wallet.update({
    where: { userId },
    data: {
      balance: { increment: amount },
      ...(opts.countAsSaved ? { totalSaved: { increment: amount } } : {})
    }
  })
