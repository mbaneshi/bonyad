/**
 * The only seam between the loop and a model. Content blocks are opaque provider blocks:
 * the loop stores them verbatim and replays them unchanged, and only reads `text` and
 * `tool_use` blocks. Nothing outside the adapters knows the Anthropic message shapes.
 */
export type ContentBlock = { type: string } & Record<string, unknown>;
export type ProviderMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };
export type ToolDefinition = { name: string; description: string; input_schema: Record<string, unknown> };
export type Usage = { input_tokens: number; output_tokens: number };

export type ProviderRequest = {
  system: string;
  messages: ProviderMessage[];
  tools: ToolDefinition[];
};

export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | {
      type: "final";
      content: ContentBlock[];
      stop_reason: string;
      /** Present when `stop_reason` is `refusal`. */
      stop_details?: unknown;
      usage: Usage;
    };

export interface ModelProvider {
  readonly model: string;
  stream(req: ProviderRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}

export function textOf(content: ContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => String(b.text ?? ""))
    .join("");
}

export type ToolUse = { id: string; name: string; input: unknown };

export function toolUsesOf(content: ContentBlock[]): ToolUse[] {
  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: String(b.id), name: String(b.name), input: b.input }));
}
