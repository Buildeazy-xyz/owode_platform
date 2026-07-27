import { prisma } from '../src/config/database'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import * as readline from 'readline'

const ask = (q: string): Promise<string> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(q, a => { rl.close(); res(a.trim()) }))
}

const main = async () => {
  const fullName = await ask('Admin full name: ')
  const phone = (await ask('Admin phone (11 digits, keep it private): ')).replace(/\D/g, '')
  if (phone.length !== 11) { console.log('Phone must be 11 digits'); process.exit(1) }
  const pw = await ask('Password (12+ chars): ')
  if (pw.length < 12) { console.log('Use at least 12 characters'); process.exit(1) }
  const pw2 = await ask('Confirm password: ')
  if (pw !== pw2) { console.log('Passwords do not match'); process.exit(1) }

  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing) { console.log('A user with that phone already exists'); process.exit(1) }

  const hashed = await bcrypt.hash(pw, 12)
  const user = await prisma.user.create({
    data: { id: uuidv4(), fullName, phone, password: hashed, role: 'ADMIN', isVerified: true, isActive: true }
  })
  await prisma.wallet.create({ data: { id: uuidv4(), userId: user.id, balance: 0 } })
  console.log('Admin created:', user.fullName)
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
