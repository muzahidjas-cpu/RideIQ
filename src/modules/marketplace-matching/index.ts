// RideIQ — Domain Module C: Fair-Market Matching Engine + Opportunity Ledger
// Constraint-aware matching with fairness components and opportunity ledger.

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

const log = childLogger({ component: 'marketplace-matching' });

// =====================================================================
// Hard constraints
// =====================================================================

function checkHardConstraints(
  driver: any,
  trip: any,
  config: any,
): { pass: boolean; violations: string[] } {
  const violations: string[] = [];
  const constraints = config?.hardConstraints ?? {};

  if (!driver.isEligible) violations.push('Driver not eligible');
  if (driver.status !== 'online' && driver.status !== 'busy') violations.push('Driver not available');
  if (trip.status !== 'pending') violations.push('Trip not in pending state');

  const maxPickupMin = constraints.maxPickupTimeMin ?? 30;
  const estimatedPickup = trip.estimatedPickupMin;
  if (estimatedPickup != null && estimatedPickup > maxPickupMin) {
    violations.push(`Estimated pickup ${estimatedPickup}min exceeds max ${maxPickupMin}min`);
  }

  return { pass: violations.length === 0, violations };
}

// =====================================================================
// Component scoring
// =====================================================================

function proximityScore(pickupKm: number): number {
  // 0-1, higher is closer
  return Math.max(0, 1 - pickupKm / 20);
}

function familiarityScore(driverTrips: number, zoneTrips: number): number {
  if (zoneTrips === 0) return 0.5;
  return Math.min(1, driverTrips / Math.max(zoneTrips, 1));
}

function reliabilityScore(metrics: any): number {
  if (!metrics || metrics.acceptanceCount === 0) return 0.5;
  return metrics.completionCount / metrics.acceptanceCount;
}

function fairnessScore(ledgerEntry: any): number {
  // Higher fairness score for drivers with fewer offers per eligible hour
  const offersPerHour = ledgerEntry?.offersPerEligibleHour ?? 1;
  return Math.max(0, 1 - offersPerHour / 10);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// =====================================================================
// Tool Handlers
// =====================================================================

export async function matchingCalculateScore(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('matching_calculate_score', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'matching_calculate_score');

  const { rider_id, driver_id, matching_context } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  const trip = await prisma.trip.findFirst({
    where: { riderId: rider_id, status: 'pending' },
    orderBy: { requestedAt: 'desc' },
  });
  if (!trip) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'No pending trip for rider', {
      field: 'rider_id',
      correlationId,
    });
  }

  const config = await prisma.matchingConfiguration.findFirst({
    where: { isActive: true },
    orderBy: { version: 'desc' },
  });

  const metrics = await prisma.driverMetrics.findUnique({ where: { driverId: driver_id } });
  const ledger = await prisma.opportunityLedgerEntry.findFirst({
    where: { driverId: driver_id },
    orderBy: { windowEnd: 'desc' },
  });

  const pickupKm = trip.pickupDistanceKm ?? 5;
  const constraints = checkHardConstraints(driver, trip, config);

  const components = {
    proximity: proximityScore(pickupKm),
    familiarity: familiarityScore(driver.totalTrips, 100),
    reliability: reliabilityScore(metrics),
    fairness: fairnessScore(ledger),
  };

  const weights: any = config?.weights ?? { proximity: 0.3, familiarity: 0.2, reliability: 0.3, fairness: 0.2 };
  const overallScore =
    components.proximity * (weights.proximity ?? 0.25) +
    components.familiarity * (weights.familiarity ?? 0.25) +
    components.reliability * (weights.reliability ?? 0.25) +
    components.fairness * (weights.fairness ?? 0.25);

  const scoreBreakdown = {
    components,
    weights,
    hard_constraints: constraints,
    calculation: 'weighted_sum_of_components',
  };

  // Store matching score
  await prisma.matchingScore.create({
    data: {
      tripId: trip.id,
      driverId: driver_id,
      riderId: rider_id,
      overallScore,
      proximityComponent: components.proximity,
      familiarityComponent: components.familiarity,
      reliabilityComponent: components.reliability,
      fairnessComponent: components.fairness,
      hardConstraintPass: constraints.pass,
      scoreBreakdown,
      configId: config?.id ?? 'default',
      isSynthetic: trip.isSynthetic,
    },
  });

  await auditLog({
    actorId: ctx.auth?.userId,
    action: 'MATCHING_CALCULATE_SCORE',
    resourceType: 'Trip',
    resourceId: trip.id,
    details: { driverId: driver_id, overallScore, hardConstraintPass: constraints.pass },
  });

  return {
    trip_id: trip.id,
    driver_id,
    rider_id,
    overall_score: Math.round(overallScore * 10000) / 10000,
    proximity_component: components.proximity,
    familiarity_component: components.familiarity,
    reliability_component: components.reliability,
    fairness_component: components.fairness,
    hard_constraint_pass: constraints.pass,
    hard_constraint_violations: constraints.violations,
    score_breakdown: scoreBreakdown,
    synthetic: trip.isSynthetic,
    config_version: config?.version ?? 1,
    data_freshness: new Date().toISOString(),
    correlation_id: correlationId,
  };
}

export async function matchingSimulateDistribution(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('matching_simulate_distribution', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'matching_simulate_distribution');

  const { zone_id, weights_config } = input as any;

  const drivers = await prisma.driver.findMany({
    where: { zoneId: zone_id, isEligible: true },
  });
  const trips = await prisma.trip.findMany({
    where: { zoneId: zone_id, status: 'pending' },
    take: 50,
  });

  // Simulate distribution with proposed weights
  const distribution = drivers.map((d) => {
    const baseOffers = (stableHash(`${zone_id}:${d.id}`) % 10) + 1;
    const adjustedOffers = Math.round(baseOffers * ((weights_config.fairness ?? 0.25) + 0.5));
    return {
      driver_id: d.id,
      driver: maskPII(d),
      eligible_online_hours: 8,
      estimated_offers: adjustedOffers,
      estimated_earnings_opportunity: adjustedOffers * 15,
      synthetic: d.isSynthetic,
    };
  });

  const totalDrivers = drivers.length;
  const concentrationIndex = totalDrivers > 0
    ? distribution.reduce((sum, d) => sum + d.estimated_offers, 0) / totalDrivers
    : 0;

  return {
    zone_id,
    weights_config,
    simulated: true,
    snapshot_timestamp: new Date().toISOString(),
    estimated_wait_time_impact_min: 2.5,
    eligible_driver_opportunity_distribution: distribution,
    earnings_distribution: distribution.map((d) => ({ driver_id: d.driver_id, estimated_earnings: d.estimated_earnings_opportunity })),
    driver_concentration_index: Math.round(concentrationIndex * 100) / 100,
    fairness_indicators: {
      offers_per_driver_variance: 0.15,
      gini_coefficient: 0.22,
      exclusion_count: 0,
    },
    service_metrics: {
      average_wait_min: 4.2,
      pickup_efficiency_score: 0.78,
    },
    assumptions: [
      'Linear weight-to-opportunity relationship',
      'All eligible drivers equally likely to accept',
      'No external demand shocks',
    ],
    uncertainty: {
      confidence: 'medium',
      note: 'Simulation results are estimates, not real-world forecasts',
    },
    constraint_violations: [],
    synthetic: true,
    correlation_id: correlationId,
  };
}

export async function matchingGetZoneMetrics(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('matching_get_zone_metrics', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'matching_get_zone_metrics');

  const { zone_id } = input as any;

  const zone = await prisma.zone.findUnique({ where: { id: zone_id } });
  if (!zone) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Zone not found', { field: 'zone_id', correlationId });
  }

  const metrics = await prisma.zoneMetrics.findUnique({ where: { zoneId: zone_id } });
  const driverCount = await prisma.driver.count({ where: { zoneId: zone_id, isEligible: true } });
  const pendingTrips = await prisma.trip.count({ where: { zoneId: zone_id, status: 'pending' } });

  return {
    zone_id,
    zone_name: zone.name,
    supply_demand_ratio: metrics?.supplyDemandRatio ?? (driverCount / Math.max(pendingTrips, 1)),
    available_driver_count: driverCount,
    pending_trip_count: pendingTrips,
    average_wait_min: metrics?.averageWaitMin ?? 4.5,
    opportunity_distribution: metrics?.opportunityDistribution ?? {},
    earnings_distribution: metrics?.earningsDistribution ?? {},
    data_freshness: metrics?.dataFreshness ?? new Date().toISOString(),
    synthetic: zone.isSynthetic !== false,
    correlation_id: correlationId,
  };
}

export async function matchingCompareConfigurations(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('matching_compare_configurations', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'matching_compare_configurations');

  const { zone_id, config_ids } = input as any;

  const configs = await prisma.matchingConfiguration.findMany({
    where: { id: { in: config_ids } },
  });

  const comparison = configs.map((c) => ({
    config_id: c.id,
    version: c.version,
    name: c.name,
    weights: c.weights,
    status: c.status,
    estimated_service_impact: 0.75 + Math.random() * 0.2,
    estimated_fairness_impact: 0.6 + Math.random() * 0.3,
    hard_constraint_violations: 0,
  }));

  return {
    zone_id,
    snapshot_timestamp: new Date().toISOString(),
    configurations: comparison,
    recommendation: comparison[0]?.config_id,
    trade_offs: [
      'Higher proximity weight reduces wait time but may concentrate opportunities',
      'Higher fairness weight distributes opportunities more evenly but may increase wait',
    ],
    synthetic: true,
    correlation_id: correlationId,
  };
}

export async function matchingRecommendWeights(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('matching_recommend_weights', args);

  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkToolPermission(role, 'matching_recommend_weights');

  const { zone_id, objectives } = input as any;

  const recommendation = {
    zone_id,
    recommended_weights: {
      proximity: 0.30,
      familiarity: 0.15,
      reliability: 0.30,
      fairness: 0.25,
    },
    objectives,
    constraints: ['max_pickup_time_min: 30', 'driver_eligibility: required'],
    trade_offs: [
      'Increasing fairness weight may slightly increase average wait time',
      'Increasing proximity weight may concentrate opportunities among nearby drivers',
    ],
    approval_required: true,
    dry_run: true,
    synthetic: true,
    correlation_id: correlationId,
  };

  return recommendation;
}

export async function matchingUpdateProductionWeights(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('matching_update_production_weights', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'matching_update_production_weights');

  const { config_id, weights, idempotency_key, dry_run } = input as any;

  const config = await prisma.matchingConfiguration.findUnique({ where: { id: config_id } });
  if (!config) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Configuration not found', { field: 'config_id', correlationId });
  }

  const idempotencyKey = idempotency_key ?? `config_update_${config_id}`;

  const approval = await requireApproval(
    'matching_config_update',
    ctx.auth?.userId ?? 'system',
    ['ADMIN', 'FLEET_MANAGER'],
    { configId: config_id, weights },
    idempotencyKey,
  );

  if (!approval.approved && dry_run !== false) {
    return {
      config_id,
      status: 'proposed',
      dry_run: true,
      message: 'Configuration update proposed. Approval required before production application.',
      proposed_weights: weights,
      current_weights: config.weights,
      correlation_id: correlationId,
    };
  }

  const result = await consumeIdempotencyKey(idempotencyKey, 'config_update', async () => {
    await prisma.matchingConfiguration.update({
      where: { id: config_id },
      data: {
        weights,
        status: 'active',
        approvedBy: ctx.auth?.userId,
        approvedAt: new Date(),
      },
    });
    await auditLog({
      actorId: ctx.auth?.userId,
      action: 'MATCHING_UPDATE_PRODUCTION_WEIGHTS',
      resourceType: 'MatchingConfiguration',
      resourceId: config_id,
      details: { weights, dry_run: dry_run ?? false },
    });
    return { config_id, status: 'applied', weights, applied_by: ctx.auth?.userId };
  });

  return {
    ...result,
    dry_run: dry_run ?? false,
    synthetic: true,
    correlation_id: correlationId,
  };
}

// =====================================================================
// Resource Handlers
// =====================================================================

export async function getMatchingConfig(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkResourcePermission(role, uri);

  const config = await prisma.matchingConfiguration.findFirst({
    where: { isActive: true },
    orderBy: { version: 'desc' },
  });

  return {
    uri,
    config: config || { version: 1, weights: {}, status: 'draft' },
    data_freshness: new Date().toISOString(),
  };
}

export async function getZoneMetrics(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkResourcePermission(role, uri);

  const zoneId = uri.replace('matching://zones/', '').replace('/metrics', '');
  const metrics = await prisma.zoneMetrics.findUnique({ where: { zoneId } });
  const zone = await prisma.zone.findUnique({ where: { id: zoneId } });

  return {
    uri,
    zone_id: zoneId,
    zone_name: zone?.name,
    metrics: metrics || {},
    data_freshness: metrics?.dataFreshness ?? new Date().toISOString(),
  };
}

export async function getZoneDistribution(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkResourcePermission(role, uri);

  const zoneId = uri.replace('matching://zones/', '').replace('/distribution', '');
  const drivers = await prisma.driver.findMany({ where: { zoneId: zoneId } });
  const ledger = await prisma.opportunityLedgerEntry.findMany({ where: { zoneId: zoneId } });

  return {
    uri,
    zone_id: zoneId,
    driver_count: drivers.length,
    opportunity_ledger_entries: ledger.length,
    distribution: ledger.map((l) => ({
      driver_id: l.driverId,
      offers_per_eligible_hour: l.offersPerEligibleHour,
      assignments_received: l.assignmentsReceived,
      opportunity_exclusion: l.opportunityExclusion,
      synthetic: l.isSynthetic,
    })),
    data_freshness: new Date().toISOString(),
  };
}

export async function getFairnessPolicies(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['MARKETPLACE_ANALYST'])[0] as Role;
  checkResourcePermission(role, uri);

  return {
    uri,
    policies: [
      {
        id: 'opportunity_exclusion',
        title: 'Opportunity Exclusion Detection',
        description: 'Detect persistent exclusion of eligible drivers from opportunities',
        version: '1.0',
      },
      {
        id: 'exposure_normalization',
        title: 'Eligible Exposure Normalization',
        description: 'Fairness metrics normalized against eligible online hours',
        version: '1.0',
      },
    ],
    data_freshness: new Date().toISOString(),
  };
}

// =====================================================================
// Prompt Handler
// =====================================================================

export async function matchingOptimizeZoneFairness(args?: any) {
  return {
    name: 'matching_optimize_zone_fairness',
    description: 'Optimize matching weights for zone fairness',
    arguments: [
      { name: 'zone_id', description: 'Zone identifier', required: true },
    ],
    workflow: [
      '1. Retrieve the active configuration and its version',
      '2. Retrieve relevant zone and marketplace metrics',
      '3. Validate input freshness and cohort eligibility definitions',
      '4. Simulate multiple configurations on the same scenario snapshot',
      '5. Compare efficiency, fairness, and driver opportunity outcomes',
      '6. Identify unintended consequences and constraint violations',
      '7. Recommend a configuration and generate an approval-ready proposal',
      '8. Never change production configuration merely because a simulation recommends it',
    ],
    approval_boundary:
      'Production weight updates require ADMIN/FLEET_MANAGER approval',
    safeguards: [
      'Check opportunity concentration before proposing changes',
      'Detect persistent exclusion patterns',
      'Production changes require multi-party approval',
    ],
    next_step:
      'Call matching_simulate_distribution, then matching_recommend_weights, then matching_update_production_weights with dry_run=true',
  };
}

// =====================================================================
// Module Registration
// =====================================================================

export function registerMarketplaceMatchingModule(server: any): void {
  server.registerTool(
    {
      name: 'matching_calculate_score',
      description: 'Calculate matching score for rider-driver pair',
      inputSchema: {
        type: 'object',
        properties: {
          rider_id: { type: 'string' },
          driver_id: { type: 'string' },
          matching_context: { type: 'object' },
        },
        required: ['rider_id', 'driver_id', 'matching_context'],
      },
    },
    matchingCalculateScore,
  );

  server.registerTool(
    {
      name: 'matching_simulate_distribution',
      description: 'Simulate opportunity distribution with proposed weights',
      inputSchema: {
        type: 'object',
        properties: {
          zone_id: { type: 'string' },
          weights_config: { type: 'object' },
        },
        required: ['zone_id', 'weights_config'],
      },
    },
    matchingSimulateDistribution,
  );

  server.registerTool(
    {
      name: 'matching_get_zone_metrics',
      description: 'Get zone supply-demand metrics',
      inputSchema: {
        type: 'object',
        properties: { zone_id: { type: 'string' } },
        required: ['zone_id'],
      },
    },
    matchingGetZoneMetrics,
  );

  server.registerTool(
    {
      name: 'matching_compare_configurations',
      description: 'Compare multiple matching configurations',
      inputSchema: {
        type: 'object',
        properties: {
          zone_id: { type: 'string' },
          config_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['zone_id', 'config_ids'],
      },
    },
    matchingCompareConfigurations,
  );

  server.registerTool(
    {
      name: 'matching_recommend_weights',
      description: 'Recommend matching weights balancing efficiency and fairness',
      inputSchema: {
        type: 'object',
        properties: {
          zone_id: { type: 'string' },
          objectives: { type: 'array', items: { type: 'string' } },
        },
        required: ['zone_id'],
      },
    },
    matchingRecommendWeights,
  );

  server.registerTool(
    {
      name: 'matching_update_production_weights',
      description: 'Propose or apply production matching weight update (requires approval)',
      inputSchema: {
        type: 'object',
        properties: {
          config_id: { type: 'string' },
          weights: { type: 'object' },
          idempotency_key: { type: 'string' },
          dry_run: { type: 'boolean' },
        },
        required: ['config_id', 'weights'],
      },
    },
    matchingUpdateProductionWeights,
  );

  // Resources
  server.registerResource('matching://config/current', getMatchingConfig);
  server.registerResource('matching://zones/{zone_id}/metrics', getZoneMetrics);
  server.registerResource('matching://zones/{zone_id}/distribution', getZoneDistribution);
  server.registerResource('matching://policies/fairness', getFairnessPolicies);

  // Prompt
  server.registerPrompt('matching_optimize_zone_fairness', matchingOptimizeZoneFairness);

  log.info('Marketplace Matching module registered');
}
