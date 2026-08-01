import { prisma } from '../src/config/database'
import bcrypt from 'bcryptjs'
const main = async () => {
  const phone = process.argv[2], pw = process.argv[3]
  if (!phone || !pw || pw.length < 12) { console.log('usage: tsx scripts/rp.ts <phone> <password 12+ chars>'); process.exit(1) }
  const u = await prisma.user.findUnique({ where: { phone } })
  if (!u) { console.log('no user with that phone'); process.exit(1) }
  if (u.role !== 'ADMIN') { console.log('that account is not an admin'); process.exit(1) }
  await prisma.user.update({ where: { phone }, data: { password: await bcrypt.hash(pw, 12) } })
  console.log('password updated for', u.fullName)
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
