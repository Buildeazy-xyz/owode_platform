"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const trust_service_1 = require("../services/trust.service");
const guarantee_service_1 = require("../services/guarantee.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/trust/my-score
router.get('/my-score', auth_middleware_1.protect, async (req, res) => {
    try {
        const score = await (0, trust_service_1.calculateTrustScore)(req.user.userId);
        await (0, trust_service_1.updateTrustScore)(req.user.userId);
        res.status(200).json({
            success: true,
            data: {
                score,
                label: (0, trust_service_1.getTrustLabel)(score),
                color: (0, trust_service_1.getTrustColor)(score),
                breakdown: {
                    base: 50,
                    bvnBonus: '+10 for BVN',
                    ninBonus: '+10 for NIN',
                    verifiedBonus: '+10 for verification',
                    groupBonus: '+5 per completed group',
                    defaultPenalty: '-15 per default'
                }
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/trust/score/:userId (Admin only)
router.get('/score/:userId', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Admin only' });
            return;
        }
        const score = await (0, trust_service_1.calculateTrustScore)(req.params.userId);
        res.status(200).json({
            success: true,
            data: { score, label: (0, trust_service_1.getTrustLabel)(score), color: (0, trust_service_1.getTrustColor)(score) }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/trust/guarantee-pool (Admin only)
router.get('/guarantee-pool', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Admin only' });
            return;
        }
        const pool = await (0, guarantee_service_1.getGuaranteePoolStatus)();
        res.status(200).json({ success: true, data: pool });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=trust.routes.js.map