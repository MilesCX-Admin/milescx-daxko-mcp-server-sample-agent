/**
 * Chat HTTP API — the “agent” loop for this sample.
 *
 * Flow (high level):
 * 1. Browser sends conversation turns + optional `user_context` JSON (see `public/js/chat-ui.js`).
 * 2. This handler validates input (sizes, shapes) so MCP / OpenAI never see unbounded payloads.
 * 3. We call MCP `tools/list` and convert tools to OpenAI format (`toolBridge.ts`).
 * 4. We call OpenAI `chat.completions.create` with `tools` enabled. If the model returns `tool_calls`,
 *    we execute each via MCP `tools/call`, append `role: "tool"` messages, and ask OpenAI again — up to
 *    `MAX_TOOL_ROUNDS` times (safety cap for runaway loops).
 * 5. Final assistant text is returned as JSON `{ reply: string }`.
 *
 * Secrets: `OPENAI_API_KEY` and OAuth agent credentials (`CLIENT_SECRET`, optional `BOOTSTRAP_TOKEN`) are read from
 * `env` only; they never appear in responses. MCP calls use `Authorization: Bearer <access_token>` from
 * `client_credentials` (same Auth service as `npm run oauth-agent`; see `src/mcp/oauthAccessToken.ts`).
 */
import { Router } from 'express';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { mcpCallTool, mcpListTools } from '../mcp/mcpClient.js';
import { getMcpOAuthAccessToken } from '../mcp/oauthAccessToken.js';
import { mcpToolsToOpenAi, stringifyToolResult } from '../mcp/toolBridge.js';
// --- Limits (demo guardrails; tune for your product) ---
const MAX_USER_MESSAGE_CHARS = 8000;
const MAX_MESSAGES = 24;
/** Stops infinite tool ping-pong if the model keeps requesting tools without finishing. */
const MAX_TOOL_ROUNDS = 8;
/** Optional client-supplied JSON (“user context”) is turned into a system message; cap its serialized size. */
const MAX_USER_CONTEXT_JSON_CHARS = 12_000;
export const chatRouter = Router();
const openai = new OpenAI({ apiKey: env.openaiApiKey });
chatRouter.post('/chat', async (req, res) => {
    const raw = req.body;
    // --- Validate `messages` ---
    // We only accept roles we forward to OpenAI; unknown roles are dropped rather than rejected (lenient demo).
    const messages = (raw.messages ?? []).filter((m) => m &&
        typeof m.content === 'string' &&
        (m.role === 'user' || m.role === 'assistant' || m.role === 'system'));
    if (!messages.length) {
        res.status(400).json({ error: 'validation_error', message: 'messages array required' });
        return;
    }
    if (messages.length > MAX_MESSAGES) {
        res.status(400).json({ error: 'validation_error', message: 'Too many messages' });
        return;
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser && lastUser.content.length > MAX_USER_MESSAGE_CHARS) {
        res.status(400).json({ error: 'validation_error', message: 'Message too long' });
        return;
    }
    // --- Optional `user_context`: stable facts for the model (e.g. phone, member id) ---
    // Not authenticated here — this sample trusts same-origin demo traffic. In a real app you’d bind context to a session.
    let userContextSystem = null;
    if (raw.user_context !== undefined && raw.user_context !== null) {
        if (typeof raw.user_context !== 'object' || Array.isArray(raw.user_context)) {
            res.status(400).json({
                error: 'validation_error',
                message: 'user_context must be a JSON object when provided.',
            });
            return;
        }
        let serialized;
        try {
            serialized = JSON.stringify(raw.user_context);
        }
        catch {
            res.status(400).json({ error: 'validation_error', message: 'user_context could not be serialized.' });
            return;
        }
        if (serialized.length > MAX_USER_CONTEXT_JSON_CHARS) {
            res.status(400).json({
                error: 'validation_error',
                message: `user_context exceeds ${MAX_USER_CONTEXT_JSON_CHARS} characters.`,
            });
            return;
        }
        // Second system message: instructs the model to prefer these values for tool args when relevant.
        userContextSystem =
            'The following JSON describes stable facts about the end user (from their client). Prefer these values when choosing arguments for MCP tools when relevant. Do not invent values that are not present here.\n\n' +
                serialized;
    }
    try {
        const bearer = await getMcpOAuthAccessToken();
        // Fresh tool list every request so new MCP deployments show up without restarting this app.
        const list = await mcpListTools(bearer);
        const oaTools = mcpToolsToOpenAi(list.tools ?? []);
        // Build OpenAI message array: system prompt, optional user-context system block, then chat history.
        const oaMessages = [
            {
                role: 'system',
                content: 'You are a helpful assistant with access to MCP tools exposed by the connected server. Use tools when they help answer the user. Be concise and accurate.',
            },
            ...(userContextSystem
                ? [{ role: 'system', content: userContextSystem }]
                : []),
            ...messages.map((m) => ({ role: m.role, content: m.content })),
        ];
        let lastAssistantText = '';
        let rounds = 0;
        // --- Tool loop: each iteration is one OpenAI completion; tool calls extend the conversation in-place. ---
        while (rounds < MAX_TOOL_ROUNDS) {
            rounds += 1;
            const completion = await openai.chat.completions.create({
                model: env.openaiModel,
                messages: oaMessages,
                // If MCP returned no tools, omit `tools` entirely so the model cannot tool-call.
                tools: oaTools.length ? oaTools : undefined,
                tool_choice: oaTools.length ? 'auto' : undefined,
            });
            const msg = completion.choices[0]?.message;
            if (!msg)
                break;
            // Important: push the assistant message *including* `tool_calls` so the next completion has full context.
            oaMessages.push(msg);
            const toolCalls = msg.tool_calls;
            if (!toolCalls?.length) {
                lastAssistantText = msg.content ?? '';
                break;
            }
            for (const tc of toolCalls) {
                if (tc.type !== 'function')
                    continue;
                const name = tc.function.name;
                let args = {};
                try {
                    args = JSON.parse(tc.function.arguments || '{}');
                }
                catch {
                    // Model occasionally emits invalid JSON; empty object avoids throwing and lets the tool fail gracefully.
                    args = {};
                }
                const result = await mcpCallTool(bearer, name, args);
                const toolText = stringifyToolResult(result);
                // OpenAI requires each tool result tied to the originating `tool_call_id`.
                oaMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: toolText,
                });
            }
            // Loop: next `chat.completions.create` sees tool outputs and either answers in text or calls more tools.
        }
        res.json({ reply: lastAssistantText });
    }
    catch (e) {
        // Single catch-all for MCP + OpenAI errors — good enough for a demo; a product might classify status codes.
        const message = e instanceof Error ? e.message : String(e);
        res.status(502).json({ error: 'upstream_error', message });
    }
});
//# sourceMappingURL=chatRoute.js.map