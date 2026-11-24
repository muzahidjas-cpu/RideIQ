# MCP Inspector checklist

The project has not yet been run through MCP Inspector. Protocol-level in-process checks are recorded in [VERIFICATION.md](VERIFICATION.md). Run this checklist after starting PostgreSQL and applying migrations:

1. Launch the STDIO server using a config from [CLIENTS.md](CLIENTS.md).
2. Confirm initialization and tool discovery; expect 53 registered tools.
3. Confirm resource and resource-template discovery; expect 19 total entries.
4. Confirm prompt discovery; expect 8 prompts.
5. Invoke one read-only tool per domain against seeded data.
6. Read a fixed resource and a parameterized resource template.
7. Retrieve a reusable workflow prompt.
8. Confirm a caller lacking the required role receives a permission error.
9. Start the HTTP transport, provide a valid bearer token, and repeat discovery and one tool call.
10. Confirm missing/invalid tokens and non-local Host/Origin values are rejected.

Do not mark the Inspector check complete until an actual Inspector session and its results are recorded.
