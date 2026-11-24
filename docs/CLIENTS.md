# MCP client configuration

These are example configurations for the STDIO entry point. The repository tests use the official TypeScript SDK v2.4.0 in-memory client, not these desktop clients; compatibility is therefore **untested**.

## Claude Desktop

```json
{
  "mcpServers": {
    "rideiq": {
      "command": "node",
      "args": ["D:/45/rideiq-mcp/node_modules/tsx/dist/cli.mjs", "D:/45/rideiq-mcp/src/transports/stdio.ts"],
      "env": {
        "DATABASE_URL": "postgresql://rideiq:rideiq@localhost:5432/rideiq?schema=public",
        "JWT_SECRET": "replace-with-a-long-random-secret",
        "ENCRYPTION_KEY": "replace-with-a-32-byte-key"
      }
    }
  }
}
```

## Cursor

Save as `.cursor/mcp.json` in the project:

```json
{
  "mcpServers": {
    "rideiq": {
      "command": "node",
      "args": ["node_modules/tsx/dist/cli.mjs", "src/transports/stdio.ts"],
      "env": { "DATABASE_URL": "${env:DATABASE_URL}", "JWT_SECRET": "${env:JWT_SECRET}", "ENCRYPTION_KEY": "${env:ENCRYPTION_KEY}" }
    }
  }
}
```

## VS Code

Save as `.vscode/mcp.json`:

```json
{
  "servers": {
    "rideiq": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/node_modules/tsx/dist/cli.mjs", "${workspaceFolder}/src/transports/stdio.ts"],
      "env": { "DATABASE_URL": "${env:DATABASE_URL}", "JWT_SECRET": "${env:JWT_SECRET}", "ENCRYPTION_KEY": "${env:ENCRYPTION_KEY}" }
    }
  }
}
```

The HTTP entry point is Streamable HTTP at `/mcp`, requires a signed Bearer token, and only permits localhost hostnames/origins by default. No third-party client's HTTP configuration has been tested.
