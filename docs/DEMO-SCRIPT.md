# RideIQ Hackathon Demo

## Setup

Install dependencies and run the checks:

```powershell
npm ci
npm run build
npm test
```

The signature simulation does not require PostgreSQL. Database-backed tools and the synthetic database seed do require a running PostgreSQL instance.

## 5-minute walkthrough

1. Explain the product: one MCP server shares trip context and governance across reliability, safety, fairness, and retention while preserving separate domain assessments.
2. Run `npm run demo:stress`. The same seed and zone are used for a baseline and combined disruption scenario.
3. Show the shared synthetic inventory and timeline. Point out that the report labels evidence as calculated or simulated and prints **SIMULATED RESULT — NOT A REAL-WORLD PERFORMANCE CLAIM.**
4. Compare cancellation rate and pickup ETA to show reliability pressure, without treating marketplace outcomes as proof of an individual driver's intent.
5. Show route deviation observations alongside road-closure context. The demo records contextual reroutes and does not label them dangerous or escalate an incident.
6. Show opportunity concentration and declining engagement from the same simulated assignments. No incentive or dispatch action is issued.
7. Close by noting which changes would need human review and a configured integration before production use.

## Reproducibility

```powershell
$env:RIDEIQ_DEMO_SEED = '42'
$env:RIDEIQ_DEMO_HORIZON_MINUTES = '240'
npm run demo:stress
```

The report uses synthetic assumptions and a deterministic digital-twin version. Seed and horizon changes alter the simulated output; they do not produce validated real-world forecasts.
