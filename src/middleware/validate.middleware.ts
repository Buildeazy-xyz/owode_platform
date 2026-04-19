import { body, validationResult } from 'express-validator'
import { Request, Response, NextFunction } from 'express'

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    })
    return
  }
  next()
}

export const registerValidation = [
  body('fullName').trim().notEmpty().withMessage('Full name is required').isLength({ min: 2 }).withMessage('Full name too short'),
  body('phone').trim().matches(/^0[0-9]{10}$/).withMessage('Invalid Nigerian phone number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters').matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/).withMessage('Password must contain letters and numbers')
]

export const loginValidation = [
  body('phone').trim().matches(/^0[0-9]{10}$/).withMessage('Invalid phone number'),
  body('password').notEmpty().withMessage('Password is required')
]