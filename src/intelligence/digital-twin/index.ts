// RideIQ — Mobility Digital Twin
// Deterministic discrete-event simulation of a shared synthetic marketplace.

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

const log = childLogger({ component: 'digital-twin' });

// =====================================================================
// Deterministic random number generator (seeded)
// =====================================================================

class SeededRNG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed >>> 0;
  }
  next(): number {
    // xorshift32
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 0xffffffff;
  }
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

// =====================================================================
// Discrete Event Simulation Engine
// =====================================================================

interface SimEvent {
  type: string;
  time: number;
  payload: any;
}

interface SimState {
  drivers: Map<string, any>;
  riders: Map<string, any>;
  trips: Map<string, any>;
  zones: Map<string, any>;
  events: SimEvent[];
  metrics: any;
  clock: number;
}

function createInitialState(seed: number, horizonMinutes: number, zoneId?: string): SimState {
  const rng = new SeededRNG(seed);
  const drivers = new Map<string, any>();
  const riders = new Map<string, any>();
  const trips = new Map<string, any>();
  const zones = new Map<string, any>();

  // Create a default zone
  const zoneIdFinal = zoneId || 'zone_downtown';
  zones.set(zoneIdFinal, {
    id: zoneIdFinal,
    name: 'Downtown Zone',
    centerLat: 40.7128,
    centerLng: -74.006,
    radiusKm: 5,
    isActive: true,
  });

  // Create synthetic drivers
  const driverCount = 20;
  for (let i = 0; i < driverCount; i++) {
    const id = `sim_driver_${i}`;
    drivers.set(id, {
      id,
      externalId: `ext_driver_${i}`,
      name: `Sim Driver ${i}`,
      status: rng.next() > 0.3 ? 'online' : 'offline',
      zoneId: zoneIdFinal,
      isEligible: true,
      rating: 4.0 + rng.next() * 1.0,
      totalTrips: 0,
      completedTrips: 0,
      cancelledTrips: 0,
      isSynthetic: true,
      onlineSince: rng.nextInt(horizonMinutes),
    });
  }

  // Create synthetic riders
  const riderCount = 50;
  for (let i = 0; i < riderCount; i++) {
    const id = `sim_rider_${i}`;
    riders.set(id, {
      id,
      externalId: `ext_rider_${i}`,
      name: `Sim Rider ${i}`,
      totalTrips: 0,
      isSynthetic: true,
    });
  }

  return {
    drivers,
    riders,
    trips,
    zones,
    events: [],
    metrics: {
      successfulCompletions: 0,
      cancellations: 0,
      avgPickupEta: 0,
      riderWaitTime: 0,
      opportunityDistribution: {} as Record<string, number>,
      earningsDistribution: {} as Record<string, number>,
      routeDeviationAlerts: 0,
      safetyReviews: 0,
      driverEngagement: Object.fromEntries(
        Array.from(drivers.keys(), (driverId) => [driverId, 1]),
      ) as Record<string, number>,
      incentiveExpenditure: 0,
      operatingCost: 0,
    },
    clock: 0,
  };
}

export function runSimulation(
  seed: number,
  horizonMinutes: number,
  scenarioType: string,
  zoneId?: string,
): {
  state: SimState;
  events: any[];
  metrics: any;
  reproducible: boolean;
} {
  const rng = new SeededRNG(seed);
  const state = createInitialState(seed, horizonMinutes, zoneId);
  const events: any[] = [];
  const simulationStart = Date.UTC(2026, 0, 1);

  // Scenario injection based on type
  let demandMultiplier = 1.0;
  let driverReductionMultiplier = 1.0;
  let roadClosure = false;
  let repeatedLongPickups = false;
  let concentratedOpportunities = false;
  let decliningEngagement = false;
  let legitimateRerouting = false;

  switch (scenarioType) {
    case 'demand_surge':
      demandMultiplier = 2.0;
      break;
    case 'driver_reduction':
      driverReductionMultiplier = 0.4;
      break;
    case 'road_closure':
      roadClosure = true;
      break;
    case 'repeated_long_pickups':
      repeatedLongPickups = true;
      break;
    case 'localized_opportunity_concentration':
      concentratedOpportunities = true;
      break;
    case 'declining_driver_engagement':
      decliningEngagement = true;
      break;
    case 'traffic_rerouting':
      roadClosure = true;
      legitimateRerouting = true;
      break;
    case 'combined_disruptions':
      demandMultiplier = 1.8;
      driverReductionMultiplier = 0.5;
      roadClosure = true;
      legitimateRerouting = true;
      repeatedLongPickups = true;
      concentratedOpportunities = true;
      decliningEngagement = true;
      break;
  }

  if (driverReductionMultiplier < 1) {
    const online = Array.from(state.drivers.values()).filter((driver) => driver.status === 'online');
    const keepCount = Math.max(1, Math.floor(online.length * driverReductionMultiplier));
    online.forEach((driver, index) => {
      if (index >= keepCount) driver.status = 'offline';
    });
  }

  // Generate trip requests over horizon
  const baseTripsPerHour = 30;
  const totalTrips = Math.floor((baseTripsPerHour * demandMultiplier * horizonMinutes) / 60);
  let pickupEtaTotal = 0;

  for (let t = 0; t < totalTrips; t++) {
    const rideTime = rng.nextInt(horizonMinutes);
    const riderIds = Array.from(state.riders.keys());
    let onlineDrivers = Array.from(state.drivers.entries()).filter(
      ([, d]) => d.status === 'online' && d.isEligible,
    );

    if (decliningEngagement && rideTime >= horizonMinutes * 0.6) {
      const retainedCount = Math.max(1, Math.ceil(onlineDrivers.length * 0.6));
      const retainedIds = new Set(onlineDrivers.slice(0, retainedCount).map(([driverId]) => driverId));
      for (const [driverId, driver] of state.drivers) {
        if (driver.status === 'online') {
          state.metrics.driverEngagement[driverId] = retainedIds.has(driverId) ? 0.8 : 0.4;
        }
      }
      onlineDrivers = onlineDrivers.slice(0, retainedCount);
    }

    if (onlineDrivers.length === 0) continue;

    const riderId = riderIds[rng.nextInt(riderIds.length)];
    const candidateDrivers = concentratedOpportunities
      ? onlineDrivers.slice(0, Math.max(1, Math.ceil(onlineDrivers.length * 0.25)))
      : onlineDrivers;
    const [driverId, driver] = candidateDrivers[rng.nextInt(candidateDrivers.length)];

    const pickupKm = (1 + rng.next() * 10) * (repeatedLongPickups ? 1.8 : 1);
    let estimatedPickupMin = Math.round(pickupKm * 2 + rng.nextInt(5));
    const tripDistanceKm = 3 + rng.next() * 20;

    const tripId = `sim_trip_${t}`;
    let cancelled = rng.next() < (repeatedLongPickups ? 0.25 : 0.15);

    // Road closure increases pickup time and cancellation
    if (roadClosure) {
      estimatedPickupMin = Math.round(estimatedPickupMin * 1.4);
      if (!legitimateRerouting && rng.next() < 0.1) cancelled = true;
    }
    const completed = !cancelled && rng.next() > 0.05;
    pickupEtaTotal += estimatedPickupMin;
    const routeDeviation = roadClosure && rng.next() < 0.5;
    if (routeDeviation) state.metrics.routeDeviationAlerts++;
    if (routeDeviation && !legitimateRerouting) state.metrics.safetyReviews++;

    state.trips.set(tripId, {
      id: tripId,
      externalId: `ext_trip_${t}`,
      riderId,
      driverId,
      status: cancelled ? 'cancelled' : completed ? 'completed' : 'accepted',
      pickupDistanceKm: Math.round(pickupKm * 100) / 100,
      estimatedPickupMin,
      distanceKm: Math.round(tripDistanceKm * 100) / 100,
      requestedAt: new Date(simulationStart + rideTime * 60000).toISOString(),
      completedAt: completed ? new Date(simulationStart + (rideTime + 30) * 60000).toISOString() : null,
      cancelledAt: cancelled ? new Date(simulationStart + rideTime * 60000).toISOString() : null,
      cancelledBy: cancelled ? 'driver' : null,
      routeDeviation,
      roadClosure,
      isSynthetic: true,
      zoneId: zoneId || 'zone_downtown',
    });

    events.push({
      time: rideTime,
      type: cancelled ? 'trip_cancelled' : completed ? 'trip_completed' : 'trip_accepted',
      tripId,
      driverId,
      riderId,
      payload: {
        pickupDistanceKm: pickupKm,
        estimatedPickupMin,
        roadClosure,
        routeDeviation,
        reroutingContext: legitimateRerouting && routeDeviation ? 'road_closure_or_traffic' : null,
      },
    });

    // Update driver metrics
    if (completed) {
      state.metrics.successfulCompletions++;
      driver.completedTrips++;
    }
    if (cancelled) {
      state.metrics.cancellations++;
      driver.cancelledTrips++;
    }
    driver.totalTrips++;

    // Opportunity tracking
    state.metrics.opportunityDistribution[driverId] =
      (state.metrics.opportunityDistribution[driverId] || 0) + 1;
    state.metrics.earningsDistribution[driverId] =
      (state.metrics.earningsDistribution[driverId] || 0) + (tripDistanceKm * 2);
    state.metrics.driverEngagement[driverId] ??= 1;
  }

  state.metrics.avgPickupEta = state.trips.size > 0 ? pickupEtaTotal / state.trips.size : 0;
  state.metrics.riderWaitTime = state.metrics.avgPickupEta;
  state.metrics.cancellationRate = state.trips.size > 0
    ? state.metrics.cancellations / state.trips.size
    : 0;
  state.metrics.operatingCost = totalTrips * 3.5;
  state.metrics.incentiveExpenditure = 0;

  events.sort((a, b) => a.time - b.time || a.tripId.localeCompare(b.tripId));
  return { state, events, metrics: state.metrics, reproducible: true };
}

// =====================================================================
// Tool Handlers
// =====================================================================

export async function simulationRunMobilityScenario(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('simulation_run_mobility_scenario', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'simulation_run_mobility_scenario');

  const { name, scenario_type, zone_id, seed, horizon_minutes } = input as any;

  const simSeed = seed ?? 42;
  const horizon = horizon_minutes ?? 120;

  const { state, events, metrics, reproducible } = runSimulation(
    simSeed,
    horizon,
    scenario_type,
    zone_id,
  );

  // Persist run
  const run = await prisma.simulationRun.create({
    data: {
      externalId: `sim_${correlationId}`,
      name,
      seed: simSeed,
      horizonMinutes: horizon,
      configSnapshot: {
        scenario_type,
        zone_id,
        demand_multiplier: scenario_type === 'demand_surge' ? 2.0 : 1.0,
      },
      assumptions: {
        linear_response: true,
        constant_other_factors: true,
        synthetic_marketplace: true,
      },
      status: 'completed',
      metrics,
      results: {
        trips: Array.from(state.trips.values()),
        drivers: Array.from(state.drivers.values()),
        events,
      },
    },
  });

  // Persist events
  for (const ev of events) {
    await prisma.simulationEvent.create({
      data: {
        runId: run.id,
        eventType: ev.type,
        occurredAtMin: ev.time,
        payload: ev.payload,
      },
    });
  }

  await auditLog({
    actorId: ctx.auth?.userId,
    action: 'SIMULATION_RUN_MOBILITY_SCENARIO',
    resourceType: 'SimulationRun',
    resourceId: run.id,
    details: { scenario_type, seed: simSeed, horizon },
  });

  return {
    run_id: run.id,
    external_id: run.externalId,
    name,
    scenario_type,
    zone_id,
    seed: simSeed,
    horizon_minutes: horizon,
    status: 'completed',
    metrics,
    label: 'SIMULATED RESULT — NOT A REAL-WORLD PERFORMANCE CLAIM',
    synthetic: true,
    reproducible,
    event_count: events.length,
    data_freshness: new Date().toISOString(),
    correlation_id: correlationId,
  };
}

export async function simulationCompareRuns(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('simulation_compare_runs', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'simulation_compare_runs');

  const { run_ids } = input as any;

  const runs = await prisma.simulationRun.findMany({
    where: { id: { in: run_ids } },
  });

  if (runs.length < 2) {
    throw createError(ErrorCategory.VALIDATION_ERROR, 'Need at least 2 runs to compare');
  }

  const baseline = runs[0];
  const alternatives = runs.slice(1);

  return {
    baseline_run: {
      run_id: baseline.id,
      name: baseline.name,
      seed: baseline.seed,
      metrics: baseline.metrics,
    },
    alternative_runs: alternatives.map((r) => ({
      run_id: r.id,
      name: r.name,
      seed: r.seed,
      metrics: r.metrics,
      improvement_vs_baseline: {
        completions: (r.metrics as any).successfulCompletions - (baseline.metrics as any).successfulCompletions,
        cancellations: (r.metrics as any).cancellations - (baseline.metrics as any).cancellations,
        avg_pickup_change: ((r.metrics as any).avgPickupEta ?? 0) - ((baseline.metrics as any).avgPickupEta ?? 0),
      },
    })),
    label: 'SIMULATED RESULT — NOT A REAL-WORLD PERFORMANCE CLAIM',
    synthetic: true,
    correlation_id: correlationId,
  };
}

export async function simulationGetRun(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('simulation_get_run', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'simulation_get_run');

  const { run_id } = input as any;

  const run = await prisma.simulationRun.findUnique({
    where: { id: run_id },
    include: { events: { orderBy: { occurredAtMin: 'asc' }, take: 100 } },
  });
  if (!run) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Simulation run not found', {
      field: 'run_id',
      correlationId,
    });
  }

  return {
    run_id: run.id,
    external_id: run.externalId,
    name: run.name,
    seed: run.seed,
    horizon_minutes: run.horizonMinutes,
    config_snapshot: run.configSnapshot,
    assumptions: run.assumptions,
    status: run.status,
    metrics: run.metrics,
    results: run.results,
    events: run.events.map((e) => ({
      event_id: e.id,
      event_type: e.eventType,
      time_min: e.occurredAtMin,
      payload: e.payload,
    })),
    label: 'SIMULATED RESULT — NOT A REAL-WORLD PERFORMANCE CLAIM',
    synthetic: true,
    created_at: run.createdAt,
    correlation_id: correlationId,
  };
}

export async function simulationReplayEvents(args: any, ctx: any) {
  const correlationId = ctx?.correlationId ?? crypto.randomUUID();
  const input = validateToolInput('simulation_replay_events', args);

  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkToolPermission(role, 'simulation_replay_events');

  const { run_id } = input as any;

  const run = await prisma.simulationRun.findUnique({
    where: { id: run_id },
    include: { events: { orderBy: { occurredAtMin: 'asc' } } },
  });
  if (!run) {
    throw createError(ErrorCategory.RESOURCE_NOT_FOUND, 'Simulation run not found', {
      field: 'run_id',
      correlationId,
    });
  }

  return {
    run_id: run.id,
    name: run.name,
    seed: run.seed,
    replayable: true,
    event_count: run.events.length,
    events: run.events.map((e) => ({
      event_id: e.id,
      event_type: e.eventType,
      time_min: e.occurredAtMin,
      payload: e.payload,
    })),
    deterministic: true,
    label: 'SIMULATED RESULT — NOT A REAL-WORLD PERFORMANCE CLAIM',
    synthetic: true,
    correlation_id: correlationId,
  };
}

// =====================================================================
// Resource Handler
// =====================================================================

export async function getSimulationRun(uri: string, ctx: any) {
  const role = (ctx.auth?.roles ?? ['ADMIN'])[0] as Role;
  checkResourcePermission(role, uri);

  const runId = uri.replace('simulation://runs/', '');
  return simulationGetRun({ run_id: runId }, ctx);
}

// =====================================================================
// Prompt Handler
// =====================================================================

export async function simulationCompareMarketplaceScenarios(args?: any) {
  return {
    name: 'simulation_compare_marketplace_scenarios',
    description: 'Compare marketplace scenarios using the digital twin',
    arguments: [
      { name: 'baseline_run_id', description: 'Baseline simulation run ID', required: true },
      { name: 'comparison_run_ids', description: 'Comparison run IDs', required: true },
    ],
    workflow: [
      '1. Define baseline scenario parameters',
      '2. Define proposed scenario parameters',
      '3. Run both scenarios with the same seed for reproducibility',
      '4. Compare service, reliability, safety, fairness, retention, and cost metrics',
      '5. Label all results as simulated',
    ],
    approval_boundary: 'Simulation results are read-only; never mutate production state',
    safeguards: [
      'All data is synthetic',
      'Results are not real-world forecasts',
      'Same seed + same inputs = same outputs',
    ],
    next_step: 'Call simulation_run_mobility_scenario, then simulation_compare_runs',
  };
}

// =====================================================================
// Module Registration
// =====================================================================

export function registerDigitalTwinModule(server: any): void {
  server.registerTool(
    {
      name: 'simulation_run_mobility_scenario',
      description: 'Run a reproducible digital twin scenario',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          scenario_type: {
            type: 'string',
            enum: ['demand_surge', 'road_closure', 'driver_reduction', 'long_pickup_assignments', 'opportunity_concentration', 'declining_engagement', 'traffic_disruption', 'combined_disruptions'],
          },
          zone_id: { type: 'string' },
          seed: { type: 'number' },
          horizon_minutes: { type: 'number' },
        },
        required: ['name', 'scenario_type'],
      },
    },
    simulationRunMobilityScenario,
  );

  server.registerTool(
    {
      name: 'simulation_compare_runs',
      description: 'Compare baseline and alternative simulation runs',
      inputSchema: {
        type: 'object',
        properties: {
          run_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['run_ids'],
      },
    },
    simulationCompareRuns,
  );

  server.registerTool(
    {
      name: 'simulation_get_run',
      description: 'Get simulation run details',
      inputSchema: {
        type: 'object',
        properties: { run_id: { type: 'string' } },
        required: ['run_id'],
      },
    },
    simulationGetRun,
  );

  server.registerTool(
    {
      name: 'simulation_replay_events',
      description: 'Replay simulation events',
      inputSchema: {
        type: 'object',
        properties: { run_id: { type: 'string' } },
        required: ['run_id'],
      },
    },
    simulationReplayEvents,
  );

  server.registerResource('simulation://runs/{run_id}', getSimulationRun);

  server.registerPrompt('simulation_compare_marketplace_scenarios', simulationCompareMarketplaceScenarios);

  log.info('Digital Twin module registered');
}
