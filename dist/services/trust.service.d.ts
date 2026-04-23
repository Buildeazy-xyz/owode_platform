export declare const calculateTrustScore: (userId: string) => Promise<number>;
export declare const updateTrustScore: (userId: string) => Promise<number>;
export declare const getTrustLabel: (score: number) => string;
export declare const getTrustColor: (score: number) => string;
export declare const isEligibleForGuaranteedAjo: (userId: string) => Promise<boolean>;
export declare const assessGroupRisk: (groupId: string) => Promise<{
    groupId: string;
    averageTrustScore: number;
    highRiskMembers: number;
    lowRiskMembers: number;
    riskLevel: string;
    recommendation: string;
}>;
export declare const isGroupBalanced: (groupId: string) => Promise<boolean>;
//# sourceMappingURL=trust.service.d.ts.map