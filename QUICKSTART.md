# Quickstart

This repo has **two** small programs. Pick the one you need first.

---

## 1. Web chat demo (browser + AI + your MCP server)

You get a simple chat page. Your OpenAI account answers questions, and the server can call **tools** on your MCP server when the model asks to.

**Before you start:** From your **admin portal**, copy the **Auth** service base URL, the MCP server URL (Streamable HTTP, ending in **`/mcp`**), OAuth **client id + secret** for your machine agent (or a one-time **bootstrap token** for the first exchange), and your **OpenAI API key**. Pick a local site address (below we use `http://localhost:3847`).

**Steps**

1. Open a terminal and go into this project folder (the same folder that contains `package.json`).
2. Copy the sample settings file:  
   `cp .env.example .env`
3. Open **`.env`** and fill **`AUTH_BASE_URL`**, **`MCP_ENDPOINT`**, **`PUBLIC_SITE_URL`**, **`OPENAI_API_KEY`**, and either **`CLIENT_ID`** + **`CLIENT_SECRET`** or **`BOOTSTRAP_TOKEN`** (see section 2 for bootstrap vs persisted secret).
4. Install and start the app:
   ```bash
   npm install
   npm run dev
   ```
5. In the browser, open the address you put in **`PUBLIC_SITE_URL`**, then open **`/demo.html`** on that address.  
   Example: `http://localhost:3847/demo.html`

**Commands**

- **`npm run dev`** — Starts the web app. If you change code and save, the server restarts by itself.
- **`npm start`** — Same web app, but it does **not** auto-restart when you save files.

---

## 2. Command-line check (agent setup + list MCP tools)

Use this when you are setting up an **automation agent** (not the long portal access key). It checks that you can get a **short-lived login ticket** for the MCP server and then asks the server to **list tools**.

**Before you start:** From your admin portal, get the **token service** base URL, the **MCP server** URL, and either a **one-time bootstrap code** (right after you create an agent) or the **client id + secret** you saved after that first step.

**Steps**

1. Edit **`.env`**. Use **`AUTH_BASE_URL`**, **`MCP_ENDPOINT`**, and either **`BOOTSTRAP_TOKEN`** or **`CLIENT_ID`** + **`CLIENT_SECRET`** — same variables as the web chat in section 1.
2. **First time only:** set **`BOOTSTRAP_TOKEN`** to the one-time code from the portal. Leave **`CLIENT_ID`** and **`CLIENT_SECRET`** empty until you have them.
3. **After the first run worked:** put **`CLIENT_ID`** and **`CLIENT_SECRET`** from the printed output into **`.env`**, and **delete** the **`BOOTSTRAP_TOKEN`** line (that code only works once).
4. Run:
   ```bash
   npm run oauth-agent
   ```
   You can use **`npm run bootstrap`** instead — it does the same thing.

You should see HTTP status output and a JSON snippet from the MCP server. If something fails, read the error text in the terminal (it often says “wrong address” or “wrong secret” in plain terms).

**What the names mean (short)**

| Setting | Plain meaning |
|---------|----------------|
| **`AUTH_BASE_URL`** | Where your login / token service lives (no `/` on the end). |
| **`MCP_ENDPOINT`** | Full Streamable MCP URL (typically ends with **`/mcp`**). Used by both the web chat and **`npm run oauth-agent`**. |
| **`BOOTSTRAP_TOKEN`** | One-time setup code from the portal. Remove after first success. |
| **`CLIENT_ID`** / **`CLIENT_SECRET`** | Longer-lived pair you keep after setup; use these on later runs instead of the bootstrap code. |

---

## Where to read more

- **[README.md](./README.md)** — Overview of both flows and production build notes.
- **[docs/README.md](./docs/README.md)** — List of other docs.
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Pictures of how requests flow (optional read).

**Putting the chat app on a real server:** run `npm run build`, then start it with `node dist/server.js`. The command-line check above always stays `node src/index.js` (via `npm run oauth-agent` or `npm run bootstrap`).
