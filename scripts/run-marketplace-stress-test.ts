import { buildMarketplaceStressTest } from '../src/intelligence/digital-twin/stress-test.js';

const seed = Number(process.env.RIDEIQ_DEMO_SEED ?? '42');
const horizonMinutes = Number(process.env.RIDEIQ_DEMO_HORIZON_MINUTES ?? '240');
const report = buildMarketplaceStressTest(seed, horizonMinutes);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
