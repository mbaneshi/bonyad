import { parseSse } from "./client";
import { applyEvent, newTurn, turnFromRun, type AgentEvent } from "./events";

const ev = (type: AgentEvent["type"], data: Record<string, unknown> = {}, seq = 1): AgentEvent => ({ run_id: "r1", seq, type, data });

describe("applyEvent", () => {
  it("accumulates streamed text, then replaces it with the final message", () => {
    let t = newTurn("r1", "hi");
    t = applyEvent(t, ev("text_delta", { text: "Hel" }));
    t = applyEvent(t, ev("text_delta", { text: "lo" }));
    expect(t.items).toEqual([{ kind: "text", text: "Hello", streaming: true }]);
    t = applyEvent(t, ev("assistant_message", { text: "Hello" }));
    expect(t.items).toEqual([{ kind: "text", text: "Hello", streaming: false }]);
  });

  it("tracks a tool from start to a verified result", () => {
    let t = newTurn("r1", "x");
    t = applyEvent(t, ev("tool_started", { tool_use_id: "a", name: "create_point", input: { x: 1, y: 1 } }));
    expect(t.items[0]).toMatchObject({ kind: "tool", status: "running" });
    t = applyEvent(t, ev("tool_completed", { tool_use_id: "a", name: "create_point", result: { id: "e" } }));
    expect(t.items[0]).toMatchObject({ status: "done", result: { id: "e" } });
  });

  it("shows a call that was rejected before it started", () => {
    const t = applyEvent(newTurn("r1", "x"), ev("tool_failed", { tool_use_id: "b", name: "create_point", error: { code: "invalid_tool_input" } }));
    expect(t.items[0]).toMatchObject({ kind: "tool", status: "failed" });
  });

  it("ends in the terminal state and closes any open text", () => {
    let t = applyEvent(newTurn("r1", "x"), ev("text_delta", { text: "partial" }));
    t = applyEvent(t, ev("run_failed", { cause: "refusal", message: "no" }));
    expect(t.status).toBe("failed");
    expect(t.failure).toEqual({ cause: "refusal", message: "no" });
    expect(t.items[0]).toMatchObject({ streaming: false });
  });
});

describe("turnFromRun", () => {
  it("replays stored events through the same reducer", () => {
    const t = turnFromRun({
      id: "r1", task: "make", status: "completed",
      events: [
        { seq: 1, type: "run_started", data: { task: "make" } },
        { seq: 2, type: "tool_started", data: { tool_use_id: "a", name: "create_point", input: {} } },
        { seq: 3, type: "tool_completed", data: { tool_use_id: "a", name: "create_point", result: {} } },
        { seq: 4, type: "assistant_message", data: { text: "Done." } },
        { seq: 5, type: "run_completed", data: {} },
      ],
    });
    expect(t.status).toBe("completed");
    expect(t.items.map((i) => i.kind)).toEqual(["tool", "text"]);
  });

  it("does not leave a crashed run looking alive", () => {
    const t = turnFromRun({ id: "r1", task: "x", status: "failed", events: [{ seq: 1, type: "run_started", data: {} }] });
    expect(t.status).toBe("failed");
  });
});

describe("parseSse", () => {
  const frame = (e: AgentEvent) => `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
  it("returns whole events and keeps a partial one for the next chunk", () => {
    const a = frame(ev("run_started", {}, 1));
    const b = frame(ev("text_delta", { text: "x" }, 2));
    const first = parseSse(a + b.slice(0, 20));
    expect(first.events.map((e) => e.type)).toEqual(["run_started"]);
    const second = parseSse(first.rest + b.slice(20));
    expect(second.events.map((e) => e.type)).toEqual(["text_delta"]);
    expect(second.rest).toBe("");
  });
  it("ignores heartbeats and malformed frames", () => {
    expect(parseSse(": ping\n\nevent: x\ndata: {nope\n\n").events).toEqual([]);
  });
});
