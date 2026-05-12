/**
 * Sample agent entry point (Express).
 *
 * Run: **`npm run dev`** (watch) or **`npm start`** (no watch). For OAuth2 + JWT bootstrap/MCP smoke test without
 * the chat UI, use **`npm run oauth-agent`** or **`npm run bootstrap`** → `src/index.js` (same `.env` OAuth block).
 *
 * What this file does, in order:
 * 1. Load validated config from `./config/env.js` (fails fast if `.env` is incomplete).
 * 2. Mount JSON + the chat API under `/api` (see `chatRoute.ts` — that is where OpenAI + MCP run).
 * 3. Serve the static demo UI from `../public` (browser talks only to this origin; secrets stay server-side).
 *
 * MCP credentials live in environment variables only; they are never embedded in HTML or JS sent to the client.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { env } from './config/env.js';
import { chatRouter } from './chat/chatRoute.js';

// ESM has no `__dirname`; derive the folder containing this file so we can resolve `public/` next to `src/`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

// When this app sits behind nginx, a load balancer, or Cloudflare, set TRUST_PROXY=1 so Express trusts
// `X-Forwarded-*` headers for IP logging, secure cookies (if you add them later), etc.
if (env.trustProxy) {
  app.set('trust proxy', 1);
}

// Small body limit: demo chat only. Raise if you extend the API with large payloads.
app.use(express.json({ limit: '256kb' }));

// Simple liveness probe for operators / container orchestrators (not used by the demo UI).
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// All chat + MCP + OpenAI logic is under `/api/*` (see `src/chat/chatRoute.ts`).
app.use('/api', chatRouter);

// Static files: `demo.html`, `js/chat-ui.js`, favicon, robots.txt.
// We relax CSP for `demo.html` only so the page can be embedded in iframes during local demos;
// for a stricter deployment, narrow `frame-ancestors` or move CSP to your reverse proxy.
app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      if (filePath.includes('demo.html')) {
        res.setHeader('Content-Security-Policy', 'frame-ancestors *');
      }
    },
  }),
);

// Convenience: visiting `/` sends people straight to the chat demo.
app.get('/', (_req, res) => {
  res.redirect(302, '/demo.html');
});

// Explicit JSON 404 for unknown API-ish paths (static middleware already handled real files).
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(env.port, () => {
  console.log(`Sample agent listening on ${env.publicSiteUrl} (port ${env.port})`);
});
