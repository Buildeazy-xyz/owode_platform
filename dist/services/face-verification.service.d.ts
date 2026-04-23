export declare const verifyFace: (data: {
    userId: string;
    selfieBase64: string;
    idType: "BVN" | "NIN";
    idNumber: string;
}) => Promise<{
    verified: boolean;
    confidence: number;
    status: string;
    message: string;
}>;
export declare const livenessCheck: (data: {
    userId: string;
    videoBase64?: string;
    selfieBase64: string;
}) => Promise<{
    live: boolean;
    confidence: any;
    status: string;
}>;
export declare const getFaceVerificationStatus: (userId: string) => Promise<{
    isFaceVerified: boolean;
    hasBVN: boolean;
    hasNIN: boolean;
    trustScore: number;
    canVerifyFace: boolean;
    message: string;
}>;
//# sourceMappingURL=face-verification.service.d.ts.map