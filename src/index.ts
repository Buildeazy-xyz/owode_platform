import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Create express app
const app = express()

// Middleware — security and request parsing
app.use(helmet())
app.use(cors())
app.use(express.json())

// Health check route — tells you the server is alive
app.get('/', (req, res) => {
  res.json({
    message: '🚀 OWODE Alajo Platform API is running!',
    version: '1.0.0',
    status: 'healthy'
  })
})

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`✅ OWODE Server running on port ${PORT}`)
})

export default app