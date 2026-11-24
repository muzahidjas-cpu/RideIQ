// RideIQ — Domain Module B: RideCheck++ Contextual Rider Safety
// Contextual safety evaluation — route deviation is NOT evidence of danger by itself.

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
import { maskPII, minimizeLocationData, pseudonymizeDriverId } from '../../core/privacy/index.js';

const log = childLogger({ component: 'rider-safety' });

const GPS_HIGH_CONFIDENCE_METERS = 15;
const DEVIATION_SUSPICIOUS_DURATION_SEC = 600; // 10 minutes
const DEVIATION_DISTANCE_SUSPICIOUS_M = 1000; // 1 km

// =====================================================================
// Tool Handlers
// =====================================================================

export async function safetyEvaluatePreTripRisk(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('safety_evaluate_pre_trip_risk', args);

  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkToolPermission(role, 'safety_evaluate_pre_trip_risk');

  const { driver_id, rider_id, route_metadata } = input as any;

  const driver = await prisma.driver.findUnique({ where: { id: driver_id } });
  if (!driver) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Driver not found', { field: 'driver_id', correlationId });
  }

  // Contextual risk factors — no single factor proves danger
  const factors: string[] = [];
  let riskScore = 0.1;

  const hour = new Date().getHours();
  if (hour >= 22 || hour <= 5) {
    riskScore += 0.15;
    factors.push('Late-night/early-morning trip');
  }

  const expectedDuration = route_metadata.expectedDurationMin ?? 0;
  if (expectedDuration > 120) {
    riskScore += 0.1;
    factors.push('Long expected trip duration');
  }

  const incidentHistory = await prisma.safetyIncident.findMany({
    where: { driverId: driver_id },
    take: 5,
    orderBy: { reportedAt: 'desc' },
  });

  if (incidentHistory.length > 0) {
    riskScore += 0.1;
    factors.push('Prior safety incidents associated with driver');
  }

  riskScore = Math.max(0, Math.min(0.95, riskScore));

  const riskCategory = riskScore < 0.3 ? 'low' : riskScore < 0.6 ? 'medium' : 'high';

  return {
    driver_id,
    rider_id: rider_id ? maskPII({ id: rider_id }) : null,
    synthetic: driver.isSynthetic,
    risk_score: Math.round(riskScore * 100) / 100,
    risk_category: riskCategory,
    contributing_factors: factors,
    confidence_or_evidence_quality:
      incidentHistory.length > 0 ? 'medium' : 'low',
    data_freshness: new Date().toISOString(),
    explanation: `Pre-trip risk assessed as ${riskCategory}. Route deviation alone is not evidence of danger. ` +
      (factors.length > 0 ? `Contributing factors: ${factors.join(', ')}.` : 'No significant risk factors detected.'),
    purpose_limited: true,
    correlation_id: correlationId,
  };
}

export async function safetyGetLiveDeviation(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('safety_get_live_deviation', args);

  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkToolPermission(role, 'safety_get_live_deviation');

  const { trip_id } = input as any;

  const trip = await prisma.trip.findUnique({ where: { id: trip_id } });
  if (!trip) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Trip not found', { field: 'trip_id', correlationId });
  }

  const observations = await prisma.routeObservation.findMany({
    where: { tripId: trip_id },
    orderBy: { observedAt: 'desc' },
    take: 5,
  });

  const latest = observations[0];

  return {
    trip_id,
    synthetic: trip.isSynthetic,
    observed_vs_expected: {
      expected_route: latest?.expectedRoute ?? null,
      observed_route: latest?.observedRoute ?? null,
    },
    deviation_distance_meters: latest?.deviationDistanceMeters ?? null,
    deviation_duration_sec: latest?.deviationDurationSec ?? null,
    traffic_context: latest?.trafficContext ?? { available: false },
    gps_accuracy_meters: latest?.gpsAccuracyMeters ?? null,
    telemetry_quality: latest?.telemetryQuality ?? 'unknown',
    deviation_duration_min: latest?.deviationDurationSec != null
      ? Math.round(latest.deviationDurationSec / 60)
      : null,
    source_timestamp: latest?.observedAt ?? null,
    telemetry_freshness: latest?.observedAt ? Date.now() - new Date(latest.observedAt).getTime() : null,
    rider_check_in: latest?.riderCheckIn ?? null,
    road_closure: latest?.roadClosure ?? false,
    data_freshness: new Date().toISOString(),
    correlation_id: correlationId,
  };
}

export async function safetyEvaluateDeviation(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('safety_evaluate_deviation', args);

  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkToolPermission(role, 'safety_evaluate_deviation');

  const { trip_id, observedRoute, expectedRoute } = input as any;

  const trip = await prisma.trip.findUnique({ where: { id: trip_id } });
  if (!trip) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Trip not found', { field: 'trip_id', correlationId });
  }

  const observation = await prisma.routeObservation.findFirst({
    where: { tripId: trip_id },
    orderBy: { observedAt: 'desc' },
  });

  const distanceM = observation?.deviationDistanceMeters ?? 0;
  const durationSec = observation?.deviationDurationSec ?? 0;
  const roadClosure = observation?.roadClosure ?? false;
  const gpsAccuracy = observation?.gpsAccuracyMeters ?? 999;
  const riderCheckIn = observation?.riderCheckIn;

  // Three-stage assessment
  const legitimateExplanations: string[] = [];
  if (roadClosure) legitimateExplanations.push('Road closure');
  if (gpsAccuracy > GPS_HIGH_CONFIDENCE_METERS) legitimateExplanations.push('GPS uncertainty');
  if (riderCheckIn === true) legitimateExplanations.push('Rider confirmed safety via check-in');
  if ((observation?.trafficContext as any)?.congestion) legitimateExplanations.push('Traffic congestion/rerouting');

  let classification: 'monitor' | 'investigate' | 'escalate' = 'monitor';
  const reasons: string[] = [];

  if (distanceM > DEVIATION_DISTANCE_SUSPICIOUS_M || durationSec > DEVIATION_SUSPICIOUS_DURATION_SEC) {
    if (legitimateExplanations.length === 0) {
      classification = 'investigate';
      reasons.push('Significant deviation with no confirmed legitimate explanation');
    } else {
      classification = 'monitor';
      reasons.push('Deviation explained by known legitimate factors');
    }
  } else {
    classification = 'monitor';
    reasons.push('Deviation within normal range');
  }

  if (riderCheckIn === false && distanceM > 500) {
    classification = 'investigate';
    reasons.push('Rider has not confirmed safety and deviation is notable');
  }

  return {
    trip_id,
    synthetic: trip.isSynthetic,
    classification,
    classification_reasons: reasons,
    deviation_distance_meters: distanceM,
    deviation_duration_sec: durationSec,
    legitimate_explanations: legitimateExplanations,
    gps_confidence: gpsAccuracy <= GPS_HIGH_CONFIDENCE_METERS ? 'high' : 'low',
    telemetry_quality: observation?.telemetryQuality ?? 'unknown',
    rider_check_in: riderCheckIn,
    road_closure: roadClosure,
    traffic_context: observation?.trafficContext ?? null,
    evidence: {
      source: 'route_observation',
      timestamp: observation?.observedAt ?? null,
      data_quality: observation ? 'medium' : 'insufficient',
    },
    recommendation: classification === 'monitor'
      ? 'Continue monitoring. Deviation alone is not evidence of danger.'
      : classification === 'investigate'
        ? 'Request authorized safety review. Do not escalate to emergency without verified evidence.'
        : 'Escalate through approved safety workflow.',
    safeguard: 'A single deviation is never sufficient to label an incident as dangerous.',
    correlation_id: correlationId,
  };
}

export async function safetyGetIncidentContext(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('safety_get_incident_context', args);

  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkToolPermission(role, 'safety_get_incident_context');

  const { incident_id, trip_id, driver_id } = input as any;

  const where: any = {};
  if (incident_id) where.id = incident_id;
  if (trip_id) where.tripId = trip_id;
  if (driver_id) where.driverId = driver_id;

  const incidents = await prisma.safetyIncident.findMany({
    where,
    include: {
      driver: true,
      rider: true,
      routeObservations: { take: 5, orderBy: { observedAt: 'desc' } },
    },
    orderBy: { reportedAt: 'desc' },
    take: 10,
  });

  return {
    incidents: incidents.map((inc) => ({
      incident_id: inc.id,
      external_id: inc.externalId,
      trip_id: inc.tripId,
      driver: maskPII(inc.driver),
      rider: inc.rider ? maskPII(inc.rider) : null,
      status: inc.status,
      severity: inc.severity,
      category: inc.category,
      description: inc.description,
      reported_at: inc.reportedAt,
      resolved_at: inc.resolvedAt,
      authorized_by: inc.authorizedBy,
      route_observations: inc.routeObservations.map((o) => ({
        observed_at: o.observedAt,
        deviation_distance_meters: o.deviationDistanceMeters,
        road_closure: o.roadClosure,
        rider_check_in: o.riderCheckIn,
        telemetry_quality: o.telemetryQuality,
      })),
      synthetic: inc.isSynthetic,
    })),
    count: incidents.length,
    authorized_for: role,
    correlation_id: correlationId,
  };
}

export async function safetyTriggerEmergencyProtocol(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('safety_trigger_emergency_protocol', args);

  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkToolPermission(role, 'safety_trigger_emergency_protocol');

  const { trip_id, driver_id, rider_id, incident_type, idempotency_key } = input as any;

  const trip = await prisma.trip.findUnique({ where: { id: trip_id } });
  if (!trip) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Trip not found', { field: 'trip_id', correlationId });
  }

  const idempotencyKey = idempotency_key ?? `emergency_${trip_id}_${incident_type}`;

  // Require authorization
  const approval = await requireApproval(
    'emergency_protocol',
    ctx.auth?.userId ?? 'system',
    ['SAFETY_ANALYST', 'FLEET_MANAGER', 'ADMIN'],
    { tripId: trip_id, driverId: driver_id, riderId: rider_id, incidentType: incident_type },
    idempotencyKey,
  );

  if (!approval.approved) {
    throw createError(ErrorCategory.APPROVAL_REQUIRED, 'Emergency protocol requires authorization', {
      recoveryHint: 'Obtain authorization from a SAFETY_ANALYST, FLEET_MANAGER, or ADMIN',
      correlationId,
    });
  }

  // In demonstration, simulate — never contact real authorities
  const result = await consumeIdempotencyKey(idempotencyKey, 'emergency_protocol', async () => {
    await prisma.safetyIncident.create({
      data: {
        externalId: `emergency_${correlationId}`,
        tripId: trip_id,
        driverId: driver_id,
        riderId: rider_id,
        status: 'open',
        severity: 'critical',
        category: incident_type,
        description: `Emergency protocol triggered: ${incident_type}`,
        reportedAt: new Date(),
        isSynthetic: true,
      },
    });
    await auditLog({
      actorId: ctx.auth?.userId,
      action: 'SAFETY_TRIGGER_EMERGENCY_PROTOCOL',
      resourceType: 'Trip',
      resourceId: trip_id,
      details: { incidentType: incident_type, simulated: true },
    });
    return {
      trip_id,
      incident_type,
      status: 'simulated_activated',
      simulated: true,
      message: 'Emergency protocol simulated. No real authorities contacted.',
    };
  });

  return {
    ...result,
    synthetic: true,
    correlation_id: correlationId,
  };
}

export async function safetyEscalateIncident(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('safety_escalate_incident', args);

  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkToolPermission(role, 'safety_escalate_incident');

  const { incident_id, escalation_reason, idempotency_key } = input as any;

  const incident = await prisma.safetyIncident.findUnique({ where: { id: incident_id } });
  if (!incident) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Incident not found', { field: 'incident_id', correlationId });
  }

  const idempotencyKey = idempotency_key ?? `escalate_${incident_id}`;

  const approval = await requireApproval(
    'incident_escalation',
    ctx.auth?.userId ?? 'system',
    ['SAFETY_ANALYST', 'FLEET_MANAGER', 'ADMIN'],
    { incidentId: incident_id, escalationReason: escalation_reason },
    idempotencyKey,
  );

  if (!approval.approved) {
    throw createError(ErrorCategory.APPROVAL_REQUIRED, 'Incident escalation requires authorization', {
      correlationId,
    });
  }

  const result = await consumeIdempotencyKey(idempotencyKey, 'incident_escalation', async () => {
    await prisma.safetyIncident.update({
      where: { id: incident_id },
      data: { status: 'escalated', authorizedBy: ctx.auth?.userId },
    });
    await auditLog({
      actorId: ctx.auth?.userId,
      action: 'SAFETY_ESCALATE_INCIDENT',
      resourceType: 'SafetyIncident',
      resourceId: incident_id,
      details: { escalationReason: escalation_reason },
    });
    return {
      incident_id,
      status: 'escalated',
      escalated_by: ctx.auth?.userId,
      simulated: true,
    };
  });

  return {
    ...result,
    synthetic: incident.isSynthetic,
    correlation_id: correlationId,
  };
}

export async function safetyGetIncidentStatus(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('safety_get_incident_status', args);

  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkToolPermission(role, 'safety_get_incident_status');

  const { incident_id } = input as any;

  const incident = await prisma.safetyIncident.findUnique({
    where: { id: incident_id },
    include: { driver: true, routeObservations: { orderBy: { observedAt: 'desc' }, take: 10 } },
  });
  if (!incident) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Incident not found', { field: 'incident_id', correlationId });
  }

  return {
    incident_id,
    external_id: incident.externalId,
    trip_id: incident.tripId,
    driver: maskPII(incident.driver),
    status: incident.status,
    severity: incident.severity,
    category: incident.category,
    description: incident.description,
    reported_at: incident.reportedAt,
    resolved_at: incident.resolvedAt,
    authorized_by: incident.authorizedBy,
    route_observations: incident.routeObservations.map((o) => ({
      observed_at: o.observedAt,
      deviation_distance_meters: o.deviationDistanceMeters,
      road_closure: o.roadClosure,
      rider_check_in: o.riderCheckIn,
    })),
    action_history: [],
    synthetic: incident.isSynthetic,
    correlation_id: correlationId,
  };
}

// =====================================================================
// Resource Handlers
// =====================================================================

export async function getTripRoute(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkResourcePermission(role, uri);

  const tripId = uri.replace('safety://trips/', '').replace('/route', '');
  const observations = await prisma.routeObservation.findMany({
    where: { tripId },
    orderBy: { observedAt: 'desc' },
    take: 10,
  });

  return {
    uri,
    trip_id: tripId,
    observations: observations.map((o) => ({
      observed_at: o.observedAt,
      expected_route: o.expectedRoute,
      observed_route: o.observedRoute,
      deviation_distance_meters: o.deviationDistanceMeters,
      deviation_duration_sec: o.deviationDurationSec,
      traffic_context: o.trafficContext,
      gps_accuracy_meters: o.gpsAccuracyMeters,
      telemetry_quality: o.telemetryQuality,
      rider_check_in: o.riderCheckIn,
      road_closure: o.roadClosure,
    })),
    data_freshness: new Date().toISOString(),
  };
}

export async function getDriverIncidentHistory(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkResourcePermission(role, uri);

  const driverId = uri.replace('safety://drivers/', '').replace('/incident-history', '');
  const incidents = await prisma.safetyIncident.findMany({
    where: { driverId },
    orderBy: { reportedAt: 'desc' },
    take: 20,
  });

  return {
    uri,
    driver_id: driverId,
    incidents: incidents.map((i) => ({
      incident_id: i.id,
      status: i.status,
      severity: i.severity,
      category: i.category,
      reported_at: i.reportedAt,
      synthetic: i.isSynthetic,
    })),
    count: incidents.length,
  };
}

export async function getActiveIncidents(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkResourcePermission(role, uri);

  const incidents = await prisma.safetyIncident.findMany({
    where: { status: { in: ['open', 'investigating', 'escalated'] } },
    orderBy: { reportedAt: 'desc' },
    take: 50,
    include: { driver: true },
  });

  return {
    uri,
    active_incidents: incidents.map((i) => ({
      incident_id: i.id,
      driver: maskPII(i.driver),
      severity: i.severity,
      category: i.category,
      status: i.status,
      reported_at: i.reportedAt,
      synthetic: i.isSynthetic,
    })),
    count: incidents.length,
  };
}

export async function getSafetyPolicies(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['SAFETY_ANALYST'])[0] as Role;
  checkResourcePermission(role, uri);

  return {
    uri,
    policies: [
      {
        id: 'deviation_evaluation',
        title: 'Route Deviation Contextual Evaluation',
        description: 'Deviation alone is not evidence of danger. Use three-stage assessment.',
        version: '1.0',
      },
      {
        id: 'emergency_authorization',
        title: 'Emergency Protocol Authorization',
        description: 'Human authorization required by default for emergency escalation.',
        version: '1.0',
      },
    ],
    data_freshness: new Date().toISOString(),
  };
}

// =====================================================================
// Prompt Handler
// =====================================================================

export async function safetyTriageRouteDeviation(args?: any) {
  return {
    name: 'safety_triage_route_deviation',
    description: 'Triage a route deviation event with contextual assessment',
    arguments: [
      { name: 'trip_id', description: 'Trip identifier', required: true },
    ],
    workflow: [
      '1. Retrieve the deviation event and its source timestamp',
      '2. Check GPS confidence, location-data freshness, and telemetry completeness',
      '3. Examine traffic, road-closure, and rerouting context where available',
      '4. Check rider check-in information where authorized and available',
      '5. Correlate relevant signals without treating correlation as proof',
      '6. Classify as monitor, investigate, or escalate for authorized review',
      '7. Present evidence, uncertainty, alternative explanations, and recommended next step',
      '8. Follow configured approval and emergency policies',
    ],
    approval_boundary:
      'Escalation requires SAFETY_ANALYST/FLEET_MANAGER/ADMIN authorization',
    safeguards: [
      'Route deviation alone is not evidence of danger',
      'Do not use protected personal characteristics to infer safety risk',
      'Do not treat unverified allegations as proven facts',
      'Minimize retention and exposure of precise location history',
      'During synthetic demonstrations, simulate emergency actions only',
    ],
    next_step:
      'Call safety_evaluate_deviation for the trip, then safety_escalate_incident only with authorization',
  };
}

// =====================================================================
// Module Registration
// =====================================================================

export function registerRiderSafetyModule(server: any): void {
  server.registerTool(
    {
      name: 'safety_evaluate_pre_trip_risk',
      description: 'Evaluate pre-trip safety risk using contextual factors',
      inputSchema: {
        type: 'object',
        properties: {
          driver_id: { type: 'string' },
          rider_id: { type: 'string' },
          route_metadata: { type: 'object' },
        },
        required: ['driver_id', 'route_metadata'],
      },
    },
    safetyEvaluatePreTripRisk,
  );

  server.registerTool(
    {
      name: 'safety_get_live_deviation',
      description: 'Get live route deviation information for a trip',
      inputSchema: {
        type: 'object',
        properties: { trip_id: { type: 'string' } },
        required: ['trip_id'],
      },
    },
    safetyGetLiveDeviation,
  );

  server.registerTool(
    {
      name: 'safety_evaluate_deviation',
      description: 'Evaluate whether a deviation is consistent with legitimate causes',
      inputSchema: {
        type: 'object',
        properties: {
          trip_id: { type: 'string' },
          observed_route: { type: 'array' },
          expected_route: { type: 'array' },
        },
        required: ['trip_id'],
      },
    },
    safetyEvaluateDeviation,
  );

  server.registerTool(
    {
      name: 'safety_get_incident_context',
      description: 'Retrieve authorized incident context',
      inputSchema: {
        type: 'object',
        properties: {
          incident_id: { type: 'string' },
          trip_id: { type: 'string' },
          driver_id: { type: 'string' },
        },
      },
    },
    safetyGetIncidentContext,
  );

  server.registerTool(
    {
      name: 'safety_trigger_emergency_protocol',
      description: 'Initiate authorized emergency workflow (simulated)',
      inputSchema: {
        type: 'object',
        properties: {
          trip_id: { type: 'string' },
          driver_id: { type: 'string' },
          rider_id: { type: 'string' },
          incident_type: { type: 'string' },
          idempotency_key: { type: 'string' },
        },
        required: ['trip_id', 'driver_id', 'incident_type'],
      },
    },
    safetyTriggerEmergencyProtocol,
  );

  server.registerTool(
    {
      name: 'safety_escalate_incident',
      description: 'Escalate a safety incident through approved workflow',
      inputSchema: {
        type: 'object',
        properties: {
          incident_id: { type: 'string' },
          escalation_reason: { type: 'string' },
          idempotency_key: { type: 'string' },
        },
        required: ['incident_id', 'escalation_reason'],
      },
    },
    safetyEscalateIncident,
  );

  server.registerTool(
    {
      name: 'safety_get_incident_status',
      description: 'Retrieve current incident workflow state',
      inputSchema: {
        type: 'object',
        properties: { incident_id: { type: 'string' } },
        required: ['incident_id'],
      },
    },
    safetyGetIncidentStatus,
  );

  // Resources
  server.registerResource('safety://trips/{trip_id}/route', getTripRoute);
  server.registerResource('safety://drivers/{driver_id}/incident-history', getDriverIncidentHistory);
  server.registerResource('safety://incidents/active', getActiveIncidents);
  server.registerResource('safety://policies/current', getSafetyPolicies);

  // Prompt
  server.registerPrompt('safety_triage_route_deviation', safetyTriageRouteDeviation);

  log.info('Rider Safety module registered');
}
