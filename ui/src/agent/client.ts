import type { AgentEvent, RunStatus } from "./events";

export type StoredRun = {
  id: string;
  task: string;
  status: RunStatus;
  events: { seq: number; type: string; data: Record<string, unknown> }[];
};
export type StoredConversation = { conversation_id: string | null; runs: StoredRun[] };

export class AgentUnavailable extends Error {}

/** Splits an SSE buffer into complete events and the unfinished remainder. */
export function parseSse(buffer: string): { events: AgentEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: AgentEvent[] = [];
  for (const frame of frames) {
    const data = frame
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => l.slice(6))
      .join("\n");
    if (!data) continue; // a heartbeat comment
    try {
      const e = JSON.parse(data) as { run_id: string; seq: number; type: AgentEvent["type"]; data: Record<string, unknown> };
      events.push({ run_id: e.run_id, seq: e.seq, type: e.type, data: e.data });
    } catch {
      /* a malformed frame is skipped, never fatal */
    }
  }
  return { events, rest };
}

export function createAgentApi(fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  return {
    /** Starts a run and streams its events. Resolves when the stream ends. */
    async startRun(
      body: { message: string; conversation_id?: string; selection?: string[] },
      onEvent: (e: AgentEvent) => void,
      onRunId: (id: string) => void,
    ): Promise<void> {
      let res: Response;
      try {
        res = await fetchImpl("/agent/runs", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify(body),
        });
      } catch {
        throw new AgentUnavailable("network");
      }
      if (!res.ok || !res.body) throw new AgentUnavailable(`status ${res.status}`);
      const id = res.headers.get("x-run-id");
      if (id) onRunId(id);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
        const parsed = parseSse(buffer);
        buffer = parsed.rest;
        parsed.events.forEach(onEvent);
      }
    },

    async cancel(runId: string): Promise<void> {
      try {
        await fetchImpl(`/agent/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
      } catch {
        /* the stream itself will report what happened */
      }
    },

    /** The latest conversation, or null when there is none (or the service is down). */
    async latest(): Promise<StoredConversation | null> {
      try {
        const res = await fetchImpl("/agent/conversations/latest");
        if (!res.ok) return null;
        const c = (await res.json()) as StoredConversation;
        return c.conversation_id ? c : null;
      } catch {
        return null;
      }
    },
  };
}

export type AgentApi = ReturnType<typeof createAgentApi>;
