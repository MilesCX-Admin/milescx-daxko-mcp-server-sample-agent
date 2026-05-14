# Public MCP demo agent

Two ways to run this repo:

| Command | What it runs |
|---------|----------------|
| **`npm run dev`** | **Chat demo:** Express + static **`demo.html`**, **`POST /api/chat`**, OpenAI tool loop, MCP via **OAuth `client_credentials` + JWT** ([`src/server.ts`](./src/server.ts), [`src/mcp/oauthAccessToken.ts`](./src/mcp/oauthAccessToken.ts)). Reloads on file changes. |
| **`npm start`** | Same app as **`dev`**, without the file watcher (single process). |
| **`npm run oauth-agent`** (alias **`npm run bootstrap`**) | **Bootstrap + OAuth2 + MCP:** optional **`BOOTSTRAP_TOKEN`** exchange, **`client_credentials`**, then **`tools/list`** with a **Bearer JWT** ([`src/index.js`](./src/index.js)). |

Use your **admin portal** (or operator doc) for URLs, issuer base, bootstrap tokens, and OAuth agent credentials.

---

## Chat demo (`npm run dev`)

1. Copy **`.env.example`** → **`.env`**. Fill **`AUTH_BASE_URL`**, **`MCP_ENDPOINT`**, **`CLIENT_ID`** + **`CLIENT_SECRET`** (or **`BOOTSTRAP_TOKEN`** for a one-time first run), **`PUBLIC_SITE_URL`**, and **`OPENAI_API_KEY`** (same OAuth block as **`npm run oauth-agent`**).
2. **`npm install`** then **`npm run dev`**.
3. Open **`PUBLIC_SITE_URL`** (e.g. **`http://localhost:3847/demo.html`**).

Secrets stay server-side; the browser only talks to this origin.

The server caches **`client_credentials`** access tokens until shortly before **`expires_in`**, and MCP **`tools/list`** in memory for a short TTL (default five minutes, **`MCP_TOOLS_LIST_TTL_MS`**), so ordinary chat turns do not re-hit the token endpoint or list tools every time. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

For patterns when extending this code (token lifecycle, `tools/list` vs `tools/call`, scaling, env knobs), see [`docs/MCP_DEVELOPER_GUIDE.md`](./docs/MCP_DEVELOPER_GUIDE.md).

---

## OAuth agent / bootstrap (`npm run oauth-agent` / `npm run bootstrap`)

1. Configure **`AUTH_BASE_URL`**, **`MCP_ENDPOINT`**, and either **`BOOTSTRAP_TOKEN`** (first run) or **`CLIENT_ID`** + **`CLIENT_SECRET`** (later runs) in **`.env`** — values from the portal.
2. **`npm run oauth-agent`** (same as **`npm run bootstrap`**).

Flow:

1. **Optional:** **`POST …/agents/bootstrap`** with **`BOOTSTRAP_TOKEN`** → **`client_id`** + **`client_secret`** (exact path depends on your issuer).
2. **`POST …/oauth/token`** with **`grant_type=client_credentials`**.
3. **`POST /mcp`** with JSON-RPC **`tools/list`** using **`Authorization: Bearer <JWT>`**.

After bootstrap, copy **`client_id`** / **`client_secret`** from the printed payload into **`.env`**, remove **`BOOTSTRAP_TOKEN`**, and re-run.

Do not commit real tokens. Keep **`.env`** gitignored.

### Prerequisites (OAuth path)

Your MCP host must accept **JWT** bearer tokens and validate them (issuer, audience, JWKS) per your deployment guide. You need a machine agent (or equivalent) allowed to use **`client_credentials`**, and tool access configured for your tenant.

---

## Production-style build

```bash
npm run build
node dist/server.js
```

(requires compiling **`src/server.ts`** and dependencies; adjust if you add a separate entry for `oauth-agent` in TypeScript.)

## Documentation

- [QUICKSTART.md](./QUICKSTART.md) — fastest way to run both flows.
- [docs/INDEX.md](./docs/INDEX.md) — index of deeper docs.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — diagrams and env reference.

## Env

See **`.env.example`**: one OAuth + MCP block for both the web chat and **`npm run oauth-agent`**.
