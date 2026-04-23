"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const wallet_service_1 = require("../services/wallet.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// GET /api/wallet/balance
router.get('/balance', auth_middleware_1.protect, async (req, res) => {
    try {
        const wallet = await (0, wallet_service_1.getWalletBalance)(req.user.userId);
        res.status(200).json({ success: true, data: wallet });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/wallet/credit
router.post('/credit', auth_middleware_1.protect, async (req, res) => {
    try {
        const { amount, description } = req.body;
        if (!amount || !description) {
            res.status(400).json({ success: false, message: 'amount and description are required' });
            return;
        }
        const result = await (0, wallet_service_1.creditWallet)(req.user.userId, amount, description);
        res.status(200).json({ success: true, message: 'Wallet credited', data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/wallet/debit
router.post('/debit', auth_middleware_1.protect, async (req, res) => {
    try {
        const { amount, description } = req.body;
        if (!amount || !description) {
            res.status(400).json({ success: false, message: 'amount and description are required' });
            return;
        }
        const result = await (0, wallet_service_1.debitWallet)(req.user.userId, amount, description);
        res.status(200).json({ success: true, message: 'Wallet debited', data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
// POST /api/wallet/transfer
router.post('/transfer', auth_middleware_1.protect, async (req, res) => {
    try {
        const { recipientPhone, amount, description, transactionPin } = req.body;
        if (!recipientPhone || !amount || !description || !transactionPin) {
            res.status(400).json({ success: false, message: 'recipientPhone, amount, description and transactionPin are required' });
            return;
        }
        const result = await (0, wallet_service_1.transferFunds)(req.user.userId, recipientPhone, amount, description, transactionPin);
        res.status(200).json({ success: true, message: `₦${amount.toLocaleString()} sent successfully!`, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=wallet.routes.js.map