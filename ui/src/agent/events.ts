/** The agent service's events, and one pure reducer that turns them into what the chat shows. */

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

export type AgentEvent = {
  run_id: string;
  seq: number;
  type:
    | "run_started"
    | "text_delta"
    | "assistant_message"
    | "tool_started"
    | "tool_completed"
    | "tool_failed"
    | "run_completed"
    | "run_failed"
    | "run_cancelled";
  data: Record<string, unknown>;
};

export type ToolItem = {
  kind: "tool";
  id: string;
  name: string;
  status: "running" | "done" | "failed";
  input?: unknown;
  /** What the API returned: a verified fact, unlike the model's prose. */
  result?: unknown;
  error?: unknown;
};
export type TextItem = { kind: "text"; text: string; streaming: boolean };
export type Item = TextItem | ToolItem;

export type Turn = {
  runId: string;
  task: string;
  status: RunStatus;
  items: Item[];
  failure?: { cause: string; message: string };
};

/** Tools that change the project: when one completes the drawing must be re-read. */
export const MUTATING_TOOLS = new Set(["create_point", "create_line", "create_surface", "update_geometry", "delete_entity"]);

export function newTurn(runId: string, task: string): Turn {
  return { runId, task, status: "running", items: [] };
}

export function applyEvent(turn: Turn, ev: AgentEvent): Turn {
  const d = ev.data;
  const items = [...turn.items];
  const last = items[items.length - 1];
  switch (ev.type) {
    case "run_started":
      return { ...turn, task: typeof d.task === "string" ? d.task : turn.task };
    case "text_delta": {
      if (last?.kind === "text" && last.streaming) {
        items[items.length - 1] = { ...last, text: last.text + String(d.text) };
      } else {
        items.push({ kind: "text", text: String(d.text), streaming: true });
      }
      return { ...turn, items };
    }
    case "assistant_message": {
      const text = String(d.text);
      if (last?.kind === "text" && last.streaming) items[items.length - 1] = { kind: "text", text, streaming: false };
      else items.push({ kind: "text", text, streaming: false });
      return { ...turn, items };
    }
    case "tool_started":
      items.push({ kind: "tool", id: String(d.tool_use_id), name: String(d.name), status: "running", input: d.input });
      return { ...turn, items };
    case "tool_completed":
    case "tool_failed": {
      const id = String(d.tool_use_id);
      const done = ev.type === "tool_completed";
      const at = items.findIndex((i) => i.kind === "tool" && i.id === id);
      const patch = done ? { status: "done" as const, result: d.result } : { status: "failed" as const, error: d.error };
      if (at >= 0) items[at] = { ...(items[at] as ToolItem), ...patch };
      else items.push({ kind: "tool", id, name: String(d.name), ...patch }); // rejected before it started
      return { ...turn, items };
    }
    case "run_completed":
      return { ...turn, status: "completed", items: closeText(items) };
    case "run_cancelled":
      return { ...turn, status: "cancelled", items: closeText(items) };
    case "run_failed":
      return {
        ...turn,
        status: "failed",
        items: closeText(items),
        failure: { cause: String(d.cause), message: String(d.message ?? "") },
      };
  }
}

function closeText(items: Item[]): Item[] {
  return items.map((i) => (i.kind === "text" && i.streaming ? { ...i, streaming: false } : i));
}

/** A stored run's events, replayed through the same reducer the live stream uses. */
export function turnFromRun(run: { id: string; task: string; status: RunStatus; events: { seq: number; type: string; data: Record<string, unknown> }[] }): Turn {
  let turn = newTurn(run.id, run.task);
  for (const e of run.events) turn = applyEvent(turn, { run_id: run.id, seq: e.seq, type: e.type as AgentEvent["type"], data: e.data });
  // A run still marked running with no terminal event (a crash) is shown as failed.
  if (run.status !== "running" && turn.status === "running") turn = { ...turn, status: run.status };
  return turn;
}
