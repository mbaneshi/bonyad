import type { ContentBlock, ModelProvider, ProviderEvent, ProviderRequest } from "./provider";

/** One scripted model turn. */
export type Turn = {
  text?: string;
  tools?: { name: string; input: unknown; id?: string }[];
  /** Overrides the stop reason that the content implies. */
  stop_reason?: string;
  stop_details?: unknown;
  /** The provider throws after streaming `text`. */
  fail?: Error;
  /** Streams `text`, then waits until the run is aborted. */
  hang?: boolean;
};

/** Replays a script, one turn per request, and records every request it receives. */
export class FakeProvider implements ModelProvider {
  readonly model = "fake-model";
  readonly requests: ProviderRequest[] = [];
  private n = 0;

  constructor(private readonly script: Turn[] | ((req: ProviderRequest, index: number) => Turn)) {}

  async *stream(req: ProviderRequest, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    const index = this.n++;
    this.requests.push(structuredClone(req));
    const turn = typeof this.script === "function" ? this.script(req, index) : this.script[index];
    if (!turn) throw new Error(`FakeProvider script exhausted at request ${index}`);
    if (signal.aborted) throw abortError();

    for (const word of (turn.text ?? "").split(/(?<=\s)/).filter(Boolean)) {
      yield { type: "text_delta", text: word };
    }
    if (turn.fail) throw turn.fail;
    if (turn.hang) {
      await new Promise<never>((_, reject) => {
        if (signal.aborted) reject(abortError());
        signal.addEventListener("abort", () => reject(abortError()), { once: true });
      });
    }

    const content: ContentBlock[] = [];
    if (turn.text) content.push({ type: "text", text: turn.text });
    (turn.tools ?? []).forEach((t, i) =>
      content.push({ type: "tool_use", id: t.id ?? `toolu_fake_${index}_${i}`, name: t.name, input: t.input }),
    );
    yield {
      type: "final",
      content,
      stop_reason: turn.stop_reason ?? ((turn.tools?.length ?? 0) > 0 ? "tool_use" : "end_turn"),
      ...(turn.stop_details !== undefined ? { stop_details: turn.stop_details } : {}),
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  }
}

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}
