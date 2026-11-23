// Read-only business report for ÈÈRÀ 06 (Executive Intelligence).
// Aggregates only: no phone numbers, emails, BVN/NIN, PINs or balances of individuals.
// People appear as first name + initial ("Kemi A."). Nothing here writes to the database.
import { prisma } from '../config/database'

const TZ = 'Africa/Lagos'
const lagosDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
export const shortName = (full?: string | null) => {
  const p = String(full || '').trim().split(/\s+/).filter(Boolean)
  return p.length ? p[0] + (p[1] ? ' ' + p[1][0].toUpperCase() + '.' : '') : 'Member'
}

// What kind of money movement a transaction is, from its reference prefix.
export const kindOf = (ref: string, type: string) => {
  const r = String(ref || '')
  if (type === 'CREDIT') {
    if (r.startsWith('AGENT-')) return 'agent_cash'
    if (r.startsWith('ALT-') || r.startsWith('PRV-')) return 'bank_transfer'
    if (r.startsWith('PAYOUT-') || r.startsWith('GPAYOUT-')) return 'payout'
    if (r.startsWith('SAV-WITH-')) return 'savings_withdrawal'
    return 'other_in'
  }
  if (r.startsWith('AJO-') || r.startsWith('GAJO-')) return 'ajo_contribution'
  if (r.startsWith('SAV-')) return 'savings_deposit'
  return 'other_out'
}

export async function buildReport(days = 35) {
  days = Math.min(Math.max(Math.trunc(days) || 35, 1), 60)
  const now = new Date()
  const since = new Date(now.getTime() - (days + 1) * 86400000)

  const [platformUsers, agents, txs, groups, defaults, events, kycPending, usersTotal, signups] = await Promise.all([
    prisma.user.findMany({ where: { role: { in: ['PLATFORM', 'ADMIN'] } }, select: { id: true } }),
    prisma.user.findMany({ where: { role: 'AGENT' }, select: { id: true, fullName: true } }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: since } },
      select: { type: true, amount: true, reference: true, status: true, createdAt: true, wallet: { select: { userId: true } } },
    }),
    prisma.ajoGroup.findMany({
      where: { isActive: true },
      select: {
        name: true, amount: true, frequency: true, totalMembers: true, currentCycle: true, isGuaranteed: true,
        nextDueDate: true, nextPayoutDate: true, approvalStatus: true, isUserCreated: true,
        members: { select: { hasPaid: true, status: true, user: { select: { fullName: true } } } },
      },
    }),
    prisma.defaultRecord.findMany({ where: { recoveryStatus: { in: ['PENDING', 'SOFT_RECOVERY', 'HARD_RECOVERY'] as any } }, select: { amountOwed: true, penaltyAmount: true, createdAt: true, group: { select: { name: true } } } }),
    prisma.paymentEvent.findMany({ where: { status: { in: ['UNMATCHED', 'HELD'] } }, select: { amount: true, status: true, note: true, createdAt: true } }),
    prisma.user.count({ where: { role: 'CONTRIBUTOR', isVerified: false } }),
    prisma.user.count({ where: { role: 'CONTRIBUTOR' } }),
    prisma.user.findMany({ where: { role: 'CONTRIBUTOR', createdAt: { gte: since } }, select: { createdAt: true } }),
  ])

  const skip = new Set(platformUsers.map((u) => u.id)) // company wallets: fees, not customer money
  const agentBy8 = new Map(agents.map((a) => [a.id.slice(0, 8), shortName(a.fullName)]))

  // One row per Lagos day, newest first. day 1 = yesterday, day 0 = today so far.
  const rows = new Map<string, any>()
  for (let d = 0; d <= days; d++) {
    const date = lagosDate(new Date(now.getTime() - d * 86400000))
    rows.set(date, { day: d, date, agent_cash: 0, bank_transfer: 0, other_in: 0, ajo_contribution: 0, savings_deposit: 0, payout: 0, savings_withdrawal: 0, pending_in: 0, failed: 0, signups: 0, by_agent: {} as Record<string, number> })
  }
  for (const t of txs) {
    if (skip.has(t.wallet?.userId || '')) continue
    const row = rows.get(lagosDate(t.createdAt))
    if (!row) continue
    if (t.status === 'FAILED') { row.failed++; continue }
    const k = kindOf(t.reference, t.type)
    if (t.status === 'PENDING') { if (t.type === 'CREDIT') row.pending_in += t.amount; continue }
    if (k === 'other_out') continue
    row[k] += t.amount
    if (k === 'agent_cash') {
      const name = agentBy8.get(String(t.reference).split('-')[2] || '') || 'Unknown agent'
      row.by_agent[name] = (row.by_agent[name] || 0) + t.amount
    }
  }
  for (const u of signups) { const row = rows.get(lagosDate(u.createdAt)); if (row) row.signups++ }

  const active = (m: any) => !m.status || m.status === 'APPROVED'
  return {
    generated_at: now.toISOString(),
    timezone: TZ,
    days: [...rows.values()],
    agents: agents.map((a) => shortName(a.fullName)),
    // Admin-made groups count once active; customer-made groups only once approved.
    groups: groups.filter((g) => g.approvalStatus !== 'REJECTED' && (!g.isUserCreated || g.approvalStatus === 'APPROVED')).map((g) => {
      const members = g.members.filter(active)
      const unpaid = members.filter((m) => !m.hasPaid)
      return {
        name: g.name, frequency: g.frequency, contribution: g.amount, guaranteed: g.isGuaranteed,
        members: members.length, slots: g.totalMembers, cycle: g.currentCycle,
        paid_this_cycle: members.length - unpaid.length, unpaid_members: unpaid.map((m) => shortName(m.user?.fullName)),
        next_due: g.nextDueDate ? g.nextDueDate.toISOString() : null,
        next_payout: g.nextPayoutDate ? g.nextPayoutDate.toISOString() : null,
      }
    }),
    defaults: defaults.map((d) => ({ group: d.group?.name || 'Ajọ group', owed: d.amountOwed + d.penaltyAmount, since: d.createdAt.toISOString() })),
    unmatched_payments: events.map((e) => ({ status: e.status, amount: e.amount, note: e.note || '', at: e.createdAt.toISOString() })),
    customers: { total: usersTotal, awaiting_kyc: kycPending },
  }
}
