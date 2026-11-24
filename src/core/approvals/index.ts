// RideIQ Approval Workflow Service
// Enforces server-side approval for sensitive actions.

import { prisma } from '../database/index.js';
import { logger } from '../logging/index.js';
import { createError, ErrorCategory } from '../errors/index.js';
import { auditLog } from '../audit/index.js';

export interface ApprovalRequestData {
  actionType: string;
  requestedBy: string;
  requiredRoles: string[];
  context: Record<string, unknown>;
  idempotencyKey: string;
  expiresInHours?: number;
}

export interface ApprovalDecision {
  approve: boolean;
  approverId: string;
  reason?: string;
}

export async function createApprovalRequest(data: ApprovalRequestData) {
  const expiresAt = data.expiresInHours
    ? new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000); // default 24h

  const request = await prisma.approvalRequest.create({
    data: {
      externalId: data.idempotencyKey,
      actionType: data.actionType,
      requestedBy: data.requestedBy,
      requiredRoles: data.requiredRoles,
      status: 'pending',
      idempotencyKey: data.idempotencyKey,
      expiresAt,
      context: data.context as any,
    },
  });

  await auditLog({
    actorId: data.requestedBy,
    action: 'APPROVAL_REQUEST_CREATED',
    resourceType: 'ApprovalRequest',
    resourceId: request.id,
    details: { actionType: data.actionType, requiredRoles: data.requiredRoles },
  });

  return request;
}

export async function getApprovalRequest(id: string) {
  return prisma.approvalRequest.findUnique({ where: { id } });
}

export async function getApprovalRequestByExternalId(externalId: string) {
  return prisma.approvalRequest.findUnique({ where: { externalId } });
}

export async function decideApproval(
  requestId: string,
  decision: ApprovalDecision,
): Promise<void> {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Approval request not found');
  }
  if (request.status !== 'pending') {
    throw createError(ErrorCategory.VALIDATION_ERROR, `Approval request is already ${request.status}`);
  }
  if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
    throw createError(ErrorCategory.VALIDATION_ERROR, 'Approval request has expired');
  }

  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: {
      status: decision.approve ? 'approved' : 'rejected',
      approverId: decision.approverId,
      approvedAt: new Date(),
    },
  });

  await auditLog({
    actorId: decision.approverId,
    action: decision.approve ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
    resourceType: 'ApprovalRequest',
    resourceId: requestId,
    details: { reason: decision.reason, actionType: request.actionType },
  });
}

export async function requireApproval(
  actionType: string,
  requestedBy: string,
  requiredRoles: string[],
  context: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ approved: boolean; requestId: string }> {
  // Check if an approved request already exists for this idempotency key
  const existing = await prisma.approvalRequest.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    if (existing.status === 'approved') {
      return { approved: true, requestId: existing.id };
    }
    if (existing.status === 'rejected') {
      throw createError(ErrorCategory.APPROVAL_REQUIRED, 'Action was previously rejected');
    }
    if (existing.status === 'expired') {
      throw createError(ErrorCategory.APPROVAL_REQUIRED, 'Previous approval request expired');
    }
    return { approved: false, requestId: existing.id }; // still pending
  }

  // Create new approval request
  const request = await createApprovalRequest({
    actionType,
    requestedBy,
    requiredRoles,
    context,
    idempotencyKey,
  });

  return { approved: false, requestId: request.id };
}

export async function getPendingApprovals() {
  return prisma.approvalRequest.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });
}
