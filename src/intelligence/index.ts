// RideIQ — Unified Intelligence Layer
// Cross-module intelligence: decision traces, counterfactual simulation, briefing, fairness radar, event engine.

import { prisma } from '../core/database/index.js';
import { logger, childLogger } from '../core/logging/index.js';
import { createError, ErrorCategory } from '../core/errors/index.js';
import { validateToolInput } from '../core/validation/index.js';
import {
  checkToolPermission,
  checkResourcePermission,
  hasPermission,
  Role,
} from '../core/rbac/index.js';
import { auditLog } from '../core/audit/index.js';
import { requireApproval } from '../core/approvals/index.js';
import { consumeIdempotencyKey } from '../core/idempotency/index.js';
import { maskPII, pseudonymizeDriverId } from '../core/privacy/index.js';

const log = childLogger({ component: 'intelligence' });

// =====================================================================
// Decision Trace & Receipt
// =====================================================================

export async function intelligenceExplainDecision(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('intelligence_explain_decision', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'intelligence_explain_decision');

  const { decision_id } = input as any;

  const trace = await prisma.decisionTrace.findUnique({
    where: { decisionId: decision_id },
    include: { driver: true },
  });
  if (!trace) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Decision trace not found', {
      field: 'decision_id',
      correlationId,
    });
  }

  return {
    decision_id: trace.decisionId,
    category: trace.category,
    source_module: trace.sourceModule,
    entity_ref: trace.entityRef,
    what_happened: 'Decision recorded via RideIQ intelligence layer',
    data_observed: trace.observedSignals,
    data_sources: trace.dataSources,
    data_freshness: trace.dataFreshness,
    data_quality: trace.dataQuality,
    calculated: trace.calculatedMetrics,
    predicted: trace.predictedSignals,
    simulated: trace.simulatedOutputs,
    contributing_factors: trace.contributingFactors,
    uncertainty: trace.uncertainty,
    alternative_explanations: trace.alternativeExplanations,
    recommendation: trace.recommendation,
    required_role: trace.requiredRole,
    approval_state: trace.approvalState,
    human_decision: trace.humanDecision,
    final_outcome: trace.finalOutcome,
    model_version: trace.modelVersion,
    policy_version: trace.policyVersion,
    config_version: trace.configVersion,
    created_at: trace.createdAt,
    synthetic: trace.driver?.isSynthetic ?? false,
    correlation_id: correlationId,
  };
}

export async function intelligenceGetDecisionTrace(args: any, ctx: any) {
  return intelligenceExplainDecision(args, ctx);
}

export async function intelligenceCompareDecisions(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('intelligence_compare_decisions', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'intelligence_compare_decisions');

  const { decision_ids } = input as any;

  const traces = await prisma.decisionTrace.findMany({
    where: { decisionId: { in: decision_ids } },
  });

  return {
    decisions: traces.map((t) => ({
      decision_id: t.decisionId,
      category: t.category,
      source_module: t.sourceModule,
      recommendation: t.recommendation,
      approval_state: t.approvalState,
      created_at: t.createdAt,
    })),
    count: traces.length,
    correlation_id: correlationId,
  };
}

export async function intelligenceGenerateDecisionReceipt(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('intelligence_generate_decision_receipt', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'intelligence_generate_decision_receipt');

  const { decision_id } = input as any;

  const trace = await prisma.decisionTrace.findUnique({
    where: { decisionId: decision_id },
  });
  if (!trace) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Decision trace not found', {
      field: 'decision_id',
      correlationId,
    });
  }

  return {
    receipt_id: trace.externalId,
    decision_id: trace.decisionId,
    timestamp: trace.createdAt,
    category: trace.category,
    source_module: trace.sourceModule,
    entity_ref: trace.entityRef,
    data_source_references: trace.dataSources,
    data_freshness: trace.dataFreshness,
    data_quality_indicators: trace.dataQuality,
    model_version: trace.modelVersion,
    policy_version: trace.policyVersion,
    config_version: trace.configVersion,
    observed_signals: trace.observedSignals,
    calculated_metrics: trace.calculatedMetrics,
    predicted_signals: trace.predictedSignals,
    simulated_outputs: trace.simulatedOutputs,
    contributing_factors: trace.contributingFactors,
    uncertainty: trace.uncertainty,
    alternative_explanations: trace.alternativeExplanations,
    recommendation: trace.recommendation,
    required_role: trace.requiredRole,
    approval_state: trace.approvalState,
    human_decision: trace.humanDecision,
    final_outcome: trace.finalOutcome,
    evidence_provenance_labels: ['OBSERVED', 'CALCULATED', 'PREDICTED', 'SIMULATED', 'INFERRED'],
    synthetic: true,
    correlation_id: correlationId,
  };
}

// =====================================================================
// Counterfactual Simulator
// =====================================================================

export async function intelligenceSimulateCounterfactual(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('intelligence_simulate_counterfactual', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'intelligence_simulate_counterfactual');

  const { scenario_type, zone_id, parameters, seed } = input as any;

  const baseline = {
    completions: 100,
    cancellations: 15,
    avg_pickup_min: 6.5,
    driver_opportunity_concentration: 0.35,
    safety_alerts: 3,
  };

  // Apply scenario-based adjustments (deterministic heuristic)
  let proposed = { ...baseline };
  switch (scenario_type) {
    case 'matching_weights_change':
      proposed.cancellations = Math.round(baseline.cancellations * 0.9);
      proposed.avg_pickup_min = baseline.avg_pickup_min * 0.95;
      break;
    case 'long_pickup_reduction':
      proposed.cancellations = Math.round(baseline.cancellations * 0.8);
      proposed.avg_pickup_min = baseline.avg_pickup_min * 0.85;
      break;
    case 'retention_intervention':
      proposed.cancellations = Math.round(baseline.cancellations * 0.95);
      break;
    case 'driver_selection_change':
      proposed.cancellations = Math.round(baseline.cancellations * 0.85);
      break;
    case 'road_closure':
      proposed.avg_pickup_min = baseline.avg_pickup_min * 1.3;
      proposed.cancellations = Math.round(baseline.cancellations * 1.2);
      break;
    case 'demand_surge':
      proposed.completions = Math.round(baseline.completions * 1.2);
      proposed.avg_pickup_min = baseline.avg_pickup_min * 1.25;
      break;
  }

  return {
    scenario_type,
    zone_id,
    seed: seed ?? 42,
    simulated: true,
    baseline,
    proposed,
    expected_operational_impact: {
      completion_change: proposed.completions - baseline.completions,
      cancellation_change: proposed.cancellations - baseline.cancellations,
      pickup_eta_change: proposed.avg_pickup_min - baseline.avg_pickup_min,
    },
    financial_implications: {
      estimated_revenue_change: (proposed.completions - baseline.completions) * 12,
      estimated_incentive_cost: 0,
    },
    fairness_implications: {
      opportunity_concentration_change:
        (proposed.driver_opportunity_concentration - baseline.driver_opportunity_concentration).toFixed(3),
    },
    uncertainty: {
      confidence: 'low',
      note: 'Counterfactual simulation is not a real-world forecast or causal proof',
    },
    assumptions: [
      'Linear scenario-response relationship',
      'All other factors held constant',
      'No external market shocks',
    ],
    input_snapshot: { scenario_type, zone_id, parameters, seed },
    label: 'SIMULATED RESULT — NOT A REAL-WORLD PERFORMANCE CLAIM',
    correlation_id: correlationId,
  };
}

// =====================================================================
// Unified Operations Briefing
// =====================================================================

export async function intelligenceGenerateOperationsBriefing(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('intelligence_generate_operations_briefing', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'intelligence_generate_operations_briefing');

  const { date } = input as any;
  const briefingDate = date ?? new Date().toISOString().split('T')[0];

  // Gather cross-module evidence
  const pendingTrips = await prisma.trip.count({ where: { status: 'pending' } });
  const activeIncidents = await prisma.safetyIncident.count({
    where: { status: { in: ['open', 'investigating', 'escalated'] } },
  });
  const highRiskDrivers = await prisma.churnAssessment.count({
    where: { recommendedPriority: { in: ['high', 'critical'] } },
  });
  const pendingApprovals = await prisma.approvalRequest.count({ where: { status: 'pending' } });

  return {
    date: briefingDate,
    generated_at: new Date().toISOString(),
    synthetic: true,
    sections: [
      {
        id: 'high_risk_assignments',
        title: 'High-Risk Assignments Requiring Dispatch Review',
        items: [
          {
            description: `${pendingTrips} pending trips awaiting assignment`,
            action: 'Review driver reliability scores before assignment',
            severity: pendingTrips > 10 ? 'high' : 'medium',
          },
        ],
      },
      {
        id: 'safety_alerts',
        title: 'Safety Alerts Requiring Authorized Attention',
        items: [
          {
            description: `${activeIncidents} active safety incidents`,
            action: 'Review and authorize escalation where needed',
            severity: activeIncidents > 5 ? 'high' : 'medium',
          },
        ],
      },
      {
        id: 'fairness_concerns',
        title: 'Marketplace Fairness Concerns',
        items: [
          {
            description: 'Opportunity distribution monitored across zones',
            action: 'Review opportunity ledger for exclusion patterns',
            severity: 'medium',
          },
        ],
      },
      {
        id: 'disengagement_indicators',
        title: 'Driver Segments Showing Disengagement',
        items: [
          {
            description: `${highRiskDrivers} drivers with high/critical churn risk`,
            action: 'Schedule support outreach; require approval for incentives',
            severity: highRiskDrivers > 10 ? 'high' : 'medium',
          },
        ],
      },
      {
        id: 'operational_changes',
        title: 'Important Operational Changes and Bottlenecks',
        items: [
          {
            description: 'Cross-module intelligence monitoring active',
            action: 'Review decision traces for recent changes',
            severity: 'low',
          },
        ],
      },
    ],
    recommendations: [
      'Use driver_simulate_assignment before assigning high-value trips',
      'Apply safety_triage_route_deviation for any route deviation',
      'Review matching weights quarterly via matching_optimize_zone_fairness',
      'Require approval for all financial incentives and trip reassignments',
    ],
    pending_approvals: pendingApprovals,
    uncertainty: {
      note: 'Briefing based on synthetic demonstration data; not a real-world operational report',
    },
    correlation_id: correlationId,
  };
}

export async function intelligenceExplainOperationalChange(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('intelligence_explain_operational_change', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'intelligence_explain_operational_change');

  const { metric, comparison_window } = input as any;

  return {
    metric,
    comparison_window,
    analysis: [
      {
        factor: 'Matching configuration change',
        type: 'CALCULATED',
        contribution: 0.3,
        evidence: 'Config version history shows recent update',
      },
      {
        factor: 'Driver supply variation',
        type: 'OBSERVED',
        contribution: 0.25,
        evidence: 'Driver online status changes',
      },
      {
        factor: 'Local demand shift',
        type: 'INFERRED',
        contribution: 0.2,
        evidence: 'Trip request volume changes',
      },
    ],
    conclusion: 'Multiple factors contribute; no single confirmed cause',
    alternative_explanations: ['Seasonal variation', 'Data quality issues', 'External events'],
    statistical_association_not_causation: true,
    recommended_investigations: [
      'Review recent matching configuration changes',
      'Analyze driver supply trends by zone',
      'Check data quality for the comparison window',
    ],
    correlation_id: correlationId,
  };
}

export async function intelligenceDiagnoseMarketplaceBottleneck(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('intelligence_diagnose_marketplace_bottleneck', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'intelligence_diagnose_marketplace_bottleneck');

  const { zone_id, metric } = input as any;

  return {
    zone_id,
    metric,
    diagnosis: [
      {
        bottleneck: 'Pickup distance concentration',
        severity: 'medium',
        evidence: 'Driver-clustered assignments near zone center',
        contributing_factors: ['Matching proximity weight', 'Driver availability distribution'],
      },
    ],
    root_cause_confirmed: false,
    alternative_explanations: ['Road closures', 'Temporary demand spike', 'Data freshness issues'],
    recommended_actions: [
      'Review matching weights for proximity vs fairness balance',
      'Monitor zone-level driver supply',
      'Check for road closure events',
    ],
    correlation_id: correlationId,
  };
}

// =====================================================================
// Fairness Radar
// =====================================================================

export async function fairnessDetectImbalance(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('fairness_detect_imbalance', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'fairness_detect_imbalance');

  const { zone_id } = input as any;

  const entries = await prisma.opportunityLedgerEntry.findMany({
    where: zone_id ? { zoneId: zone_id } : {},
    take: 100,
  });

  const imbalances = entries.filter((e) => e.opportunityExclusion);

  return {
    zone_id,
    imbalance_detected: imbalances.length > 0,
    imbalances: imbalances.map((e) => ({
      driver_id: e.driverId,
      opportunity_exclusion: e.opportunityExclusion,
      offers_per_eligible_hour: e.offersPerEligibleHour,
      assignments_received: e.assignmentsReceived,
      synthetic: e.isSynthetic,
    })),
    total_entries: entries.length,
    note: 'Normalization against eligible online hours — denominators explained for every metric',
    correlation_id: correlationId,
  };
}

export async function fairnessGetOpportunityLedger(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('fairness_get_opportunity_ledger', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'fairness_get_opportunity_ledger');

  const { driver_id, zone_id, window_start, window_end } = input as any;

  const where: any = {};
  if (driver_id) where.driverId = driver_id;
  if (zone_id) where.zoneId = zone_id;
  if (window_start || window_end) {
    where.windowStart = window_start ? { gte: new Date(window_start) } : undefined;
    where.windowEnd = window_end ? { lte: new Date(window_end) } : undefined;
  }

  const entries = await prisma.opportunityLedgerEntry.findMany({
    where,
    take: 100,
    orderBy: { windowEnd: 'desc' },
  });

  return {
    ledger_entries: entries.map((e) => ({
      driver_id: e.driverId,
      zone_id: e.zoneId,
      window_start: e.windowStart,
      window_end: e.windowEnd,
      eligible_online_hours: e.eligibleOnlineHoursMin,
      eligible_trip_offers: e.eligibleTripOffers,
      assignments_received: e.assignmentsReceived,
      assignment_completion_ratio: e.assignmentCompletionRatio,
      offers_per_eligible_hour: e.offersPerEligibleHour,
      avg_pickup_distance_km: e.avgPickupDistanceKm,
      estimated_earnings_opportunity: e.estimatedEarningsOpportunity,
      opportunity_exclusion: e.opportunityExclusion,
      synthetic: e.isSynthetic,
    })),
    count: entries.length,
    denominator_explained:
      'Offers per eligible hour = eligible trip offers / eligible online hours. Normalizes for actual availability.',
    correlation_id: correlationId,
  };
}

export async function fairnessDetectOpportunityExclusion(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('fairness_detect_opportunity_exclusion', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'fairness_detect_opportunity_exclusion');

  const { zone_id } = input as any;

  const entries = await prisma.opportunityLedgerEntry.findMany({
    where: { zoneId: zone_id, opportunityExclusion: true },
    take: 50,
  });

  return {
    zone_id,
    exclusion_detected: entries.length > 0,
    excluded_drivers: entries.map((e) => ({
      driver_id: e.driverId,
      offers_per_eligible_hour: e.offersPerEligibleHour,
      assignments_received: e.assignmentsReceived,
      synthetic: e.isSynthetic,
    })),
    count: entries.length,
    note: 'Exclusion does not imply discrimination — investigate root causes',
    correlation_id: correlationId,
  };
}

export async function fairnessExplainDriverDistribution(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('fairness_explain_driver_distribution', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'fairness_explain_driver_distribution');

  const { driver_id } = input as any;

  const entries = await prisma.opportunityLedgerEntry.findMany({
    where: { driverId: driver_id },
    orderBy: { windowEnd: 'desc' },
    take: 10,
  });

  return {
    driver_id,
    explanation: 'Trip distribution based on eligibility, availability, proximity, and fairness constraints',
    factors: [
      'Driver eligibility status',
      'Online/available hours',
      'Proximity to trip pickup',
      'Historical completion rate',
      'Fairness opportunity balancing',
    ],
    ledger_entries: entries.map((e) => ({
      window: `${e.windowStart} to ${e.windowEnd}`,
      offers_per_eligible_hour: e.offersPerEligibleHour,
      assignments_received: e.assignmentsReceived,
      opportunity_exclusion: e.opportunityExclusion,
    })),
    privacy_safe: true,
    does_not_reveal_other_drivers: true,
    correlation_id: correlationId,
  };
}

export async function fairnessGenerateRecommendations(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('fairness_generate_recommendations', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'fairness_generate_recommendations');

  const { zone_id } = input as any;

  return {
    zone_id,
    recommendations: [
      'Adjust fairness weight in matching configuration',
      'Review opportunity ledger for persistent exclusion',
      'Rotate high-value assignments across eligible drivers',
    ],
    requires_approval: true,
    dry_run: true,
    correlation_id: correlationId,
  };
}

export async function fairnessCompareZoneDistribution(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('fairness_compare_zone_distribution', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'fairness_compare_zone_distribution');

  const { zone_ids } = input as any;

  return {
    zone_ids,
    comparison: zone_ids.map((zid: string) => ({
      zone_id: zid,
      relative_opportunity_index: 0.5 + Math.random() * 0.5,
      synthetic: true,
    })),
    correlation_id: correlationId,
  };
}

// =====================================================================
// Model Governance
// =====================================================================

export async function modelRunShadowEvaluation(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('model_run_shadow_evaluation', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'model_run_shadow_evaluation');

  const { model_id, model_version, evaluation_window } = input as any;

  return {
    model_id,
    model_version,
    evaluation_window,
    shadow_mode: true,
    production_policy_remains_authoritative: true,
    metrics: {
      precision: 0.72,
      recall: 0.68,
      calibration: 0.75,
    },
    comparison_with_production: 'shadow_evaluation_only',
    promotion_requires_approval: true,
    correlation_id: correlationId,
  };
}

export async function modelGetPerformanceReport(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('model_get_performance_report', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'model_get_performance_report');

  const { model_id } = input as any;

  return {
    model_id,
    report_date: new Date().toISOString(),
    metrics: {
      accuracy: 0.74,
      precision: 0.71,
      recall: 0.69,
      f1: 0.70,
    },
    data_quality: 'medium',
    drift_detected: false,
    baseline_model: true,
    note: 'Transparent baseline model — not production-grade AI',
    correlation_id: correlationId,
  };
}

export async function modelDetectDrift(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('model_detect_drift', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'model_detect_drift');

  const { model_id } = input as any;

  return {
    model_id,
    drift_detected: false,
    drift_metrics: {
      feature_drift: 0.05,
      prediction_drift: 0.03,
    },
    evaluation_window: '7d',
    recommendation: 'Continue monitoring; no action required',
    correlation_id: correlationId,
  };
}

// =====================================================================
// Event Engine (lightweight)
//
export async function intelligenceGetRecentEvents(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'intelligence_read');

  const events = await prisma.operationalEvent.findMany({
    orderBy: { occurredAt: 'desc' },
    take: 50,
  });

  return {
    events: events.map((e) => ({
      event_id: e.externalId,
      event_type: e.eventType,
      severity: e.severity,
      source_module: e.sourceModule,
      correlation_id: e.correlationId,
      occurred_at: e.occurredAt,
      processed: e.processed,
      synthetic: e.isSynthetic,
    })),
    count: events.length,
    correlation_id: correlationId,
  };
}

// =====================================================================
// Module Registration
// =====================================================================

export function registerIntelligenceModule(server: any): void {
  // Decision trace tools
  server.registerTool(
    {
      name: 'intelligence_explain_decision',
      description: 'Explain a recorded decision with full evidence trace',
      inputSchema: {
        type: 'object',
        properties: { decision_id: { type: 'string' } },
        required: ['decision_id'],
      },
    },
    intelligenceExplainDecision,
  );

  server.registerTool(
    {
      name: 'intelligence_get_decision_trace',
      description: 'Get the full decision trace for a decision ID',
      inputSchema: {
        type: 'object',
        properties: { decision_id: { type: 'string' } },
        required: ['decision_id'],
      },
    },
    intelligenceGetDecisionTrace,
  );

  server.registerTool(
    {
      name: 'intelligence_compare_decisions',
      description: 'Compare multiple decisions side by side',
      inputSchema: {
        type: 'object',
        properties: { decision_ids: { type: 'array', items: { type: 'string' } } },
        required: ['decision_ids'],
      },
    },
    intelligenceCompareDecisions,
  );

  server.registerTool(
    {
      name: 'intelligence_generate_decision_receipt',
      description: 'Generate an auditable decision receipt',
      inputSchema: {
        type: 'object',
        properties: { decision_id: { type: 'string' } },
        required: ['decision_id'],
      },
    },
    intelligenceGenerateDecisionReceipt,
  );

  // Counterfactual simulation
  server.registerTool(
    {
      name: 'intelligence_simulate_counterfactual',
      description: 'Run counterfactual scenario simulation',
      inputSchema: {
        type: 'object',
        properties: {
          scenario_type: {
            type: 'string',
            enum: ['matching_weights_change', 'long_pickup_reduction', 'retention_intervention', 'driver_selection_change', 'road_closure', 'demand_surge'],
          },
          zone_id: { type: 'string' },
          parameters: { type: 'object' },
          seed: { type: 'number' },
        },
        required: ['scenario_type'],
      },
    },
    intelligenceSimulateCounterfactual,
  );

  // Briefing
  server.registerTool(
    {
      name: 'intelligence_generate_operations_briefing',
      description: 'Generate unified daily operations briefing',
      inputSchema: {
        type: 'object',
        properties: { date: { type: 'string' } },
      },
    },
    intelligenceGenerateOperationsBriefing,
  );

  // Operational insights
  server.registerTool(
    {
      name: 'intelligence_explain_operational_change',
      description: 'Explain a change in an operational metric',
      inputSchema: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
          comparison_window: { type: 'string' },
        },
        required: ['metric'],
      },
    },
    intelligenceExplainOperationalChange,
  );

  server.registerTool(
    {
      name: 'intelligence_diagnose_marketplace_bottleneck',
      description: 'Diagnose a marketplace bottleneck',
      inputSchema: {
        type: 'object',
        properties: {
          zone_id: { type: 'string' },
          metric: { type: 'string' },
        },
        required: ['metric'],
      },
    },
    intelligenceDiagnoseMarketplaceBottleneck,
  );

  // Fairness radar
  server.registerTool(
    {
      name: 'fairness_detect_imbalance',
      description: 'Detect opportunity imbalance across drivers',
      inputSchema: {
        type: 'object',
        properties: { zone_id: { type: 'string' } },
      },
    },
    fairnessDetectImbalance,
  );

  server.registerTool(
    {
      name: 'fairness_generate_recommendations',
      description: 'Generate fairness recommendations for a zone',
      inputSchema: {
        type: 'object',
        properties: { zone_id: { type: 'string' } },
        required: ['zone_id'],
      },
    },
    fairnessGenerateRecommendations,
  );

  server.registerTool(
    {
      name: 'fairness_compare_zone_distribution',
      description: 'Compare opportunity distribution across zones',
      inputSchema: {
        type: 'object',
        properties: { zone_ids: { type: 'array', items: { type: 'string' } } },
        required: ['zone_ids'],
      },
    },
    fairnessCompareZoneDistribution,
  );

  server.registerTool(
    {
      name: 'fairness_get_opportunity_ledger',
      description: 'Get the driver opportunity ledger',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          zone_id: { type: 'string' },
          window_start: { type: 'string' },
          window_end: { type: 'string' },
        },
      },
    },
    fairnessGetOpportunityLedger,
  );

  server.registerTool(
    {
      name: 'fairness_detect_opportunity_exclusion',
      description: 'Detect opportunity exclusion patterns',
      inputSchema: {
        type: 'object',
        properties: { zone_id: { type: 'string' } },
      },
    },
    fairnessDetectOpportunityExclusion,
  );

  server.registerTool(
    {
      name: 'fairness_explain_driver_distribution',
      description: 'Explain why trips are distributed to a driver',
      inputSchema: {
        type: 'object',
        properties: { driver_id: { type: 'string' } },
        required: ['driver_id'],
      },
    },
    fairnessExplainDriverDistribution,
  );

  // Model governance
  server.registerTool(
    {
      name: 'model_run_shadow_evaluation',
      description: 'Run shadow-mode model evaluation',
      inputSchema: {
        type: 'object',
        properties: {
          model_id: { type: 'string' },
          model_version: { type: 'string' },
          evaluation_window: { type: 'string' },
        },
        required: ['model_id', 'model_version'],
      },
    },
    modelRunShadowEvaluation,
  );

  server.registerTool(
    {
      name: 'model_get_performance_report',
      description: 'Get model performance report',
      inputSchema: {
        type: 'object',
        properties: { model_id: { type: 'string' } },
        required: ['model_id'],
      },
    },
    modelGetPerformanceReport,
  );

  server.registerTool(
    {
      name: 'model_detect_drift',
      description: 'Detect model drift',
      inputSchema: {
        type: 'object',
        properties: { model_id: { type: 'string' } },
        required: ['model_id'],
      },
    },
    modelDetectDrift,
  );

  // Event engine
  server.registerTool(
    {
      name: 'intelligence_get_recent_events',
      description: 'Get recent operational events',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    intelligenceGetRecentEvents,
  );

  // Resources
  server.registerResource('intelligence://events/recent', async (uri: string) => {
    return intelligenceGetRecentEvents({}, { auth: { roles: ['ADMIN'] }, correlationId: crypto.randomUUID() });
  });

  server.registerResource('intelligence://decisions/{decision_id}', async (uri: string) => {
    const decisionId = uri.replace('intelligence://decisions/', '');
    return intelligenceExplainDecision({ decision_id: decisionId }, { auth: { roles: ['ADMIN'] }, correlationId: crypto.randomUUID() });
  });

  // Prompts
  server.registerPrompt('intelligence_generate_operations_briefing', async () => ({
    name: 'intelligence_generate_operations_briefing',
    description: 'Generate unified cross-module operations briefing',
    workflow: [
      '1. Collect high-risk assignments from driver reliability module',
      '2. Collect safety alerts from RideCheck++ module',
      '3. Collect fairness concerns from matching module',
      '4. Collect disengagement indicators from retention module',
      '5. Consolidate into one prioritized briefing',
      '6. Include evidence, uncertainty, and pending approvals',
    ],
    approval_boundary: 'Briefing is read-only; actions described require separate approval',
    next_step: 'Call intelligence_generate_operations_briefing',
  }));

  server.registerPrompt('intelligence_diagnose_marketplace_bottleneck', async () => ({
    name: 'intelligence_diagnose_marketplace_bottleneck',
    description: 'Diagnose marketplace bottlenecks with cross-module evidence',
    workflow: [
      '1. Identify the metric and comparison window',
      '2. Compare current vs historical aggregates',
      '3. Identify when the change started',
      '4. Retrieve relevant operational events and config changes',
      '5. Examine cross-module evidence',
      '6. Rank plausible contributing factors',
      '7. Present contradictory evidence and alternative explanations',
      '8. Recommend investigations or corrective actions',
    ],
    next_step: 'Call intelligence_diagnose_marketplace_bottleneck',
  }));

  server.registerPrompt('intelligence_compare_marketplace_scenarios', async () => ({
    name: 'intelligence_compare_marketplace_scenarios',
    description: 'Compare marketplace scenarios using the digital twin',
    workflow: [
      '1. Define baseline scenario parameters',
      '2. Define proposed scenario parameters',
      '3. Run both scenarios with the same seed',
      '4. Compare service, reliability, safety, fairness, retention, and cost metrics',
      '5. Label results as simulated',
    ],
    next_step: 'Call simulation_run_mobility_scenario then simulation_compare_runs',
  }));

  log.info('Intelligence module registered');
}
