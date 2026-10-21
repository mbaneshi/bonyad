import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { projectKey } from "../api/hooks";
import { AgentUnavailable, createAgentApi, type AgentApi } from "./client";
import { MUTATING_TOOLS, applyEvent, newTurn, turnFromRun, type AgentEvent, type Turn } from "./events";

const AgentContext = createContext<AgentApi | null>(null);
const defaultApi = createAgentApi();

export function AgentProvider({ api, children }: { api: AgentApi; children: ReactNode }) {
  return <AgentContext.Provider value={api}>{children}</AgentContext.Provider>;
}

export type Agent = {
  turns: Turn[];
  running: boolean;
  /** Set when the service could not be reached; cleared on the next send. */
  unavailable: boolean;
  send: (message: string, selection?: string[]) => Promise<void>;
  cancel: () => void;
};

/** Owns the conversation: restores it on load, streams new runs, and keeps the drawing fresh. */
export function useAgent(): Agent {
  const api = useContext(AgentContext) ?? defaultApi;
  const qc = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const conversationId = useRef<string | undefined>(undefined);
  const runId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void api.latest().then((c) => {
      if (!alive || !c) return;
      conversationId.current = c.conversation_id ?? undefined;
      setTurns((now) => (now.length > 0 ? now : c.runs.map(turnFromRun)));
    });
    return () => {
      alive = false;
    };
  }, [api]);

  const send = useCallback(
    async (message: string, selection?: string[]) => {
      setUnavailable(false);
      setRunning(true);
      const pending = `pending-${Date.now()}`;
      setTurns((t) => [...t, newTurn(pending, message)]);
      let current = pending;
      const onEvent = (e: AgentEvent) => {
        if (e.type === "run_started") {
          const cid = e.data.conversation_id;
          if (typeof cid === "string") conversationId.current = cid;
        }
        const from = current;
        current = e.run_id;
        setTurns((ts) => ts.map((t) => (t.runId === from ? { ...applyEvent(t, e), runId: e.run_id } : t)));
        // The drawing is re-read as each change lands, not only at the end.
        if (e.type === "tool_completed" && MUTATING_TOOLS.has(String(e.data.name))) void qc.invalidateQueries({ queryKey: projectKey });
        if (e.type === "run_completed" || e.type === "run_failed" || e.type === "run_cancelled") void qc.invalidateQueries({ queryKey: projectKey });
      };
      try {
        await api.startRun(
          { message, ...(conversationId.current ? { conversation_id: conversationId.current } : {}), ...(selection?.length ? { selection } : {}) },
          onEvent,
          (id) => {
            runId.current = id;
          },
        );
      } catch (err) {
        if (err instanceof AgentUnavailable) {
          setUnavailable(true);
          setTurns((ts) => ts.filter((t) => t.runId !== current));
        }
      } finally {
        // A stream that ends without a terminal event (connection lost) must not look "running".
        setTurns((ts) => ts.map((t) => (t.runId === current && t.status === "running" ? { ...t, status: "failed", failure: { cause: "connection", message: "" } } : t)));
        runId.current = undefined;
        setRunning(false);
        void qc.invalidateQueries({ queryKey: projectKey });
      }
    },
    [api, qc],
  );

  const cancel = useCallback(() => {
    if (runId.current) void api.cancel(runId.current);
  }, [api]);

  return { turns, running, unavailable, send, cancel };
}
