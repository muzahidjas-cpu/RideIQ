import { describe, expect, it } from 'vitest';
import { checkResourcePermission, checkToolPermission, type Role } from '../../src/core/rbac/index.js';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { RideIQRegistry } from '../../src/core/mcp-registry.js';

describe('server-side authorization policy', () => {
  it('allows a dispatcher to read reliability evidence', () => {
    expect(() => checkToolPermission('DISPATCH_AGENT', 'driver_get_reliability')).not.toThrow();
  });

  it('blocks automated callers from sensitive changes', () => {
    expect(() => checkToolPermission('AUTOMATED_SERVICE', 'driver_reassign_trip')).toThrow(/PERMISSION_DENIED/);
    expect(() => checkToolPermission('AUTOMATED_SERVICE', 'retention_send_incentive')).toThrow(/PERMISSION_DENIED/);
    expect(() => checkToolPermission('AUTOMATED_SERVICE', 'safety_escalate_incident')).toThrow(/PERMISSION_DENIED/);
  });

  it('enforces access on parameterized resources', () => {
    expect(() => checkResourcePermission('AUTOMATED_SERVICE', 'driver://driver-1/reliability')).not.toThrow();
    expect(() => checkResourcePermission('UNPRIVILEGED' as Role, 'safety://drivers/driver-1/incident-history')).toThrow(/PERMISSION_DENIED/);
  });

  it('rejects HTTP tool calls missing their required OAuth-style scope', async () => {
    const registry = new RideIQRegistry({ userId: 'test', roles: ['ADMIN'], scopes: [] });
    registry.registerTool({ name: 'driver_get_reliability', description: 'Test scope enforcement', inputSchema: { type: 'object' } }, async () => ({ ok: true }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'scope-test', version: '1.0.0' });
    await registry.protocol.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: 'driver_get_reliability', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content?.[0]).toMatchObject({ type: 'text' });
    await client.close();
    await registry.protocol.close();
  });
});
