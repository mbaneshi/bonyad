# RFC draft: procedures typed against ports, entities owned by domains

> **Parked until the core model is defined.** This was written before the data model, procedures, goals, contracts and
> rules exist in the database and in Rust. Read it as draft input, not as a plan: no work starts from it. It will be
> reviewed and amended once the model exists. Kept and built on in the meantime: the entity inventory (`catalogue/`) and
> the file-format research (`docs/research/formats/`).

**Status:** posted for discussion as
[Discussion #60](https://github.com/mbaneshi/bonyad/discussions/60) (category Ideas, because the
repo has no RFC category yet; `CONTRIBUTING.md` asks for one). Not a decision. Nothing here changes ADR 0003, the `proc.*` migration or any product code.

## Problem

Bonyad will hold entities from several domains (drawing, civil, BIM, CAE). A Civil 3D surface,
a Revit toposurface and an AutoCAD surface are three different things (see
`docs/research/procedures/`). Two failure modes follow:

1. **Share the entities** and build a universal ontology that fits none of them.
2. **Share nothing** and write `offset`, `overlay` and `measure` once per domain.

The prototype in this folder leans to the second: its 135 contracts name concrete input types
(`Geometry2`, `Ring2`, `Body`). It also fuses a procedure's contract with its implementation:
`proc.procedure_version` carries `impl_kind`, `impl_key` and `impl_hash`, and the prototype's
`Run` implementations sit in the same crate as the contracts, which now depends on
`bonyad-geometry`.

## Proposal

Four layers. Entities stay domain-owned; reuse comes from small typed interfaces.

| Layer | Shared? | Contents |
|---|---|---|
| Kernel | Yes, thin and stable | identity, revision and commit, quantity with unit and frame, tolerance policy, `Outcome`, contract format |
| Ports | Yes, by interface | Small typed interfaces such as `Region2D`, `Surface3D`, `Placed`, `HasQuantity`. An entity type declares which ports it implements, as a Rust type implements a trait |
| Procedure libraries | Yes, typed against ports | `offset`, polygon overlay, TIN integration. They work on any entity exposing the port |
| Domain packs | No | entity types, rule cards, fixtures, adapters |

Inside the procedure layer, keep three things apart:

| Thing | Meaning |
|---|---|
| **Procedure** | An operation and its contract. Names no software and no domain entity, only ports |
| **Implementation** | One body of code that claims to keep a procedure version's contract, with a hash and observed quirks |
| **Application** | Software that ships implementations (`bonyad-server`, AutoCAD, SolidCraft); a subject of study, not necessarily of execution |

A verifier, not the implementer, records that an implementation satisfies a contract.

## Admission rule (avoids a universal ontology)

A concept moves into the kernel or ports only when **two domains need it with the same
meaning**, on its second use and not its first, with a decision record each time. This is
consistent with ADR 0002 decision 5 (no shared abstraction crate ahead of need): ports exist
as a design target and are built when a second domain needs one.

## What it changes in the current work

| Today | Under this proposal |
|---|---|
| `drawing.measure_entity` takes `Geometry2` | Takes anything exposing a measurable port; `Geometry2` is one implementer |
| A pure procedure "takes an entity" and the harness resolves it (finding 1 of the wiring) | Procedures receive **handles**: a stable id plus revision that loads data on demand. A bounded summary (counts, bounding box, validity) is what a model sees |
| `proc.procedure_version` holds the contract and `impl_*` | Contract in the procedure version; `impl_*` in a separate `implementation` row that references it, so two implementations of one version can exist |
| Prototype crate = contracts + implementations | Contracts-only crate (no product dependency) and a separate implementations crate |
| `Outcome`: Ok, Rejected, Undetermined | Kept. Rule evaluation is a different result type (Satisfied, Violated, Unknown, Not applicable) returned by validators; "Not applicable" is new |
| `Assurance`: proven, checked, estimated, unknown | Must be reconciled with the evidence tier (declared, inferred, accepted). One vocabulary is needed |

## Additions to the contract

The prototype's contract has schema, effect, kind and error codes. The proposal adds:

- **Semantics:** pre- and postconditions, what a result establishes.
- **Execution:** determinism, idempotency, cost class, memory expectation, cancellability, so a
  harness can schedule and time-limit a call.
- **Evidence:** what it cannot establish and its validity domain.
- **Fixtures** whose answers are held out from the agent, plus an independent validator.

A change to a postcondition, a unit or a tolerance is a breaking change and bumps the version.
Stored results pin the contract version.

## Cross-source identity

The same real thing can appear in a DWG, an IFC and a LandXML file. Do not merge. Keep each
source object as its own record and link them with a `same_as` claim carrying evidence and a
status (declared, inferred, accepted). Matching rules are per-domain. An uncertain match stays
unknown. The prototype's `io.*` procedures report loss but say nothing on identity, which is a
gap.

## Open questions

1. Is a port a Rust trait only, or also a database-level concept (a table or view an entity
   type must provide)?
2. Which kernel pieces exist today (units, revisions) and which are still prototypes?
3. Where does the contract's `semantics` text live so that it is checkable, not prose?
4. How is "second use" detected and recorded?
5. What would refute this? A candidate: two ports for one concept that cannot be unified, or a
   procedure that only works on one domain's entity and gains nothing from the port.

## Not claimed

No procedure here is implemented against a port yet. The 135 contracts and the three
implementations are the evidence base; none of them tests this proposal.
