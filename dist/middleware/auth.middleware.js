"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const protect = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'owode_secret');
        // Always fetch fresh role from database
        const user = await database_1.prisma.user.findUnique({
            where: { id: decoded.userId }
        });
        if (!user) {
            res.status(401).json({ success: false, message: 'User not found' });
            return;
        }
        req.user = { userId: user.id, role: user.role };
        next();
    }
    catch {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};
exports.protect = protect;
//# sourceMappingURL=auth.middleware.js.map