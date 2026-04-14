import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const connectionString = 'postgresql://apple@localhost:5432/owodealajo_db?schema=public'

const adapter = new PrismaPg({ connectionString })

export const prisma = new PrismaClient({ adapter } as any)