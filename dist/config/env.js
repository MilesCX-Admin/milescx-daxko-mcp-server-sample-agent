/**
 * Environment configuration — single place to validate process.env before the server accepts traffic.
 *
 * Copy `.env.example` to `.env` and fill values from your admin portal (connection URLs, OAuth agent, etc.).
 *
 * Security reminder for readers of this sample:
 * - `CLIENT_SECRET`, `BOOTSTRAP_TOKEN`, and `OPENAI_API_KEY` must only be read on the server (this process).
 * - Never pass them to the browser or log them.
 */
import 'dotenv/config';
/** Fail startup immediately with a clear message if a required variable is missing or blank. */
function requireEnv(name) {
    const v = process.env[name]?.trim();
    if (!v) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return v;
}
/** Use env value if set; otherwise fall back (keeps `.env` smaller for optional tuning knobs). */
function optionalEnv(name, defaultValue) {
    const v = process.env[name]?.trim();
    return v && v.length > 0 ? v : defaultValue;
}
/**
 * In-memory MCP `tools/list` TTL (milliseconds). `0` or negative = disable caching (always hit MCP).
 * Default **300_000** (5 minutes) — good balance for demos: fewer round-trips, still picks up new tools after deploy.
 */
function parseMcpToolsListTtlMs() {
    const raw = process.env.MCP_TOOLS_LIST_TTL_MS?.trim();
    if (raw === undefined || raw === '')
        return 300_000;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n))
        return 300_000;
    if (n <= 0)
        return null;
    return Math.max(n, 1000);
}
const oauthClientId = (process.env.CLIENT_ID ?? '').trim();
const oauthClientSecret = (process.env.CLIENT_SECRET ?? '').trim();
const bootstrapToken = (process.env.BOOTSTRAP_TOKEN ?? '').trim();
if (oauthClientId && !oauthClientSecret) {
    throw new Error('CLIENT_SECRET is required when CLIENT_ID is set.');
}
if (!oauthClientId && oauthClientSecret) {
    throw new Error('CLIENT_ID is required when CLIENT_SECRET is set.');
}
const hasOAuthPair = Boolean(oauthClientId && oauthClientSecret);
if (!hasOAuthPair && !bootstrapToken) {
    throw new Error('Missing MCP OAuth credentials: set CLIENT_ID and CLIENT_SECRET, or set BOOTSTRAP_TOKEN for a one-time bootstrap (then add id/secret to .env).');
}
export const env = {
    /** HTTP listen port. Override with `PORT` when deploying. */
    port: Number.parseInt(process.env.PORT ?? '3847', 10) || 3847,
    /**
     * Canonical public base URL for this app (no trailing slash).
     * Used in startup logs and docs; the demo UI is typically `${PUBLIC_SITE_URL}/demo.html`.
     */
    publicSiteUrl: requireEnv('PUBLIC_SITE_URL').replace(/\/+$/, ''),
    /** MCP Streamable HTTP endpoint — must end with `/mcp` for this sample. */
    mcpEndpoint: requireEnv('MCP_ENDPOINT'),
    /** Auth service base URL (no trailing slash) — bootstrap + OAuth token endpoint. */
    authBaseUrl: requireEnv('AUTH_BASE_URL').replace(/\/+$/, ''),
    /** Machine agent OAuth client id (from admin after create / bootstrap). */
    oauthClientId,
    /** Machine agent client secret (never sent to the browser). */
    oauthClientSecret,
    /** One-time bootstrap token from admin; optional if `oauthClientId` + `oauthClientSecret` are set. */
    bootstrapToken,
    /** OpenAI API key — server-side only; used in `chatRoute.ts`. */
    openaiApiKey: requireEnv('OPENAI_API_KEY'),
    /** Chat model id (e.g. `gpt-4o-mini`). Override with `OPENAI_MODEL`. */
    openaiModel: optionalEnv('OPENAI_MODEL', 'gpt-4o-mini'),
    /** See `parseMcpToolsListTtlMs` — env `MCP_TOOLS_LIST_TTL_MS`. */
    mcpToolsListTtlMs: parseMcpToolsListTtlMs(),
    /**
     * Set `TRUST_PROXY=1` or `true` when TLS terminates in front of this app so Express honors forwarded headers.
     * See `src/server.ts` for `app.set('trust proxy', …)`.
     */
    trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
};
//# sourceMappingURL=env.js.map