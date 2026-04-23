export declare const registerUser: (data: {
    fullName: string;
    phone: string;
    email?: string;
    password: string;
    role?: "CONTRIBUTOR" | "AGENT" | "ADMIN";
}) => Promise<{
    user: {
        id: string;
        fullName: string;
        phone: string;
        email: string | null;
        role: import("@prisma/client").$Enums.Role;
        isVerified: boolean;
        hasTransactionPin: boolean;
        wallet: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            balance: number;
            totalSaved: number;
            totalPayout: number;
            isLocked: boolean;
            userId: string;
        } | null;
    };
    token: string;
}>;
export declare const loginUser: (data: {
    phone: string;
    password: string;
}) => Promise<{
    user: {
        id: string;
        fullName: string;
        phone: string;
        email: string | null;
        role: import("@prisma/client").$Enums.Role;
        isVerified: boolean;
        hasTransactionPin: boolean;
        wallet: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            balance: number;
            totalSaved: number;
            totalPayout: number;
            isLocked: boolean;
            userId: string;
        } | null;
    };
    token: string;
}>;
export declare const setTransactionPin: (userId: string, transactionPin: string) => Promise<{
    message: string;
}>;
export declare const setAppPin: (userId: string, appPin: string) => Promise<{
    message: string;
}>;
export declare const verifyAppPin: (userId: string, appPin: string) => Promise<{
    valid: boolean;
}>;
export declare const verifyTransactionPin: (userId: string, transactionPin: string) => Promise<{
    valid: boolean;
}>;
//# sourceMappingURL=user.service.d.ts.map