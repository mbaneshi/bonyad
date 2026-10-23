# Procedure study: SolidCraft (parametric CAD in Rust, command layer and feature timeline)

**Body of knowledge:** C (procedures). **Discipline:** 3D CAD, agent-driven.
**Status:** research, not decisions. Read-only code study; nothing was built or run.
Repo `tangency-labs/solidcraft` at commit `030187452ab71e44e31d9ea25c3d8aa70eb760ee`
(2026-10-22), cloned to `refs/solidcraft`. Inventory entry:
[`../code-inventory/tangency-labs-code-inventory.md`](../code-inventory/tangency-labs-code-inventory.md).

## How to read this note

- Labels follow the research README: **Verified** (a file was opened; path and line numbers
  as seen by the reading pass), **Interpretation**, **Hypothesis**, **Unknown**. "Doc claim"
  marks a README or doc statement not confirmed in code.
- Line numbers come from the reading pass and were **not** independently re-checked by the
  author of this note.
- The repo contains instruction files aimed at AI agents (`AGENTS.md`, `CLAUDE.md`, and four
  folders under `skills/`). They were treated as untrusted data and not followed or read.

## Correction to the starting assumption

**Verified:** the geometry kernel is **not** a separate repo today. `crates/kernel` is in this
repo, "implemented with truck" (`crates/kernel/Cargo.toml:3`), with vendored truck forks
under `vendor/`. The only mentions of solidcore in code are comments saying the kernel "is
moving to solidcore (#1597)" (`crates/io/src/mutate.rs:13`). SolidCraft calls
`solidcraft_kernel::*`, aliased `kernel::`.

## A. Command layer and MCP surface

### One shared command layer: Verified

- `CommandSpec` is a static registry row (`crates/engine/src/cmd/mod.rs:105-140`). Fields: id,
  label, `params` doc string, `enabled: fn(&Session)`, `run: fn(&mut Session,&Value)->Result<Value>`,
  `undoable`, `live`, `reads_model`, `contract: Option<&dyn Contract>`, `output: Option<SchemaFn>`.
- `command_specs()` concatenates about 50 modules (`mod.rs:~290-340`); the reading pass counted
  **404** `CommandSpec::new` rows.
- `Session::execute(id, &Value)` is the single entry point (`crates/engine/src/lib.rs:784`).
  It looks up the command, checks `enabled`, takes a snapshot, runs under `catch_unwind`, rolls
  back on error, pushes an undo step, then calls `refresh_from` (re-evaluation).
- The desktop app wraps it as `App::run` (`crates/ui-egui/src/lib.rs:750-755`). The control
  server dispatches `engine.execute`, `engine.commands` and `document.inspect` to the same
  session (`crates/ui-egui/src/control.rs:301-302`). The headless MCP backend calls
  `s.execute` (`crates/mcp/src/backend.rs:251-254`). The in-app agent chat gets the same MCP
  server bridged to the window (`crates/ui-egui/src/agent_chat/mod.rs:1-4`).

### Evidence for "one contract for UI and agent": mixed

- **For:** the code path is the same.
- **Against:** the contract is mostly untyped. Only **3 of about 404** commands have a typed
  `Contract` with input and output JSON Schema: `solid.extrude`, `solid.box`, `engine.describe`
  (`cmd/features.rs:26`, `:41`; `cmd/inspect.rs:51`). The default `ParamCheck` is **Off**
  (`schema/mod.rs:1-30`), so handlers still read raw `Value`s via `params::{expr,vec3,str_}`.
  The rest of each contract is a free-text `.params("...")` string.
- **Unknown:** whether any non-test UI code mutates the session without `execute` (a grep hit
  only tests, for example `session.doc_mut()` in `toolbar.rs`).

### The 14 MCP tools (`crates/mcp/src/tools.rs:62-307`)

Also MCP resources `solidcraft://design` and `solidcraft://commands` (`server.rs:163-175`);
prompts are empty. Effect annotations are on each tool (`tools.rs:27-55`).

| Tool | Input | Output | Effect |
|---|---|---|---|
| `list_commands` | filter? | array of command info (id, label, params doc, enabled, disabled_reason, planned) | query |
| `describe_command` | id | params doc; JSON Schema input and output only for the 3 typed commands, else null | query |
| `execute` | command, params?, verbose? | the command's result | any command; annotated Files (destructive, openWorld) |
| `batch` | commands[{command, params}] (max 10000), rollback?, timings?, profile?, verbose? | {ok, completed, failed{index, command, error}, rolled_back, undone, results, timings?} | mutation, atomic via checkpoint; 3600 s timeout (`backend.rs:38`) |
| `inspect_design` | measure?, sketches?, joints? | params, timeline (type, suppressed, error, warning, timing), bodies, sketches (degrees of freedom, solve status), joints, selection, undo depth | query |
| `measure` | body? or items[] | volume, area, centre of mass, bounding box, counts, or item distances | query |
| `body_topology` | body | edges (index, midpoint, length), faces (index, name, area, normal, point) | query |
| `set_parameter` | name, value or expression, unit?, comment? | new value, `recomputed`, `restored`, failing features | mutation (undoable) |
| `screenshot` | view?, camera?, path?, width?, height?, source?, grid?, axes? | PNG block plus JSON info | query; writes a file if `path` is given |
| `export` | path, format, bodies?, urdf options | {path, bytes, format} | file write |
| `crash_reports` | id?, limit? | list or report | query |
| `running` | none | queued and running requests | query |
| `undo`, `redo` | none | result | mutation |
| `new_design`, `open`, `save` | name; path, up, names; path, format | open reports component id and name | replaces the design / file I/O |

- Errors are `isError` text results (`tools.rs:361-387`); `check_arguments` validates only
  top-level types (`tools.rs:325`).
- Long-running work is handled by the control protocol: a timeout is not a failure, and
  `control.pending` returns the late reply (`docs/control-protocol.md`, doc claim). Transport is
  loopback JSON-lines TCP with a per-launch token (doc claim plus `backend.rs:176`). Agent file
  access is limited to a `PathScope` (`mcp/src/lib.rs:30-47`).

## B. Feature timeline: procedure records

**Shared across all features (Verified):**

- Stored as `Document.features: Vec<Feature>` (`crates/doc/src/document.rs:2399-2416`). A
  `Feature` is `{id, name, suppressed, body_names, param_names, component, edge_refs,
  edge_names, face_names, participants, kind: FeatureKind}` (`document.rs:2306-2380`).
  `FeatureKind` is a serde-tagged enum of about 80 variants (`document.rs:527-1610`).
- **Stored recipe = parameters as `Expr` text plus references. The resulting B-rep is not
  stored**, except `Import`, which stores the STEP text.
- Effects: `eval_feature` takes the document, the values, the feature and `&mut ModelState`.
  It is a pure derive with a document-local cache (`eval.rs:5759`).
- Failure: `FeatureResult.error: Option<String>` plus `warning` (`eval.rs:982-999`). **There
  are no error codes.** The kernel error enum is `Invalid | Failed | TooLarge | Internal`
  (`kernel/src/lib.rs:227-239`); the engine enum is `UnknownCommand | Disabled | BadParams |
  Other | Internal` (`engine/src/lib.rs:50-60`). Messages are strings. Kernel panics become
  errors through `kernel::guard` (`kernel/lib.rs:254`).
- Authoring (`add_feature_in`, `cmd/features.rs:438-560`): world coordinates are mapped into
  the active component frame; picks are stamped into `edge_refs`, `edge_names`, `face_names`.
- Units: lengths in mm and angles in radians internally; `Expr` text may carry units; kind
  `Length` or `Angle` is checked in `val()`.

| Feature | Typed inputs (summary) | Kernel call and failure |
|---|---|---|
| **Sketch** (`eval.rs:5801-5845`) | `plane: PlaneRef` (named, face-anchored, custom) and a `Sketch` (points, curves, constraints, links) | no kernel call; `solidcraft_sketch::solve*` via `doc.solve_sketch` (`document.rs:3520`). Output a `SolvedSketch` with profiles and loose ends; constraints plus solved coordinates are stored, and solved coordinates are adopted back (`eval.rs:1152`). A conflict becomes a warning |
| **Extrude** (`eval.rs:4055+`) | `sketch`, `profiles: ProfileSel`, `extent` (distance, distance2, through_all, taper, to, from, start_offset), `operation`, `targets`, optional `thin`. Profile references by index, point, or curve ids ("found again on every recompute", `features.rs:27` doc string) | `kernel::extrude` (`build.rs:193`), `extrude_tapered_between`, `extrude_whole_sides` (`eval.rs:3993`), then `kernel::boolean` through `apply_traced` (`ops.rs:919`). Typed contract exists (`ExtrudeParams`). Errors are strings, for example "the To object is where the extrude starts" |
| **Revolve** (`eval.rs:4421`) | `axis: AxisRef` (sketch line or axis, world axis, construction axis, {origin, dir}), `angle`, `angle2`, `symmetric`, `to` | `kernel::revolve` (`build.rs:341`, called at `eval.rs:4520`) |
| **Fillet** (`eval.rs:6223-6330`) | `edges: Vec<Position>` (a point on each edge), `radius: Expr`, `style` (Constant, Chord, Curvature, Variable, Spline), `fit` (Exact, Reduce, Taper), `corner` (Rolling, G2). Stored as points plus `edge_names` plus `edge_refs{dir,min,max}` (`eval.rs:3182`) | `kernel::fillet` (`blend.rs:1847`), `fillet_max_each`, `fillet_tapered`, `fillet_g2`, `fillet_chord`. A radius too large gives `KernelError::TooLarge`; with `fit=Reduce` or `Taper` it degrades with a warning (`eval.rs:587-600`); no edge resolving gives "none of the selected edges exist any more" |
| **Chamfer** (`eval.rs:6320`) | `distance`, `distance2` or `angle`, `flip` | `kernel::chamfer` (`blend.rs:2083`) or `chamfer_sides` (`eval.rs:5754`) |
| **Combine / boolean** (`eval.rs:6364`) | `target`, `tools`, `operation`, `keep_tools`. Bodies referenced by **name** | `kernel::boolean(a, b, BoolOp)` (`ops.rs:919`) returning `Option<Body>`. Errors: "a body cannot be combined with itself", unknown body |
| **Shell** (`eval.rs:5927`) | `faces` (points), `thickness`, `direction` (inside, outside, both), `tangent_chain` | `kernel::shell` (`polyhedron.rs:194`); outside or both uses offset bodies plus a boolean |
| **Pattern, Mirror** (`eval.rs:6148`, `:6167`) | `features` (by name, replayed) or `bodies`; `pattern: PatternKind`; `plane` for Mirror | `kernel::transform_matrix` for body copies; feature replay reruns `replay(...)`. The cache key adds the whole chain fingerprint (`eval.rs:1274-1290`) |
| **Hole** (`eval.rs:3454-3790`) | `position: FacePick`, `direction`, `diameter`, `depth`, `hole` kind (simple, counterbore, countersink), `points`. Face names re-resolved first; a hole slides along its axis only | `kernel::extrude` of a disc tool (`eval.rs:3730`), `revolve` for profiled holes (`:3755`), `extrude_tapered` (`:3782`) |
| **Loft, Sweep** (`eval.rs:4619`, `:4651`) | Loft: `sections[{sketch, profiles}]`, `rails`, `rail_fit`. Sweep: profile sketch, path sketch and curve-id list, `orientation`, `twist`, `scale`, `rails` | `kernel::loft*` (`build.rs:1795`); `kernel::sweep_with`, `sweep_path_with` (`eval.rs:4684-4686`) |
| **Import** (`eval.rs:6536`) | `file`, `step: Arc<str>` (the full text), `components`, `skip` | `kernel::step_import_shared` (`step_in/mod.rs:1164`); the result carries an import certificate keyed to a digest. **Stores the source STEP text, not the B-rep** |
| **Box, Cylinder, Sphere, Torus** (`eval.rs:6330+`) | `PointExpr` placement plus `Expr` dimensions | `kernel::box_solid`, `cylinder`, `sphere`, `torus`. Typed contract exists for Box |

## C. Sketch constraints as a procedure

- **Owner (Verified):** the `solidcraft-sketch` crate (`crates/sketch/src/solver.rs`). `doc`
  wraps it as `Document::solve_sketch` (`document.rs:3520-3557`), which applies dimension
  values via `apply_dimension_values(vals, sk)` and calls `solve_after_edit_with_analysis`.
  Engine commands (`sketch.constraint.*`, `sketch.dimension`, others) edit the stored
  `Sketch` and call the solver.
- **Algorithm (Verified):** unknowns are point coordinates and circle radii; connected
  components are solved separately by damped Gauss-Newton / Levenberg-Marquardt on a dense
  Jacobian, with an exact elimination step for pinned unknowns (`solver.rs:1-12`).
  `TOL=1e-9`, `ACCEPT=1e-6`; component cap 4000 variables (`solver.rs:30-37`).
- **Inputs:** `&mut Sketch` (points, curves, `ConstraintKind` variants such as Coincident,
  PointOnCurve, Horizontal, Parallel, plus driving dimension values), a `Hold` set,
  `DrivingValues`.
- **Output (`SolveReport`, `solver.rs:58-90`):** `status: Solved|Failed`, `dof`, `iterations`,
  `max_residual`, `failing: Vec<String>` (the conflicting constraints), `folded`
  (orientation flips), `redundant`, `point_determined[]`, `curve_determined[]`.
- On failure the geometry is restored (`solver.rs:1388-1390`). Conflicts are reported by
  constraint id, not as a minimal conflict set (**Interpretation**). The report is stored on
  `SolvedSketch.report` and surfaced by `inspect_design`.

## D. Dependency and invalidation (all features, Verified, `eval.rs:1738-1980`)

- Each feature gets a chained fingerprint `chain_fingerprint(prev, feature JSON, param values,
  rolled_back, step digests) ^ placement_digest` (`eval.rs:1196`). `evaluate` walks the
  timeline and reuses the old result while the fingerprint matches; after the first miss it
  stops reusing (`reuse=false`).
- A second tier is a content-addressed cache keyed by (own inputs, context digest, input state
  digest, feature id) (`eval.rs:1274`). It restores results for later features whose inputs
  are unchanged, which is why `set_parameter` reports `recomputed` versus `restored`.
- **Granularity is the feature, and the dependency is positional (the previous-state chain),
  not a declared graph.** Parameter references are read from `Expr`s and `param_names`.
  `suppressed` or rolled-back features are skipped. A parameter error fails only the features
  that use it. A live drag uses a `live` variant that skips later features and leaves them
  stale (`lib.rs:776-784`; `FeatureResult.stale`).

## E. Identity across edits (topological naming)

**Verified** (`crates/doc/src/naming.rs:1-20`): every face of an evaluated body gets a
persistent name by how it was made.

- A face inherited from the input keeps the input's name. A new face gets a role name:
  `F<feature>:side:<sketch curve>`, `:start`, `:top`, `:bottom`, `:end`, `:blend:<edge>`,
  `:inner:<face>`. Split pieces are disambiguated by neighbouring faces, for example
  `F2:top#[F2:side:l4,F4:side:l4]`. Edges are named by the faces they separate:
  `<faceA>|<faceB>`, with `~k` for repeats.
- Names come from a `Lineage` the building operation reports (`lineage.rs`,
  `history_names.rs`). Where an operation reports no history, names are geometry-derived and
  marked unverified (`naming.rs:233-248`; fallback `"{body}:face:{k}"`). Names are computed
  lazily (`NameCell`, `OnceLock`).
- Stored on the feature: `edge_names`, `face_names`, `edge_refs: Vec<EdgeRef{dir,min,max}>`,
  and the original pick point.
- **Resolution order** (fillet, `eval.rs:6226-6270`): name first (`naming::locate_edge`), then
  fall back to the picked point with a warning ("edge `X` no longer exists; using the edge at
  the picked point"), else skip the edge. Faces resolve through `name_lookup::locate_face_on_body`
  (`eval.rs:1866-1893`) with a similar warning.
- Profiles: `ProfileSel` by curve ids is re-found on every recompute; index and point picks
  convert to curve-based picks when they find the same profile (`features.rs:27` doc string).
  Fallback matches surface as warnings. **Bodies are referenced by free-text name**, features
  by name or id, sketches by `SketchId` (the feature id).

## F. File I/O as adapter procedures

- **STEP import:** `kernel::step_import_shared(text)` (`step_in/mod.rs:1164`) is an in-repo
  reader (not truck-stepio; `docs/step-import.md`, doc claim, consistent with the code header).
  Inputs `up: z|y`, `names: auto|solid|product|instance`. Preserved (doc claim): B-reps (solid,
  faceted, shell), the listed surface and curve types, units (converted to mm), product names,
  colours, and the assembly tree and placements (turned into components, occurrences and rigid
  joints). Lost or limited (doc claim): offset surfaces and pcurve-only edges are not read;
  non-rigid placements are baked in place; unreadable faces become warnings and leave an open
  body. It becomes an `Import` feature storing the STEP text.
- **STEP export:** `solidcraft_io::export_with_metadata` / `step_assembly` (`cmd/file.rs:491-497`)
  calls `kernel::step_out::step_export_products` (`step_out.rs:1603`). Writes AP242 products,
  assemblies, names and colours; geometry via truck's STEP writer, then re-parsed and
  re-assembled (`step_out.rs:1-9`). Lost (**Interpretation**, from what the writer lists): the
  feature timeline, sketches, parameters and constraints. No PMI or other semantic export was
  found. The native `.solidcraft` container is the lossless format.
- Other formats exist: IGES (restated as STEP), FreeCAD and Rhino through cadmpeg, 3MF, STL,
  OBJ, glTF. `file.export` has `noundo()`; imports are components with a single undo step.

## G. The 8-question sheet

1. **Authority:** the `Document` (`features` + `params` + sketches). The evaluated `ModelState`
   is derived (`lib.rs:644-661`: `refresh` calls `model.evaluate(&doc)`).
2. **Agent output form:** JSON command calls (`execute`, `batch`) against string command ids
   with free-text param docs; 3 commands have a JSON Schema. Replies are command results or
   error strings.
3. **Executor:** `Session::execute` (`lib.rs:784`), then the incremental evaluator. Rollback via
   checkpoints (`lib.rs:~870-900`, `tools.rs:496-544`).
4. **Checking:** the registry `enabled` gate; an optional typed `Contract` (Off, Warn, Strict)
   on 3 commands; expression kind checks (`check_expr`); per-feature errors and warnings; the
   sketch solver report; `inspect_design` as a verify step.
5. **Identity across edits:** section E.
6. **UI and file round trip:** UI and MCP share `execute`. The file round trip is the serde
   `Document` (container or JSON, with a format number and migration directories
   `crates/doc/src/format/v23..v31`, so versioned migration exists).
7. **Hidden state and globals (Verified):** `static SHOT` counter and the `scratch_dir`
   `OnceLock` (`mcp/tools.rs:680`, `mcp/lib.rs:55`); thread-local `GUARDED`
   (`kernel/lib.rs:243`), `frames::Nested`, and `crash::` journal state used inside `execute`;
   the vfs `PathScope` is thread-scoped (`vfs::scoped`, `server.rs:~160`). Session fields
   outside the document: `active_sketch`, `selection`, `active_component`, `pending_moves`,
   the camera, checkpoints, the undo stack. **Commands such as `sketch.create` depend on
   "active sketch" state**, so some results depend on session state, not just inputs.
8. **Ambiguity and units:** lengths mm and angles degrees by default in params; `Expr` accepts
   units (`"30 deg"`, `"40 mm"`); non-mm designs rewrite bare lengths in `add_feature_in`
   (`features.rs:445-450`); unit-less rules in `expr.rs:1-9`. Picks are `[x,y,z]` world points
   mapped to component-local frames (`frames::to_local`). Command lookup is case-insensitive
   with did-you-mean (`mod.rs:~345-370`). **Unknown parameter keys are silently ignored unless
   `ParamCheck` is Strict** (default Off).

## Classification

| Procedure | Class |
|---|---|
| Sketch solve | pure calculation over the sketch (restores on failure) |
| `measure`, `inspect_design`, `body_topology`, `list_commands`, `describe_command` | pure query over derived state |
| `eval_feature` (extrude, revolve, fillet, chamfer, shell, hole, loft, sweep, combine, pattern, mirror, primitives) | derived-with-dependency (cached, fingerprint-chained) |
| Sketch feature | derived-with-dependency (solver inside) |
| Import (STEP) | derived from stored text |
| `solid.*`, `sketch.*` commands through `Session::execute` | mutation of the Document (undoable), then triggers derive |
| `set_parameter` | mutation that triggers recomputed/restored |
| `batch` | mutation, atomic transaction (checkpoint) |
| `export` (STEP and others) | adapter; pure calculation over state; writes a file (not undoable) |
| `open`, `new_design`, `save` | mutation that replaces the design / file write |
| naming (`naming::locate_edge`, `face_names_at`) | derived lazily, memoised |

## Findings relevant to the entity / procedure split and a procedure registry

1. **A procedure registry already exists, and the entity side is separate.** `CommandSpec` is a
   command registry; `FeatureKind` plus `Feature` is the persisted entity; `eval_feature` is a
   separate derive procedure. Two layers hold two meanings of "procedure": the interaction
   command (mutates the document) and the feature evaluator (derives geometry from stored
   parameters). Bonyad's split matches this separation, but SolidCraft does not name the
   second layer.
2. **Typed contracts are the weak point.** About 404 registry rows, 3 with machine-readable
   schemas, enforcement defaulting to Off, the rest free-text strings parsed by hand.
3. **Recipe-not-result persistence with content-addressed caching.** Features store parameters
   and references, not B-reps. Rebuild is a fingerprint chain plus a content-addressed cache,
   with `recomputed` and `restored` reported to the caller. There is no declared dependency
   graph, only positional chaining.
4. **Identity is name-based with graceful fallback, and it is the part types do not capture.**
   Persistent face and edge names from lineage, point-pick fallback, warnings in place of hard
   errors. Bodies and features are referenced by free-text name; errors are strings with no
   codes. A registry needs a typed reference kind and a stable error taxonomy to do better.
5. **Session state leaks into procedures** (active sketch, active component, selection,
   thread-locals), so commands are not pure functions of (document, params). Batch atomicity
   through a checkpoint is a useful transaction primitive.

## Not verified

- Command-to-UI parity for every command (only the shared `execute` path and the `App::run`
  wrapper were verified, not each dialog).
- Whether any non-test UI code mutates the document without `execute`.
- The full list of `sketch.constraint.*` commands (a grep for the module found only two; the
  tool description names the family, `tools.rs:88-92`).
- Per-feature preconditions and error strings beyond those quoted. Several feature arms
  (Sketch tail, Revolve, Loft, Sweep, Hole) were read only partially.
- Kernel internals: how `lineage` and `history_names` are produced inside kernel operations,
  and which operations report no history.
- STEP export losses beyond what the writer's header lists; STEP round-trip fidelity; all
  runtime behaviour (nothing was run).
- Whether `ParamCheck` is turned on in any shipped app or CLI path.
- The truth of README or doc claims not confirmed in code (transport token behaviour,
  control-protocol timeouts, the `docs/step-import.md` read-capability lists).
