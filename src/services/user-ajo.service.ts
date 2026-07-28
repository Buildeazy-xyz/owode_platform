import { prisma } from '../config/database'
import { v4 as uuidv4 } from 'uuid'
import { sendPush } from '../utils/push'

// User-created STANDARD ajo. Invite-only, admin-approved, no Avatar guarantee.
// Guaranteed groups remain admin-created and are untouched by this file.

const MIN_AMOUNT = 10000
const MIN_MEMBERS = 6
const MAX_MEMBERS = 12

const makeCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1, they get misread
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

// Both BVN and NIN are required before a user can create or join.
const requireKyc = async (userId: string) => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { bvn: true, nin: true, isVerified: true, fullName: true }
  })
  if (!u) throw new Error('User not found')
  if (!u.bvn || !u.nin || !u.isVerified) {
    throw new Error('Complete your identity verification (BVN and NIN) before joining an Ajo group')
  }
  return u
}

export const createUserAjo = async (data: {
  userId: string
  name: string
  amount: number
  frequency: 'WEEKLY' | 'MONTHLY'
  totalMembers: number
}) => {
  await requireKyc(data.userId)

  if (!data.name || data.name.trim().length < 3) throw new Error('Give the group a name')
  if (data.frequency !== 'WEEKLY' && data.frequency !== 'MONTHLY') {
    throw new Error('Ajo groups can only be weekly or monthly')
  }
  if (!data.amount || data.amount < MIN_AMOUNT) {
    throw new Error(`The minimum contribution is \u20a6${MIN_AMOUNT.toLocaleString()}`)
  }
  if (data.totalMembers < MIN_MEMBERS || data.totalMembers > MAX_MEMBERS) {
    throw new Error(`A group must have between ${MIN_MEMBERS} and ${MAX_MEMBERS} members`)
  }

  let code = makeCode()
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.ajoGroup.findFirst({ where: { inviteCode: code } })
    if (!clash) break
    code = makeCode()
  }

  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.ajoGroup.create({
      data: {
        id: uuidv4(),
        name: data.name.trim(),
        amount: data.amount,
        frequency: data.frequency,
        totalMembers: data.totalMembers,
        currentCycle: 0,
        isActive: true,
        isGuaranteed: false,
        isUserCreated: true,
        approvalStatus: 'DRAFT',
        inviteCode: code,
        createdBy: data.userId
      }
    })
    // The creator takes position 1 by default; they can reorder before approval.
    await tx.ajoMember.create({
      data: { id: uuidv4(), groupId: g.id, userId: data.userId, position: 1 }
    })
    return g
  })

  return group
}

export const joinByCode = async (data: { userId: string; code: string }) => {
  await requireKyc(data.userId)

  const group = await prisma.ajoGroup.findFirst({
    where: { inviteCode: String(data.code || '').trim().toUpperCase() },
    include: { members: true }
  })
  if (!group) throw new Error('No group found with that code')
  if (group.approvalStatus === 'REJECTED') throw new Error('This group is not available')
  if (group.approvalStatus === 'APPROVED') throw new Error('This group has already started')
  if (group.members.length >= group.totalMembers) throw new Error('This group is already full')
  if (group.members.find(m => m.userId === data.userId)) throw new Error('You are already in this group')

  const position = group.members.length + 1

  const result = await prisma.$transaction(async (tx) => {
    await tx.ajoMember.create({
      data: { id: uuidv4(), groupId: group.id, userId: data.userId, position }
    })
    const count = await tx.ajoMember.count({ where: { groupId: group.id } })
    // Full -> goes to the admin queue automatically. No WhatsApp needed.
    if (count >= group.totalMembers) {
      await tx.ajoGroup.update({
        where: { id: group.id },
        data: { approvalStatus: 'PENDING' }
      })
    }
    return { count, full: count >= group.totalMembers }
  })

  if (result.full) {
    const creator = await prisma.user.findUnique({
      where: { id: group.createdBy },
      select: { pushToken: true }
    })
    await sendPush(
      [creator?.pushToken],
      'Your Ajo group is full',
      `"${group.name}" has all ${group.totalMembers} members. It is now waiting for approval before it can start.`,
      { type: 'ajo_pending', groupId: group.id }
    )
  }

  return { position, ...result }
}

export const setPayoutOrder = async (data: {
  userId: string
  groupId: string
  order: string[]   // member userIds in payout order
}) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: true }
  })
  if (!group) throw new Error('Group not found')
  if (group.createdBy !== data.userId) throw new Error('Only the creator can set the payout order')
  if (group.approvalStatus === 'APPROVED') throw new Error('The order cannot change once the group has started')
  if (data.order.length !== group.members.length) throw new Error('The order must include every member')

  await prisma.$transaction(async (tx) => {
    // Two passes so the unique [groupId, position] constraint never collides
    for (const m of group.members) {
      await tx.ajoMember.update({ where: { id: m.id }, data: { position: -m.position } })
    }
    for (let i = 0; i < data.order.length; i++) {
      const m = group.members.find(x => x.userId === data.order[i])
      if (!m) throw new Error('Unknown member in the order')
      await tx.ajoMember.update({ where: { id: m.id }, data: { position: i + 1 } })
    }
  })

  return { success: true }
}

export const getMyAjoGroups = async (userId: string) => {
  return prisma.ajoGroup.findMany({
    where: { isUserCreated: true, members: { some: { userId } } },
    include: {
      members: { include: { user: { select: { id: true, fullName: true, phone: true } } }, orderBy: { position: 'asc' } }
    },
    orderBy: { createdAt: 'desc' }
  })
}

// ---- admin ----

export const getPendingApproval = async () => {
  return prisma.ajoGroup.findMany({
    where: { isUserCreated: true, approvalStatus: 'PENDING' },
    include: {
      members: {
        include: { user: { select: { id: true, fullName: true, phone: true, bvn: true, nin: true, isVerified: true, trustScore: true } } },
        orderBy: { position: 'asc' }
      }
    },
    orderBy: { createdAt: 'asc' }
  })
}

const addPeriod = (from: Date, freq: string) => {
  const d = new Date(from)
  if (freq === 'WEEKLY') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return d
}

export const approveAjo = async (groupId: string, adminId: string) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: { members: { include: { user: { select: { pushToken: true } } } } }
  })
  if (!group) throw new Error('Group not found')
  if (group.approvalStatus !== 'PENDING') throw new Error('This group is not awaiting approval')

  // Collection begins the day after approval, as agreed.
  const start = new Date()
  start.setDate(start.getDate() + 1)
  start.setHours(0, 0, 0, 0)

  await prisma.ajoGroup.update({
    where: { id: groupId },
    data: {
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: adminId,
      startDate: start,
      nextDueDate: start,
      nextPayoutDate: addPeriod(start, group.frequency),
      currentCycle: 1
    }
  })

  await sendPush(
    group.members.map(m => m.user?.pushToken),
    'Your Ajo group has started',
    `"${group.name}" is approved. First contribution of \u20a6${group.amount.toLocaleString()} is due ${start.toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })}.`,
    { type: 'ajo_approved', groupId }
  )

  return { success: true }
}

export const rejectAjo = async (groupId: string, adminId: string, reason: string) => {
  if (!reason || reason.trim().length < 5) throw new Error('A reason is required')
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: { members: { include: { user: { select: { pushToken: true } } } } }
  })
  if (!group) throw new Error('Group not found')

  await prisma.ajoGroup.update({
    where: { id: groupId },
    data: { approvalStatus: 'REJECTED', rejectionReason: reason.trim(), isActive: false, approvedBy: adminId }
  })

  await sendPush(
    group.members.map(m => m.user?.pushToken),
    'Ajo group not approved',
    `"${group.name}" was not approved: ${reason.trim()}`,
    { type: 'ajo_rejected', groupId }
  )

  return { success: true }
}


// ---------------------------------------------------------------------------
// REMINDERS
// Runs on the daily cron alongside auto-debit. Push only, no SMS cost.
// Stages, tracked per member per cycle so nobody is told the same thing twice:
//   DAY_BEFORE  - weekly/monthly only, everyone in the group
//   DUE_TODAY   - unpaid members only
//   OVERDUE     - unpaid members, the morning after
// ---------------------------------------------------------------------------

export const runAjoReminders = async () => {
  const now = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const result = { checked: 0, dayBefore: 0, dueToday: 0, overdue: 0 }

  const groups = await prisma.ajoGroup.findMany({
    where: { approvalStatus: 'APPROVED', isActive: true, NOT: { nextDueDate: null } },
    include: {
      members: { include: { user: { select: { id: true, pushToken: true, fullName: true } } } }
    }
  })

  for (const g of groups) {
    result.checked++
    const due = new Date(g.nextDueDate as Date)
    const dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0)
    const money = '\u20a6' + g.amount.toLocaleString()

    let stage: 'DAY_BEFORE' | 'DUE_TODAY' | 'OVERDUE' | null = null
    if (dueDay.getTime() === tomorrow.getTime() && g.frequency !== 'DAILY') stage = 'DAY_BEFORE'
    else if (dueDay.getTime() === today.getTime()) stage = 'DUE_TODAY'
    else if (dueDay.getTime() < today.getTime()) stage = 'OVERDUE'
    if (!stage) continue

    // DAY_BEFORE goes to everyone; the rest only to those who have not paid.
    const targets = stage === 'DAY_BEFORE'
      ? g.members
      : g.members.filter(m => !m.hasPaid)

    const fresh = targets.filter(m =>
      m.lastRemindedCycle !== g.currentCycle || m.lastRemindedStage !== stage
    )
    if (fresh.length === 0) continue

    const copy = {
      DAY_BEFORE: {
        title: 'Ajo contribution due tomorrow',
        body: `Your ${money} contribution for "${g.name}" is due tomorrow. Make sure your wallet is funded.`
      },
      DUE_TODAY: {
        title: 'Ajo contribution due today',
        body: `Your ${money} contribution for "${g.name}" is due today. Pay now to keep your group on track.`
      },
      OVERDUE: {
        title: 'Ajo contribution missed',
        body: `Your ${money} contribution for "${g.name}" is overdue. Pay now so the next person can be paid out.`
      }
    }[stage]

    await sendPush(
      fresh.map(m => m.user?.pushToken),
      copy.title,
      copy.body,
      { type: 'ajo_reminder', stage, groupId: g.id }
    )

    await prisma.ajoMember.updateMany({
      where: { id: { in: fresh.map(m => m.id) } },
      data: { lastRemindedCycle: g.currentCycle, lastRemindedStage: stage }
    })

    if (stage === 'DAY_BEFORE') result.dayBefore += fresh.length
    if (stage === 'DUE_TODAY') result.dueToday += fresh.length
    if (stage === 'OVERDUE') result.overdue += fresh.length
  }

  console.log('ajo reminders:', result)
  return result
}
