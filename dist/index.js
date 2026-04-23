"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const wallet_routes_1 = __importDefault(require("./routes/wallet.routes"));
const ajo_routes_1 = __importDefault(require("./routes/ajo.routes"));
const agent_routes_1 = __importDefault(require("./routes/agent.routes"));
const kyc_routes_1 = __importDefault(require("./routes/kyc.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const guaranteed_ajo_routes_1 = __importDefault(require("./routes/guaranteed-ajo.routes"));
const trust_routes_1 = __importDefault(require("./routes/trust.routes"));
const face_verification_routes_1 = __importDefault(require("./routes/face-verification.routes"));
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: ['http://localhost:3001', 'http://localhost:3000', 'http://192.168.88.21:3001'],
    credentials: true
}));
app.use(express_1.default.json());
// Routes
app.use('/api/users', user_routes_1.default);
app.use('/api/wallet', wallet_routes_1.default);
app.use('/api/ajo', ajo_routes_1.default);
app.use('/api/agent', agent_routes_1.default);
app.use('/api/kyc', kyc_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/guaranteed-ajo', guaranteed_ajo_routes_1.default);
app.use('/api/trust', trust_routes_1.default);
app.use('/api/face', face_verification_routes_1.default);
dotenv_1.default.config();
// Health check
app.get('/', (req, res) => {
    res.json({
        message: '🚀 OWODE Alajo Platform API is running!',
        version: '2.0.0',
        status: 'healthy',
        features: [
            'User Auth',
            'Wallet Engine',
            'Standard Ajo',
            'Guaranteed Ajo',
            'Trust Score System',
            'Avatar Coverage',
            'Agent Service',
            'KYC Service',
            'Notifications'
        ]
    });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ OWODE Server running on port ${PORT}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map