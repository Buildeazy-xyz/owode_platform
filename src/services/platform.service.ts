import { prisma } from '../config/database'
import { v4 as uuidv4 } from 'uuid'

// The company money account.
//
// Deliberately NOT loginable: no password, no real phone (so no OTP or reset
// path), and a role that is not a customer role. Money can only be credited to
// it by server-side code — there is no endpoint that moves money out. Taking
// profit happens at the bank and is recorded here as a manual entry.
const PLATFORM_PHONE = 'PLATFORM-REVENUE'

export const getPlatformWallet = async (client: any = prisma) => {
  let user = await client.user.findUnique({ where: { phone: PLATFORM_PHONE } })
  if (!user) {
    user = await client.user.create({
      data: {
        id: uuidv4(),
        fullName: 'OWODE Platform Account',
        phone: PLATFORM_PHONE,
        password: null,
        role: 'PLATFORM',
        isVerified: true,
        isActive: true
      }
    })
  }
  let wallet = await client.wallet.findUnique({ where: { userId: user.id } })
  if (!wallet) {
    wallet = await client.wallet.create({
      data: { id: uuidv4(), userId: user.id, balance: 0 }
    })
  }
  return wallet
}

// Credit company income. Always writes a matching Transaction row so the
// ledger explains itself. Use this for every fee, penalty and commission.
export const creditPlatform = async (
  tx: any,
  opts: { amount: number; description: string; reference: string }
) => {
  if (!opts.amount || opts.amount <= 0) return null
  const wallet = await getPlatformWallet(tx)
  const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } })
  if (!fresh) return null

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: opts.amount } }
  })
  await tx.transaction.create({
    data: {
      id: uuidv4(),
      walletId: wallet.id,
      type: 'CREDIT',
      amount: opts.amount,
      balance: fresh.balance + opts.amount,
      description: opts.description,
      reference: opts.reference,
      status: 'SUCCESS'
    }
  })
  return wallet.id
}
