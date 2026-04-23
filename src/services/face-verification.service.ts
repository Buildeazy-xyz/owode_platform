import axios from 'axios'
import { prisma } from '../config/database'
import { updateTrustScore } from './trust.service'

const DOJAH_HEADERS = {
  'AppId': process.env.DOJAH_APP_ID || '',
  'Authorization': process.env.DOJAH_PRIVATE_KEY || '',
  'Content-Type': 'application/json'
}

// Verify face against government ID photo using Dojah
export const verifyFace = async (data: {
  userId: string
  selfieBase64: string // Base64 encoded selfie image
  idType: 'BVN' | 'NIN'
  idNumber: string
}) => {
  // Check if Dojah is configured
  if (!process.env.DOJAH_APP_ID || process.env.DOJAH_APP_ID === 'your_app_id') {
    console.log('⚠️ Dojah not configured — simulating face verification')
    return await saveFaceVerificationResult(data.userId, true, 'SIMULATED', 95)
  }

  try {
    // Step 1 — Get government ID photo using BVN or NIN
    let governmentPhoto = ''

    if (data.idType === 'BVN') {
      const bvnResponse = await axios.get(
        `${process.env.DOJAH_BASE_URL}/api/v1/kyc/bvn/full?bvn=${data.idNumber}`,
        { headers: DOJAH_HEADERS }
      )
      governmentPhoto = bvnResponse.data?.entity?.image || ''
    } else {
      const ninResponse = await axios.get(
        `${process.env.DOJAH_BASE_URL}/api/v1/kyc/nin?nin=${data.idNumber}`,
        { headers: DOJAH_HEADERS }
      )
      governmentPhoto = ninResponse.data?.entity?.photo || ''
    }

    if (!governmentPhoto) {
      throw new Error('Could not retrieve government ID photo for comparison')
    }

    // Step 2 — Compare selfie with government photo
    const compareResponse = await axios.post(
      `${process.env.DOJAH_BASE_URL}/api/v1/ml/face.match`,
      {
        image_1: data.selfieBase64,
        image_2: governmentPhoto
      },
      { headers: DOJAH_HEADERS }
    )

    const confidence = compareResponse.data?.entity?.confidence || 0
    const verified = confidence >= 80 // 80% match threshold

    return await saveFaceVerificationResult(
      data.userId,
      verified,
      verified ? 'VERIFIED' : 'FAILED',
      confidence
    )
  } catch (error: any) {
    console.error('Dojah face verification error:', error.response?.data || error.message)
    throw new Error(error.response?.data?.error || 'Face verification failed — please try again in good lighting')
  }
}

// Liveness check — detect if user is real person not photo
export const livenessCheck = async (data: {
  userId: string
  videoBase64?: string
  selfieBase64: string
}) => {
  if (!process.env.DOJAH_APP_ID || process.env.DOJAH_APP_ID === 'your_app_id') {
    console.log('⚠️ Dojah not configured — simulating liveness check')
    return { live: true, confidence: 95, status: 'SIMULATED' }
  }

  try {
    const response = await axios.post(
      `${process.env.DOJAH_BASE_URL}/api/v1/ml/liveness`,
      { image: data.selfieBase64 },
      { headers: DOJAH_HEADERS }
    )

    const isLive = response.data?.entity?.liveness_check === true
    const confidence = response.data?.entity?.confidence || 0

    return {
      live: isLive,
      confidence,
      status: isLive ? 'LIVE' : 'SPOOF_DETECTED'
    }
  } catch (error: any) {
    console.error('Liveness check error:', error.response?.data || error.message)
    throw new Error('Liveness check failed — please ensure good lighting and look directly at camera')
  }
}

const saveFaceVerificationResult = async (
  userId: string,
  verified: boolean,
  status: string,
  confidence: number
) => {
  if (!verified) {
    throw new Error(`Face verification failed (${Math.round(confidence)}% match). Please ensure good lighting and try again`)
  }

  // Mark user as face verified
  await prisma.user.update({
    where: { id: userId },
    data: { isVerified: true }
  })

  await updateTrustScore(userId)

  return {
    verified: true,
    confidence: Math.round(confidence),
    status,
    message: `✅ Face verified successfully! (${Math.round(confidence)}% match)`
  }
}

// Get face verification status
export const getFaceVerificationStatus = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isVerified: true, bvn: true, nin: true, trustScore: true }
  })

  if (!user) throw new Error('User not found')

  return {
    isFaceVerified: user.isVerified,
    hasBVN: !!user.bvn,
    hasNIN: !!user.nin,
    trustScore: user.trustScore,
    canVerifyFace: !!(user.bvn || user.nin),
    message: user.isVerified
      ? 'Your face has been verified against your government ID'
      : !user.bvn && !user.nin
      ? 'Submit your BVN or NIN first before face verification'
      : 'Ready for face verification'
  }
}