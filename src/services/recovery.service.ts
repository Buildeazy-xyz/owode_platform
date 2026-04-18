import { prisma } from '../config/database'
import { attemptSoftRecovery, escalateToHardRecovery } from './guarantee.service'
import { notify } from './notification.service'

// Run recovery checks — call this on a schedule
export const runRecoveryChecks = async () => {
  const now = new Date()

  // Find all active defaults
  const activeDefaults = await prisma.defaultRecord.findMany({
    where: {
      recoveryStatus: { in: ['PENDING', 'SOFT_RECOVERY'] }
    },
    include: { user: true, group: true }
  })

  const results = []

  for (const record of activeDefaults) {
    const daysSinceDefault = Math.floor(
      (now.getTime() - record.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Day 1-3: Soft recovery
    if (daysSinceDefault <= 3) {
      const result = await attemptSoftRecovery(record.id)

      if (result.recovered) {
        // Notify user of recovery
        await notify.walletDebited({
          phone: record.user.phone,
          email: record.user.email,
          amount: result.amount,
          balance: 0,
          fullName: record.user.fullName
        })
        results.push({ id: record.id, status: 'RECOVERED', daysSinceDefault })
      } else {
        results.push({ id: record.id, status: 'SOFT_RECOVERY_FAILED', daysSinceDefault })
      }
    }

    // Day 4+: Hard recovery
    if (daysSinceDefault >= 4 && record.recoveryStatus === 'SOFT_RECOVERY') {
      await escalateToHardRecovery(record.id)

      // Lock ALL platform accounts
      await prisma.wallet.update({
        where: { userId: record.userId },
        data: { isLocked: true }
      })

      results.push({ id: record.id, status: 'HARD_RECOVERY', daysSinceDefault })
    }
  }

  return results
}

// Get all defaults with full details
export const getAllDefaults = async () => {
  return await prisma.defaultRecord.findMany({
    include: {
      user: true,
      group: true
    },
    orderBy: { createdAt: 'desc' }
  })
}

// Get defaults for a specific user
export const getUserDefaults = async (userId: string) => {
  return await prisma.defaultRecord.findMany({
    where: { userId },
    include: { group: true },
    orderBy: { createdAt: 'desc' }
  })
}

// Mark default as written off
export const writeOffDefault = async (defaultId: string) => {
  const record = await prisma.defaultRecord.update({
    where: { id: defaultId },
    data: { recoveryStatus: 'WRITTEN_OFF' }
  })

  // Unlock wallet
  await prisma.wallet.update({
    where: { userId: record.userId },
    data: { isLocked: false }
  })

  return record
}