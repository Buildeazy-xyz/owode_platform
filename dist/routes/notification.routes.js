"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_service_1 = require("../services/notification.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// POST /api/notifications/sms — send a test SMS (admin only)
router.post('/sms', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { to, message } = req.body;
        if (!to || !message) {
            res.status(400).json({ success: false, message: 'to and message are required' });
            return;
        }
        const result = await (0, notification_service_1.sendSMS)({ to, message });
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// POST /api/notifications/email — send a test email (admin only)
router.post('/email', auth_middleware_1.protect, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            res.status(403).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const { to, subject, message } = req.body;
        if (!to || !subject || !message) {
            res.status(400).json({ success: false, message: 'to, subject and message are required' });
            return;
        }
        const result = await (0, notification_service_1.sendEmail)({ to, subject, message });
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=notification.routes.js.map