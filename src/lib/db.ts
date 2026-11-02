import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * عميل Prisma موحّد:
 * - DATABASE_URL = prisma+postgres://…  → Prisma Postgres عبر Accelerate (Vercel/السحابة)
 * - DATABASE_URL = postgres://…         → اتصال مباشر (Prisma Postgres مباشر أو أي PostgreSQL)
 */
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL || ''
  if (url.startsWith('prisma+postgres://') || url.startsWith('prisma://')) {
    return new PrismaClient().$extends(withAccelerate()) as unknown as PrismaClient
  }
  return new PrismaClient()
}

export const db =
  globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
