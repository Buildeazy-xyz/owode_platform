"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeOffDefault = exports.getUserDefaults = exports.getAllDefaults = exports.runRecoveryChecks = void 0;
const database_1 = require("../config/database");
const guarantee_service_1 = require("./guarantee.service");
const notification_service_1 = require("./notification.service");
// Run recovery checks — call this on a schedule
const runRecoveryChecks = async () => {
    const now = new Date();
    // Find all active defaults
    const activeDefaults = await database_1.prisma.defaultRecord.findMany({
        where: {
            recoveryStatus: { in: ['PENDING', 'SOFT_RECOVERY'] }
        },
        include: { user: true, group: true }
    });
    const results = [];
    for (const record of activeDefaults) {
        const daysSinceDefault = Math.floor((now.getTime() - record.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        // Day 1-3: Soft recovery
        if (daysSinceDefault <= 3) {
            const result = await (0, guarantee_service_1.attemptSoftRecovery)(record.id);
            if (result.recovered) {
                // Notify user of recovery
                await notification_service_1.notify.walletDebited({
                    phone: record.user.phone,
                    email: record.user.email,
                    amount: result.amount,
                    balance: 0,
                    fullName: record.user.fullName
                });
                results.push({ id: record.id, status: 'RECOVERED', daysSinceDefault });
            }
            else {
                results.push({ id: record.id, status: 'SOFT_RECOVERY_FAILED', daysSinceDefault });
            }
        }
        // Day 4+: Hard recovery
        if (daysSinceDefault >= 4 && record.recoveryStatus === 'SOFT_RECOVERY') {
            await (0, guarantee_service_1.escalateToHardRecovery)(record.id);
            // Lock ALL platform accounts
            await database_1.prisma.wallet.update({
                where: { userId: record.userId },
                data: { isLocked: true }
            });
            results.push({ id: record.id, status: 'HARD_RECOVERY', daysSinceDefault });
        }
    }
    return results;
};
exports.runRecoveryChecks = runRecoveryChecks;
// Get all defaults with full details
const getAllDefaults = async () => {
    return await database_1.prisma.defaultRecord.findMany({
        include: {
            user: true,
            group: true
        },
        orderBy: { createdAt: 'desc' }
    });
};
exports.getAllDefaults = getAllDefaults;
// Get defaults for a specific user
const getUserDefaults = async (userId) => {
    return await database_1.prisma.defaultRecord.findMany({
        where: { userId },
        include: { group: true },
        orderBy: { createdAt: 'desc' }
    });
};
exports.getUserDefaults = getUserDefaults;
// Mark default as written off
const writeOffDefault = async (defaultId) => {
    const record = await database_1.prisma.defaultRecord.update({
        where: { id: defaultId },
        data: { recoveryStatus: 'WRITTEN_OFF' }
    });
    // Unlock wallet
    await database_1.prisma.wallet.update({
        where: { userId: record.userId },
        data: { isLocked: false }
    });
    return record;
};
exports.writeOffDefault = writeOffDefault;
//# sourceMappingURL=recovery.service.js.map