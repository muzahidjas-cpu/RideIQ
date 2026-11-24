import { describe, expect, it } from 'vitest';
import { runSimulation } from '../../src/intelligence/digital-twin/index.js';

describe('Mobility Digital Twin', () => {
  it('produces identical synthetic results for the same seed and scenario', () => {
    const first = runSimulation(42, 120, 'combined_disruptions', 'zone_demo');
    const second = runSimulation(42, 120, 'combined_disruptions', 'zone_demo');
    expect(first.metrics).toEqual(second.metrics);
    expect(first.events).toEqual(second.events);
    expect(first.reproducible).toBe(true);
  });

  it('returns events in stable chronological order', () => {
    const { events } = runSimulation(9, 240, 'demand_surge');
    expect(events.map((event) => event.time)).toEqual([...events.map((event) => event.time)].sort((a, b) => a - b));
  });

  it('applies scenario disruptions and records contextual rerouting evidence', () => {
    const baseline = runSimulation(42, 240, 'baseline');
    const driverReduction = runSimulation(42, 240, 'driver_reduction');
    const longPickups = runSimulation(42, 240, 'repeated_long_pickups');
    const rerouting = runSimulation(42, 240, 'traffic_rerouting');

    expect(new Set(driverReduction.events.map((event) => event.driverId)).size)
      .toBeLessThan(new Set(baseline.events.map((event) => event.driverId)).size);
    expect(longPickups.metrics.avgPickupEta).toBeGreaterThan(baseline.metrics.avgPickupEta);
    expect(rerouting.events.some((event) => event.payload.reroutingContext === 'road_closure_or_traffic')).toBe(true);
    expect(rerouting.metrics.safetyReviews).toBe(0);
  });
});
