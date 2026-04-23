export declare const createAjoGroup: (data: {
    name: string;
    amount: number;
    frequency: "DAILY" | "WEEKLY" | "MONTHLY";
    totalMembers: number;
    createdBy: string;
    isAdmin: boolean;
}) => Promise<{
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
export declare const joinAjoGroup: (data: {
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
    };
    position: number;
    spotsLeft: number;
    groupFull: boolean;
    message: string;
}>;
export declare const getAllGroups: () => Promise<({
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
})[]>;
export declare const getGroupById: (groupId: string) => Promise<{
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
export declare const makeContribution: (data: {
    groupId: string;
    userId: string;
}) => Promise<{
    contributed: boolean;
    allPaid: boolean;
    payoutSent: boolean;
    payoutTo: string;
    payoutAmount: number;
    nextCycle: number;
    paidCount?: undefined;
    remainingCount?: undefined;
} | {
    contributed: boolean;
    allPaid: boolean;
    payoutSent: boolean;
    paidCount: number;
    remainingCount: number;
    payoutTo?: undefined;
    payoutAmount?: undefined;
    nextCycle?: undefined;
}>;
//# sourceMappingURL=ajo.service.d.ts.map