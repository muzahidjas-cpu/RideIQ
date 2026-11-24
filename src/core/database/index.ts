// RideIQ Database Connection Manager
// Singleton Prisma client with transaction support.

import { PrismaClient } from '@prisma/client';
import { logger } from '../logging/index.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : [] });

if (globalForPrisma.prisma === undefined) {
  globalForPrisma.prisma = prisma;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export type Tx = Parameters<typeof prisma.$transaction>[0];
