/**
 * Resolves an MCP `Authorization: Bearer` value via the Auth service:
 * optional one-time bootstrap → `client_credentials` → JWT `access_token`.
 *
 * Tokens are reused in-process until shortly before `expires_in` (RFC 6749) to avoid hitting `/oauth/token` on
 * every chat turn.
 *
 * In-memory `client_id` / `client_secret` are filled after a successful bootstrap when `.env`
 * only had `BOOTSTRAP_TOKEN`; restart the process unless you copy them into `.env`.
 */
import { env } from '../config/env.js';

let memoryClientId = '';
let memoryClientSecret = '';

/** Reuse `access_token` until shortly before OAuth says it expires (fewer `/oauth/token` calls). */
let accessTokenCache: { token: string; expiresAtMs: number } | null = null;

/** Refresh this many seconds before `expires_in` to avoid edge failures when clocks skew. */
const OAUTH_EXPIRY_SKEW_SEC = 90;

async function readJsonResponse(res: Response): Promise<{ text: string; json: Record<string, unknown> }> {
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* leave {} */
  }
  return { text, json };
}

export async function getMcpOAuthAccessToken(): Promise<string> {
  const now = Date.now();
  if (accessTokenCache && now < accessTokenCache.expiresAtMs) {
    return accessTokenCache.token;
  }

  const base = env.authBaseUrl;
  let clientId = (env.oauthClientId || memoryClientId).trim();
  let clientSecret = (env.oauthClientSecret || memoryClientSecret).trim();

  if (!clientId || !clientSecret) {
    const bt = env.bootstrapToken.trim();
    if (!bt) {
      throw new Error(
        'MCP OAuth: set CLIENT_ID and CLIENT_SECRET in .env, or set BOOTSTRAP_TOKEN for a one-time bootstrap (then persist id/secret in .env for the next run).',
      );
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

  const rawExpiresIn = tokenJson.expires_in;
  let expiresInSec =
    typeof rawExpiresIn === 'number' && Number.isFinite(rawExpiresIn) && rawExpiresIn > 0
      ? rawExpiresIn
      : typeof rawExpiresIn === 'string'
        ? Number.parseInt(rawExpiresIn, 10)
        : NaN;
  if (!Number.isFinite(expiresInSec) || expiresInSec <= 0) {
    expiresInSec = 3600;
  }
  const usableSec = Math.max(expiresInSec - OAUTH_EXPIRY_SKEW_SEC, 30);
  accessTokenCache = {
    token: accessToken,
    expiresAtMs: now + usableSec * 1000,
  };
  return accessToken;
}
