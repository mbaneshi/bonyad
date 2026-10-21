import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "bun:test";
import { AnthropicProvider } from "../src/anthropic-provider";
import type { ProviderEvent, ProviderRequest } from "../src/provider";
import { toolDefinitions } from "../src/tools";

/** A stand-in for the SDK client: records the request and replays a scripted stream. */
function stubClient(attempts: (() => { events?: unknown[]; message?: unknown; throws?: Error })[]) {
  const params: any[] = [];
  const client = {
    beta: {
      messages: {
        stream: (p: unknown) => {
          params.push(p);
          const a = attempts[params.length - 1]!();
          return {
            async *[Symbol.asyncIterator]() {
              for (const e of a.events ?? []) yield e;
              if (a.throws) throw a.throws;
            },
            finalMessage: async () => a.message,
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, params };
}

const request: ProviderRequest = { system: "sys", messages: [{ role: "user", content: "hi" }], tools: toolDefinitions() };
const message = {
  content: [{ type: "text", text: "hello" }, { type: "tool_use", id: "toolu_1", name: "get_project_state", input: {} }],
  stop_reason: "tool_use",
  usage: { input_tokens: 11, output_tokens: 7 },
};
const textDelta = (text: string) => ({ type: "content_block_delta", delta: { type: "text_delta", text } });

async function collect(p: AnthropicProvider, signal = new AbortController().signal) {
  const out: ProviderEvent[] = [];
  for await (const e of p.stream(request, signal)) out.push(e);
  return out;
}

const opts = { model: "claude-opus-5-5", effort: "medium", maxTokens: 16000, refusalFallback: true } as const;

describe("AnthropicProvider request", () => {
  test("uses the settings the Claude API reference prescribes for this model", async () => {
    const { client, params } = stubClient([() => ({ events: [textDelta("hel"), textDelta("lo")], message })]);
    await collect(new AnthropicProvider({ ...opts, client }));
    const p = params[0];
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.thinking).toEqual({ type: "adaptive" }); // no budget_tokens, no display: summaries are not requested
    expect(p.output_config).toEqual({ effort: "medium" });
    expect(p.tool_choice).toEqual({ type: "auto" }); // forced tool use is rejected by this model
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.fallbacks).toBe("default");
    expect(p.tools).toHaveLength(7);
    for (const t of p.tools) {
      expect(t.strict).toBe(true);
      expect(t.eager_input_streaming).toBe(true);
    }
    expect(p.temperature).toBeUndefined(); // sampling parameters are rejected on this model
    expect(p.system).toBe("sys");
  });

  test("the refusal fallback is a single switch", async () => {
    const { client, params } = stubClient([() => ({ message })]);
    await collect(new AnthropicProvider({ ...opts, refusalFallback: false, client }));
    expect(params[0].fallbacks).toBeUndefined();
    expect(params[0].betas).toBeUndefined();
  });
});

describe("AnthropicProvider stream", () => {
  test("yields text deltas then the final message, with content stored verbatim", async () => {
    const { client } = stubClient([() => ({ events: [textDelta("hel"), { type: "message_start" }, textDelta("lo")], message })]);
    const events = await collect(new AnthropicProvider({ ...opts, client }));
    expect(events.map((e) => e.type)).toEqual(["text_delta", "text_delta", "final"]);
    const final = events.at(-1) as Extract<ProviderEvent, { type: "final" }>;
    expect(final.content).toBe(message.content as any); // same blocks, untouched
    expect(final.stop_reason).toBe("tool_use");
    expect(final.usage).toEqual({ input_tokens: 11, output_tokens: 7 });
  });

  test("carries refusal details through", async () => {
    const refusal = { ...message, stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" } };
    const { client } = stubClient([() => ({ message: refusal })]);
    const events = await collect(new AnthropicProvider({ ...opts, client }));
    expect(events.at(-1)).toMatchObject({ stop_reason: "refusal", stop_details: { category: "cyber" } });
  });

  test("re-issues a turn whose tool input could not be parsed, only before anything was streamed", async () => {
    const { client, params } = stubClient([() => ({ throws: new Error("bad partial json") }), () => ({ message })]);
    const events = await collect(new AnthropicProvider({ ...opts, client }));
    expect(params).toHaveLength(2);
    expect(events.at(-1)!.type).toBe("final");
  });

  test("does not re-issue once text reached the client (it would duplicate)", async () => {
    const { client, params } = stubClient([() => ({ events: [textDelta("hi")], throws: new Error("bad partial json") })]);
    await expect(collect(new AnthropicProvider({ ...opts, client }))).rejects.toThrow("bad partial json");
    expect(params).toHaveLength(1);
  });

  test("gives up after bounded retries", async () => {
    const { client, params } = stubClient([() => ({ throws: new Error("x") }), () => ({ throws: new Error("x") }), () => ({ throws: new Error("x") })]);
    await expect(collect(new AnthropicProvider({ ...opts, client }))).rejects.toThrow("x");
    expect(params).toHaveLength(3);
  });

  test("never retries API errors", async () => {
    const api = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } } as any, "slow down", new Headers());
    const { client, params } = stubClient([() => ({ throws: api })]);
    await expect(collect(new AnthropicProvider({ ...opts, client }))).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    expect(params).toHaveLength(1);
  });

  test("an abort is not retried", async () => {
    const ctl = new AbortController();
    ctl.abort();
    const { client, params } = stubClient([() => ({ throws: Object.assign(new Error("aborted"), { name: "AbortError" }) })]);
    await expect(collect(new AnthropicProvider({ ...opts, client }), ctl.signal)).rejects.toThrow();
    expect(params).toHaveLength(1);
  });
});

describe("AnthropicProvider workspace header", () => {
  async function headersSent(workspaceId?: string) {
    let seen: Headers | undefined;
    const client = new Anthropic({
      apiKey: "test-key",
      maxRetries: 0,
      fetch: (async (_url: unknown, init?: RequestInit) => {
        seen = new Headers(init?.headers);
        return new Response("{}", { status: 400 }); // enough: only the request headers matter
      }) as unknown as typeof fetch,
    });
    // The provider builds its own client when none is injected; exercise that path via a fetch override.
    const provider = new AnthropicProvider({ ...opts, workspaceId });
    const inner = (provider as any).client as Anthropic;
    (inner as any).fetch = (client as any).fetch;
    try {
      for await (const _ of provider.stream(request, new AbortController().signal)) void _;
    } catch {
      /* the stub answers 400 */
    }
    return seen;
  }

  test("is sent when configured and absent otherwise", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const withId = await headersSent("wrkspc_test");
    expect(withId?.get("anthropic-workspace-id")).toBe("wrkspc_test");
    const without = await headersSent(undefined);
    expect(without?.get("anthropic-workspace-id")).toBeNull();
  });
});
