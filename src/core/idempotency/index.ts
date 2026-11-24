// RideIQ Idempotency Manager
// Prevents duplicate execution of state-changing operations.

import { prisma } from '../database/index.js';
import { logger } from '../logging/index.js';
import { createError, ErrorCategory } from '../errors/index.js';

export async function checkIdempotencyKey(
  key: string,
  actionType: string,
): Promise<{ exists: boolean; previousResult?: unknown }> {
  const existing = await prisma.eventOutbox.findFirst({
    where: {
      aggregateType: actionType,
      aggregateId: key,
    },
  });
  return { exists: !!existing };
}

export async function recordIdempotencyKey(
  key: string,
  actionType: string,
  payload: unknown,
): Promise<void> {
  await prisma.eventOutbox.create({
    data: {
      aggregateType: actionType,
      aggregateId: key,
      eventType: 'IDEMPOTENCY_RECORD',
      payload: payload as any,
      status: 'pending',
    },
  });
}

export async function consumeIdempotencyKey<T>(
  key: string,
  actionType: string,
  execute: () => Promise<T>,
): Promise<T> {
  const existing = await prisma.eventOutbox.findFirst({
    where: {
      aggregateType: actionType,
      aggregateId: key,
    },
  });

  if (existing) {
    if (existing.status === 'published') return (existing.payload as any).result as T;
    throw createError(ErrorCategory.IDEMPOTENCY_CONFLICT, 'An operation with this idempotency key is already in progress or failed');
  }

  // Claim the key before any side effect. The database uniqueness constraint closes the race.
  let claim;
  try {
    claim = await prisma.eventOutbox.create({
      data: { aggregateType: actionType, aggregateId: key, eventType: 'ACTION_CLAIMED', status: 'pending', payload: {} },
    });
  } catch (error) {
    if ((error as any)?.code === 'P2002') {
      throw createError(ErrorCategory.IDEMPOTENCY_CONFLICT, 'This idempotency key was claimed concurrently');
    }
    throw error;
  }

  try {
    const result = await execute();
    await prisma.eventOutbox.update({
      where: { id: claim.id },
      data: { eventType: 'ACTION_COMPLETED', status: 'published', payload: { result } as any, publishedAt: new Date() },
    });
    return result;
  } catch (error) {
    await prisma.eventOutbox.update({
      where: { id: claim.id },
      data: { status: 'failed', eventType: 'ACTION_FAILED', payload: { failure: 'Action did not complete' } },
    });
    throw error;
  }
}

export async function markOutboxPublished(id: string): Promise<void> {
  await prisma.eventOutbox.update({
    where: { id },
    data: { status: 'published', publishedAt: new Date() },
  });
}

export async function getPendingOutbox(limit = 100) {
  return prisma.eventOutbox.findMany({
    where: { status: 'pending' },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
}
