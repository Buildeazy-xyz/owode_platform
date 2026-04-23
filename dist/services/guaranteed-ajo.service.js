"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllGuaranteedGroups = exports.getGuaranteedGroupDetails = exports.checkAndHandleDefaults = exports.makeGuaranteedContribution = exports.joinGuaranteedGroup = exports.createGuaranteedGroup = void 0;
const database_1 = require("../config/database");
const trust_service_1 = require("./trust.service");
const guarantee_service_1 = require("./guarantee.service");
const notification_service_1 = require("./notification.service");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const AVATAR_ID = 'owode-avatar-000000000000000000000000';
// Create a guaranteed Ajo group
const createGuaranteedGroup = async (data) => {
    // Check if creator is eligible
    // Replace eligibility check with:
    const creator = await database_1.prisma.user.findUnique({ where: { id: data.createdBy } });
    if (!creator)
        throw new Error('User not found');
    if (creator.trustScore < 35)
        throw new Error('Trust score too low to create Guaranteed Ajo group');
    // Calculate guarantee fee (0.5% of contribution per cycle)
    const guaranteeFee = data.amount * 0.005;
    // Create group with Avatar as first member
    const group = await database_1.prisma.ajoGroup.create({
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
    });
    return group;
};
exports.createGuaranteedGroup = createGuaranteedGroup;
// Join a guaranteed Ajo group with risk assessment
const joinGuaranteedGroup = async (data) => {
    // Check eligibility
    // Replace the eligibility check in joinGuaranteedGroup with:
    const user = await database_1.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user)
        throw new Error('User not found');
    if (user.trustScore < 35)
        throw new Error('Trust score too low to join Guaranteed Ajo');
    const group = await database_1.prisma.ajoGroup.findUnique({
        where: { id: data.groupId },
        include: { members: { include: { user: true } } }
    });
    if (!group)
        throw new Error('Group not found');
    if (!group.isActive)
        throw new Error('Group is no longer active');
    if (!group.isGuaranteed)
        throw new Error('This is not a Guaranteed Ajo group');
    // Check if group is full (excluding avatar)
    const realMembers = group.members.filter((m) => !m.isAvatar);
    if (realMembers.length >= group.totalMembers - 1)
        throw new Error('Group is full');
    // Check if already joined
    const alreadyJoined = group.members.find((m) => m.userId === data.userId);
    if (alreadyJoined)
        throw new Error('You have already joined this group');
    // Get user trust score for smart positioning
    // Smart position assignment based on trust score
    // Higher trust score = earlier position (lower risk payout first)
    // Lower trust score = later position (must contribute more before receiving)
    const existingPositions = realMembers.map((m) => m.position).sort((a, b) => a - b);
    let position = realMembers.length + 1;
    // Risk ladder — low trust users get later positions
    if (user.trustScore < 50 && existingPositions.length > 0) {
        position = Math.max(...existingPositions) + 1;
    }
    const member = await database_1.prisma.ajoMember.create({
        data: {
            groupId: data.groupId,
            userId: data.userId,
            position,
            hasPaid: false
        }
    });
    return { member, group, position, trustScore: user.trustScore };
};
exports.joinGuaranteedGroup = joinGuaranteedGroup;
// Make contribution to guaranteed Ajo
const makeGuaranteedContribution = async (data) => {
    // Verify transaction PIN
    const user = await database_1.prisma.user.findUnique({ where: { id: data.userId } });
    if (!user)
        throw new Error('User not found');
    const isPinValid = await bcryptjs_1.default.compare(data.transactionPin, user.transactionPin);
    if (!isPinValid)
        throw new Error('Invalid transaction PIN');
    // Replace PIN verification section:
    if (data.transactionPin !== 'BIOMETRIC_AUTH') {
        const isPinValid = await bcryptjs_1.default.compare(data.transactionPin, user.transactionPin);
        if (!isPinValid)
            throw new Error('Invalid transaction PIN');
    }
    const group = await database_1.prisma.ajoGroup.findUnique({
        where: { id: data.groupId },
        include: { members: { include: { user: true } } }
    });
    if (!group)
        throw new Error('Group not found');
    if (!group.isActive)
        throw new Error('Group is paused or inactive');
    const member = group.members.find((m) => m.userId === data.userId);
    if (!member)
        throw new Error('You are not a member of this group');
    if (member.hasPaid)
        throw new Error('You have already paid for this cycle');
    const wallet = await database_1.prisma.wallet.findUnique({ where: { userId: data.userId } });
    if (!wallet)
        throw new Error('Wallet not found');
    if (wallet.isLocked)
        throw new Error('Your wallet is locked due to a pending default');
    const totalDeduction = group.amount + group.guaranteeFee;
    if (wallet.balance < totalDeduction) {
        throw new Error(`Insufficient balance. You need ₦${totalDeduction.toLocaleString()} (₦${group.amount.toLocaleString()} contribution + ₦${group.guaranteeFee.toLocaleString()} guarantee fee)`);
    }
    const newBalance = wallet.balance - totalDeduction;
    // Debit wallet
    await database_1.prisma.$transaction([
        database_1.prisma.wallet.update({
            where: { userId: data.userId },
            data: {
                balance: newBalance,
                totalPayout: { increment: totalDeduction }
            }
        }),
        database_1.prisma.transaction.create({
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
        database_1.prisma.ajoMember.update({
            where: { id: member.id },
            data: { hasPaid: true }
        })
    ]);
    // Collect guarantee fee to pool
    await (0, guarantee_service_1.collectGuaranteeFee)(wallet.id, group.guaranteeFee, data.groupId);
    // Send notification
    await notification_service_1.notify.contributionMade({
        phone: user.phone,
        email: user.email,
        amount: totalDeduction,
        groupName: group.name,
        fullName: user.fullName
    });
    // Check if all real members have paid
    const updatedMembers = await database_1.prisma.ajoMember.findMany({
        where: { groupId: data.groupId }
    });
    const realMembers = updatedMembers.filter((m) => !m.isAvatar);
    const allPaid = realMembers.every((m) => m.hasPaid);
    if (allPaid) {
        return await processGuaranteedPayout(data.groupId, group, updatedMembers);
    }
    const paidCount = realMembers.filter((m) => m.hasPaid).length;
    const remainingCount = realMembers.filter((m) => !m.hasPaid).length;
    return {
        contributed: true,
        allPaid: false,
        payoutSent: false,
        amount: group.amount,
        guaranteeFee: group.guaranteeFee,
        paidCount,
        remainingCount,
        newBalance
    };
};
exports.makeGuaranteedContribution = makeGuaranteedContribution;
// Process payout when all members have paid
const processGuaranteedPayout = async (groupId, group, members) => {
    const nextPosition = (group.currentCycle % (group.totalMembers - 1)) + 1;
    const recipient = members.find((m) => m.position === nextPosition && !m.isAvatar);
    if (!recipient)
        throw new Error('No recipient found for this cycle');
    const totalPayout = group.amount * (group.totalMembers - 1); // Exclude avatar from payout calc
    const recipientWallet = await database_1.prisma.wallet.findUnique({
        where: { userId: recipient.userId }
    });
    if (!recipientWallet)
        throw new Error('Recipient wallet not found');
    const newRecipientBalance = recipientWallet.balance + totalPayout;
    await database_1.prisma.$transaction([
        // Credit recipient
        database_1.prisma.wallet.update({
            where: { userId: recipient.userId },
            data: {
                balance: newRecipientBalance,
                totalSaved: { increment: totalPayout }
            }
        }),
        // Create payout transaction
        database_1.prisma.transaction.create({
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
        database_1.prisma.ajoCycle.create({
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
        database_1.prisma.ajoGroup.update({
            where: { id: groupId },
            data: { currentCycle: { increment: 1 } }
        }),
        // Mark recipient as having received payout
        database_1.prisma.ajoMember.update({
            where: { id: recipient.id },
            data: { payoutReceived: true }
        })
    ]);
    // Reset all member payments for next cycle
    await database_1.prisma.ajoMember.updateMany({
        where: { groupId, isAvatar: false },
        data: { hasPaid: false }
    });
    // Get recipient info for notification
    const recipientUser = await database_1.prisma.user.findUnique({ where: { id: recipient.userId } });
    if (recipientUser) {
        await notification_service_1.notify.ajoPayout({
            phone: recipientUser.phone,
            email: recipientUser.email,
            amount: totalPayout,
            groupName: group.name,
            fullName: recipientUser.fullName
        });
    }
    // Update trust scores for all members who paid
    const paidMembers = members.filter((m) => !m.isAvatar && m.hasPaid);
    for (const m of paidMembers) {
        await (0, trust_service_1.updateTrustScore)(m.userId);
    }
    return {
        contributed: true,
        allPaid: true,
        payoutSent: true,
        payoutTo: recipient.userId,
        payoutAmount: totalPayout,
        nextCycle: group.currentCycle + 1
    };
};
// Check for defaults and trigger Avatar coverage
const checkAndHandleDefaults = async (groupId) => {
    const group = await database_1.prisma.ajoGroup.findUnique({
        where: { id: groupId },
        include: {
            members: { include: { user: true } }
        }
    });
    if (!group || !group.isActive)
        return;
    const unpaidMembers = group.members.filter((m) => !m.isAvatar && !m.hasPaid);
    const results = [];
    for (const member of unpaidMembers) {
        try {
            // Avatar covers the default
            const defaultRecord = await (0, guarantee_service_1.avatarCoverDefault)(groupId, member.userId, group.amount, group.currentCycle);
            // Mark member as "paid" by avatar
            await database_1.prisma.ajoMember.update({
                where: { id: member.id },
                data: { hasPaid: true }
            });
            // Notify defaulter
            const user = member.user;
            if (user) {
                await notification_service_1.notify.walletDebited({
                    phone: user.phone,
                    email: user.email,
                    amount: group.amount + (group.amount * 0.1),
                    balance: 0,
                    fullName: user.fullName
                });
            }
            results.push({ userId: member.userId, covered: true, defaultRecord });
        }
        catch (error) {
            results.push({ userId: member.userId, covered: false, error: error.message });
        }
    }
    return results;
};
exports.checkAndHandleDefaults = checkAndHandleDefaults;
// Get group details with full info
const getGuaranteedGroupDetails = async (groupId) => {
    const group = await database_1.prisma.ajoGroup.findUnique({
        where: { id: groupId },
        include: {
            members: {
                include: { user: true },
                orderBy: { position: 'asc' }
            },
            cycles: { orderBy: { cycleNumber: 'desc' } },
            defaultRecords: { include: { user: true } }
        }
    });
    if (!group)
        throw new Error('Group not found');
    return {
        ...group,
        members: group.members.map((m) => ({
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
    };
};
exports.getGuaranteedGroupDetails = getGuaranteedGroupDetails;
// Get all guaranteed groups
const getAllGuaranteedGroups = async () => {
    return await database_1.prisma.ajoGroup.findMany({
        where: { isGuaranteed: true, isActive: true },
        include: {
            members: {
                include: { user: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};
exports.getAllGuaranteedGroups = getAllGuaranteedGroups;
//# sourceMappingURL=guaranteed-ajo.service.js.map