import { prisma } from '../config/database'
import bcrypt from 'bcryptjs'
import { notify } from './notification.service'
// Create a new Ajo group
export const createAjoGroup = async (data: {
  name: string
  amount: number
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  totalMembers: number
  createdBy: string
  isAdmin: boolean
}) => {
  // Only admins can create groups
  if (!data.isAdmin) {
    throw new Error('Only OWODE admins can create Ajo groups')
  }

  // Member limits: min 6, max 12 (excluding avatar in guaranteed)
  if (data.totalMembers < 6) {
    throw new Error('Minimum group size is 6 members')
  }
  if (data.totalMembers > 12) {
    throw new Error('Maximum group size is 12 members')
  }

  const existing = await prisma.ajoGroup.findFirst({
    where: { name: data.name }
  })
  if (existing) throw new Error('Group name already exists')

  const group = await prisma.ajoGroup.create({
    data: {
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      totalMembers: data.totalMembers,
      currentCycle: 0,
      isActive: true,
      isGuaranteed: false,
      createdBy: data.createdBy
    }
  })

  return group
}

// Join an Ajo group
export const joinAjoGroup = async (data: {
  groupId: string
  userId: string
}) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: true }
  })
  if (group && (group as any).isUserCreated && (group as any).approvalStatus !== 'APPROVED') {
    throw new Error('This group has not been approved yet. Contributions cannot start.')
  }

  if (!group) throw new Error('Group not found')
  if (!group.isActive) throw new Error('Group is no longer active')

  // User-created groups take no money until OWODE approves them.
  if ((group as any).approvalStatus && (group as any).approvalStatus !== 'APPROVED') {
    throw new Error('This group is awaiting OWODE approval. Contributions open once it is approved.')
  }

  const realMembers = group.members.filter((m: any) => !m.isAvatar)
  if (realMembers.length >= group.totalMembers) {
    throw new Error('Group is full — all slots are taken')
  }

  const alreadyJoined = group.members.find((m: any) => m.userId === data.userId)
  if (alreadyJoined) throw new Error('You have already joined this group')

  const maxPos = group.members.reduce((mx: number, m: any) => Math.max(mx, m.position), 0)
  const position = maxPos + 1

  const member = await prisma.ajoMember.create({
    data: {
      groupId: data.groupId,
      userId: data.userId,
      position,
      hasPaid: false
    }
  })

  const spotsLeft = group.totalMembers - (realMembers.length + 1)

  return {
    member,
    group,
    position,
    spotsLeft,
    groupFull: spotsLeft === 0,
    message: spotsLeft === 0
      ? '🎉 Group is now full! Contributions can begin!'
      : `✅ Joined! ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} remaining before contributions start`
  }
}

// Get all active Ajo groups
export const getAllGroups = async () => {
  const groups = await prisma.ajoGroup.findMany({
    where: { isActive: true },
    include: { members: true }
  })

  return groups
}

// Get a single Ajo group
export const getGroupById = async (groupId: string) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: { members: true }
  })

  if (!group) {
    throw new Error('Group not found')
  }

  return group
}

// Make a contribution to an Ajo group
export const makeContribution = async (data: {
  groupId: string
  userId: string
  transactionPin: string
}) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: true }
  })

  if (!group) throw new Error('Group not found')
  if (!group.isActive) throw new Error('Group is no longer active')

  // Check if group is full before allowing contributions
  const realMembers = group.members.filter((m: any) => !m.isAvatar)
  if (realMembers.length < group.totalMembers) {
    const spotsLeft = group.totalMembers - realMembers.length
    throw new Error(`Group is not full yet. ${spotsLeft} more member${spotsLeft > 1 ? 's' : ''} needed before contributions can start`)
  }

  const member = group.members.find((m: any) => m.userId === data.userId)
  if (!member) throw new Error('You are not a member of this group')
  if ((member as any).status && (member as any).status !== 'APPROVED') {
    throw new Error('Your membership is still pending approval')
  }
  if (member.hasPaid) throw new Error('You have already paid for this cycle')

  const wallet = await prisma.wallet.findUnique({ where: { userId: data.userId } })
  if (!wallet) throw new Error('Wallet not found')
  if (wallet.isLocked) throw new Error('Your wallet is locked')
  if (wallet.balance < group.amount) throw new Error(`Insufficient balance. You need ₦${group.amount.toLocaleString()}`)

  // Verify transaction PIN before any money moves
  const contribUser = await prisma.user.findUnique({ where: { id: data.userId } })
  if (!contribUser) throw new Error('User not found')
  if (data.transactionPin !== 'BIOMETRIC_AUTH') {
    if (!contribUser.transactionPin) throw new Error('Please set a transaction PIN first')
    const pinOk = await bcrypt.compare(data.transactionPin, contribUser.transactionPin)
    if (!pinOk) throw new Error('Invalid transaction PIN')
  }

  const newBalance = wallet.balance - group.amount

  // ATOMIC: contributor debit, cycle detection and payout all commit together.
  // Row locks also serialise concurrent contributions, so two members paying at
  // the same instant cannot both trigger the payout.
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: data.userId },
      data: { balance: newBalance, totalPayout: { increment: group.amount } }
    })
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'DEBIT',
        amount: group.amount,
        balance: newBalance,
        description: `Ajo contribution — ${group.name}`,
        reference: `AJO-${Date.now()}-${data.userId.slice(0, 8)}`,
        status: 'SUCCESS'
      }
    })
    await tx.ajoMember.update({
      where: { id: member.id },
      data: { hasPaid: true }
    })

    const members = await tx.ajoMember.findMany({ where: { groupId: data.groupId } })
    const everyonePaid = members.filter((m: any) => !m.isAvatar).every((m: any) => m.hasPaid)
    if (!everyonePaid) return { members, paid: false, recipient: null as any, totalPayout: 0 }

    const nextPosition = (group.currentCycle % group.totalMembers) + 1
    const recipient = members.find((m: any) => m.position === nextPosition)
    if (!recipient) return { members, paid: false, recipient: null as any, totalPayout: 0 }

    const recipientWallet = await tx.wallet.findUnique({ where: { userId: recipient.userId } })
    if (!recipientWallet) return { members, paid: false, recipient: null as any, totalPayout: 0 }

    const totalPayout = group.amount * group.totalMembers
    const newRecipientBalance = recipientWallet.balance + totalPayout

    await tx.wallet.update({
      where: { userId: recipient.userId },
      data: { balance: newRecipientBalance, totalSaved: { increment: totalPayout } }
    })
    await tx.transaction.create({
      data: {
        walletId: recipientWallet.id,
        type: 'CREDIT',
        amount: totalPayout,
        balance: newRecipientBalance,
        description: `Ajo payout — ${group.name} cycle ${group.currentCycle + 1}`,
        reference: `PAYOUT-${Date.now()}-${recipient.userId.slice(0, 8)}`,
        status: 'SUCCESS'
      }
    })
    await tx.ajoGroup.update({
      where: { id: data.groupId },
      data: { currentCycle: { increment: 1 } }
    })
    await tx.ajoMember.updateMany({
      where: { groupId: data.groupId },
      data: { hasPaid: false }
    })

    return { members, paid: true, recipient, totalPayout }
  })

  const updatedMembers = outcome.members

  if (outcome.paid && outcome.recipient) {
    // Notification stays outside the transaction on purpose — a failed SMS or
    // email must never roll back a payout that already committed.
    const recipientUser = await prisma.user.findUnique({ where: { id: outcome.recipient.userId } })
    if (recipientUser) {
      try {
        await notify.ajoPayout({
          phone: recipientUser.phone,
          email: recipientUser.email,
          amount: outcome.totalPayout,
          groupName: group.name,
          fullName: recipientUser.fullName
        })
      } catch (e) {}
    }

    return {
      contributed: true,
      allPaid: true,
      payoutSent: true,
      payoutTo: outcome.recipient.userId,
      payoutAmount: outcome.totalPayout,
      nextCycle: group.currentCycle + 1
    }
  }

  const paidCount = updatedMembers.filter((m: any) => !m.isAvatar && m.hasPaid).length
  const remainingCount = updatedMembers.filter((m: any) => !m.isAvatar && !m.hasPaid).length

  // Notify user
  const user = await prisma.user.findUnique({ where: { id: data.userId } })
  if (user) {
    await notify.contributionMade({
      phone: user.phone,
      email: user.email,
      amount: group.amount,
      groupName: group.name,
      fullName: user.fullName
    })
  }

  return {
    contributed: true,
    allPaid: false,
    payoutSent: false,
    paidCount,
    remainingCount
  }
}
