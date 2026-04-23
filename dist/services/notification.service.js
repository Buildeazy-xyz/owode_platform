"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notify = exports.sendEmail = exports.sendSMS = void 0;
const resend_1 = require("resend");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY || 'placeholder');
const getTwilioClient = () => {
    try {
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN ||
            process.env.TWILIO_ACCOUNT_SID === 'ACxxxxxxxxxxxxxxxx')
            return null;
        const twilio = require('twilio');
        return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
    catch {
        return null;
    }
};
const sendSMS = async (data) => {
    try {
        const client = getTwilioClient();
        if (!client) {
            console.log(`📱 SMS (not sent - Twilio not configured): ${data.message}`);
            return { success: false, error: 'Twilio not configured' };
        }
        const result = await client.messages.create({
            body: data.message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: `+234${data.to.slice(1)}`
        });
        return { success: true, sid: result.sid };
    }
    catch (error) {
        console.log(`📱 SMS failed (non-critical): ${error.message}`);
        return { success: false, error: error.message };
    }
};
exports.sendSMS = sendSMS;
const sendEmail = async (data) => {
    try {
        if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'placeholder') {
            console.log(`📧 Email (not sent - Resend not configured): ${data.subject}`);
            return { success: false, error: 'Resend not configured' };
        }
        const result = await resend.emails.send({
            from: `OWODE Alajo <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
            to: data.to,
            subject: data.subject,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0d47a1, #f5a623); padding: 30px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 32px; letter-spacing: 4px;">OWODE</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0;">Alajo Platform</p>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <p style="font-size: 16px; color: #333; line-height: 1.6;">${data.message}</p>
          </div>
          <div style="background: #0d47a1; padding: 15px; text-align: center;">
            <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin: 0;">🔒 OWODE Digital Services Limited</p>
          </div>
        </div>
      `
        });
        return { success: true, id: result.data?.id };
    }
    catch (error) {
        console.log(`📧 Email failed (non-critical): ${error.message}`);
        return { success: false, error: error.message };
    }
};
exports.sendEmail = sendEmail;
exports.notify = {
    walletCredited: async (data) => {
        try {
            const message = `Hi ${data.fullName}, your OWODE wallet has been credited with ₦${data.amount.toLocaleString()}. New balance: ₦${data.balance.toLocaleString()}.`;
            await (0, exports.sendSMS)({ to: data.phone, message });
            if (data.email)
                await (0, exports.sendEmail)({ to: data.email, subject: 'Wallet Credited — OWODE Alajo', message });
        }
        catch (e) {
            console.log('Notification failed (non-critical)');
        }
    },
    walletDebited: async (data) => {
        try {
            const message = `Hi ${data.fullName}, ₦${data.amount.toLocaleString()} has been debited from your OWODE wallet. New balance: ₦${data.balance.toLocaleString()}.`;
            await (0, exports.sendSMS)({ to: data.phone, message });
            if (data.email)
                await (0, exports.sendEmail)({ to: data.email, subject: 'Wallet Debited — OWODE Alajo', message });
        }
        catch (e) {
            console.log('Notification failed (non-critical)');
        }
    },
    ajoPayout: async (data) => {
        try {
            const message = `Congratulations ${data.fullName}! You have received your Ajo payout of ₦${data.amount.toLocaleString()} from group "${data.groupName}". Keep saving! 🎉`;
            await (0, exports.sendSMS)({ to: data.phone, message });
            if (data.email)
                await (0, exports.sendEmail)({ to: data.email, subject: 'Ajo Payout Received — OWODE Alajo', message });
        }
        catch (e) {
            console.log('Notification failed (non-critical)');
        }
    },
    kycVerified: async (data) => {
        try {
            const message = `Hi ${data.fullName}, your OWODE account has been verified successfully. You now have full access to all platform features!`;
            await (0, exports.sendSMS)({ to: data.phone, message });
            if (data.email)
                await (0, exports.sendEmail)({ to: data.email, subject: 'Account Verified — OWODE Alajo', message });
        }
        catch (e) {
            console.log('Notification failed (non-critical)');
        }
    },
    contributionMade: async (data) => {
        try {
            const message = `Hi ${data.fullName}, your contribution of ₦${data.amount.toLocaleString()} to "${data.groupName}" was successful. Keep it up! 💪`;
            await (0, exports.sendSMS)({ to: data.phone, message });
            if (data.email)
                await (0, exports.sendEmail)({ to: data.email, subject: 'Contribution Successful — OWODE Alajo', message });
        }
        catch (e) {
            console.log('Notification failed (non-critical)');
        }
    },
    transactionAlert: async (data) => {
        try {
            const message = data.type === 'CREDIT'
                ? `Payment received in OWODE from ${data.sender || 'OWODE'}. Amount: ₦${data.amount.toLocaleString()}`
                : `Payment of ₦${data.amount.toLocaleString()} sent from your OWODE wallet.`;
            await (0, exports.sendSMS)({ to: data.phone, message });
            if (data.email)
                await (0, exports.sendEmail)({ to: data.email, subject: `${data.type === 'CREDIT' ? 'Payment Received' : 'Payment Sent'} — OWODE`, message });
        }
        catch (e) {
            console.log('Notification failed (non-critical)');
        }
    }
};
//# sourceMappingURL=notification.service.js.map