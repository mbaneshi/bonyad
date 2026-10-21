import type { ApiExecutor, ApiOutcome } from "./api";
import type { Limits } from "./config";
import type { Committed, FailureCause, RunEvent, RunEventType } from "./events";
import { textOf, toolUsesOf, type ContentBlock, type ModelProvider, type ProviderEvent, type ProviderMessage, type ToolUse, type Usage } from "./provider";
import type { Store } from "./store";
import { TOOL_BY_NAME, toolDefinitions } from "./tools";

export const SYSTEM_PROMPT = `You edit a small 2D engineering drawing through tools. Coordinates are Cartesian, in metres.

- Every change goes through a tool. Describing a change does not make it; only a tool call the API accepts does.
- Never compute lengths or areas yourself: call measure_entity and report what it returns, with units.
- Entities are referenced by the id a tool returned. If you do not know an id, call get_project_state.
- A line owns its two endpoints and a surface owns its vertices; equal coordinates elsewhere imply no connection.
- A surface lists each corner once (A, B, C); the closing edge is implied.
- When a tool reports an error, read it, fix the arguments, and try again, or tell the user plainly what cannot be done. Do not claim success for a call that failed.
- Answer in the language the user wrote in. Keep answers short.`;

export type AgentDeps = {
  store: Store;
  provider: ModelProvider;
  api: ApiExecutor;
  limits: Limits;
};

export type RunInput = {
  runId: string;
  /** Continue this conversation; omitted starts a new one. */
  conversationId?: string;
  message: string;
  /** Entity ids the user has selected in the drawing. */
  selection?: string[];
};

export type RunOutcome = { runId: string; conversationId: string; status: "completed" | "failed" | "cancelled" };

export class ConversationNotFound extends Error {}

type Final = Extract<ProviderEvent, { type: "final" }>;
type ToolResult = { tool_use_id: string; content: string; is_error: boolean };

/**
 * One run: model step, validated tool calls, repeat, within hard limits. A model response
 * alone never changes state. Every outcome (done, failed, cancelled) is recorded with what
 * had already landed, and history always stays valid for the next run.
 */
export async function runAgent(
  deps: AgentDeps,
  input: RunInput,
  sink: (e: RunEvent) => void,
  cancel: AbortSignal,
): Promise<RunOutcome> {
  const { store, provider, api, limits } = deps;

  const conversationId = input.conversationId ?? crypto.randomUUID();
  if (input.conversationId) {
    if (!(await store.conversationExists(conversationId))) throw new ConversationNotFound(conversationId);
  } else {
    await store.createConversation(conversationId);
  }
  const { messages: history, nextSeq } = await store.history(conversationId);
  let msgSeq = nextSeq;

  const addMessage = async (role: "user" | "assistant", text: string | null, content: string | ContentBlock[]) => {
    await store.appendMessage(conversationId, msgSeq++, role, text, content);
    history.push({ role, content } satisfies ProviderMessage);
  };

  const providerText = input.selection?.length
    ? `${input.message}\n\n(The user has these entities selected: ${input.selection.join(", ")})`
    : input.message;
  await addMessage("user", input.message, providerText);

  await store.createRun({ id: input.runId, conversationId, model: provider.model, task: input.message, limits });

  let seq = 0;
  const emit = async (type: RunEventType, data: Record<string, unknown>) => {
    const event: RunEvent = { run_id: input.runId, seq: ++seq, type, data };
    if (type !== "text_delta") await store.appendEvent(event); // deltas are stream-only
    try {
      sink(event);
    } catch {
      // a client that went away must not stop the run
    }
  };

  const timeout = AbortSignal.timeout(limits.wallMs);
  const signal = AbortSignal.any([cancel, timeout]);
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  const committed: Committed[] = [];
  let steps = 0;
  let toolCalls = 0;

  const done = async (status: RunOutcome["status"], type: RunEventType, data: Record<string, unknown>, error?: unknown) => {
    await store.finishRun(input.runId, status, { usage, committed, ...(error !== undefined ? { error } : {}) });
    await emit(type, { ...data, usage, committed });
    return { runId: input.runId, conversationId, status };
  };
  const fail = (cause: FailureCause, message: string, extra: Record<string, unknown> = {}) =>
    done("failed", "run_failed", { cause, message, ...extra }, { cause, message, ...extra });
  const stopped = () =>
    timeout.aborted
      ? fail("limit_time", `the run exceeded its ${limits.wallMs / 1000}s time limit`)
      : done("cancelled", "run_cancelled", {});

  await emit("run_started", { task: input.message, conversation_id: conversationId, model: provider.model });

  const runTool = async (use: ToolUse): Promise<ToolResult> => {
    const result = (body: unknown, is_error: boolean): ToolResult => ({
      tool_use_id: use.id,
      content: JSON.stringify(body),
      is_error,
    });
    const spec = TOOL_BY_NAME.get(use.name);
    if (!spec) {
      const error = { code: "unknown_tool", detail: `there is no tool named ${use.name}` };
      await emit("tool_failed", { tool_use_id: use.id, name: use.name, error });
      return result(error, true);
    }
    const parsed = spec.schema.safeParse(use.input);
    if (!parsed.success) {
      // Rejected before any request leaves this service.
      const error = {
        code: "invalid_tool_input",
        detail: "the arguments do not match the tool's schema",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
      await emit("tool_failed", { tool_use_id: use.id, name: use.name, error });
      return result(error, true);
    }
    await emit("tool_started", { tool_use_id: use.id, name: use.name, input: parsed.data });
    const call = spec.build(parsed.data, use.id);
    // Deliberately not tied to the abort signal: a mutation already in flight finishes
    // (it is atomic in the API) and is recorded.
    const out: ApiOutcome = await api.execute(spec.route, call, crypto.randomUUID());
    if (!out.ok) {
      await emit("tool_failed", {
        tool_use_id: use.id,
        name: use.name,
        status: out.status,
        request_id: out.requestId,
        error: out.body,
      });
      return result(out.body, true);
    }
    if (spec.kind === "mutation") {
      const id = spec.route.method === "DELETE" ? call.params.id : (out.body as { id?: string }).id;
      if (id) committed.push({ tool: spec.name, entity_id: id });
    }
    await emit("tool_completed", {
      tool_use_id: use.id,
      name: use.name,
      status: out.status,
      request_id: out.requestId,
      result: out.body,
    });
    return result(out.body, false);
  };

  const answer = async (results: ToolResult[]) =>
    addMessage(
      "user",
      null,
      results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.tool_use_id,
        content: r.content,
        ...(r.is_error ? { is_error: true } : {}),
      })),
    );
  const skipAll = (uses: ToolUse[], reason: string): ToolResult[] =>
    uses.map((u) => ({ tool_use_id: u.id, content: JSON.stringify({ code: "not_executed", detail: reason }), is_error: true }));

  try {
    for (;;) {
      if (signal.aborted) return await stopped();
      if (steps >= limits.maxSteps) return await fail("limit_steps", `the run used all ${limits.maxSteps} model steps`);
      steps++;

      let final: Final | undefined;
      try {
        for await (const ev of provider.stream({ system: SYSTEM_PROMPT, messages: history, tools: toolDefinitions() }, signal)) {
          if (ev.type === "text_delta") await emit("text_delta", { text: ev.text });
          else final = ev;
        }
      } catch (err) {
        if (signal.aborted) return await stopped();
        const status = (err as { status?: number }).status;
        return await fail("provider_error", err instanceof Error ? err.message : String(err), status !== undefined ? { status } : {});
      }
      if (!final) return await fail("provider_error", "the provider ended without a final message");
      usage.input_tokens += final.usage.input_tokens;
      usage.output_tokens += final.usage.output_tokens;

      const text = textOf(final.content);
      const uses = toolUsesOf(final.content);
      // Stored verbatim and append-only, so it replays unchanged.
      await addMessage("assistant", text || null, final.content);
      if (text) await emit("assistant_message", { text });

      // Check the stop reason before running any tool: a refusal or a truncation can cut a
      // tool_use off mid-input.
      if (final.stop_reason === "refusal" || final.stop_reason === "max_tokens") {
        if (uses.length > 0) await answer(skipAll(uses, `the model turn ended with ${final.stop_reason}`));
        return final.stop_reason === "refusal"
          ? await fail("refusal", "the model declined this request", { stop_details: final.stop_details ?? null })
          : await fail("max_tokens", "the model's answer was cut off at the output limit");
      }
      if (uses.length === 0) return await done("completed", "run_completed", {});

      const results: ToolResult[] = [];
      let limitHit = false;
      for (const use of uses) {
        if (signal.aborted) {
          results.push(...skipAll([use], timeout.aborted ? "the run hit its time limit" : "the run was cancelled"));
        } else if (toolCalls >= limits.maxToolCalls) {
          limitHit = true;
          results.push(...skipAll([use], `the run reached its limit of ${limits.maxToolCalls} tool calls`));
        } else {
          toolCalls++;
          results.push(await runTool(use));
        }
      }
      await answer(results);
      if (signal.aborted) return await stopped();
      if (limitHit) return await fail("limit_tool_calls", `the run reached its limit of ${limits.maxToolCalls} tool calls`);
    }
  } catch (err) {
    if (signal.aborted) return await stopped();
    return await fail("internal", err instanceof Error ? err.message : String(err));
  }
}
