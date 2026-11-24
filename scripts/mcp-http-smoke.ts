import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { getConfig } from '../src/core/config/index.js';
import { generateToken } from '../src/core/auth/index.js';

const config = getConfig();
const token = generateToken({ sub: 'rideiq-http-smoke', roles: ['ADMIN'], scopes: ['rideiq:*'] });
const endpoint = new URL(`http://127.0.0.1:${config.PORT}/mcp`);
const unauthenticatedClient = new Client({ name: 'rideiq-unauthenticated-smoke', version: '1.0.0' });
const unauthenticatedTransport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: 'Bearer invalid' } },
});
let unauthorizedRejected = false;
try {
  await unauthenticatedClient.connect(unauthenticatedTransport);
} catch {
  unauthorizedRejected = true;
} finally {
  await unauthenticatedClient.close().catch(() => undefined);
}
if (!unauthorizedRejected) throw new Error('HTTP accepted a missing/invalid bearer token');

const client = new Client({ name: 'rideiq-http-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

try {
  await client.connect(transport);
  const [tools, resources, templates, prompts, prompt] = await Promise.all([
    client.listTools(),
    client.listResources(),
    client.listResourceTemplates(),
    client.listPrompts(),
    client.getPrompt({ name: 'driver_audit_high_risk_matches' }),
  ]);
  console.log(JSON.stringify({ discoveredTools: tools.tools.length, discoveredResources: resources.resources.length + templates.resourceTemplates.length, discoveredPrompts: prompts.prompts.length, promptMessages: prompt.messages.length }));
  if (tools.tools.length !== 53 || prompts.prompts.length !== 8 || prompt.messages.length === 0) {
    throw new Error('Unexpected MCP discovery result');
  }
  console.log(JSON.stringify({
    initialized: true,
    tools: tools.tools.length,
    resources: resources.resources.length + templates.resourceTemplates.length,
    prompts: prompts.prompts.length,
    promptRetrieved: prompt.messages.length > 0,
    invalidBearerRejected: unauthorizedRejected,
  }));
} finally {
  await client.close();
}
