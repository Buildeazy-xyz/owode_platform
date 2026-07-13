import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder')

export const sendSMS = async (data: { to: string; message: string }) => {
  try {
    const apiKey = process.env.TERMII_API_KEY
    const senderId = process.env.TERMII_SENDER_ID || 'OWODE'
    if (!apiKey) {
      console.log(`📱 SMS (not sent - Termii not configured): ${data.message}`)
      return { success: false, error: 'Termii not configured' }
    }
    const formattedPhone = data.to.startsWith('0') ? '234' + data.to.slice(1) : data.to.replace(/^\+/, '')
    const response = await fetch('https://v3.api.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey, to: formattedPhone, from: senderId,
        sms: data.message, type: 'plain', channel: 'generic'
      })
    })
    const result: any = await response.json()
    if (result.message_id) {
      console.log(`✅ Termii SMS sent to ${formattedPhone}`)
      return { success: true, sid: result.message_id }
    }
    console.log(`📱 Termii SMS failed: ${JSON.stringify(result)}`)
    return { success: false, error: result.message || 'Unknown Termii error' }
  } catch (error: any) {
    console.log(`📱 SMS failed (non-critical): ${error.message}`)
    return { success: false, error: error.message }
  }
}

export const sendEmail = async (data: { to: string; subject: string; message: string }) => {
  try {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'placeholder') {
      console.log(`📧 Email (not sent - Resend not configured): ${data.subject}`)
      return { success: false, error: 'Resend not configured' }
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
    })
    return { success: true, id: result.data?.id }
  } catch (error: any) {
    console.log(`📧 Email failed (non-critical): ${error.message}`)
    return { success: false, error: error.message }
  }
}

export const notify = {
  walletCredited: async (data: { phone: string; email: string | null; amount: number; balance: number; fullName: string }) => {
    try {
      const message = `Hi ${data.fullName}, your OWODE wallet has been credited with ₦${data.amount.toLocaleString()}. New balance: ₦${data.balance.toLocaleString()}.`
      await sendSMS({ to: data.phone, message })
      if (data.email) await sendEmail({ to: data.email, subject: 'Wallet Credited — OWODE Alajo', message })
    } catch (e) { console.log('Notification failed (non-critical)') }
  },
  walletDebited: async (data: { phone: string; email: string | null; amount: number; balance: number; fullName: string }) => {
    try {
      const message = `Hi ${data.fullName}, ₦${data.amount.toLocaleString()} has been debited from your OWODE wallet. New balance: ₦${data.balance.toLocaleString()}.`
      await sendSMS({ to: data.phone, message })
      if (data.email) await sendEmail({ to: data.email, subject: 'Wallet Debited — OWODE Alajo', message })
    } catch (e) { console.log('Notification failed (non-critical)') }
  },
  ajoPayout: async (data: { phone: string; email: string | null; amount: number; groupName: string; fullName: string }) => {
    try {
      const message = `Congratulations ${data.fullName}! You have received your Ajo payout of ₦${data.amount.toLocaleString()} from group "${data.groupName}". Keep saving! 🎉`
      await sendSMS({ to: data.phone, message })
      if (data.email) await sendEmail({ to: data.email, subject: 'Ajo Payout Received — OWODE Alajo', message })
    } catch (e) { console.log('Notification failed (non-critical)') }
  },
  kycVerified: async (data: { phone: string; email: string | null; fullName: string }) => {
    try {
      const message = `Hi ${data.fullName}, your OWODE account has been verified successfully. You now have full access to all platform features!`
      await sendSMS({ to: data.phone, message })
      if (data.email) await sendEmail({ to: data.email, subject: 'Account Verified — OWODE Alajo', message })
    } catch (e) { console.log('Notification failed (non-critical)') }
  },
  contributionMade: async (data: { phone: string; email: string | null; amount: number; groupName: string; fullName: string }) => {
    try {
      const message = `Hi ${data.fullName}, your contribution of ₦${data.amount.toLocaleString()} to "${data.groupName}" was successful. Keep it up! 💪`
      await sendSMS({ to: data.phone, message })
      if (data.email) await sendEmail({ to: data.email, subject: 'Contribution Successful — OWODE Alajo', message })
    } catch (e) { console.log('Notification failed (non-critical)') }
  },
  transactionAlert: async (data: { phone: string; email: string | null; fullName: string; type: 'CREDIT' | 'DEBIT'; amount: number; sender?: string }) => {
    try {
      const message = data.type === 'CREDIT'
        ? `Payment received in OWODE from ${data.sender || 'OWODE'}. Amount: ₦${data.amount.toLocaleString()}`
        : `Payment of ₦${data.amount.toLocaleString()} sent from your OWODE wallet.`
      await sendSMS({ to: data.phone, message })
      if (data.email) await sendEmail({ to: data.email, subject: `${data.type === 'CREDIT' ? 'Payment Received' : 'Payment Sent'} — OWODE`, message })
    } catch (e) { console.log('Notification failed (non-critical)') }
  }
}