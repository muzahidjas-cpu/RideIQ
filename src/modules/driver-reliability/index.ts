// RideIQ — Domain Module A: Driver Reliability
// Implements predictive driver reliability with transparent baseline models.

import { prisma } from '../../core/database/index.js';
import { logger, childLogger } from '../../core/logging/index.js';
import {
  createError,
  ErrorCategory,
  isRideIQError,
} from '../../core/errors/index.js';
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

const log = childLogger({ component: 'driver-reliability' });

// =====================================================================
// Baseline cancellation risk model (transparent, rule-based, NOT production AI)
// =====================================================================

const LONG_PICKUP_THRESHOLD_KM = 10;
const SHORT_PICKUP_THRESHOLD_KM = 3;
const PEAK_HOURS = [7, 8, 9, 17, 18, 19];

function isPeakHour(date: Date): boolean {
  return PEAK_HOURS.includes(date.getHours());
}

function categorizeRisk(prob: number): 'low' | 'medium' | 'high' {
  if (prob < 0.25) return 'low';
  if (prob < 0.5) return 'medium';
  return 'high';
}

function computeCancellationRisk(
  driverMetrics: any,
  tripDetails: any,
  now: Date,
): {
  probability: number;
  riskCategory: string;
  primaryRiskFactors: string[];
  confidence: number;
  evidenceQuality: string;
  explanation: string;
  sampleSize: number;
} {
  const factors: string[] = [];
  let probability = 0.10; // baseline

  const sampleSize = driverMetrics?.sampleSize ?? 0;
  const evidenceQuality =
    sampleSize >= 30 ? 'high' : sampleSize >= 10 ? 'medium' : 'low';

  // Pickup distance factor
  const pickupKm = tripDetails.pickupDistanceKm ?? 0;
  if (pickupKm >= LONG_PICKUP_THRESHOLD_KM) {
    probability += 0.25;
    factors.push('Long pickup distance');
  } else if (pickupKm <= SHORT_PICKUP_THRESHOLD_KM) {
    probability -= 0.05;
  }

  // Trip length factor
  const tripKm = tripDetails.distanceKm ?? 0;
  if (tripKm > 30) {
    probability += 0.15;
    factors.push('Long trip duration');
  }

  // Peak hour factor
  if (tripDetails.isPeakHour ?? isPeakHour(now)) {
    probability += 0.1;
    factors.push('Peak hour demand');
  }

  // Historical cancellation rate
  if (driverMetrics) {
    const histCancelRate =
      driverMetrics.acceptanceCount > 0
        ? driverMetrics.cancellationCount / driverMetrics.acceptanceCount
        : 0;
    probability += histCancelRate * 0.5;
    if (histCancelRate > 0.2) {
      factors.push('Historical cancellation pattern');
    }

    // Sample size penalty for low samples
    if (sampleSize < 10) {
      factors.push('Limited historical data — estimate less reliable');
    }
  }

  // Clamp
  probability = Math.max(0, Math.min(0.95, probability));
  const confidence = evidenceQuality === 'high' ? 0.85 : evidenceQuality === 'medium' ? 0.6 : 0.35;

  const explanation = `Baseline cancellation risk estimated at ${Math.round(probability * 100)}% for this assignment. ` +
    (factors.length > 0 ? `Primary factors: ${factors.join(', ')}.` : 'No strong risk factors detected.') +
    ` Evidence quality: ${evidenceQuality} (sample size: ${sampleSize}). ` +
    'This is a decision-support estimate, not proof of driver intent or future behavior.';

  return {
    probability,
    riskCategory: categorizeRisk(probability),
    primaryRiskFactors: factors,
    confidence,
    evidenceQuality,
    explanation,
    sampleSize,
  };
}

// =====================================================================
// Tool Handlers
// =====================================================================

export async function driverPredictCancellationRisk(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('driver_predict_cancellation_risk', args);

  // Authorization
  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkToolPermission(role, 'driver_predict_cancellation_risk');

  const { driver_id, trip_details } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', {
      field: 'driver_id',
      correlationId,
    });
  }

  const metrics = await prisma.driverMetrics.findUnique({
    where: { driverId: driver_id },
  });

  const result = computeCancellationRisk(metrics, trip_details, new Date());

  // Record decision trace
  await prisma.decisionTrace.create({
    data: {
      externalId: correlationId,
      decisionId: correlationId,
      category: 'cancellation_risk',
      sourceModule: 'driver-reliability',
      entityRef: pseudonymizeDriverId(driver_id),
      dataSources: [
        { type: 'OBSERVED', source: 'driver://' + driver_id + '/metrics', timestamp: new Date().toISOString(), dataQuality: result.evidenceQuality, synthetic: driver.isSynthetic },
      ],
      dataFreshness: new Date().toISOString(),
      dataQuality: { sampleSize: result.sampleSize },
      modelVersion: 'rideiq-baseline-v1',
      observedSignals: { pickupDistanceKm: trip_details.pickupDistanceKm, tripDistanceKm: trip_details.distanceKm },
      predictedSignals: { cancellationProbability: result.probability },
      contributingFactors: result.primaryRiskFactors.map((f) => ({ factor: f, contribution: 0.5, evidenceType: 'CALCULATED' })),
      uncertainty: { confidence: result.confidence },
      alternativeExplanations: ['Traffic conditions', 'App/network issues', 'Changed driver availability'],
      recommendation: { action: 'review_assignment', riskCategory: result.riskCategory },
      requiredRole: 'DISPATCH_AGENT',
      approvalState: 'none',
      driverId: driver_id,
    },
  });

  await auditLog({
    actorId: ctx.auth?.userId,
    action: 'DRIVER_PREDICT_CANCELLATION_RISK',
    resourceType: 'Driver',
    resourceId: driver_id,
    details: { riskCategory: result.riskCategory, probability: result.probability },
  });

  return {
    isSimulated: driver.isSynthetic,
    driver_id,
    cancellation_probability: result.probability,
    risk_category: result.riskCategory,
    primary_risk_factors: result.primaryRiskFactors,
    confidence_or_evidence_quality: result.evidenceQuality,
    confidence: result.confidence,
    model_version: 'rideiq-baseline-v1',
    data_freshness: new Date().toISOString(),
    sample_size: result.sampleSize,
    explanation: result.explanation,
    synthetic: driver.isSynthetic,
    correlation_id: correlationId,
  };
}

export async function driverGetReliability(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('driver_get_reliability', args);

  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkToolPermission(role, 'driver_get_reliability');

  const { driver_id } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  const metrics = await prisma.driverMetrics.findUnique({ where: { driverId: driver_id } });

  const acceptanceRate =
    metrics && metrics.acceptanceCount > 0
      ? metrics.completionCount / metrics.acceptanceCount
      : 0;
  const cancellationRate =
    metrics && metrics.acceptanceCount > 0
      ? metrics.cancellationCount / metrics.acceptanceCount
      : 0;

  return {
    driver_id,
    driver: maskPII(driver),
    synthetic: driver.isSynthetic,
    reliability: {
      short_vs_long_pickup: {
        short: { trips: metrics?.shortPickupTrips ?? 0, completed: metrics?.shortPickupCompleted ?? 0 },
        long: { trips: metrics?.longPickupTrips ?? 0, completed: metrics?.longPickupCompleted ?? 0 },
      },
      short_vs_long_trip: {
        short: { trips: metrics?.shortTripTrips ?? 0, completed: metrics?.shortTripCompleted ?? 0 },
        long: { trips: metrics?.longTripTrips ?? 0, completed: metrics?.longTripCompleted ?? 0 },
      },
      peak_vs_offpeak: {
        peak: { trips: metrics?.peakTrips ?? 0, completed: metrics?.peakCompleted ?? 0 },
        offPeak: { trips: metrics?.offPeakTrips ?? 0, completed: metrics?.offPeakCompleted ?? 0 },
      },
      acceptance_to_completion_ratio: acceptanceRate,
      cancellation_patterns: {
        cancellationCount: metrics?.cancellationCount ?? 0,
        cancellationRate,
      },
      sample_size: metrics?.sampleSize ?? 0,
      observation_window_days: metrics?.observationWindowDays ?? 30,
    },
    data_freshness: metrics?.lastCalculatedAt ?? new Date().toISOString(),
    evidence_quality:
      (metrics?.sampleSize ?? 0) >= 30 ? 'high' : (metrics?.sampleSize ?? 0) >= 10 ? 'medium' : 'low',
    correlation_id: correlationId,
  };
}

export async function driverGetCancellationExplanation(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('driver_get_cancellation_explanation', args);

  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkToolPermission(role, 'driver_get_cancellation_explanation');

  const { driver_id, trip_details } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  const metrics = await prisma.driverMetrics.findUnique({ where: { driverId: driver_id } });
  const result = computeCancellationRisk(metrics, trip_details ?? {}, new Date());

  return {
    driver_id,
    synthetic: driver.isSynthetic,
    risk_category: result.riskCategory,
    cancellation_probability: result.probability,
    primary_factors: result.primaryRiskFactors,
    evidence_quality: result.evidenceQuality,
    sample_size: result.sampleSize,
    explanation: result.explanation,
    alternative_explanations: [
      'Traffic or road conditions may affect pickup feasibility',
      'Driver app or network connectivity issues',
      'Changed personal circumstances of the driver',
      'Inaccurate trip or pickup estimates',
    ],
    limitations: [
      'Historical behavior is decision-support evidence, not proof of future behavior or intent',
      'Low sample sizes reduce estimate reliability',
      'Does not account for real-time driver availability changes',
    ],
    data_freshness: new Date().toISOString(),
    correlation_id: correlationId,
  };
}

export async function driverSimulateAssignment(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('driver_simulate_assignment', args);

  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkToolPermission(role, 'driver_simulate_assignment');

  const { trip_details, candidate_driver_ids } = input as any;

  const results = [];
  for (const driverId of candidate_driver_ids) {
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) continue;
    const metrics = await prisma.driverMetrics.findUnique({ where: { driverId: driverId } });
    const risk = computeCancellationRisk(metrics, trip_details, new Date());
    results.push({
      driver_id: driverId,
      driver: maskPII(driver),
      synthetic: driver.isSynthetic,
      cancellation_probability: risk.probability,
      risk_category: risk.riskCategory,
      primary_risk_factors: risk.primaryRiskFactors,
      evidence_quality: risk.evidenceQuality,
      sample_size: risk.sampleSize,
    });
  }

  // Sort by lowest risk first
  results.sort((a, b) => a.cancellation_probability - b.cancellation_probability);

  return {
    trip_details,
    candidates: results,
    recommended: results[0] || null,
    synthetic: true,
    correlation_id: correlationId,
  };
}

export async function driverRecommendAssignment(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('driver_recommend_assignment', args);

  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkToolPermission(role, 'driver_recommend_assignment');

  const { trip_details, candidate_driver_ids, rider_id, max_wait_min } = input as any;

  const candidates = [];
  for (const driverId of candidate_driver_ids) {
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver || !driver.isEligible) continue;
    const metrics = await prisma.driverMetrics.findUnique({ where: { driverId: driverId } });
    const risk = computeCancellationRisk(metrics, trip_details, new Date());

    // Component scores (0-1)
    const proximityScore = Math.max(0, 1 - ((trip_details.pickupDistanceKm ?? 5) / 20));
    const reliabilityScore = metrics
      ? metrics.completionCount / Math.max(metrics.acceptanceCount, 1)
      : 0.5;
    const fairnessScore = 0.5; // neutral baseline

    const overallScore =
      proximityScore * 0.35 + reliabilityScore * 0.35 + (1 - risk.probability) * 0.2 + fairnessScore * 0.1;

    candidates.push({
      driver_id: driverId,
      driver: maskPII(driver),
      synthetic: driver.isSynthetic,
      overall_score: Math.round(overallScore * 100) / 100,
      proximity_component: proximityScore,
      reliability_component: reliabilityScore,
      cancellation_probability: risk.probability,
      risk_category: risk.riskCategory,
      estimated_pickup_min: trip_details.estimatedPickupMin,
    });
  }

  candidates.sort((a, b) => b.overall_score - a.overall_score);
  const recommended = candidates[0];

  return {
    trip_details,
    recommended,
    candidates,
    trade_offs: recommended
      ? [
          `Recommended driver has ${Math.round(recommended.reliability_component * 100)}% historical completion rate`,
          `Cancellation risk: ${Math.round(recommended.cancellation_probability * 100)}%`,
          'Fairness: assignment rotates opportunities across eligible drivers',
        ]
      : [],
    recommendation_basis:
      'Balances proximity, reliability, cancellation risk, and fairness. Does not penalize drivers solely on model score.',
    synthetic: true,
    correlation_id: correlationId,
  };
}

export async function driverReassignTrip(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('driver_reassign_trip', args);

  const role = (ctx.auth?.roles ?? ['DISPATCH_AGENT'])[0] as Role;
  checkToolPermission(role, 'driver_reassign_trip');

  const { trip_id, new_driver_id, reason, idempotency_key } = input as any;

  const trip = await prisma.trip.findUnique({ where: { id: trip_id } });
  if (!trip) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Trip not found', { field: 'trip_id', correlationId });
  }

  const newDriver = await prisma.driver.findUnique({ where: { id: new_driver_id } });
  if (!newDriver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'New driver not found', { field: 'new_driver_id', correlationId });
  }

  // Require approval for reassignment
  const idempotencyKey = idempotency_key ?? `reassign_${trip_id}_${new_driver_id}`;
  const approval = await requireApproval(
    'trip_reassignment',
    ctx.auth?.userId ?? 'system',
    ['DISPATCH_AGENT', 'FLEET_MANAGER', 'ADMIN'],
    { tripId: trip_id, newDriverId: new_driver_id, reason },
    idempotencyKey,
  );

  if (!approval.approved) {
    throw createError(ErrorCategory.APPROVAL_REQUIRED, 'Trip reassignment requires approval', {
      recoveryHint: 'Obtain approval from a DISPATCH_AGENT, FLEET_MANAGER, or ADMIN',
      correlationId,
    });
  }

  // Execute reassignment (idempotent via outbox)
  const result = await consumeIdempotencyKey(idempotencyKey, 'trip_reassignment', async () => {
    const updated = await prisma.trip.update({
      where: { id: trip_id },
      data: {
        driverId: new_driver_id,
        assignedDriverId: new_driver_id,
        status: 'accepted',
      },
    });
    await prisma.tripEvent.create({
      data: {
        tripId: trip_id,
        eventType: 'reassigned',
        occurredAt: new Date(),
        source: 'rideiq-mcp',
        data: { reason, newDriverId: new_driver_id, approvedBy: ctx.auth?.userId },
        isSynthetic: trip.isSynthetic,
      },
    });
    return { tripId: trip_id, newDriverId: new_driver_id, status: 'reassigned' };
  });

  await auditLog({
    actorId: ctx.auth?.userId,
    action: 'DRIVER_REASSIGN_TRIP',
    resourceType: 'Trip',
    resourceId: trip_id,
    details: { newDriverId: new_driver_id, reason, synthetic: trip.isSynthetic },
  });

  return {
    ...result,
    approval_required: true,
    approval_granted: true,
    synthetic: trip.isSynthetic,
    correlation_id: correlationId,
  };
}

export async function driverGetAssignmentExplanation(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('driver_get_assignment_explanation', args);

  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkToolPermission(role, 'driver_get_assignment_explanation');

  const { trip_id, driver_id } = input as any;

  const trip = await prisma.trip.findUnique({ where: { id: trip_id } });
  if (!trip) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Trip not found', { field: 'trip_id', correlationId });
  }

  return {
    trip_id,
    offered_to_driver: driver_id ?? trip.driverId,
    assigned_driver: trip.driverId ? maskPII({ id: trip.driverId }) : null,
    reasons: [
      'Proximity to pickup location',
      'Driver availability and eligibility',
      'Historical completion rate',
      'Fair opportunity distribution',
    ],
    not_offered_reasons: driver_id
      ? [
          'Higher estimated cancellation risk for this assignment',
          'Longer estimated pickup time compared to alternatives',
          'Current assignment load',
        ]
      : [],
    privacy_safe: true,
    synthetic: trip.isSynthetic,
    correlation_id: correlationId,
  };
}

export async function driverSubmitDataCorrection(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('driver_submit_data_correction', args);

  const role = (ctx.auth?.roles ?? ['DISPATCH_AGENT'])[0] as Role;
  checkToolPermission(role, 'driver_submit_data_correction');

  const { driver_id, trip_id, reported_by, field, reported_value, correct_value } = input as any;

  // Create review request — does NOT rewrite source-of-truth directly
  const request = await prisma.dataCorrectionRequest.create({
    data: {
      externalId: `corr_${correlationId}`,
      driverId: driver_id,
      tripId: trip_id,
      reportedBy: reported_by,
      field,
      reportedValue: reported_value,
      correctValue: correct_value,
      status: 'pending_review',
    },
  });

  await auditLog({
    actorId: reported_by,
    action: 'DRIVER_SUBMIT_DATA_CORRECTION',
    resourceType: 'DataCorrectionRequest',
    resourceId: request.id,
    details: { field, tripId: trip_id, driverId: driver_id },
  });

  return {
    request_id: request.id,
    status: 'pending_review',
    message: 'Data correction submitted for review. Source-of-truth records are not modified directly.',
    requires_review: true,
    correlation_id: correlationId,
  };
}

// =====================================================================
// Resource Handlers
// =====================================================================

export async function getActiveQueue(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkResourcePermission(role, uri);

  const trips = await prisma.trip.findMany({
    where: { status: 'pending' },
    include: { rider: true, zone: true },
    orderBy: { requestedAt: 'asc' },
    take: 50,
  });

  return {
    uri,
    active_trips: trips.map((t) => ({
      trip_id: t.id,
      external_id: t.externalId,
      rider: maskPII(t.rider),
      pickup_lat: t.pickupLat,
      pickup_lng: t.pickupLng,
      requested_at: t.requestedAt,
      zone_id: t.zoneId,
      synthetic: t.isSynthetic,
    })),
    count: trips.length,
    data_freshness: new Date().toISOString(),
  };
}

export async function getDriverMetrics(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkResourcePermission(role, uri);

  const driverId = uri.replace('driver://', '').replace('/metrics', '');
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id' });
  }

  const metrics = await prisma.driverMetrics.findUnique({ where: { driverId } });
  return {
    uri,
    driver_id: driverId,
    driver: maskPII(driver),
    synthetic: driver.isSynthetic,
    metrics: metrics || { sample_size: 0 },
    data_freshness: metrics?.lastCalculatedAt ?? new Date().toISOString(),
  };
}

export async function getDriverReliability(uri: string, ctx: any) {
  return getDriverMetrics(uri, ctx); // same underlying data
}

export async function getDriverRecentTrips(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['AUTOMATED_SERVICE'])[0] as Role;
  checkResourcePermission(role, uri);

  const driverId = uri.replace('driver://', '').replace('/recent-trips', '');
  const trips = await prisma.trip.findMany({
    where: { driverId },
    orderBy: { requestedAt: 'desc' },
    take: 10,
  });

  return {
    uri,
    driver_id: driverId,
    recent_trips: trips.map((t) => ({
      trip_id: t.id,
      status: t.status,
      requested_at: t.requestedAt,
      cancelled_by: t.cancelledBy,
      synthetic: t.isSynthetic,
    })),
    count: trips.length,
  };
}

// =====================================================================
// Prompt Handler
// =====================================================================

export async function driverAuditHighRiskMatches(args?: any) {
  return {
    name: 'driver_audit_high_risk_matches',
    description: 'Audit high-risk driver assignments with full authorization workflow',
    arguments: [
      { name: 'zone_id', description: 'Zone to audit', required: false },
      { name: 'risk_threshold', description: 'Risk category threshold (low/medium/high)', required: false },
    ],
    workflow: [
      '1. Retrieve the active trip queue (ride://queue/active)',
      '2. Retrieve the authorized set of eligible drivers',
      '3. Check data freshness, completeness, and eligibility before scoring',
      '4. Evaluate assignment-specific cancellation risk for each candidate',
      '5. Explain primary factors, sample size, uncertainty, and alternative explanations',
      '6. Compare candidate assignments and service/fairness trade-offs',
      '7. Recommend an alternative only when evidence supports it',
      '8. Do NOT reassign automatically — require authorization and confirmation',
    ],
    approval_boundary:
      'Reassignment requires DISPATCH_AGENT/FLEET_MANAGER/ADMIN approval via server-side approval workflow',
    safeguards: [
      'Never automatically penalize a driver based on model score',
      'Historical behavior is decision-support evidence, not proof of intent',
      'Consider operational causes (pickup distance, traffic, app issues)',
      'Do not equate low sample sizes with reliable conclusions',
    ],
    next_step:
      'Call driver_predict_cancellation_risk for each candidate, then driver_reassign_trip only with approval',
  };
}

// =====================================================================
// Module Registration
// =====================================================================

export function registerDriverReliabilityModule(server: any): void {
  // Tools
  server.registerTool(
    {
      name: 'driver_predict_cancellation_risk',
      description: 'Predict assignment-specific cancellation risk for a driver',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string', description: 'Driver identifier' },
          trip_details: {
            type: 'object',
            description: 'Trip context: pickup distance, distance, duration, fare, peak hour',
            properties: {
              pickup_distance_km: { type: 'number' },
              estimated_pickup_min: { type: 'number' },
              distance_km: { type: 'number' },
              estimated_duration_min: { type: 'number' },
              fare: { type: 'number' },
              zone_id: { type: 'string' },
              is_peak_hour: { type: 'boolean' },
            },
          },
        },
        required: ['driver_id', 'trip_details'],
      },
    },
    driverPredictCancellationRisk,
  );

  server.registerTool(
    {
      name: 'driver_get_reliability',
      description: 'Retrieve segmented reliability statistics for a driver',
      inputSchema: {
        type: 'object',
        properties: { driver_id: { type: 'string' } },
        required: ['driver_id'],
      },
    },
    driverGetReliability,
  );

  server.registerTool(
    {
      name: 'driver_get_cancellation_explanation',
      description: 'Explain elevated cancellation risk for an assignment',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          trip_details: { type: 'object' },
        },
        required: ['driver_id'],
      },
    },
    driverGetCancellationExplanation,
  );

  server.registerTool(
    {
      name: 'driver_simulate_assignment',
      description: 'Compare multiple candidate drivers for one trip without assigning',
      inputSchema: {
        type: 'object',
        properties: {
          trip_details: { type: 'object' },
          candidate_driver_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['trip_details', 'candidate_driver_ids'],
      },
    },
    driverSimulateAssignment,
  );

  server.registerTool(
    {
      name: 'driver_recommend_assignment',
      description: 'Recommend a candidate driver using reliability and fairness evidence',
      inputSchema: {
        type: 'object',
        properties: {
          trip_details: { type: 'object' },
          candidate_driver_ids: { type: 'array', items: { type: 'string' } },
          rider_id: { type: 'string' },
          max_wait_min: { type: 'number' },
        },
        required: ['trip_details', 'candidate_driver_ids'],
      },
    },
    driverRecommendAssignment,
  );

  server.registerTool(
    {
      name: 'driver_reassign_trip',
      description: 'Reassign a trip to a different driver (requires approval)',
      inputSchema: {
        type: 'object',
        properties: {
          trip_id: { type: 'string' },
          new_driver_id: { type: 'string' },
          reason: { type: 'string' },
          idempotency_key: { type: 'string' },
        },
        required: ['trip_id', 'new_driver_id', 'reason'],
      },
    },
    driverReassignTrip,
  );

  server.registerTool(
    {
      name: 'driver_get_assignment_explanation',
      description: 'Explain why a trip was offered or not offered to a driver',
      inputSchema: {
        type: 'object',
        properties: { trip_id: { type: 'string' }, driver_id: { type: 'string' } },
        required: ['trip_id'],
      },
    },
    driverGetAssignmentExplanation,
  );

  server.registerTool(
    {
      name: 'driver_submit_data_correction',
      description: 'Submit a data correction review request (does not rewrite source-of-truth)',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          trip_id: { type: 'string' },
          reported_by: { type: 'string' },
          field: { type: 'string' },
          reported_value: { type: 'string' },
          correct_value: { type: 'string' },
        },
        required: ['reported_by', 'field', 'reported_value'],
      },
    },
    driverSubmitDataCorrection,
  );

  // Resources
  server.registerResource('ride://queue/active', getActiveQueue);
  server.registerResource('driver://{driver_id}/metrics', getDriverMetrics);
  server.registerResource('driver://{driver_id}/reliability', getDriverReliability);
  server.registerResource('driver://{driver_id}/recent-trips', getDriverRecentTrips);

  // Prompts
  server.registerPrompt('driver_audit_high_risk_matches', driverAuditHighRiskMatches);

  log.info('Driver Reliability module registered');
}
