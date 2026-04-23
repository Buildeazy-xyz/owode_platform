"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentSummary = exports.getAllMembers = exports.agentCreditMember = exports.assignAgentRole = void 0;
const database_1 = require("../config/database");
// Assign agent role to a user
const assignAgentRole = async (userId) => {
    const user = await database_1.prisma.user.findUnique({
        where: { id: userId }
    });
    if (!user)
        throw new Error('User not found');
    if (user.role === 'AGENT')
        throw new Error('User is already an agent');
    const updatedUser = await database_1.prisma.user.update({
        where: { id: userId },
        data: { role: 'AGENT' }
    });
    return {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        phone: updatedUser.phone,
        email: updatedUser.email,
        role: updatedUser.role,
        isVerified: updatedUser.isVerified,
        isActive: updatedUser.isActive,
        createdAt: updatedUser.createdAt
    };
};
exports.assignAgentRole = assignAgentRole;
// Agent credits a member's wallet (cash collection)
const agentCreditMember = async (data) => {
    // Step 1 — Verify agent exists and has agent role
    const agent = await database_1.prisma.user.findUnique({
        where: { id: data.agentId }
    });
    if (!agent)
        throw new Error('Agent not found');
    if (agent.role !== 'AGENT' && agent.role !== 'ADMIN') {
        throw new Error('Unauthorized — only agents can credit member wallets');
    }
    // Step 2 — Find the member
    const member = await database_1.prisma.user.findUnique({
        where: { id: data.memberId },
        include: { wallet: true }
    });
    if (!member)
        throw new Error('Member not found');
    if (!member.wallet)
        throw new Error('Member wallet not found');
    if (member.wallet.isLocked)
        throw new Error('Member wallet is locked');
    if (data.amount <= 0)
        throw new Error('Amount must be greater than 0');
    const newBalance = member.wallet.balance + data.amount;
    // Step 3 — Credit member wallet and create transaction
    const [updatedWallet, transaction] = await database_1.prisma.$transaction([
        database_1.prisma.wallet.update({
            where: { userId: data.memberId },
            data: {
                balance: newBalance,
                totalSaved: member.wallet.totalSaved + data.amount
            }
        }),
        database_1.prisma.transaction.create({
            data: {
                walletId: member.wallet.id,
                type: 'CREDIT',
                amount: data.amount,
                balance: newBalance,
                description: `Agent collection by ${agent.fullName} — ${data.description}`,
                reference: `AGENT-${Date.now()}-${data.agentId.slice(0, 8)}`,
                status: 'SUCCESS'
            }
        })
    ]);
    return {
        agent: agent.fullName,
        member: member.fullName,
        amount: data.amount,
        newBalance,
        transaction
    };
};
exports.agentCreditMember = agentCreditMember;
// Get all members — for agent to see who they manage
const getAllMembers = async () => {
    const members = await database_1.prisma.user.findMany({
        where: { role: 'CONTRIBUTOR', isActive: true },
        include: { wallet: true },
        orderBy: { createdAt: 'desc' }
    });
    // Never return PINs
    return members.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        phone: m.phone,
        email: m.email,
        isVerified: m.isVerified,
        wallet: m.wallet
    }));
};
exports.getAllMembers = getAllMembers;
// Get agent collection summary
const getAgentSummary = async (agentId) => {
    const agent = await database_1.prisma.user.findUnique({
        where: { id: agentId }
    });
    if (!agent)
        throw new Error('Agent not found');
    // Get all transactions made by this agent
    const collections = await database_1.prisma.transaction.findMany({
        where: {
            description: { contains: `Agent collection by ${agent.fullName}` },
            type: 'CREDIT'
        },
        orderBy: { createdAt: 'desc' }
    });
    const totalCollected = collections.reduce((sum, t) => sum + t.amount, 0);
    return {
        agent: agent.fullName,
        totalCollections: collections.length,
        totalAmountCollected: totalCollected,
        recentCollections: collections.slice(0, 10)
    };
};
exports.getAgentSummary = getAgentSummary;
//# sourceMappingURL=agent.service.js.map