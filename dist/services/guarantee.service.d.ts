export declare const collectGuaranteeFee: (walletId: string, fee: number, groupId: string) => Promise<void>;
export declare const avatarCoverDefault: (groupId: string, defaulterId: string, amount: number, cycleNumber: number) => Promise<{
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
export declare const attemptSoftRecovery: (defaultRecordId: string) => Promise<{
    recovered: boolean;
    amount: number;
}>;
export declare const escalateToHardRecovery: (defaultRecordId: string) => Promise<{
    escalated: boolean;
}>;
export declare const getGuaranteePoolStatus: () => Promise<{
    activeDefaults: number;
    id?: string | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    totalBalance?: number | undefined;
    totalCollected?: number | undefined;
    totalPaidOut?: number | undefined;
}>;
//# sourceMappingURL=guarantee.service.d.ts.map