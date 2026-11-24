import { describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { RideIQRegistry } from '../../src/core/mcp-registry.js';
import { registerDriverReliabilityModule } from '../../src/modules/driver-reliability/index.js';
import { registerRiderSafetyModule } from '../../src/modules/rider-safety/index.js';
import { registerMarketplaceMatchingModule } from '../../src/modules/marketplace-matching/index.js';
import { registerDriverRetentionModule } from '../../src/modules/driver-retention/index.js';
import { registerIntelligenceModule } from '../../src/intelligence/index.js';
import { registerDigitalTwinModule } from '../../src/intelligence/digital-twin/index.js';

describe('RideIQ MCP registry', () => {
  it('initializes and discovers all registered modules through MCP', async () => {
    const registry = new RideIQRegistry({ userId: 'test', roles: ['ADMIN'], scopes: ['*'] });
    registerDriverReliabilityModule(registry);
    registerRiderSafetyModule(registry);
    registerMarketplaceMatchingModule(registry);
    registerDriverRetentionModule(registry);
    registerIntelligenceModule(registry);
    registerDigitalTwinModule(registry);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'rideiq-test-client', version: '1.0.0' });
    await registry.protocol.connect(serverTransport);
    await client.connect(clientTransport);

    const [tools, resources, templates, prompts] = await Promise.all([
      client.listTools(), client.listResources(), client.listResourceTemplates(), client.listPrompts(),
    ]);

    expect(tools.tools.length).toBeGreaterThanOrEqual(40);
    expect(tools.tools.map((tool) => tool.name)).toContain('driver_predict_cancellation_risk');
    expect(tools.tools.map((tool) => tool.name)).toContain('safety_evaluate_deviation');
    expect(tools.tools.map((tool) => tool.name)).toContain('matching_simulate_distribution');
    expect(tools.tools.map((tool) => tool.name)).toContain('retention_query_churn_risk');
    expect(resources.resources.map((resource) => resource.uri)).toContain('ride://queue/active');
    expect(templates.resourceTemplates.map((resource) => resource.uriTemplate)).toContain('driver://{driver_id}/reliability');
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain('driver_audit_high_risk_matches');

    await client.close();
    await registry.protocol.close();
  });

  it('invokes a registered tool and preserves structured output', async () => {
    const registry = new RideIQRegistry();
    registry.registerTool({ name: 'test_echo', description: 'Echo test arguments', inputSchema: { type: 'object' } }, async (args) => ({ echoed: args.value }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'rideiq-test-client', version: '1.0.0' });
    await registry.protocol.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: 'test_echo', arguments: { value: 'ok' } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ echoed: 'ok' });
    await client.close();
    await registry.protocol.close();
  });
});
