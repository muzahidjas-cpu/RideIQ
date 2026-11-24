import { Server } from '@modelcontextprotocol/server';
import { checkResourcePermission, checkToolPermission, RESOURCE_PERMISSIONS, TOOL_PERMISSIONS, type Role } from './rbac/index.js';

type Handler = (args: any, context: any) => Promise<any> | any;
type ResourceHandler = (uri: string, context: any) => Promise<any> | any;

const WRITE_TOOLS = new Set([
  'driver_reassign_trip', 'safety_trigger_emergency_protocol', 'safety_escalate_incident',
  'matching_update_production_weights', 'retention_send_incentive',
]);
const PROMPT_ACCESS_TOOL: Record<string, string> = {
  driver_audit_high_risk_matches: 'driver_get_reliability',
  safety_triage_route_deviation: 'safety_evaluate_deviation',
  matching_optimize_zone_fairness: 'matching_simulate_distribution',
  retention_generate_daily_briefing: 'retention_generate_daily_briefing',
  intelligence_generate_operations_briefing: 'intelligence_generate_operations_briefing',
  intelligence_diagnose_marketplace_bottleneck: 'intelligence_diagnose_marketplace_bottleneck',
  intelligence_compare_marketplace_scenarios: 'simulation_compare_runs',
  simulation_compare_marketplace_scenarios: 'simulation_compare_runs',
};

function requiredScope(name: string): string | undefined {
  const permission = TOOL_PERMISSIONS[name];
  if (!permission) return undefined;
  if (WRITE_TOOLS.has(name)) return 'write';
  if (permission.endsWith(':read')) return 'read';
  return 'compute';
}

function enforceToolAccess(name: string, auth: { roles: string[]; scopes: string[] }): void {
  const role = (auth.roles[0] ?? '') as Role;
  checkToolPermission(role, name);
  const scope = requiredScope(name);
  const domain = TOOL_PERMISSIONS[name]?.split(':')[0];
  if (scope && !auth.scopes.some((item) => item === 'rideiq:*' || item === `rideiq:${scope}` || item === `rideiq:${domain}:${scope}`)) {
    throw new Error(`SCOPE_REQUIRED: Missing rideiq:${scope} scope for ${name}`);
  }
}

function enforceResourceAccess(uri: string, auth: { roles: string[]; scopes: string[] }): void {
  checkResourcePermission((auth.roles[0] ?? '') as Role, uri);
  const entry = Object.entries(RESOURCE_PERMISSIONS).find(([template]) => {
    const templateParts = template.split('/');
    const uriParts = uri.split('/');
    return templateParts.length === uriParts.length && templateParts.every((part, index) =>
      part.startsWith('{') && part.endsWith('}') ? uriParts[index].length > 0 : part === uriParts[index],
    );
  });
  if (!entry) return;
  const domain = entry[1].split(':')[0];
  if (!auth.scopes.some((scope) => scope === 'rideiq:*' || scope === 'rideiq:read' || scope === `rideiq:${domain}:read`)) {
    throw new Error(`SCOPE_REQUIRED: Missing read scope for resource ${uri}`);
  }
}

/** Adapts domain declarations to the official low-level MCP server request handlers. */
export class RideIQRegistry {
  readonly protocol: Server;
  private readonly tools = new Map<string, { description: string; inputSchema: any; handler: Handler }>();
  private readonly resources = new Map<string, ResourceHandler>();
  private readonly prompts = new Map<string, Handler>();

  constructor(private readonly auth: { userId: string; roles: string[]; scopes: string[] } = {
    userId: 'local-operator', roles: ['AUTOMATED_SERVICE'], scopes: ['rideiq:*'],
  }) {
    this.protocol = new Server({ name: 'rideiq-mcp', version: '1.0.0' }, {
      capabilities: { tools: {}, resources: {}, prompts: {} },
    });
    this.protocol.setRequestHandler('tools/list', async () => ({
      tools: [...this.tools.entries()].map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })),
    }));
    this.protocol.setRequestHandler('tools/call', async (request) => {
      const tool = this.tools.get(request.params.name);
      if (!tool) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }] };
      try {
        enforceToolAccess(request.params.name, this.auth);
        const result = await tool.handler(request.params.arguments ?? {}, { auth: this.auth });
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result && typeof result === 'object' ? result : undefined };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool execution failed';
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    });
    this.protocol.setRequestHandler('resources/list', async () => ({
      resources: [...this.resources.keys()].filter((uri) => !uri.includes('{')).map((uri) => ({ uri, name: uri })),
    }));
    this.protocol.setRequestHandler('resources/templates/list', async () => ({
      resourceTemplates: [...this.resources.keys()].filter((uri) => uri.includes('{')).map((uri) => ({ uriTemplate: uri, name: uri })),
    }));
    this.protocol.setRequestHandler('resources/read', async (request) => {
      const match = this.findResource(request.params.uri);
      if (!match) throw new Error(`Resource not found: ${request.params.uri}`);
      enforceResourceAccess(request.params.uri, this.auth);
      const result = await match.handler(request.params.uri, { auth: this.auth });
      return { contents: [{ uri: request.params.uri, mimeType: 'application/json', text: JSON.stringify(result) }] };
    });
    this.protocol.setRequestHandler('prompts/list', async () => ({
      prompts: [...this.prompts.keys()].map((name) => ({ name, description: name.replaceAll('_', ' ') })),
    }));
    this.protocol.setRequestHandler('prompts/get', async (request) => {
      const handler = this.prompts.get(request.params.name);
      if (!handler) throw new Error(`Prompt not found: ${request.params.name}`);
      const accessTool = PROMPT_ACCESS_TOOL[request.params.name];
      if (accessTool) enforceToolAccess(accessTool, this.auth);
      const result = await handler(request.params.arguments ?? {}, { auth: this.auth });
      return { description: result?.description, messages: [{ role: 'user', content: { type: 'text', text: JSON.stringify(result) } }] };
    });
  }

  registerTool(config: { name: string; description: string; inputSchema: any }, handler: Handler): void {
    this.tools.set(config.name, config && { ...config, handler });
  }

  registerResource(uriTemplate: string, handler: ResourceHandler): void {
    this.resources.set(uriTemplate, handler);
  }

  registerPrompt(name: string, handler: Handler): void {
    this.prompts.set(name, handler);
  }

  private findResource(uri: string): { handler: ResourceHandler } | undefined {
    for (const [template, handler] of this.resources) {
      const templateParts = template.split('/');
      const uriParts = uri.split('/');
      const matches = templateParts.length === uriParts.length && templateParts.every((part, index) =>
        part.startsWith('{') && part.endsWith('}') ? uriParts[index].length > 0 : part === uriParts[index],
      );
      if (matches) return { handler };
    }
    return undefined;
  }
}
