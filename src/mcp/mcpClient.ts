/**
 * MCP client helpers — talk to your MCP server over **Streamable HTTP**.
 *
 * Design choice (good for demos and many hosted MCP servers):
 * we open a connection, perform **one** MCP operation (`listTools` or `callTool`), then close.
 * That keeps the sample stateless and easy to reason about; a production app might pool or reuse clients.
 *
 * The `@modelcontextprotocol/sdk` package provides `Client` + `StreamableHTTPClientTransport`.
 * Auth is whatever the MCP server accepts as `Authorization: Bearer` — here an OAuth **`access_token`** (JWT)
 * from `client_credentials` (see `oauthAccessToken.ts`).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { env } from '../config/env.js';

/**
 * Runs `fn` with a connected MCP `Client`, then closes the transport in `finally`.
 *
 * @param bearerToken — OAuth access token (JWT) for MCP when JWT verification is enabled on the server.
 */
async function withMcpClient<T>(
  bearerToken: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const url = new URL(env.mcpEndpoint);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
  });
  const client = new Client({
    name: 'mcp-public-demo-agent',
    version: '1.0.0',
  });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    // Best-effort cleanup; ignore errors so the original result/error from `fn` still surfaces.
    await transport.close().catch(() => undefined);
  }
}

/** MCP `tools/list` — returns tool names, descriptions, and JSON-schema-ish `inputSchema` for each tool. */
export async function mcpListTools(bearerToken: string): Promise<ListToolsResult> {
  return withMcpClient(bearerToken, (client) => client.listTools());
}

/** MCP `tools/call` — invokes one tool by name with JSON arguments; result shape is normalized in `toolBridge.ts`. */
export async function mcpCallTool(
  bearerToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Awaited<ReturnType<Client['callTool']>>> {
  return withMcpClient(bearerToken, (client) =>
    client.callTool({
      name,
      arguments: args,
    }),
  );
}
