# ADR 0002 — Reduced first slice and repository layout

Date: 2026-10-21 · Status: **proposed** (owner-directed scope; layout recorded as RFC
Q1 "YES, AMENDED"; the remaining RFC questions are still open)

Context: [RFC #5](https://github.com/mbaneshi/bonyad/discussions/5), issue
[#6](https://github.com/mbaneshi/bonyad/issues/6), and the
[first-slice design](../superpowers/specs/2026-10-21-first-slice-design.md).

## Decision

The first milestone is a **single-user, current-state drawing workspace**. Stable
identity and an explicit unit start now; revision machinery does not. Additional
infrastructure must earn its place in the working example.

| # | Decision | Replaces / defers |
|---|---|---|
| 1 | One project, one user, 2D Cartesian, one unit (metres) | The multi-user, owner-scoped model |
| 2 | **Independent geometry**: a line owns its endpoints, a surface owns its boundary vertices; equal coordinates imply no connection | Points shared by reference between lines and surfaces |
| 3 | Seven operations: `CreatePoint`, `CreateLine`, `CreateSurface`, `UpdateGeometry`, `DeleteEntity`, `GetProject`, `MeasureEntity`; the UI and the agent use only these | Changesets with `expected_revision` and `accept_changeset` |
| 4 | Layout `db/`, `logic/`, `ui/`, `agent/`, plus `contracts/`, `infra/`, `tests/e2e/`; **no `core/` crate yet** | `crates/`, `apps/`, `services/` layout; a `core` crate holding abstractions |
| 5 | Geometry types and validation errors live in `logic/crates/geometry`, free of database and network I/O | A shared abstraction layer built ahead of need |
| 6 | Agent tools use a small explicit mapping to API operations, guarded by a contract test against the generated OpenAPI document | A tool catalog generator framework |
| 7 | Generated clients live under `ui/src/api/generated/`; login and `auth/` are deferred | JWT forwarding, `supabase-js` login |
| 8 | Database guarantees are tested with SQLx integration tests; no pgTAP | A pgTAP spike |
| 9 | One migration history in `db/migrations/`; geometry stays free of I/O; credentials stay server-side | — (kept) |
| 10 | Retries are made safe by an optional client-chosen entity `id` (same id and content returns the existing entity; same id, different content is `id_in_use`); the agent derives it from `tool_use.id` | A server-side idempotency-key table |
| 11 | The agent service owns its conversation and run records in schema `agent`; the Rust server remains the only writer of engineering tables | Rust persisting agent records |
| 12 | Local lab security posture: no authentication, services bound to `127.0.0.1`, not for network exposure | RLS policies and a verified-token trust boundary |

## Consequences

- Milestone order is current state → revision → relationships and constraints →
  composition → a surveying capability. Each is introduced when an implemented case
  needs it, and none leaves empty tables or frameworks behind.
- Adding login and row-level security later is a deliberate step with its own RFC.
- Independent geometry means moving a shared coordinate does not move other entities.
  Relationships arrive in milestone 3, as explicit dependencies.
- Without revisions there is no history in this milestone; a successful edit replaces
  the current state.

## Working assumptions (not yet resolved in the RFC)

Vendoring the official Supabase compose, pinned, with our overrides (Q2); applying
migrations with `sqlx migrate` from a one-shot service (Q4); the newest crate majors,
verified when first built (Q5); no UI component library or router yet (Q6); Bun for
the agent (Q7). Work proceeds on these and each stays reversible until the owner
answers.
