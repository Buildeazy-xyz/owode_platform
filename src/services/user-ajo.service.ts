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
