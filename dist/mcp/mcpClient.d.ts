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
import type { ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
/** MCP `tools/list` — returns tool names, descriptions, and JSON-schema-ish `inputSchema` for each tool. */
export declare function mcpListTools(bearerToken: string): Promise<ListToolsResult>;
/** MCP `tools/call` — invokes one tool by name with JSON arguments; result shape is normalized in `toolBridge.ts`. */
export declare function mcpCallTool(bearerToken: string, name: string, args: Record<string, unknown>): Promise<Awaited<ReturnType<Client['callTool']>>>;
