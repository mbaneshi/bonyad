import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock, ModelProvider, ProviderEvent, ProviderRequest } from "./provider";

export type AnthropicOptions = {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens: number;
  /** Server-side refusal fallback (`fallbacks: "default"`); one flag, can be dropped. */
  refusalFallback: boolean;
  /** For API keys that are not scoped to a workspace: sent as `anthropic-workspace-id`. */
  workspaceId?: string | undefined;
  client?: Anthropic;
};

const JSON_RETRIES = 2;

/**
 * The real provider. Settings follow the Claude API reference for this model: adaptive
 * thinking with an explicit effort (the default is `medium`), `tool_choice: auto` (forced tool
 * use is rejected), strict tools with eager input streaming, and the server-side refusal
 * fallback. Thinking summaries are neither requested nor streamed.
 */
export class AnthropicProvider implements ModelProvider {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicOptions) {
    this.model = opts.model;
    // ANTHROPIC_API_KEY, or an `ant auth login` profile
    this.client =
      opts.client ??
      new Anthropic(opts.workspaceId ? { defaultHeaders: { "anthropic-workspace-id": opts.workspaceId } } : {});
  }

  async *stream(req: ProviderRequest, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    for (let attempt = 0; ; attempt++) {
      let streamedText = false;
      try {
        const stream = this.client.beta.messages.stream(
          {
            model: this.opts.model,
            max_tokens: this.opts.maxTokens,
            system: req.system,
            messages: req.messages as unknown as Anthropic.Beta.Messages.BetaMessageParam[],
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema as Anthropic.Beta.Messages.BetaTool.InputSchema,
              strict: true,
              eager_input_streaming: true,
            })),
            tool_choice: { type: "auto" },
            thinking: { type: "adaptive" },
            output_config: { effort: this.opts.effort },
            ...(this.opts.refusalFallback
              ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
              : {}),
          },
          { signal },
        );

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            streamedText = true;
            yield { type: "text_delta", text: event.delta.text };
          }
        }
        const message = await stream.finalMessage();
        yield {
          type: "final",
          content: message.content as unknown as ContentBlock[],
          stop_reason: String(message.stop_reason),
          ...(message.stop_details ? { stop_details: message.stop_details } : {}),
          usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
        };
        return;
      } catch (err) {
        // A tool input the SDK could not parse at all (eager streaming gives up server-side
        // validation). Re-issue only if nothing reached the client yet; API errors and
        // aborts are never retried here (the SDK has its own bounded transport retries).
        const isJsonFailure =
          !signal.aborted && !(err instanceof Anthropic.APIError) && err instanceof Error && err.name !== "AbortError";
        if (!isJsonFailure || streamedText || attempt >= JSON_RETRIES) throw err;
      }
    }
  }
}
