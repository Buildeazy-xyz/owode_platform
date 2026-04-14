import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'

// Register a new user
export const registerUser = async (data: {
  fullName: string
  phone: string
  email?: string
  pin: string
  role?: 'CONTRIBUTOR' | 'AGENT' | 'ADMIN'
}) => {
  // Step 1 — Check if phone number already exists
  const existingUser = await prisma.user.findUnique({
    where: { phone: data.phone }
  })

  if (existingUser) {
    throw new Error('Phone number already registered')
  }

  // Step 2 — Hash the PIN before saving
  const hashedPin = await bcrypt.hash(data.pin, 10)

  // Step 3 — Create the user in the database
  const user = await prisma.user.create({
    data: {
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      pin: hashedPin,
      role: data.role || 'CONTRIBUTOR',

      // Step 4 — Automatically create a wallet for the user
      wallet: {
        create: {
          balance: 0,
          totalSaved: 0,
          totalPayout: 0
        }
      }
    },
    include: {
      wallet: true
    }
  })

  // Step 5 — Generate JWT token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET || 'owode_secret',
    { expiresIn: '7d' }
  )

  // Step 6 — Return user and token (never return the PIN)
  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      wallet: user.wallet
    },
    token
  }
}
// Login a user
export const loginUser = async (data: {
  phone: string
  pin: string
}) => {
  // Step 1 — Find user by phone
  const user = await prisma.user.findUnique({
    where: { phone: data.phone },
    include: { wallet: true }
  })

  // Step 2 — Check if user exists
  if (!user) {
    throw new Error('Invalid phone or PIN')
  }

  // Step 3 — Check if account is active
  if (!user.isActive) {
    throw new Error('Account is deactivated')
  }

  // Step 4 — Compare PIN with hashed PIN in database
  const isPinValid = await bcrypt.compare(data.pin, user.pin)
  if (!isPinValid) {
    throw new Error('Invalid phone or PIN')
  }

  // Step 5 — Generate JWT token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET || 'owode_secret',
    { expiresIn: '7d' }
  )

  // Step 6 — Return user and token
  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      wallet: user.wallet
    },
    token
  }
}