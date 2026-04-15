import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database'

export const protect = async (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Unauthorized' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'owode_secret')
    
    // Always fetch fresh role from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    })

    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' })
      return
    }

    req.user = { userId: user.id, role: user.role }
    next()
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' })
  }
}