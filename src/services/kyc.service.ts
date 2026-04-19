import { prisma } from '../config/database'
import { notify } from './notification.service'
// Submit BVN for verification
export const submitBVN = async (data: {
  userId: string
  bvn: string
}) => {
  // BVN must be exactly 11 digits
  if (data.bvn.length !== 11 || isNaN(Number(data.bvn))) {
    throw new Error('BVN must be exactly 11 digits')
  }

  // Check if BVN already used by another user
  const existing = await prisma.user.findFirst({
    where: { bvn: data.bvn }
  })

  if (existing && existing.id !== data.userId) {
    throw new Error('BVN already linked to another account')
  }

  // Save BVN to user
  const user = await prisma.user.update({
    where: { id: data.userId },
    data: { bvn: data.bvn }
  })

  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    bvn: user.bvn,
    message: 'BVN submitted successfully — verification in progress'
  }
}

 
  // For now we simulate a successful verification
export const submitNIN = async (data: {
  userId: string
  nin: string
}) => {
  // NIN must be exactly 11 digits
  if (data.nin.length !== 11 || isNaN(Number(data.nin))) {
    throw new Error('NIN must be exactly 11 digits')
  }

  // Check if NIN already used by another user
  const existing = await prisma.user.findFirst({
    where: { nin: data.nin }
  })

  if (existing && existing.id !== data.userId) {
    throw new Error('NIN already linked to another account')
  }

  // Save NIN to user
  const user = await prisma.user.update({
    where: { id: data.userId },
    data: { nin: data.nin }
  })

  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    nin: user.nin,
    message: 'NIN submitted successfully — verification in progress'
  }
}

// Verify a user — called after BVN/NIN is confirmed
// Verify a user — called after BVN/NIN is confirmed
export const verifyUser = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })

  if (!user) throw new Error('User not found')
  if (!user.bvn && !user.nin) {
    throw new Error('User must submit BVN or NIN before verification')
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { isVerified: true }
  })

  // Send notification
  await notify.kycVerified({
    phone: updatedUser.phone,
    email: updatedUser.email,
    fullName: updatedUser.fullName
  })

  return {
    id: updatedUser.id,
    fullName: updatedUser.fullName,
    phone: updatedUser.phone,
    isVerified: updatedUser.isVerified,
    message: 'User verified successfully'
  }
}

// Get KYC status of a user
export const getKYCStatus = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user) throw new Error('User not found')

  return {
    id: user.id,
    fullName: user.fullName,
    isVerified: user.isVerified,
    hasBVN: !!user.bvn,
    hasNIN: !!user.nin,
    status: user.isVerified ? 'VERIFIED' : user.bvn || user.nin ? 'PENDING' : 'UNVERIFIED'
  }
}