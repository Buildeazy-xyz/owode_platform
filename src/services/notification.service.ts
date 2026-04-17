import twilio from 'twilio'
import { Resend } from 'resend'

// Resend email client
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder')
// Twilio SMS client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

// Send SMS
export const sendSMS = async (data: {
  to: string
  message: string
}) => {
  try {
    const result = await twilioClient.messages.create({
      body: data.message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+234${data.to.slice(1)}`
    })
    return { success: true, sid: result.sid }
  } catch (error: any) {
    console.error('SMS error:', error.message)
    return { success: false, error: error.message }
  }
}

// Send Email via Resend
export const sendEmail = async (data: {
  to: string
  subject: string
  message: string
}) => {
  try {
    const result = await resend.emails.send({
      from: `OWODE Alajo <${process.env.RESEND_FROM_EMAIL}>`,
      to: data.to,
      subject: data.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1a1a2e; padding: 20px; text-align: center;">
            <h1 style="color: #f5a623; margin: 0;">OWODE Alajo</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <p style="font-size: 16px; color: #333;">${data.message}</p>
          </div>
          <div style="background: #1a1a2e; padding: 15px; text-align: center;">
            <p style="color: #888; font-size: 12px; margin: 0;">OWODE Digital Services Limited</p>
          </div>
        </div>
      `
    })
    return { success: true, id: result.data?.id }
  } catch (error: any) {
    console.error('Email error:', error.message)
    return { success: false, error: error.message }
  }
}

// Notification templates
export const notify = {
  walletCredited: async (data: {
    phone: string
    email: string | null
    amount: number
    balance: number
    fullName: string
  }) => {
    const message = `Hi ${data.fullName}, your OWODE wallet has been credited with ₦${data.amount.toLocaleString()}. New balance: ₦${data.balance.toLocaleString()}.`
    await sendSMS({ to: data.phone, message })
    if (data.email) await sendEmail({ to: data.email, subject: 'Wallet Credited — OWODE Alajo', message })
  },

  walletDebited: async (data: {
    phone: string
    email: string | null
    amount: number
    balance: number
    fullName: string
  }) => {
    const message = `Hi ${data.fullName}, ₦${data.amount.toLocaleString()} has been debited from your OWODE wallet. New balance: ₦${data.balance.toLocaleString()}.`
    await sendSMS({ to: data.phone, message })
    if (data.email) await sendEmail({ to: data.email, subject: 'Wallet Debited — OWODE Alajo', message })
  },

  ajoPayout: async (data: {
    phone: string
    email: string | null
    amount: number
    groupName: string
    fullName: string
  }) => {
    const message = `Congratulations ${data.fullName}! You have received your Ajo payout of ₦${data.amount.toLocaleString()} from group "${data.groupName}". Keep saving! 🎉`
    await sendSMS({ to: data.phone, message })
    if (data.email) await sendEmail({ to: data.email, subject: 'Ajo Payout Received — OWODE Alajo', message })
  },

  kycVerified: async (data: {
    phone: string
    email: string | null
    fullName: string
  }) => {
    const message = `Hi ${data.fullName}, your OWODE account has been verified successfully. You now have full access to all platform features!`
    await sendSMS({ to: data.phone, message })
    if (data.email) await sendEmail({ to: data.email, subject: 'Account Verified — OWODE Alajo', message })
  },

  contributionMade: async (data: {
    phone: string
    email: string | null
    amount: number
    groupName: string
    fullName: string
  }) => {
    const message = `Hi ${data.fullName}, your contribution of ₦${data.amount.toLocaleString()} to "${data.groupName}" was successful. Keep it up! 💪`
    await sendSMS({ to: data.phone, message })
    if (data.email) await sendEmail({ to: data.email, subject: 'Contribution Successful — OWODE Alajo', message })
  }
}