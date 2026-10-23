# Reconciliation: three procedure designs

**Status:** research note, not a decision. Any change to ADR 0003 or to the `proc.*` migration
goes through an RFC and founder review (`CONTRIBUTING.md`).

Three designs for "a procedure described as data" now exist and they disagree in small but
load-bearing ways:

| Short name | Where | State |
|---|---|---|
| **ADR 0003** | `docs/decisions/0003-procedure-registry.md` (branch `docs/adr-0003-procedure-registry`) | Proposed |
| **`proc.*` migration** | `db/migrations/20261023000005_phase1_entity_spine.sql` (branch `feat/29-phase1-entity-spine`) | Written |
| **Contracts prototype** | this folder | 135 contracts, 1 implementation, 18 tests |

Evidence labels: *Verified* = read in the file named; *Interpretation* = my reading.

## Where they disagree

| # | Aspect | ADR 0003 | `proc.*` migration | Prototype | Consequence |
|---|---|---|---|---|---|
| 1 | Effect vocabulary | `read`, `propose` | `read`, `compute`, `change` | `Effect`: 6 values (pure, produces new, consumes inputs, mutates in place, reads/writes external) plus `Kind`: 6 values | Three vocabularies for one idea. The prototype's `Effect` is finer because kernels have three ownership shapes (smlib boolean mutates A, consumes B). |
| 2 | Result status | `succeeded`, `failed`, `unknown`; decision 8: unknown is never a pass | `ok`, `failed` only | `Outcome`: Ok, Rejected, Undetermined | **The migration cannot store "unknown"**, which contradicts ADR decision 8. Verified: `status in ('ok','failed')`. |
| 3 | WASM | Rejected as an alternative ("data must never introduce execution") | `impl_kind in ('rust_builtin','wasm')` | None | The migration admits what the ADR rejects. Verified in both files. |
| 4 | Shape of a contract | JSON Schema generated from Rust types | One `proc.param` row per scalar | `Input`/`Output` Rust structs; `SPEC` lists field names only | Two sources of truth unless one is generated from the other. |
| 5 | Parameter types | Anything JSON Schema can say | `number`, `text`, `boolean`, `entity` | Lists, enums, nested structs (rings, TIN triangles, station equations) | `proc.run_input` allows exactly one of entity/number/text per row, so a list of triangles or a ring cannot be an input. |
| 6 | Error vocabulary | `failed` plus findings | one `error_code` text per failed run | Closed enum per procedure with stable string codes | The migration stores a code but no table says which codes a procedure may return. |
| 7 | Ambient context | Preconditions in prose, tolerances `jsonb` | None | Explicit `Ctx`: frame, tolerance, seed, input revision | Nothing in the migration records the tolerance or frame a run used, so two runs of one version can differ silently. |
| 8 | Implementation identity | `implementation_key` + `implementation_version` | `impl_key`, `impl_hash` (nullable) | None | A nullable hash makes "same code" unprovable. |
| 9 | Independent checking | Not mentioned | `skill.*` only | `verify.*` procedures and `Assurance` assigned by a verifier | No place to record that a result was checked by something other than the producer. |

## Staleness

*Interpretation.* `proc.run` has a project-level `input_revision_id` and `proc.run_input` names
the entities read. Because the history tables are keyed `(entity_id, revision_id)`, a result is
stale exactly when one of its declared input entities has a newer revision than the run saw.
That is computable today for declared inputs, with no extra column, which is the read-set idea
of the prototype. It does **not** cover anything a procedure reads without declaring it, so the
declaration must be the contract, not a convention.

## Smallest set of changes that would close the gaps

1. **Pick one status vocabulary and make it three-way.** Add `unknown` to `proc.run.status`
   (ADR 0003 already requires it). Keep `error_code` for `failed` only, and add a
   `reasons`-style field for `unknown`.
2. **Drop `wasm` from `impl_kind`** or amend the ADR. As written they cannot both stand.
3. **Make `impl_hash` not null** for `active` versions, or state that `impl_key` plus version
   is the only identity.
4. **Store the contract as generated JSON Schema**, as the ADR says, and keep `proc.param` as a
   queryable projection of it for the scalar and entity parameters. Do not hand-write both.
   The prototype's `SPEC` already lists field names; deriving a schema from the same Rust
   types (the scratch `earthwork --describe` did this) closes it.
5. **Add `proc.error_code (procedure_version_id, code, meaning)`** so the closed set of codes
   is data and a run's `error_code` can be a foreign key.
6. **Record the context a run used** (tolerance and frame) on `proc.run`, or in a typed
   `proc.run_context`, so reruns are comparable.
7. **Collapse the effect vocabulary.** Suggested: keep the database column coarse
   (`read`, `compute`, `change`, as the migration has) and add `ownership` only if a
   procedure's kernel semantics matter to callers. The prototype's six-value `Effect` is a
   Rust-side detail until a real kernel needs it.
8. **Add an assurance record** written only by a verifier, if and when `verify.*` exists.

Items 1 to 3 are contradictions between existing documents and are worth fixing before more
migrations build on them. Items 4 to 8 are design choices.

## What the prototype does not settle

- Whether per-procedure error enums (prototype) or one shared code set (Bonyad's
  `ViolationCode`) is better for the API layer. Both serialise to the same wire shape.
- Whether the registry check described in ADR decision 4 (refuse to start on drift) is
  affordable when 135 contracts exist. Nothing here has run it.
- Only 1 of 135 contracts has an implementation, so every field list is a hypothesis.
