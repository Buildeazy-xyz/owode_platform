"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTransactionPin = exports.verifyAppPin = exports.setAppPin = exports.setTransactionPin = exports.loginUser = exports.registerUser = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const registerUser = async (data) => {
    const existingUser = await database_1.prisma.user.findUnique({ where: { phone: data.phone } });
    if (existingUser)
        throw new Error('Phone number already registered');
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9]).{6,}$/;
    if (!passwordRegex.test(data.password)) {
        throw new Error('Password must be at least 6 characters with letters and numbers');
    }
    const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
    const user = await database_1.prisma.user.create({
        data: {
            fullName: data.fullName,
            phone: data.phone,
            email: data.email,
            password: hashedPassword,
            pin: '',
            transactionPin: '',
            role: data.role || 'CONTRIBUTOR',
            wallet: { create: { balance: 0, totalSaved: 0, totalPayout: 0 } }
        },
        include: { wallet: true }
    });
    const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'owode_secret', { expiresIn: '7d' });
    return {
        user: {
            id: user.id,
            fullName: user.fullName,
            phone: user.phone,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            hasTransactionPin: false,
            wallet: user.wallet
        },
        token
    };
};
exports.registerUser = registerUser;
const loginUser = async (data) => {
    const user = await database_1.prisma.user.findUnique({
        where: { phone: data.phone },
        include: { wallet: true }
    });
    if (!user)
        throw new Error('Invalid phone or password');
    if (!user.isActive)
        throw new Error('Account is deactivated');
    if (!user.password)
        throw new Error('Please set a password first');
    const isPasswordValid = await bcryptjs_1.default.compare(data.password, user.password);
    if (!isPasswordValid)
        throw new Error('Invalid phone or password');
    const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'owode_secret', { expiresIn: '7d' });
    return {
        user: {
            id: user.id,
            fullName: user.fullName,
            phone: user.phone,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            hasTransactionPin: user.transactionPin !== '',
            wallet: user.wallet
        },
        token
    };
};
exports.loginUser = loginUser;
const setTransactionPin = async (userId, transactionPin) => {
    if (transactionPin.length !== 4 || isNaN(Number(transactionPin))) {
        throw new Error('Transaction PIN must be exactly 4 digits');
    }
    const hashedPin = await bcryptjs_1.default.hash(transactionPin, 10);
    await database_1.prisma.user.update({
        where: { id: userId },
        data: { transactionPin: hashedPin }
    });
    return { message: 'Transaction PIN set successfully' };
};
exports.setTransactionPin = setTransactionPin;
const setAppPin = async (userId, appPin) => {
    if (appPin.length !== 6 || isNaN(Number(appPin))) {
        throw new Error('App PIN must be exactly 6 digits');
    }
    const hashedAppPin = await bcryptjs_1.default.hash(appPin, 10);
    await database_1.prisma.user.update({ where: { id: userId }, data: { appPin: hashedAppPin } });
    return { message: 'App PIN set successfully' };
};
exports.setAppPin = setAppPin;
const verifyAppPin = async (userId, appPin) => {
    const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.appPin)
        throw new Error('App PIN not set');
    const isValid = await bcryptjs_1.default.compare(appPin, user.appPin);
    if (!isValid)
        throw new Error('Invalid app PIN');
    return { valid: true };
};
exports.verifyAppPin = verifyAppPin;
const verifyTransactionPin = async (userId, transactionPin) => {
    const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        throw new Error('User not found');
    if (!user.transactionPin)
        throw new Error('Transaction PIN not set');
    const isValid = await bcryptjs_1.default.compare(transactionPin, user.transactionPin);
    if (!isValid)
        throw new Error('Invalid transaction PIN');
    return { valid: true };
};
exports.verifyTransactionPin = verifyTransactionPin;
//# sourceMappingURL=user.service.js.map