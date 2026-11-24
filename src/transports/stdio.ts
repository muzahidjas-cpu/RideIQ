// RideIQ — STDIO Transport Entry Point
// For local MCP clients (Claude Desktop, Cursor, VS Code).
// stdout is reserved for MCP protocol messages; logs go to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { getConfig } from '../core/config/index.js';
import { logger, childLogger } from '../core/logging/index.js';
import { disconnectDb } from '../core/database/index.js';
import { RideIQRegistry } from '../core/mcp-registry.js';

const log = childLogger({ component: 'stdio-transport' });

import { registerDriverReliabilityModule } from '../modules/driver-reliability/index.js';
import { registerRiderSafetyModule } from '../modules/rider-safety/index.js';
import { registerMarketplaceMatchingModule } from '../modules/marketplace-matching/index.js';
import { registerDriverRetentionModule } from '../modules/driver-retention/index.js';
import { registerIntelligenceModule } from '../intelligence/index.js';
import { registerDigitalTwinModule } from '../intelligence/digital-twin/index.js';

async function main(): Promise<void> {
  const config = getConfig();
  log.info({ transport: 'stdio' }, 'Starting RideIQ MCP server (STDIO)');

  const server = new RideIQRegistry();

  // Register all modules
  registerDriverReliabilityModule(server);
  registerRiderSafetyModule(server);
  registerMarketplaceMatchingModule(server);
  registerDriverRetentionModule(server);
  registerIntelligenceModule(server);
  registerDigitalTwinModule(server);

  log.info('All RideIQ modules registered');

  const transport = new StdioServerTransport();
  await server.protocol.connect(transport);
  log.info('STDIO transport connected');

  process.on('SIGTERM', async () => {
    log.info('SIGTERM received, shutting down');
    await disconnectDb();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    log.info('SIGINT received, shutting down');
    await disconnectDb();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error starting RideIQ STDIO server');
  process.exit(1);
});
