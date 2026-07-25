
import express, { Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import userRoutes from './routes/user.routes'
import walletRoutes from './routes/wallet.routes'
import ajoRoutes from './routes/ajo.routes'
import agentRoutes from './routes/agent.routes'
import kycRoutes from './routes/kyc.routes'
import notificationRoutes from './routes/notification.routes'
import adminRoutes from './routes/admin.routes'
import guaranteedAjoRoutes from './routes/guaranteed-ajo.routes'
import trustRoutes from './routes/trust.routes'
import recoveryRoutes from './routes/recovery.routes'
import faceVerificationRoutes from './routes/face-verification.routes'
import savingsRoutes from './routes/savings.routes'
import cronRoutes from './routes/cron.routes'
const app = express()

app.use(helmet())
app.use(cors({
  origin: [
    'http://localhost:3001',
    'https://owode.xyz',
    'https://www.owode.xyz',
    'https://owode-platform.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.use('/api/users', userRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/ajo', ajoRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/kyc', kycRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/guaranteed-ajo', guaranteedAjoRoutes)
app.use('/api/trust', trustRoutes)
app.use('/api/recovery', recoveryRoutes)
app.use('/api/face', faceVerificationRoutes)
app.use('/api/savings', savingsRoutes)
app.use('/api/cron', cronRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})
app.get('/', (req, res) => {
  res.json({
    message: '🚀 OWODE Alajo Platform API is running!',
    version: '2.0.0',
    status: 'healthy'
  })
})

app.get('/health', async (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`✅ OWODE Server running on port ${PORT}`)
})


console.log('DATABASE_URL:', process.env.DATABASE_URL?.slice(0, 30))

export default app