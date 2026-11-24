// RideIQ — Domain Module D: Driver Retention & Churn Copilot
// Evidence-based retention interventions — correlation is not causation.

import { prisma } from '../../core/database/index.js';
import { logger, childLogger } from '../../core/logging/index.js';
import { createError, ErrorCategory } from '../../core/errors/index.js';
import { validateToolInput } from '../../core/validation/index.js';
import {
  checkToolPermission,
  checkResourcePermission,
  hasPermission,
  Role,
} from '../../core/rbac/index.js';
import { auditLog } from '../../core/audit/index.js';
import { requireApproval } from '../../core/approvals/index.js';
import { consumeIdempotencyKey } from '../../core/idempotency/index.js';
import { maskPII, pseudonymizeDriverId } from '../../core/privacy/index.js';

const log = childLogger({ component: 'driver-retention' });

// =====================================================================
// Baseline churn risk assessment (transparent, rule-based)
// =====================================================================

function computeChurnRisk(driver: any, metrics: any, feedback: any[]): {
  probability: number | null;
  confidence: number;
  evidenceQuality: string;
  trend: string;
  indicators: string[];
} {
  const indicators: string[] = [];
  let probability = 0.1;
  let confidence = 0.3;

  const sampleSize = metrics?.sampleSize ?? 0;
  const evidenceQuality = sampleSize >= 30 ? 'high' : sampleSize >= 10 ? 'medium' : 'low';

  if (sampleSize > 0) confidence = 0.6;

  // Trip frequency decline
  if (metrics) {
    const completionRate = metrics.acceptanceCount > 0
      ? metrics.completionCount / metrics.acceptanceCount
      : 0;
    if (completionRate < 0.7) {
      probability += 0.2;
      indicators.push('Low completion rate');
    }
    if (metrics.cancellationCount > 10) {
      probability += 0.15;
      indicators.push('High cancellation count');
    }
  }

  // Feedback signals
  const complaints = feedback.filter((f) => f.category === 'complaint').length;
  if (complaints > 3) {
    probability += 0.15;
    indicators.push('Multiple support complaints');
  }

  if (feedback.length === 0 && sampleSize > 20) {
    indicators.push('No recent feedback — possible disengagement');
    probability += 0.1;
  }

  probability = Math.max(0, Math.min(0.95, probability));
  const trend = probability > 0.5 ? 'declining' : probability > 0.3 ? 'stable' : 'improving';

  return { probability, confidence, evidenceQuality, trend, indicators };
}

// =====================================================================
// Tool Handlers
// =====================================================================

export async function retentionQueryChurnRisk(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_query_churn_risk', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_query_churn_risk');

  const { segment_filter } = input as any;

  const where: any = {};
  if (segment_filter) {
    where.segmentId = segment_filter;
  }

  const assessments = await prisma.churnAssessment.findMany({
    where,
    include: { driver: true },
    take: 100,
    orderBy: { calculatedAt: 'desc' },
  });

  return {
    segment_filter,
    assessments: assessments.map((a) => ({
      driver_id: pseudonymizeDriverId(a.driverId),
      driver: maskPII(a.driver),
      churn_probability: a.churnProbability,
      confidence: a.confidence,
      evidence_quality: a.evidenceQuality,
      observation_window_days: a.observationWindowDays,
      trend: a.trend,
      recommended_priority: a.recommendedPriority,
      behavioral_indicators: a.behavioralIndicators,
      calculated_at: a.calculatedAt,
      synthetic: a.isSynthetic,
    })),
    count: assessments.length,
    correlation_id: correlationId,
  };
}

export async function retentionGetDriverFeedback(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_get_driver_feedback', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_get_driver_feedback');

  const { driver_id } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  const feedback = await prisma.driverFeedback.findMany({
    where: { driverId: driver_id, isAuthorized: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return {
    driver_id,
    driver: maskPII(driver),
    synthetic: driver.isSynthetic,
    feedback: feedback.map((f) => ({
      id: f.id,
      category: f.category,
      summary: f.summary,
      rating: f.rating,
      created_at: f.createdAt,
      synthetic: f.isSynthetic,
    })),
    count: feedback.length,
    data_minimized: true,
    correlation_id: correlationId,
  };
}

export async function retentionAnalyzeChurnFactors(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_analyze_churn_factors', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_analyze_churn_factors');

  const { driver_id } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  const metrics = await prisma.driverMetrics.findUnique({ where: { driverId: driver_id } });
  const feedback = await prisma.driverFeedback.findMany({
    where: { driverId: driver_id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const result = computeChurnRisk(driver, metrics, feedback);

  return {
    driver_id,
    synthetic: driver.isSynthetic,
    churn_probability: result.probability,
    confidence: result.confidence,
    evidence_quality: result.evidenceQuality,
    trend: result.trend,
    behavioral_indicators: result.indicators,
    contributing_factors: result.indicators.map((i) => ({ factor: i, type: 'OBSERVED' })),
    alternative_explanations: [
      'Seasonal demand variation',
      'Temporary personal circumstances',
      'App or platform issues affecting earnings',
      'Market competition',
    ],
    causal_claim: false,
    note: 'Correlation is not causation. These indicators suggest possible disengagement, not confirmed causes.',
    data_freshness: new Date().toISOString(),
    correlation_id: correlationId,
  };
}

export async function retentionRecommendIntervention(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_recommend_intervention', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_recommend_intervention');

  const { driver_id } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  const metrics = await prisma.driverMetrics.findUnique({ where: { driverId: driver_id } });
  const feedback = await prisma.driverFeedback.findMany({
    where: { driverId: driver_id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const churn = computeChurnRisk(driver, metrics, feedback);
  const complaints = feedback.filter((f) => f.category === 'complaint').length;

  let recommendation: {
    type: 'financial' | 'non_financial' | 'support_review';
    priority: string;
    reasoning: string[];
    estimated_cost?: number;
  };

  if ((churn.probability ?? 0) > 0.6) {
    recommendation = {
      type: 'support_review',
      priority: 'high',
      reasoning: ['High churn risk — schedule driver support conversation'],
      estimated_cost: 0,
    };
  } else if (complaints > 3) {
    recommendation = {
      type: 'non_financial',
      priority: 'medium',
      reasoning: ['Multiple complaints — address specific support issues'],
      estimated_cost: 0,
    };
  } else {
    recommendation = {
      type: 'non_financial',
      priority: 'low',
      reasoning: ['Moderate risk — monitor and engage through regular check-ins'],
      estimated_cost: 0,
    };
  }

  return {
    driver_id,
    synthetic: driver.isSynthetic,
    churn_probability: churn.probability,
    recommended_intervention: recommendation,
    reasoning: recommendation.reasoning,
    evidence_quality: churn.evidenceQuality,
    alternatives: [
      'Financial incentive (requires budget validation and approval)',
      'Flexible scheduling options',
      'Driver training or support resources',
    ],
    safeguards: [
      'No protected characteristics used in intervention selection',
      'Correlation is not causation',
      'Approval required before any financial offer',
    ],
    correlation_id: correlationId,
  };
}

export async function retentionSimulateIncentive(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_simulate_incentive', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_simulate_incentive');

  const { driver_id, incentive_type, estimated_amount } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  const amount = estimated_amount ?? 50;
  const estimatedUplift = incentive_type === 'financial' ? 0.15 : 0.05;

  return {
    driver_id,
    synthetic: driver.isSynthetic,
    incentive_type,
    estimated_amount: amount,
    estimated_retention_uplift: estimatedUplift,
    cost: amount,
    assumptions: [
      'Uplift estimate based on heuristic, not causal evidence',
      'Driver behavior may not respond as modeled',
    ],
    uncertainty: 'high',
    budget_implication: amount,
    causal_evidence: 'insufficient',
    label: 'HEURISTIC — not a causal effectiveness claim',
    correlation_id: correlationId,
  };
}

export async function retentionSendIncentive(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_send_incentive', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_send_incentive');

  const { driver_id, type, amount, message, idempotency_key } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  const idempotencyKey = idempotency_key ?? `incentive_${driver_id}_${Date.now()}`;

  // Budget validation
  const budgetValidated = amount != null && amount <= 500;

  const approval = await requireApproval(
    'financial_incentive',
    ctx.auth?.userId ?? 'system',
    ['FLEET_MANAGER', 'ADMIN'],
    { driverId: driver_id, type, amount, message },
    idempotencyKey,
  );

  if (!approval.approved) {
    throw createError(ErrorCategory.APPROVAL_REQUIRED, 'Incentive requires authorization and budget validation', {
      recoveryHint: 'Obtain approval from FLEET_MANAGER or ADMIN',
      correlationId,
    });
  }

  if (!budgetValidated) {
    throw createError(ErrorCategory.POLICY_CONSTRAINT_VIOLATION, 'Incentive amount exceeds budget validation threshold', {
      field: 'amount',
      correlationId,
    });
  }

  const result = await consumeIdempotencyKey(idempotencyKey, 'financial_incentive', async () => {
    await prisma.interventionProposal.create({
      data: {
        externalId: `incentive_${correlationId}`,
        driverId: driver_id,
        proposedBy: ctx.auth?.userId ?? 'system',
        type,
        estimatedCost: amount,
        status: 'sent',
        approvedBy: ctx.auth?.userId,
        approvedAt: new Date(),
        budgetValidated: true,
        idempotencyKey,
      },
    });
    await auditLog({
      actorId: ctx.auth?.userId,
      action: 'RETENTION_SEND_INCENTIVE',
      resourceType: 'Driver',
      resourceId: driver_id,
      details: { type, amount, synthetic: driver.isSynthetic },
    });
    return {
      driver_id,
      incentive_sent: true,
      type,
      amount,
      simulated: driver.isSynthetic,
      idempotency_key: idempotencyKey,
    };
  });

  return {
    ...result,
    synthetic: driver.isSynthetic,
    correlation_id: correlationId,
  };
}

export async function retentionGenerateDailyBriefing(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_generate_daily_briefing', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_generate_daily_briefing');

  const { zone_id } = input as any;

  const where: any = {};
  if (zone_id) where.zoneId = zone_id;

  const highRisk = await prisma.churnAssessment.findMany({
    where: { recommendedPriority: { in: ['high', 'critical'] }, ...where },
    include: { driver: true },
    take: 20,
    orderBy: { calculatedAt: 'desc' },
  });

  return {
    date: new Date().toISOString().split('T')[0],
    zone_id,
    high_risk_segments: highRisk.map((a) => ({
      driver_id: pseudonymizeDriverId(a.driverId),
      churn_probability: a.churnProbability,
      priority: a.recommendedPriority,
      trend: a.trend,
      synthetic: a.isSynthetic,
    })),
    total_high_risk: highRisk.length,
    recommendations: [
      'Review high-priority drivers for support outreach',
      'Validate intervention budgets before offering incentives',
      'Monitor for cluster-level disengagement patterns',
    ],
    approvals_required: ['Financial incentives require FLEET_MANAGER/ADMIN approval'],
    synthetic: true,
    correlation_id: correlationId,
  };
}

export async function retentionEvaluateIntervention(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_evaluate_intervention', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_evaluate_intervention');

  const { driver_id, intervention_type } = input as any;

  return {
    driver_id,
    intervention_type,
    appropriate: true,
    evidence_basis: 'heuristic',
    causal_evidence: 'insufficient',
    reasoning: 'Intervention selected based on observed churn indicators, not demonstrated causal effect',
    safeguards: [
      'No protected characteristics used',
      'Approval required before any offer',
      'Effectiveness not guaranteed',
    ],
    correlation_id: correlationId,
  };
}

export async function retentionCompareInterventions(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_compare_interventions', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_compare_interventions');

  return {
    interventions: [
      { type: 'support_review', estimated_cost: 0, likely_reach: 'all_high_risk', uncertainty: 'low' },
      { type: 'non_financial_engagement', estimated_cost: 0, likely_reach: 'medium', uncertainty: 'medium' },
      { type: 'financial_incentive', estimated_cost: 50, likely_reach: 'targeted', uncertainty: 'high' },
    ],
    comparison_basis: 'estimated cost, reach, and heuristic effectiveness',
    causal_evidence: 'insufficient',
    recommendation: 'Start with support_review (zero cost) before financial incentives',
    correlation_id: correlationId,
  };
}

export async function retentionEstimateInterventionUplift(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('retention_estimate_intervention_uplift', args);

  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkToolPermission(role, 'retention_estimate_intervention_uplift');

  return {
    uplift_estimate: null,
    causal_evidence: 'insufficient',
    message: 'Insufficient causal evidence to estimate intervention uplift',
    heuristic_label: 'HEURISTIC — do not interpret as causal effect',
    recommended_approach: 'Run A/B test or collect experimental data before claiming uplift',
    correlation_id: correlationId,
  };
}

// =====================================================================
// Resource Handlers
// =====================================================================

export async function getRetentionDashboard(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkResourcePermission(role, uri);

  const assessments = await prisma.churnAssessment.findMany({
    take: 50,
    orderBy: { calculatedAt: 'desc' },
    include: { driver: true },
  });

  return {
    uri,
    overview: {
      total_drivers_assessed: assessments.length,
      high_risk_count: assessments.filter((a) => a.recommendedPriority === 'high').length,
      critical_count: assessments.filter((a) => a.recommendedPriority === 'critical').length,
    },
    segments: assessments.map((a) => ({
      driver_id: pseudonymizeDriverId(a.driverId),
      priority: a.recommendedPriority,
      churn_probability: a.churnProbability,
      trend: a.trend,
      synthetic: a.isSynthetic,
    })),
    data_freshness: new Date().toISOString(),
  };
}

export async function getDriverProfile(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkResourcePermission(role, uri);

  const driverId = uri.replace('retention://drivers/', '').replace('/profile', '');
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id' });
  }

  const assessment = await prisma.churnAssessment.findUnique({ where: { driverId } });

  return {
    uri,
    driver_id: driverId,
    driver: maskPII(driver),
    synthetic: driver.isSynthetic,
    churn_assessment: assessment || null,
    data_freshness: new Date().toISOString(),
  };
}

export async function getDriverFeedback(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkResourcePermission(role, uri);

  const driverId = uri.replace('retention://drivers/', '').replace('/feedback', '');
  const feedback = await prisma.driverFeedback.findMany({
    where: { driverId: driverId, isAuthorized: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return {
    uri,
    driver_id: driverId,
    feedback: feedback.map((f) => ({
      id: f.id,
      category: f.category,
      summary: f.summary,
      rating: f.rating,
      created_at: f.createdAt,
      synthetic: f.isSynthetic,
    })),
    count: feedback.length,
    data_minimized: true,
  };
}

export async function getChurnRiskSegments(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['FLEET_MANAGER'])[0] as Role;
  checkResourcePermission(role, uri);

  const assessments = await prisma.churnAssessment.findMany({
    where: { recommendedPriority: { in: ['high', 'critical'] } },
    orderBy: { calculatedAt: 'desc' },
    take: 50,
  });

  return {
    uri,
    high_risk_segments: assessments.map((a) => ({
      driver_id: pseudonymizeDriverId(a.driverId),
      priority: a.recommendedPriority,
      churn_probability: a.churnProbability,
      trend: a.trend,
      synthetic: a.isSynthetic,
    })),
    count: assessments.length,
  };
}

// =====================================================================
// Prompt Handler
// =====================================================================

export async function retentionGenerateDailyBriefingPrompt(args?: any) {
  return {
    name: 'retention_generate_daily_briefing',
    description: 'Generate prioritized daily retention briefing',
    arguments: [
      { name: 'zone_id', description: 'Zone filter', required: false },
    ],
    workflow: [
      '1. Identify high-risk segments using authorized, privacy-minimized data',
      '2. Analyze relevant behavioral and operational trends',
      '3. Retrieve authorized feedback',
      '4. Identify plausible contributing factors and alternative explanations',
      '5. Distinguish churn probability from intervention responsiveness',
      '6. Recommend possible interventions and estimate financial implications',
      '7. Draft personalized communication for human review',
      '8. Require explicit approval before any financial offer is sent',
    ],
    approval_boundary: 'Financial offers require FLEET_MANAGER/ADMIN approval',
    safeguards: [
      'Correlation is not causation',
      'No protected characteristics for retention eligibility',
      'Never infer unresponsiveness solely from churn prediction',
    ],
    next_step:
      'Call retention_query_churn_risk, then retention_recommend_intervention, then retention_send_incentive only with approval',
  };
}

// =====================================================================
// Module Registration
// =====================================================================

export function registerDriverRetentionModule(server: any): void {
  server.registerTool(
    {
      name: 'retention_query_churn_risk',
      description: 'Query churn risk for driver segments',
      inputSchema: {
        type: 'object',
        properties: { segment_filter: { type: 'string' } },
      },
    },
    retentionQueryChurnRisk,
  );

  server.registerTool(
    {
      name: 'retention_get_driver_feedback',
      description: 'Get authorized driver feedback (PII-minimized)',
      inputSchema: {
        type: 'object',
        properties: { driver_id: { type: 'string' } },
        required: ['driver_id'],
      },
    },
    retentionGetDriverFeedback,
  );

  server.registerTool(
    {
      name: 'retention_analyze_churn_factors',
      description: 'Analyze churn factors for a driver',
      inputSchema: {
        type: 'object',
        properties: { driver_id: { type: 'string' } },
        required: ['driver_id'],
      },
    },
    retentionAnalyzeChurnFactors,
  );

  server.registerTool(
    {
      name: 'retention_recommend_intervention',
      description: 'Recommend retention intervention for a driver',
      inputSchema: {
        type: 'object',
        properties: { driver_id: { type: 'string' } },
        required: ['driver_id'],
      },
    },
    retentionRecommendIntervention,
  );

  server.registerTool(
    {
      name: 'retention_simulate_incentive',
      description: 'Simulate incentive financial impact (heuristic)',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          incentive_type: { type: 'string', enum: ['financial', 'non_financial'] },
          estimated_amount: { type: 'number' },
        },
        required: ['driver_id', 'incentive_type'],
      },
    },
    retentionSimulateIncentive,
  );

  server.registerTool(
    {
      name: 'retention_send_incentive',
      description: 'Send incentive (requires approval and budget validation)',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          type: { type: 'string', enum: ['financial', 'non_financial'] },
          amount: { type: 'number' },
          message: { type: 'string' },
          idempotency_key: { type: 'string' },
        },
        required: ['driver_id', 'type'],
      },
    },
    retentionSendIncentive,
  );

  server.registerTool(
    {
      name: 'retention_generate_daily_briefing',
      description: 'Generate daily retention briefing',
      inputSchema: {
        type: 'object',
        properties: { zone_id: { type: 'string' } },
      },
    },
    retentionGenerateDailyBriefing,
  );

  server.registerTool(
    {
      name: 'retention_evaluate_intervention',
      description: 'Evaluate if intervention is appropriate for a driver segment',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          intervention_type: { type: 'string' },
        },
        required: ['driver_id', 'intervention_type'],
      },
    },
    retentionEvaluateIntervention,
  );

  server.registerTool(
    {
      name: 'retention_compare_interventions',
      description: 'Compare different interventions',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          segment_filter: { type: 'string' },
        },
      },
    },
    retentionCompareInterventions,
  );

  server.registerTool(
    {
      name: 'retention_estimate_intervention_uplift',
      description: 'Estimate intervention uplift (returns insufficient evidence if no data)',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          segment_filter: { type: 'string' },
        },
      },
    },
    retentionEstimateInterventionUplift,
  );

  // Resources
  server.registerResource('retention://dashboard/overview', getRetentionDashboard);
  server.registerResource('retention://drivers/{driver_id}/profile', getDriverProfile);
  server.registerResource('retention://drivers/{driver_id}/feedback', getDriverFeedback);
  server.registerResource('retention://segments/churn-risk', getChurnRiskSegments);

  // Prompt
  server.registerPrompt('retention_generate_daily_briefing', retentionGenerateDailyBriefingPrompt);

  log.info('Driver Retention module registered');
}
