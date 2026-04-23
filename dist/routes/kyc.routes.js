"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const kyc_service_1 = require("../services/kyc.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// POST /api/kyc/bvn — submit BVN
router.post('/bvn', auth_middleware_1.protect, async (req, res) => {
    try {
        const { bvn } = req.body;
        if (!bvn) {
            res.status(400).json({ success: false, message: 'BVN is required' });
            return;
        }
        const result = await (0, kyc_service_1.submitBVN)({ userId: req.user.userId, bvn });
        res.status(200).json({ success: true, message: result.message, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/kyc/nin — submit NIN
router.post('/nin', auth_middleware_1.protect, async (req, res) => {
    try {
        const { nin } = req.body;
        if (!nin) {
            res.status(400).json({ success: false, message: 'NIN is required' });
            return;
        }
        const result = await (0, kyc_service_1.submitNIN)({ userId: req.user.userId, nin });
        res.status(200).json({ success: true, message: result.message, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/kyc/verify/:userId — verify a user (admin only)
router.post('/verify/:userId', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Only admins can verify users' });
            return;
        }
        const result = await (0, kyc_service_1.verifyUser)(req.params.userId);
        res.status(200).json({ success: true, message: result.message, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// GET /api/kyc/status — get my KYC status
router.get('/status', auth_middleware_1.protect, async (req, res) => {
    try {
        const result = await (0, kyc_service_1.getKYCStatus)(req.user.userId);
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=kyc.routes.js.map