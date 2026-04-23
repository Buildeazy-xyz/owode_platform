"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGuaranteePoolStatus = exports.escalateToHardRecovery = exports.attemptSoftRecovery = exports.avatarCoverDefault = exports.collectGuaranteeFee = void 0;
const database_1 = require("../config/database");
const AVATAR_ID = 'owode-avatar-000000000000000000000000';
const AVATAR_WALLET_ID = 'avatar-wallet-0000000000000000000000';
const POOL_ID = 'guarantee-pool-000000000000000000000';
const GRACE_PERIOD_HOURS = 24;
const PENALTY_PERCENTAGE = 0.1; // 10% penalty
// Collect guarantee fee from a contribution
const collectGuaranteeFee = async (walletId, fee, groupId) => {
    // Add fee to guarantee pool
    await database_1.prisma.$transaction([
        // Deduct fee from user (already done in contribution)
        // Credit guarantee pool
        database_1.prisma.guaranteePool.update({
            where: { id: POOL_ID },
            data: {
                totalBalance: { increment: fee },
                totalCollected: { increment: fee }
            }
        }),
        // Update group pool balance
        database_1.prisma.ajoGroup.update({
            where: { id: groupId },
            data: { guaranteePoolBalance: { increment: fee } }
        })
    ]);
};
exports.collectGuaranteeFee = collectGuaranteeFee;
// Avatar covers a defaulter
const avatarCoverDefault = async (groupId, defaulterId, amount, cycleNumber) => {
    const group = await database_1.prisma.ajoGroup.findUnique({ where: { id: groupId } });
    if (!group)
        throw new Error('Group not found');
    // Check avatar coverage cap
    if (group.avatarCoveredCount >= group.maxAvatarCoverage) {
        // Pause the group
        await database_1.prisma.ajoGroup.update({
            where: { id: groupId },
            data: { isActive: false }
        });
        throw new Error('Maximum avatar coverage reached — group paused');
    }
    const penaltyAmount = amount * PENALTY_PERCENTAGE;
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setHours(gracePeriodEnd.getHours() + GRACE_PERIOD_HOURS);
    // Create default record
    const defaultRecord = await database_1.prisma.defaultRecord.create({
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
    });
    // Avatar pays from guarantee pool
    await database_1.prisma.$transaction([
        // Deduct from guarantee pool
        database_1.prisma.guaranteePool.update({
            where: { id: POOL_ID },
            data: {
                totalBalance: { decrement: amount },
                totalPaidOut: { increment: amount }
            }
        }),
        // Update group
        database_1.prisma.ajoGroup.update({
            where: { id: groupId },
            data: {
                avatarCoveredCount: { increment: 1 },
                guaranteePoolBalance: { decrement: amount }
            }
        }),
        // Lock defaulter wallet
        database_1.prisma.wallet.update({
            where: { userId: defaulterId },
            data: { isLocked: true }
        }),
        // Reduce defaulter trust score
        database_1.prisma.user.update({
            where: { id: defaulterId },
            data: { trustScore: { decrement: 15 } }
        })
    ]);
    return defaultRecord;
};
exports.avatarCoverDefault = avatarCoverDefault;
// Soft recovery attempt (Day 1-3)
const attemptSoftRecovery = async (defaultRecordId) => {
    const record = await database_1.prisma.defaultRecord.findUnique({
        where: { id: defaultRecordId },
        include: { user: true, group: true }
    });
    if (!record)
        throw new Error('Default record not found');
    const totalOwed = record.amountOwed + record.penaltyAmount;
    // Try to recover from user wallet
    const wallet = await database_1.prisma.wallet.findUnique({ where: { userId: record.userId } });
    if (wallet && wallet.balance >= totalOwed) {
        // Recover funds
        await database_1.prisma.$transaction([
            database_1.prisma.wallet.update({
                where: { userId: record.userId },
                data: { balance: { decrement: totalOwed }, isLocked: false }
            }),
            database_1.prisma.guaranteePool.update({
                where: { id: POOL_ID },
                data: {
                    totalBalance: { increment: totalOwed },
                    totalCollected: { increment: record.penaltyAmount }
                }
            }),
            database_1.prisma.defaultRecord.update({
                where: { id: defaultRecordId },
                data: { recoveryStatus: 'RECOVERED', recoveredAt: new Date() }
            }),
            database_1.prisma.ajoGroup.update({
                where: { id: record.groupId },
                data: { avatarCoveredCount: { decrement: 1 } }
            })
        ]);
        return { recovered: true, amount: totalOwed };
    }
    return { recovered: false, amount: totalOwed };
};
exports.attemptSoftRecovery = attemptSoftRecovery;
// Escalate to hard recovery (Day 4-7)
const escalateToHardRecovery = async (defaultRecordId) => {
    await database_1.prisma.defaultRecord.update({
        where: { id: defaultRecordId },
        data: { recoveryStatus: 'HARD_RECOVERY' }
    });
    // Get user
    const record = await database_1.prisma.defaultRecord.findUnique({
        where: { id: defaultRecordId },
        include: { user: true }
    });
    if (record) {
        // Reduce trust score further
        await database_1.prisma.user.update({
            where: { id: record.userId },
            data: { trustScore: { decrement: 20 } }
        });
    }
    return { escalated: true };
};
exports.escalateToHardRecovery = escalateToHardRecovery;
// Get guarantee pool status
const getGuaranteePoolStatus = async () => {
    const pool = await database_1.prisma.guaranteePool.findUnique({ where: { id: POOL_ID } });
    const activeDefaults = await database_1.prisma.defaultRecord.count({
        where: { recoveryStatus: { in: ['PENDING', 'SOFT_RECOVERY', 'HARD_RECOVERY'] } }
    });
    return { ...pool, activeDefaults };
};
exports.getGuaranteePoolStatus = getGuaranteePoolStatus;
//# sourceMappingURL=guarantee.service.js.map