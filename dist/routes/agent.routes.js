"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agent_service_1 = require("../services/agent.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// POST /api/agent/assign — assign agent role to a user (admin only)
router.post('/assign', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Only admins can assign agent roles' });
            return;
        }
        const { userId } = req.body;
        if (!userId) {
            res.status(400).json({ success: false, message: 'userId is required' });
            return;
        }
        const user = await (0, agent_service_1.assignAgentRole)(userId);
        res.status(200).json({
            success: true,
            message: 'Agent role assigned successfully',
            data: user
        });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/agent/collect — agent credits a member wallet
router.post('/collect', auth_middleware_1.protect, async (req, res) => {
    try {
        const { memberId, amount, description } = req.body;
        if (!memberId || !amount || !description) {
            res.status(400).json({
                success: false,
                message: 'memberId, amount and description are required'
            });
            return;
        }
        const result = await (0, agent_service_1.agentCreditMember)({
            agentId: req.user.userId,
            memberId,
            amount,
            description
        });
        res.status(200).json({
            success: true,
            message: 'Member wallet credited successfully',
            data: result
        });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// GET /api/agent/members — get all contributors
router.get('/members', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'AGENT' && req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const members = await (0, agent_service_1.getAllMembers)();
        res.status(200).json({ success: true, data: members });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
});
// GET /api/agent/summary — get agent collection summary
router.get('/summary', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'AGENT' && req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const summary = await (0, agent_service_1.getAgentSummary)(req.user.userId);
        res.status(200).json({ success: true, data: summary });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=agent.routes.js.map