import { Router, Request, Response } from 'express'
import { assignAgentRole, agentCreditMember, getAllMembers, getAgentSummary } from '../services/agent.service'
import { protect } from '../middleware/auth.middleware'

const router = Router()

// POST /api/agent/assign — assign agent role to a user (admin only)
router.post('/assign', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Only admins can assign agent roles' })
      return
    }

    const { userId } = req.body
    if (!userId) {
      res.status(400).json({ success: false, message: 'userId is required' })
      return
    }

    const user = await assignAgentRole(userId)
    res.status(200).json({
      success: true,
      message: 'Agent role assigned successfully',
      data: user
    })

  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// POST /api/agent/collect — agent credits a member wallet
router.post('/collect', protect, async (req: any, res: Response) => {
  try {
    const { memberId, amount, description } = req.body

    if (!memberId || !amount || !description) {
      res.status(400).json({
        success: false,
        message: 'memberId, amount and description are required'
      })
      return
    }

    const result = await agentCreditMember({
      agentId: req.user.userId,
      memberId,
      amount,
      description
    })

    res.status(200).json({
      success: true,
      message: 'Member wallet credited successfully',
      data: result
    })

  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

// GET /api/agent/members — get all contributors
router.get('/members', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'AGENT' && req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Unauthorized' })
      return
    }

    const members = await getAllMembers()
    res.status(200).json({ success: true, data: members })

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Something went wrong' })
  }
})

// GET /api/agent/summary — get agent collection summary
router.get('/summary', protect, async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'AGENT' && req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Unauthorized' })
      return
    }

    const summary = await getAgentSummary(req.user.userId)
    res.status(200).json({ success: true, data: summary })

  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
})

export default router