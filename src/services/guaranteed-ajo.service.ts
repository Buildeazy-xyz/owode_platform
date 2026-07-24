import { prisma } from '../config/database'
import { updateTrustScore, isEligibleForGuaranteedAjo } from './trust.service'
import { collectGuaranteeFee, avatarCoverDefault } from './guarantee.service'
import { notify } from './notification.service'
import bcrypt from 'bcryptjs'

const AVATAR_ID = 'owode-avatar-000000000000000000000000'

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
    include: { members: { include: { user: true } } }
  })

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
export const makeGuaranteedContribution = async (data: {
  groupId: string
  userId: string
  transactionPin: string
}) => {
  // Verify transaction PIN
  const user = await prisma.user.findUnique({ where: { id: data.userId } })
  if (!user) throw new Error('User not found')

  if (data.transactionPin !== 'BIOMETRIC_AUTH') {
    if (!user.transactionPin) throw new Error('Please set a transaction PIN first')
    const isPinValid = await bcrypt.compare(data.transactionPin, user.transactionPin)
    if (!isPinValid) throw new Error('Invalid transaction PIN')
  }
  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: { include: { user: true } } }
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

  const newBalance = wallet.balance - totalDeduction

  // Debit wallet
  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: data.userId },
      data: {
        balance: newBalance,
        totalPayout: { increment: totalDeduction }
      }
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'DEBIT',
        amount: totalDeduction,
        balance: newBalance,
        description: `Guaranteed Ajo contribution — ${group.name} (includes ₦${group.guaranteeFee} guarantee fee)`,
        reference: `GAJO-${Date.now()}-${data.userId.slice(0, 8)}`,
        status: 'SUCCESS'
      }
    }),
    prisma.ajoMember.update({
      where: { id: member.id },
      data: { hasPaid: true }
    })
  ])

  // Collect guarantee fee to pool
  await collectGuaranteeFee(wallet.id, group.guaranteeFee, data.groupId)

  // Send notification
  await notify.contributionMade({
    phone: user.phone,
    email: user.email,
    amount: totalDeduction,
    groupName: group.name,
    fullName: user.fullName
  })

  // Check if all real members have paid
  const updatedMembers = await prisma.ajoMember.findMany({
    where: { groupId: data.groupId }
  })

  const realMembers = updatedMembers.filter((m: any) => !m.isAvatar)
  const allPaid = realMembers.every((m: any) => m.hasPaid)

  if (allPaid) {
    return await processGuaranteedPayout(data.groupId, group, updatedMembers)
  }

  const paidCount = realMembers.filter((m: any) => m.hasPaid).length
  const remainingCount = realMembers.filter((m: any) => !m.hasPaid).length

  return {
    contributed: true,
    allPaid: false,
    payoutSent: false,
    amount: group.amount,
    guaranteeFee: group.guaranteeFee,
    paidCount,
    remainingCount,
    newBalance
  }
}

// Process payout when all members have paid
const processGuaranteedPayout = async (
  groupId: string,
  group: any,
  members: any[]
) => {
  const nextPosition = (group.currentCycle % (group.totalMembers - 1)) + 1
  const recipient = members.find((m: any) => m.position === nextPosition && !m.isAvatar)

  if (!recipient) throw new Error('No recipient found for this cycle')

  const totalPayout = group.amount * (group.totalMembers - 1) // Exclude avatar from payout calc

  const recipientWallet = await prisma.wallet.findUnique({
    where: { userId: recipient.userId }
  })

  if (!recipientWallet) throw new Error('Recipient wallet not found')

  const newRecipientBalance = recipientWallet.balance + totalPayout

  await prisma.$transaction([
    // Credit recipient
    prisma.wallet.update({
      where: { userId: recipient.userId },
      data: {
        balance: newRecipientBalance,
        totalSaved: { increment: totalPayout }
      }
    }),
    // Create payout transaction
    prisma.transaction.create({
      data: {
        walletId: recipientWallet.id,
        type: 'CREDIT',
        amount: totalPayout,
        balance: newRecipientBalance,
        description: `Guaranteed Ajo payout — ${group.name} Cycle ${group.currentCycle + 1}`,
        reference: `GPAYOUT-${Date.now()}-${recipient.userId.slice(0, 8)}`,
        status: 'SUCCESS'
      }
    }),
    // Record cycle
    prisma.ajoCycle.create({
      data: {
        groupId,
        cycleNumber: group.currentCycle + 1,
        recipientId: recipient.userId,
        totalAmount: totalPayout,
        avatarCovered: false,
        status: 'COMPLETED',
        completedAt: new Date()
      }
    }),
    // Advance cycle
    prisma.ajoGroup.update({
      where: { id: groupId },
      data: { currentCycle: { increment: 1 } }
    }),
    // Mark recipient as having received payout
    prisma.ajoMember.update({
      where: { id: recipient.id },
      data: { payoutReceived: true }
    })
  ])

  // Reset all member payments for next cycle
  await prisma.ajoMember.updateMany({
    where: { groupId, isAvatar: false },
    data: { hasPaid: false }
  })

  // Get recipient info for notification
  const recipientUser = await prisma.user.findUnique({ where: { id: recipient.userId } })
  if (recipientUser) {
    await notify.ajoPayout({
      phone: recipientUser.phone,
      email: recipientUser.email,
      amount: totalPayout,
      groupName: group.name,
      fullName: recipientUser.fullName
    })
  }

  // Update trust scores for all members who paid
  const paidMembers = members.filter((m: any) => !m.isAvatar && m.hasPaid)
  for (const m of paidMembers) {
    await updateTrustScore(m.userId)
  }

  return {
    contributed: true,
    allPaid: true,
    payoutSent: true,
    payoutTo: recipient.userId,
    payoutAmount: totalPayout,
    nextCycle: group.currentCycle + 1
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
        include: { user: true },
        orderBy: { position: 'asc' }
      },
      cycles: { orderBy: { cycleNumber: 'desc' } },
      defaultRecords: { include: { user: true } }
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
        include: { user: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}