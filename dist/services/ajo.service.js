"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeContribution = exports.getGroupById = exports.getAllGroups = exports.joinAjoGroup = exports.createAjoGroup = void 0;
const database_1 = require("../config/database");
const notification_service_1 = require("./notification.service");
// Create a new Ajo group
const createAjoGroup = async (data) => {
    // Only admins can create groups
    if (!data.isAdmin) {
        throw new Error('Only OWODE admins can create Ajo groups');
    }
    // Member limits: min 6, max 12 (excluding avatar in guaranteed)
    if (data.totalMembers < 6) {
        throw new Error('Minimum group size is 6 members');
    }
    if (data.totalMembers > 12) {
        throw new Error('Maximum group size is 12 members');
    }
    const existing = await database_1.prisma.ajoGroup.findFirst({
        where: { name: data.name }
    });
    if (existing)
        throw new Error('Group name already exists');
    const group = await database_1.prisma.ajoGroup.create({
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
    });
    return group;
};
exports.createAjoGroup = createAjoGroup;
// Join an Ajo group
const joinAjoGroup = async (data) => {
    const group = await database_1.prisma.ajoGroup.findUnique({
        where: { id: data.groupId },
        include: { members: true }
    });
    if (!group)
        throw new Error('Group not found');
    if (!group.isActive)
        throw new Error('Group is no longer active');
    const realMembers = group.members.filter((m) => !m.isAvatar);
    if (realMembers.length >= group.totalMembers) {
        throw new Error('Group is full — all slots are taken');
    }
    const alreadyJoined = group.members.find((m) => m.userId === data.userId);
    if (alreadyJoined)
        throw new Error('You have already joined this group');
    const position = realMembers.length + 1;
    const member = await database_1.prisma.ajoMember.create({
        data: {
            groupId: data.groupId,
            userId: data.userId,
            position,
            hasPaid: false
        }
    });
    const spotsLeft = group.totalMembers - (realMembers.length + 1);
    return {
        member,
        group,
        position,
        spotsLeft,
        groupFull: spotsLeft === 0,
        message: spotsLeft === 0
            ? '🎉 Group is now full! Contributions can begin!'
            : `✅ Joined! ${spotsLeft} spot${spotsLeft > 1 ? 's' : ''} remaining before contributions start`
    };
};
exports.joinAjoGroup = joinAjoGroup;
// Get all active Ajo groups
const getAllGroups = async () => {
    const groups = await database_1.prisma.ajoGroup.findMany({
        where: { isActive: true },
        include: { members: true }
    });
    return groups;
};
exports.getAllGroups = getAllGroups;
// Get a single Ajo group
const getGroupById = async (groupId) => {
    const group = await database_1.prisma.ajoGroup.findUnique({
        where: { id: groupId },
        include: { members: true }
    });
    if (!group) {
        throw new Error('Group not found');
    }
    return group;
};
exports.getGroupById = getGroupById;
// Make a contribution to an Ajo group
const makeContribution = async (data) => {
    const group = await database_1.prisma.ajoGroup.findUnique({
        where: { id: data.groupId },
        include: { members: true }
    });
    if (!group)
        throw new Error('Group not found');
    if (!group.isActive)
        throw new Error('Group is no longer active');
    // Check if group is full before allowing contributions
    const realMembers = group.members.filter((m) => !m.isAvatar);
    if (realMembers.length < group.totalMembers) {
        const spotsLeft = group.totalMembers - realMembers.length;
        throw new Error(`Group is not full yet. ${spotsLeft} more member${spotsLeft > 1 ? 's' : ''} needed before contributions can start`);
    }
    const member = group.members.find((m) => m.userId === data.userId);
    if (!member)
        throw new Error('You are not a member of this group');
    if (member.hasPaid)
        throw new Error('You have already paid for this cycle');
    const wallet = await database_1.prisma.wallet.findUnique({ where: { userId: data.userId } });
    if (!wallet)
        throw new Error('Wallet not found');
    if (wallet.isLocked)
        throw new Error('Your wallet is locked');
    if (wallet.balance < group.amount)
        throw new Error(`Insufficient balance. You need ₦${group.amount.toLocaleString()}`);
    const newBalance = wallet.balance - group.amount;
    await database_1.prisma.$transaction([
        database_1.prisma.wallet.update({
            where: { userId: data.userId },
            data: { balance: newBalance, totalPayout: { increment: group.amount } }
        }),
        database_1.prisma.transaction.create({
            data: {
                walletId: wallet.id,
                type: 'DEBIT',
                amount: group.amount,
                balance: newBalance,
                description: `Ajo contribution — ${group.name}`,
                reference: `AJO-${Date.now()}-${data.userId.slice(0, 8)}`,
                status: 'SUCCESS'
            }
        }),
        database_1.prisma.ajoMember.update({
            where: { id: member.id },
            data: { hasPaid: true }
        })
    ]);
    const updatedMembers = await database_1.prisma.ajoMember.findMany({
        where: { groupId: data.groupId }
    });
    const allPaid = updatedMembers.filter((m) => !m.isAvatar).every((m) => m.hasPaid);
    if (allPaid) {
        const nextPosition = (group.currentCycle % group.totalMembers) + 1;
        const recipient = updatedMembers.find((m) => m.position === nextPosition);
        if (recipient) {
            const recipientWallet = await database_1.prisma.wallet.findUnique({ where: { userId: recipient.userId } });
            if (recipientWallet) {
                const totalPayout = group.amount * group.totalMembers;
                const newRecipientBalance = recipientWallet.balance + totalPayout;
                await database_1.prisma.$transaction([
                    database_1.prisma.wallet.update({
                        where: { userId: recipient.userId },
                        data: { balance: newRecipientBalance, totalSaved: { increment: totalPayout } }
                    }),
                    database_1.prisma.transaction.create({
                        data: {
                            walletId: recipientWallet.id,
                            type: 'CREDIT',
                            amount: totalPayout,
                            balance: newRecipientBalance,
                            description: `Ajo payout — ${group.name} cycle ${group.currentCycle + 1}`,
                            reference: `PAYOUT-${Date.now()}-${recipient.userId.slice(0, 8)}`,
                            status: 'SUCCESS'
                        }
                    }),
                    database_1.prisma.ajoGroup.update({
                        where: { id: data.groupId },
                        data: { currentCycle: { increment: 1 } }
                    })
                ]);
                await database_1.prisma.ajoMember.updateMany({
                    where: { groupId: data.groupId },
                    data: { hasPaid: false }
                });
                const recipientUser = await database_1.prisma.user.findUnique({ where: { id: recipient.userId } });
                const senderUser = await database_1.prisma.user.findUnique({ where: { id: data.userId } });
                if (recipientUser) {
                    await notification_service_1.notify.ajoPayout({
                        phone: recipientUser.phone,
                        email: recipientUser.email,
                        amount: totalPayout,
                        groupName: group.name,
                        fullName: recipientUser.fullName
                    });
                }
                return {
                    contributed: true,
                    allPaid: true,
                    payoutSent: true,
                    payoutTo: recipient.userId,
                    payoutAmount: totalPayout,
                    nextCycle: group.currentCycle + 1
                };
            }
        }
    }
    const paidCount = updatedMembers.filter((m) => !m.isAvatar && m.hasPaid).length;
    const remainingCount = updatedMembers.filter((m) => !m.isAvatar && !m.hasPaid).length;
    // Notify user
    const user = await database_1.prisma.user.findUnique({ where: { id: data.userId } });
    if (user) {
        await notification_service_1.notify.contributionMade({
            phone: user.phone,
            email: user.email,
            amount: group.amount,
            groupName: group.name,
            fullName: user.fullName
        });
    }
    return {
        contributed: true,
        allPaid: false,
        payoutSent: false,
        paidCount,
        remainingCount
    };
};
exports.makeContribution = makeContribution;
//# sourceMappingURL=ajo.service.js.map