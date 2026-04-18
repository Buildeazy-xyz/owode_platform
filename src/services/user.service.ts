import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'

// Register a new user
export const registerUser = async (data: {
  fullName: string
  phone: string
  email?: string
  password: string
  transactionPin: string
  role?: 'CONTRIBUTOR' | 'AGENT' | 'ADMIN'
}) => {
  const existingUser = await prisma.user.findUnique({ where: { phone: data.phone } })
  if (existingUser) throw new Error('Phone number already registered')

  // Validate password — must have letters and numbers
  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9]).{6,}$/
  if (!passwordRegex.test(data.password)) {
    throw new Error('Password must be at least 6 characters with letters and numbers')
  }

  // Validate transaction PIN — must be 4 digits
  if (data.transactionPin.length !== 4 || isNaN(Number(data.transactionPin))) {
    throw new Error('Transaction PIN must be exactly 4 digits')
  }

  const hashedPassword = await bcrypt.hash(data.password, 10)
  const hashedTransactionPin = await bcrypt.hash(data.transactionPin, 10)

  const user = await prisma.user.create({
    data: {
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      password: hashedPassword,
      transactionPin: hashedTransactionPin,
      role: data.role || 'CONTRIBUTOR',
      wallet: {
        create: { balance: 0, totalSaved: 0, totalPayout: 0 }
      }
    },
    include: { wallet: true }
  })

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET || 'owode_secret',
    { expiresIn: '7d' }
  )

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

// Login with password
export const loginUser = async (data: { phone: string; password: string }) => {
  const user = await prisma.user.findUnique({
    where: { phone: data.phone },
    include: { wallet: true }
  })

  if (!user) throw new Error('Invalid phone or password')
  if (!user.isActive) throw new Error('Account is deactivated')
  if (!user.password) throw new Error('Please set a password first')

  const isPasswordValid = await bcrypt.compare(data.password, user.password)
  if (!isPasswordValid) throw new Error('Invalid phone or password')

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET || 'owode_secret',
    { expiresIn: '7d' }
  )

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

// Set app PIN (6 digits) — for opening app
export const setAppPin = async (userId: string, appPin: string) => {
  if (appPin.length !== 6 || isNaN(Number(appPin))) {
    throw new Error('App PIN must be exactly 6 digits')
  }
  const hashedAppPin = await bcrypt.hash(appPin, 10)
  await prisma.user.update({ where: { id: userId }, data: { appPin: hashedAppPin } })
  return { message: 'App PIN set successfully' }
}

// Verify app PIN
export const verifyAppPin = async (userId: string, appPin: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.appPin) throw new Error('App PIN not set')
  const isValid = await bcrypt.compare(appPin, user.appPin)
  if (!isValid) throw new Error('Invalid app PIN')
  return { valid: true }
}

// Verify transaction PIN
export const verifyTransactionPin = async (userId: string, transactionPin: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  const isValid = await bcrypt.compare(transactionPin, user.transactionPin)
  if (!isValid) throw new Error('Invalid transaction PIN')
  return { valid: true }
}