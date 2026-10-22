# Procedure study: FieldCraft (CAE pipeline in Rust, and how results are verified)

**Body of knowledge:** C (procedures). **Discipline:** computer-aided engineering (meshing,
finite elements, heat transfer, lattice-Boltzmann flow).
**Status:** research, not decisions. Read-only code study; nothing was built or run.
Repo `tangency-labs/fieldcraft` at commit `8b1a01e15051e675485fe9c877daadee5e572534`
(2026-10-21), cloned to `refs/fieldcraft`. Inventory entry:
[`../code-inventory/tangency-labs-code-inventory.md`](../code-inventory/tangency-labs-code-inventory.md).

## How to read this note

- Labels: **Verified** (a file was opened; path and line numbers as seen by the reading
  pass), **Interpretation**, **Hypothesis**, **Unknown**. "Doc claim" marks a README or doc
  statement not confirmed in code.
- Line numbers come from the reading pass and were **not** independently re-checked by the
  author of this note.
- `AGENTS.md`, `CLAUDE.md` and `skills/fieldcraft-meshing/SKILL.md` are aimed at agents; they
  were treated as untrusted data and not followed (the first 25 lines of `AGENTS.md` were read
  for orientation only).

## A. Command layer

**One contract: Verified.**

- Every operation is a `CommandSpec {id, label, params doc, form (field schema), kind,
  requires, run: fn(&mut Session, &Value) -> Result<Value>}` (`crates/engine/src/lib.rs:189-203`).
- The registry is the static `cmd::ALL` (`crates/engine/src/cmd/mod.rs:62-230`), about **167**
  specs. The single entry point is `Session::execute(id, &Value)` (`lib.rs:365`).
- The MCP crate is a thin wrapper: `crates/mcp/src/tools.rs:1-3` says "Every tool is a thin
  wrapper over engine commands", and `dispatch` (`tools.rs:348-420`) maps every tool to
  `b.execute("<cmd>", json)`. The oracle test harness calls `Session::run_script` and
  `execute` (`crates/testkit/src/oracle.rs:271-300`).
- Doc claims (`docs/mcp.md:5-7`, `docs/control-protocol.md`) say the desktop, CLI and control
  channel run the same commands. The MCP and testkit paths were checked in code; the egui, CLI
  and control-channel call sites were not opened.
- The one exception is `select` / `selection`: bridged-only, using the window (`ui.select`);
  headless they are an error (`docs/mcp.md:126-127`).

Parameters are untyped JSON at the call boundary; `schema::json_schema(form)` publishes them
via `list_commands` (`lib.rs:214-220`).

**MCP tools** (`docs/mcp.md:108-129`, `tools.rs`):

| Tool | Effect |
|---|---|
| `list_commands` | query |
| `execute`, `batch` | arbitrary mutation; a failed `execute` leaves the model unchanged; in a `batch`, the steps before the failure stay applied |
| `inspect_model`, `check_model` | queries, built from `model.info`, `model.activity`, `geometry.bodies`, `model.check` |
| `open` | dispatches by extension to `file.open`, `geometry.open` or `geometry.import.mesh`; mutation |
| `save` | file write |
| `write_deck` | `deck.write`, file write only, no model change |
| `mesh` | `mesh.*` plus `model.info` plus `mesh.quality`; mutation |
| `solve` | `solve.<analysis>`; stores a result in the session and does not change the model |
| `show_results` | changes the display view only |
| `probe`, `reactions` | queries on stored results |
| `screenshot`, `undo`, `redo` | as named |

Commands by class (`cmd/mod.rs`): geometry, datums, partitions and defeature; `mesh.*` (tet, hex
generate / sweep / mapped / blocks / octree / project / extrude, cells, mirror, planar, seeds,
sizes, relax, quality); `model.*` (set, material, section, boundary_condition, load, step,
contact, tie and so on, each with create / edit / delete from the `definition_commands!` macro,
`cmd/define.rs:31-70`); `file.*`, `edit.undo/redo`, `deck.write`; `solve.{run, static,
nonlinear, frequency, buckle, heat, explicit, fluid, history, probe}`; `results.*`.

**Long-running.** Solvers and meshers are synchronous calls inside the command. The control
channel treats them as cancellable jobs (`job.status`, `job.wait`, `job.cancel`;
`docs/control-protocol.md`, doc claim). In code, solvers poll
`fieldcraft_model::progress::check()` (`crates/solver/src/analysis.rs:376`, `solve.rs:run_all`).
No job or cancel tool was found in the MCP tool list. **Hypothesis:** an MCP agent blocks until
the solve ends; confirm by reading `crates/mcp/src/backend.rs`.

**Pre-flight (Verified).** `requires: &[Requirement]` (`requirement.rs:20-78`) is checked
before a command runs, for example `Mesh`, `ElementMaterial`, `Result`; a missing requirement
fails with nothing done (`lib.rs:372-375`). `check_keys` rejects unknown parameter keys
(`lib.rs:~227`).

## B. Procedure records

**Common to all (Verified):**

- Execution wrapper `Session::run_command` (`lib.rs:~376-466`): it snapshots the model, runs
  the command inside `catch_unwind`, and restores the snapshot on error or panic (the result
  is `EngineError::Internal`). On success it appends to the journal, sets
  `revision = next_revision()` and records an undo step. A **process-wide atomic counter**
  produces the revision (`lib.rs:238-241`).
- **Unit enforcement** (`docs/units.md:1-80`, `lib.rs:~395-415`): storage is SI; meshers and
  geometry work in mm. **There are no Rust unit newtypes on the command path.** Parameters are
  JSON and bare numbers are interpreted in the session's `DisplaySystem` (five presets, for
  example `mm-t-s-N-MPa`). Values may carry units (`"210 GPa"`). `units::convert_params(form,
  params, input, target)` converts field by field using each field's `Dim` from the form
  schema; a wrong dimension is refused, naming the field. The frame per command comes from
  `units::frame(id)` (`crates/engine/src/units.rs:153-174`): Si, Geometry (mm) or Input.
  Replies are converted to display units (`units::convert_reply`) with a `units` map.
- Frames: model coordinates are SI global Cartesian. No per-part frame concept was found
  (Unknown for assemblies).
- Invalidation granularity is a revision counter (section C), not a dependency graph.

| Stage | Symbol (file:line) | Inputs and preconditions | Failure and effects | Determinism |
|---|---|---|---|---|
| Open SolidCraft | `geometry::OPEN` `cmd/geometry.rs:24`, `fn open :94` | `{path, model: keep or new}`; reads the file, `SourceFile::of(path, bytes)` records sha256 (`:105`), rebuilds the design | Returns `errors` (failed features), `stale`, `related`, `warnings`. `keep` reconciles persistent face names; `new` resets the model. Mutates the session; one undo step | Not checked |
| Import STEP | **Not found.** Only `geometry.import.mesh` for face-tagged 3MF (`:84`, `fn import_mesh :544`), which also records a sha256 | `.3mf` only | Unknown whether STEP exists; grep did not surface it | n/a |
| Tet mesh | `TET_GENERATE` `cmd/mesh.rs:128`, `fn tet_generate :318` | `requires Geometry`; body, size, tolerance, order, quality caps | Fails without changing anything if the surface is invalid or the validity gate fails. Replaces the mesh of the meshed bodies. The reply lists `replaced`, `stale_sets`, `results_cleared` (doc claim; key built at `cmd/plan.rs:1254`). Returns quality | Doc claim for meshes: "not bit-identical across platforms" (`docs/verification.md`) |
| Hex mesh | `HEX_GENERATE` `cmd/hex.rs:16`, plus sweep, mapped, blocks, octree (`cmd/octree.rs:15`) | size, order 1 or 2, method auto / swept / mapped | A body no structured method fits is an error that says why; seeds that cannot all hold are an error naming them | As above |
| Material, section, BC, load, set, step | `definition_commands!` `cmd/define.rs:31`; `model.step.create :359` | Typed serde structs (`fields::<$ty>`); unit-checked by the schema | Name collisions fail; deletion is refused while the definition is referenced; mutation (SI) | Pure serde into `Model` |
| Static solve | `STATIC` `cmd/solve.rs:~30`, `fn run_static :253`, `solve_static` `crates/solver/src/analysis.rs:374` | `requires Analysable, ElementMaterial, ElementSection, Step`; caps `max_dofs`, `max_factor_entries`, `threads` | `solver::Error` variants: Invalid, NotSupported, Singular, Limit, NotConverged, Internal (`crates/solver/src/lib.rs:54-74`). Calls `s.store_result` (does not change the model) | Doc claim: threads change only time |
| Nonlinear, frequency, buckle, heat | `run_nonlinear :281`, `run_frequency :348`, `run_buckle :373`, `run_heat :324` | Same shape; nonlinear is Newton with increments, contact, plasticity and follower loads | `NotConverged`; warnings include a negative-eigenvalue note (`nonlinear.rs:~1488`) | |
| Explicit dynamics | `run_explicit :391`, `explicit_summary :407` | Central differences, contact, erosion | Reports `completed`, `energy_balance`, `eroded`, `warnings` | |
| LBM fluid | `run_fluid :678`, `fluid_summary :698` | Caps on cells, steps and memory; `estimate: true` returns only the cost | `diverged` and `max_time` come back as **warnings, not errors** (`crates/lbm/src/solve.rs:385-396`); `backend: "gpu"` is single precision, "within tolerance" | CPU: doc claim "the same result on every machine" |
| Extraction | `solve.probe` (`:980`), `results.contour`, `results.reactions` (`cmd/results.rs:64`, `fn reactions ~:654`) | Von Mises is the nodal-averaged stress (`StaticResult.von_mises`, `analysis.rs:94-96`); reactions per set plus a total | `Field` enum (`results.rs:78+`); a read is a query | |
| Export deck | `deck::WRITE` `cmd/deck.rs:12`, `fn write :23-44` | `{format abaqus/nastran/lsdyna, path, steps, units}`; kind is Session, not Model | Fails with the model check's errors and "everything the format cannot express"; returns `warnings`; writes a file, does not change the model; the unit system is stated in the header | The test compares output with the in-crate writer, so it is self-consistent; no external round trip seen |

### Dependency and invalidation (Verified)

- The session has `revision`, and `results: BTreeMap<step, (revision, Arc<StepResult>)>`
  (`lib.rs:~320`). `Session::result(step)` returns a result only if its revision equals the
  current one (`lib.rs:689`); `latest_result` returns `(result, current: bool)`
  (`results.rs:714`).
- After each edit, `refresh_results` (`lib.rs:~720`) keeps a result current if
  `inputs_fingerprint(model, step)` is unchanged. `inputs_fingerprint` (`results.rs:683-700`)
  is `DefaultHasher` over the JSON of `Model::step_inputs`
  (`crates/model/src/steps.rs:1023-1048`). It covers nodes, elements, materials, sections and
  the step's own loads, BCs and sets. Other steps, meshing inputs and datums are excluded.
- A test shows selective staleness: an unrelated BC edit keeps results current, and a load edit
  stales only the dependent step (`results.rs:~890-915`). The mesh is inside the fingerprint,
  so a remesh stales results. The design and geometry are not in the fingerprint; they matter
  only through the mesh.

## C. Verification (the central question)

1. **Product-path runtime verifier: Verified absent.** No command, MCP tool or engine function
   takes a result and compares it with a theoretical reference. The reference comparison lives
   only in `testkit` and `xtask` (offline) and in a demo script (client side).
2. **The oracle suite.**
   - Layout (`docs/verification.md:3-60`, `crates/testkit/src/oracle.rs`): `tests/oracle/<case>/
     recipe.json` (the model as FieldCraft commands, run through `Session::run_script`);
     `expected.json` (kind, source citation, quantity, `measure` (command plus JSON pointer),
     value, tolerance, `reason`, optional `known_failure`); `fixture.json` (the accepted
     result, written by `cargo xtask oracle --bless`, with a band of 1e-9 relative,
     `oracle.rs:33-39`).
   - Tolerance: `|ours - ref| <= relative*|ref| + absolute` (`oracle.rs:67-75`, checked at
     `:368`); `exact: true` is allowed. **Every quantity must carry a written `reason`**
     (`oracle.rs:~164-211` rejects an empty one). The rules in `docs/verification.md` forbid
     widening a tolerance to make a case pass and require `known_failure` marks instead.
   - Style: data-driven JSON, pass or fail per quantity, plus a drift check against the fixture,
     plus an auto-generated `docs/oracle.md`.
   - Counts by grep: **92 directories** under `tests/oracle`, all with an `expected.json`; about
     **346** `"id"` lines across them (a rough proxy for quantities); kind tags 63 theory, 28
     benchmark, 1 experiment; 9 pending, 6 with a `known_failure`. Case names include NAFEMS
     LE1/LE2/LE3/LE5/LE6/LE7/LE10/LE11, Lamé cylinder, Kirsch plate, Euler buckling, de Vahl
     Davis cavity and Hertz spheres. There are 1639 `#[test]` functions in `crates`
     (unclassified).
   - Whether the oracle runs in CI is a doc claim ("the theory suite is the gate for every
     merge", `docs/verification.md:24-27`); `xtask/src/main.rs` has `oracle` and `ci`
     subcommands, and whether `ci` invokes the oracle was not confirmed.
3. **The I-beam cantilever claim "0.176 vs 0.177 mm".**
   - The numbers are in `README.md:25` (0.176 vs 0.177, "beam theory with shear") and
     `tools/demo-video/README.md:49-50` (0.1429 bending + 0.0335 shear = 0.1763 mm; solution
     0.1764 mm; "within 3 %"; root stress 44.8 vs 45.0 MPa, "within 2 %").
   - The enforcement is `tools/demo-video/make.py:251-261` (`against_beam_theory`): a
     **client-side Python script** talking MCP over stdio, with hard-coded tolerances `0.03`
     for the tip deflection and `0.02` for the root stress, and `raise SystemExit` if
     `abs(got-want) > tol*want`. The closed-form helper is at `make.py:~210-223` (its body
     was not read beyond the docstring).
   - There is no `tests/oracle` case for it; `tests/corpus/cantilever-i-beam` has only a
     README and a recipe. The README quotes 0.176 and 0.177 where the script reports 0.1764 and
     0.1763 (a minor rounding or version difference), and it is a 3% gate, not a 0.6% one.
   - **So this "verification" is a demo-script gate with a loose tolerance. It is not the
     oracle suite and not a runtime verifier an agent can call.**
4. **Self-checks computed in the solver (the only built-in runtime plausibility checks).**
   Static and nonlinear: load versus reaction balance, `BALANCE_TOLERANCE = 1e-6`
   (`crates/solver/src/system.rs:661`), warning "loads and reactions differ by ..."
   (`analysis.rs:529`, `nonlinear.rs:1598`). Heat: supplied versus removed heat balance
   (`heat.rs:504`). Explicit: energy balance, hourglass ratio, erosion
   (`crates/explicit/src/integrate.rs:479-500`). Buckling: fewer modes than asked, negative
   load factors (`buckle.rs:181-200`). Frequency: rigid-body modes warning (`analysis.rs:647`).
   LBM: diverged, not steady, density spread. Nonlinear: tangent with negative eigenvalues.
   Mesh: `mesh.quality` reports certified validity (det J > 0), per-metric statistics and
   `invalid` / `undetermined` lists (`cmd/mesh.rs:62`, `fn quality_report :648`).
5. **Provenance on results: Verified, essentially absent.**
   - `StepResult` has `step` and per-node arrays. The summary replies carry no input hash, no
     solver version, no mesh id and no timestamp.
   - The revision counter is process-local, not exported in replies, not persisted. Results
     are not saved in `.fieldcraft` (`ModelFile` has model, geometry, journal, header and view
     only: `crates/io/src/lib.rs:276-285`).
   - The inputs fingerprint uses `DefaultHasher`, whose algorithm Rust does not guarantee
     stable across releases, so it is not a portable hash, and it is never returned to the
     caller.
   - What does carry a hash: input geometry files (`SourceFile{path, sha256}`,
     `crates/io/src/lib.rs:120-123`, set at `geometry.rs:105` / `:550`) and package parts in the
     file manifest. Reopening warns "changed since the model was saved" (`cmd/file.rs:192-194`).
   - Staleness is detectable in-session only: `stale` is returned by `results.*` and
     `results.reactions` (`cmd/results.rs:654`), and `results.export.csv` refuses a stale
     reactions table (`:1032-1036`). `probe` and `solve.probe` do not obviously check it (the
     body of `probe` was not opened).

## D. Agent-facing semantics (MCP)

- Errors come back as `isError: true` with the engine message, invalid arguments as JSON-RPC
  -32602 (`docs/mcp.md:132-134`).
- Warnings are strings in a `warnings` array in solve and deck replies: **free text, not typed
  codes, not severity-ranked.** An agent has to read and interpret them.
- `solve` replies include summary numbers (max displacement, max von Mises with node,
  `applied_total`, `reaction_total`) and the warnings array. **There is no `verified`,
  `trusted` or `converged` boolean for the static solve.** For explicit and fluid there is
  `completed` and `ok` / `components_ok` (a design-limit margin on solids, not a verification).
- `mesh` returns `quality` automatically (`tools.rs:392`): the number of invalid elements,
  with no stated pass or fail threshold.
- `check_model` returns `ready`, `errors`, `warnings` and a `progress` checklist with the next
  stage: pre-solve model readiness, not result checking. `show_results` and `reactions` carry
  `stale`.
- "Unknown" states: `mesh.quality` has an `undetermined` list; otherwise there is no tri-state.
- Conclusion: the server tells an agent about problems through free-text warnings plus a few
  status flags. It does not give a pass or fail verdict on a result and does not compare
  against any reference.

## E. The 8-question sheet

1. **Authority:** the `Session` in the engine holds the model, mesh, results and journal.
   Geometry authority sits with the external SolidCraft file, referenced by sha256.
2. **Agent output form:** JSON via MCP tool calls, with free-text `warnings`; screenshots are PNG.
3. **Executor:** in-process Rust engine; solvers run synchronously on threads; headless, or
   bridged to the running app.
4. **Checking:** the model check before a solve; the solver's own balance and energy warnings
   after it; the oracle suite and the demo script run offline or client side. Nothing
   independent sits on the product path.
5. **Identity across edits:** SolidCraft persistent face and edge names (`F1:-x`,
   `<face>|<face>`); nodes and elements are integer labels (new labels after the largest
   existing). `geometry.open` with `keep` reconciles names and reports `renamed`, `mismatched`
   and `stale`.
6. **Round trip:** the `.fieldcraft` file stores the journal, the model and a sha256 of the
   source geometry; opening replays and reopens the design and warns if the design changed.
   Results are not stored. Deck export is one-way; no import of external decks was seen (not
   searched exhaustively).
7. **Hidden state or globals:** a process-wide revision counter; session-level `default_units`,
   `limits` and `file_access`; a `results_view` that is not an edit; **the unit presets
   (`DisplaySystem`) alter how bare numbers are read, which is hidden state affecting every
   command's parameters.**
8. **Ambiguity and units:** bare numbers are read in the session display system, so the same
   JSON means different physical values under different `model.units`. The journal records
   units when they differ (`lib.rs:~452`). Errors for a wrong dimension are explicit.

## Classification

| Stage | Class |
|---|---|
| open / import | mutation (session geometry), hash recorded |
| tet / hex mesh | mutation, long-running |
| material, section, BC, load, step | mutation |
| static, nonlinear, frequency, buckle, heat solve | long-running derived (writes the result store, not the model) |
| explicit, LBM | long-running derived |
| probe, contour, reactions, von Mises extraction | pure query on a stored result |
| deck export | file effect, no model change |
| `mesh.quality`, `model.check` | pure calculation |

## Findings relevant to a verifier and result provenance in Bonyad

1. **The verifier gap is real.** FieldCraft has strong offline verification (92 oracle cases,
   written tolerances with reasons, fixtures) but no runtime verifier an agent can call. The
   only reference check in an agent flow is a client-side Python gate with hard-coded 3% and
   2% tolerances. That is the clearest signal of what an independent verifier should add.
2. **Result provenance is missing.** Replies carry no input hash, solver version or mesh id;
   results are not persisted; staleness exists only as an in-process revision and a `stale`
   flag. Bonyad should attach content hashes of inputs, solver version and mesh identity to
   every result.
3. **The step-scoped fingerprint design is worth copying.** It hashes only what a step reads
   (`step_inputs`), so unrelated edits do not stale a result and an undo makes it current
   again. The weaknesses are the unstable `DefaultHasher` and that it is never exposed.
4. **The oracle case format is a ready template for verifier records:** a measure pointer, a
   reference with a cited source, a tolerance with a mandatory reason, a `known_failure`, and a
   fixture drift band.
5. **Warnings are untyped strings,** so an agent cannot reliably decide acceptance. Bonyad
   should return structured checks (code, severity, measured, threshold, verdict). FieldCraft
   already computes the underlying numbers (balance imbalance, energy balance, hourglass
   fraction, negative pivots).

## Not verified

- Whether STEP import exists (only 3MF and SolidCraft files found).
- Whether the MCP server exposes job cancel or progress (`backend.rs` not read).
- Whether CI actually runs the oracle (`cmd_ci` body not read).
- Whether the egui and CLI call sites use `Session::execute` (doc claim only).
- The body of `make.py`'s hand-calculation function and the numbers printed in a real run.
- Whether `solve.probe` refuses stale results.
- Determinism across platforms beyond what the docs claim.
- Any correctness check of Abaqus, Nastran or LS-DYNA decks beyond the in-crate self-comparison
  test.
- The exact oracle quantity count (346 is a rough grep).
