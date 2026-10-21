export type RunEventType =
  | "run_started"
  | "text_delta"
  | "assistant_message"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "run_completed"
  | "run_failed"
  | "run_cancelled";

/** One streamed event. `seq` is per run and increases by one for every event, deltas included. */
export type RunEvent = {
  run_id: string;
  seq: number;
  type: RunEventType;
  data: Record<string, unknown>;
};

export type FailureCause =
  | "provider_error"
  | "refusal"
  | "max_tokens"
  | "limit_steps"
  | "limit_tool_calls"
  | "limit_time"
  | "internal";

export type Committed = { tool: string; entity_id: string };
