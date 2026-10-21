import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { FakeProvider, type Turn } from "../src/fake-provider";
import { createHandler } from "../src/server";
import { clearProject, projectEntities, readSse, startEnv, type Env } from "./helpers";

setDefaultTimeout(60_000);

let env: Env;
beforeAll(async () => {
  env = await startEnv();
});
afterAll(async () => {
  await env.teardown();
});
beforeEach(async () => {
  await clearProject(env.apiBase);
});

const limits = { maxSteps: 12, maxToolCalls: 30, wallMs: 20_000 };
const handlerFor = (script: Turn[]) => createHandler({ store: env.store, provider: new FakeProvider(script), api: env.api, limits });
const post = (path: string, body: unknown) =>
  new Request(`http://agent${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /agent/runs (SSE)", () => {
  test("streams run_started, text deltas, tool progress and run_completed, in order", async () => {
    const h = handlerFor([
      { text: "Adding a point. ", tools: [{ name: "create_point", input: { x: 1, y: 1 }, id: "toolu_s1" }] },
      { text: "Done." },
    ]);
    const res = await h.fetch(post("/agent/runs", { message: "add a point" }));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("x-run-id")).toMatch(/^[0-9a-f-]{36}$/);
    const events = await readSse(res);
    const types = events.map((e) => e.event);
    expect(types[0]).toBe("run_started");
    expect(types).toContain("text_delta");
    expect(types).toContain("tool_started");
    expect(types).toContain("tool_completed");
    expect(types.at(-1)).toBe("run_completed");
    expect(events.every((e) => e.data.run_id === res.headers.get("x-run-id"))).toBe(true);
    expect(events.map((e) => e.data.seq)).toEqual(events.map((_, i) => i + 1));
    expect(await projectEntities(env.apiBase)).toHaveLength(1);
  });

  test("rejects bad requests before any run exists", async () => {
    const h = handlerFor([]);
    for (const body of [{}, { message: "" }, { message: "x", extra: 1 }, { message: "x", conversation_id: "nope" }, { message: "x", selection: ["nope"] }]) {
      const res = await h.fetch(post("/agent/runs", body));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_request");
    }
    const notJson = await h.fetch(new Request("http://agent/agent/runs", { method: "POST", body: "{" }));
    expect(notJson.status).toBe(400);
    const unknown = await h.fetch(post("/agent/runs", { message: "x", conversation_id: crypto.randomUUID() }));
    expect(unknown.status).toBe(404);
  });

  test("POST /agent/runs/{id}/cancel stops a running run and reports run_cancelled", async () => {
    const h = handlerFor([{ text: "working ", hang: true }]);
    const res = await h.fetch(post("/agent/runs", { message: "slow" }));
    const runId = res.headers.get("x-run-id")!;
    await Bun.sleep(100);
    const cancel = await h.fetch(post(`/agent/runs/${runId}/cancel`, {}));
    expect(cancel.status).toBe(202);
    const events = await readSse(res);
    expect(events.at(-1)!.event).toBe("run_cancelled");
    expect(h.active.size).toBe(0);
    expect((await h.fetch(post(`/agent/runs/${runId}/cancel`, {}))).status).toBe(404);
  });

  test("a client that disconnects cancels the run", async () => {
    const h = handlerFor([{ text: "working ", hang: true }]);
    const res = await h.fetch(post("/agent/runs", { message: "slow" }));
    const runId = res.headers.get("x-run-id")!;
    const reader = res.body!.getReader();
    await reader.read(); // run_started
    await reader.cancel(); // the browser went away
    for (let i = 0; i < 50 && h.active.size > 0; i++) await Bun.sleep(50);
    expect(h.active.size).toBe(0);
    const events = await env.store.eventsAfter(runId, 0);
    expect(events.at(-1)!.type).toBe("run_cancelled");
  });
});

describe("history endpoints", () => {
  test("events can be replayed after a sequence number, and the conversation reloads", async () => {
    const h = handlerFor([{ tools: [{ name: "create_point", input: { x: 3, y: 3 }, id: "toolu_h1" }] }, { text: "Created." }]);
    const res = await h.fetch(post("/agent/runs", { message: "make a point" }));
    const runId = res.headers.get("x-run-id")!;
    const streamed = await readSse(res);

    const all = (await (await h.fetch(new Request(`http://agent/agent/runs/${runId}/events`))).json()) as any;
    const persisted = streamed.filter((e) => e.event !== "text_delta").map((e) => e.event);
    expect(all.events.map((e: any) => e.type)).toEqual(persisted);

    const tail = (await (await h.fetch(new Request(`http://agent/agent/runs/${runId}/events?after=${all.events[1].seq}`))).json()) as any;
    expect(tail.events.length).toBe(all.events.length - 2);

    const latest = (await (await h.fetch(new Request("http://agent/agent/conversations/latest"))).json()) as any;
    expect(latest.runs[0].id).toBe(runId);
    expect(latest.runs[0].status).toBe("completed");
    expect(latest.messages.at(-1)).toMatchObject({ role: "assistant", text: "Created." });
    expect(latest.runs[0].committed).toHaveLength(1);
  });

  test("latest on an empty database is an empty conversation, not an error", async () => {
    await env.store.sql`delete from agent.conversations`;
    const res = await handlerFor([]).fetch(new Request("http://agent/agent/conversations/latest"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversation_id: null, messages: [], runs: [] });
  });

  test("unknown ids are a 404, not a 500", async () => {
    const h = handlerFor([]);
    for (const path of ["/agent/runs/not-a-uuid/events", `/agent/runs/${crypto.randomUUID()}/events`, `/agent/conversations/${crypto.randomUUID()}`, "/nope"]) {
      expect((await h.fetch(new Request(`http://agent${path}`))).status).toBe(404);
    }
  });

  test("healthz reports the database", async () => {
    const res = await handlerFor([]).fetch(new Request("http://agent/healthz"));
    expect(await res.json()).toMatchObject({ status: "ok", database: "ok" });
  });
});

describe("startup recovery", () => {
  test("runs left running by a crash are marked failed", async () => {
    const id = crypto.randomUUID();
    const conv = crypto.randomUUID();
    await env.store.createConversation(conv);
    await env.store.createRun({ id, conversationId: conv, model: "m", task: "t", limits });
    await env.store.failOrphanedRuns();
    const view = await env.store.conversationView(conv);
    expect(view!.runs[0]).toMatchObject({ status: "failed" });
  });
});
