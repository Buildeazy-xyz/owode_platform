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
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch)
      })
      sent += batch.length
    } catch (e) {
      console.log('push batch failed:', e)
    }
  }
  return sent
}
