/**
 * Browser-side UI for the sample chat (no bundler — plain script tag + IIFE).
 *
 * Trust model (read this when copying into your own app):
 * - This script runs in the user’s browser. It must NOT contain API keys or MCP secrets.
 * - It only calls same-origin `POST /api/chat`; the Express server attaches secrets when talking to OpenAI + MCP.
 * - Optional “User context” JSON is **not** secret — it is hints for the model (phone, member id, etc.).
 *   Treat it as untrusted input on the server if you expose this pattern publicly.
 */
(function () {
  const CONTEXT_STORAGE_KEY = 'mcp_sample_user_context_json';
  const messagesEl = document.getElementById('messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('message-input');
  const statusEl = document.getElementById('status');
  const contextTextarea = document.getElementById('user-context-json');

  // Persist optional user-context textarea across reloads so demos are less tedious (localStorage only).
  if (contextTextarea instanceof HTMLTextAreaElement) {
    const saved = localStorage.getItem(CONTEXT_STORAGE_KEY);
    if (saved !== null) contextTextarea.value = saved;
    contextTextarea.addEventListener('change', () => {
      localStorage.setItem(CONTEXT_STORAGE_KEY, contextTextarea.value);
    });
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  /**
   * Append a chat bubble. User messages are plain text (XSS-safe). Assistant messages may be Markdown:
   * when `marked` + `DOMPurify` load from CDN in `demo.html`, we sanitize HTML before inserting.
   * @param {'user' | 'assistant'} role
   * @param {string} text
   */
  function appendBubble(role, text) {
    if (!messagesEl) return;
    const div = document.createElement('div');
    div.className = 'bubble ' + (role === 'user' ? 'bubble-user' : 'bubble-assistant');
    if (role === 'user') {
      div.textContent = text;
    } else {
      setAssistantBubbleContent(div, text);
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /** @param {HTMLDivElement} div */
  function setAssistantBubbleContent(div, text) {
    const md =
      typeof globalThis.marked !== 'undefined' && typeof globalThis.DOMPurify !== 'undefined'
        ? globalThis.marked
        : null;
    const purify = typeof globalThis.DOMPurify !== 'undefined' ? globalThis.DOMPurify : null;
    if (md && purify && typeof md.parse === 'function') {
      try {
        const raw = md.parse(text, { breaks: true, gfm: true });
        const safe = purify.sanitize(raw, { USE_PROFILES: { html: true } });
        div.innerHTML = '<div class="md">' + safe + '</div>';
        return;
      } catch (_) {
        /* Markdown parse failed — fall back to plain text */
      }
    }
    div.textContent = text;
  }

  /**
   * Parse the optional JSON textarea; returns `undefined` if empty.
   * Server expects a **plain object** (not array / string) when `user_context` is sent.
   * @returns {Record<string, unknown> | undefined}
   */
  function parseUserContextOrThrow() {
    if (!(contextTextarea instanceof HTMLTextAreaElement)) return undefined;
    const raw = contextTextarea.value.trim();
    if (!raw) return undefined;
    try {
      const v = JSON.parse(raw);
      if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        throw new Error('User context must be a JSON object (e.g. { "phone": "…" }), not an array or primitive.');
      }
      return v;
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error('User context must be valid JSON.');
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  // In-memory transcript mirrored to the server each send (simple demo; no pagination).
  const history = [];

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (input?.value || '').trim();
    if (!text) return;

    let userContext;
    try {
      userContext = parseUserContextOrThrow();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      return;
    }

    input.value = '';
    appendBubble('user', text);
    history.push({ role: 'user', content: text });
    setStatus('Thinking…');
    try {
      const body = { messages: history };
      if (userContext !== undefined) body.user_context = userContext;
      const r = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Server returns `{ error, message }` on failures; show `message` if present.
        appendBubble('assistant', j.message || 'Request failed (' + r.status + ').');
        setStatus('');
        return;
      }
      const reply = typeof j.reply === 'string' ? j.reply : '';
      history.push({ role: 'assistant', content: reply });
      appendBubble('assistant', reply || '(empty reply)');
      setStatus('');
    } catch (err) {
      appendBubble('assistant', err instanceof Error ? err.message : String(err));
      setStatus('');
    }
  });
})();
