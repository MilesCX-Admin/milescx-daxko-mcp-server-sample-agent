/**
 * Bridge between MCP tool metadata/results and the OpenAI Chat Completions API.
 *
 * OpenAI expects:
 * - Tool definitions: `{ type: 'function', function: { name, description, parameters } }`
 *   where `parameters` is a JSON Schema object.
 * - Tool outputs on the conversation: `{ role: 'tool', tool_call_id, content }` with `content` as a string.
 *
 * MCP’s `listTools` response is close but not identical; this module adapts both directions.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type OpenAI from 'openai';

/** Map each MCP tool from `tools/list` into OpenAI’s `tools[]` entry for `chat.completions.create`. */
export function mcpToolsToOpenAi(tools: Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? `MCP tool ${t.name}`,
      parameters: mcpInputSchemaToJsonSchema(t.inputSchema),
    },
  }));
}

/**
 * MCP advertises arguments via `inputSchema` (typically `type: "object"` with `properties` / `required`).
 * OpenAI needs that object as-is for `function.parameters`. If a tool omits a proper object schema,
 * we fall back to `{ type: 'object', properties: {} }` so the API still accepts the definition.
 */
function mcpInputSchemaToJsonSchema(inputSchema: Tool['inputSchema']): Record<string, unknown> {
  const s = inputSchema as Record<string, unknown>;
  if (s && typeof s === 'object' && s.type === 'object') {
    return s as Record<string, unknown>;
  }
  return { type: 'object', properties: {} };
}

/**
 * Turn an MCP `callTool` result into one string for the model.
 *
 * Why this exists: SDK / server versions may return rich content blocks (`content: [{ type: 'text', text }]`),
 * or legacy shapes (`toolResult`). We flatten to text the model can read in the next completion turn.
 */
export function stringifyToolResult(result: { content?: unknown; toolResult?: unknown }): string {
  const content = result.content;
  if (Array.isArray(content) && content.length) {
    const parts: string[] = [];
    for (const block of content as { type?: string; text?: string }[]) {
      if (block && block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      } else {
        // Non-text blocks (e.g. images): stringify so the model still sees something.
        parts.push(JSON.stringify(block));
      }
    }
    return parts.join('\n') || '(empty tool result)';
  }
  if (result.toolResult !== undefined) {
    return typeof result.toolResult === 'string' ? result.toolResult : JSON.stringify(result.toolResult);
  }
  return '(empty tool result)';
}
