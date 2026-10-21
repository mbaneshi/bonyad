import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { ApiExecutor } from "../src/api";
import { FakeProvider, type Turn } from "../src/fake-provider";
import { runAgent, type AgentDeps } from "../src/loop";
import type { RunEvent } from "../src/events";
import { uuidV5 } from "../src/uuid";
import { clearProject, projectEntities, startEnv, type Env } from "./helpers";

setDefaultTimeout(60_000);

let env: Env;
const limits = { maxSteps: 12, maxToolCalls: 30, wallMs: 20_000 };

beforeAll(async () => {
  env = await startEnv();
});
afterAll(async () => {
  await env.teardown();
});
beforeEach(async () => {
  await clearProject(env.apiBase);
});

/** Counts what actually reaches the API, to prove what was (not) sent. */
function spy(inner: ApiExecutor): ApiExecutor & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    execute: (route, call, id, signal) => {
      calls.push(`${route.method} ${route.template}`);
      return inner.execute(route, call, id, signal);
    },
  };
}

async function run(provider: FakeProvider, message: string, opts: { conversationId?: string; limits?: typeof limits; api?: ApiExecutor; cancel?: AbortSignal } = {}) {
  const events: RunEvent[] = [];
  const deps: AgentDeps = { store: env.store, provider, api: opts.api ?? env.api, limits: opts.limits ?? limits };
  const outcome = await runAgent(
    deps,
    { runId: crypto.randomUUID(), message, ...(opts.conversationId ? { conversationId: opts.conversationId } : {}) },
    (e) => events.push(e),
    opts.cancel ?? new AbortController().signal,
  );
  return { outcome, events };
}

const A = { x: 0, y: 0 };
const B = { x: 4, y: 0 };
const C = { x: 0, y: 3 };
const lineId = uuidV5("toolu_line");
const surfaceId = uuidV5("toolu_surface");

/** Scenario 1, as a model would script it: inspect, create, measure, answer. */
const scenario1: Turn[] = [
  { tools: [{ name: "get_project_state", input: {}, id: "toolu_state" }] },
  {
    text: "Creating the geometry.",
    tools: [
      { name: "create_point", input: { x: 0, y: 0 }, id: "toolu_A" },
      { name: "create_point", input: { x: 4, y: 0 }, id: "toolu_B" },
      { name: "create_point", input: { x: 0, y: 3 }, id: "toolu_C" },
      { name: "create_line", input: { a: A, b: B }, id: "toolu_line" },
      { name: "create_surface", input: { vertices: [A, B, C] }, id: "toolu_surface" },
    ],
  },
  {
    tools: [
      { name: "measure_entity", input: { entity_id: lineId }, id: "toolu_m1" },
      { name: "measure_entity", input: { entity_id: surfaceId }, id: "toolu_m2" },
    ],
  },
  { text: "The line is 4 m long and the surface is 6 m²." },
];

/** The tool_result contents of the last user message a provider was asked to continue from. */
function lastResults(p: FakeProvider, request: number): any[] {
  const msgs = p.requests[request]!.messages;
  const last = msgs[msgs.length - 1]!;
  return (last.content as any[]).map((b) => ({ ...b, parsed: JSON.parse(b.content) }));
}

describe("scenario 1: create, measure, answer", () => {
  test("the entities exist and the model was handed 4 and 6 by the API", async () => {
    const provider = new FakeProvider(scenario1);
    const { outcome, events } = await run(provider, "Create points A(0,0), B(4,0), C(0,3), a line A-B and a triangular surface. Tell me the length and area.");

    expect(outcome.status).toBe("completed");
    const entities = await projectEntities(env.apiBase);
    expect(entities.map((e) => e.geometry.kind).sort()).toEqual(["line", "point", "point", "point", "surface"]);

    const measures = lastResults(provider, 3);
    expect(measures[0].parsed).toMatchObject({ kind: "line", length: 4, unit: "m" });
    expect(measures[1].parsed).toMatchObject({ kind: "surface", area: 6, area_unit: "m²" });

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("run_started");
    expect(types.at(-1)).toBe("run_completed");
    expect(types.filter((t) => t === "tool_started")).toHaveLength(8); // state + 5 creates + 2 measures
    expect(types.filter((t) => t === "tool_completed")).toHaveLength(8);
    // The events are in order and gapless.
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect((events.at(-1)!.data.committed as unknown[]).length).toBe(5);
  });

  test("scenario 2 in the same conversation: move the vertex, get 12 m², and it survives reload", async () => {
    const p1 = new FakeProvider(scenario1);
    const first = await run(p1, "scenario 1");
    const p2 = new FakeProvider([
      { tools: [{ name: "update_geometry", input: { entity_id: surfaceId, geometry: { kind: "surface", vertices: [A, { x: 8, y: 0 }, C] } }, id: "toolu_move" }] },
      { tools: [{ name: "measure_entity", input: { entity_id: surfaceId }, id: "toolu_m3" }] },
      { text: "The area is now 12 m²." },
    ]);
    const second = await run(p2, "Move B to (8,0) and recalculate.", { conversationId: first.outcome.conversationId });
    expect(second.outcome.status).toBe("completed");
    expect(lastResults(p2, 2)[0].parsed).toMatchObject({ kind: "surface", area: 12 });

    // The second run saw the first run's history, verbatim and in order.
    expect(p2.requests[0]!.messages.length).toBeGreaterThan(6);
    expect(p2.requests[0]!.messages[0]!.role).toBe("user");
    // Assistant turns come back as structured provider blocks, not as JSON text.
    const replayed = p2.requests[0]!.messages[1]!;
    expect(replayed.role).toBe("assistant");
    expect(Array.isArray(replayed.content)).toBe(true);
    expect((replayed.content as any[])[0].type).toBe("tool_use");

    // Reload: the conversation view still has both runs, their events and their final texts.
    const view = await env.store.conversationView(first.outcome.conversationId);
    expect(view!.runs.map((r) => r.status)).toEqual(["completed", "completed"]);
    expect(view!.messages.filter((m) => m.role === "assistant").at(-1)!.text).toBe("The area is now 12 m².");
    expect(view!.runs[1]!.events.some((e) => e.type === "tool_completed")).toBe(true);
    // And the drawing itself shows the moved vertex after a fresh read.
    const surface = (await projectEntities(env.apiBase)).find((e) => e.id === surfaceId);
    expect(surface.geometry.vertices[1]).toEqual({ x: 8, y: 0 });
  });
});

describe("a model response alone never changes state", () => {
  test("text that claims a change, with no tool call, writes nothing", async () => {
    const { outcome } = await run(new FakeProvider([{ text: "Done! I created a point at (1,1)." }]), "create a point");
    expect(outcome.status).toBe("completed");
    expect(await projectEntities(env.apiBase)).toHaveLength(0);
  });

  test("invalid tool arguments are rejected before any request reaches the API", async () => {
    const api = spy(env.api);
    const provider = new FakeProvider([
      { tools: [{ name: "create_point", input: { x: "one", y: 1 } }, { name: "no_such_tool", input: {} }, { name: "measure_entity", input: { entity_id: "../etc" } }] },
      { text: "I could not do that." },
    ]);
    const { outcome, events } = await run(provider, "bad call", { api });
    expect(outcome.status).toBe("completed");
    expect(api.calls).toEqual([]); // nothing left the service
    const results = lastResults(provider, 1);
    expect(results.every((r) => r.is_error)).toBe(true);
    expect(results[0].parsed.code).toBe("invalid_tool_input");
    expect(results[1].parsed.code).toBe("unknown_tool");
    expect(events.filter((e) => e.type === "tool_failed")).toHaveLength(3);
    expect(events.some((e) => e.type === "tool_started")).toBe(false);
  });

  test("an API 422 reaches the model as an error result and nothing is written", async () => {
    const bowTie = [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
    const provider = new FakeProvider([
      { tools: [{ name: "create_surface", input: { vertices: bowTie }, id: "toolu_bow" }, { name: "create_line", input: { a: A, b: A }, id: "toolu_zero" }] },
      { text: "Both were rejected." },
    ]);
    const { outcome, events } = await run(provider, "bow tie");
    expect(outcome.status).toBe("completed");
    const [surface, line] = lastResults(provider, 1);
    expect(surface.is_error).toBe(true);
    expect(surface.parsed.code).toBe("invalid_geometry");
    expect(surface.parsed.violations[0].code).toBe("self_intersecting_surface");
    expect(line.parsed.violations[0].code).toBe("zero_length_line");
    expect(await projectEntities(env.apiBase)).toHaveLength(0);
    expect((events.at(-1)!.data.committed as unknown[]).length).toBe(0);
  });

  test("the model can recover from an error and the retry lands", async () => {
    const provider = new FakeProvider([
      { tools: [{ name: "create_line", input: { a: A, b: A }, id: "toolu_try1" }] },
      { tools: [{ name: "create_line", input: { a: A, b: B }, id: "toolu_try2" }] },
      { text: "Fixed." },
    ]);
    const { outcome } = await run(provider, "line");
    expect(outcome.status).toBe("completed");
    expect(await projectEntities(env.apiBase)).toHaveLength(1);
  });
});

describe("idempotency", () => {
  test("a retried tool call (same tool_use id) creates no duplicate", async () => {
    const turns: Turn[] = [{ tools: [{ name: "create_point", input: { x: 2, y: 2 }, id: "toolu_same" }] }, { text: "ok" }];
    await run(new FakeProvider(turns), "once");
    await run(new FakeProvider(turns), "again"); // a new run replaying the same call id
    expect(await projectEntities(env.apiBase)).toHaveLength(1);
  });

  test("the same id with different content is refused, not silently replaced", async () => {
    await run(new FakeProvider([{ tools: [{ name: "create_point", input: { x: 2, y: 2 }, id: "toolu_clash" }] }, { text: "ok" }]), "first");
    const p = new FakeProvider([{ tools: [{ name: "create_point", input: { x: 9, y: 9 }, id: "toolu_clash" }] }, { text: "ok" }]);
    await run(p, "second");
    expect(lastResults(p, 1)[0].parsed.code).toBe("id_in_use");
    expect((await projectEntities(env.apiBase))[0].geometry).toMatchObject({ x: 2, y: 2 });
  });
});

describe("failure, cancel, limits", () => {
  test("provider failure after a mutation: run_failed lists what landed and state is valid", async () => {
    const provider = new FakeProvider([
      { tools: [{ name: "create_point", input: { x: 1, y: 1 }, id: "toolu_p" }] },
      { fail: Object.assign(new Error("upstream overloaded"), { status: 529 }) },
    ]);
    const { outcome, events } = await run(provider, "point then crash");
    expect(outcome.status).toBe("failed");
    const last = events.at(-1)!;
    expect(last.type).toBe("run_failed");
    expect(last.data).toMatchObject({ cause: "provider_error", status: 529, committed: [{ tool: "create_point" }] });
    expect(await projectEntities(env.apiBase)).toHaveLength(1);
    const view = await env.store.conversationView(outcome.conversationId);
    expect(view!.runs[0]!.status).toBe("failed");
  });

  test("cancel stops scheduling: later tool calls are skipped, the first lands, history stays valid", async () => {
    const ctl = new AbortController();
    const slow: ApiExecutor = {
      execute: async (route, call, id) => {
        ctl.abort(); // the user cancels while the first mutation is in flight
        return env.api.execute(route, call, id);
      },
    };
    const provider = new FakeProvider([
      { tools: [{ name: "create_point", input: { x: 1, y: 1 }, id: "toolu_c1" }, { name: "create_point", input: { x: 2, y: 2 }, id: "toolu_c2" }] },
    ]);
    const { outcome, events } = await run(provider, "two points", { api: slow, cancel: ctl.signal });
    expect(outcome.status).toBe("cancelled");
    expect(await projectEntities(env.apiBase)).toHaveLength(1); // the in-flight one finished; the next was never scheduled
    expect(events.at(-1)).toMatchObject({ type: "run_cancelled", data: { committed: [{ tool: "create_point" }] } });
    // Every tool_use has its tool_result, so the next run can continue this conversation.
    const next = new FakeProvider([{ text: "continuing" }]);
    const again = await run(next, "go on", { conversationId: outcome.conversationId });
    expect(again.outcome.status).toBe("completed");
    const roles = next.requests[0]!.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "user"]);
  });

  test("cancelling during the model stream ends the run without touching the API", async () => {
    const ctl = new AbortController();
    const api = spy(env.api);
    const provider = new FakeProvider([{ text: "thinking about it ", hang: true }]);
    const pending = run(provider, "slow", { api, cancel: ctl.signal });
    await Bun.sleep(100);
    ctl.abort();
    const { outcome } = await pending;
    expect(outcome.status).toBe("cancelled");
    expect(api.calls).toEqual([]);
  });

  test("the wall clock ends a stuck run as failed, not cancelled", async () => {
    const provider = new FakeProvider([{ hang: true }]);
    const { outcome, events } = await run(provider, "stuck", { limits: { ...limits, wallMs: 150 } });
    expect(outcome.status).toBe("failed");
    expect(events.at(-1)!.data.cause).toBe("limit_time");
  });

  test("the step limit stops a run that never finishes", async () => {
    const provider = new FakeProvider(() => ({ tools: [{ name: "get_project_state", input: {} }] }));
    const { outcome, events } = await run(provider, "loop", { limits: { ...limits, maxSteps: 3 } });
    expect(outcome.status).toBe("failed");
    expect(events.at(-1)!.data.cause).toBe("limit_steps");
    expect(provider.requests).toHaveLength(3);
  });

  test("the tool-call limit skips the rest, answers them, and fails the run", async () => {
    const tools = [1, 2, 3, 4].map((i) => ({ name: "create_point", input: { x: i, y: i }, id: `toolu_l${i}` }));
    const { outcome, events } = await run(new FakeProvider([{ tools }]), "many", { limits: { ...limits, maxToolCalls: 2 } });
    expect(outcome.status).toBe("failed");
    expect(events.at(-1)!.data.cause).toBe("limit_tool_calls");
    expect(await projectEntities(env.apiBase)).toHaveLength(2);
  });

  test("a refusal runs no tool, even one the model started", async () => {
    const api = spy(env.api);
    const provider = new FakeProvider([{ tools: [{ name: "create_point", input: { x: 1, y: 1 } }], stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms" } }]);
    const { outcome, events } = await run(provider, "refuse", { api });
    expect(outcome.status).toBe("failed");
    expect(events.at(-1)!.data).toMatchObject({ cause: "refusal", stop_details: { category: "general_harms" } });
    expect(api.calls).toEqual([]);
  });

  test("a turn cut off at max_tokens runs no tool either", async () => {
    const api = spy(env.api);
    const provider = new FakeProvider([{ tools: [{ name: "create_point", input: { x: 1 } }], stop_reason: "max_tokens" }]);
    const { outcome, events } = await run(provider, "long", { api });
    expect(outcome.status).toBe("failed");
    expect(events.at(-1)!.data.cause).toBe("max_tokens");
    expect(api.calls).toEqual([]);
  });

  test("an unknown conversation is refused before a run exists", async () => {
    await expect(run(new FakeProvider([{ text: "x" }]), "hi", { conversationId: crypto.randomUUID() })).rejects.toThrow();
  });
});

describe("selection context", () => {
  test("selected entity ids reach the model but the stored user text stays what the user typed", async () => {
    const provider = new FakeProvider([{ text: "ok" }]);
    const id = crypto.randomUUID();
    const events: RunEvent[] = [];
    const outcome = await runAgent({ store: env.store, provider, api: env.api, limits }, { runId: crypto.randomUUID(), message: "measure this", selection: [id] }, (e) => events.push(e), new AbortController().signal);
    expect(JSON.stringify(provider.requests[0]!.messages[0])).toContain(id);
    const view = await env.store.conversationView(outcome.conversationId);
    expect(view!.messages[0]!.text).toBe("measure this");
  });
});
