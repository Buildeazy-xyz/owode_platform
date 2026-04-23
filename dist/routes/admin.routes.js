"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Middleware — admin only
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        res.status(403).json({ success: false, message: 'Admin access required' });
        return;
    }
    next();
};
// GET /api/admin/stats — platform overview
router.get('/stats', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        const [totalUsers, totalAgents, totalGroups, totalTransactions, verifiedUsers, activeGroups, guaranteedGroups, totalDefaults, activeDefaults] = await Promise.all([
            database_1.prisma.user.count({ where: { role: 'CONTRIBUTOR' } }),
            database_1.prisma.user.count({ where: { role: 'AGENT' } }),
            database_1.prisma.ajoGroup.count(),
            database_1.prisma.transaction.count(),
            database_1.prisma.user.count({ where: { isVerified: true } }),
            database_1.prisma.ajoGroup.count({ where: { isActive: true } }),
            database_1.prisma.ajoGroup.count({ where: { isGuaranteed: true } }),
            database_1.prisma.defaultRecord.count(),
            database_1.prisma.defaultRecord.count({ where: { recoveryStatus: { in: ['PENDING', 'SOFT_RECOVERY', 'HARD_RECOVERY'] } } })
        ]);
        // Total money in platform
        const wallets = await database_1.prisma.wallet.aggregate({
            _sum: { balance: true, totalSaved: true }
        });
        // Recent transactions
        const recentTransactions = await database_1.prisma.transaction.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { wallet: { include: { user: true } } }
        });
        // Daily transaction volume for last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dailyVolume = await database_1.prisma.transaction.groupBy({
            by: ['createdAt'],
            where: { createdAt: { gte: sevenDaysAgo }, status: 'SUCCESS' },
            _sum: { amount: true },
            _count: true
        });
        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalAgents,
                totalGroups,
                totalTransactions,
                verifiedUsers,
                activeGroups,
                totalBalance: wallets._sum.balance || 0,
                totalSaved: wallets._sum.totalSaved || 0,
                recentTransactions,
                dailyVolume
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/admin/users
router.get('/users', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        const users = await database_1.prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            include: { wallet: true }
        });
        const safeUsers = users.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            phone: u.phone,
            email: u.email,
            role: u.role,
            isVerified: u.isVerified,
            isActive: u.isActive,
            trustScore: u.trustScore,
            createdAt: u.createdAt,
            wallet: u.wallet
        }));
        res.status(200).json({ success: true, data: safeUsers });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/admin/transactions
router.get('/transactions', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        const transactions = await database_1.prisma.transaction.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: { wallet: { include: { user: true } } }
        });
        res.status(200).json({ success: true, data: transactions });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/admin/ajo-groups
router.get('/ajo-groups', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        const groups = await database_1.prisma.ajoGroup.findMany({
            orderBy: { createdAt: 'desc' },
            include: { members: true }
        });
        res.status(200).json({ success: true, data: groups });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// POST /api/admin/ajo/create — Admin creates Ajo group
router.post('/ajo/create', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        const { name, amount, frequency, totalMembers } = req.body;
        if (!name || !amount || !frequency || !totalMembers) {
            res.status(400).json({ success: false, message: 'All fields required' });
            return;
        }
        if (totalMembers < 6 || totalMembers > 12) {
            res.status(400).json({ success: false, message: 'Members must be between 6 and 12' });
            return;
        }
        const group = await database_1.prisma.ajoGroup.create({
            data: {
                name, amount, frequency, totalMembers,
                currentCycle: 0, isActive: true,
                isGuaranteed: false,
                createdBy: req.user.userId
            }
        });
        res.status(201).json({ success: true, message: 'Ajo group created!', data: group });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
router.delete('/ajo/:id', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        await database_1.prisma.ajoMember.deleteMany({ where: { groupId: req.params.id } });
        await database_1.prisma.ajoGroup.delete({ where: { id: req.params.id } });
        res.status(200).json({ success: true, message: 'Group deleted' });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// GET /api/admin/security-log
router.get('/security-log', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        // Get recent login activities from transactions as proxy
        const recentActivity = await database_1.prisma.user.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 20,
            select: {
                id: true,
                fullName: true,
                phone: true,
                isVerified: true,
                trustScore: true,
                updatedAt: true,
                role: true
            }
        });
        res.status(200).json({ success: true, data: recentActivity });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/admin/agents
router.get('/agents', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        const agents = await database_1.prisma.user.findMany({
            where: { role: 'AGENT' },
            include: { wallet: true }
        });
        res.status(200).json({ success: true, data: agents });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// POST /api/admin/wallet/lock/:userId
router.post('/wallet/lock/:userId', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        await database_1.prisma.wallet.update({
            where: { userId: req.params.userId },
            data: { isLocked: true }
        });
        res.status(200).json({ success: true, message: 'Wallet locked successfully' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// POST /api/admin/wallet/unlock/:userId
router.post('/wallet/unlock/:userId', auth_middleware_1.protect, adminOnly, async (req, res) => {
    try {
        await database_1.prisma.wallet.update({
            where: { userId: req.params.userId },
            data: { isLocked: false }
        });
        res.status(200).json({ success: true, message: 'Wallet unlocked successfully' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map