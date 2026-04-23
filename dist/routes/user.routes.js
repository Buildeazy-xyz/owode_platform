"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_service_1 = require("../services/user.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    try {
        const { fullName, phone, email, password } = req.body;
        if (!fullName || !phone || !password) {
            res.status(400).json({ success: false, message: 'fullName, phone and password are required' });
            return;
        }
        const result = await (0, user_service_1.registerUser)({ fullName, phone, email, password });
        res.status(201).json({ success: true, message: 'User registered successfully', data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) {
            res.status(400).json({ success: false, message: 'phone and password are required' });
            return;
        }
        const result = await (0, user_service_1.loginUser)({ phone, password });
        res.status(200).json({ success: true, message: 'Login successful', data: result });
    }
    catch (error) {
        res.status(401).json({ success: false, message: error.message });
    }
});
router.post('/transaction-pin/set', auth_middleware_1.protect, async (req, res) => {
    try {
        const { transactionPin } = req.body;
        if (!transactionPin) {
            res.status(400).json({ success: false, message: 'transactionPin is required' });
            return;
        }
        const result = await (0, user_service_1.setTransactionPin)(req.user.userId, transactionPin);
        res.status(200).json({ success: true, message: result.message });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
router.post('/app-pin/set', auth_middleware_1.protect, async (req, res) => {
    try {
        const { appPin } = req.body;
        if (!appPin) {
            res.status(400).json({ success: false, message: 'appPin is required' });
            return;
        }
        const result = await (0, user_service_1.setAppPin)(req.user.userId, appPin);
        res.status(200).json({ success: true, message: result.message });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
router.post('/app-pin/verify', auth_middleware_1.protect, async (req, res) => {
    try {
        const { appPin } = req.body;
        if (!appPin) {
            res.status(400).json({ success: false, message: 'appPin is required' });
            return;
        }
        const result = await (0, user_service_1.verifyAppPin)(req.user.userId, appPin);
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        res.status(401).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=user.routes.js.map