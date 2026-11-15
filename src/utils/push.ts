export const sendPush = async (
  tokens: (string | null | undefined)[],
  title: string,
  body: string,
  data: Record<string, any> = {}
) => {
  const valid = tokens.filter(Boolean) as string[]
  if (valid.length === 0) return 0
  const messages = valid.map(to => ({ to, sound: 'default', title, body, data, priority: 'high' }))
  let sent = 0
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100)
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch)
      })
      // Count what Expo actually accepted, not what we posted. Before this the
      // admin was told "sent to N" even when every token had been rejected.
      const json: any = await res.json().catch(() => null)
      const tickets: any[] = Array.isArray(json?.data) ? json.data : []
      const ok = tickets.filter(t => t?.status === 'ok').length
      const bad = tickets.filter(t => t?.status === 'error')
      if (bad.length) console.log('push rejected:', bad.slice(0, 5).map(t => t?.details?.error || t?.message))
      sent += tickets.length ? ok : (res.ok ? batch.length : 0)
    } catch (e) {
      console.log('push batch failed:', e)
    }
  }
  return sent
}
