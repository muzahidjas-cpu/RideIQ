// RideIQ Shared Types

export type DecisionEvidenceType =
  | 'OBSERVED'
  | 'CALCULATED'
  | 'PREDICTED'
  | 'SIMULATED'
  | 'INFERRED';

export interface EvidenceReference {
  type: DecisionEvidenceType;
  source: string; // URI or entity reference
  timestamp: string;
  dataQuality: 'high' | 'medium' | 'low' | 'insufficient';
  synthetic: boolean;
}

export interface DecisionTraceInput {
  decisionId: string;
  category: string;
  sourceModule: string;
  entityRef: string; // pseudonymous
  dataSources: EvidenceReference[];
  dataFreshness: string;
  dataQuality: Record<string, unknown>;
  modelVersion?: string;
  policyVersion?: string;
  configVersion?: string;
  observedSignals: Record<string, unknown>;
  calculatedMetrics: Record<string, unknown>;
  predictedSignals: Record<string, unknown>;
  simulatedOutputs: Record<string, unknown>;
  contributingFactors: Array<{
    factor: string;
    contribution: number; // -1 to 1
    evidenceType: DecisionEvidenceType;
  }>;
  uncertainty: Record<string, unknown>;
  alternativeExplanations: string[];
  recommendation: Record<string, unknown>;
  requiredRole?: string;
  approvalState: 'none' | 'pending' | 'approved' | 'rejected';
}

export interface SimulationResult {
  runId: string;
  seed: number;
  horizonMinutes: number;
  baseline: Record<string, unknown>;
  proposed: Record<string, unknown>;
  impact: Record<string, unknown>;
  financialImplications: Record<string, unknown>;
  fairnessImplications: Record<string, unknown>;
  uncertainty: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  synthetic: boolean;
}

export interface ModuleResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    field?: string;
    recoveryHint?: string;
    retryable: boolean;
  };
  correlationId: string;
  timestamp: string;
}

export interface AuthContext {
  userId: string;
  roles: string[];
  scopes: string[];
}

export interface ToolExecutionContext {
  auth: AuthContext;
  correlationId: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: 'healthy' | 'unhealthy'; detail?: string }>;
  timestamp: string;
}
