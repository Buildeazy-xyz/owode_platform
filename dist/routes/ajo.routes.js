"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ajo_service_1 = require("../services/ajo.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// POST /api/ajo/create — ADMIN ONLY
router.post('/create', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Only OWODE admins can create Ajo groups' });
            return;
        }
        const { name, amount, frequency, totalMembers } = req.body;
        if (!name || !amount || !frequency || !totalMembers) {
            res.status(400).json({ success: false, message: 'name, amount, frequency and totalMembers are required' });
            return;
        }
        if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(frequency)) {
            res.status(400).json({ success: false, message: 'frequency must be DAILY, WEEKLY or MONTHLY' });
            return;
        }
        const group = await (0, ajo_service_1.createAjoGroup)({
            name, amount, frequency, totalMembers,
            createdBy: req.user.userId,
            isAdmin: true
        });
        res.status(201).json({ success: true, message: 'Ajo group created successfully', data: group });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/ajo/join
router.post('/join', auth_middleware_1.protect, async (req, res) => {
    try {
        const { groupId } = req.body;
        if (!groupId) {
            res.status(400).json({ success: false, message: 'groupId is required' });
            return;
        }
        const result = await (0, ajo_service_1.joinAjoGroup)({ groupId, userId: req.user.userId });
        res.status(200).json({ success: true, message: result.message, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// GET /api/ajo/groups
router.get('/groups', auth_middleware_1.protect, async (req, res) => {
    try {
        const groups = await (0, ajo_service_1.getAllGroups)();
        res.status(200).json({ success: true, data: groups });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Something went wrong' });
    }
});
// GET /api/ajo/groups/:id
router.get('/groups/:id', auth_middleware_1.protect, async (req, res) => {
    try {
        const group = await (0, ajo_service_1.getGroupById)(req.params.id);
        res.status(200).json({ success: true, data: group });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/ajo/contribute
router.post('/contribute', auth_middleware_1.protect, async (req, res) => {
    try {
        const { groupId } = req.body;
        if (!groupId) {
            res.status(400).json({ success: false, message: 'groupId is required' });
            return;
        }
        const result = await (0, ajo_service_1.makeContribution)({ groupId, userId: req.user.userId });
        res.status(200).json({ success: true, message: 'Contribution successful', data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=ajo.routes.js.map