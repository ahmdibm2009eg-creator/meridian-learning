import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is opt-in (benchmarks/debugging); production stays quiet.
    log: process.env.PRISMA_QUERY_LOG === "1" ? ["query"] : ["warn", "error"],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db