import { prisma } from '../config/database'

// Create a new Ajo group
export const createAjoGroup = async (data: {
  name: string
  amount: number
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  totalMembers: number
  createdBy: string
}) => {
  // Check if group name already exists
  const existing = await prisma.ajoGroup.findFirst({
    where: { name: data.name }
  })

  if (existing) {
    throw new Error('Group name already exists')
  }

  // Create the group
  const group = await prisma.ajoGroup.create({
    data: {
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      totalMembers: data.totalMembers,
      createdBy: data.createdBy,
      currentCycle: 0,
      isActive: true
    }
  })

  return group
}

// Join an Ajo group
export const joinAjoGroup = async (data: {
  groupId: string
  userId: string
}) => {
  // Check if group exists
  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: true }
  })

  if (!group) {
    throw new Error('Group not found')
  }

  if (!group.isActive) {
    throw new Error('Group is no longer active')
  }

  // Check if group is full
  if (group.members.length >= group.totalMembers) {
    throw new Error('Group is full')
  }

  // Check if user already joined
  const alreadyJoined = group.members.find(m => m.userId === data.userId)
  if (alreadyJoined) {
    throw new Error('You have already joined this group')
  }

  // Assign position based on how many members are already in
  const position = group.members.length + 1

  const member = await prisma.ajoMember.create({
    data: {
      groupId: data.groupId,
      userId: data.userId,
      position,
      hasPaid: false
    }
  })

  return { member, group }
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
}) => {
  // Step 1 — Find the group
  const group = await prisma.ajoGroup.findUnique({
    where: { id: data.groupId },
    include: { members: true }
  })

  if (!group) throw new Error('Group not found')
  if (!group.isActive) throw new Error('Group is no longer active')

  // Step 2 — Find the member
  const member = await prisma.ajoMember.findFirst({
    where: { groupId: data.groupId, userId: data.userId }
  })

  if (!member) throw new Error('You are not a member of this group')
  if (member.hasPaid) throw new Error('You have already paid for this cycle')

  // Step 3 — Debit the member's wallet
  const wallet = await prisma.wallet.findUnique({
    where: { userId: data.userId }
  })

  if (!wallet) throw new Error('Wallet not found')
  if (wallet.isLocked) throw new Error('Wallet is locked')
  if (wallet.balance < group.amount) throw new Error('Insufficient balance')

  const newBalance = wallet.balance - group.amount

  // Step 4 — Debit wallet and create transaction
  await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: data.userId },
      data: {
        balance: newBalance,
        totalPayout: wallet.totalPayout + group.amount
      }
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: 'DEBIT',
        amount: group.amount,
        balance: newBalance,
        description: `Ajo contribution - ${group.name}`,
        reference: `AJO-${Date.now()}-${data.userId.slice(0, 8)}`,
        status: 'SUCCESS'
      }
    }),
    // Step 5 — Mark member as paid
    prisma.ajoMember.update({
      where: { id: member.id },
      data: { hasPaid: true }
    })
  ])

  // Step 6 — Check if all members have paid
  const updatedMembers = await prisma.ajoMember.findMany({
    where: { groupId: data.groupId }
  })

  const allPaid = updatedMembers.every(m => m.hasPaid)

  // Step 7 — If all paid, pay out to the next person in line
  if (allPaid) {
    const nextPosition = (group.currentCycle % group.totalMembers) + 1
    const recipient = updatedMembers.find(m => m.position === nextPosition)

    if (recipient) {
      const recipientWallet = await prisma.wallet.findUnique({
        where: { userId: recipient.userId }
      })

      if (recipientWallet) {
        const totalPayout = group.amount * group.totalMembers
        const newRecipientBalance = recipientWallet.balance + totalPayout

        await prisma.$transaction([
          // Credit recipient wallet
          prisma.wallet.update({
            where: { userId: recipient.userId },
            data: {
              balance: newRecipientBalance,
              totalSaved: recipientWallet.totalSaved + totalPayout
            }
          }),
          // Create payout transaction
          prisma.transaction.create({
            data: {
              walletId: recipientWallet.id,
              type: 'CREDIT',
              amount: totalPayout,
              balance: newRecipientBalance,
              description: `Ajo payout - ${group.name} cycle ${group.currentCycle + 1}`,
              reference: `PAYOUT-${Date.now()}-${recipient.userId.slice(0, 8)}`,
              status: 'SUCCESS'
            }
          }),
          // Move to next cycle and reset all members hasPaid
          prisma.ajoGroup.update({
            where: { id: data.groupId },
            data: { currentCycle: group.currentCycle + 1 }
          })
        ])

        // Reset all members hasPaid for next cycle
        await prisma.ajoMember.updateMany({
          where: { groupId: data.groupId },
          data: { hasPaid: false }
        })

        return {
          contributed: true,
          allPaid: true,
          payoutSent: true,
          payoutTo: recipient.userId,
          payoutAmount: totalPayout,
          nextCycle: group.currentCycle + 1
        }
      }
    }
  }

  return {
    contributed: true,
    allPaid: false,
    payoutSent: false,
    paidCount: updatedMembers.filter(m => m.hasPaid).length,
    remainingCount: updatedMembers.filter(m => !m.hasPaid).length
  }
}