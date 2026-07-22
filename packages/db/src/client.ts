import { PrismaClient } from "@prisma/client";

/**
 * A single shared PrismaClient per process. In dev with hot-reload we cache it on
 * globalThis to avoid exhausting the connection pool across reloads.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient } from "@prisma/client";
