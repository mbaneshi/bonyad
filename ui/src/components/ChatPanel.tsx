import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Agent } from "../agent/useAgent";
import type { Item, ToolItem, Turn } from "../agent/events";
import { fa } from "../fa";
import { formatNumber } from "../numbers";
import type { EntityView, Violation } from "../model";
import { summary } from "./EntityList";

export function ChatPanel({ agent, selection }: { agent: Agent; selection: string[] }) {
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo?.({ top: log.current.scrollHeight });
  }, [agent.turns]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const message = text.trim();
    if (!message || agent.running) return;
    setText("");
    void agent.send(message, selection);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  };

  return (
    <section className="chat" aria-label={fa.agent.title}>
      <div className="chat-log" ref={log} role="log" aria-live="polite">
        {agent.turns.length === 0 && <p className="muted">{fa.agent.empty}</p>}
        {agent.turns.map((t) => (
          <TurnView key={t.runId} turn={t} />
        ))}
      </div>
      {agent.unavailable && (
        <div role="alert" className="alert">
          <p>{fa.agent.unavailable}</p>
        </div>
      )}
      <form className="chat-form" onSubmit={submit}>
        <textarea
          rows={2}
          dir="auto"
          enterKeyHint="send"
          aria-label={fa.agent.placeholder}
          placeholder={fa.agent.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        {agent.running ? (
          <button type="button" className="danger" data-chat-stop onClick={agent.cancel}>
            {fa.agent.stop}
          </button>
        ) : (
          <button type="submit" data-chat-send disabled={text.trim() === ""}>
            {fa.agent.send}
          </button>
        )}
      </form>
    </section>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <article className="turn" data-status={turn.status}>
      <p className="msg user" dir="auto">
        {turn.task}
      </p>
      {turn.items.map((item, i) => (
        <ItemView key={i} item={item} />
      ))}
      {turn.status === "running" && <p className="muted">{fa.agent.running}</p>}
      {turn.status === "cancelled" && <p className="note">{fa.agent.cancelled}</p>}
      {turn.status === "failed" && turn.failure && (
        <div role="alert" className="alert">
          <p>{fa.agent.failures[turn.failure.cause] ?? fa.errors.unknown}</p>
          <p className="note">{fa.agent.keptNote}</p>
        </div>
      )}
    </article>
  );
}

function ItemView({ item }: { item: Item }) {
  if (item.kind === "text") {
    return (
      <p className="msg assistant" dir="auto" data-streaming={item.streaming || undefined}>
        {item.text}
      </p>
    );
  }
  return <ToolRow tool={item} />;
}

function ToolRow({ tool }: { tool: ToolItem }) {
  const label = fa.agent.tools[tool.name] ?? tool.name;
  return (
    <div className="tool" data-tool={tool.name} data-status={tool.status}>
      <span className="tool-mark" aria-hidden="true">
        {tool.status === "running" ? "…" : tool.status === "done" ? "✓" : "✕"}
      </span>
      <span className="tool-name">{label}</span>
      {tool.status === "done" && (
        <bdi dir="ltr" className="num tool-result" title={fa.agent.verified}>
          {resultSummary(tool.name, tool.result)}
        </bdi>
      )}
      {tool.status === "failed" && <span className="tool-error">{errorSummary(tool.error)}</span>}
    </div>
  );
}

function resultSummary(name: string, result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  if (name === "measure_entity") {
    if (r.kind === "line") return `${formatNumber(Number(r.length))} ${String(r.unit)}`;
    if (r.kind === "surface") return `${formatNumber(Number(r.area))} ${String(r.area_unit)} · ${formatNumber(Number(r.perimeter))} ${String(r.unit)}`;
  }
  if (name === "get_project_state" && Array.isArray(r.entities)) return fa.agent.entities(r.entities.length);
  if (name === "delete_entity") return fa.agent.deleted;
  if (r.geometry) return summary((r as unknown as EntityView).geometry);
  return "";
}

function errorSummary(error: unknown): string {
  const e = (error ?? {}) as { code?: string; violations?: Violation[] };
  if (e.violations?.length) return e.violations.map((v) => fa.violations[v.code] ?? v.message).join(" ");
  if (e.code === "invalid_tool_input" || e.code === "unknown_tool") return fa.agent.rejected;
  const known = e.code ? (fa.errors as Record<string, string>)[e.code] : undefined;
  return known ?? fa.errors.unknown;
}
