import { prisma } from '../config/database'

const AVATAR_ID = 'owode-avatar-000000000000000000000000'
const AVATAR_WALLET_ID = 'avatar-wallet-0000000000000000000000'
const POOL_ID = 'guarantee-pool-000000000000000000000'
const GRACE_PERIOD_HOURS = 24
const PENALTY_PERCENTAGE = 0.1 // 10% penalty

// Collect guarantee fee from a contribution
export const collectGuaranteeFee = async (
  walletId: string,
  fee: number,
  groupId: string
) => {
  // Add fee to guarantee pool
  await prisma.$transaction([
    // Deduct fee from user (already done in contribution)
    // Credit guarantee pool
    prisma.guaranteePool.update({
      where: { id: POOL_ID },
      data: {
        totalBalance: { increment: fee },
        totalCollected: { increment: fee }
      }
    }),
    // Update group pool balance
    prisma.ajoGroup.update({
      where: { id: groupId },
      data: { guaranteePoolBalance: { increment: fee } }
    })
  ])
}

// Avatar covers a defaulter
export const avatarCoverDefault = async (
  groupId: string,
  defaulterId: string,
  amount: number,
  cycleNumber: number
) => {
  const group = await prisma.ajoGroup.findUnique({ where: { id: groupId } })
  if (!group) throw new Error('Group not found')

  // Check avatar coverage cap
  if (group.avatarCoveredCount >= group.maxAvatarCoverage) {
    // Pause the group
    await prisma.ajoGroup.update({
      where: { id: groupId },
      data: { isActive: false }
    })
    throw new Error('Maximum avatar coverage reached — group paused')
  }

  const penaltyAmount = amount * PENALTY_PERCENTAGE
  const gracePeriodEnd = new Date()
  gracePeriodEnd.setHours(gracePeriodEnd.getHours() + GRACE_PERIOD_HOURS)

  // Create default record
  const defaultRecord = await prisma.defaultRecord.create({
    data: {
      groupId,
      userId: defaulterId,
      cycleNumber,
      amountOwed: amount,
      penaltyAmount,
      avatarCovered: true,
      recoveryStatus: 'SOFT_RECOVERY',
      gracePeriodEnd
    }
  })

  // Avatar pays from guarantee pool
  await prisma.$transaction([
    // Deduct from guarantee pool
    prisma.guaranteePool.update({
      where: { id: POOL_ID },
      data: {
        totalBalance: { decrement: amount },
        totalPaidOut: { increment: amount }
      }
    }),
    // Update group
    prisma.ajoGroup.update({
      where: { id: groupId },
      data: {
        avatarCoveredCount: { increment: 1 },
        guaranteePoolBalance: { decrement: amount }
      }
    }),
    // Lock defaulter wallet
    prisma.wallet.update({
      where: { userId: defaulterId },
      data: { isLocked: true }
    }),
    // Reduce defaulter trust score
    prisma.user.update({
      where: { id: defaulterId },
      data: { trustScore: { decrement: 15 } }
    })
  ])

  return defaultRecord
}

// Soft recovery attempt (Day 1-3)
export const attemptSoftRecovery = async (defaultRecordId: string) => {
  const record = await prisma.defaultRecord.findUnique({
    where: { id: defaultRecordId },
    include: { user: true, group: true }
  })

  if (!record) throw new Error('Default record not found')

  const totalOwed = record.amountOwed + record.penaltyAmount

  // Try to recover from user wallet
  const wallet = await prisma.wallet.findUnique({ where: { userId: record.userId } })

  if (wallet && wallet.balance >= totalOwed) {
    // Recover funds
    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId: record.userId },
        data: { balance: { decrement: totalOwed }, isLocked: false }
      }),
      prisma.guaranteePool.update({
        where: { id: POOL_ID },
        data: {
          totalBalance: { increment: totalOwed },
          totalCollected: { increment: record.penaltyAmount }
        }
      }),
      prisma.defaultRecord.update({
        where: { id: defaultRecordId },
        data: { recoveryStatus: 'RECOVERED', recoveredAt: new Date() }
      }),
      prisma.ajoGroup.update({
        where: { id: record.groupId },
        data: { avatarCoveredCount: { decrement: 1 } }
      })
    ])
    return { recovered: true, amount: totalOwed }
  }

  return { recovered: false, amount: totalOwed }
}

// Escalate to hard recovery (Day 4-7)
export const escalateToHardRecovery = async (defaultRecordId: string) => {
  await prisma.defaultRecord.update({
    where: { id: defaultRecordId },
    data: { recoveryStatus: 'HARD_RECOVERY' }
  })

  // Get user
  const record = await prisma.defaultRecord.findUnique({
    where: { id: defaultRecordId },
    include: { user: true }
  })

  if (record) {
    // Reduce trust score further
    await prisma.user.update({
      where: { id: record.userId },
      data: { trustScore: { decrement: 20 } }
    })
  }

  return { escalated: true }
}

// Get guarantee pool status
export const getGuaranteePoolStatus = async () => {
  const pool = await prisma.guaranteePool.findUnique({ where: { id: POOL_ID } })
  const activeDefaults = await prisma.defaultRecord.count({
    where: { recoveryStatus: { in: ['PENDING', 'SOFT_RECOVERY', 'HARD_RECOVERY'] } }
  })
  return { ...pool, activeDefaults }
}