/**
 * OAuth2 / bootstrap MCP smoke test.
 * Run: `npm run oauth-agent` or `npm run bootstrap` (see `.env.example` — AUTH_BASE_URL, MCP_ENDPOINT, etc.).
 * Does not start Express; for the chat UI use `npm run dev`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDotEnv() {
  try {
    const raw = readFileSync(join(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* no .env */
  }
}

loadDotEnv();

const AUTH_BASE = (process.env.AUTH_BASE_URL ?? '').replace(/\/$/, '');
const MCP_ENDPOINT = (process.env.MCP_ENDPOINT ?? '').trim();
const bootstrap = (process.env.BOOTSTRAP_TOKEN ?? '').trim();
let clientId = (process.env.CLIENT_ID ?? '').trim();
let clientSecret = (process.env.CLIENT_SECRET ?? '').trim();

function tryParseJsonObject(text) {
  const t = (text ?? '').trim();
  if (!t) return {};
  try {
    const v = JSON.parse(t);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

async function postBootstrapExchange() {
  const res = await fetch(`${AUTH_BASE}/v1/agents/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bootstrap_token: bootstrap }),
  });
  const text = await res.text();
  const json = tryParseJsonObject(text);
  if (!res.ok) {
    const code = json.error;
    if (res.status === 400 && code === 'invalid_grant') {
      throw new Error(
        'That bootstrap token is not valid or was already used. If you already exchanged it once, remove BOOTSTRAP_TOKEN from .env and use CLIENT_ID and CLIENT_SECRET instead. Otherwise ask an admin to issue a new bootstrap token for this agent and update BOOTSTRAP_TOKEN.',
      );
    }
    const msg = typeof json.message === 'string' && json.message.trim() ? json.message.trim() : null;
    if (msg) throw new Error(`Bootstrap failed: ${msg}`);
    throw new Error(`Bootstrap failed (HTTP ${res.status}). Check AUTH_BASE_URL and try again.`);
  }
  return json;
}

async function oauthTokenClientCredentials(id, secret) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
  });
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  const json = tryParseJsonObject(text);
  if (!res.ok) {
    const code = json.error;
    const desc =
      typeof json.error_description === 'string' && json.error_description.trim()
        ? json.error_description.trim()
        : typeof json.message === 'string' && json.message.trim()
          ? json.message.trim()
          : null;
    if (code === 'invalid_client' || code === 'invalid_grant') {
      throw new Error(
        desc
          ? `Could not get an access token: ${desc}`
          : 'Could not get an access token: check CLIENT_ID and CLIENT_SECRET (wrong or revoked).',
      );
    }
    if (desc) throw new Error(`Could not get an access token: ${desc}`);
    throw new Error(`Could not get an access token (HTTP ${res.status}). Check AUTH_BASE_URL.`);
  }
  return json;
}

/** Parse a single JSON-RPC body or Streamable HTTP SSE (`event:` / `data:` lines). */
function parseMcpResponseBody(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  let last = null;
  for (const line of trimmed.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      last = JSON.parse(payload);
    } catch {
      /* ignore non-JSON data lines */
    }
  }
  return last;
}

function formatToolsListSummary(json) {
  if (!json || typeof json !== 'object') return 'MCP: could not parse response.';
  if (json.error) return `MCP JSON-RPC error: ${JSON.stringify(json.error)}`;
  const tools = json.result?.tools;
  if (!Array.isArray(tools)) return `MCP: unexpected result (no tools array).`;
  const names = tools.map((t) => (t && typeof t.name === 'string' ? t.name : null)).filter(Boolean);
  return `tools/list OK — ${names.length} tool(s): ${names.join(', ')}`;
}

async function main() {
  if (!AUTH_BASE || !MCP_ENDPOINT) {
    console.error('Set AUTH_BASE_URL and MCP_ENDPOINT (see .env.example)');
    process.exit(1);
  }

  if (bootstrap) {
    const boot = await postBootstrapExchange();
    clientId = String(boot.client_id ?? '').trim();
    clientSecret = String(boot.client_secret ?? '').trim();
    if (!clientId || !clientSecret) {
      console.error('Bootstrap response missing client_id or client_secret', boot);
      process.exit(1);
    }
    console.error(
      'Bootstrap OK. Save CLIENT_ID and CLIENT_SECRET in .env for next runs; remove BOOTSTRAP_TOKEN (single use).',
    );
    console.error('Bootstrap payload (copy once; do not commit):', JSON.stringify(boot, null, 2));
  }

  if (!clientId || !clientSecret) {
    console.error(
      'Set BOOTSTRAP_TOKEN (first run, from admin after Create agent), or both CLIENT_ID and CLIENT_SECRET (see .env.example).',
    );
    process.exit(1);
  }

  const tokenJson = await oauthTokenClientCredentials(clientId, clientSecret);
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    console.error('No access_token in token response', tokenJson);
    process.exit(1);
  }

  const mcpBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  };
  const mcpRes = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(mcpBody),
  });
  const mcpText = await mcpRes.text();
  const parsed = parseMcpResponseBody(mcpText);
  console.log('MCP status', mcpRes.status);
  console.log(formatToolsListSummary(parsed));
  if (!mcpRes.ok) process.exit(1);
  if (parsed && typeof parsed === 'object' && parsed.error) process.exit(1);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  process.exit(1);
});
