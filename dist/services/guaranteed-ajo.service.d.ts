export declare const createGuaranteedGroup: (data: {
    name: string;
    amount: number;
    frequency: "DAILY" | "WEEKLY" | "MONTHLY";
    totalMembers: number;
    createdBy: string;
}) => Promise<{
    members: {
        id: string;
        userId: string;
        position: number;
        hasPaid: boolean;
        isAvatar: boolean;
        payoutReceived: boolean;
        joinedAt: Date;
        groupId: string;
    }[];
} & {
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
}>;
export declare const joinGuaranteedGroup: (data: {
    groupId: string;
    userId: string;
}) => Promise<{
    member: {
        id: string;
        userId: string;
        position: number;
        hasPaid: boolean;
        isAvatar: boolean;
        payoutReceived: boolean;
        joinedAt: Date;
        groupId: string;
    };
    group: {
        members: ({
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
        } & {
            id: string;
            userId: string;
            position: number;
            hasPaid: boolean;
            isAvatar: boolean;
            payoutReceived: boolean;
            joinedAt: Date;
            groupId: string;
        })[];
    } & {
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
    position: number;
    trustScore: number;
}>;
export declare const makeGuaranteedContribution: (data: {
    groupId: string;
    userId: string;
    transactionPin: string;
}) => Promise<{
    contributed: boolean;
    allPaid: boolean;
    payoutSent: boolean;
    payoutTo: any;
    payoutAmount: number;
    nextCycle: any;
} | {
    contributed: boolean;
    allPaid: boolean;
    payoutSent: boolean;
    amount: number;
    guaranteeFee: number;
    paidCount: number;
    remainingCount: number;
    newBalance: number;
}>;
export declare const checkAndHandleDefaults: (groupId: string) => Promise<({
    userId: string;
    covered: boolean;
    defaultRecord: {
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
    };
    error?: undefined;
} | {
    userId: string;
    covered: boolean;
    error: any;
    defaultRecord?: undefined;
})[] | undefined>;
export declare const getGuaranteedGroupDetails: (groupId: string) => Promise<{
    members: {
        id: any;
        position: any;
        isAvatar: any;
        hasPaid: any;
        payoutReceived: any;
        user: {
            id: any;
            fullName: any;
            phone: any;
            trustScore: any;
            isVerified: any;
        };
    }[];
    defaultRecords: ({
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
    })[];
    cycles: {
        id: string;
        status: import("@prisma/client").$Enums.CycleStatus;
        groupId: string;
        cycleNumber: number;
        avatarCovered: boolean;
        recipientId: string;
        totalAmount: number;
        avatarAmount: number;
        startedAt: Date;
        completedAt: Date | null;
    }[];
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
}>;
export declare const getAllGuaranteedGroups: () => Promise<({
    members: ({
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
    } & {
        id: string;
        userId: string;
        position: number;
        hasPaid: boolean;
        isAvatar: boolean;
        payoutReceived: boolean;
        joinedAt: Date;
        groupId: string;
    })[];
} & {
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
})[]>;
//# sourceMappingURL=guaranteed-ajo.service.d.ts.map