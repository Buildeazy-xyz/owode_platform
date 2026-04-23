export declare const getWalletBalance: (userId: string) => Promise<{
    transactions: {
        id: string;
        createdAt: Date;
        balance: number;
        walletId: string;
        type: import("@prisma/client").$Enums.TransactionType;
        amount: number;
        description: string;
        reference: string;
        status: import("@prisma/client").$Enums.TransactionStatus;
    }[];
} & {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    balance: number;
    totalSaved: number;
    totalPayout: number;
    isLocked: boolean;
    userId: string;
}>;
export declare const creditWallet: (userId: string, amount: number, description: string) => Promise<{
    wallet: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        balance: number;
        totalSaved: number;
        totalPayout: number;
        isLocked: boolean;
        userId: string;
    };
    transaction: {
        id: string;
        createdAt: Date;
        balance: number;
        walletId: string;
        type: import("@prisma/client").$Enums.TransactionType;
        amount: number;
        description: string;
        reference: string;
        status: import("@prisma/client").$Enums.TransactionStatus;
    };
}>;
export declare const debitWallet: (userId: string, amount: number, description: string) => Promise<{
    wallet: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        balance: number;
        totalSaved: number;
        totalPayout: number;
        isLocked: boolean;
        userId: string;
    };
    transaction: {
        id: string;
        createdAt: Date;
        balance: number;
        walletId: string;
        type: import("@prisma/client").$Enums.TransactionType;
        amount: number;
        description: string;
        reference: string;
        status: import("@prisma/client").$Enums.TransactionStatus;
    };
}>;
export declare const transferFunds: (senderId: string, recipientPhone: string, amount: number, description: string, transactionPin: string) => Promise<{
    success: boolean;
    amount: number;
    recipient: string;
    recipientPhone: string;
    newBalance: number;
    reference: string;
}>;
//# sourceMappingURL=wallet.service.d.ts.map