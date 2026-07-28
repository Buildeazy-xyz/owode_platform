import { Router, Request, Response } from 'express'
import { runAutoDebits } from '../services/savings.service'
import { runAjoReminders } from '../services/user-ajo.service'

const router = Router()

router.post('/auto-debit', async (req: Request, res: Response) => {
  const secret = req.header('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    res.status(401).json({ success: false, message: 'Unauthorized' })
    return
  }
  try {
    const data = await runAutoDebits()
    let reminders = null
    try { reminders = await runAjoReminders() }
    catch (e: any) { console.log('ajo reminders failed:', e?.message) }
    res.status(200).json({ success: true, data, reminders })
  } catch (error: any) {
    console.log('cron auto-debit error:', error?.message)
    res.status(500).json({ success: false, message: error?.message })
  }
})

export default router
