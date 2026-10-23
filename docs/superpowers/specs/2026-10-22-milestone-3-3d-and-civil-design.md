# Milestone 3 — 3D geometry and civil linear/terrain entities (design)

> **Parked until the core model is defined.** This was written before the data model, procedures, goals, contracts and
> rules exist in the database and in Rust. Read it as draft input, not as a plan: no work starts from it. It will be
> reviewed and amended once the model exists. Kept and built on in the meantime: the entity inventory (`catalogue/`) and
> the file-format research (`docs/research/formats/`).

Status: **draft for founder review.** Not decided, not built. Written 2026-10-22 on `dev`
at `f8bd022`, after milestones 1 (current-state workspace) and 2 (revisioned
`UpdateGeometry`) landed. Amended 2026-10-23 for ADR 0003 (procedure registry): `results` became
`procedure_runs` (section 5.3) and slice S0c was added (section 14). Under `CONTRIBUTING.md` this changes the shared model and
touches identity, so it needs an RFC Discussion and a decision record before code.

How to read the marks used below:

- **[Founder]** stated by the founder in this session.
- **[Call]** my recommendation, reversible; a builder may settle it without asking.
- **[Open]** only the founder can answer; the answer changes what gets built (section 12).

## 1. Intent

Bonyad's manifesto promises one core where engineering knowledge is "defined, composed,
computed, validated, revised and presented", with each discipline built on it. Milestones
1 and 2 prove that for a flat drawing: points, lines and one polygon kind, persisted in
PostgreSQL, calculated in Rust, shown in React, driven by a person or an agent, with
accepted changes revisioned.

**[Founder]** The next milestone must reach *3D CAD and Civil 3D–class entities* across the
database, procedures and presentation, "purely separated". This document designs that as
the smallest sequence of slices that gets there without breaking the manifesto's rules
(concrete first; no entity-attribute-value store; one executable owner per procedure).

Why now: the manifesto's paved path lists *relationships and constraints* next, then
composition, then surveying. Every civil entity needs a typed reference to another
(a profile belongs to an alignment; a surface is built from points), and 3D needs a
declared frame. So the first honest civil entities force the relationship concept into
existence, which is where ADR 0002 already said it would arrive ("Relationships arrive in
milestone 3, as explicit dependencies").

## 2. Goals, non-goals, anti-goals

### Goals

1. A project declares a **3D frame**: unit, axis directions and handedness, plus a vertical
   reference (section 5.1). Nothing 3D is stored without it.
2. A small set of **3D geometry entities** with exact, tested measures (section 6).
3. A small set of **civil entities**: horizontal alignment, vertical profile, and a
   terrain surface (section 7).
4. **Derived results are first-class and honest**: every calculated result records which
   revision and which procedure version produced it, and says when it is stale (section 5.3).
5. The UI and the agent can answer two questions about any entity from the API alone:
   *why is this invalid?* and *what depends on this?* (section 8).
6. Every new capability is reached through named, typed operations, in the OpenAPI contract,
   with an agent tool and a contract test, exactly as in milestone 1.

### Non-goals (this milestone)

- Solid B-rep modelling (OpenCASCADE-class), NURBS surfaces, boolean solids, fillets.
- Corridors, assemblies, cross-section sweeps, pipe networks, parcels, grading, survey
  figures, point clouds, BIM element libraries.
- Importing or exporting DXF, DWG, IFC, LandXML, STEP. Mapping notes exist (section 10);
  no file module is built.
- Blocks, definitions and instances (the composition rung of the paved path).
- Geographic coordinate reference systems, geodesy, projections. The frame stays local.
- Authentication, collaboration, undo semantics (unchanged from ADR 0002).

### Anti-goals (a failure even if it "works")

- A universal `entity_properties` / JSON attribute bag, or one generic `relations` table.
- A class hierarchy of entity types, or a plugin framework.
- A procedure implemented in more than one language (Rust, SQL and TypeScript).
- A result shown as current when its inputs have changed.
- Silent defaults for unit, axis order, handedness or angle unit.
- Copying GPL/LGPL code into Bonyad (see section 11).

## 3. Constraints

- Manifesto sections 3, 5, 7, 8; ADR 0001 and 0002 stay in force. This milestone amends
  ADR 0002 decision 1 ("2D Cartesian") for new project types only (section 5.1).
- Stack is fixed: PostgreSQL via self-hosted Supabase, Rust, React + TypeScript, Bun agent.
- Persian, RTL, mobile-usable UI.
- Licence is undecided (`LicenseRef-Undecided`). **[Call]** Plan as if the core must stay
  permissively licensable: no copyleft code is linked or copied (section 11).
- The Rust server remains the only writer of engineering tables; the agent service writes
  only schema `agent`.
- Milestone 2 revision contract: only `UpdateGeometry` is revisioned today. Create and
  delete are current-state operations, and revision snapshots exist as per-kind tables.

## 4. What the evidence says (and how much to trust it)

Trust levels: the two **code inventories** are static reads of pinned commits (read-only,
nothing built or run). The **landscape study** is wide but mostly inference from
documentation and was not independently reviewed; treat it as input, not authority.

| Finding | Source | Design rule it supports |
|---|---|---|
| Nexus is 2D-only; no readable Rust solid kernel exists in the surveyed set | `docs/research/code-inventory/cad-and-nexus-code-inventory.md` | Bonyad designs its own 3D model and defers B-rep |
| Nexus keeps no entities in Postgres, and its id allocator is unused | same | Identity must be assigned by the database/API from day one (already true here) |
| Nexus lost the most time to units, frames, absolute tolerances, degrees/radians | same | Frame and units are mandatory project properties; tolerances are scale-aware |
| FreeCAD and SolveSpace store derived geometry beside the recipe; OpenSCAD stores none | `docs/research/code-inventory/3d-tools-code-inventory.md` | Keep authored data and derived results in separate tables |
| No surveyed tool tags a result with inputs + procedure version | same | Bonyad's section-5 rule is stricter than prior art; design it ourselves |
| FreeCAD needed an element map to name derived faces stably; SolveSpace persists a remap table | same | Authored data never references derived topology in this milestone |
| Solvers take numbers and constraints, return values + degrees of freedom + conflicts | same | If constraints arrive later, model the solver as one pure procedure with that shape |
| IFC models each relation kind as its own entity with its own rules | landscape study (IFC4.3 EXPRESS read) | No generic relations table; one table per relation kind |
| EPANET/SUMO treat link length as an authoritative input, not derived | landscape study | Do not blindly forbid stored lengths; alignment length is authored, see 7.1 |
| IFC splits placement, aggregation and containment | landscape study; format-session catalogue | Keep "parent" out of the schema; add specific relations as needed |
| Alignment, station equations, survey points exist as readable code only in IfcOpenShell (LGPL) | code inventory | Alignment procedures are reimplemented from the published maths, not copied |

## 5. Foundations (slice S0)

### 5.1 Project frame **[Call]**

`projects` currently pins `unit = 'm'` and `frame = 'local-cartesian'` with check
constraints. Add, with check constraints and no defaults that hide a choice:

| Column | Allowed now | Meaning |
|---|---|---|
| `dimension` | `'2d'`, `'3d'` | A project is flat or spatial. Existing projects stay `'2d'` |
| `axes` | `'x-east-y-north-z-up'` | Right-handed, named so a second convention can be added by adding a value, not by guessing |
| `angle_unit` | `'radian'` | Stored and exchanged angles are radians; degrees appear only in presentation |
| `vertical_reference` | `'local'` | Heights are relative to the project's local zero; a datum is a later concept |

Allowed kinds by dimension (enforced by a check constraint on `entities`): a `2d` project
holds `point`, `line`, `surface`. A `3d` project holds the new kinds (`point3`, `polyline3`,
`face`, `extrusion`, `mesh`, `alignment`, `profile`, `terrain`) and none of the 2D kinds.
A profile is station by elevation, so it needs a vertical axis; an alignment is planar but
lives with the profile that depends on it. **[Call]**

Why a project-level `dimension` instead of adding `z` to existing tables: the existing 2D
entities, revision snapshot tables and tests stay untouched, and 2D and 3D rows can never
mix inside one project. **[Open O5]** whether the founder prefers 2D entities to gain an
optional `z` instead.

### 5.2 Revision-aware create and delete **[Call]**

Milestone 2 revisions cover `UpdateGeometry` only; its issue document names create/delete
as the next small slice. Slice S0 completes that first, because every new entity kind is
created, not updated. Acceptance is the milestone-2 contract applied to `Create*` and
`DeleteEntity`: `expected_revision`, one transaction, one normalized snapshot, `409
revision_conflict` on a stale head.

### 5.3 Derived results **[Call]**

A calculated value is not entity state. Two tiers, both typed (no JSON bag):

**Tier 1, on-demand results (all measures and civil queries).** `MeasureEntity`,
`StationToPoint`, `PointToStation`, `ElevationAt` and similar are pure reads: they compute
from the accepted state, **persist nothing**, and never move the revision head. Each
response carries `{input_revision, procedure_version}`. The caller compares
`input_revision` to the head it later observes; the UI marks a held result **stale** when
the head has moved. This satisfies the manifesto's "tied to its inputs and the procedure
version, so staleness is detectable" without a table, and keeps GET side-effect free.

**Tier 2, cached derivations (expensive, reused).** Only the terrain triangulation needs
caching in this milestone. It is written by an explicit operation (`ComputeTerrain`, a
POST) into typed tables. **Amended by ADR 0003:** the run record is `procedure_runs`, which
points at a registered, immutable `procedure_versions` row, so a run's `procedure_version`
always names a real definition. Status is `succeeded`, `failed` or `unknown`; `unknown`
is never treated as a pass.

```sql
procedure_runs(id uuid pk, project_id uuid, procedure_key text, procedure_version int,
               input_revision bigint, params jsonb, status text, invoked_by text,
               computed_at timestamptz)   -- defined by ADR 0003; replaces the earlier `results` table
terrain_triangles(run_id uuid, position int, a int, b int, c int)   -- indices into the terrain's points
run_findings(run_id uuid, code text, path text, message text)
```

Rules for tier 2:

- A cached result is **current** only if its run's `input_revision` equals the project head
  *and* the procedure's current version equals the run's `procedure_version`. Staleness is computed on
  read, never stored. (Project-level head is coarse; finer tracking is a later refinement,
  see section 12.)
- A run row is never edited; recomputing inserts a new row. Storing a result **never
  bumps the revision head**, because a result is not accepted state.
- A read that needs a stale or missing triangulation returns `result_stale` with a
  pointer to `ComputeTerrain`; it does not silently recompute and write.
- Each future cached shape gets its own typed table when a procedure needs it.

The prior art gives no template for this. Prove tier 1 on the existing 2D measures in S0b,
and tier 2 on terrain in S2c.

### 5.4 Tolerances **[Call]**

Replace bare epsilons with named constants tied to the project unit, one source of truth in
the geometry crate, and test at two scales (metres at 1e0 and at 1e6). The existing
`ZERO_LENGTH_EPS` and `ZERO_AREA_EPS` (both 1e-9) are the starting point.

## 6. 3D geometry entities (slice S1)

All new kinds are added to `entities.kind` and get their own tables, composite
`(entity_id, kind)` keys and revision snapshot tables, following the existing pattern.
Independent geometry stays the default: a segment owns its endpoints, a face owns its loop.

| Kind | Stores (authored) | Validity (Rust) | Derived (procedures) |
|---|---|---|---|
| `point3` | `x, y, z` | finite | none |
| `polyline3` | ordered vertices `x, y, z`, `closed` flag | ≥ 2 vertices (≥ 3 if closed), no zero-length segment | length |
| `face` | ordered loop of 3D vertices (open ring, as `surface`) | ≥ 3 vertices, planar within tolerance, non-degenerate, simple (no self-crossing in its plane) | area (Newell), plane normal |
| `extrusion` | a **reference** to a `face` + a 3D vector (recipe) | referenced face exists; vector non-zero and not parallel to the face plane | volume = area × height, bounding box |
| `mesh` | vertex list + indexed triangles | indices in range, no zero-area triangle; *closed* is computed, not stored | area; volume if closed (divergence theorem); bounding box |

Notes:

- `UpdateGeometry` on any kind with child rows (`polyline3` vertices, `mesh` triangles,
  alignment elements, profile PVIs, terrain points) **replaces the whole geometry**, as the
  milestone-2 contract already says ("complete replacement geometry"). No patch
  operations in this milestone. Every accepted update writes a full normalized snapshot.
  **[Call]** To keep that affordable, an entity may hold at most **10,000 child rows**
  in this milestone; a larger request is rejected with `entity_too_large` (422). Delta
  snapshots are the later fix and are listed in section 12 as a risk.
- `extrusion` is a *recipe*. Its solid shape is never stored as authored data. This matches
  the strongest pattern in the evidence (OpenSCAD persists nothing derived; Blender's artefact
  is a recipe) and keeps B-rep out of this milestone. **[Call]**
- `mesh` is the interchange-friendly shape for terrain, scans and imported solids. It owns
  its vertices and triangles; it does not reference other entities.
- Loops and holes: a `face` owns exactly one outer loop in this milestone. Holes are
  deferred; the founder decision on loop ownership (section 12, O4) applies when they arrive.
- No `arc`, `circle`, `spline` or bulge in this milestone. **[Call]** Curved horizontal
  geometry appears first inside the civil alignment (7.1), where its parameters are the
  standard ones (radius, direction), not general curves.

### Acceptance (exact values, computed independently)

| Case | Expected |
|---|---|
| Right triangle (0,0,0), (4,0,0), (0,3,0) as a `face` | area 6, normal (0,0,1) |
| Extrude that face by (0,0,2) | volume 12, bounding box [0,4]×[0,3]×[0,2] |
| Unit cube as 12-triangle closed `mesh` | area 6, volume 1, closed = true |
| Same cube with one triangle removed | closed = false; volume returns a typed failure, not a number |
| `face` with one vertex moved off its plane by 1e-3 m | `non_planar_face` 422 at default tolerance |

## 7. Civil entities (slice S2)

**[Call]** Model civil concepts with Bonyad's own names and rules, and record a mapping to
IFC 4.3 and LandXML (section 10). The alternative is to take IFC 4.3 as the model; see
open decision O2.

### 7.1 `alignment` (horizontal)

Authored: an ordered list of elements in the plan plane, each `tangent(length)` or
`arc(radius, direction, length)`, a `start` point and `start_direction`, a `start_station`,
and zero or more **station equations** `(back_station, ahead_station)`.
Spirals are deferred. **[Call]**

- **Continuity is by construction, not a rule to check.** Each element's start point and
  direction are the previous element's end point and end direction, so an authored
  alignment cannot contain a gap or a kink. Element lengths, radii and the start are the
  only authored numbers; end points are derived. (Formats such as LandXML store start and
  end points redundantly and can contradict themselves; an importer, not the model, detects
  that and reports it.) **[Call]**
- Validity rules, with stable codes: `alignment_element_invalid` (length ≤ 0, radius ≤ 0, or
  an arc sweeping 2π or more), `alignment_too_few_elements` (none), and
  `station_equation_invalid` (non-finite, or an ahead station that makes the stationing
  ambiguous or non-monotonic around the equation).
- Conventions, stated once and tested: direction is an angle in **radians measured
  counter-clockwise from +x (east)**; an arc carries `turn: 'left' | 'right'` (an enum, not
  a signed number), where left is counter-clockwise. LandXML uses two different angle
  zeros (`angle` from east, `direction` from north); the mapping must convert, never copy.
- Derived (procedures): `station_to_point(station) → (x, y, direction)`,
  `point_to_station(x, y) → (station, offset)`, total length, with station equations
  honoured. Station equations are the main source of bugs in the evidence (Civil 3D,
  LandXML); give them dedicated tests.

### 7.2 `profile` (vertical)

Authored: a **reference to one alignment**, and an ordered list of vertical intersection
points `(station, elevation)` with an optional parabolic curve length at each interior
point. Validity: stations strictly increasing, within the alignment's stationing, curve
lengths fit between neighbours.

Derived: `elevation_at(station)`, grade at station, high/low points.

Editing an alignment so that a profile's stations no longer fit (a shortened alignment, or
a removed element) is **rejected**: `UpdateGeometry` returns
`dependent_profile_out_of_range` (422) naming the profile ids. State, head and snapshots
stay unchanged. The edit becomes legal once the profile is edited first. **[Call]**

### 7.3 `terrain` (surface)

Authored: a set of 3D points (the survey points). The triangulation is **derived**, not
authored, so it is a result with `procedure_version` (Delaunay-style). Optional breaklines
are deferred. **[Call]** A file import that already carries faces (LandXML `Surface`) maps
to a `mesh` instead (section 10).

Derived: triangulation, `elevation_at(x, y)`, plan area, volume above a reference elevation.

Boundary behaviour **[Call]**: fewer than 3 points, or all points collinear, is
`terrain_degenerate` (422). Two points with the same (x, y) within tolerance are
`duplicate_xy` (422), even if their z differs. `elevation_at` outside the convex hull
returns the typed failure `outside_terrain`, never a number. Thin or sliver triangles
inside the hull are allowed.

### 7.4 Relationship tables **[Call]**

The references above are *typed foreign keys*, one table per relation kind, each with its
own constraints, instead of a generic relations table:

| Relation | Rule |
|---|---|
| `extrusion.profile_face_id → face` | the referenced entity must be a `face` (composite key) |
| `profile.alignment_id → alignment` | one profile belongs to exactly one alignment |
| `terrain` points | owned by the terrain, not referenced |

Deletion rule: refusing to delete an entity that others reference returns a stable
`entity_in_use` error (409) that lists the dependents. No cascading deletes across
entities. This refusal ships **in the same slice as the first reference that needs it**:
S1 for `extrusion → face`, S2b for `profile → alignment`, not later. A refused delete
changes no state, head or snapshot. The `GetDependents` query and the UI/agent
explanations can come later (S3), but the integrity rule cannot.

### Acceptance (exact values)

| Case | Expected |
|---|---|
| Alignment: tangent 100 m east from (0,0), start station 1000 | station 1050 is (50, 0), direction 0 |
| Same, then an arc of radius 100 m turning left through 90° | arc length 157.0796 m; end point (200, 100) |
| Station equation `(1100 back, 2000 ahead)` on a 150 m tangent after station 1000 | station 2000 maps to the point at distance 100 m |
| Profile: PVIs (1000, 100) and (1200, 110), no curves | `elevation_at(1100)` = 105, grade = 0.05 |
| Terrain: points (0,0,0), (10,0,0), (0,10,10) | 1 triangle; the plane is z = y, so `elevation_at(2, 3)` = 3 |
| Terrain: four corners of a 10×10 square, elevations 0, 0, 0, 10 at (0,0), (10,0), (0,10), (10,10) | The four points are cocircular, so two triangulations are valid and give different centre elevations (5 or 0). The procedure must apply a documented, deterministic tie-break and the test must assert the same triangulation on every run |

## 8. Operations and the agent

Same shape as milestone 1: named, typed, in OpenAPI, one agent tool each, a contract test
that fails when an operation and its tool diverge, stable error codes with
`violations[{code, path, message}]`.

| New or changed operation | Notes |
|---|---|
| `Create*` / `DeleteEntity` for each new kind | revisioned (S0), `id?` for retry safety as today |
| `UpdateGeometry` | extended per kind; unchanged revision contract |
| `MeasureEntity` | still a pure read; the response gains `input_revision` and `procedure_version` (the UI derives "stale" from the head) |
| `ComputeTerrain(entity_id)` | POST; writes a cached triangulation (tier 2, section 5.3); never bumps the head |
| `GetResults(entity_id)` | the latest cached result per procedure, with `current`/`stale` computed on read |
| `GetDependents(entity_id)` | typed list: relation kind, dependent id; answers "what depends on this?" |
| Civil procedures | `StationToPoint`, `PointToStation`, `ElevationAt` (profile and terrain) — queries, never mutate |
| Project frame | `GetProject` includes `dimension`, `axes`, `angle_unit`, `vertical_reference` |

The "why is this invalid?" answer is the violation list plus the stable code table; keep
the code table in the OpenAPI document so the agent can read it. A model's explanation is
labelled a claim; the violation list and results are the verified facts (unchanged rule).

## 9. Layers and dependency rules

Arrows point inward; nothing depends on a layer above it.

| Layer | Owns | Must not |
|---|---|---|
| **Database** (`db/`) | Integrity: keys, kinds, finiteness, relation keys, revision snapshots, procedure registry and run tables | Recompute geometry |
| **Geometry crate** (`logic/crates/geometry`) | Pure types, validity rules, measures, civil procedures; no I/O | Know about HTTP, SQL, or the UI |
| **Persistence crate** | Row ↔ type mapping, transactions, revision CAS | Contain geometry rules |
| **Server crate** | Routes, OpenAPI, error mapping | Calculate anything not in the geometry crate |
| **Contract** (`contracts/openapi.json`) | The only interface the UI and agent depend on | — |
| **UI** | Views: plan, profile, 3D orbit; stale badges; explanations | Hold domain rules or a second model |
| **Agent** | Tools mapped 1:1 to operations | Write engineering tables |
| **File exchange** (later) | Adapters that produce proposed changesets + a loss report | Become a parallel model |

Every procedure has exactly one executable owner: the geometry crate. A SQL view or a
TypeScript helper that re-derives a measure is a defect.

**[Call]** Do not create a `core` abstraction crate (ADR 0002 decision 4 still holds). The
geometry crate may split into modules (`d2`, `d3`, `civil`); a new crate only when a real
second consumer exists.

### Presentation

Extend the existing viewport; no component kit. Three views over the same API data:
plan (SVG, as today), profile (SVG, station × elevation), 3D orbit for `face`, `extrusion`,
`mesh`, `terrain`. The 3D rendering library is a **builder call**, recorded in a short
decision record, with these constraints: strict TypeScript, pinned version, works on
mobile, no server round-trip to rotate, and the view never writes state. Stale results show a
visible badge; an edit is shown only after the server accepts it (unchanged rule). RTL and
numerals follow the existing rules (`<bdi dir="ltr">`).

## 10. Exchange mapping notes (no file module in this milestone)

| Bonyad | IFC 4.3 | LandXML 1.2 | DXF/DWG | Loss to report |
|---|---|---|---|---|
| `point3`, `polyline3` | `IfcCartesianPoint`, `IfcPolyline` | `CgPoint`, `CoordGeom` lines | `POINT`, `LINE`, `POLYLINE` | DXF coordinates are unitless; the import must state unit and scale |
| `face` | `IfcFace` / profile | `Parcel` boundary (planar) | `3DFACE` | arcs flattened if source had bulges |
| `mesh` | `IfcTriangulatedFaceSet` | `Surface/Definition/Faces` | `MESH` | colours, normals |
| `alignment` | `IfcAlignment` (horizontal segments) | `Alignment/CoordGeom` | none (vendor objects) | spirals unsupported here |
| `profile` | `IfcAlignmentVertical` | `Profile` | none | |
| `terrain` | `IfcGeographicElement` + faceted | `Surface` | none | |

External identifiers (DXF handle, IFC GlobalId, LandXML name) are scoped per file and are
not Bonyad ids; the file module will map them. Not needed until an importer exists.

## 11. Reuse and licences **[Call]**

- Read for understanding only: FreeCAD, SolveSpace, OpenSCAD, MeshLab, LibreCAD, QGIS,
  IfcOpenShell, Bonsai (all copyleft or restrictive in the surveyed commits; see the
  inventories for exact licence files read).
- Nexus is the founder's separate product. Share formats and interfaces, not code; its
  kernel functions are not callable as a library anyway.
- Permissive small libraries are acceptable *after* a per-crate licence read at adoption
  time: candidates named in the inventory are `ezpz` and `rstar`. Do not assume.
- Licences of OpenCASCADE, CGAL, Manifold and Clipper2 were **not** verified (not on disk);
  they matter only if B-rep is ever pursued.

## 12. Open decisions and risks

| # | Decision | Recommendation | Changes |
|---|---|---|---|
| O1 | Is a permissive-licensable core assumed? | Yes | Whether SolveSpace/planegcs-style solvers could ever be linked |
| O2 | Model civil on IFC 4.3, or on Bonyad concepts with a mapping? | Bonyad concepts + mapping (section 10) | Names and table shapes of S2 |
| O3 | B-rep out of this milestone? | Out; mesh and planar face first | Scope; no OpenCASCADE-class dependency |
| O4 | Composite entities (faces with holes, hatches, corridors): own their loops or reference them? | Own, until two entities need to share one | S1 holes, later hatches |
| O5 | `dimension` at project level, or optional `z` on 2D entities? | Project level | S0 migration and test churn |
| O6 | Should results carry assurance levels (proven/checked/estimated/unknown) from the hybrid-engineering notes? | Not yet; add after one independent-verifier experiment | `procedure_runs.status` vocabulary |
| O7 | Milestone naming: ADR 0002 lists *relationships and constraints* as milestone 3. Keep the number and treat typed references here as its first slice, or renumber? | Keep the number; constraints/solving stays a later slice | Roadmap labels |
| O8 | **Which real drawing or project must work at the end of this milestone?** | Unanswered | Acceptance examples; likely settles O2 and O3 |

Risks to watch:

1. **Scope.** Three slices behind S0 is a lot. Each is separately shippable; stop after any.
2. **Result staleness is project-wide.** A one-entity edit marks every result stale.
   Acceptable for a lab; refine with per-input tracking only when it hurts.
3. **Per-kind revision tables multiply, and full snapshots grow.** Each new kind adds a
   snapshot table, and every accepted update copies all of an entity's child rows. Accepted
   for now with a 10,000-child-row ceiling per entity (section 6); delta snapshots are the
   later fix, and the founder may want a different ceiling.
4. **Triangulation numerics** at large coordinates (UTM scale). Test at 1e6 offsets.
5. **Evidence quality.** Civil formulas come from published maths and the format specs, not
   from a reference implementation we can copy. Reference cases above must be derived
   independently and checked in two ways.

## 13. Verification

- **Independent second calculation** for every procedure, in tests: mesh volume by
  divergence theorem vs. prism formula on the extruded cube; face area by Newell vs. by
  projecting to the plane and using shoelace; station→point→station round trips on
  alignments with and without station equations.
- **Property tests** for validity rules (generate random valid/invalid faces and
  alignments; invalid ones must produce stable codes, never a panic).
- **Scale tests** at 1e0 and 1e6 coordinate offsets.
- **Staleness tests:** (tier 1) a measure response carries `input_revision`; after an
  accepted edit the head differs, so the UI shows the held result as stale, and a fresh
  `MeasureEntity` returns the new revision. (Tier 2) after any accepted edit, `GetResults`
  reports a terrain triangulation as stale until `ComputeTerrain` writes a new row, and
  neither call moves the head.
- **Read purity test:** `MeasureEntity`, `StationToPoint`, `PointToStation` and `ElevationAt`
  leave every table unchanged (row counts and head before and after).
- **Revision tests:** the milestone-2 acceptance list repeated for create and delete and for
  each new kind; a stale create returns `409 revision_conflict`; a rejected operation
  leaves state, head and snapshots unchanged.
- **Migration tests** on a fresh database and on a database with milestone-2 data.
- **Contract test** that every operation has an agent tool and vice versa.
- **E2E (browser)** at the three viewports already used: create a face, extrude, see the
  3D view; create an alignment and profile, query an elevation. **Agent scenarios** run
  with the scripted provider; one opt-in real-model smoke test, never in routine CI.

## 14. Slices, order and stop points

Each slice is one issue, one worktree branch off `dev`, one PR. Open an RFC Discussion for
the whole milestone first; link this document.

| Slice | Contains | Depends on | Done when |
|---|---|---|---|
| S0a | Revision-aware `Create*` and `DeleteEntity` (2D kinds) | milestone 2 | Milestone-2 acceptance holds for create/delete |
| S0b | Project frame columns and allowed-kinds-by-dimension (5.1), tolerances (5.4), `MeasureEntity` metadata and UI stale badge (5.3 tier 1) | S0a | A held 2D length/area result shows as stale in the UI after another edit moves the head |
| S0c | Procedure registry per ADR 0003: `procedures`, `procedure_versions`, `procedure_runs`, fail-fast contract check at startup; polygon area registered as the first procedure | S0b | Restart is idempotent; a contract edit without a version bump stops the server; polygon area (0,0),(4,0),(0,3) returns 6 with a run row naming procedure version and input revision |
| S1 | `point3`, `polyline3`, `face`, `extrusion`, `mesh` + procedures + **`entity_in_use` refusal for `extrusion → face`** + UI 3D view + agent tools | S0c | Section 6 acceptance table passes in tests, UI and agent scenario; deleting a referenced face is refused |
| S2a | `alignment` + station procedures + plan view | S0c | Alignment acceptance rows pass |
| S2b | `profile` + `elevation_at` + **`entity_in_use` refusal for `profile → alignment`** + `dependent_profile_out_of_range` + profile view | S2a | Profile rows pass; both refusals verified |
| S2c | `terrain` + `ComputeTerrain` (cached triangulation, tier 2) + `elevation_at(x,y)` | S1 (`point3`) | Terrain rows pass; a stale cache is reported, never silently recomputed |
| S3 | `GetDependents`, explain-invalid affordances in UI and agent | S1, S2a | The dependents list and the violation explanations work end to end |

S1 and S2a are independent after S0c and may run in either order or in parallel.

## 15. What is left to the builder

Library choice for 3D rendering and triangulation (with a licence read), exact error code
names beyond the examples, migration file names and numbering (continue from
`20261022000004`), internal module layout inside the geometry crate, and the precise
tolerance values (record them in the decision record). Anything that changes a table shape
named above, a public operation, or the dependency rules in section 9 comes back to the
founder.

## Appendix: sources

- `docs/manifesto.md`; `docs/decisions/0001`, `0002`; `docs/superpowers/specs/2026-10-21-first-slice-design.md`
- `docs/issues/2026-10-22-milestone-2-revisioned-update.md`; `db/migrations/20261022000004_revisions.sql`
- `docs/research/code-inventory/cad-and-nexus-code-inventory.md` (commits pinned inside)
- `docs/research/code-inventory/3d-tools-code-inventory.md` (commits pinned inside)
- `docs/research/landscape/engineering-landscape-and-primitives.md` (unreviewed)
- Format-session catalogue: `/Users/bm/fileformat-established-sdk/entity-catalogue.md` (outside this repository; DXF section read from ezdxf documentation, not Autodesk's reference)
