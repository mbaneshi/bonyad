# First slice — point, line, surface (design)

Status: **proposed**, awaiting founder review. Nothing below is built yet.
Constraints come from the founder brief; every choice marked *(my call)* is mine
and reversible.

## 1. Interpretation of the constraints

1. **One model, three expressions.** The slice's concepts (`Project`, `Point`,
   `Line`, `Surface`, `Revision`, `Changeset`) are defined once in SQL; Rust types
   mirror the tables 1:1; TypeScript types are *generated* from Rust's OpenAPI.
   Nobody hand-writes a second model.
2. **Authoritative vs derived.** Only coordinates and references are stored.
   Length and area are *derived*: computed by Rust on read, never persisted. This
   keeps the stale-result problem out of the slice, yet the revision mechanism
   keeps room for stored results later.
3. **State / procedure / persistence apart.** Rust procedures are pure functions
   of an in-memory model (`length(line, points)`, `area(surface, points)`,
   `validate(model)`). Persistence is a separate module. Procedures never touch I/O.
4. **Change = proposal, then acceptance.** The UI and agents submit a *changeset*
   against an *expected revision*. Rust applies it to an in-memory copy, validates
   and computes; Postgres then atomically accepts it or reports a conflict.
5. **Agents use the same door — and are part of the first slice, not a later
   milestone** (founder amendment, 2026-10-21; see §9). The API is the only write
   path. The browser has no write grant on domain tables. A human edit and an agent
   tool call reach the same Rust operation and the same `accept_changeset`.
   An agent run acts with the *initiating user's* JWT, so authorization is
   identical; the revision records `actor_type = "agent"` and the `run_id`.
6. **One owner per procedure** (the ownership rule, *(my call)*):

   | Concern | Owner |
   |---|---|
   | Referential integrity, finite numbers, atomic accept, revision compare-and-swap | PostgreSQL (constraints + one function) |
   | Geometry rules (zero-length, polygon validity), length, area | Rust |
   | Integration with outside services, secrets-bound webhooks | Edge Functions — **none in this slice** |

   Postgres never recomputes geometry; Rust never re-implements integrity. If a
   rule has two plausible owners, it goes in the ADR log.
7. **No invented use for services.** Storage, Realtime and Edge Functions run (they
   are part of the stack) but this slice does not touch them. File metadata vs
   bytes is a recorded rule for later, not code now.

## 2. Architecture

```text
 React + TS (Vite)                       Rust (axum + tokio)               Supabase stack (own compose project)
 ┌────────────────────┐   Bearer JWT    ┌───────────────────────┐  sqlx   ┌──────────────────────────────┐
 │ supabase-js: login │ ──────────────▶ │ verify JWT            │ ──────▶ │ Postgres 17                  │
 │ openapi-fetch      │  /v1/... JSON   │ load → apply → validate│  as     │  schema bonyad (RLS on)      │
 │ TanStack Query     │ ◀────────────── │ → compute → accept     │  role   │  fn accept_changeset(...)    │
 │ SVG view + panel   │ problem+json    │ tracing + request id   │ ───────▶│ GoTrue, Storage, Realtime,   │
 └────────────────────┘                 └───────────────────────┘         │ Studio, Edge Runtime (idle)  │
                                                                          └──────────────────────────────┘
```

**Identity path.** GoTrue issues the JWT → browser sends it to Rust → Rust verifies
signature, expiry and audience → per transaction runs
`SELECT set_config('request.jwt.claims', $claims, true)` and
`SET LOCAL ROLE authenticated`, over a connection made as a dedicated login role
(`bonyad_api`, no `BYPASSRLS`, not superuser). `auth.uid()` then resolves inside
RLS and inside `accept_changeset`, so **RLS is the single permission source**; Rust
adds no parallel ACL.

**Operation routing.**

| Operation | Path | Why |
|---|---|---|
| Sign-in / sign-up / token refresh | browser → GoTrue via `supabase-js` | That is Auth's job |
| Read project + derived values | browser → Rust | Derived values exist only in Rust |
| Create project, edit, create entities | browser → Rust → `accept_changeset` | Validation and revision acceptance must not be bypassed |
| Direct PostgREST on `bonyad.*` | **not exposed** | Domain schema is not in PostgREST's exposed list; no write grants for `authenticated` |
| Storage, Realtime | unused in slice | Not needed yet |

**Secrets.** `.env` is gitignored; `.env.example` holds placeholders. The browser
gets only `VITE_SUPABASE_URL` and the anon key. The service-role key, JWT secret
and DB passwords are read by containers/Rust only. Rust never logs a token or an
env value.

**Migrations.** `db/migrations/*.sql` is the single authoritative history, applied
by `sqlx migrate run` from a one-shot compose service. SQLx offline metadata
(`.sqlx/`) is committed; CI runs `cargo sqlx prepare --check` against a freshly
migrated database. That catches drift in *the queries we wrote*; it does not prove
every schema/runtime mismatch (dynamic SQL and function bodies are not checked).
Generated DB types (`supabase gen types`) are used only for tooling/inspection, not
as the API contract.

**Contract checks.** `just contract` regenerates `openapi.json` (from `utoipa`) and
the TS client; CI fails if the working tree changes. Runtime validation stays at
the boundaries (Rust parses requests into domain types; the UI never trusts
unvalidated server data beyond the generated types).

## 3. Decision table

| Purpose | Tool | Justification | When |
|---|---|---|---|
| HTTP server | axum + tokio | Tower middleware, extractor model, mature; fits `utoipa` | now |
| DB access | **SQLx (typed SQL), not Diesel/ORM** | Postgres functions, RLS and `SET LOCAL ROLE` are first-class here; an ORM hides exactly those. SQL files stay the single source | now |
| Serialization | serde, serde_json | Standard | now |
| IDs | UUID, v7 generated in Rust (`uuid`) | Time-ordered, one format in SQL (`uuid`), Rust, TS (string) | now |
| API contract | utoipa → `openapi.json` → `openapi-typescript` + `openapi-fetch` | Types generated, tiny runtime; avoids a heavy codegen like orval | now |
| Errors | RFC 9457 `application/problem+json` with `violations[]` | One shape for UI, agents, tests | now |
| JWT verify | `jsonwebtoken` | Verify GoTrue tokens (algorithm per compose config) | now |
| Auth in browser | `supabase-js` (Auth only) | Storage later | now |
| Server-state cache | TanStack Query | Mutations, invalidation, retry, stale handling | now |
| Forms/validation | plain controlled inputs; **defer RHF + Zod** | One numeric form does not pay for them yet | later |
| UI primitives | native elements + small own components; revisit Radix when a dialog/menu is needed | Native `input`/`button` give RTL, touch and a11y for free | later |
| Tracing | `tracing`, `tracing-subscriber` (JSON), `tower-http` request-id | Required by brief | now |
| Orchestration | Docker Compose (project `bonyad`), health checks | Required | now |
| Dev commands | `just` (installed) | Required | now |
| Lockfiles | `Cargo.lock`, `pnpm-lock.yaml` committed | Required | now |
| Tests | `cargo test` + `#[sqlx::test]` on a real DB, Vitest for UI units, Playwright (3 viewports) | Behaviour + boundaries | now |
| SQLx CLI | `cargo install sqlx-cli` (not installed) | Migrations + offline prepare | now |
| CI | GitHub Actions: fmt, clippy, tsc, migrate, `prepare --check`, contract diff, tests, Playwright | Required | step 6 |
| Revision storage | snapshot-per-revision + changeset (JSONB) | Smallest thing that supports "inspect prior state"; not event sourcing | slice part 2 |
| Edge Functions | none yet | No integration use in the slice | later |
| Anthropic SDK | `@anthropic-ai/sdk` (official, TypeScript) | Messages streaming, typed events, abort signal, bounded retries built in | now |
| Agent runtime | **hand-written loop** over `messages.stream`, not the beta Tool Runner | We must persist every step, enforce step/token/time limits, cancel between tool calls and inject idempotency keys; the runner hides those turns. About 150 lines | now |
| Agent service host | `services/agent`, Bun + strict TS + Zod at boundaries, `bun test` as the gate (no `tsc` gate, per house rule) | New backend, greenfield | now |
| Provider adapter | `ModelProvider` interface (`stream(req) -> AsyncIterable<ProviderEvent>`); `AnthropicProvider` + scripted `FakeProvider` | Keeps Anthropic message shapes out of the app; FakeProvider makes loop tests deterministic. No second real provider | now |
| Tool catalog | generated from Rust OpenAPI (`x-bonyad-tool` extension) → `tools.json`; CI fails on drift | One definition for UI client and agent; no handwritten schemas | now |
| Arg validation | Zod built from the catalog's JSON Schema (agent side) + Rust parsing (authoritative) | Validate before execution; Rust never trusts the agent | now |
| Streaming | SSE over `fetch` (POST + Bearer header), replay from DB by `?after=seq` | One-way server→client; `EventSource` cannot send headers; replay gives reload and reconnect for free. WebSockets not justified | now |
| React stream consumer | small `fetch` + `ReadableStream` SSE parser; events folded into TanStack Query cache | No dependency needed | now |
| Run persistence | Rust-owned tables via internal endpoints (see §9) | One DB client, one migration owner, one RLS path | now |
| Correlation | `request_id` (per HTTP call), `run_id`, `tool_use_id` propagated as headers and log fields | Required | now |
| Limits | per-run: steps, tool calls, output tokens, wall clock; `usage` stored per run | Required | now |
| Idempotency | `Idempotency-Key` = Anthropic `tool_use.id`, stored inside the same transaction as the write | Required | now |
| Real-provider test | `just agent-smoke`, opt-in, never in CI | Nondeterministic wording | now |

**License recommendation (not applied).** Apache-2.0: permissive, explicit patent
grant, friendly to commercial adoption and contributions, matches an
"ecosystem-first" lab. Alternative: AGPL-3.0 if the priority is to prevent closed
hosted forks. No `LICENSE` file is added until you choose.

## 4. Concrete schema (schema `bonyad`)

```sql
projects(id uuid pk, owner_id uuid not null,            -- auth.users.id
         name text not null, unit text not null default 'm' check (unit = 'm'),
         frame text not null default 'local-cartesian' check (frame = 'local-cartesian'),
         revision bigint not null default 0, created_at timestamptz)

points(project_id uuid, id uuid, label text not null,
       x double precision not null check (x = x and x not in ('Infinity','-Infinity')),
       y double precision not null check (...same...),
       primary key (project_id, id))

lines(project_id, id, a uuid not null, b uuid not null, check (a <> b),
      foreign key (project_id, a) references points(project_id, id),
      foreign key (project_id, b) references points(project_id, id))

surfaces(project_id, id, label)
surface_vertices(project_id, surface_id, position int, point_id uuid,
                 pk (project_id, surface_id, position),
                 fk (project_id, point_id) -> points)      -- boundary is open: A,B,C
```

Composite foreign keys include `project_id`, so a line can never reference another
project's point. RLS on every table: `owner_id = auth.uid()` (children via their
project). `authenticated` gets `SELECT` only; writes happen inside
`accept_changeset`, which is `SECURITY INVOKER` and called by Rust.

Part 2 adds `revisions(project_id, number, actor_id, actor_type, created_at,
changeset jsonb, snapshot jsonb, primary key (project_id, number))`.

`bonyad.accept_changeset(p_project, p_expected bigint, p_ops jsonb)`: locks the
project row, raises a typed conflict if `revision <> p_expected`, applies ops
(`create_point`, `move_point`, `create_line`, `create_surface`), increments
`revision`, writes the revision row (part 2), returns the new revision.

## 5. Rust types (domain, in a `bonyad-core` crate with no I/O)

```rust
struct PointId(Uuid); struct Point { id, label: String, x: f64, y: f64 }
struct Line    { id, a: PointId, b: PointId }
struct Surface { id, label: String, boundary: Vec<PointId> }
struct Model   { points: BTreeMap<PointId, Point>, lines: Vec<Line>, surfaces: Vec<Surface> }

enum Op { CreatePoint{..}, MovePoint{ id, x, y }, CreateLine{..}, CreateSurface{..} }
struct Changeset { expected_revision: i64, ops: Vec<Op> }

enum Violation { MissingReference{..}, NonFiniteCoordinate{..}, ZeroLengthSegment{..},
                 BoundaryTooShort{..}, DegenerateBoundary{..}, SelfIntersecting{..} }

fn validate(&Model) -> Vec<Violation>        // pure
fn length(&Line, &Model) -> f64              // pure
fn area(&Surface, &Model) -> f64             // pure; |shoelace|, simple polygon
```

Crates: `bonyad-core` (types, procedures, tests), `bonyad-api` (axum, SQLx,
OpenAPI). Geometry is exact-enough f64 for the slice; tolerance is a named constant
documented in the ADR. Polygon validity: ≥3 distinct vertices, non-zero area, no
self-intersection (O(n²) segment test — fine at this scale).

## 6. API contract

| Method & path | Result |
|---|---|
| `GET /v1/projects` | list the caller's projects |
| `POST /v1/projects` | create (optionally with the sample) |
| `GET /v1/projects/{id}` | model + `derived{ lines[{id,length}], surfaces[{id,area}] }` + `revision` |
| `POST /v1/projects/{id}/changesets` | `200 {revision, model, derived}` · `409` conflict `{current_revision}` · `422` `violations[]` |
| `GET /v1/projects/{id}/revisions` · `/{n}` | part 2: list, and inspect the snapshot |
| `GET /healthz` | liveness + DB reachability |

Errors are `application/problem+json`: `type`, `title`, `status`, `request_id`,
`violations: [{code, path, message}]`. `code` is a stable machine string
(`missing_reference`, `zero_length_segment`, …); the UI maps codes to Persian text.

## 7. UI mapping

| Model / contract | UI |
|---|---|
| Points, lines, surfaces | One SVG: filled `polygon`, `line`, `circle` points; Y flipped (engineering up); `viewBox` fitted to model |
| Selection | Tap or click; 44px invisible hit targets; no hover dependence; also selectable from a list |
| Properties | Panel: side column on desktop, **bottom sheet** on mobile; x/y inputs with `inputmode="decimal"` |
| Derived values | Shown in the panel for the selected entity and in a summary |
| Edit | Submit a `move_point` changeset with the current `revision`; optimistic UI never shown as accepted until `200` |
| Errors | `422` → field-level Persian message; `409` → "someone changed this" with reload; network → disconnected banner with retry |
| RTL / mixed text | `<html dir="rtl" lang="fa">`; all numerals and coordinates in `<bdi dir="ltr">`; tabular figures |
| Keyboard | Sheet uses `visualViewport` so the focused input stays visible |

Minimal Persian string table now (single `fa.ts`); a real i18n library is deferred.

## 8. Implementation sequence with observable acceptance

| # | Step | Done when |
|---|---|---|
| 1 | Compose project `bonyad` (shifted ports, own volumes), `.env.example`, key generator, health checks, `just up/down/reset` | `just up` → all services healthy; Studio reachable; existing stack untouched |
| 2 | Migrations + seed function | Fresh DB migrates; sample seeded (check 1) |
| 3 | `bonyad-core` | Unit tests: length 4, area 6; B→(8,0) gives 8 and 12; each violation rejected (checks 2–4) |
| 4 | `bonyad-api` + OpenAPI + auth path | DB integration tests: rejects leave state unchanged; reload equals accepted state; cross-user access denied (checks 4–6, 8) |
| 5 | React UI + generated client | Create/list/select/edit/reload works against real stack (checks 6–7) |
| 6 | Playwright at 360, 768, 1280 + CI | No horizontal overflow; keyboard-safe sheet; all states (check 9) |
| 7 | Revisions + idempotency table | Stale edit → 409; prior snapshot inspectable; replayed `Idempotency-Key` returns the original result (check 10) |
| 8 | Tool catalog generation | `just contract` emits `tools.json`; CI diff-checks; catalog entries match API operations |
| 9 | Agent service + run persistence + SSE (scripted provider first) | Scenarios 1–2 pass via `FakeProvider` in `bun test` against the real API/DB; events replay after reload |
| 10 | Agent UI | Streaming conversation, tool progress, cancel, restore on reload; works at 360 px |
| 11 | Real-provider smoke | With a key: scenario 1 then 2 produce length 4/area 6, then 8/12 (opt-in) |
| 12 | Playwright (human + agent paths, 3 viewports), CI, README, architecture.md | Fresh clone starts from the README alone |

Each step is one issue → one PR from a worktree off `dev`.

## 9. Agentic automation (founder amendment, mandatory in the first slice)

AI is a foundational execution interface, like data, logic and presentation. The
slice must demonstrate both paths: *human → operation → state → UI* and
*human → agent → the same operation → state → streamed UI*.

### 9.1 Responsibilities

| Layer | Owns |
|---|---|
| `services/agent` (Bun/TS, Anthropic SDK) | Model requests, streaming, tool-call loop, limits, cancellation, bounded retries, event emission. **Stateless**: no DB client, no JWT verification |
| Rust | Typed tools, queries, validation, computation, **and persistence of conversations/runs/tool calls** (so there is one DB client, one RLS path, one migration owner) |
| PostgreSQL | `conversations`, `messages`, `runs`, `run_events`, `tool_calls`, revision links |
| React | Streaming conversation, tool progress, results, errors, cancel |

```text
browser ──POST /agent/runs (Bearer JWT, SSE reply)──▶ agent service
                                                       │ 1. POST /v1/runs (same JWT) ─▶ Rust verifies, creates run row
                                                       │ 2. loop: provider.stream → tool_use
                                                       │ 3. tool call: Rust /v1/... (same JWT, X-Run-Id, Idempotency-Key = tool_use.id)
                                                       │ 4. every event ─▶ Rust POST /v1/runs/{id}/events (append-only log)
browser ◀── SSE events ◀───────────────────────────────┘
browser ──GET /v1/runs/{id}/events?after=seq──▶ Rust   (reload / reconnect / history)
```

The agent service never decides who the caller is: it forwards the browser's JWT and
Rust is the only verifier. If Rust rejects `POST /v1/runs`, the stream never starts.
`ANTHROPIC_API_KEY` exists only in the agent service environment (a compose secret);
neither Rust nor the browser can see it.

### 9.2 Provider adapter and model settings

`ModelProvider.stream()` yields normalized events: `text_delta`, `tool_input_delta`
(internal only), `tool_call` (complete), `stop{reason, usage}`. `AnthropicProvider`
maps SDK events to these; `FakeProvider` replays a scripted sequence. Nothing outside
the adapter touches Anthropic message shapes — except persistence, below.

Settings (from the Claude API reference; exact call shapes are checked against the
TypeScript SDK docs when step 9 is implemented):

- Model: `claude-opus-5-5` by default (reference default), overridable with
  `BONYAD_MODEL`. Adaptive thinking; effort set explicitly (the model's default is
  `medium`); thinking summaries are **not** requested or streamed.
- Tools use `strict: true` and `eager_input_streaming: true`. Because eager streaming
  disables API-side validation, the dispatcher validates every parsed input against
  the catalog schema, treats failure like invalid JSON (returns an `is_error`
  `tool_result`), and checks `stop_reason` (`max_tokens`, `refusal`) *before*
  executing any tool.
- `tool_choice` is always `auto` (forced tool use is rejected by this model).
- The server-side refusal fallback (`fallbacks: "default"` with its beta header) is
  enabled by default, as the reference recommends for this model; it is a single
  config flag and can be dropped.
- Streamed history is **append-only and stored verbatim**: assistant content blocks
  (including any thinking blocks) are saved as returned and replayed unchanged, never
  edited or compacted, so the provider's history checks keep passing after reload.
- Parallel tool calls are allowed; all `tool_result` blocks go back in one user message.

### 9.3 Tool catalog (one source, generated)

Each agent-visible Rust operation carries an `x-bonyad-tool` OpenAPI extension:
`name`, `version`, `description`/applicability, `kind: read | mutation`, and its
auth requirement (always "caller JWT"). `just contract` emits `tools.json` from
`openapi.json`; the agent service loads only that file; CI fails if it drifts. The
error contract is the same `problem+json` the UI uses, passed to the model as the
`tool_result` body with `is_error: true`.

Initial tools: `get_project_state` (read), `measure_line` (read),
`measure_surface` (read), `create_point`, `move_point`, `create_line`,
`create_surface` (mutations). Points are referenced by id **or label**
(`unique(project_id, label)`), resolved in Rust. `expected_revision` is **not** in
the model's schema: the dispatcher injects the run's latest known revision (starting
revision, then each accepted result), so a concurrent human edit surfaces as a
`409` tool error and the model re-reads state.

A model response alone never changes state: only a validated tool call that Rust
accepts does.

### 9.4 Execution context and policy

A run carries: actor and project identity, starting revision, the user task, entity
references the UI attaches (e.g. current selection), unit and frame, the tool list,
and limits. Everything else is fetched through tools, not stuffed into the prompt.

**Execution policy, defined once** (stored on the run, default for this lab):
authorized edits by the project's owner execute automatically, no per-call
confirmation, bounded by limits: 12 model steps, 30 tool calls, a per-run output
token cap and a 120 s wall clock (all env-tunable). There is no `ask` mode in this
slice.

**Idempotency.** Mutation tools send `Idempotency-Key = tool_use.id`. Rust stores
`(project_id, key) → result` in the same transaction as `accept_changeset`; a retry
returns the stored result and creates nothing.

### 9.5 Persistence

Added to schema `bonyad` (all RLS: owner only):

```sql
conversations(id, project_id, owner_id, title, created_at)
messages(conversation_id, seq, role, text,                 -- text: what the UI shows
         provider_content jsonb)                            -- verbatim provider blocks, for replay
runs(id, conversation_id, project_id, owner_id, status,     -- running|completed|failed|cancelled
     model, task, policy jsonb, limits jsonb, usage jsonb,
     start_revision, end_revision, error jsonb, started_at, finished_at)
run_events(run_id, seq, type, data jsonb, created_at)       -- the streamed log, append-only
tool_calls(run_id, tool_use_id, tool_name, tool_version, kind, input jsonb,
           output jsonb, status, idempotency_key,
           revision_before, revision_after, started_at, finished_at)
```

Model text is stored as claims in `messages`; tool results are stored in
`tool_calls` and are the verified facts. The UI labels them differently.

### 9.6 Streaming events

`run_started`, `text_delta`, `tool_started` (only once the arguments are complete and
validated), `tool_completed`, `tool_failed`, `run_completed`, `run_failed`,
`run_cancelled`. Each has `run_id`, `seq`, `request_id`. Partial argument fragments
never leave the agent service; private reasoning is never emitted.

### 9.7 Cancellation and failure

- **Cancel** (`POST /agent/runs/{id}/cancel` or the client aborting): abort the
  provider stream, schedule no further tool calls. A mutation already in flight
  finishes (it is atomic) and is recorded. Terminal event: `run_cancelled` with the
  list of revisions the run committed.
- **Provider failure / timeout / limit hit:** `run_failed` with the cause and the
  same committed-revisions list. Because each accepted tool call is its own atomic
  revision, the project is always valid; the report says what already landed.
- **Retries:** the SDK's bounded retries for transport errors; mutation retries are
  safe through idempotency.

### 9.8 Scenarios (acceptance)

1. *"Create points A(0,0), B(4,0), C(0,3), a line from A to B, and a triangular
   surface. Tell me the length and area."* → inspect, four mutations, two
   measurements, answer **length 4 m, area 6 m²**; entities visible in the drawing
   and property panel without a manual refresh.
2. *"Move B to (8,0) and recalculate."* → **8 and 12**; same after reload.

### 9.9 Verification additions

Deterministic (`bun test` + real Rust API + real DB, scripted `FakeProvider`):
tool arguments rejected before execution; human and agent get the same
authorization result (cross-user denied for both); a retried mutation creates no
duplicate; cancel stops scheduling and records the outcome; provider failure leaves
valid state and reports committed revisions; reload restores conversation and
outcomes. Playwright: the streaming UI and tool progress at 360 px.
Opt-in `just agent-smoke`: one real Anthropic stream through scenario 1 and 2.
Routine CI never calls the provider.

## 10. Environment notes

- **Port isolation.** Another project's Supabase stack holds 5432, 8000, 3000, 6543.
  Bonyad uses compose project `bonyad` and the range 55xxx
  (DB 55432, API gateway 58000, Studio 53000, Rust API 58080, web 5173).
- **Disk.** 45 GiB free (96% used); the image set is several GB. Watch it.
- Missing tools to install: `sqlx-cli`. `psql` is optional (use `docker exec`).
