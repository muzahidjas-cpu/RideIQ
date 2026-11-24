// RideIQ — Synthetic Data Seeder
// Loads clearly-labelled synthetic demonstration data.
// NEVER mixes synthetic with real data without provenance metadata.

import { prisma } from '../src/core/database/index.js';
import { logger } from '../src/core/logging/index.js';

const SYNTHETIC = true;
let seedState = 42;
const seedTime = new Date('2026-11-23T00:00:00.000Z');
function random(): number {
  seedState = (seedState * 1664525 + 1013904223) >>> 0;
  return seedState / 0x100000000;
}

async function seed() {
  logger.info('Seeding synthetic demonstration data...');

  // Create zones
  const zone = await prisma.zone.upsert({
    where: { externalId: 'zone_downtown' },
    update: {},
    create: {
      externalId: 'zone_downtown',
      name: 'Downtown',
      centerLat: 40.7128,
      centerLng: -74.006,
      radiusKm: 5,
      isActive: true,
      isSynthetic: SYNTHETIC,
    },
  });

  // Create synthetic drivers
  const drivers = [];
  await prisma.opportunityLedgerEntry.deleteMany({ where: { isSynthetic: true } });
  for (let i = 1; i <= 25; i++) {
    const driverData = {
        externalId: `sim_driver_${i}`,
        name: `Simulated Driver ${i}`,
        email: `driver${i}@example.com`,
        phone: `+1-555-${String(i).padStart(4, '0')}`,
        status: i % 5 === 0 ? 'offline' : 'online',
        rating: Number((4.0 + random()).toFixed(2)),
        totalTrips: Math.floor(random() * 500),
        completedTrips: Math.floor(random() * 450),
        cancelledTrips: Math.floor(random() * 50),
        zoneId: zone.id,
        isEligible: true,
        isSynthetic: SYNTHETIC,
    };
    const d = await prisma.driver.upsert({ where: { externalId: driverData.externalId }, update: driverData, create: driverData });
    drivers.push(d);

    const metricsData = {
        driverId: d.id,
        shortPickupTrips: Math.floor(random() * 100),
        shortPickupCompleted: Math.floor(random() * 90),
        longPickupTrips: Math.floor(random() * 80),
        longPickupCompleted: Math.floor(random() * 60),
        shortTripTrips: Math.floor(random() * 120),
        shortTripCompleted: Math.floor(random() * 110),
        longTripTrips: Math.floor(random() * 60),
        longTripCompleted: Math.floor(random() * 50),
        peakTrips: Math.floor(random() * 80),
        peakCompleted: Math.floor(random() * 70),
        offPeakTrips: Math.floor(random() * 100),
        offPeakCompleted: Math.floor(random() * 90),
        acceptanceCount: Math.floor(random() * 200),
        completionCount: Math.floor(random() * 180),
        cancellationCount: Math.floor(random() * 30),
        sampleSize: Math.floor(random() * 200),
        observationWindowDays: 30,
        isSynthetic: SYNTHETIC,
    };
    await prisma.driverMetrics.upsert({ where: { driverId: d.id }, update: metricsData, create: metricsData });

    const churnData = {
        driverId: d.id,
        churnProbability: random(),
        confidence: 0.6,
        evidenceQuality: 'medium',
        trend: random() > 0.5 ? 'declining' : 'stable',
        recommendedPriority: random() > 0.7 ? 'high' : 'medium',
        behavioralIndicators: { trip_decline: random(), complaint_count: Math.floor(random() * 5) },
        isSynthetic: SYNTHETIC,
    };
    await prisma.churnAssessment.upsert({ where: { driverId: d.id }, update: churnData, create: churnData });

    await prisma.opportunityLedgerEntry.create({
      data: {
        driverId: d.id,
        zoneId: zone.id,
        windowStart: new Date(seedTime.getTime() - 7 * 24 * 60 * 60 * 1000),
        windowEnd: seedTime,
        eligibleOnlineHoursMin: 40,
        eligibleTripOffers: Math.floor(random() * 30),
        assignmentsReceived: Math.floor(random() * 25),
        offersPerEligibleHour: random() * 2,
        avgPickupDistanceKm: 5 + random() * 10,
        estimatedEarningsOpportunity: 200 + random() * 300,
        opportunityExclusion: random() > 0.8,
        isSynthetic: SYNTHETIC,
      },
    });
  }

  // Create synthetic riders
  const riders = [];
  for (let i = 1; i <= 50; i++) {
    const riderData = {
        externalId: `sim_rider_${i}`,
        name: `Simulated Rider ${i}`,
        email: `rider${i}@example.com`,
        totalTrips: Math.floor(random() * 100),
        isSynthetic: SYNTHETIC,
    };
    const r = await prisma.rider.upsert({ where: { externalId: riderData.externalId }, update: riderData, create: riderData });
    riders.push(r);
  }

  // Create synthetic trips
  for (let i = 0; i < 100; i++) {
    const driver = drivers[i % drivers.length];
    const rider = riders[i % riders.length];
    const tripData = {
        externalId: `sim_trip_${i}`,
        riderId: rider.id,
        driverId: i % 3 === 0 ? null : driver.id,
        status: i % 10 === 0 ? 'cancelled' : i % 10 === 1 ? 'pending' : 'completed',
        pickupLat: 40.7128 + (random() - 0.5) * 0.1,
        pickupLng: -74.006 + (random() - 0.5) * 0.1,
        dropoffLat: 40.7128 + (random() - 0.5) * 0.1,
        dropoffLng: -74.006 + (random() - 0.5) * 0.1,
        distanceKm: 3 + random() * 20,
        pickupDistanceKm: 1 + random() * 10,
        estimatedPickupMin: 3 + random() * 15,
        requestedAt: new Date(seedTime.getTime() - random() * 7 * 24 * 60 * 60 * 1000),
        zoneId: zone.id,
        isSynthetic: SYNTHETIC,
    };
    await prisma.trip.upsert({ where: { externalId: tripData.externalId }, update: tripData, create: tripData });
  }

  // Create default matching configuration
  await prisma.matchingConfiguration.upsert({
    where: { externalId: 'config_default' },
    update: {},
    create: {
      externalId: 'config_default',
      version: 1,
      name: 'Default Balanced',
      isActive: true,
      weights: { proximity: 0.3, familiarity: 0.2, reliability: 0.3, fairness: 0.2 },
      hardConstraints: { maxPickupTimeMin: 30, requireDriverEligible: true },
      fairnessConfig: { enableOpportunityLedger: true },
      createdBy: 'system',
      status: 'active',
    },
  });

  logger.info('Synthetic data seeded successfully');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exit(1);
  });
