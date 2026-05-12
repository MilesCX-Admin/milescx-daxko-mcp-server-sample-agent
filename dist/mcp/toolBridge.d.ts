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
export declare function mcpToolsToOpenAi(tools: Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[];
/**
 * Turn an MCP `callTool` result into one string for the model.
 *
 * Why this exists: SDK / server versions may return rich content blocks (`content: [{ type: 'text', text }]`),
 * or legacy shapes (`toolResult`). We flatten to text the model can read in the next completion turn.
 */
export declare function stringifyToolResult(result: {
    content?: unknown;
    toolResult?: unknown;
}): string;
