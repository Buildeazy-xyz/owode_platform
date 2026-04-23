"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const face_verification_service_1 = require("../services/face-verification.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const database_1 = require("../config/database");
const router = (0, express_1.Router)();
// POST /api/face/verify — verify face against government ID
router.post('/verify', auth_middleware_1.protect, async (req, res) => {
    try {
        const { selfieBase64, idType, idNumber } = req.body;
        if (!selfieBase64) {
            res.status(400).json({ success: false, message: 'Selfie image is required' });
            return;
        }
        // Get user BVN/NIN if not provided
        const user = await database_1.prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }
        const idTypeToUse = idType || (user.bvn ? 'BVN' : user.nin ? 'NIN' : null);
        const idNumberToUse = idNumber || user.bvn || user.nin;
        if (!idTypeToUse || !idNumberToUse) {
            res.status(400).json({
                success: false,
                message: 'Please submit your BVN or NIN first before face verification'
            });
            return;
        }
        // First do liveness check
        const liveness = await (0, face_verification_service_1.livenessCheck)({
            userId: req.user.userId,
            selfieBase64
        });
        if (!liveness.live) {
            res.status(400).json({
                success: false,
                message: 'Liveness check failed — please ensure you are a real person and try again'
            });
            return;
        }
        // Then verify face against ID
        const result = await (0, face_verification_service_1.verifyFace)({
            userId: req.user.userId,
            selfieBase64,
            idType: idTypeToUse,
            idNumber: idNumberToUse
        });
        res.status(200).json({ success: true, message: result.message, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/face/liveness — just check liveness
router.post('/liveness', auth_middleware_1.protect, async (req, res) => {
    try {
        const { selfieBase64 } = req.body;
        if (!selfieBase64) {
            res.status(400).json({ success: false, message: 'Image is required' });
            return;
        }
        const result = await (0, face_verification_service_1.livenessCheck)({ userId: req.user.userId, selfieBase64 });
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// GET /api/face/status — get face verification status
router.get('/status', auth_middleware_1.protect, async (req, res) => {
    try {
        const result = await (0, face_verification_service_1.getFaceVerificationStatus)(req.user.userId);
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=face-verification.routes.js.map