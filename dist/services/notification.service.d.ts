export declare const sendSMS: (data: {
    to: string;
    message: string;
}) => Promise<{
    success: boolean;
    sid: any;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    sid?: undefined;
}>;
export declare const sendEmail: (data: {
    to: string;
    subject: string;
    message: string;
}) => Promise<{
    success: boolean;
    id: string | undefined;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    id?: undefined;
}>;
export declare const notify: {
    walletCredited: (data: {
        phone: string;
        email: string | null;
        amount: number;
        balance: number;
        fullName: string;
    }) => Promise<void>;
    walletDebited: (data: {
        phone: string;
        email: string | null;
        amount: number;
        balance: number;
        fullName: string;
    }) => Promise<void>;
    ajoPayout: (data: {
        phone: string;
        email: string | null;
        amount: number;
        groupName: string;
        fullName: string;
    }) => Promise<void>;
    kycVerified: (data: {
        phone: string;
        email: string | null;
        fullName: string;
    }) => Promise<void>;
    contributionMade: (data: {
        phone: string;
        email: string | null;
        amount: number;
        groupName: string;
        fullName: string;
    }) => Promise<void>;
    transactionAlert: (data: {
        phone: string;
        email: string | null;
        fullName: string;
        type: "CREDIT" | "DEBIT";
        amount: number;
        sender?: string;
    }) => Promise<void>;
};
//# sourceMappingURL=notification.service.d.ts.map