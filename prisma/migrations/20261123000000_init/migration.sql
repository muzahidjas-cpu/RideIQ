-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "licenseNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "rating" DOUBLE PRECISION,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "completedTrips" INTEGER NOT NULL DEFAULT 0,
    "cancelledTrips" INTEGER NOT NULL DEFAULT 0,
    "avgEarnings" DOUBLE PRECISION,
    "zoneId" TEXT,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rider" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "rating" DOUBLE PRECISION,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "driverId" TEXT,
    "assignedDriverId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropoffLat" DOUBLE PRECISION,
    "dropoffLng" DOUBLE PRECISION,
    "distanceKm" DOUBLE PRECISION,
    "estimatedDurationMin" INTEGER,
    "actualDurationMin" INTEGER,
    "fare" DOUBLE PRECISION,
    "earnings" DOUBLE PRECISION,
    "pickupDistanceKm" DOUBLE PRECISION,
    "estimatedPickupMin" INTEGER,
    "actualPickupMin" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "zoneId" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "dataSource" TEXT NOT NULL DEFAULT 'operational',

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverMetrics" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "shortPickupTrips" INTEGER NOT NULL DEFAULT 0,
    "shortPickupCompleted" INTEGER NOT NULL DEFAULT 0,
    "longPickupTrips" INTEGER NOT NULL DEFAULT 0,
    "longPickupCompleted" INTEGER NOT NULL DEFAULT 0,
    "shortTripTrips" INTEGER NOT NULL DEFAULT 0,
    "shortTripCompleted" INTEGER NOT NULL DEFAULT 0,
    "longTripTrips" INTEGER NOT NULL DEFAULT 0,
    "longTripCompleted" INTEGER NOT NULL DEFAULT 0,
    "peakTrips" INTEGER NOT NULL DEFAULT 0,
    "peakCompleted" INTEGER NOT NULL DEFAULT 0,
    "offPeakTrips" INTEGER NOT NULL DEFAULT 0,
    "offPeakCompleted" INTEGER NOT NULL DEFAULT 0,
    "acceptanceCount" INTEGER NOT NULL DEFAULT 0,
    "completionCount" INTEGER NOT NULL DEFAULT 0,
    "cancellationCount" INTEGER NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "observationWindowDays" INTEGER NOT NULL DEFAULT 30,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DriverMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverFeedback" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripId" TEXT,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAuthorized" BOOLEAN NOT NULL DEFAULT true,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DriverFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "riderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL DEFAULT 'low',
    "category" TEXT NOT NULL,
    "description" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "authorizedBy" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteObservation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "incidentId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedRoute" JSONB NOT NULL DEFAULT '{}',
    "observedRoute" JSONB NOT NULL DEFAULT '{}',
    "deviationDistanceMeters" DOUBLE PRECISION,
    "deviationDurationSec" INTEGER,
    "trafficContext" JSONB NOT NULL DEFAULT '{}',
    "gpsAccuracyMeters" DOUBLE PRECISION,
    "telemetryQuality" TEXT NOT NULL DEFAULT 'unknown',
    "riderCheckIn" BOOLEAN,
    "roadClosure" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RouteObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingConfiguration" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "weights" JSONB NOT NULL DEFAULT '{}',
    "hardConstraints" JSONB NOT NULL DEFAULT '{}',
    "fairnessConfig" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchingConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneMetrics" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "supplyDemandRatio" DOUBLE PRECISION,
    "availableDriverCount" INTEGER NOT NULL DEFAULT 0,
    "averageWaitMin" DOUBLE PRECISION,
    "opportunityDistribution" JSONB NOT NULL DEFAULT '{}',
    "earningsDistribution" JSONB NOT NULL DEFAULT '{}',
    "dataFreshness" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZoneMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingScore" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "proximityComponent" DOUBLE PRECISION NOT NULL,
    "familiarityComponent" DOUBLE PRECISION NOT NULL,
    "reliabilityComponent" DOUBLE PRECISION NOT NULL,
    "fairnessComponent" DOUBLE PRECISION NOT NULL,
    "hardConstraintPass" BOOLEAN NOT NULL DEFAULT true,
    "scoreBreakdown" JSONB NOT NULL DEFAULT '{}',
    "configId" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatchingScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityLedgerEntry" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "zoneId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "eligibleOnlineHoursMin" DOUBLE PRECISION NOT NULL,
    "eligibleTripOffers" INTEGER NOT NULL DEFAULT 0,
    "assignmentsReceived" INTEGER NOT NULL DEFAULT 0,
    "assignmentCompletionRatio" DOUBLE PRECISION,
    "offersPerEligibleHour" DOUBLE PRECISION,
    "avgPickupDistanceKm" DOUBLE PRECISION,
    "avgPickupTimeMin" DOUBLE PRECISION,
    "estimatedEarningsOpportunity" DOUBLE PRECISION,
    "actualEarnings" DOUBLE PRECISION,
    "opportunityExclusion" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OpportunityLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnAssessment" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "segmentId" TEXT,
    "churnProbability" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "evidenceQuality" TEXT NOT NULL,
    "observationWindowDays" INTEGER NOT NULL DEFAULT 30,
    "trend" TEXT NOT NULL DEFAULT 'stable',
    "recommendedPriority" TEXT NOT NULL DEFAULT 'medium',
    "behavioralIndicators" JSONB NOT NULL DEFAULT '{}',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChurnAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionProposal" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "estimatedCost" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "budgetValidated" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "InterventionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReliabilityAssessment" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripId" TEXT,
    "cancellationProbability" DOUBLE PRECISION NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "evidenceQuality" TEXT NOT NULL,
    "primaryRiskFactors" JSONB NOT NULL DEFAULT '[]',
    "explanation" TEXT,
    "modelVersion" TEXT NOT NULL,
    "dataFreshness" TIMESTAMP(3) NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReliabilityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPrediction" (
    "id" TEXT NOT NULL,
    "driverId" TEXT,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "predictionType" TEXT NOT NULL,
    "predictionValue" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION,
    "evidenceQuality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ModelPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRegistryEntry" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "trainingDataProvenance" TEXT NOT NULL,
    "limitations" TEXT,
    "evaluationResults" JSONB NOT NULL DEFAULT '{}',
    "failureConditions" JSONB NOT NULL DEFAULT '[]',
    "deploymentStatus" TEXT NOT NULL DEFAULT 'shadow',
    "approvalHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionTrace" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "entityRef" TEXT NOT NULL,
    "dataSources" JSONB NOT NULL DEFAULT '[]',
    "dataFreshness" TIMESTAMP(3) NOT NULL,
    "dataQuality" JSONB NOT NULL DEFAULT '{}',
    "modelVersion" TEXT,
    "policyVersion" TEXT,
    "configVersion" TEXT,
    "observedSignals" JSONB NOT NULL DEFAULT '{}',
    "calculatedMetrics" JSONB NOT NULL DEFAULT '{}',
    "predictedSignals" JSONB NOT NULL DEFAULT '{}',
    "simulatedOutputs" JSONB NOT NULL DEFAULT '{}',
    "contributingFactors" JSONB NOT NULL DEFAULT '[]',
    "uncertainty" JSONB NOT NULL DEFAULT '{}',
    "alternativeExplanations" JSONB NOT NULL DEFAULT '[]',
    "recommendation" JSONB NOT NULL DEFAULT '{}',
    "requiredRole" TEXT,
    "approvalState" TEXT NOT NULL DEFAULT 'none',
    "humanDecision" TEXT,
    "finalOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverId" TEXT,

    CONSTRAINT "DecisionTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seed" INTEGER NOT NULL DEFAULT 42,
    "horizonMinutes" INTEGER NOT NULL,
    "configSnapshot" JSONB NOT NULL DEFAULT '{}',
    "assumptions" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAtMin" INTEGER NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "SimulationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "sourceModule" TEXT NOT NULL,
    "correlationId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOutbox" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requiredRoles" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataCorrectionRequest" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "driverId" TEXT,
    "tripId" TEXT,
    "reportedBy" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "reportedValue" TEXT NOT NULL,
    "correctValue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_externalId_key" ON "Driver"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_email_key" ON "Driver"("email");

-- CreateIndex
CREATE INDEX "Driver_status_idx" ON "Driver"("status");

-- CreateIndex
CREATE INDEX "Driver_zoneId_idx" ON "Driver"("zoneId");

-- CreateIndex
CREATE INDEX "Driver_isEligible_idx" ON "Driver"("isEligible");

-- CreateIndex
CREATE UNIQUE INDEX "Rider_externalId_key" ON "Rider"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Rider_email_key" ON "Rider"("email");

-- CreateIndex
CREATE INDEX "Rider_externalId_idx" ON "Rider"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_externalId_key" ON "Trip"("externalId");

-- CreateIndex
CREATE INDEX "Trip_riderId_idx" ON "Trip"("riderId");

-- CreateIndex
CREATE INDEX "Trip_driverId_idx" ON "Trip"("driverId");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_requestedAt_idx" ON "Trip"("requestedAt");

-- CreateIndex
CREATE INDEX "Trip_zoneId_idx" ON "Trip"("zoneId");

-- CreateIndex
CREATE INDEX "Trip_isSynthetic_idx" ON "Trip"("isSynthetic");

-- CreateIndex
CREATE INDEX "TripEvent_tripId_idx" ON "TripEvent"("tripId");

-- CreateIndex
CREATE INDEX "TripEvent_eventType_idx" ON "TripEvent"("eventType");

-- CreateIndex
CREATE INDEX "TripEvent_occurredAt_idx" ON "TripEvent"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverMetrics_driverId_key" ON "DriverMetrics"("driverId");

-- CreateIndex
CREATE INDEX "DriverMetrics_driverId_idx" ON "DriverMetrics"("driverId");

-- CreateIndex
CREATE INDEX "DriverFeedback_driverId_idx" ON "DriverFeedback"("driverId");

-- CreateIndex
CREATE INDEX "DriverFeedback_createdAt_idx" ON "DriverFeedback"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyIncident_externalId_key" ON "SafetyIncident"("externalId");

-- CreateIndex
CREATE INDEX "SafetyIncident_tripId_idx" ON "SafetyIncident"("tripId");

-- CreateIndex
CREATE INDEX "SafetyIncident_driverId_idx" ON "SafetyIncident"("driverId");

-- CreateIndex
CREATE INDEX "SafetyIncident_status_idx" ON "SafetyIncident"("status");

-- CreateIndex
CREATE INDEX "SafetyIncident_severity_idx" ON "SafetyIncident"("severity");

-- CreateIndex
CREATE INDEX "SafetyIncident_reportedAt_idx" ON "SafetyIncident"("reportedAt");

-- CreateIndex
CREATE INDEX "RouteObservation_tripId_idx" ON "RouteObservation"("tripId");

-- CreateIndex
CREATE INDEX "RouteObservation_observedAt_idx" ON "RouteObservation"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingConfiguration_externalId_key" ON "MatchingConfiguration"("externalId");

-- CreateIndex
CREATE INDEX "MatchingConfiguration_isActive_idx" ON "MatchingConfiguration"("isActive");

-- CreateIndex
CREATE INDEX "MatchingConfiguration_version_idx" ON "MatchingConfiguration"("version");

-- CreateIndex
CREATE INDEX "MatchingConfiguration_status_idx" ON "MatchingConfiguration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_externalId_key" ON "Zone"("externalId");

-- CreateIndex
CREATE INDEX "Zone_externalId_idx" ON "Zone"("externalId");

-- CreateIndex
CREATE INDEX "Zone_isActive_idx" ON "Zone"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ZoneMetrics_zoneId_key" ON "ZoneMetrics"("zoneId");

-- CreateIndex
CREATE INDEX "ZoneMetrics_zoneId_idx" ON "ZoneMetrics"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingScore_tripId_key" ON "MatchingScore"("tripId");

-- CreateIndex
CREATE INDEX "MatchingScore_tripId_idx" ON "MatchingScore"("tripId");

-- CreateIndex
CREATE INDEX "MatchingScore_driverId_idx" ON "MatchingScore"("driverId");

-- CreateIndex
CREATE INDEX "MatchingScore_calculatedAt_idx" ON "MatchingScore"("calculatedAt");

-- CreateIndex
CREATE INDEX "OpportunityLedgerEntry_driverId_idx" ON "OpportunityLedgerEntry"("driverId");

-- CreateIndex
CREATE INDEX "OpportunityLedgerEntry_zoneId_idx" ON "OpportunityLedgerEntry"("zoneId");

-- CreateIndex
CREATE INDEX "OpportunityLedgerEntry_windowStart_idx" ON "OpportunityLedgerEntry"("windowStart");

-- CreateIndex
CREATE INDEX "OpportunityLedgerEntry_windowEnd_idx" ON "OpportunityLedgerEntry"("windowEnd");

-- CreateIndex
CREATE INDEX "OpportunityLedgerEntry_opportunityExclusion_idx" ON "OpportunityLedgerEntry"("opportunityExclusion");

-- CreateIndex
CREATE UNIQUE INDEX "ChurnAssessment_driverId_key" ON "ChurnAssessment"("driverId");

-- CreateIndex
CREATE INDEX "ChurnAssessment_driverId_idx" ON "ChurnAssessment"("driverId");

-- CreateIndex
CREATE INDEX "ChurnAssessment_segmentId_idx" ON "ChurnAssessment"("segmentId");

-- CreateIndex
CREATE INDEX "ChurnAssessment_recommendedPriority_idx" ON "ChurnAssessment"("recommendedPriority");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionProposal_externalId_key" ON "InterventionProposal"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionProposal_idempotencyKey_key" ON "InterventionProposal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InterventionProposal_driverId_idx" ON "InterventionProposal"("driverId");

-- CreateIndex
CREATE INDEX "InterventionProposal_status_idx" ON "InterventionProposal"("status");

-- CreateIndex
CREATE INDEX "InterventionProposal_idempotencyKey_idx" ON "InterventionProposal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ReliabilityAssessment_driverId_idx" ON "ReliabilityAssessment"("driverId");

-- CreateIndex
CREATE INDEX "ReliabilityAssessment_calculatedAt_idx" ON "ReliabilityAssessment"("calculatedAt");

-- CreateIndex
CREATE INDEX "ModelPrediction_modelId_idx" ON "ModelPrediction"("modelId");

-- CreateIndex
CREATE INDEX "ModelPrediction_driverId_idx" ON "ModelPrediction"("driverId");

-- CreateIndex
CREATE INDEX "ModelPrediction_createdAt_idx" ON "ModelPrediction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelRegistryEntry_modelId_key" ON "ModelRegistryEntry"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionTrace_externalId_key" ON "DecisionTrace"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionTrace_decisionId_key" ON "DecisionTrace"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionTrace_decisionId_idx" ON "DecisionTrace"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionTrace_category_idx" ON "DecisionTrace"("category");

-- CreateIndex
CREATE INDEX "DecisionTrace_sourceModule_idx" ON "DecisionTrace"("sourceModule");

-- CreateIndex
CREATE INDEX "DecisionTrace_approvalState_idx" ON "DecisionTrace"("approvalState");

-- CreateIndex
CREATE INDEX "DecisionTrace_createdAt_idx" ON "DecisionTrace"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationRun_externalId_key" ON "SimulationRun"("externalId");

-- CreateIndex
CREATE INDEX "SimulationRun_externalId_idx" ON "SimulationRun"("externalId");

-- CreateIndex
CREATE INDEX "SimulationRun_status_idx" ON "SimulationRun"("status");

-- CreateIndex
CREATE INDEX "SimulationRun_createdAt_idx" ON "SimulationRun"("createdAt");

-- CreateIndex
CREATE INDEX "SimulationEvent_runId_idx" ON "SimulationEvent"("runId");

-- CreateIndex
CREATE INDEX "SimulationEvent_occurredAtMin_idx" ON "SimulationEvent"("occurredAtMin");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalEvent_externalId_key" ON "OperationalEvent"("externalId");

-- CreateIndex
CREATE INDEX "OperationalEvent_eventType_idx" ON "OperationalEvent"("eventType");

-- CreateIndex
CREATE INDEX "OperationalEvent_correlationId_idx" ON "OperationalEvent"("correlationId");

-- CreateIndex
CREATE INDEX "OperationalEvent_occurredAt_idx" ON "OperationalEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "OperationalEvent_processed_idx" ON "OperationalEvent"("processed");

-- CreateIndex
CREATE INDEX "EventOutbox_status_idx" ON "EventOutbox"("status");

-- CreateIndex
CREATE INDEX "EventOutbox_createdAt_idx" ON "EventOutbox"("createdAt");

-- CreateIndex
CREATE INDEX "EventOutbox_aggregateType_aggregateId_idx" ON "EventOutbox"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "EventOutbox_aggregateType_aggregateId_key" ON "EventOutbox"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_externalId_key" ON "ApprovalRequest"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_idempotencyKey_key" ON "ApprovalRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ApprovalRequest_actionType_idx" ON "ApprovalRequest"("actionType");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_idempotencyKey_idx" ON "ApprovalRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataCorrectionRequest_externalId_key" ON "DataCorrectionRequest"("externalId");

-- CreateIndex
CREATE INDEX "DataCorrectionRequest_driverId_idx" ON "DataCorrectionRequest"("driverId");

-- CreateIndex
CREATE INDEX "DataCorrectionRequest_tripId_idx" ON "DataCorrectionRequest"("tripId");

-- CreateIndex
CREATE INDEX "DataCorrectionRequest_status_idx" ON "DataCorrectionRequest"("status");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverMetrics" ADD CONSTRAINT "DriverMetrics_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverFeedback" ADD CONSTRAINT "DriverFeedback_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverFeedback" ADD CONSTRAINT "DriverFeedback_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteObservation" ADD CONSTRAINT "RouteObservation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteObservation" ADD CONSTRAINT "RouteObservation_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SafetyIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneMetrics" ADD CONSTRAINT "ZoneMetrics_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingScore" ADD CONSTRAINT "MatchingScore_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MatchingConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingScore" ADD CONSTRAINT "MatchingScore_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLedgerEntry" ADD CONSTRAINT "OpportunityLedgerEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityLedgerEntry" ADD CONSTRAINT "OpportunityLedgerEntry_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurnAssessment" ADD CONSTRAINT "ChurnAssessment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionProposal" ADD CONSTRAINT "InterventionProposal_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReliabilityAssessment" ADD CONSTRAINT "ReliabilityAssessment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReliabilityAssessment" ADD CONSTRAINT "ReliabilityAssessment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPrediction" ADD CONSTRAINT "ModelPrediction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionTrace" ADD CONSTRAINT "DecisionTrace_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationEvent" ADD CONSTRAINT "SimulationEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

