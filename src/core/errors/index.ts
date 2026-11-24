// RideIQ Structured Error Handler
// Application error class with MCP-compatible error payloads.

export const ErrorCategory = {
  VALIDATION_ERROR: 'VALIDATION_ERROR', AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED', RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE', INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  STALE_DATA: 'STALE_DATA', RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED', IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  EXTERNAL_SERVICE_FAILURE: 'EXTERNAL_SERVICE_FAILURE', SIMULATION_TIMEOUT: 'SIMULATION_TIMEOUT',
  POLICY_CONSTRAINT_VIOLATION: 'POLICY_CONSTRAINT_VIOLATION',
} as const;
export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

export interface RideIQErrorOptions {
  category: ErrorCategory;
  message: string;
  field?: string;
  recoveryHint?: string;
  retryable?: boolean;
  correlationId?: string;
  statusCode?: number;
  cause?: Error;
}

export class RideIQError extends Error {
  public readonly category: ErrorCategory;
  public readonly field?: string;
  public readonly recoveryHint?: string;
  public readonly retryable: boolean;
  public readonly correlationId?: string;
  public readonly statusCode: number;
  public readonly cause?: Error;

  constructor(options: RideIQErrorOptions) {
    super(options.message);
    this.name = 'RideIQError';
    this.category = options.category;
    this.field = options.field;
    this.recoveryHint = options.recoveryHint;
    this.retryable = options.retryable ?? false;
    this.correlationId = options.correlationId;
    this.statusCode = options.statusCode ?? 500;
    this.cause = options.cause;
  }

  toMCPError() {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code: this.category,
              message: this.message,
              field: this.field,
              recovery_hint: this.recoveryHint,
              retryable: this.retryable,
              correlation_id: this.correlationId,
            },
          }),
        },
      ],
    };
  }
}

export function createError(
  category: ErrorCategory,
  message: string,
  opts?: Partial<RideIQErrorOptions>,
): RideIQError {
  return new RideIQError({ category, message, ...opts });
}

export function isRideIQError(err: unknown): err is RideIQError {
  return err instanceof RideIQError;
}
