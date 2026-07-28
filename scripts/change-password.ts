import { prisma } from '../src/config/database'
import bcrypt from 'bcryptjs'
import * as readline from 'readline'

const ask = (q: string): Promise<string> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(q, a => { rl.close(); res(a.trim()) }))
}

const main = async () => {
  const phone = (await ask('Phone number of the account: ')).replace(/\D/g, '')
  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user) { console.log('No account with that number'); process.exit(1) }
  console.log(`Found: ${user.fullName} (${user.role})`)

  const pw = await ask('New password (12+ chars): ')
  if (pw.length < 12) { console.log('Use at least 12 characters'); process.exit(1) }
  const pw2 = await ask('Confirm: ')
  if (pw !== pw2) { console.log('Passwords do not match'); process.exit(1) }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(pw, 12) }
  })
  console.log('Password changed.')
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
