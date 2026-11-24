# Data dictionary

All records use opaque string identifiers. Prisma generates IDs for newly created records; stable external identifiers are separate unique fields where needed.

| Area | Main records | Purpose |
|---|---|---|
| Marketplace | `Driver`, `Rider`, `Zone`, `Trip`, `TripEvent` | Shared trip assignment context and lifecycle events |
| Reliability | `DriverMetrics`, `ReliabilityAssessment` | Segmented completion evidence and assignment estimates |
| Safety | `SafetyIncident`, `RouteObservation` | Contextual route deviation and review workflow |
| Matching | `MatchingConfiguration`, `MatchingScore`, `ZoneMetrics` | Versioned weights, component scores, and zone indicators |
| Fairness | `OpportunityLedgerEntry` | Opportunities divided by eligible online exposure |
| Retention | `DriverFeedback`, `ChurnAssessment`, `InterventionProposal` | Authorized feedback, disengagement indicators, and approved interventions |
| Governance | `ApprovalRequest`, `AuditLog`, `DataCorrectionRequest`, `DecisionTrace` | Approval, audit, correction review, and provenance |
| Simulation | `SimulationRun`, `SimulationEvent` | Shared-seed results and ordered synthetic timeline |
| Events | `OperationalEvent`, `EventOutbox` | Cross-domain event and pending action records |

The schema marks demonstration records as synthetic where relevant. Do not mix synthetic rows into operational model evaluation or marketplace reporting. Precise location retention and privacy controls require deployment-specific policy before using real route telemetry.
