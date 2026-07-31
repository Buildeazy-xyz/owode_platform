import { prisma } from '../src/config/database'
import * as fs from 'fs'

const main = async () => {
  const out: any = {}
  out.users = await prisma.user.findMany()
  out.wallets = await prisma.wallet.findMany()
  out.transactions = await prisma.transaction.findMany()
  out.savingsGoals = await prisma.savingsGoal.findMany()
  out.savingsContributions = await prisma.savingsContribution.findMany()
  out.ajoGroups = await prisma.ajoGroup.findMany()
  out.ajoMembers = await prisma.ajoMember.findMany()
  out.ajoCycles = await prisma.ajoCycle.findMany()
  const f = `../backups/owode-data-${new Date().toISOString().slice(0,16).replace(/[:T-]/g,'')}.json`
  fs.writeFileSync(f, JSON.stringify(out, null, 2))
  for (const k of Object.keys(out)) console.log(' ', k, out[k].length)
  console.log('written', f)
  process.exit(0)
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
