// Wema ALATPay — Static Wallet (each customer's own Wema account number).
// Docs: https://docs.alatpay.ng/static-wallet  ·  /setup-webhook-url  ·  /webhook-validation
//
// Env (set on Render, never in code):
//   ALATPAY_BASE_URL        https://apibox.alatpay.ng
//   ALATPAY_SECRET_KEY      sent as Ocp-Apim-Subscription-Key
//   ALATPAY_BUSINESS_ID
//   ALATPAY_WEBHOOK_SECRET  used to check the x-signature on webhooks
//   ALATPAY_MODE            "test" or "live"
//   ALATPAY_WEBHOOK_IPS     optional, comma-separated (default 74.178.162.156)
//   ALATPAY_MAX_AUTO_CREDIT optional, naira; bigger single deposits wait for admin review (default 5,000,000)
import axios, { AxiosError } from 'axios'
import crypto from 'crypto'
import { prisma } from '../config/database'
import { creditInTx } from '../utils/money'
import { notify } from './notification.service'
import { sendPush } from '../utils/push'

export const BANK_NAME = 'Wema Bank'
const PROVIDER = 'alatpay'

const cfg = () => ({
  baseUrl: (process.env.ALATPAY_BASE_URL || 'https://apibox.alatpay.ng').replace(/\/$/, ''),
  key: process.env.ALATPAY_SECRET_KEY || '',
  businessId: process.env.ALATPAY_BUSINESS_ID || '',
  webhookSecret: process.env.ALATPAY_WEBHOOK_SECRET || '',
  mode: (process.env.ALATPAY_MODE || 'live').toLowerCase() === 'test' ? 'test' : 'live',
  ips: (process.env.ALATPAY_WEBHOOK_IPS || '74.178.162.156').split(',').map(s => s.trim()).filter(Boolean),
  maxAutoCredit: Number(process.env.ALATPAY_MAX_AUTO_CREDIT || 5_000_000),
})

export const alatpayMode = () => cfg().mode
export const alatpayConfigured = () => Boolean(cfg().key && cfg().businessId)

const api = () => axios.create({
  baseURL: cfg().baseUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': cfg().key },
})

// Turn an ALATPay error into a short message we can show a customer.
const friendly = (e: unknown, fallback: string) => {
  const ax = e as AxiosError<any>
  const status = ax?.response?.status
  const msg = ax?.response?.data?.message || ax?.response?.data?.Message
  console.log('alatpay error:', status, typeof msg === 'string' ? msg : '', ax?.message)
  if (status === 401) return 'Bank service is not available right now. Please try again later.'
  if (typeof msg === 'string' && msg.length < 160) return msg
  return fallback
}

// ---------- customer: get an account number ----------

export const getAccount = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  return {
    available: alatpayConfigured(),
    mode: alatpayMode(),
    hasBVN: alatpayMode() === 'test' ? false : !!user.bvn,
    account: user.alatpayAccountNumber
      ? { accountNumber: user.alatpayAccountNumber, accountName: user.alatpayAccountName, bankName: BANK_NAME }
      : null,
    otpPending: !!(user.alatpayPendingId && user.alatpayOtpSentAt && Date.now() - user.alatpayOtpSentAt.getTime() < 15 * 60_000),
  }
}

// Step 1: ask Wema to create the wallet. Wema texts an OTP to the phone on the BVN.
export const startAccount = async (userId: string, bvnIn?: string) => {
  if (!alatpayConfigured()) throw new Error('Bank account numbers are coming soon')
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  if (user.alatpayAccountNumber) throw new Error('You already have an account number')

  // Don't let anyone spam OTPs to a BVN phone.
  if (user.alatpayOtpSentAt && Date.now() - user.alatpayOtpSentAt.getTime() < 60_000)
    throw new Error('Please wait a minute before requesting another code')

  // In TEST mode the sandbox BVN (2222222222) is used and never saved, and a
  // customer's real BVN on file is NOT sent to the sandbox.
  const test = cfg().mode === 'test'
  let bvn = test ? null : user.bvn
  if (!bvn) {
    const b = String(bvnIn || '').replace(/\D/g, '')
    if (test ? (b.length < 10 || b.length > 11) : b.length !== 11) throw new Error('Enter your 11-digit BVN')
    if (!test) {
      const other = await prisma.user.findFirst({ where: { bvn: b, NOT: { id: userId } } })
      if (other) throw new Error('This BVN is already linked to another OWODE account')
    }
    bvn = b
  }

  let data: any
  try {
    const res = await api().post('/alatpay-wallet/api/v1/staticaccount', {
      businessId: cfg().businessId,
      staticWalletType: 1,
      bvn,
      ...(user.email ? { email: user.email } : {}),
    })
    data = res.data?.data ?? res.data
  } catch (e) {
    throw new Error(friendly(e, 'We could not start your account setup. Please try again.'))
  }
  if (!data?.id || !data?.otpTrackingID) throw new Error(data?.message || 'We could not start your account setup. Please try again.')

  await prisma.user.update({
    where: { id: userId },
    data: { alatpayPendingId: data.id, alatpayOtpTrackingId: data.otpTrackingID, alatpayOtpSentAt: new Date() },
  })
  // Only remember a BVN typed here once Wema's OTP proves it's theirs (see verifyAccount).
  pendingBvn.set(userId, user.bvn || test ? '' : bvn)
  return { message: (typeof data.message === 'string' && data.message) || 'We sent a code to the phone number on your BVN.' }
}

// BVN typed in step 1 for users who never did KYC; kept in memory only until step 2.
const pendingBvn = new Map<string, string>()

// Step 2: send the OTP back; Wema returns the account number.
export const verifyAccount = async (userId: string, otpIn: string) => {
  if (!alatpayConfigured()) throw new Error('Bank account numbers are coming soon')
  const otp = String(otpIn || '').replace(/\D/g, '')
  if (otp.length < 4 || otp.length > 8) throw new Error('Enter the code we sent you')

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  if (user.alatpayAccountNumber)
    return { accountNumber: user.alatpayAccountNumber, accountName: user.alatpayAccountName, bankName: BANK_NAME }
  if (!user.alatpayPendingId || !user.alatpayOtpTrackingId) throw new Error('Please request a new code')

  let data: any
  try {
    const res = await api().post('/alatpay-wallet/api/v1/staticaccount/validateAndCreate', {
      staticWalletId: user.alatpayPendingId,
      businessId: cfg().businessId,
      otp,
      trackingId: user.alatpayOtpTrackingId,
    })
    data = res.data?.data ?? res.data
  } catch (e) {
    throw new Error(friendly(e, 'That code did not work. Check it and try again.'))
  }
  if (!data?.accountNumber) throw new Error(data?.message || 'That code did not work. Check it and try again.')

  const typedBvn = pendingBvn.get(userId)
  await prisma.user.update({
    where: { id: userId },
    data: {
      alatpayWalletId: data.id || user.alatpayPendingId,
      alatpayAccountNumber: String(data.accountNumber),
      alatpayAccountName: data.accountName || user.fullName,
      alatpayPendingId: null,
      alatpayOtpTrackingId: null,
      ...(typedBvn && !user.bvn ? { bvn: typedBvn } : {}),
    },
  })
  pendingBvn.delete(userId)
  return { accountNumber: String(data.accountNumber), accountName: data.accountName || user.fullName, bankName: BANK_NAME }
}

// ---------- webhook ----------

// Base64(HMAC-SHA256(raw body, webhook secret)) must equal the x-signature header.
export const signatureValid = (raw: Buffer, header?: string) => {
  const secret = cfg().webhookSecret
  if (!secret || !header) return false
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(header.trim())
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export const ipAllowed = (ip: string) => cfg().ips.includes(ip)

// Payload keys arrive in PascalCase; read them case-insensitively to be safe.
const pick = (obj: any, key: string) => {
  if (!obj || typeof obj !== 'object') return undefined
  if (key in obj) return obj[key]
  const k = Object.keys(obj).find(x => x.toLowerCase() === key.toLowerCase())
  return k ? obj[k] : undefined
}

export type WebhookResult = { status: string; credited?: number; userId?: string; note?: string }

export const handleWebhook = async (body: any): Promise<WebhookResult> => {
  // Static-wallet payloads put the data at the top; card/transfer ones wrap it in Value.
  const data = pick(body, 'Data') ?? pick(pick(body, 'Value'), 'Data')
  if (!data) return record({ eventId: `nodata-${Date.now()}`, amount: 0, status: 'IGNORED', note: 'No Data in payload', raw: body })

  const eventId = String(pick(data, 'Id') || '')
  const amountRaw = Number(pick(data, 'Amount'))
  const fee = Number(pick(data, 'FeeAmount') || 0)
  const sa = pick(data, 'StaticAccountResponse')
  const accountNumber = sa ? String(pick(sa, 'AccountNumber') || '') : ''
  const isStatic = pick(data, 'IsStaticWallet') === true || Number(pick(data, 'PaymentMethodId')) === 8 || !!sa

  if (!eventId) return record({ eventId: `noid-${Date.now()}`, amount: 0, status: 'IGNORED', note: 'Missing transaction Id', raw: body })
  if (!isStatic) return record({ eventId, amount: amountRaw || 0, status: 'IGNORED', note: `Channel ${pick(data, 'Channel')} not handled`, raw: body })
  if (!Number.isFinite(amountRaw) || amountRaw <= 0)
    return record({ eventId, accountNumber, amount: 0, status: 'REJECTED', note: 'Invalid amount', raw: body })

  const amount = Math.round(amountRaw * 100) / 100

  // Already seen this payment? (ALATPay retries after 30 min, 1 h and 24 h.)
  const seen = await prisma.paymentEvent.findUnique({ where: { provider_eventId: { provider: PROVIDER, eventId } } })
  if (seen) return { status: 'DUPLICATE', note: seen.status }

  const user = accountNumber ? await prisma.user.findUnique({ where: { alatpayAccountNumber: accountNumber } }) : null
  if (!user) return record({ eventId, accountNumber, amount, fee, status: 'UNMATCHED', note: 'No customer owns this account number', raw: body })

  if (amount > cfg().maxAutoCredit)
    return record({ eventId, accountNumber, amount, fee, userId: user.id, status: 'HELD', note: `Above auto-credit limit of ₦${cfg().maxAutoCredit.toLocaleString()} — needs admin review`, raw: body })

  return creditUser(user.id, eventId, accountNumber, amount, fee, body, 'Bank deposit (Wema)')
}

// Credits the wallet and records the event in ONE database transaction.
// The unique (provider, eventId) means a payment can only ever be credited once.
const creditUser = async (
  userId: string, eventId: string, accountNumber: string, amount: number, fee: number, raw: any, description: string, resolvedBy?: string
): Promise<WebhookResult> => {
  try {
    const out = await prisma.$transaction(async (tx) => {
      const ev = await tx.paymentEvent.create({ data: {
        provider: PROVIDER, eventId, mode: cfg().mode, accountNumber, amount, feeAmount: fee || 0,
        status: 'CREDITED', userId, raw, ...(resolvedBy ? { resolvedAt: new Date(), resolvedBy } : {}),
      }})
      const w = await creditInTx(tx, userId, amount, { countAsSaved: true })
      const t = await tx.transaction.create({ data: {
        walletId: w.id, type: 'CREDIT', amount, balance: w.balance, description,
        reference: `ALT-${eventId}`, status: 'SUCCESS',
      }})
      await tx.paymentEvent.update({ where: { id: ev.id }, data: { transactionId: t.id } })
      return { balance: w.balance }
    })
    tellCustomer(userId, amount, out.balance)
    return { status: 'CREDITED', credited: amount, userId }
  } catch (e: any) {
    if (e?.code === 'P2002') return { status: 'DUPLICATE' }
    throw e
  }
}

const record = async (r: { eventId: string; accountNumber?: string; amount: number; fee?: number; userId?: string; status: string; note?: string; raw: any }): Promise<WebhookResult> => {
  try {
    await prisma.paymentEvent.create({ data: {
      provider: PROVIDER, eventId: r.eventId, mode: cfg().mode, accountNumber: r.accountNumber || null,
      amount: r.amount || 0, feeAmount: r.fee || 0, status: r.status, note: r.note, userId: r.userId, raw: r.raw ?? {},
    }})
  } catch (e: any) {
    if (e?.code === 'P2002') return { status: 'DUPLICATE' }
    throw e
  }
  if (r.status === 'UNMATCHED' || r.status === 'HELD') console.log(`alatpay ${r.status}: ${r.eventId} ₦${r.amount} → ${r.accountNumber} (${r.note})`)
  return { status: r.status, note: r.note }
}

const tellCustomer = async (userId: string, amount: number, balance: number) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return
    await notify.walletCredited({ phone: user.phone, email: user.email, amount, balance, fullName: user.fullName })
    await sendPush([user.pushToken], 'Money received 💰', `₦${amount.toLocaleString()} has been added to your OWODE wallet.`, { screen: 'Wallet' })
  } catch (e) {
    console.log('alatpay notify failed (non-critical)')
  }
}

// ---------- admin ----------

export const listEvents = async (status?: string, take = 100) =>
  prisma.paymentEvent.findMany({
    where: { provider: PROVIDER, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(take, 500),
    select: { id: true, eventId: true, mode: true, accountNumber: true, amount: true, feeAmount: true, status: true, note: true, userId: true, transactionId: true, createdAt: true, resolvedAt: true, resolvedBy: true },
  })

// An admin credits an UNMATCHED or HELD payment to the right customer after checking it.
export const resolveEvent = async (id: string, adminId: string, userIdIn?: string) => {
  const ev = await prisma.paymentEvent.findUnique({ where: { id } })
  if (!ev || ev.provider !== PROVIDER) throw new Error('Payment not found')
  if (ev.status !== 'UNMATCHED' && ev.status !== 'HELD') throw new Error(`This payment is already ${ev.status.toLowerCase()}`)
  const userId = userIdIn || ev.userId
  if (!userId) throw new Error('Choose the customer to credit')
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('Customer not found')

  // Claim the event first so two admins can't credit it twice.
  const claimed = await prisma.paymentEvent.updateMany({
    where: { id, status: { in: ['UNMATCHED', 'HELD'] } },
    data: { status: 'RESOLVING', resolvedBy: adminId },
  })
  if (claimed.count !== 1) throw new Error('Someone else is already handling this payment')

  try {
    const balance = await prisma.$transaction(async (tx) => {
      const w = await creditInTx(tx, userId, ev.amount, { countAsSaved: true })
      const t = await tx.transaction.create({ data: {
        walletId: w.id, type: 'CREDIT', amount: ev.amount, balance: w.balance,
        description: 'Bank deposit (Wema)', reference: `ALT-${ev.eventId}`, status: 'SUCCESS',
      }})
      await tx.paymentEvent.update({ where: { id }, data: {
        status: 'CREDITED', userId, transactionId: t.id, resolvedAt: new Date(), resolvedBy: adminId,
        note: `${ev.note || ''} · credited by admin`.trim(),
      }})
      return w.balance
    })
    tellCustomer(userId, ev.amount, balance)
    return { credited: ev.amount, userId }
  } catch (e) {
    await prisma.paymentEvent.update({ where: { id }, data: { status: ev.status, resolvedBy: null } })
    throw e
  }
}

export const markIgnored = async (id: string, adminId: string, reason: string) => {
  const res = await prisma.paymentEvent.updateMany({
    where: { id, provider: PROVIDER, status: { in: ['UNMATCHED', 'HELD'] } },
    data: { status: 'DISMISSED', resolvedAt: new Date(), resolvedBy: adminId, note: reason.slice(0, 300) },
  })
  if (res.count !== 1) throw new Error('Only unmatched or held payments can be dismissed')
}

// Read-only check: compares Wema's records for each customer wallet with what we credited.
// It never credits anything itself; it lists differences for an admin to look at.
export const reconcile = async (days = 2) => {
  if (!alatpayConfigured()) throw new Error('ALATPay is not configured')
  const since = Date.now() - days * 86400_000
  const users = await prisma.user.findMany({
    where: { alatpayWalletId: { not: null } },
    select: { id: true, fullName: true, alatpayWalletId: true, alatpayAccountNumber: true },
  })
  const ours = await prisma.paymentEvent.findMany({
    where: { provider: PROVIDER, createdAt: { gte: new Date(since - 86400_000) } },
    select: { accountNumber: true, amount: true, createdAt: true, status: true },
  })
  const missing: any[] = []
  let checked = 0
  for (const u of users) {
    try {
      const res = await api().get('/alatpay-wallet/api/v1/staticaccount/collectionhistory', {
        params: { StaticAccountId: u.alatpayWalletId, PageNumber: 1, Limit: 50, PageSize: 50 },
      })
      const rows: any[] = res.data?.staticAccountTransactionResponses || res.data?.data?.staticAccountTransactionResponses || []
      for (const r of rows) {
        const when = new Date(r.transactionDate).getTime()
        if (!(when >= since)) continue
        checked++
        const amt = Math.round(Number(r.amount) * 100) / 100
        // Match on account + amount within 2 hours of each other.
        const hit = ours.find(o => o.accountNumber === u.alatpayAccountNumber && o.amount === amt && Math.abs(o.createdAt.getTime() - when) < 2 * 3600_000)
        if (!hit) missing.push({ userId: u.id, customer: u.fullName, accountNumber: u.alatpayAccountNumber, amount: amt, at: r.transactionDate, narration: r.narration, wemaId: r.staticAccountTransactionId })
      }
    } catch (e) {
      missing.push({ userId: u.id, customer: u.fullName, error: friendly(e, 'Could not read history') })
    }
  }
  return { wallets: users.length, deposits: checked, notCredited: missing.filter(m => !m.error).length, problems: missing }
}
