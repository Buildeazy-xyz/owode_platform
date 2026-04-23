"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKYCStatus = exports.verifyUser = exports.submitNIN = exports.submitBVN = void 0;
const database_1 = require("../config/database");
const notification_service_1 = require("./notification.service");
// Submit BVN for verification
const submitBVN = async (data) => {
    // BVN must be exactly 11 digits
    if (data.bvn.length !== 11 || isNaN(Number(data.bvn))) {
        throw new Error('BVN must be exactly 11 digits');
    }
    // Check if BVN already used by another user
    const existing = await database_1.prisma.user.findFirst({
        where: { bvn: data.bvn }
    });
    if (existing && existing.id !== data.userId) {
        throw new Error('BVN already linked to another account');
    }
    // Save BVN to user
    const user = await database_1.prisma.user.update({
        where: { id: data.userId },
        data: { bvn: data.bvn }
    });
    return {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        bvn: user.bvn,
        message: 'BVN submitted successfully — verification in progress'
    };
};
exports.submitBVN = submitBVN;
// For now we simulate a successful verification
const submitNIN = async (data) => {
    // NIN must be exactly 11 digits
    if (data.nin.length !== 11 || isNaN(Number(data.nin))) {
        throw new Error('NIN must be exactly 11 digits');
    }
    // Check if NIN already used by another user
    const existing = await database_1.prisma.user.findFirst({
        where: { nin: data.nin }
    });
    if (existing && existing.id !== data.userId) {
        throw new Error('NIN already linked to another account');
    }
    // Save NIN to user
    const user = await database_1.prisma.user.update({
        where: { id: data.userId },
        data: { nin: data.nin }
    });
    return {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        nin: user.nin,
        message: 'NIN submitted successfully — verification in progress'
    };
};
exports.submitNIN = submitNIN;
// Verify a user — called after BVN/NIN is confirmed
// Verify a user — called after BVN/NIN is confirmed
const verifyUser = async (userId) => {
    const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        throw new Error('User not found');
    if (!user.bvn && !user.nin) {
        throw new Error('User must submit BVN or NIN before verification');
    }
    const updatedUser = await database_1.prisma.user.update({
        where: { id: userId },
        data: { isVerified: true }
    });
    // Send notification
    await notification_service_1.notify.kycVerified({
        phone: updatedUser.phone,
        email: updatedUser.email,
        fullName: updatedUser.fullName
    });
    return {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        phone: updatedUser.phone,
        isVerified: updatedUser.isVerified,
        message: 'User verified successfully'
    };
};
exports.verifyUser = verifyUser;
// Get KYC status of a user
const getKYCStatus = async (userId) => {
    const user = await database_1.prisma.user.findUnique({
        where: { id: userId }
    });
    if (!user)
        throw new Error('User not found');
    return {
        id: user.id,
        fullName: user.fullName,
        isVerified: user.isVerified,
        hasBVN: !!user.bvn,
        hasNIN: !!user.nin,
        status: user.isVerified ? 'VERIFIED' : user.bvn || user.nin ? 'PENDING' : 'UNVERIFIED'
    };
};
exports.getKYCStatus = getKYCStatus;
//# sourceMappingURL=kyc.service.js.map