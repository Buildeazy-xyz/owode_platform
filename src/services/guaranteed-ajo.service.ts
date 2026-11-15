import { prisma } from '../config/database'
import { updateTrustScore, isEligibleForGuaranteedAjo } from './trust.service'
import { avatarCoverDefault } from './guarantee.service'
import { notify } from './notification.service'
import { debitInTx, creditInTx } from '../utils/money'
import { verifyTransactionPinOrThrow } from '../utils/pinGuard'

const AVATAR_ID = 'owode-avatar-000000000000000000000000'
const POOL_ID = 'guarantee-pool-000000000000000000000'

// Create a guaranteed Ajo group
export const createGuaranteedGroup = async (data: {
  name: string
  amount: number
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  totalMembers: number
  createdBy: string
}) => {
  // Check if creator is eligible
  // Replace eligibility check with:
const creator = await prisma.user.findUnique({ where: { id: data.createdBy } })
if (!creator) throw new Error('User not found')
if (creator.trustScore < 35) throw new Error('Trust score too low to create Guaranteed Ajo group')

  // Calculate guarantee fee (0.5% of contribution per cycle)
  const guaranteeFee = data.amount * 0.005

  // Create group with Avatar as first member
  const group = await prisma.ajoGroup.create({
    data: {
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      totalMembers: data.totalMembers + 1, // +1 for Avatar
      currentCycle: 0,
      isActive: true,
      isGuaranteed: true,
      guaranteeFee,
      guaranteePoolBalance: 0,
      avatarCoveredCount: 0,
      maxAvatarCoverage: 2,
      createdBy: data.createdBy,
      // Add Avatar as position 0 (safety net, not in payout rotation)
      members: {
        create: {
          userId: AVATAR_ID,
          position: 0,
          isAvatar: true,
          hasPaid: true // Avatar always "paid"
        }
      }
    },
    include: { members: true }
  })

  return group
}

// Join a guaranteed Ajo group with risk assessment
export const joinGuaranteedGroup = async (data: {
  groupId: string
  userId: string
}) => {
  // Check eligibility
  // Replace the eligibility check in joinGuaranteedGroup with:
const user = await prisma.user.findUnique({ where: { id: data.userId } })
if (!user) throw new Error('User not found')
if (user.trustScore < 35) throw new Error('Trust score too low to join Guaranteed Ajo')
  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: { include: { user: { select: { id: true, fullName: true, phone: true, trustScore: true, isVerified: true } } } } }
  })
  if (group && (group as any).isUserCreated && (group as any).approvalStatus !== 'APPROVED') {
    throw new Error('This group has not been approved yet. Contributions cannot start.')
  }

  if (!group) throw new Error('Group not found')
  if (!group.isActive) throw new Error('Group is no longer active')
  if (!group.isGuaranteed) throw new Error('This is not a Guaranteed Ajo group')

  // Check if group is full (excluding avatar)
  const realMembers = group.members.filter((m: any) => !m.isAvatar)
  if (realMembers.length >= group.totalMembers - 1) throw new Error('Group is full')

  // Check if already joined
  const alreadyJoined = group.members.find((m: any) => m.userId === data.userId)
  if (alreadyJoined) throw new Error('You have already joined this group')

  // Get user trust score for smart positioning
  // Smart position assignment based on trust score
  // Higher trust score = earlier position (lower risk payout first)
  // Lower trust score = later position (must contribute more before receiving)
  const existingPositions = realMembers.map((m: any) => m.position).sort((a: number, b: number) => a - b)
  let position = realMembers.length + 1

  // Risk ladder — low trust users get later positions
  if (user.trustScore < 50 && existingPositions.length > 0) {
    position = Math.max(...existingPositions) + 1
  }

  const member = await prisma.ajoMember.create({
    data: {
      groupId: data.groupId,
      userId: data.userId,
      position,
      hasPaid: false
    }
  })

  return { member, group, position, trustScore: user.trustScore }
}

// Make contribution to guaranteed Ajo
//
// Everything that moves money happens in ONE transaction, with the group row
// locked first. Before this, the debit and the payout ran separately, so two
// members paying at the same instant could both see "everyone has paid" and
// the recipient was paid twice.
export const makeGuaranteedContribution = async (data: {
  groupId: string
  userId: string
  transactionPin: string
}) => {
  const user = await prisma.user.findUnique({ where: { id: data.userId } })
  if (!user) throw new Error('User not found')
  // Biometrics only unlock the real PIN on-device; the server always checks it.
  await verifyTransactionPinOrThrow(user, data.transactionPin)

  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: true }
  })
  if (!group) throw new Error('Group not found')
  if (!group.isActive) throw new Error('Group is paused or inactive')

  const member = group.members.find((m: any) => m.userId === data.userId)
  if (!member) throw new Error('You are not a member of this group')
  if (member.hasPaid) throw new Error('You have already paid for this cycle')

  const wallet = await prisma.wallet.findUnique({ where: { userId: data.userId } })
  if (!wallet) throw new Error('Wallet not found')
  if (wallet.isLocked) throw new Error('Your wallet is locked due to a pending default')

  const totalDeduction = group.amount + group.guaranteeFee
  if (wallet.balance < totalDeduction) {
    throw new Error(`Insufficient balance. You need ₦${totalDeduction.toLocaleString()} (₦${group.amount.toLocaleString()} contribution + ₦${group.guaranteeFee.toLocaleString()} guarantee fee)`)
  }

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AjoGroup" WHERE id = ${data.groupId} FOR UPDATE`

    const g = await tx.ajoGroup.findUnique({ where: { id: data.groupId } })
    if (!g || !g.isActive) throw new Error('Group is paused or inactive')

    // Claim this cycle's payment. A double tap matches nothing the second time.
    const claim = await tx.ajoMember.updateMany({
      where: { id: member.id, hasPaid: false },
      data: { hasPaid: true }
    })
    if (claim.count !== 1) throw new Error('You have already paid for this cycle')

    const deduction = g.amount + g.guaranteeFee
    const after = await debitInTx(tx, data.userId, deduction, { countAsPayout: true })
    await tx.transaction.create({
      data: {
        walletId: after.id,
        type: 'DEBIT',
        amount: deduction,
        balance: after.balance,
        description: `Guaranteed Ajo contribution — ${g.name} (includes ₦${g.guaranteeFee} guarantee fee)`,
        reference: `GAJO-${Date.now()}-${data.userId.slice(0, 8)}`,
        status: 'SUCCESS'
      }
    })

    // Guarantee fee into the pool, in the same transaction as the debit.
    if (g.guaranteeFee > 0) {
      await tx.guaranteePool.update({
        where: { id: POOL_ID },
        data: { totalBalance: { increment: g.guaranteeFee }, totalCollected: { increment: g.guaranteeFee } }
      })
      await tx.ajoGroup.update({
        where: { id: data.groupId },
        data: { guaranteePoolBalance: { increment: g.guaranteeFee } }
      })
    }

    const members = await tx.ajoMember.findMany({ where: { groupId: data.groupId } })
    const realMembers = members.filter((m: any) => !m.isAvatar)
    const allPaid = realMembers.every((m: any) => m.hasPaid)

    if (!allPaid) {
      return {
        payout: null as null | { recipientUserId: string; totalPayout: number; cycle: number },
        members,
        newBalance: after.balance,
        groupName: g.name,
        amount: g.amount,
        guaranteeFee: g.guaranteeFee
      }
    }

    // Everyone has paid: pay this cycle's recipient, once.
    const nextPosition = (g.currentCycle % (g.totalMembers - 1)) + 1
    const recipient = members.find((m: any) => m.position === nextPosition && !m.isAvatar)
    if (!recipient) throw new Error('No recipient found for this cycle')

    const totalPayout = g.amount * (g.totalMembers - 1) // Exclude avatar from payout calc
    const paid = await creditInTx(tx, recipient.userId, totalPayout, { countAsSaved: true })

    await tx.transaction.create({
      data: {
        walletId: paid.id,
        type: 'CREDIT',
        amount: totalPayout,
        balance: paid.balance,
        description: `Guaranteed Ajo payout — ${g.name} Cycle ${g.currentCycle + 1}`,
        reference: `GPAYOUT-${Date.now()}-${recipient.userId.slice(0, 8)}`,
        status: 'SUCCESS'
      }
    })
    await tx.ajoCycle.create({
      data: {
        groupId: data.groupId,
        cycleNumber: g.currentCycle + 1,
        recipientId: recipient.userId,
        totalAmount: totalPayout,
        avatarCovered: false,
        status: 'COMPLETED',
        completedAt: new Date()
      }
    })
    await tx.ajoGroup.update({
      where: { id: data.groupId },
      data: { currentCycle: { increment: 1 } }
    })
    await tx.ajoMember.update({
      where: { id: recipient.id },
      data: { payoutReceived: true }
    })
    await tx.ajoMember.updateMany({
      where: { groupId: data.groupId, isAvatar: false },
      data: { hasPaid: false }
    })

    return {
      payout: { recipientUserId: recipient.userId, totalPayout, cycle: g.currentCycle },
      members,
      newBalance: after.balance,
      groupName: g.name,
      amount: g.amount,
      guaranteeFee: g.guaranteeFee
    }
  })

  // Notifications and trust scores stay outside the transaction on purpose:
  // a failed SMS must never roll back money that has already moved.
  try {
    await notify.contributionMade({
      phone: user.phone,
      email: user.email,
      amount: outcome.amount + outcome.guaranteeFee,
      groupName: outcome.groupName,
      fullName: user.fullName
    })
  } catch (e) {}

  if (outcome.payout) {
    const recipientUser = await prisma.user.findUnique({ where: { id: outcome.payout.recipientUserId } })
    if (recipientUser) {
      try {
        await notify.ajoPayout({
          phone: recipientUser.phone,
          email: recipientUser.email,
          amount: outcome.payout.totalPayout,
          groupName: outcome.groupName,
          fullName: recipientUser.fullName
        })
      } catch (e) {}
    }

    const paidMembers = outcome.members.filter((m: any) => !m.isAvatar && m.hasPaid)
    for (const m of paidMembers) {
      try { await updateTrustScore(m.userId) } catch (e) {}
    }

    return {
      contributed: true,
      allPaid: true,
      payoutSent: true,
      payoutTo: outcome.payout.recipientUserId,
      payoutAmount: outcome.payout.totalPayout,
      nextCycle: outcome.payout.cycle + 1
    }
  }

  const realMembers = outcome.members.filter((m: any) => !m.isAvatar)
  return {
    contributed: true,
    allPaid: false,
    payoutSent: false,
    amount: outcome.amount,
    guaranteeFee: outcome.guaranteeFee,
    paidCount: realMembers.filter((m: any) => m.hasPaid).length,
    remainingCount: realMembers.filter((m: any) => !m.hasPaid).length,
    newBalance: outcome.newBalance
  }
}

// Check for defaults and trigger Avatar coverage
export const checkAndHandleDefaults = async (groupId: string) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: {
      members: { include: { user: true } }
    }
  })

  if (!group || !group.isActive) return

  const unpaidMembers = group.members.filter((m: any) => !m.isAvatar && !m.hasPaid)
  const results = []

  for (const member of unpaidMembers) {
    try {
      // Avatar covers the default
      const defaultRecord = await avatarCoverDefault(
        groupId,
        member.userId,
        group.amount,
        group.currentCycle
      )

      // Mark member as "paid" by avatar
      await prisma.ajoMember.update({
        where: { id: member.id },
        data: { hasPaid: true }
      })

      // Notify defaulter
      const user = member.user
      if (user) {
        await notify.walletDebited({
          phone: user.phone,
          email: user.email,
          amount: group.amount + (group.amount * 0.1),
          balance: 0,
          fullName: user.fullName
        })
      }

      results.push({ userId: member.userId, covered: true, defaultRecord })
    } catch (error: any) {
      results.push({ userId: member.userId, covered: false, error: error.message })
    }
  }

  return results
}

// Get group details with full info
export const getGuaranteedGroupDetails = async (groupId: string) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: { select: { id: true, fullName: true, phone: true, trustScore: true, isVerified: true } } },
        orderBy: { position: 'asc' }
      },
      cycles: { orderBy: { cycleNumber: 'desc' } },
      defaultRecords: { include: { user: { select: { id: true, fullName: true, phone: true, trustScore: true, isVerified: true } } } }
    }
  })

  if (!group) throw new Error('Group not found')

  return {
    ...group,
    members: group.members.map((m: any) => ({
      id: m.id,
      position: m.position,
      isAvatar: m.isAvatar,
      hasPaid: m.hasPaid,
      payoutReceived: m.payoutReceived,
      user: m.isAvatar ? {
        id: AVATAR_ID,
        fullName: 'Owode Avatar 🤖',
        phone: '00000000000',
        trustScore: 100,
        isVerified: true
      } : {
        id: m.user.id,
        fullName: m.user.fullName,
        phone: m.user.phone,
        trustScore: m.user.trustScore,
        isVerified: m.user.isVerified
      }
    }))
  }
}

// Get all guaranteed groups
export const getAllGuaranteedGroups = async () => {
  return await prisma.ajoGroup.findMany({
    where: { isGuaranteed: true, isActive: true },
    include: {
      members: {
        include: { user: { select: { id: true, fullName: true, phone: true, trustScore: true, isVerified: true } } }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}