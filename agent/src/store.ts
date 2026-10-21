import { SQL } from "bun";
import type { Committed, RunEvent } from "./events";
import type { ContentBlock, ProviderMessage } from "./provider";

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

export type MessageRow = { seq: number; role: "user" | "assistant"; text: string | null };
export type RunView = {
  id: string;
  status: RunStatus;
  model: string;
  task: string;
  error: unknown;
  usage: unknown;
  committed: Committed[];
  started_at: string;
  finished_at: string | null;
  events: { seq: number; type: string; data: Record<string, unknown> }[];
};
export type ConversationView = { conversation_id: string; messages: MessageRow[]; runs: RunView[] };

// Bun's driver binds a string parameter cast straight to jsonb as a JSON *string value*
// (double-encoded). Casting through text parses it, so arrays and objects stay structured.

/** The agent's own records, in schema `agent`. Messages and events are append-only. */
export class Store {
  constructor(readonly sql: SQL) {}

  static connect(url: string): Store {
    return new Store(new SQL(url));
  }

  async close() {
    await this.sql.close();
  }

  async ping() {
    await this.sql`select 1`;
  }

  async createConversation(id: string) {
    await this.sql`insert into agent.conversations (id) values (${id}::uuid)`;
  }

  async conversationExists(id: string): Promise<boolean> {
    const r = await this.sql`select 1 from agent.conversations where id = ${id}::uuid`;
    return r.length > 0;
  }

  /** The provider-shaped history, exactly as it was stored. */
  async history(conversationId: string): Promise<{ messages: ProviderMessage[]; nextSeq: number }> {
    const rows = await this.sql`
      select seq, role, provider_content from agent.messages
      where conversation_id = ${conversationId}::uuid order by seq`;
    const messages = rows.map(
      (r: { role: "user" | "assistant"; provider_content: string | ContentBlock[] }) => ({
        role: r.role,
        content: r.provider_content,
      }),
    );
    const last = rows.length > 0 ? Number(rows[rows.length - 1].seq) : 0;
    return { messages, nextSeq: last + 1 };
  }

  async appendMessage(
    conversationId: string,
    seq: number,
    role: "user" | "assistant",
    text: string | null,
    content: string | ContentBlock[],
  ) {
    await this.sql`
      insert into agent.messages (conversation_id, seq, role, text, provider_content)
      values (${conversationId}::uuid, ${seq}, ${role}, ${text}, (${JSON.stringify(content)}::text)::jsonb)`;
  }

  async createRun(r: { id: string; conversationId: string; model: string; task: string; limits: unknown }) {
    await this.sql`
      insert into agent.runs (id, conversation_id, status, model, task, limits)
      values (${r.id}::uuid, ${r.conversationId}::uuid, 'running', ${r.model}, ${r.task}, (${JSON.stringify(r.limits)}::text)::jsonb)`;
  }

  async appendEvent(e: RunEvent) {
    await this.sql`
      insert into agent.run_events (run_id, seq, type, data)
      values (${e.run_id}::uuid, ${e.seq}, ${e.type}, (${JSON.stringify(e.data)}::text)::jsonb)`;
  }

  async finishRun(id: string, status: Exclude<RunStatus, "running">, f: { usage: unknown; error?: unknown; committed: Committed[] }) {
    await this.sql`
      update agent.runs set status = ${status}, usage = (${JSON.stringify(f.usage)}::text)::jsonb,
        error = (${f.error === undefined ? null : JSON.stringify(f.error)}::text)::jsonb,
        committed = (${JSON.stringify(f.committed)}::text)::jsonb, finished_at = now()
      where id = ${id}::uuid`;
  }

  /** A crash or restart leaves runs `running` forever; mark them so history tells the truth. */
  async failOrphanedRuns() {
    await this.sql`
      update agent.runs set status = 'failed', finished_at = now(),
        error = '{"cause":"internal","message":"the agent service stopped during this run"}'::jsonb
      where status = 'running'`;
  }

  async eventsAfter(runId: string, after: number) {
    const rows = await this.sql`
      select seq, type, data from agent.run_events
      where run_id = ${runId}::uuid and seq > ${after} order by seq`;
    return rows.map((r: { seq: number; type: string; data: Record<string, unknown> }) => ({
      seq: Number(r.seq),
      type: r.type,
      data: r.data,
    }));
  }

  async runExists(runId: string): Promise<boolean> {
    return (await this.sql`select 1 from agent.runs where id = ${runId}::uuid`).length > 0;
  }

  async latestConversationId(): Promise<string | null> {
    const r = await this.sql`select id from agent.conversations order by created_at desc limit 1`;
    return r.length > 0 ? String(r[0].id) : null;
  }

  async conversationView(conversationId: string): Promise<ConversationView | null> {
    if (!(await this.conversationExists(conversationId))) return null;
    const msgs = await this.sql`
      select seq, role, text from agent.messages
      where conversation_id = ${conversationId}::uuid and text is not null order by seq`;
    const runs = await this.sql`
      select id, status, model, task, error, usage, committed, started_at, finished_at
      from agent.runs where conversation_id = ${conversationId}::uuid order by started_at`;
    const views: RunView[] = [];
    for (const r of runs) {
      views.push({
        id: String(r.id),
        status: r.status,
        model: r.model,
        task: r.task,
        error: r.error,
        usage: r.usage,
        committed: r.committed ?? [],
        started_at: new Date(r.started_at).toISOString(),
        finished_at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
        events: await this.eventsAfter(String(r.id), 0),
      });
    }
    return {
      conversation_id: conversationId,
      messages: msgs.map((m: { seq: number; role: "user" | "assistant"; text: string }) => ({
        seq: Number(m.seq),
        role: m.role,
        text: m.text,
      })),
      runs: views,
    };
  }
}
