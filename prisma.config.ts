import { defineConfig } from 'prisma/config'
import { PrismaPg } from '@prisma/adapter-pg'

export default defineConfig({
  earlyAccess: true,
  migrate: {
    async adapter() {
      const connectionString = process.env.DATABASE_URL!
      return new PrismaPg({ connectionString })
    }
  }
})