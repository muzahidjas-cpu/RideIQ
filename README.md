# RideIQ

RideIQ is one MCP server for four ride-hailing operations domains: assignment reliability, contextual safety review, fair matching, and driver retention. The code shares an audit and authorization core while keeping domain assessments separate.

## Current implementation

**IMPLEMENTED** — TypeScript MCP server with STDIO and Streamable HTTP entry points; domain tool/resource/prompt registries; JWT verification and role checks on HTTP calls; deterministic synthetic marketplace simulator and end-to-end Marketplace Stress Test; PostgreSQL schema; audit, approval, and idempotency services; transparent rule-based baselines; MCP discovery and invocation tests.

**PROPOSED** — Production traffic/maps, dispatch, CRM, notification, and safety-service integrations. No external action is enabled by the demo implementation.

**PLANNED EXTENSION** — Trained and evaluated models, causal intervention uplift, production-ready multi-party approval console, and integration of the synthetic stress run with persisted production-like scenario history.

Synthetic output and rule-based baseline estimates are not real-world performance claims. The simulator does not mutate operational trip state.

## Requirements and setup

- Node.js 20.19 or newer
- PostgreSQL 15 or newer
- npm

```powershell
Copy-Item .env.example .env
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
npm test
```

Set `DATABASE_URL`, `JWT_SECRET`, and `ENCRYPTION_KEY` in `.env` before running outside a local demo. Replace the example secrets with generated values. Prisma migrations are required to create the database schema.

### Start with STDIO

```powershell
npm run start:stdio
```

STDIO is for a client that launches RideIQ as a child process. Protocol messages use stdout; logs use stderr.

### Start with Streamable HTTP

```powershell
$env:MCP_TRANSPORT = 'streamable-http'
npm run start:http
```

The server binds to `127.0.0.1` by default. HTTP requests require a Bearer JWT signed with `JWT_SECRET`, issuer `rideiq`, and audience `rideiq-mcp`. The token must include a `sub`, `roles`, and `scopes`. Calls require a matching `rideiq:read`, `rideiq:compute`, or `rideiq:write` scope (or a narrower domain scope such as `rideiq:driver:read`). Use `generateToken` from `src/core/auth/index.ts` in a trusted local bootstrap flow. Never expose the development signing key.

## Verification

Run `npm run build` and `npm test`. The MCP tests use the official TypeScript SDK's in-memory client/server transport to verify initialization, discovery, and tool invocation. They do not claim MCP Inspector or third-party desktop-client compatibility. See [verification report](docs/VERIFICATION.md), [MCP Inspector checklist](docs/MCP-INSPECTOR.md), and [client notes](docs/CLIENTS.md).

Run the end-to-end synthetic marketplace demo with `npm run demo:stress`. It compares a baseline and combined disruption scenario across reliability, safety context, opportunity concentration, and engagement using the same seed and shared simulated marketplace. It does not call operational integrations or need PostgreSQL.

## Architecture

See [ADR](docs/ADR.md), [security and permissions](docs/SECURITY.md), and [data dictionary](docs/DATA-DICTIONARY.md). RideIQ uses the official TypeScript SDK v2 package split and current MCP spec support. A single low-level registry translates domain declarations into MCP tools, resources, resource templates, and prompts.

The registered surface is listed in the [MCP reference](docs/MCP-REFERENCE.md). For a guided demonstration, see [demo script](docs/DEMO-SCRIPT.md).
