import axios from 'axios'
import crypto from 'crypto'
import { prisma } from '../config/database'

const BASE_URL   = process.env.PROVIDUS_BASE_URL || 'https://api.providusbank.com'
const CLIENT_ID  = process.env.PROVIDUS_CLIENT_ID || ''
const AUTH_TOKEN = process.env.PROVIDUS_CLIENT_SECRET || ''

export const providusConfigured = () => Boolean(CLIENT_ID && AUTH_TOKEN)

const signature = () =>
  crypto.createHash('sha512').update(`${CLIENT_ID}:${AUTH_TOKEN}`).digest('hex')

const client = () => axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json', 'Client-Id': CLIENT_ID, 'X-Auth-Signature': signature() },
  timeout: 30000
})

export const createReservedAccount = async (userId: string) => {
  if (!providusConfigured()) throw new Error('Providus is not configured yet')
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  if (user.providusAccountNumber)
    return { accountNumber: user.providusAccountNumber, accountName: user.providusAccountName }

  const res = await client().post('/PiP/api/v2/virtualaccount/create', {
    account_name: user.fullName, bvn: user.bvn || undefined
  })
  const data = res.data || {}
  if (!data.account_number) throw new Error(data.responseMessage || 'Could not create account')

  await prisma.user.update({
    where: { id: userId },
    data: { providusAccountNumber: data.account_number, providusAccountName: data.account_name || user.fullName }
  })
  return { accountNumber: data.account_number, accountName: data.account_name || user.fullName }
}

export const verifyWebhookSignature = (headerSignature?: string) => {
  if (!headerSignature) return false
  try { return crypto.timingSafeEqual(Buffer.from(headerSignature), Buffer.from(signature())) }
  catch { return false }
}

export const handleSettlement = async (payload: any) => {
  const accountNumber = payload.accountNumber || payload.account_number
  const amount        = Number(payload.settlementAmount || payload.amount || 0)
  const sessionId     = payload.sessionId || payload.transactionId || payload.reference
  if (!accountNumber || !amount || amount <= 0) throw new Error('Invalid settlement payload')
  if (!sessionId) throw new Error('Missing settlement reference')

  const seen = await prisma.transaction.findFirst({ where: { reference: `PRV-${sessionId}` } })
  if (seen) return { status: 'already_processed' }

  const user = await prisma.user.findFirst({ where: { providusAccountNumber: accountNumber } })
  if (!user) throw new Error(`No user for account ${accountNumber}`)

  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } })
  if (!wallet) throw new Error('Wallet not found')
  const newBalance = wallet.balance + amount

  await prisma.$transaction([
    prisma.wallet.update({ where: { userId: user.id }, data: { balance: newBalance } }),
    prisma.transaction.create({ data: {
      walletId: wallet.id, type: 'CREDIT', amount, balance: newBalance,
      description: 'Bank deposit via Providus', reference: `PRV-${sessionId}`, status: 'SUCCESS'
    }})
  ])
  return { status: 'credited', userId: user.id, amount, balance: newBalance }
}
