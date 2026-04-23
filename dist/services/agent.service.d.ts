export declare const assignAgentRole: (userId: string) => Promise<{
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    role: import("@prisma/client").$Enums.Role;
    isVerified: boolean;
    isActive: boolean;
    createdAt: Date;
}>;
export declare const agentCreditMember: (data: {
    agentId: string;
    memberId: string;
    amount: number;
    description: string;
}) => Promise<{
    agent: string;
    member: string;
    amount: number;
    newBalance: number;
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
export declare const getAllMembers: () => Promise<{
    id: any;
    fullName: any;
    phone: any;
    email: any;
    isVerified: any;
    wallet: any;
}[]>;
export declare const getAgentSummary: (agentId: string) => Promise<{
    agent: string;
    totalCollections: number;
    totalAmountCollected: number;
    recentCollections: {
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
}>;
//# sourceMappingURL=agent.service.d.ts.map