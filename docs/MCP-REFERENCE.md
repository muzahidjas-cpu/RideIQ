# MCP Surface Reference

The official MCP `tools/list`, `resources/list`, `resources/templates/list`, and `prompts/list` responses are authoritative. This reference describes the registered names in the current implementation. Tool input schemas and descriptions are sent by the server at runtime.

## Tools

### Driver reliability

- `driver_predict_cancellation_risk`
- `driver_get_reliability`
- `driver_get_cancellation_explanation`
- `driver_simulate_assignment`
- `driver_recommend_assignment`
- `driver_reassign_trip` — state-changing; requires write authorization, idempotency, approval, and a configured adapter before any real action.
- `driver_get_assignment_explanation`
- `driver_submit_data_correction`

### Rider safety

- `safety_evaluate_pre_trip_risk`
- `safety_get_live_deviation`
- `safety_evaluate_deviation`
- `safety_get_incident_context`
- `safety_trigger_emergency_protocol` — state-changing; synthetic runs do not contact emergency services.
- `safety_escalate_incident` — state-changing; requires authorization and approval.
- `safety_get_incident_status`

### Fair marketplace and matching

- `matching_calculate_score`
- `matching_simulate_distribution`
- `matching_get_zone_metrics`
- `matching_compare_configurations`
- `matching_recommend_weights`
- `matching_update_production_weights` — proposal/update workflow; production changes require approval.
- `fairness_detect_imbalance`
- `fairness_generate_recommendations`
- `fairness_compare_zone_distribution`
- `fairness_get_opportunity_ledger`
- `fairness_detect_opportunity_exclusion`
- `fairness_explain_driver_distribution`

### Driver retention

- `retention_query_churn_risk`
- `retention_get_driver_feedback`
- `retention_analyze_churn_factors`
- `retention_recommend_intervention`
- `retention_simulate_incentive`
- `retention_send_incentive` — state-changing; requires approval and an explicitly configured delivery adapter.
- `retention_evaluate_intervention`
- `retention_compare_interventions`
- `retention_estimate_intervention_uplift` — heuristic/simulation only when causal evidence is unavailable.
- `retention_generate_daily_briefing`

### Unified intelligence, fairness, and model governance

- `intelligence_explain_decision`
- `intelligence_get_decision_trace`
- `intelligence_compare_decisions`
- `intelligence_generate_decision_receipt`
- `intelligence_simulate_counterfactual`
- `intelligence_generate_operations_briefing`
- `intelligence_explain_operational_change`
- `intelligence_diagnose_marketplace_bottleneck`
- `intelligence_get_recent_events`
- `model_run_shadow_evaluation`
- `model_get_performance_report`
- `model_detect_drift`

### Mobility Digital Twin

- `simulation_run_mobility_scenario`
- `simulation_compare_runs`
- `simulation_get_run`
- `simulation_replay_events`

## Resources

Fixed resources:

- `ride://queue/active`
- `safety://incidents/active`
- `safety://policies/current`
- `matching://config/current`
- `matching://policies/fairness`
- `retention://dashboard/overview`
- `retention://segments/churn-risk`
- `intelligence://events/recent`

Resource templates:

- `driver://{driver_id}/metrics`
- `driver://{driver_id}/reliability`
- `driver://{driver_id}/recent-trips`
- `safety://trips/{trip_id}/route`
- `safety://drivers/{driver_id}/incident-history`
- `matching://zones/{zone_id}/metrics`
- `matching://zones/{zone_id}/distribution`
- `retention://drivers/{driver_id}/profile`
- `retention://drivers/{driver_id}/feedback`
- `simulation://runs/{run_id}`
- `intelligence://decisions/{decision_id}`

Resources are read-only and authorization is checked server-side.

## Prompts

- `driver_audit_high_risk_matches`
- `safety_triage_route_deviation`
- `matching_optimize_zone_fairness`
- `retention_generate_daily_briefing`
- `intelligence_generate_operations_briefing`
- `intelligence_diagnose_marketplace_bottleneck`
- `intelligence_compare_marketplace_scenarios`
- `simulation_compare_marketplace_scenarios`

Prompts provide workflows; they do not execute state-changing actions by themselves.
