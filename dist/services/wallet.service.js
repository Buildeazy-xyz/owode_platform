"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferFunds = exports.debitWallet = exports.creditWallet = exports.getWalletBalance = void 0;
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const notification_service_1 = require("./notification.service");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Get wallet balance
const getWalletBalance = async (userId) => {
    const wallet = await database_1.prisma.wallet.findUnique({
        where: { userId },
        include: {
            transactions: {
                orderBy: { createdAt: 'desc' },
                take: 10
            }
        }
    });
    if (!wallet)
        throw new Error('Wallet not found');
    return wallet;
};
exports.getWalletBalance = getWalletBalance;
// Credit wallet
const creditWallet = async (userId, amount, description) => {
    if (amount <= 0)
        throw new Error('Amount must be greater than 0');
    const wallet = await database_1.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet)
        throw new Error('Wallet not found');
    if (wallet.isLocked)
        throw new Error('Wallet is locked');
    const newBalance = wallet.balance + amount;
    const [updatedWallet, transaction] = await database_1.prisma.$transaction([
        database_1.prisma.wallet.update({
            where: { userId },
            data: { balance: newBalance, totalSaved: wallet.totalSaved + amount }
        }),
        database_1.prisma.transaction.create({
            data: {
                walletId: wallet.id,
                type: 'CREDIT',
                amount,
                balance: newBalance,
                description,
                reference: (0, uuid_1.v4)(),
                status: 'SUCCESS'
            }
        })
    ]);
    const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
        await notification_service_1.notify.walletCredited({
            phone: user.phone,
            email: user.email,
            amount,
            balance: newBalance,
            fullName: user.fullName
        });
    }
    return { wallet: updatedWallet, transaction };
};
exports.creditWallet = creditWallet;
// Debit wallet
const debitWallet = async (userId, amount, description) => {
    if (amount <= 0)
        throw new Error('Amount must be greater than 0');
    const wallet = await database_1.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet)
        throw new Error('Wallet not found');
    if (wallet.isLocked)
        throw new Error('Wallet is locked');
    if (wallet.balance < amount)
        throw new Error('Insufficient balance');
    const newBalance = wallet.balance - amount;
    const [updatedWallet, transaction] = await database_1.prisma.$transaction([
        database_1.prisma.wallet.update({
            where: { userId },
            data: { balance: newBalance, totalPayout: wallet.totalPayout + amount }
        }),
        database_1.prisma.transaction.create({
            data: {
                walletId: wallet.id,
                type: 'DEBIT',
                amount,
                balance: newBalance,
                description,
                reference: (0, uuid_1.v4)(),
                status: 'SUCCESS'
            }
        })
    ]);
    const user = await database_1.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
        await notification_service_1.notify.walletDebited({
            phone: user.phone,
            email: user.email,
            amount,
            balance: newBalance,
            fullName: user.fullName
        });
    }
    return { wallet: updatedWallet, transaction };
};
exports.debitWallet = debitWallet;
const transferFunds = async (senderId, recipientPhone, amount, description, transactionPin) => {
    if (amount <= 0)
        throw new Error('Amount must be greater than 0');
    if (amount < 100)
        throw new Error('Minimum transfer amount is ₦100');
    const senderUser = await database_1.prisma.user.findUnique({ where: { id: senderId } });
    if (!senderUser)
        throw new Error('Sender not found');
    // Allow biometric auth bypass OR verify PIN
    if (transactionPin !== 'BIOMETRIC_AUTH') {
        if (!senderUser.transactionPin)
            throw new Error('Please set a transaction PIN first');
        const isPinValid = await bcryptjs_1.default.compare(transactionPin, senderUser.transactionPin);
        if (!isPinValid)
            throw new Error('Invalid transaction PIN');
    }
    // Rest of transfer logic stays same...
    // Find sender wallet
    const senderWallet = await database_1.prisma.wallet.findUnique({ where: { userId: senderId } });
    if (!senderWallet)
        throw new Error('Sender wallet not found');
    if (senderWallet.isLocked)
        throw new Error('Your wallet is locked');
    if (senderWallet.balance < amount)
        throw new Error('Insufficient balance');
    // Find recipient
    const recipient = await database_1.prisma.user.findUnique({
        where: { phone: recipientPhone },
        include: { wallet: true }
    });
    if (!recipient)
        throw new Error('Recipient not found — check the phone number');
    if (!recipient.wallet)
        throw new Error('Recipient wallet not found');
    if (recipient.wallet.isLocked)
        throw new Error('Recipient wallet is locked');
    if (recipient.id === senderId)
        throw new Error('You cannot transfer to yourself');
    const senderNewBalance = senderWallet.balance - amount;
    const recipientNewBalance = recipient.wallet.balance + amount;
    const reference = `TRF-${Date.now()}-${senderId.slice(0, 8)}`;
    await database_1.prisma.$transaction([
        database_1.prisma.wallet.update({
            where: { userId: senderId },
            data: { balance: senderNewBalance, totalPayout: senderWallet.totalPayout + amount }
        }),
        database_1.prisma.transaction.create({
            data: {
                walletId: senderWallet.id,
                type: 'DEBIT',
                amount,
                balance: senderNewBalance,
                description: `Transfer to ${recipient.fullName} — ${description}`,
                reference: `${reference}-OUT`,
                status: 'SUCCESS'
            }
        }),
        database_1.prisma.wallet.update({
            where: { userId: recipient.id },
            data: { balance: recipientNewBalance, totalSaved: recipient.wallet.totalSaved + amount }
        }),
        database_1.prisma.transaction.create({
            data: {
                walletId: recipient.wallet.id,
                type: 'CREDIT',
                amount,
                balance: recipientNewBalance,
                description: `Transfer from ${senderUser.fullName} — ${description}`,
                reference: `${reference}-IN`,
                status: 'SUCCESS'
            }
        })
    ]);
    await notification_service_1.notify.transactionAlert({
        phone: recipient.phone,
        email: recipient.email,
        fullName: recipient.fullName,
        type: 'CREDIT',
        amount,
        sender: senderUser.fullName
    });
    await notification_service_1.notify.walletDebited({
        phone: senderUser.phone,
        email: senderUser.email,
        amount,
        balance: senderNewBalance,
        fullName: senderUser.fullName
    });
    await notification_service_1.notify.walletCredited({
        phone: recipient.phone,
        email: recipient.email,
        amount,
        balance: recipientNewBalance,
        fullName: recipient.fullName
    });
    return {
        success: true,
        amount,
        recipient: recipient.fullName,
        recipientPhone,
        newBalance: senderNewBalance,
        reference
    };
};
exports.transferFunds = transferFunds;
//# sourceMappingURL=wallet.service.js.map