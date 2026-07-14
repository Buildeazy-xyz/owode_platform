import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'

export const registerUser = async (data: {
  fullName: string
  phone: string
  email?: string
  password: string
  dateOfBirth?: string
  country?: string
  role?: 'CONTRIBUTOR' | 'AGENT' | 'ADMIN'
}) => {
  const existingUser = await prisma.user.findUnique({ where: { phone: data.phone } })
  if (existingUser) throw new Error('Phone number already registered')

  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9]).{6,}$/
  if (!passwordRegex.test(data.password)) {
    throw new Error('Password must be at least 6 characters with letters and numbers')
  }

  const hashedPassword = await bcrypt.hash(data.password, 10)

  const user = await prisma.user.create({
    data: {
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      password: hashedPassword,
      dateOfBirth: data.dateOfBirth,
      country: data.country || 'Nigeria',
      pin: '',
      transactionPin: '',
      role: data.role || 'CONTRIBUTOR',
      wallet: { create: { balance: 0, totalSaved: 0, totalPayout: 0 } }
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
      hasTransactionPin: false,
      wallet: user.wallet
    },
    token
  }
}

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
      hasTransactionPin: user.transactionPin !== '',
      wallet: user.wallet
    },
    token
  }
}

export const setTransactionPin = async (userId: string, transactionPin: string, currentPin?: string) => {
  if (transactionPin.length !== 4 || isNaN(Number(transactionPin))) {
    throw new Error('Transaction PIN must be exactly 4 digits')
  }
  const existingUser = await prisma.user.findUnique({ where: { id: userId } })
  if (existingUser && existingUser.transactionPin && existingUser.transactionPin !== '') {
    if (!currentPin) throw new Error('CURRENT_PIN_REQUIRED: Enter your current transaction PIN')
    const pinOk = await bcrypt.compare(currentPin, existingUser.transactionPin)
    if (!pinOk) throw new Error('Current transaction PIN is incorrect')
  }
  const hashedPin = await bcrypt.hash(transactionPin, 10)
  await prisma.user.update({
    where: { id: userId },
    data: { transactionPin: hashedPin }
  })
  return { message: 'Transaction PIN set successfully' }
}

export const setAppPin = async (userId: string, appPin: string, currentPin?: string) => {
  if (appPin.length !== 6 || isNaN(Number(appPin))) {
    throw new Error('App PIN must be exactly 6 digits')
  }
  const existingAppUser = await prisma.user.findUnique({ where: { id: userId } })
  if (existingAppUser && existingAppUser.appPin) {
    if (!currentPin) throw new Error('CURRENT_PIN_REQUIRED: Enter your current app PIN')
    const appPinOk = await bcrypt.compare(currentPin, existingAppUser.appPin)
    if (!appPinOk) throw new Error('Current app PIN is incorrect')
  }
  const hashedAppPin = await bcrypt.hash(appPin, 10)
  await prisma.user.update({ where: { id: userId }, data: { appPin: hashedAppPin } })
  return { message: 'App PIN set successfully' }
}

export const verifyAppPin = async (userId: string, appPin: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !user.appPin) throw new Error('App PIN not set')
  const isValid = await bcrypt.compare(appPin, user.appPin)
  if (!isValid) throw new Error('Invalid app PIN')
  return { valid: true }
}

export const verifyTransactionPin = async (userId: string, transactionPin: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  if (!user.transactionPin) throw new Error('Transaction PIN not set')
  const isValid = await bcrypt.compare(transactionPin, user.transactionPin)
  if (!isValid) throw new Error('Invalid transaction PIN')
  return { valid: true }
}