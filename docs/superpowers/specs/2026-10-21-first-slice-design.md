# First slice — a small working drawing workspace (design)

Status: **draft**, aligned on 2026-10-21 with the owner's reduced scope. The design
describes Milestone 1, which is now implemented through the database, Rust API,
React UI, Bun agent, browser tests and CI. The automated agent path uses a scripted
provider; a real-provider smoke run remains the final acceptance gap. Choices marked *(working assumption)* follow the drafter's
recommendations in [RFC #5](https://github.com/mbaneshi/bonyad/discussions/5) and
stay reversible until the owner resolves them there.

## 1. Scope

**One project, one user, 2D Cartesian coordinates, one explicit unit (metres).**

The user — or the agent — can:

1. Create points, lines, and a simple polygonal surface.
2. See them in a drawing view and an entity list.
3. Select an entity and edit its geometry.
4. Calculate line length and surface area.
5. Save automatically and recover the accepted state after a reload.
6. Ask Anthropic to perform those same operations, with progress streamed into the UI.

**Independent geometry.** A line owns its two endpoints; a surface owns its ordered
boundary vertices. Equal coordinates do not imply a connection.

**Stable identity and an explicit unit start now. Revision machinery does not.** A
successful edit updates current state; reconstructing history is the next milestone.

### Not in this milestone

Authentication and login, row-level security, revisions and changesets, atomic
revision acceptance, idempotency keys, relationships between entities, constraints,
composition, reusable definitions, file storage, geographic coordinate systems,
holes and curves. The manifesto describes where these go; each later milestone must
be earned by the working example, and no empty tables or frameworks are kept for them.

### Acceptance example

```text
Point:   (1, 1)
Line:    (0, 0) → (4, 0)
Surface: (0, 0), (4, 0), (0, 3)
```

Length **4 m** and area **6 m²**. Edit the surface vertex (4, 0) to (8, 0): area
**12 m²**. Reload and recover the same state. Run it manually and through the agent,
on desktop and mobile. Invalid geometry shows an understandable error and leaves
accepted data unchanged.

## 2. Repository layout

```text
bonyad/
├── db/
│   ├── migrations/        # the ONLY schema history (tables, constraints, functions)
│   ├── seeds/             # the project row; the acceptance example
│   └── (tests live in Rust: SQLx integration tests)
├── logic/                 # Rust workspace
│   ├── Cargo.toml
│   └── crates/
│       ├── geometry/      # concrete types, validation errors, calculations; no I/O
│       ├── persistence/   # SQLx queries and mapping
│       └── server/        # axum API, error mapping, OpenAPI, tracing
├── ui/                    # React + TypeScript
│   └── src/
│       ├── api/generated/ # generated client (never hand-edited)
│       ├── drawing/       # viewport and geometry presentation
│       ├── components/    # reusable interface pieces
│       ├── workspace/     # panels, selection, interaction
│       └── agent/         # streaming conversation and tool progress
├── agent/                 # Bun + TypeScript agent service
│   └── src/
│       ├── provider/      # Anthropic SDK behind a narrow adapter
│       ├── tools/         # explicit tool ↔ API operation mapping
│       └── runtime/       # tool loop, streaming, cancellation, run records
├── contracts/             # generated OpenAPI document (committed, diff-checked)
├── infra/
│   ├── supabase/          # vendored official compose, pinned, plus our overrides
│   └── compose.yaml
├── tests/e2e/             # manual and agent workflows (Playwright)
├── docs/   site/   scripts/   justfile
```

There is deliberately **no `core/` crate**: concrete geometry types and their
validation errors live in `geometry/`. A shared abstraction is extracted only when an
implemented case needs it. `login`/`auth/` are deferred.

One feature, concretely:

| Point feature | Location |
|---|---|
| Point table and database rules | `db/migrations/` |
| Point type and geometric rules | `logic/crates/geometry/` |
| Read/write SQL | `logic/crates/persistence/` |
| Create/update endpoint | `logic/crates/server/` |
| Generated TypeScript API | `ui/src/api/generated/` |
| Point display and editing | `ui/src/drawing/` |
| Agent invokes point operations | `agent/src/tools/` |
| Verify creation, edit and reload | `tests/e2e/` |

## 3. Data model (schema `bonyad`)

```sql
projects(id uuid pk, name text, unit text check (unit = 'm'),
         frame text check (frame = 'local-cartesian'), created_at timestamptz)

entities(id uuid pk, project_id uuid fk, kind text check (kind in ('point','line','surface')),
         label text, created_at timestamptz, updated_at timestamptz,
         unique (id, kind))

points(entity_id uuid pk, kind text check (kind = 'point'),
       x double precision, y double precision,           -- finite
       foreign key (entity_id, kind) references entities (id, kind) on delete cascade)

lines(entity_id uuid pk, kind text check (kind = 'line'),
      x1, y1, x2, y2 double precision,                    -- finite; the line owns its endpoints
      foreign key (entity_id, kind) references entities (id, kind) on delete cascade)

surfaces(entity_id uuid pk, kind text check (kind = 'surface'), foreign key ... )
surface_vertices(entity_id uuid, position int, x, y double precision,   -- finite
                 primary key (entity_id, position),
                 foreign key (entity_id) references surfaces (entity_id) on delete cascade)
```

The `(id, kind)` composite key makes a `points` row impossible for a non-point
entity. The boundary is stored open (A, B, C) and drawn closed.

Ownership rule *(working assumption)*: **PostgreSQL** owns integrity (keys, kinds,
finite numbers). **Rust** owns geometry rules (zero-length lines, polygon validity)
and all calculations; the database never recomputes geometry.

The agent's own records live in a separate schema `agent` (section 6), written only
by the agent service. Engineering tables are written only by the Rust server.

## 4. Operations (the minimal contract)

Every operation has a name, typed input, typed result and explicit failure. The UI and
the agent both reach engineering data **only** through these; neither writes engineering
tables directly.

| Operation | HTTP | Input | Result |
|---|---|---|---|
| `GetProject` | `GET /v1/project` | — | project (`unit`, `frame`) and all entities with geometry |
| `CreatePoint` | `POST /v1/points` | `id?`, `label?`, `x`, `y` | entity |
| `CreateLine` | `POST /v1/lines` | `id?`, `label?`, `a{x,y}`, `b{x,y}` | entity |
| `CreateSurface` | `POST /v1/surfaces` | `id?`, `label?`, `vertices[{x,y}]` | entity |
| `UpdateGeometry` | `PUT /v1/entities/{id}/geometry` | geometry of the entity's own kind | entity |
| `DeleteEntity` | `DELETE /v1/entities/{id}` | — | `204` |
| `MeasureEntity` | `GET /v1/entities/{id}/measure` | — | line: `length`; surface: `area`, `perimeter`; with `unit` |

Plus `GET /healthz`. Errors are `application/problem+json` with a stable `code`
and, for geometry, `violations[{code, path, message}]`:

| Code | Meaning | Status |
|---|---|---|
| `non_finite_coordinate` | NaN or infinite value | 422 |
| `zero_length_line` | endpoints coincide | 422 |
| `too_few_vertices` | surface has fewer than 3 vertices | 422 |
| `degenerate_surface` | area is effectively zero | 422 |
| `self_intersecting_surface` | boundary crosses itself | 422 |
| `kind_mismatch` | geometry kind differs from the entity's | 422 |
| `not_measurable` | measuring a point | 422 |
| `not_found` | unknown entity | 404 |
| `id_in_use` | client id already exists with different content | 409 |

Every operation follows one path:

```text
validate geometry → calculate or prepare the change → persist (one transaction) → return the accepted result
```

A rejected change leaves persisted state untouched.

**Retries without a framework.** `Create*` accept an optional client-chosen `id`
(UUID). Repeating the same create with the same id and content returns the existing
entity; the same id with different content is `id_in_use`. The agent derives the id
from the model's `tool_use.id`, so a retried tool call cannot create a duplicate.

## 5. Logic (Rust workspace `logic/`)

- `geometry` — pure: `Point2`, `LineGeometry`, `SurfaceGeometry`, `Violation`;
  `validate_*`, `length`, `area` (shoelace, absolute), `perimeter`; simple-polygon
  test is the O(n²) segment-crossing check, adequate at this scale. **No database or
  network I/O.** Tolerances are named constants.
- `persistence` — SQLx typed SQL (no ORM; the schema is plain SQL and the queries are
  checked against it at compile time through SQLx's offline cache), transactions,
  row↔type mapping.
- `server` — axum + tokio; routes above; `utoipa` OpenAPI; `tracing` with request
  ids; problem+json mapping; binds to `127.0.0.1`.

Versions are pinned exactly and `Cargo.lock` is committed. The newest majors
(sqlx 0.9, utoipa 6) are verified when the workspace is first built *(working
assumption, RFC Q5)*.

## 6. Agent (`agent/`)

A stateless-in-engineering-terms Bun service on the official `@anthropic-ai/sdk`.
Responsibilities: model requests, streaming, a bounded tool loop, cancellation, and
basic persisted conversation/run records. The Rust server remains the only writer of
engineering tables.

- **Provider adapter.** A narrow `ModelProvider` interface (`stream(request)` yielding
  normalised events); `AnthropicProvider` implements it, a scripted `FakeProvider`
  drives tests. No second real provider.
- **Tools.** The seven operations in section 4, one tool each. A small **explicit
  mapping** (`tools/`) binds each tool to its HTTP operation. A **contract test** loads
  the generated OpenAPI document and fails if a tool has no operation, or its input
  schema no longer fits the operation's. Generating the mapping from OpenAPI is
  welcome if straightforward, but working execution comes first.
- **Loop.** Inspect through `GetProject`, change through the operations, calculate
  through `MeasureEntity`. A model response alone never changes state. Tool arguments
  are validated before execution; `tool_choice` is `auto`; assistant content is stored
  verbatim and appended, never edited (so provider history checks keep passing after a
  reload).
- **Limits.** Per run: 12 model steps, 30 tool calls, a token cap and a 120 s wall
  clock, all environment-tunable. Authorized edits run automatically; there is no
  per-call confirmation in this lab.
- **Streaming.** Server-sent events over a `fetch` POST. Events: `run_started`,
  `text_delta`, `tool_started` (complete, validated arguments only), `tool_completed`,
  `tool_failed`, `run_completed`, `run_failed`, `run_cancelled`. Private reasoning is
  never streamed.
- **Records (schema `agent`).** `conversations`, `messages` (display text plus the
  verbatim provider content), `runs` (status, model, usage, error, times) and
  `run_events` (the streamed log, so a reload can replay it). Tool calls appear as
  events. The UI labels model text as a claim and tool results as the verified facts.
- **Cancellation and failure.** Cancel aborts the provider stream and schedules no
  further tool calls; an operation already in flight finishes (it is one transaction)
  and is recorded. A provider failure ends the run as `run_failed` listing what was
  already committed. Because each operation is its own transaction, the project is
  always valid.
- **Credentials.** `ANTHROPIC_API_KEY` exists only in the agent service's environment.
  It never reaches the browser or the Rust server.
- Defaults: model `claude-opus-5-5` (overridable); adaptive thinking with effort set
  explicitly; the server-side refusal fallback on by default. Exact SDK call shapes
  are checked against the SDK documentation when this is implemented.

**Scenarios.** (1) *"Create a point (1,1), a line from (0,0) to (4,0), and a surface
with vertices (0,0), (4,0), (0,3). Tell me the length and area."* → length 4 m, area
6 m², entities visible in the drawing and properties without a manual refresh.
(2) *"Move the surface vertex (4,0) to (8,0) and recalculate."* → area 12 m², same
after reload. Deterministic tests run both scenarios with `FakeProvider`; a small
opt-in real-provider smoke test exercises Anthropic and is never part of routine CI.

## 7. UI (`ui/`)

React 19 + strict TypeScript on Vite; TanStack Query; a client generated from the
OpenAPI document into `src/api/generated/`; plain CSS with logical properties; a small
`fa.ts` string table. No router, form library or component kit until a screen needs one.

| Concern | Design |
|---|---|
| Drawing | One SVG: polygon, line, point; Y flipped (engineering up); `viewBox` fitted to the model |
| Entity list | Beside the drawing; selection works from either |
| Selection | Tap or click; 44 px invisible hit targets; no hover dependence |
| Properties | Side column on desktop; bottom sheet on mobile; `inputmode="decimal"`; keyboard-safe via `visualViewport` |
| Edit | Submit `UpdateGeometry`; show the new state only after the server accepts it |
| Errors | `422` → field-level message mapped from the stable code; network failure → disconnected banner with retry |
| RTL | `<html dir="rtl" lang="fa">`; coordinates and numbers in `<bdi dir="ltr">`; tabular figures |
| Agent panel | Streaming conversation, tool progress, results and errors, cancel; restored after reload |

## 8. Dependencies

| Purpose | Tool | Needed |
|---|---|---|
| HTTP server | axum + tokio | now |
| DB access | SQLx (typed SQL; no ORM) | now |
| Serialization, IDs | serde, uuid (v7 generated in Rust) | now |
| API contract | utoipa → `contracts/openapi.json` → `openapi-typescript` + `openapi-fetch` | now |
| Tracing | `tracing`, `tower-http` request ids | now |
| UI | Vite, React, TanStack Query, Vitest, Playwright | now |
| Agent | Bun, `@anthropic-ai/sdk`, Zod at boundaries | now |
| Local orchestration | Docker Compose (project `bonyad`), health checks | now |
| Dev commands | `just` | now |
| CI | GitHub Actions per area plus one summary job | with the first code PR |
| Migrations | `sqlx migrate` from a one-shot compose service *(working assumption, RFC Q4)* | now |
| Stack packaging | official Supabase compose vendored and pinned, our overrides, ports 55xxx *(working assumption, RFC Q2)* | now |
| Login, JWT verification, `supabase-js`, RLS, pgTAP, form/component libraries, router | — | deferred |

Supabase runs as the Postgres and tooling platform (Studio, and later Auth, Storage,
Realtime, Edge Functions). This slice uses only its database; availability of the
other services does not oblige us to invent a use for them.

## 9. Security posture for this milestone

This is a **local, single-user lab**. There is no authentication, so every service
binds to `127.0.0.1` and must not be exposed to a network. Credentials stay
server-side (`ANTHROPIC_API_KEY`, database passwords in an untracked `.env`);
`.env.example` holds placeholders only. Adding login and row-level security is a
deliberate later step, not an oversight.

## 10. Verification

1. A fresh database applies the migrations and the seed.
2. Geometry unit tests: line length 4; area 6; updating the vertex gives 12; each
   violation in section 4 is rejected.
3. SQLx integration tests against a real database: constraints reject non-finite values
   and kind mismatches; a rejected operation leaves persisted state unchanged; reload
   returns the accepted state.
4. The generated OpenAPI document matches the committed `contracts/openapi.json`; the
   generated client type-checks.
5. Manual workflow end to end on a narrow mobile viewport (about 360–390 px), a tablet
   and a desktop: no horizontal overflow, touch-friendly controls, keyboard-safe editing,
   Persian labels and mixed Persian/Latin coordinates readable, and usable loading,
   empty, error and disconnected states.
6. Agent, with `FakeProvider`: both scenarios; tool arguments validated before
   execution; the tool-mapping contract test; a repeated tool call creates no duplicate;
   cancellation stops scheduling further calls and records the outcome; a provider
   failure leaves valid state and reports what was committed; reload restores the
   conversation and outcomes.
7. Opt-in real-provider smoke test (needs an API key): scenario 1 then 2.

## 11. Milestones

| # | Milestone | What it proves |
|---|---|---|
| 1 | Current-state slice (this document) | Persist, compute, display, edit and automate |
| 2 | Revision | Record changes and recover earlier accepted states |
| 3 | Relationships and constraints | Express intentional dependencies between entities |
| 4 | Composition | Reuse a concrete group or definition with parameters |
| 5 | Surveying workflows | Add observations, coordinate systems, accuracy and calculations on the existing foundation |
| 6 | Further disciplines | Extend into civil, architecture, MEP, traffic and urban planning using the accumulated foundation |

Milestone 1 build order, one issue and one pull request each: (1) `infra/` stack and
`db/` migrations with the seed; (2) `logic/geometry`; (3) `logic/persistence` and
`logic/server`; (4) `ui/`; (5) `agent/`; (6) end-to-end tests and CI.

## 12. Environment notes

- Another project's Supabase stack holds host ports 5432, 8000, 3000 and 6543. Bonyad
  uses compose project `bonyad` and the range 55xxx.
- Disk: 45 GiB free (96% used) when this was written; the image set is several GB.
- `sqlx-cli` is not installed and is needed for migrations.
- No Anthropic credentials are present on this machine; the real-provider smoke test
  waits on a key.
