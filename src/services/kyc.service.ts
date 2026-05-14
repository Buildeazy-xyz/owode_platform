import { prisma } from '../config/database'
import { notify } from './notification.service'
import axios from 'axios'

const YOUVERIFY_API_KEY = process.env.YOUVERIFY_API_KEY || ''
const YOUVERIFY_BASE_URL = 'https://api.youverify.co/v2'

const youverify = axios.create({
  baseURL: YOUVERIFY_BASE_URL,
  headers: {
    'token': YOUVERIFY_API_KEY,
    'Content-Type': 'application/json'
  }
})

// Verify BVN with YouVerify
export const submitBVN = async (data: { userId: string; bvn: string }) => {
  if (data.bvn.length !== 11 || isNaN(Number(data.bvn))) {
    throw new Error('BVN must be exactly 11 digits')
  }

  const existing = await prisma.user.findFirst({ where: { bvn: data.bvn } })
  if (existing && existing.id !== data.userId) {
    throw new Error('BVN already linked to another account')
  }

  const user = await prisma.user.findUnique({ where: { id: data.userId } })
  if (!user) throw new Error('User not found')

  try {
    const response = await youverify.post('/identity/bvn', {
      id: data.bvn,
      isSubjectConsent: true
    })

    const verified = response.data?.data?.verified === true ||
      response.data?.statusCode === '00'

    await prisma.user.update({
      where: { id: data.userId },
      data: {
        bvn: data.bvn,
        isVerified: verified
      }
    })

    return {
      message: verified
        ? '✅ BVN verified successfully!'
        : 'BVN submitted — manual review in progress',
      verified,
      data: response.data?.data
    }
  } catch (error: any) {
    // Save BVN even if verification fails — admin can manually verify
    await prisma.user.update({
      where: { id: data.userId },
      data: { bvn: data.bvn }
    })

    return {
      message: 'BVN submitted successfully — verification in progress',
      verified: false
    }
  }
}

// Verify NIN with YouVerify
export const submitNIN = async (data: { userId: string; nin: string }) => {
  if (data.nin.length !== 11 || isNaN(Number(data.nin))) {
    throw new Error('NIN must be exactly 11 digits')
  }

  const existing = await prisma.user.findFirst({ where: { nin: data.nin } })
  if (existing && existing.id !== data.userId) {
    throw new Error('NIN already linked to another account')
  }

  const user = await prisma.user.findUnique({ where: { id: data.userId } })
  if (!user) throw new Error('User not found')

  try {
    const response = await youverify.post('/identity/nin', {
      id: data.nin,
      isSubjectConsent: true
    })

    const verified = response.data?.data?.verified === true ||
      response.data?.statusCode === '00'

    await prisma.user.update({
      where: { id: data.userId },
      data: {
        nin: data.nin,
        isVerified: verified
      }
    })

    return {
      message: verified
        ? '✅ NIN verified successfully!'
        : 'NIN submitted — manual review in progress',
      verified,
      data: response.data?.data
    }
  } catch (error: any) {
    await prisma.user.update({
      where: { id: data.userId },
      data: { nin: data.nin }
    })

    return {
      message: 'NIN submitted successfully — verification in progress',
      verified: false
    }
  }
}

// Face liveness verification with YouVerify
export const submitFaceVerification = async (data: {
  userId: string
  image: string // base64 image
  bvn?: string
  nin?: string
}) => {
  const user = await prisma.user.findUnique({ where: { id: data.userId } })
  if (!user) throw new Error('User not found')

  try {
    const payload: any = {
      image: data.image,
      isSubjectConsent: true,
      premiumCheck: true
    }

    if (data.bvn || user.bvn) {
      payload.id = data.bvn || user.bvn
      payload.type = 'bvn'
    } else if (data.nin || user.nin) {
      payload.id = data.nin || user.nin
      payload.type = 'nin'
    }

    const response = await youverify.post('/identity/face-id', payload)

    const verified = response.data?.data?.faceMatch === true ||
      response.data?.statusCode === '00'

    if (verified) {
      await prisma.user.update({
        where: { id: data.userId },
        data: { isVerified: true }
      })

      await notify.kycVerified({
        phone: user.phone,
        email: user.email,
        fullName: user.fullName
      })
    }

    return {
      message: verified
        ? '✅ Face verification successful! Your account is now verified.'
        : '❌ Face verification failed. Please try again with better lighting.',
      verified,
      confidence: response.data?.data?.confidence,
      data: response.data?.data
    }
  } catch (error: any) {
    console.error('YouVerify face error:', error.response?.data)
    throw new Error(error.response?.data?.message || 'Face verification failed')
  }
}

// Verify a user manually — admin only
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

  await notify.kycVerified({
    phone: updatedUser.phone,
    email: updatedUser.email,
    fullName: updatedUser.fullName
  })

  return {
    id: updatedUser.id,
    fullName: updatedUser.fullName,
    isVerified: updatedUser.isVerified,
    message: 'User verified successfully'
  }
}

// Get KYC status
export const getKYCStatus = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')

  return {
    id: user.id,
    fullName: user.fullName,
    isVerified: user.isVerified,
    hasBVN: !!user.bvn,
    hasNIN: !!user.nin,
    status: user.isVerified
      ? 'VERIFIED'
      : user.bvn || user.nin
        ? 'PENDING'
        : 'UNVERIFIED'
  }
}