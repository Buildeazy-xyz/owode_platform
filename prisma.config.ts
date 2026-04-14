import path from 'path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: 'postgresql://apple@localhost:5432/owodealajo_db?schema=public'
  },
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg')
      const connectionString = 'postgresql://apple@localhost:5432/owodealajo_db?schema=public'
      return new PrismaPg({ connectionString })
    }
  }
})