"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const recovery_service_1 = require("../services/recovery.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// POST /api/recovery/run — trigger recovery checks (Admin)
router.post('/run', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Admin only' });
            return;
        }
        const results = await (0, recovery_service_1.runRecoveryChecks)();
        res.status(200).json({ success: true, data: results });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/recovery/defaults — all defaults (Admin)
router.get('/defaults', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Admin only' });
            return;
        }
        const defaults = await (0, recovery_service_1.getAllDefaults)();
        res.status(200).json({ success: true, data: defaults });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// GET /api/recovery/my-defaults — user's own defaults
router.get('/my-defaults', auth_middleware_1.protect, async (req, res) => {
    try {
        const defaults = await (0, recovery_service_1.getUserDefaults)(req.user.userId);
        res.status(200).json({ success: true, data: defaults });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// POST /api/recovery/write-off/:id — write off a default (Admin)
router.post('/write-off/:id', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Admin only' });
            return;
        }
        const record = await (0, recovery_service_1.writeOffDefault)(req.params.id);
        res.status(200).json({ success: true, message: 'Default written off', data: record });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=recovery.routes.js.map