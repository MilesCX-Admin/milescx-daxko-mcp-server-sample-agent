# Developer guide — calling MCP from this sample

This document is for engineers who **extend or fork** this repo and need solid patterns for OAuth, MCP HTTP traffic, and caching. It complements the end-to-end flow in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

**Source of truth in code**

| Topic | Location |
|--------|----------|
| OAuth `client_credentials` + in-memory token reuse | [`src/mcp/oauthAccessToken.ts`](../src/mcp/oauthAccessToken.ts) |
| Streamable HTTP MCP client, `tools/list` cache, `tools/call` | [`src/mcp/mcpClient.ts`](../src/mcp/mcpClient.ts) |
| Tool schema → OpenAI tools, result stringification | [`src/mcp/toolBridge.ts`](../src/mcp/toolBridge.ts) |
| Chat loop (when MCP is invoked) | [`src/chat/chatRoute.ts`](../src/chat/chatRoute.ts) |
| Env parsing (`MCP_TOOLS_LIST_TTL_MS`, endpoints) | [`src/config/env.ts`](../src/config/env.ts) |

---

## 1. Connection model (this sample)

The MCP SDK is used with **`StreamableHTTPClientTransport`**: each use opens a transport, runs **one** JSON-RPC-style operation (`listTools` or `callTool`), then closes the transport in a `finally` block.

**Why this pattern:** predictable lifecycle, easy to debug, fine for moderate QPS on a single Node process.

**When to evolve it:** under high concurrency you may **pool** transports, **reuse** one `Client` per worker, or multiplex according to your MCP host’s expectations. Always align with your host’s documented limits (connections per client, idle timeouts, auth headers).

---

## 2. Authentication and access tokens

### Use server-side credentials only

`CLIENT_SECRET`, `BOOTSTRAP_TOKEN`, and any machine token must **never** be sent to the browser or logged. Resolve the MCP bearer token only in server code (as this sample does).

### Cache tokens using `expires_in`

RFC 6749 token responses often include **`expires_in`** (seconds). This sample:

- Caches the **`access_token`** in memory until shortly before expiry.
- Subtracts **90 seconds** from `expires_in` as skew (`OAUTH_EXPIRY_SKEW_SEC` in [`oauthAccessToken.ts`](../src/mcp/oauthAccessToken.ts)) so a token is refreshed before the JWT actually expires, reducing 401s at the MCP host.
- If `expires_in` is missing or unusable, assumes **3600** seconds, then applies the same rules with a **minimum ~30 seconds** of usable lifetime.

**Best practices**

- Prefer **`expires_in`** from the issuer over guessing from JWT `exp` unless your issuer is inconsistent and you have no choice.
- On **401 / invalid_token** from MCP or the issuer, **clear the token cache** (this sample does not do automatic retry; add one retry after refresh in production if appropriate).
- If you run **multiple Node workers**, each process has its **own** in-memory cache; that is normal until you centralize tokens (see §6).

---

## 3. `tools/list` — when to call it, and caching

### When you need a tool list

If your LLM integration passes **OpenAI-style `tools`** (or equivalent), you need an up-to-date **name + input schema** for each tool **before** the completion that might emit tool calls. That implies calling MCP **`tools/list`** (or using a cached copy) before that completion.

You **do not** need to list tools on every HTTP request if a cached snapshot is still valid for your product rules.

### What this sample caches

[`mcpListTools`](../src/mcp/mcpClient.ts) caches the last **`ListToolsResult`** in memory:

- **TTL:** `MCP_TOOLS_LIST_TTL_MS` (default **300000** ms = 5 minutes). Parsed in [`env.ts`](../src/config/env.ts).
- **Cache key:** the **exact bearer string**. A new access token automatically misses the old entry, which matters if **tool visibility differs per token** (multi-tenant JWTs).

Set **`MCP_TOOLS_LIST_TTL_MS=0`** (or any non-positive value) to **disable** listing cache and always hit MCP (useful when debugging tool registration).

### Operational guidance

- **After MCP deploys** that add or change tools, expect new definitions within the **TTL**, or restart the process / bump TTL logic if you need immediate pickup.
- If the model calls a tool and MCP returns **“unknown tool”**, consider **invalidating** the tools list cache once and retrying `tools/list` before failing the user turn.
- If **different users** get different tools from the same host, **never** use a global cache keyed only by endpoint; keying by bearer (as here) is a minimal correct pattern for JWT-shaped bearers.

---

## 4. `tools/call`

Each invocation in this sample uses a **fresh short-lived connection** with the **same** bearer you used for `tools/list` (typically the cached token from §2).

**Best practices**

- Keep **`arguments`** JSON-serializable and bounded; validate sizes before sending (this sample validates chat payloads; extend similarly for tool args if you expose untrusted input).
- Treat tool calls as **trusted server-side** actions: enforce authorization in **your** layer before forwarding to MCP if the MCP host does not fully isolate tenants.
- For long-running tools, consider timeouts and cancellation at the HTTP layer so one stalled tool does not hold the whole chat response forever.

---

## 5. Latency, OAuth issuer load, and MCP load

Rough order of cost per user chat turn (after warm caches):

1. **No** `/oauth/token` if the cached token is still valid.
2. **No** MCP `tools/list` if the tools cache entry is still valid for that bearer.
3. **One** MCP round-trip per **`tools/call`** the model requests (each opens/closes transport in this sample).

Reducing **`tools/list`** and **`/oauth/token`** traffic keeps logs quieter and protects shared issuers and MCP fronts from unnecessary spikes.

---

## 6. Scaling beyond one process

This sample’s caches are **in-memory and per process**:

| Concern | Direction |
|---------|-----------|
| Multiple replicas | Each replica maintains its own token and tools cache; acceptable for many workloads. |
| Stronger token efficiency | Optional shared store (Redis) for `access_token` + `expires_at`, with single-flight refresh. |
| Sticky tool catalogs | If all replicas must see identical tools, TTL + deploy practices usually suffice; avoid long TTLs if tools change hourly. |
| Per-user OAuth | Issue **per-user** tokens, cache **keyed by user id + scopes** (not only endpoint), and never reuse one user’s bearer for another. |

---

## 7. LLM integration (optional optimizations)

Not implemented in this sample, but worth knowing when you grow past the demo:

- **Skip attaching `tools`** on turns where tools cannot help (routing, classifier, or explicit “plain chat” mode). Then you can **skip `tools/list`** entirely for that request.
- **Persist tool messages** in conversation history if you need the model to reason about prior tool results across HTTP requests (the browser demo only stores user/assistant text).

---

## 8. Quick checklist

- [ ] Bearer token only on the server; never in client bundles or logs.
- [ ] Respect **`expires_in`** (or equivalent) with a **skew** before real expiry.
- [ ] Cache **`tools/list`** with a **TTL** and a **key** that includes identity if tools vary by principal.
- [ ] Invalidate or shorten TTL when you know the catalog changed or after **unknown tool** errors.
- [ ] Consider **retry once** after token refresh on 401 from MCP.
- [ ] Match MCP host documentation for **connection reuse**, **rate limits**, and **Streamable HTTP** specifics.

For sequence diagrams and env tables, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
