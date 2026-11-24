// RideIQ Audit Trail Service
// Append-only audit log for all sensitive actions.

import { prisma } from '../database/index.js';
import { logger } from '../logging/index.js';

export interface AuditLogEntry {
  actorId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: (entry.details ?? {}) as any,
        ipAddress: entry.ipAddress,
      },
    });
  } catch (err) {
    // Audit logging failure must not break the primary operation,
    // but must be loudly reported.
    logger.error({ err, action: entry.action, resourceType: entry.resourceType }, 'Failed to write audit log');
  }
}

export async function getAuditLogs({
  actorId,
  action,
  resourceType,
  limit = 100,
  offset = 0,
}: {
  actorId?: string;
  action?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      actorId,
      action,
      resourceType,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}
