# Bonyad state check — 2026-10-21 21:45:44 +0330

Inspection only. No implementation, dependency installation, database reset, merge,
push, or GitHub-record change was performed for this report.

## Executive summary

Bonyad's first milestone is implemented and operational locally and on `dev`.

Current evidence:

- `dev` is clean and synchronized with `origin/dev`.
- PRs #22 and #23 are represented in the merged history.
- The workspace-header fix is on `dev`.
- Rust formatting, Clippy, and 66 tests pass.
- Agent tests pass: 49 tests, 0 failures.
- The local Rust API, agent, and all 11 Supabase containers are healthy.
- The real Anthropic smoke test previously passed both acceptance scenarios.

The main remaining concerns are documentation alignment, the absence of an accepted
revision contract, and a validation guardrail in the persistence layer.

## 1. Repository snapshot

### Local Git state

```text
branch: dev
HEAD:   218d4b3 docs: mark milestone 1 as implemented
remote: origin/dev
status: clean and synchronized
```

Recent history:

```text
218d4b3 docs: mark milestone 1 as implemented
254ce6f agent: send ANTHROPIC_WORKSPACE_ID for keys not scoped to a workspace
a144be4 Merge pull request #23 from mbaneshi/feat/21-e2e-ci
35bd686 Merge pull request #22 from mbaneshi/feat/18-agent
```

### Worktrees

| Worktree | Branch | State |
|---|---|---|
| `/Users/bm/sub-biz/bonyad` | `dev` | active and clean |
| `/Users/bm/sub-biz/bonyad/.worktrees/fix/24-workspace-id` | `fix/24-workspace-id` | existing and clean |
| local branch `main` | `main` | at `f473f48` |

The workspace-ID worktree is now redundant because its change is included in `dev`,
but it was not removed or disturbed.

### Issues and pull requests

Live GitHub issue/PR status was unavailable during inspection because the GitHub API
and SSH endpoint could not be reached. The following is based on local Git evidence:

- PR #10 — infrastructure/database: merged.
- PR #11 — geometry: merged.
- PR #15 — Rust API: merged.
- PR #19 — UI: merged.
- PR #22 — agent: merged.
- PR #23 — E2E tests and CI: merged.
- Issue/PR #24 — workspace-ID handling: its code is included in `dev` as `254ce6f`.
- Issue #17 — engineering research: represented by the research merge before the
  first-slice implementation work.

Relevant design references include RFC #5, issue #6, and the decision/layout work
around PR #9.

## 2. What exists

| Area | Implemented | Verified | Missing | Evidence |
|---|---|---|---|---|
| Database | Projects, entities, points, lines, surfaces, ordered surface vertices, and agent conversation/run/event tables | SQLx persistence tests, API tests, and live local database | Revisions, changesets, relationships, domain constraints as data, auth/RLS | `db/migrations/` |
| Domain logic | Pure point, line, and surface types; validation; length, area, perimeter | 28 unit tests, 3 acceptance tests, 6 shape/serialization tests | CRS, uncertainty, richer units, dependencies | `logic/crates/geometry/` |
| Persistence | Typed SQLx store; transactional create/update; idempotent create IDs; cascading delete | 15 persistence tests | Revision history and compare-and-swap acceptance | `logic/crates/persistence/` |
| Rust API | Seven operations plus health and OpenAPI endpoints | 13 API tests and 1 contract test | Authentication, revision acceptance, preview/changeset API | `logic/crates/server/` |
| Application orchestration | Route validation to persistence; agent loop to validated tool to Rust API | Rust and agent tests | Separate revision/application orchestration layer | `logic/crates/server/`, `agent/src/loop.ts` |
| UI | React drawing, entity list, forms, measurements, Persian/RTL input, agent chat, reload handling | Historical CI/E2E evidence and manual browser use; UI tests exist | Preview/approval and revision UI | `ui/src/` |
| Agent | Anthropic provider, fake provider, seven tools, Zod validation, SSE, cancellation, history, workspace header | 49 tests; real-provider smoke previously passed both scenarios | Approval/preview mode and revision-aware tools | `agent/src/` |
| Infrastructure | Pinned local Supabase stack and localhost Rust/UI/agent commands | All 11 containers healthy; API and agent health checks passed | Production deployment, authentication, network exposure model | `infra/`, `justfile` |
| Research | LandXML, CRS/ISO 19111, polygon area, prior art, and current-slice mappings | Research documents and reference cases | Survey observations, sample import, wider disciplines | `docs/research/` |

### Checks executed during this inspection

Executed now:

```text
git diff --check                         passed
node site/scripts/sync-docs.mjs          passed
cargo fmt --check                        passed
cargo clippy --all-targets -D warnings  passed
cargo test                               66 passed, 0 failed
bun test                                 49 passed, 0 failed
Rust API health                          status ok, database ok
Agent health                             status ok, database ok
Supabase stack                           11 containers running
```

Not rerun during this inspection:

- UI test/build suite.
- Playwright browser suite.
- Real Anthropic smoke test.

Those have been reported or executed earlier in the workspace; `agent/README.md`
records that the real smoke test passed both scenarios.

## 3. Milestone map

### Milestone 1 — current-state point/line/surface slice

Observable outcome: a person and an agent can create, inspect, measure, edit, delete,
reload, and recover points, lines, and surfaces through the same seven operations.

Dependencies: PostgreSQL/Supabase, Rust geometry/API, React UI, Bun agent, OpenAPI
contract, and browser tests.

Status: **implemented and verified**.

Acceptance evidence:

- `(0,0) → (4,0)` measures `4 m`.
- The triangle has area `6 m²`.
- Moving `(4,0)` to `(8,0)` gives `12 m²`.
- Invalid geometry leaves accepted state unchanged.
- Reload preserves state.
- The real provider completed both scenarios.

### Milestone 2 — revisions and safe acceptance

Observable outcome: accepted state has a stable revision; stale updates become explicit
conflicts; earlier accepted states can be recovered.

Dependencies: stable identity, a revision contract, snapshot/changeset representation,
and revision-aware API/agent operations.

Status: **not implemented**. The direction exists in the manifesto and proposed ADR 0001,
but is not an accepted decision.

Open decisions include project-wide versus entity-level revisions, snapshot versus
changeset representation, stale-conflict shape, and preview semantics.

### Milestone 3 — preview and intentional dependencies

Observable outcome: a request can be evaluated without mutation; intended changes and
dependencies are visible; acceptance is checked against an expected revision; derived
results identify inputs and procedure versions.

Dependencies: revisions plus explicit relationship/dependency concepts.

Status: **not implemented; requirements remain uncertain**.

Do not introduce a generic dependency framework before a concrete preview scenario
demonstrates the required shape.

### Milestone 4 — reusable composition

Observable outcome: a validated collection can become a reusable definition, with a clear
distinction between definition and instance.

Dependencies: identity, relationships, dependencies, revisions, and a repeated engineering
structure that proves composition is needed.

Status: **future direction only**.

No generic plugin, universal schema, or composition framework is justified yet.

### Milestone 5 — surveying capabilities

Observable outcome: survey observations, coordinate conventions, accuracy/uncertainty,
and calculations use the accumulated foundation rather than a parallel model.

Dependencies: revisions, explicit relationships, coordinate-axis and CRS semantics,
observation/uncertainty concepts, and a legitimate sample dataset.

Status: **research underway; implementation not started**.

The research identifies axis order, CRS, point uncertainty, references, and planar versus
geodesic procedures as likely concepts, but does not yet fix their domain model.

## 4. Architecture check

### Strong boundaries

- `logic/crates/geometry` is pure and has no database, network, async, or framework I/O.
- PostgreSQL owns persistent state and integrity constraints.
- Rust owns geometry rules, computation, persistence, and API behavior.
- React uses the generated API client.
- The agent has no engineering-table database access and invokes the same Rust API.
- OpenAPI and agent contract tests detect operation drift.

### Transactional writes

Create and geometry replacement use explicit transactions. Database constraints provide
foreign keys, kind pinning, finite-number checks, unique IDs, ordered surface vertices,
and cascading deletion. Delete is one atomic SQL statement with cascading cleanup.

These guarantees are covered by persistence and API tests.

### Validation guardrail gap

HTTP routes call geometry validation before persistence, but the public persistence methods
`Store::create` and `Store::replace_geometry` do not call full geometry validation themselves.
The database cannot enforce zero-length lines or self-intersection.

Current callers are safe, so this is not a current Milestone 1 behavior failure. It is a
concrete future guardrail weakness: another caller could bypass domain validation by using
the persistence layer directly.

### Concurrency limitation

Without revisions, concurrent updates are last-write-wins. This is an intentional Milestone
1 limitation, not an accidental implementation defect, and is the primary reason Milestone
2 needs an accepted compare-and-swap contract.

## 5. Research status

Deep coverage exists for:

- LandXML 1.2 points, lines, and parcels.
- CRS concepts from ISO 19111 / OGC material.
- Planar versus geodesic polygon area.
- Reusable geodesic calculation prior art.
- Mapping current point/line/surface concepts to LandXML.

Inventory-only coverage exists for GeoJSON, GTFS, OpenDRIVE, EPANET, SUMO, OpenSees,
LandXML surfaces, and alignments.

Known gaps include survey observations, IFC, DXF, CityGML details, EPSG terms, structural
standards, urban planning, quantities, scheduling, facilities, and project management.

### Bounded research task

Study **LandXML Survey observations plus one legitimately redistributable sample file**.

Deliverables:

1. A mapping of instrument setups, observations, point references, and direction conventions.
2. One sample file with a known result.
3. A throwaway validation/import experiment outside product code.
4. A list of concepts genuinely required for the surveying milestone.

This can proceed alongside implementation without adding a parser, CRS table, or new
dependency.

## 6. Recommended next task

Before coding revisions, define and accept a focused Milestone 2 contract:

> One revisioned `UpdateGeometry` flow with a snapshot, expected-revision compare-and-swap,
> explicit stale-conflict response, and reload behavior.

Why this is the smallest useful next step:

- It directly tests the manifesto's change contract.
- It avoids designing all relationships and composition prematurely.
- It exposes whether the proposed revision model is sufficient before it spreads through
  the UI and agent.
- ADR 0001 is still proposed, so implementation should follow an accepted RFC/decision.

Acceptance checks:

- Current-revision update succeeds.
- Stale-revision update returns a stable conflict error.
- The stale update changes no current state.
- The accepted update creates a recoverable prior state.
- Reload returns the same current revision and geometry.
- UI and agent use the same revision-aware operation.
- Concurrent-update tests demonstrate no silent overwrite.

Outside scope:

- Relationships and constraints.
- Composition.
- Authentication.
- CRS and surveying.
- Generic event sourcing.
- Collaborative editing.

## Documentation follow-up

The implementation is ahead of a few documents:

- `CONTRIBUTING.md` still begins by describing Bonyad as being at design stage.
- Root README and site status text still describe the real-provider smoke test as pending.
- `agent/README.md` correctly records that the real smoke test passed.

These should be reconciled in a documentation-only change before Milestone 2 work.

## Final recommendation

Treat Milestone 1 as complete. Reconcile the remaining status text, then open and accept
a focused revision RFC before implementing revision-aware `UpdateGeometry`.
