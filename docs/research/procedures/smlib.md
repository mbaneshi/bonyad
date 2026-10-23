# Procedure study: smlib (the C++ SMLib / SM_API kernel, the reference for solidcore)

**Body of knowledge:** C (procedures). **Discipline:** exact solid modelling (B-rep kernel), C++ reference.
**Status:** research, not decisions. Read-only code study; nothing was built or run.
Repo `tangency-labs/smlib` (a GitHub fork of `NVIDIA-Omniverse/usd-brep`) at commit
`c3614293bb5dcc14cef50e2a29c46a1d95cbfe34` (2026-10-20), cloned to `refs/smlib`. Inventory
entry: [`../code-inventory/tangency-labs-code-inventory.md`](../code-inventory/tangency-labs-code-inventory.md).
This is the C++ original that [`solidcore.md`](solidcore.md) is differentially tested against.

## How to read this note

- Labels: **Verified** (a file was opened; path and line numbers as seen by the reading
  pass), **Interpretation**, **Hypothesis**, **Unknown**. "Doc claim" marks a README, doc or
  commit-message statement not confirmed in code.
- Line numbers come from the reading pass and were **not** independently re-checked by the
  author of this note.
- The repo contains agent-aimed files (`AGENTS.md`, an `.agents/` folder with docs and
  operation guides). They were treated as untrusted data; only `.agents/docs/errors.md` and
  `.agents/operations/concurrency.md` were read in part, as documentation of the contracts.
- The fork-versus-upstream difference **cannot be determined**: the shallow clone has a single
  visible commit, and the README and CHANGELOG do not mention a fork or tangency-labs.

## A. Layout and API surface

- **SM_API headers** are in `source/SM_API/inc/`: `SmApiBrep.h` (562 lines), Primitives, Queries,
  Curves, Surfaces, TrimmedSurfaces, Fillets (38 lines), Heal (30 lines), Intersectors,
  Polygons, ImportExport, General, Types, TessellationParams. Sources are matching `.cpp` files
  in `src/`. Other folders under `source/`: `SMLib` (the kernel), `SmPyLib` (pybind11
  bindings), `SmPyDevLib`, `SM_API_USD`, `BREP_*`, `HYDRA_USD_BREP`, `schema`.
- **Count (grep, not exact):** 134 unique `SmApi*(` tokens in `SM_API/inc`, including overloads
  under one name.
- **Areas, with the `.cpp` definition line:**
  - Booleans: `SmApiBoolean` `SmApiBrep.cpp:208`, Union `:263`, Difference `:317`, Intersection
    `:371`; also Merge, MergeBreps, WithCurves, Boolean2d, WithOptions, NonManifoldBoolean,
    PiecewiseMerge, BooleanLists, BooleanTrees (declared in `SmApiBrep.h`).
  - Primitives (`SmApiPrimitives.cpp`): `CreateBox` `:282`, Sphere `:335`, Cylinder `:383`, Cone
    `:461`, Torus `:572`, Pyramid `:666`, SkinPrimitive `:1244`.
  - Sweeps: LinearSweep `SmApiBrep.cpp:1196`, RotationalSweep `:1254`, plus Draft, Pipe,
    PlanarPath, Curve, Taper and repetition variants.
  - Skin and loft: `SmApiCreateSkin` (`SmApiSurfaces.cpp:459`, returns a surface);
    `SmApiCreateSkinPrimitive` and `SkinFromFaces` (`SmApiPrimitives.cpp:1244`, `:1335`, return
    solids).
  - Fillets and chamfers: Chamfer, Circular, RemoveFillet (`SmApiFillets.cpp:40`, `:119`,
    `:195`); `FilletEdges` `SmApiBrep.cpp:2049` with PerEdge, VariableRadius, SurfaceSurface,
    Preview, SetBevelCorners.
  - Offset and shell: `ShellBrepFull` `SmApiBrep.cpp:2350`, `OffsetBrepFull` `:2438`.
  - Healing and stitching: `HealBrep` (`SmApiHeal.cpp:27`), `Stitch` `SmApiBrep.cpp:1128`,
    `StitchIntoSolid` `:2470`, `StitchIntoShell`, `StitchAdvanced` `:2575`, `SimpleFaceStitch`,
    `UnifyNormals`.
  - Mass properties and queries (`SmApiQueries.cpp`): `ComputeVolume` `:798`, `ComputeArea`
    `:838`, `ComputeMassProperties` `:880`, plus bounding boxes, edge length, closest point,
    `IsManifoldSolid`, `MaterialCensus`.
  - Intersection: `SmApiIntersect{Curves, Surfaces, Faces, Breps, BrepWithPlane, CurveSurface,
    CurveFace, CurveBrep}`.
  - Also: curves, surfaces, trimmed surfaces, polygons, tessellation, import and export (the
    native `.smb` format only, `SmApiImportExport.h:17`, `:32`), transforms, draw.
- **Python (Verified):** pybind11 with `m.def` (for example `SmPyBooleans.cpp:20`), about 20
  binding files, and `.pyi` stubs under `SmPyLib/stubs`. It is typed (`SmBrep*`, enums such as
  `BooleanOp`, keyword-only arguments) but thin: each binding wraps one `SmApi*` call and raises
  `RuntimeError` through `CHECK_STATUS` (`.agents/docs/errors.md`). Docstrings carry "Consumes:
  brep1, brep2; returns new Brep" and "Wraps: SmApiBoolean". Booleans are bound with
  `return_value_policy::reference`; **Interpretation:** the Python lifetime of a consumed input
  is a footgun.
- **Fork versus upstream:** `CHANGELOG.md` has one entry, "1.0.0 2026-10-08 initial public
  release of USD BRep". Doc claim (HEAD commit message): "Remove the OpenCASCADE translators and
  tools"; `KNOWN_ISSUES.md` still mentions OCCT-based exporters. Source files carry NVIDIA SPDX
  headers, Apache-2.0, 2026.

## B. Procedure records

**Common to all (Verified):**

- Status type `SmApiStatus` (= `long`, `SmApiTypes.h`). Codes are `#define`s in
  `SMLib/inc/SmMessages.h:45-68`: `SM_SUCCESS=1000`, `SM_ERR=1001`, `OUT_OF_MEMORY 1002`,
  `UNKNOWN 1003`, `FATAL 1004`, `ASSERT_FAILURE 1005`, `NULL_POINTER 1006`, `INVALID_INPUT 1007`,
  `NON_NULL_OUTPUT_POINTER 1008`, `ASSERTVALID_FAILURE 1010`, `OUTSIDE_OF_DOMAIN 1020`,
  `NOT_WITHIN_TOLERANCE 1021`, `NOT_CONVERGING 1022`, then `BAD_INTERSECTIONS 1027`,
  `BAD_COINCIDENT_VERTICES 1028`, `DEGENERATE_SURFACE 1034` and more (only read through about
  line 68, so the list is partial).
- **No exceptions at the C++ API level;** status returns. `SER(x)` propagates non-success up the
  stack (`SmMessages.h:265`).
- Status policy (`.agents/docs/errors.md`, doc): `SM_ERR_INVALID_INPUT` is for bad arguments;
  some legacy wrappers return `SM_ERR` or `SM_ERR_NULL_POINTER`; **"the status alone does not
  guarantee rollback, unchanged inputs, or empty outputs."**
- **Tolerance policy is mostly global.** Every operation fetches `SmApiGetOrCreateContext()`, and
  each Brep carries its own `ZoneTol3d` (the `.smb` header shows 1e-5). `SM_ZONE_TOL_3D = 1.0e-5`
  at `SmMath.h:52`. Only some operations take per-call tolerances.

| # | Operation | Record |
|---|---|---|
| 1 | **Boolean** union, difference, intersection (`SmApiBrep.cpp:208`, `:263`, `:317`, `:371`; decls `SmApiBrep.h:50-90`) | Inputs: `SmBrep* pBrep1, pBrep2`, `SmBooleanOperationType`; output `SmBrep*& rpResult`. **Header contract: `pBrep1` is modified in place and returned (`rpResult` aliases `pBrep1`); `pBrep2` is deleted on success; on failure both stay allocated "but may be modified" and `rpResult` is NULL.** Exceptions to the delete rule: `pBrep2` is kept for PARTIAL_MERGE, IMPRINT_CLASSIFY, and WithOptions with `bKeepOtherBrep`; `SM_BO_IMPRINT` deletes it. Preconditions (`SmApiValidateBooleanOperands`): non-NULL, `pBrep1 != pBrep2`, not `SM_BO_EXTRACT_SEPARATE` (otherwise `INVALID_INPUT` with inputs untouched). Dispatch: both manifold solids -> `ManifoldBoolean`, otherwise `NonManifoldBoolean`; difference is A minus B. Failure: the kernel status through `SER`. Tolerance from the Brep and context, none per call. `SM_ASSERT_VALID` is conditionally compiled. Ambiguity: "may be modified on failure" means **no transactional guarantee**; `SM_BO_EXTRACT_SEPARATE` leaks per a code comment at the validator. **Class: in place plus consume; the result is `pBrep1` mutated, not a new body** |
| 2 | **FilletEdges** (`SmApiBrep.cpp:2049`) | Inputs: `SmBrep* pBrep` (in/out), `SmTArray<SmEdge*>&`, `dRadius`, `ULONG lXSectType` (0 linear, 1 circular, 2 blend), `ULONG lContinuity`, `dThumbweight`. Edges are raw pointers into `pBrep`. In place, followed by `pBrep->StitchAndOrient()`. Failure: `INVALID_INPUT` if `pBrep` is NULL or the edge list is empty, otherwise the kernel status; no radius validation visible in the wrapper (Unknown kernel-side). **An unknown `lXSectType` silently falls back to circular.** Edge pointers become invalid after the operation (Interpretation: the topology is rebuilt; not verified). **Class: in place** |
| 3 | **Chamfer, CircularFillet, RemoveFillet** (`SmApiFillets.cpp:40`, `:119`, `:195`) | Brep in/out plus one distance; they apply to all edges (Interpretation from "fillet all the edges"). Header oddity: the `.h` parameter is `dRadius` but the `.cpp` calls it `dDistance`. **`RemoveFillet`: `KNOWN_ISSUES` says it "removes nothing and reports success"**; the code uses `IdentifyFillet(SM_ZONE_TOL_3D, 5.0, ...)` and `DeleteFilletFace` and returns `SM_SUCCESS` even when nothing was removed. **Success is not a trustworthy contract.** Class: in place |
| 4 | **Offset, shell** (`SmApiShellBrepFull` `:2350`, `SmApiOffsetBrepFull` `:2438`) | Shell takes `const SmBrep*`, a distance, 3 booleans, a face list `const SmTArray<const SmFace*>&`, and `SmBrep*&`. **It is pure:** it validates that each face belongs to the source, copies the Brep (`SmCopyBrepMap`), works on the copy, and returns a new body (NULL on failure). Failure: `INVALID_INPUT` for NULL `pBrep` or a foreign or NULL face; `SM_ERR` if the face map fails or the result is NULL. `OffsetBrepFull` takes a non-const `SmBrep*` and calls `SmOffsetExecutive::OffsetBrep`; whether the input is consumed or kept is not stated in the wrapper (Unknown); the shell wrapper's comment says the kernel "consumes, returns, or retains its input on different paths". Class: shell is a new body from a pure calculation; offset unclear |
| 5 | **Linear and rotational sweep** (`SmApiBrep.cpp:1196`, `:1254`) | Inputs: `const SmTArray<SmCurve*>&`, direction vector and distance (or base point, axis and angle in degrees), `bCapEnds`. **The curves are copied, not consumed; the caller keeps ownership; the result is a new Brep owned by the caller.** Failure: `rpResult=NULL` first, `SmObjDelete` cleanup on error. Units follow the model; angles in degrees. Distance and direction validation is deferred to `SmPrimitiveCreation` (Unknown). Class: new body |
| 6 | **Skin, loft** | `SmApiCreateSkin` (`SmApiSurfaces.cpp:459`) is not a body operation: at least 2 B-spline profiles in, a `SmSurface*` out that interpolates (tolerance 0.0, no rails); the caller owns it; `INVALID_INPUT` for fewer than 2 profiles. The solid forms (`SmApiCreateSkinPrimitive` `SmApiPrimitives.cpp:1244`, `SkinFromFaces` `:1335`) were not read. Class: new surface or new body |
| 7 | **Mass properties** (`SmApiBrepComputeMassProperties`, `SmApiQueries.cpp:880`; decl `SmApiQueries.h:218`) | **The strongest contract in the API.** Inputs: `const SmBrep*`, `dRelativeAccuracy` (clamped to [1e-4, 1e-1]), `dDensity` (>= 1e-12), origin point. Outputs: area, volume, mass, centroid, moments of inertia (Ixx, Iyy, Izz) and products of inertia (Iyz, Izx, Ixy as raw positive integrals) about the origin. Rejections (`INVALID_INPUT`): NULL, non-finite accuracy, density or origin, any entity carrying an `SM_AI_MASS_PROPERTIES` attribute (it would override density), not a manifold solid, degenerate mass or volume. Volume (`:798`) clamps accuracy to [1e-8, 1e-1]; area (`:838`) works on sheets. Class: pure calculation, but a clamped numerical integration; `KNOWN_ISSUES` says area and volume of faces with rational-circle trims can be wrong by up to about 1.4% at the default 1e-3 and up to 20% at 1e-1 |
| 8 | **Box primitive** (`SmApiPrimitives.cpp:282`) | Inputs: `const SmVector3d& crOrigin` (lower corner), length, width, height (X, Y, Z), `SmBrep*&`; a frame is built with canonical X and Y axes. `SmApiIsPositiveDim` rejects non-positive dimensions with `INVALID_INPUT`. The caller owns the result. The origin is not validated for finiteness (Unknown). Class: new body |
| 9 | **Stitch and heal** (`SmApiStitch` `SmApiBrep.cpp:1128`, `:1157`; `StitchIntoSolid` `:2470`; `StitchAdvanced` `:2575`; `HealBrep` `SmApiHeal.cpp:27`) | **`SmApiStitch` calls `StitchAndOrient()` and ignores its return value ("Check manifold?" comment); it always returns `SM_SUCCESS` when `pBrep` is non-NULL.** `StitchIntoSolid` returns `rbProducesASolid`, the stitched edge count, and the max vertex and edge gap as outputs. `StitchAdvanced` takes a per-call `dStitchTol3d` and flags. `StitchIntoShell` has an in-header oddity: `rbShellIsWellFormed` is documented as an input, and `dMaxStitchingRatio` is "an absolute distance, not a ratio". `HealBrep` runs `pBrep->HealBrep(SM_HO_ALL)` in place; `KNOWN_ISSUES`: "can report success when a repair failed", with about 10 mis-repairs on closed or periodic surfaces (torus, sphere, cylinder); no tolerance argument. Class: in place |

**Ambiguity summary.** Aliasing: `rpResult` aliases `pBrep1` in booleans, so callers must not
delete both. A single raw-pointer scheme with no versioning. A grep for `\bUB\b` and "undefined
behavio" in SM_API, SmPyLib/src and KNOWN_ISSUES found no hits (the "UB-" markers the Rust port
uses were not found here; this does not rule out markers elsewhere).

## C. KNOWN_ISSUES.md and proposals/

- **Verified:** `KNOWN_ISSUES.md` (81 lines) lists
  - Modelling: `RemoveFillet` is a silent no-op; `HealBrep` reports success on failed repairs;
    healing mis-repairs periodic and closed surfaces (10 bullets, no workaround);
    `drop_curve_to_surface` near a surface pole.
  - Tessellation: inside-out triangles near circular fillets (workaround: a 15 degree angle
    tolerance).
  - Measurement: area, volume and mass are inaccurate for faces bounded by circles (record 7).
  - USD import and validation: a malformed `BrepArray` can crash import with out-of-bounds
    reads; OCCT-exported UV trims are mishandled; an orphan edge (BA.582) causes unrelated
    validator failures; the release package's validator scripts expect a source checkout.
- **Interpretation:** these sit directly on the procedure contracts. "Success" from heal and
  `RemoveFillet` is not evidence, so an independent verifier is needed.
- `proposals/` is vendored AOUSD UsdSolid and `cad_geometry` (OpenUSD-proposals PRs #109 and
  #108, draft, retrieved 2026-09-16): a USD schema proposal with no operation contracts. Its
  contents beyond the README were not read.

## D. Test data and tests

- **Counts by extension (Verified, `find`):** `tests/` (2.5 MB): 38 `.cpp`, 17 `.h`, 5 `.py`.
  `TestFiles/` (28 MB): 200 `.smb`, 134 `.usda`, 74 `.smp`, 50 `.dat`, 20 `.fdf`, 18 `.stl`, 17
  `.smc`, 13 `.pts`, 6 `.pbp`, plus a few `.sat`, `.brep`, `.srf`, `.iwi`, `.sms`, `.txt`.
  `TestFilesSmb/` (72 KB): 5 `.smb` (cone, cube, cylinder, plane, torus). `Examples/`: 68 KB.
- **Tests (Verified):** `SM_API_test` (`tests/SM_API_test/src`, 11.6k lines across the
  `TestSm*.cpp` files) includes `TestSmErrorCodes.cpp`, `TestSmHeal.cpp`, `TestSmFillets.cpp`,
  `TestSmBrep.cpp`. Tests read models with `SmApiReadBrepFromFile`
  (`TestSmImportExport.cpp:40`) and build geometry in code.
- **Expected values exist but are analytic and embedded in code,** for example
  `TestSmPrimitives.cpp:566-572` (`1130*PI/3` with a 1e-4 relative tolerance on volume);
  `TestSmErrorCodes.cpp` checks the expected status per call. No sidecar expected-value file
  was found; the `TestFiles` models themselves have none (Unknown for the Python round-trip
  tests).
- **`.smb` format (Verified from the `cube_0.smb` header):** ASCII text, "Version 42", "Healer
  Version 10", with Brep `ZoneTol3d`, a manifold flag, and region, shell and faceuse data.
  Whether all 200 `.smb` files are ASCII or some are binary is Unknown.
- **Fixture candidates for an independent verifier:**
  - The 5 primitives in `TestFilesSmb`: analytic mass properties are known by formula and the
    files are tiny (Interpretation: derive the expected values by formula, not from the files).
  - `TestFiles/pt_TestFiles`, including `Boolean/` pairs (`BoltMBox1/2.smb`,
    `extrudeHoles1/2.smb`, `BoxUCylTan1/2.txt`), box variants (`box_with_large_fillet.smb`,
    `boxes_share_one_edge`), `Mouse.smb`, `vase_rev.smb`. The manifold flag is in each header and
    volumes are not stored; a reference value would have to come from SmApi or a third party
    (Hypothesis: compute the box variants analytically).
  - The `brep_validator/` `.usda` files form a negative-case set named by validator code
    (`Test_BA_xxx_*`), useful for contract tests of failure detection.
- **Licence and provenance (Verified):** Apache-2.0 with NVIDIA SPDX headers.
  `THIRD_PARTY_NOTICES.md` (545 lines) covers OpenUSD, oneTBB, hwloc, MaterialX, OpenSubdiv,
  CPython, HACL*, pybind11, AOUSD proposals, nvidia usd-validation, bootstrap scripts and GUI
  dependencies. **No per-file provenance statement for `TestFiles` was found**, and a grep of
  `TestFiles` `.txt` and `.NL` files for licence or copyright words found nothing. The README says
  Git LFS stores "large binary fixtures (USD assets, STEP/IGES/JT models)", so some listed
  fixtures may be LFS pointers (Unknown whether the 28 MB is real content, and where the `.smb`
  files originated). This is not a legal review.

## E. Global state and determinism

- **A process-global default `SmContext`** (`SmApiGetOrCreateContext()`, `SmApiGeneral.h:48-49`).
  Its comment says it holds "unlocked" traversal mark counters, that lazy initialisation is not
  synchronised, and that arbitrary concurrent `SmApi*` calls are not safe. Advice: one worker
  process per job, and call `SmApiCreateContext()` once at startup. "Operations run
  single-threaded in the shipped build."
- Traversal marks (`m_lCurrentMark*`) are hidden mutable state; reads from `const SmBrep*` APIs
  may still touch them (Hypothesis: test by reading from two threads).
- **Randomness (Verified):** `srand((unsigned)time(NULL))` plus `rand()` in
  `SMLib/src/SmFace.cpp:21183`, `:21225`, `:21359` (dither of sample points), `SmShell.cpp:888-911`
  (random ray directions, seeded by time) and `SmRayTracer.cpp:233` (`rand() % 6`).
  Interpretation: a real source of non-reproducible results wherever those paths run
  (ray-based inside/outside classification, sampling). **Whether the common boolean or
  mass-property paths reach them is Unknown** (Hypothesis: trace callers, or run twice and diff).
- Other non-reproducibility: numerical integration at a clamped relative accuracy; the
  `KNOWN_ISSUES` measurement drift; pointer-keyed maps (`SmCopyBrepMap`) may give pointer-
  address-dependent ordering (Interpretation, not verified). Tolerances live in each Brep
  (`ZoneTol3d`) and in the global constant `SM_ZONE_TOL_3D`, so a Brep's file carries its
  tolerance.
- Debug and log output is controlled by global flags (`smSet_OutputLong`, `smSet_DoGraphics`,
  `SmMessages.h`), which are global effects.

## F. The 8-question sheet

1. **Authority:** the C++ kernel is the authority on its own results; its status returns are
   untrusted (see heal, `RemoveFillet`).
2. **Agent output form:** the SM_API has no agent features. `AGENTS.md` and `.agents/` exist and
   are only noted as data.
3. **Executor:** in-process, single-threaded, a global context.
4. **Checking:** partial self-checks (`SM_ASSERT_VALID` conditional, `IsManifoldSolid`,
   `brep_validator` for USD). `KNOWN_ISSUES` recommends external checks.
5. **Identity across edits:** raw C++ pointers (`SmFace*`, `SmEdge*`, `SmVertex*`); booleans
   reuse `pBrep1`'s pointer. No stable id is exposed in SM_API (a shallow grep of
   `SmTopology.h` and `SmObject.h` for `GetId` / `GetIndex` found nothing; Unknown). The `.smb`
   file uses indices.
6. **Round trip:** native `.smb` read and write (ASCII or binary flag in
   `SmApiReadBrepFromFile(file, bAscii, ..)`), plus USD (`BrepArray`). OCCT and STEP
   translators removed (doc claim). Round-trip tests are in `tests/python`.
7. **Hidden state:** the default context, marks, per-Brep tolerance, `m_bEditingEnabled`,
   attributes (for example `SM_AI_MASS_PROPERTIES` silently changing mass), and `rand` / `srand`.
8. **Ambiguity and units:** no unit system; model units are implicit; angles in degrees; relative
   accuracy is clamped silently.

## Classification

| Operation | Class |
|---|---|
| Boolean (union, difference, intersection, merge) | in place on `pBrep1`, consumes `pBrep2` (the result aliases `pBrep1`) |
| Fillet, Chamfer, CircularFillet, FilletEdges | in place |
| RemoveFillet, HealBrep, Stitch*, UnifyNormals | in place (status unreliable for Remove and Heal) |
| ShellBrepFull | pure, new body |
| OffsetBrepFull | unclear (Unknown) |
| Linear and rotational sweep, Box and other primitives | new body (inputs copied) |
| SmApiCreateSkin | new surface |
| Volume, Area, MassProperties, queries | pure calculation |
| Intersectors | pure calculation (output arrays) |

## Findings relevant to typed procedure contracts and a verifier reference

1. **Ownership is a per-function contract, mostly in comments.** The boolean "consume B, mutate
   A, `rpResult` aliases A, partial mutation on failure" semantics means a typed contract needs
   an explicit effect class (consume / in place / new) and a marker that a failure leaves the
   inputs indeterminate. Sweeps and shell are the pure model to copy. This is the C++ source
   of the three ownership shapes solidcore turns into types.
2. **Status codes are untrustworthy for some operations** (`HealBrep`, `RemoveFillet`; `Stitch`
   ignores its return value). A verifier must check postconditions independently (manifold
   flag, face count, volume), not rely on `SM_SUCCESS`.
3. **Mass properties is the best-specified reference oracle:** documented clamps, a full
   rejection list, and analytic tests. Even so, circle-trimmed faces drift by up to 1.4% at the
   default accuracy, so the comparison tolerance must be tied to `dRelativeAccuracy`.
4. **Tolerance is mostly implicit** (Brep `ZoneTol3d` 1e-5 plus the global context); only a few
   operations (`StitchAdvanced`, mass properties, tessellation) take per-call values. A contract
   must include the Brep tolerance as part of the input state.
5. **Non-determinism and concurrency:** time-seeded `rand()` in SMLib plus an unlocked global
   context. Reference runs should be single process and ideally repeated to detect variance.
   This also bears on what "agrees with C++ to 1e-9" can mean for solidcore.

## Not verified

- Nothing was run, so no behaviour claim is confirmed by execution.
- The fork-versus-upstream difference (no diff possible; single commit; no fork mention).
- Whether the `rand()` paths are reachable from boolean, mass-property or heal calls.
- The full `SM_ERR_*` list past about line 68 of `SmMessages.h`; the bodies of
  `OffsetBrepFull`, `SkinPrimitive`, `StitchAdvanced`, and kernel-side validation of a fillet
  radius.
- Whether any `TestFiles` are Git LFS pointers; per-file provenance of the 200 `.smb` models;
  whether more `.smb` files are binary.
- Stable entity identity in SMLib (pointers versus ids); the contents of `proposals/`; the "UB-"
  notion the Rust port mentions (no UB markers found in SM_API or the bindings).
