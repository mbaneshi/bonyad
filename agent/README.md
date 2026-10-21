# agent: the AI interface to the same seven operations

A Bun + TypeScript service on the Anthropic SDK. The agent is a first-class way to drive the
drawing, next to the UI, and it uses **the same HTTP API**: it has no second write path. A
model response alone never changes state; only a validated tool call that the Rust API
accepts does.

```bash
just serve        # the Rust API (127.0.0.1:58080)
just agent        # this service (127.0.0.1:58090); needs ANTHROPIC_API_KEY (or `ant auth login`)
just ui           # the UI; its dev server proxies /v1 and /agent
just agent-check  # the tests: a throwaway database and the real Rust API; never the provider
just agent-smoke  # opt-in: one REAL Anthropic stream through both scenarios (spends money)
```

## How a run works

```text
POST /agent/runs {message, conversation_id?, selection?}   -> SSE
  loop (max 12 model steps, 30 tool calls, 120 s):
    provider.stream(history, tools)     text deltas are streamed as they arrive
    refusal / max_tokens?               run no tool; fail with the cause
    for each tool_use:                  validate the input (Zod) -> call the API -> result
    all results go back in one user message
```

- **Tools** (`src/tools.ts`): one per API operation (`get_project_state`, `create_point`,
  `create_line`, `create_surface`, `update_geometry`, `delete_entity`, `measure_entity`), each with
  an explicit route. The model sees strict JSON Schema generated from the same Zod schema that
  validates its input, so there is one definition. Bad arguments never leave the service: they
  come back as an `is_error` result. API errors (`problem+json`, including every geometry
  violation) reach the model the same way.
- **Contract** (`test/contract.test.ts`): every operation in `contracts/openapi.json` has exactly
  one tool, every tool points at an existing endpoint, create tools send only fields the request
  body accepts. Adding an API operation without a tool, or removing one a tool uses, fails CI.
- **Idempotency without a table.** Each create derives its entity id from the `tool_use.id`
  (UUIDv5), so a retried call hits the API's idempotent create: same id and content returns the
  existing entity; same id and different content is `id_in_use`.
- **Provider** (`src/provider.ts`): `ModelProvider` is the only seam. `AnthropicProvider` uses the
  model in `BONYAD_MODEL` (default `claude-opus-5-5`), adaptive thinking with an explicit effort
  (`BONYAD_EFFORT`, default `medium`), `tool_choice: auto` (forced tool use is rejected by this
  model), strict tools with eager input streaming, and the server-side refusal fallback
  (`BONYAD_REFUSAL_FALLBACK=off` drops it). Thinking summaries are neither requested nor
  streamed. `FakeProvider` replays a scripted sequence for tests.
- **History** is append-only and stored verbatim (`agent.messages.provider_content`), so it
  replays unchanged after a reload. Every `tool_use` always gets a `tool_result`, even when the
  run is cancelled or hits a limit, so a conversation can always continue.
- **Cancel** (`POST /agent/runs/{id}/cancel`, or the client disconnecting): the provider stream is
  aborted and no further tool call is scheduled; a mutation already in flight finishes (it is
  atomic) and is recorded. The terminal event lists what the run committed.
- **Failure and limits** end the run with `run_failed` and a `cause` (`provider_error`,
  `refusal`, `max_tokens`, `limit_steps`, `limit_tool_calls`, `limit_time`, `internal`) plus what
  had already landed. The project is always valid because each accepted call is atomic.

## Records (schema `agent`, migration `20261021000002`)

`conversations`, `messages`, `runs`, `run_events`. Text deltas are stream-only; every other event
is stored. `GET /agent/runs/{id}/events?after=N` and `GET /agent/conversations/{id|latest}` serve
reloads. A restart marks runs it finds `running` as failed.

## Events

`run_started`, `text_delta`, `assistant_message`, `tool_started` (only once the arguments are
validated), `tool_completed`, `tool_failed`, `run_completed`, `run_failed`, `run_cancelled`. Each
has `run_id` and a per-run `seq`. Partial tool-argument fragments never leave the service.

## Security posture

A local single-user lab (ADR 0002): no authentication, every service on `127.0.0.1`, and the
service refuses a non-loopback bind unless `BONYAD_ALLOW_NON_LOOPBACK=1`. `ANTHROPIC_API_KEY`
lives only in this service's environment. `BONYAD_FAKE_SCRIPT=<file.json>` swaps the model for a
scripted one (for browser tests); it logs a warning and must never be set for real use.

## Differences from the long-form spec (section 9)

Section 9 of the first-slice design describes the target. This milestone is the reduced form
(ADR 0002): no JWT forwarding or RLS, no revision numbers (so no `expected_revision` or
`end_revision`), no idempotency-key table (ids are derived instead), no separate `tool_calls`
table (the event log carries them), no label references, and no `ask` approval mode.

## Against the real provider

The routine tests drive the loop with a scripted `FakeProvider` and the request shape with a
stubbed SDK client. Whether the live model chooses sensible calls is what `just agent-smoke`
checks. It passed on 2026-10-21 with `claude-opus-5-5` (both scenarios; about 23k input and 1.4k
output tokens in total). It needs a credential: `ANTHROPIC_API_KEY` in the environment or in the
main checkout's `.env`; a key that is not scoped to a workspace also needs
`ANTHROPIC_WORKSPACE_ID` (sent as the `anthropic-workspace-id` header).
