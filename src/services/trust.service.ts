import { prisma } from '../config/database'

// Calculate trust score for a user (0-100)
export const calculateTrustScore = async (userId: string): Promise<number> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      ajoMembers: {
        include: { group: true }
      },
      defaultRecords: true
    }
  })

  if (!user) return 0

  let score = 50 // Base score

  // +10 if BVN submitted
  if (user.bvn) score += 10

  // +10 if NIN submitted
  if (user.nin) score += 10

  // +10 if verified
  if (user.isVerified) score += 10

  // +5 for each completed Ajo group
  const completedGroups = user.ajoMembers.filter(m => !m.group.isActive).length
  score += Math.min(completedGroups * 5, 20)

  // -15 for each default
  const defaults = user.defaultRecords.length
  score -= defaults * 15

  // -5 for each unrecovered default
  const unrecovered = user.defaultRecords.filter(d => d.recoveryStatus !== 'RECOVERED').length
  score -= unrecovered * 5

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, score))
}

// Update trust score in database
export const updateTrustScore = async (userId: string) => {
  const score = await calculateTrustScore(userId)
  await prisma.user.update({
    where: { id: userId },
    data: { trustScore: score }
  })
  return score
}

// Get trust score label
export const getTrustLabel = (score: number): string => {
  if (score >= 80) return 'Excellent'
  if (score >= 65) return 'Good'
  if (score >= 50) return 'Fair'
  if (score >= 35) return 'Poor'
  return 'Very Poor'
}

// Get trust color
export const getTrustColor = (score: number): string => {
  if (score >= 80) return '#22c55e'
  if (score >= 65) return '#84cc16'
  if (score >= 50) return '#f5a623'
  if (score >= 35) return '#f97316'
  return '#ef4444'
}

// Check if user is eligible for guaranteed Ajo
export const isEligibleForGuaranteedAjo = async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return false
  if (!user.bvn && !user.nin) return false
  if (!user.isVerified) return false
  if (user.trustScore < 35) return false
  return true
}
// Add these functions to trust.service.ts

// Full risk assessment for group joining
export const assessGroupRisk = async (groupId: string) => {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: true }
      }
    }
  })

  if (!group) throw new Error('Group not found')

  const realMembers = group.members.filter(m => !m.isAvatar)

  // Calculate group risk score
  const avgTrustScore = realMembers.length > 0
    ? realMembers.reduce((sum, m) => sum + m.user.trustScore, 0) / realMembers.length
    : 0

  const highRiskMembers = realMembers.filter(m => m.user.trustScore < 50).length
  const lowRiskMembers = realMembers.filter(m => m.user.trustScore >= 65).length

  return {
    groupId,
    averageTrustScore: avgTrustScore,
    highRiskMembers,
    lowRiskMembers,
    riskLevel: avgTrustScore >= 65 ? 'LOW' : avgTrustScore >= 50 ? 'MEDIUM' : 'HIGH',
    recommendation: highRiskMembers > lowRiskMembers
      ? 'High risk group — Avatar coverage likely needed'
      : 'Balanced group — Low default probability'
  }
}

// Check if group has too many high risk members
export const isGroupBalanced = async (groupId: string): Promise<boolean> => {
  const assessment = await assessGroupRisk(groupId)
  return assessment.highRiskMembers <= assessment.lowRiskMembers
}