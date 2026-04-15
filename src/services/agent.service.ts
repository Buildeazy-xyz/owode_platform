import { prisma } from '../config/database'

// Assign agent role to a user
export const assignAgentRole = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) throw new Error('User not found')
  if (user.role === 'AGENT') throw new Error('User is already an agent')

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { role: 'AGENT' }
  })

return {
    id: updatedUser.id,
    fullName: updatedUser.fullName,
    phone: updatedUser.phone,
    email: updatedUser.email,
    role: updatedUser.role,
    isVerified: updatedUser.isVerified,
    isActive: updatedUser.isActive,
    createdAt: updatedUser.createdAt
  }}

// Agent credits a member's wallet (cash collection)
export const agentCreditMember = async (data: {
  agentId: string
  memberId: string
  amount: number
  description: string
}) => {
  // Step 1 — Verify agent exists and has agent role
  const agent = await prisma.user.findUnique({
    where: { id: data.agentId }
  })

  if (!agent) throw new Error('Agent not found')
  if (agent.role !== 'AGENT' && agent.role !== 'ADMIN') {
    throw new Error('Unauthorized — only agents can credit member wallets')
  }

  // Step 2 — Find the member
  const member = await prisma.user.findUnique({
    where: { id: data.memberId },
    include: { wallet: true }
  })

  if (!member) throw new Error('Member not found')
  if (!member.wallet) throw new Error('Member wallet not found')
  if (member.wallet.isLocked) throw new Error('Member wallet is locked')

  if (data.amount <= 0) throw new Error('Amount must be greater than 0')

  const newBalance = member.wallet.balance + data.amount

  // Step 3 — Credit member wallet and create transaction
  const [updatedWallet, transaction] = await prisma.$transaction([
    prisma.wallet.update({
      where: { userId: data.memberId },
      data: {
        balance: newBalance,
        totalSaved: member.wallet.totalSaved + data.amount
      }
    }),
    prisma.transaction.create({
      data: {
        walletId: member.wallet.id,
        type: 'CREDIT',
        amount: data.amount,
        balance: newBalance,
        description: `Agent collection by ${agent.fullName} — ${data.description}`,
        reference: `AGENT-${Date.now()}-${data.agentId.slice(0, 8)}`,
        status: 'SUCCESS'
      }
    })
  ])

  return {
    agent: agent.fullName,
    member: member.fullName,
    amount: data.amount,
    newBalance,
    transaction
  }
}

// Get all members — for agent to see who they manage
export const getAllMembers = async () => {
  const members = await prisma.user.findMany({
    where: { role: 'CONTRIBUTOR', isActive: true },
    include: { wallet: true },
    orderBy: { createdAt: 'desc' }
  })

  // Never return PINs
  return members.map(m => ({
    id: m.id,
    fullName: m.fullName,
    phone: m.phone,
    email: m.email,
    isVerified: m.isVerified,
    wallet: m.wallet
  }))
}

// Get agent collection summary
export const getAgentSummary = async (agentId: string) => {
  const agent = await prisma.user.findUnique({
    where: { id: agentId }
  })

  if (!agent) throw new Error('Agent not found')

  // Get all transactions made by this agent
  const collections = await prisma.transaction.findMany({
    where: {
      description: { contains: `Agent collection by ${agent.fullName}` },
      type: 'CREDIT'
    },
    orderBy: { createdAt: 'desc' }
  })

  const totalCollected = collections.reduce((sum, t) => sum + t.amount, 0)

  return {
    agent: agent.fullName,
    totalCollections: collections.length,
    totalAmountCollected: totalCollected,
    recentCollections: collections.slice(0, 10)
  }
}