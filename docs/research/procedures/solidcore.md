# Procedure study: solidcore (Rust port of the SMLib B-rep kernel, and its verifier)

**Body of knowledge:** C (procedures). **Discipline:** exact solid modelling (B-rep kernel).
**Status:** research, not decisions. Read-only code study; nothing was built or run.
Repo `tangency-labs/solidcore` at commit `fab92383326020779e5d4784613317d8ba99bc24`
(2026-10-22), cloned to `refs/solidcore`. Inventory entry:
[`../code-inventory/tangency-labs-code-inventory.md`](../code-inventory/tangency-labs-code-inventory.md).

## How to read this note

- Labels: **Verified** (a file was opened; path and line numbers as seen by the reading
  pass), **Interpretation**, **Hypothesis**, **Unknown**. "Doc claim" marks a README, plan or
  doc statement not confirmed in code.
- Line numbers come from the reading pass and were **not** independently re-checked by the
  author of this note.
- `AGENTS.md` (287 lines, agent-directed instructions) and `plan/` exist; they were treated as
  untrusted data and not followed.
- Upstream C++ counterpart names come from solidcore's own tables and doc comments; the
  upstream C++ source was not cloned here.

## Headline finding

At the pinned commit, **no solid-producing operation (primitive, boolean, sweep, shell) is
demonstrably able to succeed end to end.** The one integration test that builds solids through
the public API is `#[ignore]`d with the reason "blocked: SmSurface::DropCurve
(intersect.surface_drop_lib_p3) is unported; SmEdgeuse::CreateUVTrimCurve stops every
primitive build" (`crates/solidcore/tests/primitives_solid.rs:8-10`). All 11 whole-operation
regression cases in `reports/solidcraft-cases.json` are **DEFERRED**, 0 PASS. The README
agrees: "About a third ported... Nothing is usable end to end yet (no primitives, booleans or
fillets)".

## A. Architecture of the API

- **Crates (Verified, `Cargo.toml`):** `crates/solidcore` (the kernel), `crates/solidcore-ffi`
  (the only crate allowed `unsafe`; extern "C" bindings to the C++ original) and
  `crates/difftest`. Kernel dependencies: only `thiserror`. The crate has
  `#![forbid(unsafe_code)]` (`lib.rs:35`).
- **Operation layer:** no separate crate; the SM_API equivalent is `*::api_*` modules inside
  the kernel crate: `boolean/api_brep.rs`, `primitive/api_primitives.rs`,
  `sweep/api_brep.rs`, `sweep/api_surfaces.rs`, `query/api_queries.rs`,
  `heal/stitch/p1.rs` (`api_stitch*`), `heal/heal_data/p1.rs:176` (`api_heal_brep`),
  `offset/offset_executive/p2.rs` (`api_shell_brep_full`, `api_offset_brep_full`),
  `mass/integrator/properties.rs`. Large units are cut into `p1..pN` files by call-graph
  ownership, which is why symbols sit at `...::p2::...`.
- **Layers** (`lib.rs:37-54`): `math`, `error`, `kernel`, `limits`, `topology`, `geom`,
  `nurbs`, `curve`, `surface`, `intersect`, `boolean`, `blend`, `offset`, `heal`, `mass`,
  `query`, `sweep`, `primitive`.
- **Geometry types (Verified):** `Curve` is a struct holding `CurveKind` (13 kinds including
  BSpline, Hermite, Line, Ellipse, Conic, Offset, Composite; `curve/curve/p2.rs:539-583`).
  `Surface` holds `SurfaceKind` (11 kinds including Plane, Cone (with cylinder), Sphere, Torus,
  BSpline, OffsetSurface, SurfOfRevolution, SurfOfExtrusion; `surface/surface/p2.rs:277-326`).
  NURBS: `BSplineCurve` (`nurbs/b_spline_curve/p1.rs:291`), `BSplineSurface`
  (`nurbs/b_spline_surface/p1.rs:408`).
- **Topology (Verified, `topology.rs`):** `Brep` (line 599) holds one arena per kind: shells,
  faces, loops, edges, vertices, regions, faceuses, loopuses, edgeuses, vertexuses. `Face
  {shell, loops, surface: Option<Surface>, faceuse, uv_domain, tolerance...}` (383) and `Edge
  {vertices:[VertexId;2], edgeuses, interval, tolerance, curve: Option<Curve>}` (346). It is
  SMLib's half-edge / use model, not a simple shell-face-loop-edge-vertex tree.
- **Topology-to-geometry link:** geometry is owned **by value** inside the topology record
  (`Face.surface`, `Edge.curve`), not referenced by id. Geometry carries an `owner:
  Option<ObjectRef>` back-pointer and a cached `owner_zone_tol_3d`. Cloning a `Curve` or
  `Surface` resets the owner and the identity.
- **Id / handle model (Verified):**
  - Ids are `u32` newtypes from `typed_id!` (`topology.rs:87-165`): `FaceId`, `EdgeId`, and so
    on. They are per-`Brep` indices, meaningful only for the issuing B-rep. `Arena` is
    `Vec<Option<T>>` (`topology.rs:172-215`); removal empties the slot and ids are never
    reused. `BrepId` names a B-rep "within a caller-owned collection".
  - A second identity system, `ObjectKey(u64)`, serves attributes and notifications. It is
    kernel-issued from a per-`Context` counter with bit ranges (bits 62-63 `0b10` for topology
    keys, `0b11` for geometry keys; `geom/context.rs:212-260`). The counter is `Arc<AtomicU64>`.
  - **Interpretation:** an id is not a content hash. A new body from a boolean has its own
    arena indices, so there is no cross-operation identity map.

## B. Procedure records

**Common to all (Verified):** every function takes `k: &mut Kernel` or `&Kernel`, the explicit
session context. It holds `Tolerances {zone_tol_3d=1e-5, xsect=2e-5, approx=5e-6,
ang_tol_deg=0.5, model_size_estimate=50...}`, the seeded `Rng`, `Caches` (currently empty) and
`Context` (marks, boolean flag, callbacks) (`kernel.rs:30-183`). **Units are unitless model
units.** Tolerance is **not** a per-call argument for the API: it is read from `Kernel` and
from per-entity tolerances (`Brep.tolerance`, `Face.tolerance`, `Edge.tolerance`); a few
functions take an explicit tolerance (`api_stitch_advanced(stitch_tol_3d)`, the mass
functions' `accuracy`). Errors: `Result<T, SolidError>`; `SolidError` is `#[non_exhaustive]`
(`error.rs:97-184`) with variants InvalidInput, NotFound, Degenerate, NotConverged,
Unsupported, `Upstream{code:i32}`, `Nlib{NlibCode}`, `Unported{upstream, unit}`; variants carry
`operation: &'static str`, the Rust path of the failing function.

| Operation | Symbols (file:line) | Record |
|---|---|---|
| **Boolean** union, difference, intersection, merge | `boolean_union` `boolean/api_brep.rs:191`, `boolean_difference` `:201`, `boolean_intersection` `:211`, `boolean_merge` `:221`, `boolean` `:176`, `boolean_with_options` `:271`, `merge_breps` `:236` (N-ary), `boolean_lists` `:289`, `boolean_trees` `:311`. Upstream `SmApiBooleanUnion`, `SmApiBoolean`, `SmApiMergeBreps` in SmApiBrep.cpp | Inputs: `Brep` operands **by value** plus `BooleanOperation`; `merge_breps` takes `&mut Vec<Brep>`. Validation minimal (ExtractSeparate rejected; list needs at least 2 entries). Output: a new `Brep` (`BooleanOutcome{result, other}`); operand 1 is "modified into" the result and operand 2 consumed, so **the result keeps no link to the inputs**. Upstream NULL and aliasing checks are unrepresentable by ownership (module doc, lines 21-31). Effects: mutates `Kernel` (mark locks); not pure. Status: a thin driver over `merge::p3`; the success path is not demonstrated |
| **Fillet, chamfer** | `surface_surface_fillet<O,A>` `blend/fillet_executive/p2.rs:1100`, `FilletExecutive::do_filleting` `p3.rs:1307`, `do_surface_filleting` `p2.rs:621` | The `SmApiFillets.cpp` layer (`SmApiFilletEdges`, `SmApiChamferFillet`, `SmApiVariableRadiusFillet`...) is listed in `plan/closure.md:49` (doc claim) but **no edges-to-fillet public API was found in code** (`blend.rs:6` only mentions it in a comment). The executive is generic over an `ExecutiveAccess<O>` trait (`p3.rs:303`) whose default methods return `Unported` (for example `corner_solvers`, `p3.rs:315-321`). No dedicated chamfer function found (Unknown for a miss) |
| **Offset, shell** | `offset_brep(kernel, &mut Brep, OffsetOptions, notifications) -> Result<Brep>` `offset/offset_executive/p2.rs:175`; `api_offset_brep_full` `:820`; `api_shell_brep_full` `:796`. Upstream `SmApiOffsetBrepFull`, `SmApiShellBrepFull` | Output: a new `Brep`; the input `&mut` is only for lazy UV-trim updates. Ordinary inner failures collapse to `SM_ERR` (1001); `Unported` propagates. **`api_shell_brep_full` always ends in `Err(Unported("SmBrep::SmBrep","topology.brep_p3"))` after validation** (`p2.rs:~796-818`) |
| **Sweep** (linear, rotational, draft, pipe, curve, taper) | `create_linear_sweep` `sweep/api_brep.rs:120`, `create_rotational_sweep` `:152`, `create_draft_sweep` `:188`, `create_pipe_sweep` `:232`, `create_curve_sweep` `:328`, `create_taper_extrude` `:477` | Inputs: `&[Option<&Curve>]` plus direction, distance, angle in **degrees**. Output: a new `Brep`; input curves are copied, never mutated. `InvalidInput` for a `None` curve, otherwise `Unported` per the doc comments |
| **Skin, loft, ruled, extrude, revolution surfaces** | `create_skin(k, profiles: &[BSplineCurve]) -> Result<BSplineSurface>` `sweep/api_surfaces.rs:328` (2 or more profiles, interpolated, degree 3 default); `create_skin_primitive` `:160` (solid); `create_skin_from_faces` `:214`; `create_ruled_surface` `:267`; `create_extrude` `:244`; `create_surface_revolution` `:282` | The surface-only forms are pure calculations returning a new surface. The primitive form builds a `Brep` and is blocked on the B-rep constructor |
| **Surface-surface intersection** | `intersect::surface_intersector::p5::do_intersection(k:&Kernel, surface1, uv_domain1:&Extent2d, surface2, uv_domain2, use_surface_edges:[bool;2], opt_approx_tol_3d: Option<f64>, opt_ang_tol_rad: Option<f64>) -> Result<SurfaceIntersection>` `p5.rs:336`; `do_intersection_with_context` `:366`; `SurfaceIntersector` struct `p1.rs:540`; analytic-pair routines (`intersect_with_plane/sphere/cone`) | Pure: `&Kernel` and `&Surface` in, new curve objects out. Domains clipped to the natural domain (`p1.rs:~640`). Tolerances come in as optional arguments and default from the kernel and the surface. **The strongest-evidence operation** (119-case corpus; section D) |
| **Mass properties, queries** | `brep_area` `mass/integrator/properties.rs:581`, `brep_volume` `:590`, `brep_mass_properties` `:628` (accuracy, density, origin, attributes -> `MassProperties{properties, centroid, inertia, products}`), `face_centroid` `:558`. Queries in `query/api_queries.rs`: `curve_closest_point` `:138`, `brep_closest_point` `:303`, `brep_relationship` `:450`, `brep_distance` `:512`, `brep_bounding_box` `:614`, `face_classify_uv` `:639`, `edge_tangent` `:767`, `brep_is_manifold_solid` `:609` | All take `&Kernel` and `&Brep`: pure. Validation (`:616-660`): finite numbers, density at or above `EFF_ZERO`, no per-entity mass-attribute override, **manifold solid required**. Accuracy is clamped (`1e-4..1e-1` for mass properties, `1e-8..1e-1` for volume) |
| **Primitives** | `create_box(k, origin, length, width, height)` `primitive/api_primitives.rs:186`, `create_sphere` `:209`, `create_cylinder` `:223`, `create_cone` `:263`, `create_torus` `:314`, `create_pyramid` `:362`, plus partial variants and `*_surface` overloads returning a bare analytic surface (`create_cylinder_surface` `:236`) | Checks (`:100-135`): `is_positive_dim` = finite and above `EFF_ZERO`; a negative sphere radius is a valid inside-out sphere. Violations give `InvalidInput`. Output: a new `Brep`; the B-rep path ends in the `PrimitiveCreation` chain. The surface-only overloads are pure |
| **Healing, stitching** | `api_stitch(k, Option<&mut Brep>)` `heal/stitch/p1.rs:2203`, `api_stitch_face` `:2220`, `api_stitch_into_solid` `:2267`, `api_stitch_into_shell` `:2278`, `api_unify_normals` `:2296`, `api_simple_face_stitch` `:2321`, `api_stitch_advanced(k, b, stitch_tol_3d, AdvancedStitchOptions)` `:2355`, `api_heal_brep` `heal/heal_data/p1.rs:176` | **The only operations that mutate in place.** `Option<&mut Brep>` models upstream NULL, giving `InvalidInput` ("null B-rep"). `api_stitch` ignores the stitch status and returns `Ok(())` (`:2203-2209`), faithful to upstream. `api_stitch_face` documents an upstream NULL dereference (UB-167) reproduced via an error path |
| **Boolean lists, trees** | `boolean_trees` mutates `&mut Vec<Option<Brep>>` in place (operands consumed); `boolean_lists` is non-mutating on `&[Brep]` and `&[Surface]`, taking `&mut Kernel` only for marks | |

## C. Port status

**Doc claims.** `README.md` and `crates/solidcore/README.md`: "About a third ported...".
`plan/PROGRESS.md`: "238 / 261 units ported (116 green, 122 partial)", "89.8% of upstream
lines" (auto-generated, stale relative to the per-unit files). `plan/STATUS.md`: a running log
with no end-to-end claim.

**Confirmed in code.**

- The `plan/units/*.toml` files have **261 units: 140 green, 118 partial, 3 todo** (the 3 todo:
  `audit.recursion`, `blend.fillet_solver_p4`, `intersect.surface_drop_lib_p3`). The README's
  "a third" is out of date against the plan data.
- Every operation unit named above is `partial` (boolean.merge_p1/p3/p4, boolean.api_brep,
  blend.fillet_executive_p2/p3, offset.offset_executive_p1, sweep.api_brep,
  primitive.api_primitives, heal.stitch_p1, mass.integrator, query.api_queries, query.brep).
- `todo!` / `unimplemented!`: 0 hits in `crates/solidcore/src`; both are denied by lint
  (`Cargo.toml`: `unwrap_used`, `expect_used`, `panic`, `indexing_slicing`, `todo`,
  `unimplemented` = "deny"). **The stub mechanism is `SolidError::Unported`: 395 construction
  sites and 262 `// UNPORTED(<unit>)` markers** (grep counts). A clean count of non-test
  `unwrap`/`panic` was not obtained; one `#![allow]` exists in a test file (`p3_tests.rs:3`).
- `reports/solidcraft-cases.json`: 11 whole-operation regression cases, **11 DEFERRED, 0 PASS**,
  blocked by `primitive.primitive_creation_p1` (9) and `_p2` (2).

**Assessment (Interpretation).** The math, NURBS, curve and surface layers and large parts of
topology are ported and checked against C++ (each bound with a difftest runner). The operation
layer is mostly signatures, validation and orchestration that terminates in `Unported` at the
first unported callee. Pure calculations (surface-surface intersection, mass properties on a
B-rep, closest point) are the most mature, but mass properties need a manifold solid, which
needs primitives or an imported B-rep, so they are also unverified on real solids at this pin.
The fillet and chamfer public API is absent.

## D. Verification method (difftest): the verifier pattern

1. **Two-sided runs.** For each unit a runner executes the real upstream C++ (built into
   `bin/cpp`, linked via `solidcore-ffi`, about 200 C++ shims in `harness/cpp`) and the Rust
   port on identical inputs from `fixtures/<unit>/*.json` plus seeded generated cases
   (`--seeds N`, default 16). 243 fixture directories exist. Nothing was run.
2. **Normalised output record** (`output.rs:28-44`): `Output{values: name->Vec<f64>, ints:
   name->Vec<i64>, topology: Option<Topology{entities, adjacency}>, error: Option<String>,
   deferred, rejected, diagnostics}`. Both sides fill the same keys.
3. **Comparison rule** (`compare.rs:1-12`, `:85-120`): `REL_TOL = 1e-9` ("never weaken it").
   Floats: equal, both NaN, or `|a-b| <= 1e-9 * max(|a|,|b|)`; no default absolute floor
   (floors only where a unit documents one per key, `AbsFloor`). Integers, topology ids,
   adjacency lists and error strings must match **exactly**; array lengths and key sets must
   match. **Interpretation:** "identical topology" here means identical ordered id and adjacency
   lists, which is traversal-index equality, stricter than isomorphism and sensitive to
   ordering.
4. **Status is compared.** If either side errors, both must report the same normalised error
   string (`compare.rs:98-110`); a C++ success against a Rust error fails. `Output::from_result`
   forbids mapping `Err` to an empty output.
5. **Deferred.** If Rust hits `SolidError::Unported`, the case is *deferred* (neither pass nor
   fail) and the report records `blocked_by <unit>(<n>)` (`output.rs:19-23`, `:104-112`).
6. **Anti-vacuity.** The summary counts `with_values`, `no_values`, `vacuous` (both sides
   succeeded but only status compared) and `nonzero_compared` / `only_zeros`
   (`compare.rs:44-62`). They are reported, not gated.
7. **Self-test and sensitivity (doc claims; the tolerance rule matches code).** `--perturb`
   mutates one output item per case (float x(1+1e-8), int +1, topology id +1...) and passes
   only if every perturbation is caught. `--fuzz N` mutates inputs and runs each in a child
   process (crash, hang, panic detection). `--selftest` is unit `harness.selftest`.
8. **Gating.** A unit may be `green` only if `difftest --status-of` says so; `partial` means
   passes with some cases deferred. `known_mismatches.toml` lists accepted failures; the
   committed file is just a commented template.
9. **Reports.** `reports/difftest/*.json` is CI-generated and **not committed**; only
   `reports/solidcraft-cases.json` and `reports/ssi-corpus.json` exist. Per-unit pass counts
   are plan-file doc claims, for example `boolean.api_brep` 287 cases, 151 pass, 0 fail, 136
   deferred, with the passing cases being integer status or list records with "no geometric-
   success comparison" (`plan/units/boolean.api_brep.toml`).
10. **SSI corpus** (separate, not a gate): 119 cases with exact ground truth. Committed result
    (`reports/ssi-corpus.json`): C++ PASS 81, INCOMPLETE 25, WRONG TOPOLOGY 11, ERROR 2; Rust
    PASS 78, INCOMPLETE 21, WRONG TOPOLOGY 10, DEFERRED 9, ERROR 1; **parity: 110 compared, 110
    identical, 0 mismatched.** Interpretation: the best-evidenced case of Rust output equalling
    C++ on a real operation; it also shows the C++ original itself gets about 68% PASS against
    ground truth, so **parity with C++ is not correctness**.
11. **Not verified:** whether "1e-9 relative with identical topology" holds for any whole-body
    operation (booleans, shell, sweep): all such cases are deferred or compare status records
    only. Whether the C++ build is bit-reproducible across platforms (README: Linux/GCC is the
    parity reference; macOS "does not establish parity") is a doc claim.

## E. Provenance and attribution

solidcore is a Rust port (derivative work) of SMLib and SM_API from NVIDIA's USD BRep
(`github.com/NVIDIA-Omniverse/usd-brep`, pinned commit `c9c5979`), under Apache-2.0, copyright
2020-2026 NVIDIA CORPORATION & AFFILIATES. `ATTRIBUTION.md` says only `source/SMLib`,
`source/SM_API`, `tests/SM_API_test`, `tests/prog_test`, `TestFiles/pt_TestFiles` and some
upstream developer docs are read, ported or exercised. Excluded: the OCCT translators,
USD/Hydra integration, Python bindings and tooling, and proposals. It claims no GPL or LGPL
code. `NOTICE` lists modifications: translation to Rust, "arena topology, typed ids, error
values instead of status codes, explicit kernel state instead of a global context", and says
each ported file names its upstream source in its header. Test corpora: ssi-corpus (MIT OR
Apache-2.0, pinned `b04c8a6`, fetched at run time, not committed) and a paper-derived subset
(Yang, Jia and Yan 2023, CC-BY). The progress site vendors d3-force (ISC). The repo's own
licence is Apache-2.0 (`Cargo.toml` workspace.package). This is a reading of two files, not a
legal opinion.

## F. The 8-question sheet

1. **Authority:** upstream C++ SMLib is the oracle; "numerical agreement with the C++" is the
   acceptance criterion (doc claim; `compare.rs` implements it). No independent ground truth
   except the SSI corpus.
2. **Agent output form:** no LLM runtime role. The contribution model invites AI agents to
   port units through pull requests (README, `AGENTS.md`); the output is Rust code plus a plan
   TOML, gated by difftest.
3. **Executor:** in-process Rust functions taking `&mut Kernel`. No scheduler or job model.
4. **Checking:** difftest, unit tests and fuzz. No runtime post-condition checker on results
   in the public API; `brep_is_manifold_solid` exists as a query.
5. **Identity across edits:** arena ids are stable within a B-rep and never reused after
   deletion. Booleans return a new `Brep` with fresh indices and no map to the inputs. A
   separate kernel-issued `ObjectKey` is used for attributes and notifications, with
   `NotifyCallback` hooks on `Context` (`geom/context.rs:188-210`). Merge and stitch have
   notification callbacks that could carry history (Interpretation); a usable input-to-output
   provenance map was not confirmed.
6. **Round trip:** `topology/database_io` and `brep_data` read and write SMLib's ASCII DB
   format (only `brep_data.rs` test fragments were read). No STEP or IGES for B-reps;
   `nlib/iges` is curve and surface level. Fidelity: Unknown.
7. **Hidden state and globals:** designed out (doc claim and partly Verified). Tolerances,
   RNG and caches live in `Kernel`; the RNG is SplitMix64 seeded from `KernelOptions::seed`
   (`kernel.rs:75-114`), replacing upstream `srand(time)`; the only shared state found is
   `Arc<AtomicU64>` key counters inside `Context` (`context.rs:246`,
   `sweep/topology_sweep/store.rs:23`). Results that depend on random draws cannot match C++
   bit-for-bit (`kernel.rs:22-26`). A mutable `Kernel` per call means calls are not
   order-independent: marks, RNG state and counters advance (Interpretation). The C++ side
   keeps global state, which is why difftest runs units in separate processes.
8. **Ambiguity and units:** implicit model units, no unit type. Angles are degrees in the sweep
   API (`angle_deg`) and radians in SSI (`opt_ang_tol_rad`) (Verified). Default tolerance 1e-5
   assumes model size about 50 (`model_size_estimate`). Orientation sign carries meaning
   (negative sphere radius = inside-out; `distance < 0` = inset in offset). Ambiguity is
   resolved by upstream convention, not typed.

## Classification

| Operation | Class |
|---|---|
| boolean union, difference, intersection, merge | produces new body (inputs consumed by value) |
| `boolean_with_options` | produces new body (and optionally returns the second operand) |
| `merge_breps` (N-ary) | produces new body (drains the input `Vec`) |
| `boolean_lists` | produces new bodies (inputs by reference, unchanged) |
| `boolean_trees` | mutates the `Vec<Option<Brep>>` in place |
| primitives (box, sphere, ...) | produces new body |
| primitive `*_surface` overloads | pure calculation (returns a surface) |
| sweeps (linear, rotational, draft, pipe, curve) | produces new body (profile curves copied) |
| skin, ruled, extrude, revolution surfaces | pure calculation (returns a surface) |
| skin primitive, skin from faces | produces new body |
| `offset_brep`, `api_offset_brep_full` | produces new body (input `&mut` only for caches) |
| `api_shell_brep_full` | produces new body (currently always `Unported`) |
| fillet executive, `surface_surface_fillet` | produces new body (via an access trait; no public API found) |
| surface-surface intersection | pure calculation |
| mass properties, area, volume | pure calculation |
| closest point, relationship, distance, bounding box, classify | pure calculation |
| `api_stitch*`, `api_unify_normals`, `api_simple_face_stitch`, `api_heal_brep` | mutates in place |

## Findings relevant to typed procedure contracts and a verifier

1. **Three ownership shapes, not one.** Pure calculations (`&Kernel`, `&T`), consume-and-
   produce (`Brep` by value), and in-place mutation (`&mut Brep`). A procedure contract needs
   an explicit effect class per operation. solidcore documents the Rust-versus-C++ difference
   per function (for example "`brep1` is modified into the result; `brep2` is consumed",
   `boolean/api_brep.rs:21-31`), and turns C++ NULL and alias errors into type-level
   impossibilities.
2. **"Not implemented" is a typed outcome separate from failure.** `SolidError::Unported{
   upstream, unit}` versus real errors, plus the difftest `deferred` bucket, give a three-way
   verdict (pass / fail / cannot evaluate yet) that a Bonyad verifier should copy: "unchecked"
   must not count as "pass". Only an ignored test and 11 DEFERRED cases reveal that
   solid-producing operations do not run at this pin.
3. **The verifier is differential, not property-based.** A reference executor (C++) and a
   candidate (Rust) are compared with a fixed rule: floats at 1e-9 relative, everything else
   exact, status compared, topology as ordered id and adjacency lists. The anti-vacuity
   counters and `--perturb` (a mutation test of the comparator itself) are the transferable
   parts. The plan notes cases that compared only success status.
4. **Tolerance is ambient, not typed per call.** It lives in `Kernel` plus per-entity fields;
   a few functions take explicit tolerance or accuracy, clamped inside. A contract must
   therefore include the Kernel tolerance snapshot and RNG seed as an input of every operation.
5. **Identity is index-per-B-rep with no history map.** Ids are stable under in-place edits but
   not across operations that return a new `Brep`; geometry is owned by value with its own
   kernel-issued keys. A Bonyad split would need its own cross-operation entity mapping.

## Not verified

- Any successful end-to-end run of any solid operation (nothing built or run; the committed
  evidence says they are deferred).
- Per-unit difftest pass counts and the 1e-9 claim for B-rep operations (`reports/difftest/`
  is not in the repo; plan numbers are doc claims).
- The C++ shim side (`harness/cpp`) and how the C++ topology export numbers entities, so the
  exact meaning of "identical topology" at the C++ boundary is unread.
- Whether a fillet or chamfer public API or an edge-selection API exists elsewhere (none found).
- Non-test `unwrap`/`panic` count (lint-denied; not independently counted); WASM determinism
  (doc claim).
- The upstream C++ source (not cloned here).
