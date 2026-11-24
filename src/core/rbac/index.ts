// RideIQ Authorization / RBAC Engine
// Defines roles, permissions, and a permission matrix for every tool and resource.

export type Role =
  | 'DISPATCH_AGENT'
  | 'SAFETY_ANALYST'
  | 'MARKETPLACE_ANALYST'
  | 'FLEET_MANAGER'
  | 'ADMIN'
  | 'AUTOMATED_SERVICE';

export type Permission =
  | 'driver:read'
  | 'driver:predict'
  | 'driver:reassign'
  | 'driver:correct'
  | 'safety:read'
  | 'safety:evaluate'
  | 'safety:emergency'
  | 'safety:escalate'
  | 'matching:read'
  | 'matching:simulate'
  | 'matching:update'
  | 'retention:read'
  | 'retention:recommend'
  | 'retention:send'
  | 'intelligence:read'
  | 'intelligence:simulate'
  | 'intelligence:briefing'
  | 'admin:all';

// Role → Permissions matrix
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  DISPATCH_AGENT: [
    'driver:read', 'driver:predict', 'driver:reassign', 'driver:correct',
    'safety:read', 'safety:evaluate',
    'matching:read', 'matching:simulate',
    'retention:read', 'retention:recommend',
    'intelligence:read', 'intelligence:briefing',
  ],
  SAFETY_ANALYST: [
    'driver:read', 'safety:read', 'safety:evaluate', 'safety:emergency', 'safety:escalate',
    'matching:read',
    'retention:read',
    'intelligence:read', 'intelligence:briefing',
  ],
  MARKETPLACE_ANALYST: [
    'driver:read',
    'safety:read',
    'matching:read', 'matching:simulate', 'matching:update',
    'retention:read',
    'intelligence:read', 'intelligence:briefing',
  ],
  FLEET_MANAGER: [
    'driver:read', 'driver:predict', 'driver:reassign', 'driver:correct',
    'safety:read', 'safety:evaluate', 'safety:emergency',
    'matching:read', 'matching:simulate', 'matching:update',
    'retention:read', 'retention:recommend', 'retention:send',
    'intelligence:read', 'intelligence:simulate', 'intelligence:briefing',
  ],
  ADMIN: ['admin:all'],
  AUTOMATED_SERVICE: [
    'driver:read', 'driver:predict',
    'safety:read', 'safety:evaluate',
    'matching:read', 'matching:simulate',
    'retention:read', 'retention:recommend',
    'intelligence:read', 'intelligence:simulate', 'intelligence:briefing',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === 'ADMIN') return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

// Tool → required permission mapping
export const TOOL_PERMISSIONS: Record<string, Permission> = {
  // Driver Reliability
  driver_predict_cancellation_risk: 'driver:predict',
  driver_get_reliability: 'driver:read',
  driver_get_cancellation_explanation: 'driver:read',
  driver_simulate_assignment: 'driver:read',
  driver_recommend_assignment: 'driver:read',
  driver_reassign_trip: 'driver:reassign',
  driver_get_assignment_explanation: 'driver:read',
  driver_submit_data_correction: 'driver:correct',

  // Safety
  safety_evaluate_pre_trip_risk: 'safety:read',
  safety_get_live_deviation: 'safety:read',
  safety_evaluate_deviation: 'safety:read',
  safety_get_incident_context: 'safety:read',
  safety_trigger_emergency_protocol: 'safety:emergency',
  safety_escalate_incident: 'safety:escalate',
  safety_get_incident_status: 'safety:read',

  // Matching
  matching_calculate_score: 'matching:read',
  matching_simulate_distribution: 'matching:simulate',
  matching_get_zone_metrics: 'matching:read',
  matching_compare_configurations: 'matching:read',
  matching_recommend_weights: 'matching:read',
  matching_update_production_weights: 'matching:update',

  // Retention
  retention_query_churn_risk: 'retention:read',
  retention_get_driver_feedback: 'retention:read',
  retention_analyze_churn_factors: 'retention:read',
  retention_recommend_intervention: 'retention:recommend',
  retention_simulate_incentive: 'retention:recommend',
  retention_send_incentive: 'retention:send',
  retention_generate_daily_briefing: 'retention:read',
  retention_evaluate_intervention: 'retention:read',
  retention_compare_interventions: 'retention:read',
  retention_estimate_intervention_uplift: 'retention:read',

  // Intelligence
  intelligence_simulate_counterfactual: 'intelligence:simulate',
  intelligence_explain_decision: 'intelligence:read',
  intelligence_get_decision_trace: 'intelligence:read',
  intelligence_compare_decisions: 'intelligence:read',
  intelligence_generate_decision_receipt: 'intelligence:read',
  intelligence_generate_operations_briefing: 'intelligence:briefing',
  intelligence_explain_operational_change: 'intelligence:read',
  intelligence_diagnose_marketplace_bottleneck: 'intelligence:read',
  model_run_shadow_evaluation: 'intelligence:read',
  model_get_performance_report: 'intelligence:read',
  model_detect_drift: 'intelligence:read',

  // Fairness
  fairness_detect_imbalance: 'intelligence:read',
  fairness_generate_recommendations: 'intelligence:read',
  fairness_compare_zone_distribution: 'intelligence:read',
  fairness_get_opportunity_ledger: 'intelligence:read',
  fairness_detect_opportunity_exclusion: 'intelligence:read',
  fairness_explain_driver_distribution: 'intelligence:read',

  // Simulation
  simulation_run_mobility_scenario: 'intelligence:simulate',
  simulation_compare_runs: 'intelligence:read',
  simulation_get_run: 'intelligence:read',
  simulation_replay_events: 'intelligence:read',
};

// Resource → required permission mapping
export const RESOURCE_PERMISSIONS: Record<string, Permission> = {
  'ride://queue/active': 'driver:read',
  'driver://{driver_id}/metrics': 'driver:read',
  'driver://{driver_id}/reliability': 'driver:read',
  'driver://{driver_id}/recent-trips': 'driver:read',
  'safety://trips/{trip_id}/route': 'safety:read',
  'safety://drivers/{driver_id}/incident-history': 'safety:read',
  'safety://incidents/active': 'safety:read',
  'safety://policies/current': 'safety:read',
  'matching://config/current': 'matching:read',
  'matching://zones/{zone_id}/metrics': 'matching:read',
  'matching://zones/{zone_id}/distribution': 'matching:read',
  'matching://policies/fairness': 'matching:read',
  'retention://dashboard/overview': 'retention:read',
  'retention://drivers/{driver_id}/profile': 'retention:read',
  'retention://drivers/{driver_id}/feedback': 'retention:read',
  'retention://segments/churn-risk': 'retention:read',
  'intelligence://events/recent': 'intelligence:read',
  'intelligence://decisions/{decision_id}': 'intelligence:read',
  'simulation://runs/{run_id}': 'intelligence:read',
};

export function checkToolPermission(role: Role, toolName: string): void {
  const required = TOOL_PERMISSIONS[toolName];
  if (required && !hasPermission(role, required)) {
    throw new Error(`PERMISSION_DENIED: Role "${role}" lacks permission "${required}" for tool "${toolName}"`);
  }
}

export function checkResourcePermission(role: Role, resourceUri: string): void {
  let required = RESOURCE_PERMISSIONS[resourceUri];
  if (!required) {
    for (const [template, permission] of Object.entries(RESOURCE_PERMISSIONS)) {
      const templateParts = template.split('/');
      const resourceParts = resourceUri.split('/');
      const matches = templateParts.length === resourceParts.length && templateParts.every((part, index) =>
        part.startsWith('{') && part.endsWith('}') ? resourceParts[index].length > 0 : part === resourceParts[index],
      );
      if (matches) {
        required = permission;
        break;
      }
    }
  }
  if (required && !hasPermission(role, required)) {
    throw new Error(`PERMISSION_DENIED: Role "${role}" lacks permission "${required}" for resource "${resourceUri}"`);
  }
}
