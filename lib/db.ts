import { PrismaClient } from '@/app/generated/prisma'
import { PrismaNeon } from '@prisma/adapter-neon'

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Transaction client type — use this in service files to type `tx` parameters
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
