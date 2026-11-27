import { Router, Request, Response } from 'express'
import { getWalletBalance, transferFunds, getWalletTransactions } from '../services/wallet.service'
import { protect } from '../middleware/auth.middleware'
import { prisma } from '../config/database'

const router = Router()

// GET /api/wallet/balance
router.get('/transactions', protect, async (req: any, res: Response) => {
  try {
    const { from, to, type } = req.query
    const wallet = await getWalletTransactions(req.user.userId, {
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      type: type ? String(type) : undefined
    })
    res.status(200).json({ success: true, data: wallet })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/wallet/transactions/:id/receipt — extra receipt details for one of the signed-in user's transactions.
// For a Wema bank deposit it reads the bank's saved notification: account paid into, session ID, narration
// and the sender, when Wema includes them (Customer / SessionId / Description are null today).
const firstOf = (o: any, keys: string[]) => {
  if (!o || typeof o !== 'object') return null
  for (const k of keys) {
    const hit = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase())
    if (hit && o[hit] != null && String(o[hit]).trim() !== '') return String(o[hit]).trim()
  }
  return null
}
const maskAcct = (a: string | null) => {
  const d = String(a || '').replace(/\D/g, '')
  return d.length >= 6 ? d.slice(0, 3) + '****' + d.slice(-3) : a
}
router.get('/transactions/:id/receipt', protect, async (req: any, res: Response) => {
  try {
    const t = await prisma.transaction.findFirst({ where: { id: String(req.params.id), wallet: { userId: req.user.userId } } })
    if (!t) { res.status(404).json({ success: false, message: 'Transaction not found' }); return }
    let bank: any = null
    if (String(t.reference || '').startsWith('ALT-')) {
      const ev = await prisma.paymentEvent.findFirst({ where: { transactionId: t.id } })
      if (ev) {
        const raw: any = ev.raw || {}
        const d: any = raw.Data || raw.data || raw.Value?.Data || {}
        const c: any = d.Customer || d.customer || {}
        const name = firstOf(c, ['Name', 'FullName', 'AccountName']) || [firstOf(c, ['FirstName']), firstOf(c, ['LastName'])].filter(Boolean).join(' ') || firstOf(d, ['SenderName', 'OriginatorName', 'OriginatorAccountName', 'PayerName'])
        bank = {
          name: 'Wema Bank',
          accountNumber: ev.accountNumber,
          sessionId: firstOf(d, ['SessionId', 'NipSessionId', 'SessionID']),
          narration: firstOf(d, ['Description', 'Narration', 'Remark']),
          sender: {
            name: name || null,
            bank: firstOf(d, ['SenderBankName', 'OriginatorBank', 'OriginatorBankName', 'SourceBankName']) || firstOf(c, ['BankName']),
            account: maskAcct(firstOf(d, ['SenderAccountNumber', 'OriginatorAccountNumber', 'SourceAccountNumber']) || firstOf(c, ['AccountNumber'])),
          },
        }
      }
    }
    res.status(200).json({ success: true, data: { id: t.id, bank } })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

router.get('/balance', protect, async (req: any, res: Response) => {
  try {
    const wallet = await getWalletBalance(req.user.userId)
    res.status(200).json({ success: true, data: wallet })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// /api/wallet/credit and /api/wallet/debit were removed: any logged-in user
// could add money to their own wallet. Money only enters a wallet through a
// bank settlement, an agent collection, an Ajo payout or a savings withdrawal.

// POST /api/wallet/transfer
router.post('/transfer', protect, async (req: any, res: Response) => {
  try {
    const { recipientPhone, amount, description, transactionPin, location } = req.body
    if (!recipientPhone || !amount || !description || !transactionPin) {
      res.status(400).json({ success: false, message: 'recipientPhone, amount, description and transactionPin are required' })
      return
    }
    const result = await transferFunds(req.user.userId, recipientPhone, amount, description, transactionPin, location)
    res.status(200).json({ success: true, message: `₦${result.amount.toLocaleString()} sent successfully!`, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})
export default router