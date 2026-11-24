# Security and permission boundaries

Every tool and resource handler checks its domain permission in the server process. HTTP additionally requires a valid JWT with issuer `rideiq` and audience `rideiq-mcp`. The token roles drive domain authorization. STDIO trusts the local MCP host and uses the restricted `AUTOMATED_SERVICE` role by default.

| Role | Main access |
|---|---|
| `DISPATCH_AGENT` | Driver reliability and assignment review; no financial or safety escalation actions |
| `SAFETY_ANALYST` | Contextual safety review and authorized safety escalation |
| `MARKETPLACE_ANALYST` | Matching metrics and simulations; production changes remain approval-gated |
| `FLEET_MANAGER` | Retention and cross-domain management operations, subject to approvals |
| `AUTOMATED_SERVICE` | Read and compute operations for configured automation |
| `ADMIN` | Administrative permissions; still subject to idempotency and audit paths |

Safety, reliability, matching, and retention use separate outputs and permissions. Safety data is not used to generate retention assessments. Model estimates cannot alone trigger a penalty, reassignment, safety escalation, or financial offer. Data correction creates a review request and does not rewrite trip records.

The HTTP server rejects non-local `Host` values and origins outside `ALLOWED_ORIGINS`; it binds to loopback. Deploying remotely requires TLS and a reviewed host/origin policy, plus a token issuer with appropriate scopes and audience. Do not use sample secrets from `.env.example` outside a local demo.

Audit logging is best-effort in the current implementation. A production deployment must make audit persistence failure fail closed for sensitive writes before connecting real action integrations.
