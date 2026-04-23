export declare const runRecoveryChecks: () => Promise<{
    id: string;
    status: string;
    daysSinceDefault: number;
}[]>;
export declare const getAllDefaults: () => Promise<({
    user: {
        id: string;
        fullName: string;
        phone: string;
        email: string | null;
        bvn: string | null;
        nin: string | null;
        password: string | null;
        pin: string;
        transactionPin: string;
        appPin: string | null;
        trustScore: number;
        role: import("@prisma/client").$Enums.Role;
        isVerified: boolean;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    };
    group: {
        id: string;
        isActive: boolean;
        createdAt: Date;
        name: string;
        amount: number;
        frequency: import("@prisma/client").$Enums.Frequency;
        totalMembers: number;
        currentCycle: number;
        isGuaranteed: boolean;
        guaranteeFee: number;
        guaranteePoolBalance: number;
        avatarCoveredCount: number;
        maxAvatarCoverage: number;
        createdBy: string;
        startDate: Date | null;
        nextPayoutDate: Date | null;
    };
} & {
    id: string;
    createdAt: Date;
    userId: string;
    groupId: string;
    cycleNumber: number;
    amountOwed: number;
    penaltyAmount: number;
    avatarCovered: boolean;
    recoveryStatus: import("@prisma/client").$Enums.RecoveryStatus;
    gracePeriodEnd: Date;
    recoveredAt: Date | null;
})[]>;
export declare const getUserDefaults: (userId: string) => Promise<({
    group: {
        id: string;
        isActive: boolean;
        createdAt: Date;
        name: string;
        amount: number;
        frequency: import("@prisma/client").$Enums.Frequency;
        totalMembers: number;
        currentCycle: number;
        isGuaranteed: boolean;
        guaranteeFee: number;
        guaranteePoolBalance: number;
        avatarCoveredCount: number;
        maxAvatarCoverage: number;
        createdBy: string;
        startDate: Date | null;
        nextPayoutDate: Date | null;
    };
} & {
    id: string;
    createdAt: Date;
    userId: string;
    groupId: string;
    cycleNumber: number;
    amountOwed: number;
    penaltyAmount: number;
    avatarCovered: boolean;
    recoveryStatus: import("@prisma/client").$Enums.RecoveryStatus;
    gracePeriodEnd: Date;
    recoveredAt: Date | null;
})[]>;
export declare const writeOffDefault: (defaultId: string) => Promise<{
    id: string;
    createdAt: Date;
    userId: string;
    groupId: string;
    cycleNumber: number;
    amountOwed: number;
    penaltyAmount: number;
    avatarCovered: boolean;
    recoveryStatus: import("@prisma/client").$Enums.RecoveryStatus;
    gracePeriodEnd: Date;
    recoveredAt: Date | null;
}>;
//# sourceMappingURL=recovery.service.d.ts.map