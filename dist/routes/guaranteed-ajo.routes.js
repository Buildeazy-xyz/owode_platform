"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const guaranteed_ajo_service_1 = require("../services/guaranteed-ajo.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// POST /api/guaranteed-ajo/create
router.post('/create', auth_middleware_1.protect, async (req, res) => {
    try {
        const { name, amount, frequency, totalMembers } = req.body;
        if (!name || !amount || !frequency || !totalMembers) {
            res.status(400).json({ success: false, message: 'name, amount, frequency and totalMembers are required' });
            return;
        }
        if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(frequency)) {
            res.status(400).json({ success: false, message: 'frequency must be DAILY, WEEKLY or MONTHLY' });
            return;
        }
        const group = await (0, guaranteed_ajo_service_1.createGuaranteedGroup)({
            name, amount, frequency, totalMembers, createdBy: req.user.userId
        });
        res.status(201).json({ success: true, message: 'Guaranteed Ajo group created!', data: group });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/guaranteed-ajo/join
router.post('/join', auth_middleware_1.protect, async (req, res) => {
    try {
        const { groupId } = req.body;
        if (!groupId) {
            res.status(400).json({ success: false, message: 'groupId is required' });
            return;
        }
        const result = await (0, guaranteed_ajo_service_1.joinGuaranteedGroup)({ groupId, userId: req.user.userId });
        res.status(200).json({ success: true, message: 'Successfully joined Guaranteed Ajo group!', data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/guaranteed-ajo/contribute
router.post('/contribute', auth_middleware_1.protect, async (req, res) => {
    try {
        const { groupId, transactionPin } = req.body;
        if (!groupId || !transactionPin) {
            res.status(400).json({ success: false, message: 'groupId and transactionPin are required' });
            return;
        }
        const result = await (0, guaranteed_ajo_service_1.makeGuaranteedContribution)({
            groupId, userId: req.user.userId, transactionPin
        });
        res.status(200).json({ success: true, message: 'Contribution successful!', data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// GET /api/guaranteed-ajo/groups
router.get('/groups', auth_middleware_1.protect, async (req, res) => {
    try {
        const groups = await (0, guaranteed_ajo_service_1.getAllGuaranteedGroups)();
        res.status(200).json({ success: true, data: groups });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/guaranteed-ajo/groups/:id
router.get('/groups/:id', auth_middleware_1.protect, async (req, res) => {
    try {
        const group = await (0, guaranteed_ajo_service_1.getGuaranteedGroupDetails)(req.params.id);
        res.status(200).json({ success: true, data: group });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/guaranteed-ajo/check-defaults/:groupId (Admin only)
router.post('/check-defaults/:groupId', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Admin only' });
            return;
        }
        const results = await (0, guaranteed_ajo_service_1.checkAndHandleDefaults)(req.params.groupId);
        res.status(200).json({ success: true, data: results });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
const trust_service_1 = require("../services/trust.service");
// GET /api/guaranteed-ajo/risk/:groupId
router.get('/risk/:groupId', auth_middleware_1.protect, async (req, res) => {
    try {
        const assessment = await (0, trust_service_1.assessGroupRisk)(req.params.groupId);
        res.status(200).json({ success: true, data: assessment });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=guaranteed-ajo.routes.js.map