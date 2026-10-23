# ADR 0003 — Procedure registry: procedures described in the database, executed in Rust

> **Parked until the core model is defined.** This was written before the data model, procedures, goals, contracts and
> rules exist in the database and in Rust. Read it as draft input, not as a plan: no work starts from it. It will be
> reviewed and amended once the model exists. Kept and built on in the meantime: the entity inventory (`catalogue/`) and
> the file-format research (`docs/research/formats/`).

Date: 2026-10-23 · Status: **proposed** (founder direction: "entity in db, procedure in
db, harness in db"; needs an RFC Discussion before any code, per `CONTRIBUTING.md`)

Context: [manifesto](../manifesto.md) sections 3, 5, 7 and 8,
[ADR 0002](0002-reduced-first-slice.md), the
[milestone 3 design](../superpowers/specs/2026-10-22-milestone-3-3d-and-civil-design.md)
(section 5.3 derived results, section 14 slices), and the procedure study
[polygon area](../research/procedures/polygon-area.md).

## Problem

The manifesto names procedures as a core concept ("how something is calculated or
transformed") and demands that every result be "tied to its inputs and the procedure
version". Today a procedure is only a Rust function (`bonyad_geometry::measure`). The
database cannot answer: *which procedures exist, what do they accept and promise, which
version produced this number?* The agent's tools are hand-written TypeScript
(`agent/src/tools.ts`), so a model cannot discover what is computable from the data.

The milestone 3 design adds a `results` table that records *runs* but not *definitions*.
Without a definition table, a result's `procedure_version` points at nothing.

## Decision

| # | Decision |
|---|---|
| 1 | **The database holds a description of each procedure; Rust holds the only implementation.** A row never causes execution. A procedure runs only if the server binary contains a matching implementation. This keeps manifesto section 7 ("exactly one executable owner") and section 8 (no plugin framework). |
| 2 | Three typed tables in schema `bonyad`: `procedures` (identity and meaning), `procedure_versions` (immutable contract), `procedure_runs` (one row per persisted execution). No JSON attribute bag for entity data. Parameter and result *shapes* are stored as JSON Schema documents, because they describe a contract rather than hold engineering state. |
| 3 | **Versions are immutable.** A contract change (inputs, outputs, units, preconditions, numerical method) inserts a new `procedure_versions` row with a higher version number. A row is never updated. A bug fix with unchanged contract still bumps `implementation_version`, so old results stay attributable to old behaviour. |
| 4 | **The contract is generated from Rust types**, not typed twice. Each procedure's input and output types derive a JSON Schema. At server start a registry compares compiled contracts with the database and **inserts missing versions**; if a stored version's contract differs from the compiled one, the server **refuses to start**. A CI check fails on drift. |
| 5 | **Procedures do not write accepted state.** A procedure has an `effect` of `read` (pure measure or query) or `propose` (returns a typed change set). A `propose` result reaches the model only through the existing revision commit with `expected_revision` (milestone 2), so concurrency conflicts stay visible. |
| 6 | **Runs are persisted only when the result must be remembered**: tier 2 cached derivations (milestone 3 section 5.3) and any invocation made through the agent harness. On-demand `GET` measures stay side-effect free and return `{input_revision, procedure_key, procedure_version}` in the response instead. |
| 7 | `procedure_runs` **replaces** the `results` table proposed in milestone 3 section 5.3, so there is one run record, not two. Typed output tables (for example `terrain_triangles`) reference `procedure_runs.id`. |
| 8 | A run records the exact `input_revision`, the procedure version, the parameters, a status (`succeeded`, `failed`, `unknown`), and validation findings. **`unknown` is distinct from `succeeded`**: a rule or check that cannot be evaluated never counts as a pass. |
| 9 | The agent tool catalogue is **derived from the registry** for registered procedures: the model sees each procedure's purpose, contract and effect. Calls still go through the same API operations as the UI, and the contract test (ADR 0002 decision 6) extends to cover the registry. |
| 10 | Harness-as-data (harness version, allowed procedure set, validation policy, budgets) is **out of scope here**. It is a follow-up ADR that depends on this one. The control loop stays code. |

## Schema sketch (illustrative, not a migration)

```sql
create table bonyad.procedures (
  key         text primary key,            -- 'geometry.measure_surface', 'civil.earthwork'
  title       text not null,
  purpose     text not null,               -- what it does and when to use it
  discipline  text not null,
  effect      text not null check (effect in ('read', 'propose'))
);

create table bonyad.procedure_versions (
  procedure_key          text not null references bonyad.procedures(key),
  version                integer not null check (version >= 1),
  implementation_key     text not null,    -- registry key into compiled Rust
  implementation_version integer not null,
  input_schema           jsonb not null,   -- generated from Rust types
  output_schema          jsonb not null,
  preconditions          text not null,    -- units, frame, assumptions, in prose
  tolerances             jsonb,
  created_at             timestamptz not null default now(),
  primary key (procedure_key, version)
);

create table bonyad.procedure_runs (
  id                uuid primary key,
  project_id        uuid not null references bonyad.projects(id) on delete cascade,
  procedure_key     text not null,
  procedure_version integer not null,
  input_revision    bigint not null,
  params            jsonb not null,
  status            text not null check (status in ('succeeded', 'failed', 'unknown')),
  invoked_by        text not null,         -- 'ui', 'agent', 'api'
  computed_at       timestamptz not null default now(),
  foreign key (procedure_key, procedure_version)
    references bonyad.procedure_versions(procedure_key, version),
  foreign key (project_id, input_revision)
    references bonyad.revisions(project_id, revision)
);
```

Rust side: a small `ProcedureRegistry` in the server crate maps `(implementation_key,
implementation_version)` to a typed handler. The geometry crate stays free of I/O and of
the registry (ADR 0002 decision 5).

## Alternatives considered

- **Keep procedures as code only.** Simplest, and today's state. Rejected: staleness and
  provenance (manifesto section 5) need a definition to point at, and the agent cannot
  discover capabilities.
- **Implement procedures in SQL or Edge Functions.** Rejected: violates "one executable
  owner"; numerical work belongs in Rust.
- **Store parameter and result data in a generic attribute bag.** Rejected: an
  entity-attribute-value store is an explicit anti-goal.
- **Plugin or WASM procedures loaded from rows.** Rejected: a plugin framework is an
  anti-goal, and data must never introduce execution. New capability means a new, reviewed
  binary.
- **Keep both `results` and `procedure_runs`.** Rejected: two run records for the same fact.

## Consequences

- Every new 3D and civil procedure registers itself from its first slice. Retrofitting
  later would mean backfilling versions for results already written.
- Milestone 3 section 5.3 must be amended: `results` becomes `procedure_runs`. The tier 1
  versus tier 2 split is unchanged.
- Server startup gains a fail-fast contract check. A contract edit without a version bump
  becomes a build or boot failure, which is the point.
- JSON Schema columns describe contracts only. If a procedure's output needs querying or
  joining, it gets a typed table, as terrain triangles do.

## Verification (to be written as tests)

1. Registering a procedure inserts its versions; restarting changes nothing (idempotent).
2. Editing a compiled contract without bumping the version stops the server at boot.
3. A registry row with no compiled implementation returns `unsupported_implementation`
   and executes nothing.
4. A `read` procedure leaves the revision head unchanged; a `propose` procedure changes
   it only through a commit that carries `expected_revision`.
5. Two concurrent commits from revision 42: one wins, the other gets a conflict, and no
   half-written run or state remains.
6. Reference case, first registered procedure: surface (0, 0), (4, 0), (0, 3) measures
   area 6, with a run row naming the procedure version and input revision.
7. The agent's tool list for registered procedures matches the registry, checked by the
   contract test.

## Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Should `artifact_hash` (identity of the exact compiled build) be stored per version, or is `implementation_version` plus the git revision enough? | Version number plus build revision recorded on the run; a content hash adds little in a lab setting |
| Q2 | JSON Schema generator: `schemars` on the Rust types, or derive from the existing `utoipa` OpenAPI components? | Reuse `utoipa` output to avoid a second schema system, verified when first built |
| Q3 | Do harness-invoked runs of `read` procedures persist, or only tier 2 and `propose` runs? | Persist all harness-invoked runs (cheap, gives an audit trail); keep plain UI `GET`s unpersisted |
| Q4 | First slice to register: polygon area (exists, simple) or earthwork volume (needs milestone 3 terrain)? | Polygon area, as slice S0c, before S1 |
| Q5 | Do existing 2D measures get retroactive version `1` rows? | Yes, registered at the same time as S0c |

## Status and next step

Proposed. Open an RFC Discussion linking this record and the milestone 3 design. If
accepted: amend milestone 3 section 5.3, add slice **S0c** (registry migration and
server, proven on polygon area) after S0b, and write the harness-as-data ADR.
