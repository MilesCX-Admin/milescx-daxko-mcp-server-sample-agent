/**
 * MCP client helpers — talk to your MCP server over **Streamable HTTP**.
 *
 * We open a connection, perform **one** MCP operation (`listTools` or `callTool`), then close.
 * That keeps lifecycle simple; a production app might pool transports.
 *
 * `tools/list` is cached in-process for `env.mcpToolsListTtlMs` (see `MCP_TOOLS_LIST_TTL_MS`) keyed by bearer
 * token so new JWTs pick up a fresh catalog when credentials rotate.
 *
 * The `@modelcontextprotocol/sdk` package provides `Client` + `StreamableHTTPClientTransport`.
 * Auth is whatever the MCP server accepts as `Authorization: Bearer` — here an OAuth **`access_token`** (JWT)
 * from `client_credentials` (see `oauthAccessToken.ts`).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { env } from '../config/env.js';
/**
 * Runs `fn` with a connected MCP `Client`, then closes the transport in `finally`.
 *
 * @param bearerToken — OAuth access token (JWT) for MCP when JWT verification is enabled on the server.
 */
async function withMcpClient(bearerToken, fn) {
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
    }
    finally {
        // Best-effort cleanup; ignore errors so the original result/error from `fn` still surfaces.
        await transport.close().catch(() => undefined);
    }
}
let toolsListCache = null;
/** MCP `tools/list` — returns tool names, descriptions, and JSON-schema-ish `inputSchema` for each tool. */
export async function mcpListTools(bearerToken) {
    const ttlMs = env.mcpToolsListTtlMs;
    const now = Date.now();
    if (ttlMs !== null &&
        toolsListCache &&
        toolsListCache.bearer === bearerToken &&
        now < toolsListCache.expiresAtMs) {
        return toolsListCache.result;
    }
    const result = await withMcpClient(bearerToken, (client) => client.listTools());
    if (ttlMs !== null) {
        toolsListCache = { bearer: bearerToken, result, expiresAtMs: now + ttlMs };
    }
    else {
        toolsListCache = null;
    }
    return result;
}
/** MCP `tools/call` — invokes one tool by name with JSON arguments; result shape is normalized in `toolBridge.ts`. */
export async function mcpCallTool(bearerToken, name, args) {
    return withMcpClient(bearerToken, (client) => client.callTool({
        name,
        arguments: args,
    }));
}
//# sourceMappingURL=mcpClient.js.map