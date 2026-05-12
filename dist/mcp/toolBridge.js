/** Map each MCP tool from `tools/list` into OpenAI’s `tools[]` entry for `chat.completions.create`. */
export function mcpToolsToOpenAi(tools) {
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
function mcpInputSchemaToJsonSchema(inputSchema) {
    const s = inputSchema;
    if (s && typeof s === 'object' && s.type === 'object') {
        return s;
    }
    return { type: 'object', properties: {} };
}
/**
 * Turn an MCP `callTool` result into one string for the model.
 *
 * Why this exists: SDK / server versions may return rich content blocks (`content: [{ type: 'text', text }]`),
 * or legacy shapes (`toolResult`). We flatten to text the model can read in the next completion turn.
 */
export function stringifyToolResult(result) {
    const content = result.content;
    if (Array.isArray(content) && content.length) {
        const parts = [];
        for (const block of content) {
            if (block && block.type === 'text' && typeof block.text === 'string') {
                parts.push(block.text);
            }
            else {
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
//# sourceMappingURL=toolBridge.js.map