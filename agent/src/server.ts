import { z } from "zod";
import type { RunEvent } from "./events";
import { ConversationNotFound, runAgent, type AgentDeps } from "./loop";

const StartRun = z.strictObject({
  message: z.string().trim().min(1).max(4000),
  conversation_id: z.uuid().optional(),
  selection: z.array(z.uuid()).max(50).optional(),
});

const enc = new TextEncoder();
const HEARTBEAT_MS = 10_000;

function problem(status: number, code: string, title: string, detail?: string): Response {
  return Response.json(
    { type: "about:blank", title, status, code, ...(detail ? { detail } : {}) },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

/** The HTTP surface. `fetch` is a plain handler, so tests can call it without a socket. */
export function createHandler(deps: AgentDeps) {
  /** Runs in flight, so they can be cancelled by id. */
  const active = new Map<string, AbortController>();

  async function startRun(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return problem(400, "invalid_request", "Invalid request", "the body is not valid JSON");
    }
    const parsed = StartRun.safeParse(body);
    if (!parsed.success) {
      return problem(400, "invalid_request", "Invalid request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const { message, conversation_id, selection } = parsed.data;
    if (conversation_id && !(await deps.store.conversationExists(conversation_id))) {
      return problem(404, "not_found", "Conversation not found");
    }

    const runId = crypto.randomUUID();
    const controller = new AbortController();
    active.set(runId, controller);
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(out) {
        const send = (e: RunEvent) =>
          out.enqueue(enc.encode(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        heartbeat = setInterval(() => {
          try {
            out.enqueue(enc.encode(": ping\n\n"));
          } catch {
            /* closed */
          }
        }, HEARTBEAT_MS);

        runAgent(deps, { runId, message, ...(conversation_id ? { conversationId: conversation_id } : {}), ...(selection ? { selection } : {}) }, send, controller.signal)
          .catch((err) => {
            // The run could not even be recorded (for example the database is down).
            const detail = err instanceof ConversationNotFound ? "conversation not found" : String(err);
            send({ run_id: runId, seq: 0, type: "run_failed", data: { cause: "internal", message: detail, committed: [] } });
          })
          .finally(() => {
            clearInterval(heartbeat);
            active.delete(runId);
            try {
              out.close();
            } catch {
              /* already closed */
            }
          });
      },
      cancel() {
        // The client went away: that is a cancel. A mutation in flight still finishes.
        clearInterval(heartbeat);
        controller.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
        "x-run-id": runId,
      },
    });
  }

  async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (req.method === "GET" && path === "/healthz") {
        let database = "ok";
        try {
          await deps.store.ping();
        } catch {
          database = "down";
        }
        return Response.json({ status: database === "ok" ? "ok" : "degraded", database, model: deps.provider.model });
      }
      if (req.method === "POST" && path === "/agent/runs") return await startRun(req);

      const cancel = path.match(/^\/agent\/runs\/([^/]+)\/cancel$/);
      if (req.method === "POST" && cancel) {
        const c = active.get(cancel[1]!);
        if (!c) return problem(404, "not_found", "No active run with that id");
        c.abort();
        return Response.json({ cancelling: true }, { status: 202 });
      }

      const events = path.match(/^\/agent\/runs\/([^/]+)\/events$/);
      if (req.method === "GET" && events) {
        const id = events[1]!;
        if (!z.uuid().safeParse(id).success || !(await deps.store.runExists(id))) return problem(404, "not_found", "Run not found");
        const after = Number(url.searchParams.get("after") ?? 0);
        return Response.json({ events: await deps.store.eventsAfter(id, Number.isFinite(after) ? after : 0) });
      }

      const conv = path.match(/^\/agent\/conversations\/([^/]+)$/);
      if (req.method === "GET" && conv) {
        const key = conv[1]!;
        const id = key === "latest" ? await deps.store.latestConversationId() : key;
        // "latest" on an empty database is a normal state, not an error: no conversation yet.
        if (key === "latest" && !id) return Response.json({ conversation_id: null, messages: [], runs: [] });
        if (!id || !z.uuid().safeParse(id).success) return problem(404, "not_found", "Conversation not found");
        const view = await deps.store.conversationView(id);
        return view ? Response.json(view) : problem(404, "not_found", "Conversation not found");
      }
      return problem(404, "not_found", "No such route");
    } catch (err) {
      console.error(JSON.stringify({ level: "ERROR", message: "unhandled", error: String(err) }));
      return problem(500, "internal_error", "Internal error");
    }
  }

  return { fetch, active };
}
