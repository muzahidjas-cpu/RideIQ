import { describe, expect, it } from 'vitest';
import { buildMarketplaceStressTest, SIMULATION_NOTICE } from '../../src/intelligence/digital-twin/stress-test.js';

describe('Marketplace Stress Test', () => {
  it('compares all four domains from a shared deterministic synthetic snapshot', () => {
    const first = buildMarketplaceStressTest(42, 240);
    const second = buildMarketplaceStressTest(42, 240);

    expect(first).toEqual(second);
    expect(first.passed).toBe(true);
    expect(first.notice).toBe(SIMULATION_NOTICE);
    expect(first.baseline.sharedSnapshot.synthetic).toBe(true);
    expect(first.stress.sharedSnapshot).toMatchObject({ drivers: 20, riders: 50, zoneIds: ['zone_demo'] });
    expect(first.stress.driverReliability).toBeDefined();
    expect(first.stress.riderSafety).toBeDefined();
    expect(first.stress.marketplaceFairness).toBeDefined();
    expect(first.stress.driverRetention).toBeDefined();
    expect(Object.values(first.checks).every(Boolean)).toBe(true);
  });

  it('validates seed and bounded simulation horizon', () => {
    expect(() => buildMarketplaceStressTest(-1, 240)).toThrow('seed must be a non-negative integer');
    expect(() => buildMarketplaceStressTest(42, 30)).toThrow('horizonMinutes must be an integer between 60 and 1440');
  });
});
