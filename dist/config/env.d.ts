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
export declare const env: {
    /** HTTP listen port. Override with `PORT` when deploying. */
    port: number;
    /**
     * Canonical public base URL for this app (no trailing slash).
     * Used in startup logs and docs; the demo UI is typically `${PUBLIC_SITE_URL}/demo.html`.
     */
    publicSiteUrl: string;
    /** MCP Streamable HTTP endpoint — must end with `/mcp` for this sample. */
    mcpEndpoint: string;
    /** Auth service base URL (no trailing slash) — bootstrap + OAuth token endpoint. */
    authBaseUrl: string;
    /** Machine agent OAuth client id (from admin after create / bootstrap). */
    oauthClientId: string;
    /** Machine agent client secret (never sent to the browser). */
    oauthClientSecret: string;
    /** One-time bootstrap token from admin; optional if `oauthClientId` + `oauthClientSecret` are set. */
    bootstrapToken: string;
    /** OpenAI API key — server-side only; used in `chatRoute.ts`. */
    openaiApiKey: string;
    /** Chat model id (e.g. `gpt-4o-mini`). Override with `OPENAI_MODEL`. */
    openaiModel: string;
    /**
     * Set `TRUST_PROXY=1` or `true` when TLS terminates in front of this app so Express honors forwarded headers.
     * See `src/server.ts` for `app.set('trust proxy', …)`.
     */
    trustProxy: boolean;
};
