// RideIQ Input/Output Validation
// Zod schemas shared across all domain modules.

import { z } from 'zod';

// Common fields
export const DriverIdSchema = z.string().min(1, 'driver_id is required');
export const RiderIdSchema = z.string().min(1, 'rider_id is required');
export const TripIdSchema = z.string().min(1, 'trip_id is required');
export const ZoneIdSchema = z.string().min(1, 'zone_id is required');
export const ModelVersionSchema = z.string().min(1, 'model_version is required');

// --- Driver Reliability ---

export const TripDetailsSchema = z.object({
  pickupDistanceKm: z.number().min(0).optional(),
  estimatedPickupMin: z.number().min(0).optional(),
  distanceKm: z.number().min(0).optional(),
  estimatedDurationMin: z.number().min(0).optional(),
  fare: z.number().min(0).optional(),
  zoneId: z.string().optional(),
  isPeakHour: z.boolean().optional(),
});

export const DriverPredictCancellationRiskInput = z.object({
  driver_id: DriverIdSchema,
  trip_details: TripDetailsSchema,
});

export const DriverGetReliabilityInput = z.object({
  driver_id: DriverIdSchema,
});

export const DriverGetCancellationExplanationInput = z.object({
  driver_id: DriverIdSchema,
  trip_details: TripDetailsSchema.optional(),
});

export const DriverSimulateAssignmentInput = z.object({
  trip_details: TripDetailsSchema,
  candidate_driver_ids: z.array(DriverIdSchema).min(1, 'At least one candidate driver required'),
});

export const DriverRecommendAssignmentInput = z.object({
  trip_details: TripDetailsSchema,
  candidate_driver_ids: z.array(DriverIdSchema).min(1),
  rider_id: RiderIdSchema.optional(),
  max_wait_min: z.number().min(0).optional(),
});

export const DriverReassignTripInput = z.object({
  trip_id: TripIdSchema,
  new_driver_id: DriverIdSchema,
  reason: z.string().min(1, 'Reason is required'),
  idempotency_key: z.string().optional(),
});

export const DriverGetAssignmentExplanationInput = z.object({
  trip_id: TripIdSchema,
  driver_id: DriverIdSchema.optional(),
});

export const DriverSubmitDataCorrectionInput = z.object({
  driver_id: DriverIdSchema.optional(),
  trip_id: TripIdSchema.optional(),
  reported_by: z.string().min(1, 'reported_by is required'),
  field: z.string().min(1, 'field is required'),
  reported_value: z.string().min(1, 'reported_value is required'),
  correct_value: z.string().optional(),
});

// --- Safety ---

export const RouteMetadataSchema = z.object({
  routeId: z.string().optional(),
  expectedDistanceKm: z.number().min(0).optional(),
  expectedDurationMin: z.number().min(0).optional(),
  zoneId: z.string().optional(),
  timeOfDay: z.string().optional(),
});

export const SafetyEvaluatePreTripRiskInput = z.object({
  driver_id: DriverIdSchema,
  rider_id: RiderIdSchema.optional(),
  route_metadata: RouteMetadataSchema,
});

export const SafetyGetLiveDeviationInput = z.object({
  trip_id: TripIdSchema,
});

export const SafetyEvaluateDeviationInput = z.object({
  trip_id: TripIdSchema,
  observedRoute: z.array(z.array(z.number())).optional(),
  expectedRoute: z.array(z.array(z.number())).optional(),
});

export const SafetyGetIncidentContextInput = z.object({
  incident_id: z.string().optional(),
  trip_id: TripIdSchema.optional(),
  driver_id: DriverIdSchema.optional(),
});

export const SafetyTriggerEmergencyProtocolInput = z.object({
  trip_id: TripIdSchema,
  driver_id: DriverIdSchema,
  rider_id: RiderIdSchema.optional(),
  incident_type: z.string().min(1),
  idempotency_key: z.string().optional(),
});

export const SafetyEscalateIncidentInput = z.object({
  incident_id: z.string().min(1, 'incident_id is required'),
  escalation_reason: z.string().min(1),
  idempotency_key: z.string().optional(),
});

export const SafetyGetIncidentStatusInput = z.object({
  incident_id: z.string().min(1),
});

// --- Matching ---

export const MatchingContextSchema = z.object({
  zone_id: ZoneIdSchema.optional(),
  time_of_day: z.string().optional(),
  demand_level: z.enum(['low', 'medium', 'high']).optional(),
  max_pickup_min: z.number().min(0).optional(),
});

export const MatchingCalculateScoreInput = z.object({
  rider_id: RiderIdSchema,
  driver_id: DriverIdSchema,
  matching_context: MatchingContextSchema,
});

export const MatchingSimulateDistributionInput = z.object({
  zone_id: ZoneIdSchema,
  weights_config: z.record(z.string(), z.number()),
});

export const MatchingGetZoneMetricsInput = z.object({
  zone_id: ZoneIdSchema,
});

export const MatchingCompareConfigurationsInput = z.object({
  zone_id: ZoneIdSchema,
  config_ids: z.array(z.string()).min(2),
});

export const MatchingRecommendWeightsInput = z.object({
  zone_id: ZoneIdSchema,
  objectives: z.array(z.string()).default(['efficiency', 'fairness']),
});

export const MatchingUpdateProductionWeightsInput = z.object({
  config_id: z.string().min(1),
  weights: z.record(z.string(), z.number()),
  idempotency_key: z.string().optional(),
  dry_run: z.boolean().default(true),
});

// --- Retention ---

export const RetentionQueryChurnRiskInput = z.object({
  segment_filter: z.string().optional(),
});

export const RetentionGetDriverFeedbackInput = z.object({
  driver_id: DriverIdSchema,
});

export const RetentionAnalyzeChurnFactorsInput = z.object({
  driver_id: DriverIdSchema,
});

export const RetentionRecommendInterventionInput = z.object({
  driver_id: DriverIdSchema,
});

export const RetentionSimulateIncentiveInput = z.object({
  driver_id: DriverIdSchema,
  incentive_type: z.enum(['financial', 'non_financial']),
  estimated_amount: z.number().min(0).optional(),
});

export const RetentionSendIncentiveInput = z.object({
  driver_id: DriverIdSchema,
  type: z.enum(['financial', 'non_financial']),
  amount: z.number().min(0).optional(),
  message: z.string().optional(),
  idempotency_key: z.string().optional(),
});

export const RetentionGenerateDailyBriefingInput = z.object({
  zone_id: ZoneIdSchema.optional(),
});

export const RetentionEvaluateInterventionInput = z.object({
  driver_id: DriverIdSchema,
  intervention_type: z.string(),
});

export const RetentionCompareInterventionsInput = z.object({
  driver_id: DriverIdSchema.optional(),
  segment_filter: z.string().optional(),
});

export const RetentionEstimateInterventionUpliftInput = z.object({
  driver_id: DriverIdSchema.optional(),
  segment_filter: z.string().optional(),
});

// --- Intelligence ---

export const IntelligenceSimulateCounterfactualInput = z.object({
  scenario_type: z.enum([
    'matching_weights_change',
    'long_pickup_reduction',
    'retention_intervention',
    'driver_selection_change',
    'road_closure',
    'demand_surge',
  ]),
  zone_id: ZoneIdSchema.optional(),
  parameters: z.record(z.string(), z.any()).default({}),
  seed: z.number().int().optional(),
});

export const IntelligenceExplainDecisionInput = z.object({
  decision_id: z.string().min(1),
});

export const IntelligenceGetDecisionTraceInput = z.object({
  decision_id: z.string().min(1),
});

export const IntelligenceCompareDecisionsInput = z.object({
  decision_ids: z.array(z.string()).min(2),
});

export const IntelligenceGenerateDecisionReceiptInput = z.object({
  decision_id: z.string().min(1),
});

export const IntelligenceGenerateOperationsBriefingInput = z.object({
  date: z.string().optional(), // YYYY-MM-DD
});

export const IntelligenceExplainOperationalChangeInput = z.object({
  metric: z.string().min(1),
  comparison_window: z.string().default('7d'),
});

export const IntelligenceDiagnoseBottleneckInput = z.object({
  zone_id: ZoneIdSchema.optional(),
  metric: z.string().min(1),
});

// --- Fairness ---

export const FairnessDetectImbalanceInput = z.object({
  zone_id: ZoneIdSchema.optional(),
});

export const FairnessGenerateRecommendationsInput = z.object({
  zone_id: ZoneIdSchema,
});

export const FairnessCompareZoneDistributionInput = z.object({
  zone_ids: z.array(ZoneIdSchema).min(2),
});

export const FairnessGetOpportunityLedgerInput = z.object({
  driver_id: DriverIdSchema.optional(),
  zone_id: ZoneIdSchema.optional(),
  window_start: z.string().optional(),
  window_end: z.string().optional(),
});

export const FairnessDetectOpportunityExclusionInput = z.object({
  zone_id: ZoneIdSchema.optional(),
});

export const FairnessExplainDriverDistributionInput = z.object({
  driver_id: DriverIdSchema,
});

// --- Simulation ---

export const SimulationRunMobilityScenarioInput = z.object({
  name: z.string().min(1),
  scenario_type: z.enum([
    'demand_surge',
    'road_closure',
    'driver_reduction',
    'long_pickup_assignments',
    'opportunity_concentration',
    'declining_engagement',
    'traffic_disruption',
    'combined_disruptions',
  ]),
  zone_id: ZoneIdSchema.optional(),
  seed: z.number().int().optional(),
  horizon_minutes: z.number().int().min(1).max(1440).optional(),
});

export const SimulationCompareRunsInput = z.object({
  run_ids: z.array(z.string()).min(2),
});

export const SimulationGetRunInput = z.object({
  run_id: z.string().min(1),
});

export const SimulationReplayEventsInput = z.object({
  run_id: z.string().min(1),
});

// --- Model Governance ---

export const ModelRunShadowEvaluationInput = z.object({
  model_id: z.string().min(1),
  model_version: z.string().min(1),
  evaluation_window: z.string().default('7d'),
});

export const ModelGetPerformanceReportInput = z.object({
  model_id: z.string().min(1),
});

export const ModelDetectDriftInput = z.object({
  model_id: z.string().min(1),
});

// Tool input registry
export const TOOL_INPUT_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'driver_predict_cancellation_risk': DriverPredictCancellationRiskInput,
  'driver_get_reliability': DriverGetReliabilityInput,
  'driver_get_cancellation_explanation': DriverGetCancellationExplanationInput,
  'driver_simulate_assignment': DriverSimulateAssignmentInput,
  'driver_recommend_assignment': DriverRecommendAssignmentInput,
  'driver_reassign_trip': DriverReassignTripInput,
  'driver_get_assignment_explanation': DriverGetAssignmentExplanationInput,
  'driver_submit_data_correction': DriverSubmitDataCorrectionInput,
  'safety_evaluate_pre_trip_risk': SafetyEvaluatePreTripRiskInput,
  'safety_get_live_deviation': SafetyGetLiveDeviationInput,
  'safety_evaluate_deviation': SafetyEvaluateDeviationInput,
  'safety_get_incident_context': SafetyGetIncidentContextInput,
  'safety_trigger_emergency_protocol': SafetyTriggerEmergencyProtocolInput,
  'safety_escalate_incident': SafetyEscalateIncidentInput,
  'safety_get_incident_status': SafetyGetIncidentStatusInput,
  'matching_calculate_score': MatchingCalculateScoreInput,
  'matching_simulate_distribution': MatchingSimulateDistributionInput,
  'matching_get_zone_metrics': MatchingGetZoneMetricsInput,
  'matching_compare_configurations': MatchingCompareConfigurationsInput,
  'matching_recommend_weights': MatchingRecommendWeightsInput,
  'matching_update_production_weights': MatchingUpdateProductionWeightsInput,
  'retention_query_churn_risk': RetentionQueryChurnRiskInput,
  'retention_get_driver_feedback': RetentionGetDriverFeedbackInput,
  'retention_analyze_churn_factors': RetentionAnalyzeChurnFactorsInput,
  'retention_recommend_intervention': RetentionRecommendInterventionInput,
  'retention_simulate_incentive': RetentionSimulateIncentiveInput,
  'retention_send_incentive': RetentionSendIncentiveInput,
  'retention_generate_daily_briefing': RetentionGenerateDailyBriefingInput,
  'retention_evaluate_intervention': RetentionEvaluateInterventionInput,
  'retention_compare_interventions': RetentionCompareInterventionsInput,
  'retention_estimate_intervention_uplift': RetentionEstimateInterventionUpliftInput,
  'intelligence_simulate_counterfactual': IntelligenceSimulateCounterfactualInput,
  'intelligence_explain_decision': IntelligenceExplainDecisionInput,
  'intelligence_get_decision_trace': IntelligenceGetDecisionTraceInput,
  'intelligence_compare_decisions': IntelligenceCompareDecisionsInput,
  'intelligence_generate_decision_receipt': IntelligenceGenerateDecisionReceiptInput,
  'intelligence_generate_operations_briefing': IntelligenceGenerateOperationsBriefingInput,
  'intelligence_explain_operational_change': IntelligenceExplainOperationalChangeInput,
  'intelligence_diagnose_marketplace_bottleneck': IntelligenceDiagnoseBottleneckInput,
  'fairness_detect_imbalance': FairnessDetectImbalanceInput,
  'fairness_generate_recommendations': FairnessGenerateRecommendationsInput,
  'fairness_compare_zone_distribution': FairnessCompareZoneDistributionInput,
  'fairness_get_opportunity_ledger': FairnessGetOpportunityLedgerInput,
  'fairness_detect_opportunity_exclusion': FairnessDetectOpportunityExclusionInput,
  'fairness_explain_driver_distribution': FairnessExplainDriverDistributionInput,
  'model_run_shadow_evaluation': ModelRunShadowEvaluationInput,
  'model_get_performance_report': ModelGetPerformanceReportInput,
  'model_detect_drift': ModelDetectDriftInput,
  'simulation_run_mobility_scenario': SimulationRunMobilityScenarioInput,
  'simulation_compare_runs': SimulationCompareRunsInput,
  'simulation_get_run': SimulationGetRunInput,
  'simulation_replay_events': SimulationReplayEventsInput,
};

export function validateToolInput(toolName: string, input: unknown): unknown {
  const schema = TOOL_INPUT_SCHEMAS[toolName];
  if (!schema) {
    throw new Error(`No input schema found for tool: ${toolName}`);
  }
  return schema.parse(input);
}
