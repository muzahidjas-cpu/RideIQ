import { runSimulation } from './index.js';

export const SIMULATION_NOTICE = 'SIMULATED RESULT — NOT A REAL-WORLD PERFORMANCE CLAIM.';

function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total === 0) return 0;
  const weighted = sorted.reduce((sum, value, index) => sum + (index + 1) * value, 0);
  return Number(((2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length).toFixed(4));
}

function summarize(snapshot: ReturnType<typeof runSimulation>) {
  const distribution = [...snapshot.state.drivers.keys()].map(
    (driverId) => snapshot.metrics.opportunityDistribution[driverId] ?? 0,
  );
  const routeEvents = snapshot.events.filter((event) => event.payload.routeDeviation);
  const contextualReroutes = routeEvents.filter(
    (event) => event.payload.reroutingContext !== null,
  );
  const engagement = [...snapshot.state.drivers.keys()].map(
    (driverId) => snapshot.metrics.driverEngagement[driverId] ?? 0,
  );
  const tripCount = snapshot.state.trips.size;

  return {
    sharedSnapshot: {
      synthetic: true,
      drivers: snapshot.state.drivers.size,
      riders: snapshot.state.riders.size,
      trips: tripCount,
      events: snapshot.events.length,
      zoneIds: [...snapshot.state.zones.keys()],
    },
    driverReliability: {
      completedTrips: snapshot.metrics.successfulCompletions,
      cancellations: snapshot.metrics.cancellations,
      cancellationRate: tripCount ? Number((snapshot.metrics.cancellations / tripCount).toFixed(4)) : 0,
      averagePickupEtaMinutes: Number(snapshot.metrics.avgPickupEta.toFixed(2)),
      evidence: 'CALCULATED from synthetic trip events; not a driver-level prediction',
    },
    riderSafety: {
      routeDeviationObservations: routeEvents.length,
      contextualReroutes: contextualReroutes.length,
      reviewsRequiringAttention: snapshot.metrics.safetyReviews,
      policy: 'Route deviation alone does not indicate danger; road closure context is retained',
    },
    marketplaceFairness: {
      eligibleDriverCount: distribution.length,
      opportunityGini: gini(distribution),
      mostExposedDriverShare: tripCount
        ? Number((Math.max(...distribution) / tripCount).toFixed(4))
        : 0,
      evidence: 'CALCULATED from the same synthetic assignment ledger',
    },
    driverRetention: {
      averageEngagementIndicator: engagement.length
        ? Number((engagement.reduce((sum, value) => sum + value, 0) / engagement.length).toFixed(3))
        : 0,
      driversWithDecliningEngagement: engagement.filter((value) => value < 1).length,
      interventionIssued: false,
      evidence: 'SIMULATED engagement indicator; no causal retention claim',
    },
    operatingCostEstimate: Number(snapshot.metrics.operatingCost.toFixed(2)),
  };
}

export function buildMarketplaceStressTest(seed = 42, horizonMinutes = 240) {
  if (!Number.isInteger(seed) || seed < 0) throw new Error('seed must be a non-negative integer');
  if (!Number.isInteger(horizonMinutes) || horizonMinutes < 60 || horizonMinutes > 1440) {
    throw new Error('horizonMinutes must be an integer between 60 and 1440');
  }

  const baseline = summarize(runSimulation(seed, horizonMinutes, 'baseline', 'zone_demo'));
  const stress = summarize(runSimulation(seed, horizonMinutes, 'combined_disruptions', 'zone_demo'));
  const checks = {
    demandIncreased: stress.sharedSnapshot.trips > baseline.sharedSnapshot.trips,
    reliabilityPressureIncreased: stress.driverReliability.cancellationRate > baseline.driverReliability.cancellationRate,
    pickupDelayIncreased: stress.driverReliability.averagePickupEtaMinutes > baseline.driverReliability.averagePickupEtaMinutes,
    opportunityConcentrationIncreased: stress.marketplaceFairness.opportunityGini > baseline.marketplaceFairness.opportunityGini,
    safetyContextRecorded: stress.riderSafety.routeDeviationObservations > 0
      && stress.riderSafety.contextualReroutes > 0,
    retentionSignalsPresent: stress.driverRetention.driversWithDecliningEngagement > 0,
  };

  return {
    title: 'RideIQ Marketplace Stress Test',
    status: 'SIMULATED',
    notice: SIMULATION_NOTICE,
    seed,
    horizonMinutes,
    simulationVersion: 'rideiq-digital-twin-v1',
    assumptions: [
      'All drivers, riders, trips, and outcomes are synthetic.',
      'Baseline and disruption scenarios use the same seed, horizon, and zone.',
      'Disruptions show software behavior and trade-offs, not validated forecasts or causal effects.',
      'Safety deviations with road-closure context are retained for review without asserting danger.',
      'No operational trip, dispatch, safety, or incentive action is performed.',
    ],
    baseline,
    stress,
    crossDomainFindings: [
      'The driver-reduction and pickup-delay scenario increases assignment pressure; cancellations are reported as marketplace outcomes, not proof of individual intent.',
      'The same trip timeline records route deviations with contextual rerouting evidence for the safety review path.',
      'The shared opportunity ledger exposes concentration alongside service and reliability metrics.',
      'Declining engagement is surfaced as a synthetic retention signal; no incentive is issued.',
    ],
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}
