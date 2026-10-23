# Procedure contracts: every procedure as a Rust type (research prototype)

**Status:** research prototype, not a decision and not part of the product workspace.
Bonyad's ADR 0002 says there is no shared abstraction crate until an implemented case needs
one; this crate exists to answer one question with compiling code: *what does each procedure
from the studied systems look like as a typed contract?* Moving anything from here into
`logic/` needs an RFC and founder review (`CONTRIBUTING.md`).

It is detached from `logic/` (its own `[workspace]`), uses the same edition (2024) and the
same exact version pins, and builds with `cargo test` from this folder.

## What a procedure is here

Each procedure is declared once, with the `procedures!` macro, and gets:

| Piece | Meaning |
|---|---|
| `Input` struct | Typed. Unknown JSON keys are an **error** (`deny_unknown_fields`); SolidCraft's registry silently ignores them |
| `Output` struct | Typed |
| `Error` enum | Copyable, with a **stable string code** per variant (`error.code()`) |
| `Kind` | `Query`, `Calculation`, `Validator`, `Command`, `Derivation`, `External` |
| `Effect` | `Pure`, `ProducesNew`, `ConsumesInputs`, `MutatesInPlace`, `ReadsExternal`, `WritesExternal` (the three ownership shapes found in the kernels, made explicit) |
| `SPEC` | Static description: key `domain.name`, version, kind, effect, field names, error codes |
| `Spec` marker | Implements `Procedure`, so a procedure is a type that a registry can map to code |

Everything ambient is **explicit**: frame (units, axes), tolerance, seed and input revision
arrive in a `Ctx` argument, not in the input struct and never as global state.

Results are three-way: `Outcome::Ok { value, warnings }`, `Outcome::Rejected { violations }`
(stable codes with a path) and `Outcome::Undetermined { reasons }` ("cannot evaluate").
`Undetermined` is not a pass, which is the lesson of solidcore's `Unported` and difftest
`deferred`. A stored `ResultRecord` carries provenance with a **read set** of (entity,
revision) pairs, so staleness is computed (`is_stale`), and an unrelated edit does not stale a
result. An `Assurance` level (`proven / checked / estimated / unknown`) is assigned by a
verifier, never by the procedure that produced the result.

## Run it

```sh
cargo test                       # 26 tests: registry invariants, behaviour, three implementations
cargo clippy --all-targets       # clean
cargo run --example catalogue    # prints the catalogue as a Markdown table
```

[`CATALOGUE.md`](CATALOGUE.md) is the generated table of all procedures.

## What is in it (135 procedures, 520 stable error codes)

| Domain | Count | Main sources |
|---|---|---|
| `drawing` | 5 | Bonyad's existing 2D operations (create, update with revision, delete, measure, validate); the error codes are `bonyad-geometry`'s own `ViolationCode` strings |
| `solid` | 25 | AutoCAD 3D, SolidCraft features, solidcore and smlib operations |
| `sketch` | 5 | SolidCraft sketch solver |
| `timeline` | 7 | SolidCraft's feature timeline: a feature is a **stored procedure call** |
| `project` | 5 | Multi-entity atomic changeset, undo and redo, dependants, registry sync check |
| `mesh` | 14 | 3ds Max Editable Poly and modifiers, Blender, MeshLab |
| `scene` | 10 | 3ds Max stack, transforms, controllers, skin, clone modes; USD composition |
| `civil` | 20 | Civil 3D (alignment, profile, surfaces, four earthwork methods, corridor, parcels, survey) |
| `bim` | 17 | Revit and IfcOpenShell |
| `cae` | 19 | FieldCraft |
| `io` | 3 | File adapters with a mandatory loss report |
| `verify` | 5 | The independent evaluator: oracle checks, differential comparison, staleness, comparator self-test, assurance |

By kind: 49 commands, 37 derivations, 24 calculations, 13 validators, 8 queries, 4 external.
By effect: 47 produce new entities, 45 are pure, 37 mutate in place, 2 consume inputs,
2 read and 2 write outside.

Three procedures also have an implementation (`impl Run`):
- `civil.earthwork_shared_triangulation`, checked against the hand-computed cases 100 / 0 and 125 / 125.
- `drawing.measure_entity` and `drawing.validate_geometry`, which call the **real**
  `bonyad-geometry` functions (`measure`, `validate`) through a path dependency, and are tested
  against them on twelve geometries: same wire JSON, same values, same violation codes, paths and
  messages (`tests/drawing_real.rs`).

The other 132 are contracts only.

## Where each design choice comes from

| Choice | Evidence |
|---|---|
| Explicit `Effect` per procedure | smlib's boolean "mutates A, consumes B, result aliases A" versus pure shell and sweeps; solidcore's three ownership shapes; AutoCAD's `DELOBJ` global switch |
| Three-way `Outcome` | solidcore `SolidError::Unported` and difftest `deferred`; smlib's untrustworthy success statuses |
| Tolerance, frame and seed in `Ctx` | smlib and solidcore ambient tolerance; FieldCraft units depending on the session display system |
| Read set in provenance | FieldCraft's step-scoped fingerprint (never exposed, unstable hasher); the milestone-3 criticism of project-wide staleness |
| Stable error codes, `deny_unknown_fields` | SolidCraft strings with no codes and silently ignored keys; Bonyad's own `ViolationCode` |
| `verify.*` procedures | difftest's comparator and `--perturb` self-test; FieldCraft's oracle case format with a mandatory tolerance reason; the demo gate that was client-side only |
| `timeline.*` (feature = procedure call) | SolidCraft stores recipes, not B-reps |
| `project.commit_changeset` | The multi-entity atomic change missing from the milestone-3 design; SolidCraft `batch`; FieldCraft snapshot-and-restore |
| Station equation with an internal distance | LandXML records the position along the alignment; a bare (back, ahead) pair is ambiguous |

## Reconciliation with `bonyad-geometry`

| Aspect | Bonyad today | This prototype |
|---|---|---|
| Units | Not stored in geometry; the project owns them | Same: plain `f64` coordinates; units come from `Ctx.frame` |
| Violation | One `ViolationCode` enum in the geometry crate, `Violation{code,path,message}` | One `Error` enum per procedure with the same stable-string idea; `Rejection{error,path,message}` has the same shape, so `violations[].code` is `error.code()` |
| 2D codes | `non_finite_coordinate`, `zero_length_line`, `too_few_vertices`, `degenerate_surface`, `self_intersecting_surface`, `kind_mismatch` | Reused verbatim in `drawing.*` (a test pins them) |
| Surface ring | Open ring, closing edge implied | Same (`Ring2`, `Geometry2::Surface`) |
| Shared abstractions | None by design (ADR 0002 decision 5) | This is exactly the thing the ADR defers; keep it a prototype until an implemented case needs it |
| Existing functions | `measure` (`length`, `area`, `perimeter`), `validate` | Wired: `drawing.measure_entity` and `drawing.validate_geometry` run them. Violation paths are the real ones (`vertices[2].y`), not JSON pointers |

## Deliberately not covered, or merged

- **Not covered (procedures in the studies with no contract here):** AutoCAD SOLIDEDIT beyond
  shell; Civil 3D alignment and profile *creation and editing* commands, sample-line
  generation, material lists and mass haul; Revit schedules, views and family editing; 3ds
  Max ProBoolean options, key editing, rigging authoring; SolidCraft assemblies, joints and
  URDF export; kernel-level curve and surface construction (NURBS).
- **Presentation** (materials, lights, cameras, annotation, label styles) is not modelled at
  all. It was the weakest category in every study.
- **Merged:** the same operation seen in several systems appears once (extrude, fillet,
  boolean, mass properties). The three earthwork methods stay separate because their
  contracts differ (shared triangulation, composite, grid, sections).

## Limits and open questions

- **Declarations, not implementations.** 132 of 135 contracts have no code behind them. The
  field lists are my synthesis of the studies, not validated against an implementation, and
  they will change when an implementation meets them.
- **Procedures that replay procedures** (`timeline.add_feature`, `project.commit_changeset`)
  carry the inner input as a JSON string. They must be parsed against the target
  procedure's typed `Input` through a registry; that registry is not built here.
- **A registry is not built.** `all_specs()` lists the specs, and `Procedure` ties a spec to
  its types, but mapping a key to a `Run` implementation (and the fail-closed startup check
  `project.verify_registry` describes) is future work.
- **Open:** should `Outcome::Rejected` carry per-procedure error enums (as here) or one shared
  `ViolationCode`? Per-procedure keeps codes local and typed; shared is simpler for the API
  layer. Both map to the same wire shape.
- **Open:** where assurance is stored and who may write it (the verifier only, never the
  producing procedure).
- **Open:** whether `Frame` should live in the contract or be a project property that `Ctx`
  merely copies. Here it is copied into `Ctx` so provenance records it.
- Types such as `Primitive`, `PatternKind` and `TinOperation` are first drafts; several
  procedures take `Expr` strings, which are parsed by the procedure and not type-checked here.

## What wiring the two real functions showed

- **A calculation takes the resolved value, not a reference.** `drawing.measure_entity` first took
  only an `EntityRef`, which a pure function cannot dereference. Its input is now
  `{entity, geometry}`: the harness resolves the entity at `ctx.input_revision` and passes the
  stored geometry; `entity` is what goes into the read set. This applies to every `Pure`
  procedure that "takes an entity" in the other 132 contracts.
- **`measure` does not validate.** On a non-finite coordinate the real function returns a
  non-finite number inside `Ok`. A test pins this. The harness must only pass stored geometry,
  which has already passed `validate`.
- **`validate` never returns `kind_mismatch`**; only `validate_replacement` does. The contract
  therefore does not list it for `drawing.validate_geometry`, and the mapping panics if it ever
  appears.
- **The wire shape matched without adapters.** `Geometry2` and `bonyad_geometry::Geometry`
  serialise to the same JSON (`{"kind":"surface","vertices":[...]}`), so the contract can sit in
  front of the existing API.
