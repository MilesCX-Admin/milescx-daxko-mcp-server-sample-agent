/**
 * Resolves an MCP `Authorization: Bearer` value via the Auth service:
 * optional one-time bootstrap → `client_credentials` → JWT `access_token`.
 *
 * In-memory `client_id` / `client_secret` are filled after a successful bootstrap when `.env`
 * only had `BOOTSTRAP_TOKEN`; restart the process unless you copy them into `.env`.
 */
import { env } from '../config/env.js';
let memoryClientId = '';
let memoryClientSecret = '';
async function readJsonResponse(res) {
    const text = await res.text();
    let json = {};
    try {
        json = text ? JSON.parse(text) : {};
    }
    catch {
        /* leave {} */
    }
    return { text, json };
}
export async function getMcpOAuthAccessToken() {
    const base = env.authBaseUrl;
    let clientId = (env.oauthClientId || memoryClientId).trim();
    let clientSecret = (env.oauthClientSecret || memoryClientSecret).trim();
    if (!clientId || !clientSecret) {
        const bt = env.bootstrapToken.trim();
        if (!bt) {
            throw new Error('MCP OAuth: set CLIENT_ID and CLIENT_SECRET in .env, or set BOOTSTRAP_TOKEN for a one-time bootstrap (then persist id/secret in .env for the next run).');
        }
        const bootRes = await fetch(`${base}/v1/agents/bootstrap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bootstrap_token: bt }),
        });
        const { text: bootText, json: bootJson } = await readJsonResponse(bootRes);
        if (!bootRes.ok) {
            throw new Error(`POST ${base}/v1/agents/bootstrap → ${bootRes.status}: ${bootText.slice(0, 500)}`);
        }
        const id = String(bootJson.client_id ?? '').trim();
        const sec = String(bootJson.client_secret ?? '').trim();
        if (!id || !sec) {
            throw new Error('Bootstrap response missing client_id or client_secret');
        }
        memoryClientId = id;
        memoryClientSecret = sec;
        clientId = id;
        clientSecret = sec;
    }
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
    });
    const tokenRes = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const { text: tokenText, json: tokenJson } = await readJsonResponse(tokenRes);
    if (!tokenRes.ok) {
        throw new Error(`POST ${base}/oauth/token → ${tokenRes.status}: ${tokenText.slice(0, 500)}`);
    }
    const accessToken = String(tokenJson.access_token ?? '').trim();
    if (!accessToken) {
        throw new Error('No access_token in OAuth token response');
    }
    return accessToken;
}
//# sourceMappingURL=oauthAccessToken.js.map