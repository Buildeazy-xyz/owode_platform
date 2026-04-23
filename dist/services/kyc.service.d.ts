export declare const submitBVN: (data: {
    userId: string;
    bvn: string;
}) => Promise<{
    id: string;
    fullName: string;
    phone: string;
    bvn: string | null;
    message: string;
}>;
export declare const submitNIN: (data: {
    userId: string;
    nin: string;
}) => Promise<{
    id: string;
    fullName: string;
    phone: string;
    nin: string | null;
    message: string;
}>;
export declare const verifyUser: (userId: string) => Promise<{
    id: string;
    fullName: string;
    phone: string;
    isVerified: boolean;
    message: string;
}>;
export declare const getKYCStatus: (userId: string) => Promise<{
    id: string;
    fullName: string;
    isVerified: boolean;
    hasBVN: boolean;
    hasNIN: boolean;
    status: string;
}>;
//# sourceMappingURL=kyc.service.d.ts.map