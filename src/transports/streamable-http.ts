// RideIQ — Streamable HTTP Transport Entry Point
// For remote MCP deployments.
// Stateless request model per the current MCP SDK.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getConfig } from '../core/config/index.js';
import { logger, childLogger } from '../core/logging/index.js';
import { disconnectDb } from '../core/database/index.js';
import { localhostHostValidation, NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { RideIQRegistry } from '../core/mcp-registry.js';
import { requireAuth } from '../core/auth/index.js';

const log = childLogger({ component: 'http-transport' });

import { registerDriverReliabilityModule } from '../modules/driver-reliability/index.js';
import { registerRiderSafetyModule } from '../modules/rider-safety/index.js';
import { registerMarketplaceMatchingModule } from '../modules/marketplace-matching/index.js';
import { registerDriverRetentionModule } from '../modules/driver-retention/index.js';
import { registerIntelligenceModule } from '../intelligence/index.js';
import { registerDigitalTwinModule } from '../intelligence/digital-twin/index.js';

const app = express();
const config = getConfig();

app.use(helmet());
const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json({ limit: '1mb' }));
const validateHost = localhostHostValidation();
app.use((req, res, next) => {
  if (!validateHost(req, res)) return;
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'rideiq-mcp', transport: 'streamable-http' });
});

app.post('/mcp', async (req, res) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: 'forbidden_origin_or_host' });
    return;
  }
  try {
    const auth = requireAuth(req.get('authorization'));
    const registry = new RideIQRegistry({ userId: auth.sub, roles: auth.roles, scopes: auth.scopes });
    registerDriverReliabilityModule(registry);
    registerRiderSafetyModule(registry);
    registerMarketplaceMatchingModule(registry);
    registerDriverRetentionModule(registry);
    registerIntelligenceModule(registry);
    registerDigitalTwinModule(registry);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await registry.protocol.connect(transport);
    await transport.handleRequest(req, res, req.body);
    await registry.protocol.close();
  } catch (err) {
    logger.error({ err }, 'MCP HTTP request failed');
    res.status(401).json({ error: 'unauthorized', message: 'A valid RideIQ bearer token is required' });
  }
});

const server = app.listen(config.PORT, '127.0.0.1', () => {
  log.info({ port: config.PORT }, `RideIQ MCP Streamable HTTP server listening on port ${config.PORT}`);
});

process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down');
  server.close();
  await disconnectDb();
  process.exit(0);
});
process.on('SIGINT', async () => {
  log.info('SIGINT received, shutting down');
  server.close();
  await disconnectDb();
  process.exit(0);
});
