# CAD and Nexus code inventory (what already exists, in code we can read)

Status: **research, not decisions.** Read-only inventory; nothing here changes Bonyad's
architecture, schema or dependencies. Written 2026-10-22 for the founder's question:
*what exists for 2D/3D CAD and Civil 3D-class entities before we design milestone 3?*

Nexus is the founder's separate product. Bonyad is independent. Everything below about
Nexus is a reading of its public-to-the-founder source, to learn from its interfaces and
its mistakes. It is not a plan to copy code.

Evidence labels: **CODE** (a file, symbol and line I opened), **DOC** (prose only: RFC,
decision log, comment), **INFERENCE** (my reading), **UNKNOWN** (not opened or unreachable),
**RUN** (a read-only command I executed; command and output shown).

## Executive summary

1. **Nexus is a real, 2D-only CAD kernel.** 26 entity variants, a command enum with 152
   variants, a hash-chained event log with undo, an ECS (hecs) store, units with 25
   INSUNITS codes. Nothing 3D, nothing Civil. Civil is a parked, prose-only sketch.
2. **The only code in the Nexus tree that models 3D and DXF/DWG breadth is a third-party
   crate, `acadrust` (MPL-2.0),** which Nexus keeps in a separate WASM module and uses as a
   read-only DWG-to-DXF-text converter. It has 48 `EntityType` variants, including
   `Solid3D`, `Mesh`, `Surface`, `Face3D`, `Polyline3D`, and it preserves (does not model)
   Civil 3D/AEC objects as opaque bytes.
3. **Civil-class code exists, but not where we would expect.** Real, readable alignment
   (horizontal, vertical, cant, PI method, stationing with station equations),
   survey-point (`cogo`), georeference, profile and "sectioned solid along a curve"
   (corridor-like) code is in **IfcOpenShell** (LGPL-3.0). FreeCAD, LibreCAD and QGIS have
   no alignment, corridor, parcel or LandXML code.
4. **TIN, Delaunay, ear-clipping and 2D curve offset/trim exist as reference
   implementations only under copyleft licences** (FreeCAD Mesh, QGIS, LibreCAD: LGPL/GPL).
   Permissive building blocks are small third-party libraries (earcut and delaunator, vendored in QGIS externals; delaunator-cpp is MIT, earcut's licence not checked; `ezpz`, `rstar`, `hecs` as used by Nexus).
5. **Bonyad's licence is `LicenseRef-Undecided`** (`logic/Cargo.toml:7`). Every reuse
   verdict below that depends on a licence is therefore conditional on that choice. The
   safe default that works under any outcome: **interfaces and formats, not code.**

**The 5 most decision-relevant findings**

| # | Finding | Why it matters for milestone 3 |
|---|---|---|
| 1 | Nexus polylines have **no bulge**; the importer flattens arcs to chords (tessellated) and the kernel flattens Z to 0 | A faithful curve model (arc segments, 3D points) is something no readable Rust kernel in this set provides; we would design it, not adopt it |
| 2 | Nexus's entity model is **one Rust enum + one hecs component**, and the Postgres side stores **no entities at all** (only a `projects` row; geometry is a JSON blob in object storage) | The "Postgres = state" half of Bonyad's separation has **no prior art in Nexus**; Bonyad's per-kind tables are new ground |
| 3 | Nexus's own **ULID allocator exists but is not wired** (`IdAllocator` has no caller outside its tests); ids are still `ent_N` counters, and Hatch holds `boundary_ids` | Identity-assignment is the most expensive thing to retrofit; the lesson is in Nexus's own RFC 0006 |
| 4 | **Units and frames are where Nexus lost the most time**: INSUNITS fixed to metres, missing-units-on-open written back as "confirmed millimetres", absolute tolerances (1e-8) that break at UTM scale, degrees-vs-radians tool text, unit-blind dimension offsets | Bonyad's `unit = 'm'` + `local-cartesian` check constraints are the right instinct; the next milestone must make unit and frame first-class before adding 3D or survey data |
| 5 | **Civil entities map cleanly onto IFC 4.3** (IfcAlignment, IfcSectionedSolidHorizontal, IfcTriangulatedFaceSet, IfcGeographicElement/IfcSite) and the IfcOpenShell API shows a working, documented procedure set (station-to-distance with station equations, PI-method layout) | A concrete, standard-backed shape to model against, with an LGPL-3.0 reference implementation to read |

## 0. What I could and could not read

| Source | Read | Not read / limits |
|---|---|---|
| Nexus main checkout `/Users/bm/nexus-platform-ir` (branch `dev`) | CLAUDE.md, DECISIONS.md (index + selected rows), CONTEXT_NEXUS.md (sections 2-4, 10), MASTER_BRIEF head, LICENSE, Cargo manifests, kernel `entity.rs`, `components.rs`, `world.rs`, `events.rs`, `commands.rs` (enum), `units.rs` (selected), `ids.rs`, `tolerance.rs`, `metrics.rs`, `undo.rs` head, `dwg-reader/src/*`, `file-io/src/dxf-import.ts` (selected), `dxf-ocs.ts`, `server/src/main.rs`, `supabase/migrations/*`, RFC 0002, 0024, 0028, 0034, 0042, 0048 (heads and grepped sections), `docs/architecture/22-ecs-component-design.md` (Civil section) | PRD.md, ROADMAP.md, RFCs 0006, 0007, 0016, 0017, 0032, 0035, 0037, 0049 read only by grep, not in full; renderer, app and MCP internals only by file listing and grep; `refrence-repos/vendor-study/*` not opened; no test was executed |
| Nexus worktrees (`.worktrees/`, `.claude/worktrees/epic-dewdney-6dc8ec`) | Listed only | Duplicates of other branches; not read |
| `acadrust` 0.6.5 (Nexus's pinned DWG crate) | Source in the local cargo git checkout `~/.cargo/git/checkouts/acadrust-088101b71314caec/289a616` | Reader internals not read; DWG decoding accuracy not tested |
| LibreCAD, FreeCAD, IfcOpenShell, QGIS, xc in `bonyad/refs/` | Entity headers, licences, targeted greps | No build, no test, no behavioural check; far from a full audit of any of them |

The founder's note about hecs is confirmed: Nexus uses `hecs 0.11` (CODE, `packages/kernel/Cargo.toml`, `world.rs:9`).

## A. Entity catalogue

### A1. Nexus kernel (`packages/kernel`), 2D only

CODE: `packages/kernel/src/entity.rs:46-206`, enum `GeometryType`, **26 variants** (RUN below).
Coordinates are `Point2D {x, y}` (`entity.rs:9`). There is no `z`, no normal/extrusion, no
3D point type anywhere in the kernel (CODE: grep for `Point3D|elevation|extrusion` in
`packages/kernel/src` returned only unrelated `ezpz` hits, see Run log R3).

| Variant | Fields stored | Notes |
|---|---|---|
| Line | start, end | |
| Circle | center, radius | |
| Arc | center, radius, start_angle, end_angle | angle unit not in the type (see D1 on a degrees/radians mix-up in tool text) |
| Polyline | vertices: Vec<Point2D>, closed | **No bulge.** `metrics.rs:187`: "Polyline segments are straight chords until 115 adds bulges" |
| Rectangle | origin, width, height, rotation | Nexus-specific, not a DXF type; round-trips via a NEXUS XDATA tag (`dxf-import.ts:960-985`) |
| Ellipse / EllipseArc | center, semi_major, semi_minor, rotation (+ start/end angle) | |
| Spline | control_points, degree, closed | **No knots, no weights**: not NURBS (CONTEXT_NEXUS.md section 2, DOC; confirmed by the variant fields) |
| Point | position | |
| ConstructionLine / Ray | origin, direction | infinite / semi-infinite |
| Text / MText | position, content, height, rotation, style_name (MText adds width) | |
| Dimension, AlignedDimension, AngularDimension, RadialDimension, DiameterDimension | defining points, offset or radius, text_override, style_name | |
| Hatch | `boundary_ids: Vec<String>`, pattern, scale, angle | **References** other entities by id; does not own its loops |
| BlockRef | block_id, insertion, rotation, scale_x, scale_y | **References** a `BlockDef` by id; no scale_z |
| Table | position, rows, cols, row_height, col_widths, cells, style_name | |
| RevisionCloud, Wipeout, Leader, Tolerance, AttDef | vertex lists and text fields | |

Wrapper: `Entity { id: String, geometry: GeometryType, layer_id, style: EntityStyle{color, linetype, lineweight}, draw_order }` (`entity.rs:887-897`).
`BlockDef { id, name, base_point, entities: Vec<Entity> }` (`entity.rs:212-217`): **a block owns its member entities** (definition); instances reference it.
ECS: `Geometry`, `LayerRef`, `Style`, `EntityName`, `DrawOrder`, and a **stub** `BIMProperties { ifc_class }` (`components.rs:21`), spawned only by `spawn_entity_with_bim` (`world.rs:59`). Nothing reads it for behaviour (INFERENCE from grep; not exhaustively checked).

Identity: `NexusWorld::gen_id` returns `ent_{next_id}` (`world.rs:33-37`). Units/frame: the type carries none; the drawing carries `DrawingUnits` (`units.rs:172`). Ownership: Hatch references; BlockDef owns.

### A2. Nexus DXF import (`packages/file-io`) and the DWG reader (`packages/dwg-reader`)

| Layer | What it supports | Evidence |
|---|---|---|
| DXF import (JS, uses `dxf-parser`) | 13 explicit cases: POINT, LINE, CIRCLE, ARC, ELLIPSE, SPLINE, LWPOLYLINE, POLYLINE, TEXT, MTEXT, DIMENSION, INSERT, ATTDEF; plus 4 read from raw text: HATCH, RAY, XLINE, WIPEOUT = **17 AutoCAD types**. LEADER, MLINE and others are dropped by the parser and counted as unsupported | CODE `dxf-import.ts:831-1243`, `:245`, `:1353` |
| Arcs in polylines | **Tessellated to line vertices on import** (segments of about pi/16); the bulge is lost | CODE `dxf-import.ts:962-1031` |
| Z | Entities with non-zero z are **flattened to 0** and reported | CODE `dxf-import.ts:164`, `:249-258` |
| OCS | Only +Z and -Z extrusions; -Z is mirrored in x; any other normal is reported and the entity is **not imported** | CODE `dxf-ocs.ts:1-43` |
| DWG reader | Not a model: DWG bytes -> `acadrust` document -> **DXF text** -> the same importer. Versions AC1014-AC1032 admitted; AC1009 and AC1012 refused. 8 MiB input cap. Panic guard returns `READER_TRAPPED` | CODE `dwg-reader/src/read.rs:11-19, 94-123` |

So Nexus supports **17 of the roughly 48-65 DXF/DWG entity types** that its own DWG crate or
`libdxfrw` enumerate (denominators below). No official AutoCAD count was available to me in
any source: **UNKNOWN**.

### A3. `acadrust` 0.6.5 (the DWG crate Nexus wraps), MPL-2.0

CODE: `src/entities/mod.rs:461-554`, enum `EntityType`, **48 variants** (RUN R4). Not Nexus code and not a Nexus model; it is the most complete entity model I found in Rust.

| Group | Variants | Fields of note |
|---|---|---|
| 2D curves | Point, Line, Circle, Arc, Ellipse, LwPolyline, Polyline (legacy 3D header), Polyline2D, Spline, Ray, XLine, Helix | `Line{start,end: Vector3, thickness, normal}` (`line.rs:9-20`); `LwVertex{location: Vector2, bulge, start_width, end_width, vertex_id}` (`lwpolyline.rs:9-21`) |
| 3D | Polyline3D, Face3D, Solid (2D filled), Solid3D, Region, Body, Surface, Mesh, PolyfaceMesh, PolygonMesh | `Solid3D` carries ACIS SAT/SAB data plus wires, not a topology model we can compute with (`solid3d.rs:643-658`; `entities/acis/` has a SAT/SAB parser, writer and primitive builders) |
| Annotation | Text, MText, Dimension, Leader, MultiLeader, MLine, Table, Tolerance, Shape, Wipeout, AttributeDefinition, AttributeEntity | |
| Definition / instance | Block, BlockEnd, Insert, Seqend | `Insert{block_name, insert_point: Vector3, x/y/z_scale, rotation, normal, rows, cols, spacings, attributes}` (`insert.rs:21-51`); references block **by name** |
| Other | Hatch, RasterImage, Underlay, Viewport, Light, Ole2Frame, SectionSymbol, ViewBorder, Extended, Unknown | `Unknown`/`Extended` keep raw bytes for same-version round trip |

Common to all: `EntityCommon{handle, layer (name), color, line_weight, linetype (name), linetype_scale, transparency, invisible, extended_data (XDATA), reactors, xdictionary_handle, owner_handle}` (`entities/mod.rs:293-333`): **a DXF/DWG handle is the identity; owner is a handle; sub-geometry is owned inline or by handle reference** depending on type.

Civil 3D / AEC: the crate treats them as unsupported objects stored as **opaque source-version bytes**; `document.rs:1663-1666` says so explicitly (CODE).

### A4. LibreCAD (`refs/librecad`, 2D only)

CODE: `librecad/src/lib/engine/rs.h:164-215`: `RS2::EntityType` has 50 enumerators, of which about 28 are persistent drawing entities and the rest are containers, overlays, snap and preview helpers (INFERENCE from names).

| Persistent entities | Notes |
|---|---|
| Point, Line, Arc, Circle, Ellipse, Hyperbola, Parabola, Spline, SplinePoints, Polyline (+Vertex), ConstructionLine, Solid (2D), Text, MText, 6 dimension kinds + DimLeader, Tolerance, Hatch, Image, Wipeout, MLeader, Insert, Block | `RS_Polyline::addVertex(v, bulge)` carries **bulge** (`rs_polyline.h:99`); `RS_SplineData` carries **knots, degree** (`rs_spline.h:57-81`); `RS_Hatch` is an **entity container that owns its loops** (`rs_hatch.h:74`); `RS_Insert` references its block **by name** (`rs_insert.h:41-70`) |

- **No 3D solid, mesh or B-rep type** in the enum (CODE, same lines). `RS_Vector` has a z component (`rs_vector.h:44`); whether the engine uses it for modelling is UNKNOWN.
- Identity: `m_id = ++idCounter` (`rs_entity.cpp:167`): **a process-lifetime counter, not persisted** (CODE). DXF handles are libdxfrw's concern.
- Units: `RS2::Unit` 0-20 plus `LastUnit=21` (`rs.h:611-635`), a smaller set than AutoCAD's 25 (no US survey foot).
- File layer: `libraries/libdxfrw` `DRW::ETYPE` enumerates about **65** entries (RUN R5), including 3DFACE, 3DSOLID, BODY, MESH, REGION, SURFACE-family markers, POINTCLOUD. The LibreCAD DXF filter's actual subset is **UNKNOWN** (not enumerated).

### A5. FreeCAD (`refs/freecad`, LGPL-2.1-or-later, version.json 27.1.0)

FreeCAD is not an entity-enum design. It is a document of `App::DocumentObject`s whose geometry is OpenCASCADE (OCCT) objects.

| Layer | What exists | Evidence |
|---|---|---|
| Geometry wrappers (Part) | Curves: Line, LineSegment, Circle, ArcOfCircle, Ellipse, ArcOfEllipse, Hyperbola (+arc), Parabola (+arc), BezierCurve, BSplineCurve, OffsetCurve. Surfaces: Plane, Cylinder, Cone, Sphere, Toroid, BezierSurface, BSplineSurface, OffsetSurface, PlateSurface, SurfaceOfRevolution, SurfaceOfExtrusion, Trimmed | CODE `Mod/Part/App/Geometry.h:164-1329` (class list) |
| Shapes / B-rep | `TopoShape` (OCCT topology: vertex, edge, wire, face, shell, solid, compound) | CODE `Mod/Part/App/TopoShape.h` exists; the topology list is INFERENCE from OCCT |
| Draft (2D/3D parametric drawing objects) | array, bezcurve, block, bspline, circle, clone, dimension, ellipse, facebinder, fillet, hatch, label, layer, patharray, point, pointarray, polygon, rectangle, shape2dview, shapestring, text, wire | CODE `Mod/Draft/draftobjects/` (file list) |
| BIM (Arch*) | 53 Python modules: Wall, Structure, Roof, Stairs, Site, Pipe, Space, Axis, Rebar, Building, Floor, Window, Truss, Curtain wall, Covering, Schedule and more; `ArchIFC*` for IFC class mapping | CODE `Mod/BIM/*.py` |
| Meshes / points | `Mod/Mesh` (Delaunay, quasi-Delaunay, constrained-Delaunay and ear-clipping triangulators), `Mod/Points` (point-cloud features, grids, kd-tree), `Mod/Surface` (filling, sewing, sections, blending as OCCT features) | CODE `Mod/Mesh/App/Core/Triangulation.h:222-251`; `Mod/Points/App/`; `Mod/Surface/App/` |
| DXF import | `Mod/Import/App/dxf/dxf.h` reads Line, Text, Solid, Arc, Circle, Ellipse, Point, Spline, LwPolyline, Polyline, Insert, Dimension (**12**); that file's SPDX line is BSD-3-Clause | CODE `dxf.h:652-680`, `:1` |

Identity: each object has a long id unique within the document (`DocumentObject.h:257-259`), an auto-generated `Name`, an editable `Label` (`:157`), and an element-name map for topological naming (`App/ElementMap.h`, `MappedName.h`). Units: `Base::Quantity` with a unit schema (`Base/Quantity.h`); placement via `Base::Placement`. Whether the internal length unit is always mm: UNKNOWN (not confirmed in code I opened).

### A6. IfcOpenShell and QGIS (included because they hold the only Civil-class and GIS-geometry code)

| System | Entity-like types worth knowing | Evidence |
|---|---|---|
| QGIS core geometry | Point (x, y, z, m), LineString, CircularString, CompoundCurve, CurvePolygon, MultiX, **PolyhedralSurface, TriangulatedSurface** | CODE `src/core/geometry/qgspoint.h:751-754`, `qgstriangulatedsurface.h`, `qgspolyhedralsurface.h`, `qgscompoundcurve.h` |
| IfcOpenShell | IFC 4.3 alignment, curve segments, sectioned solids and surfaces, triangulated face sets; geometry kernels pluggable (OpenCASCADE, CGAL, Manifold, passthrough) | CODE `src/ifcgeom/mapping/{IfcCurveSegment,IfcSectionedSolidHorizontal,IfcSectionedSurface,IfcSegmentedReferenceCurve,IfcTriangulatedFaceSet,IfcAxis2PlacementLinear}.cpp`; `src/ifcgeom/kernels/{opencascade,cgal,manifold,passthrough}` |

### A7. Summary of coverage

| System | Entity types modelled | Of AutoCAD DXF/DWG | 3D | Polyline bulge | NURBS |
|---|---|---|---|---|---|
| Nexus kernel | 26 | 17 imported (CODE) | none | no | no (control points only) |
| acadrust (in Nexus) | 48 | 48 variants, including 3D, as the crate's own claim, CODE-counted | yes (ACIS data, meshes, surfaces) | yes | yes (Spline; detail not read) |
| LibreCAD | about 28 persistent | UNKNOWN (filter subset not enumerated); libdxfrw knows about 65 | no | yes | partly (spline with knots) |
| FreeCAD | open (OCCT-backed) | 12 DXF types in C++ importer | yes (B-rep) | n/a | yes (BSpline curves and surfaces) |

## B. Civil 3D-class concepts

Search method: `grep -rIli` for alignment, corridor, landxml, terrain, TIN, parcel, survey, grading across Nexus
`packages/`, `docs/`, and across the `refs/` trees; then reading each hit's context.

| Concept | Nexus | FreeCAD | LibreCAD | QGIS | IfcOpenShell | Verdict |
|---|---|---|---|---|---|---|
| Alignment (horizontal) | **Absent in code**; DOC sketch only: `Alignment{elements, equations}` (`docs/architecture/22-ecs-component-design.md:279-286`, parked) | Absent. `ArchAxis` is a building grid axis, not a road alignment (INFERENCE from file) | Absent | Absent | **Exists**: `api/alignment/*` (62 modules), IFC `IfcAlignment` layouts, `layout_horizontal_alignment_by_pi_method.py`, `create_by_pi_method.py`, clothoid curve-segment mapping | Present only in IfcOpenShell |
| Profile / vertical alignment | Absent; DOC `Profile{station_elevation, vertical_curves}` | Absent | Absent | Absent | **Exists**: `layout_vertical_alignment_by_pi_method.py`, `add_vertical_layout.py`; `api/profile` is a section profile, a different concept | IfcOpenShell |
| Cant / superelevation | Absent | Absent | Absent | Absent | **Exists**: `get_cant_layout.py`, `_map_alignment_cant_segment.py` | IfcOpenShell |
| Station / offset | Absent | Absent | Absent | Absent (no chainage in `qgscurve.h` per grep) | **Exists**: `distance_along_from_station.py` handles station equations and reversed stationing; `add_stationing_referent.py`; `IfcAxis2PlacementLinear` | IfcOpenShell |
| TIN / terrain surface | Absent; DOC `TerrainSurface{tin}`; RFC 0032 plans DEM tiles for map display only (DOC) | Site has a `Terrain` property that is any shape or mesh the user supplies, plus cut/fuse of additions (`ArchSite.py:514-570, 855-900`); `Mod/Mesh` has Delaunay triangulators | Absent | **Exists**: `analysis/interpolation/qgstininterpolator`, `qgsdualedgetriangulation`, `HalfEdge`, `TriDecorator`, `CloughTocherInterpolator`; plus `QgsTriangulatedSurface` | `IfcTriangulatedFaceSet` mapping | QGIS and FreeCAD Mesh for algorithms; both copyleft |
| Corridor / assembly | Absent; DOC `Corridor{alignment, profile, assembly}` | Absent | Absent | Absent | **Partial and structural**: `IfcSectionedSolidHorizontal`, `IfcSectionedSurface`, `IfcFixedReferenceSweptAreaSolid`, `IfcSegmentedReferenceCurve` are geometry mappings (sweep a profile along an alignment); there is no design-time "assembly" or corridor authoring model I found | Geometry yes, authoring no |
| Pipe network | Absent | `ArchPipe.py` (a BIM pipe object; not a gravity-network model) | Absent | Absent | IFC distribution systems exist in the schema (INFERENCE; not opened) | Stub-class at best |
| Parcel / lot | Absent | Absent | Absent | Polygon features only; no parcel topology | Absent | Absent in all; a LandXML `Parcel` is documented in Bonyad's own `formats/landxml-1.2.md` |
| Survey point / figure | Absent | Absent (`Mod/Points` is point clouds) | Absent | Points as features | **Exists**: `api/cogo/add_survey_point.py`, `assign_survey_point.py`, `edit_survey_point.py`, `bearing2dd.py` | IfcOpenShell |
| Georeference / CRS | DOC RFC 0032, 0016 (research/draft; `frame` reserved, no code) | Placement only | Absent | **Exists** (full CRS stack, PROJ) | **Exists**: `api/georeference/*` (IfcMapConversion, IfcProjectedCRS style) | QGIS/PROJ and IfcOpenShell |
| Grading / earthwork | Absent; RFC 0031 quantity takeoff is DOC, brief names "drone survey to DTM to grading to earthwork to BOQ" as a target | Absent (`ArchSite` cut/fill is a boolean on solids, not grading) | Absent | Raster calc only | IFC earthworks entities: UNKNOWN (schema not opened) | Absent |
| LandXML | DOC only: "adapter slot reserved, no code" (`rfcs/0050:73,83,188`) | Absent (`landxml` grep: no hits) | Absent | No hits | No hits | **Absent everywhere in code** |
| Civil 3D object preservation | n/a | n/a | n/a | n/a | n/a | `acadrust` stores AEC/Civil 3D objects as opaque bytes (`document.rs:1663-1666`) |

Bottom line for B: the **only readable, working Civil-class procedures** are in IfcOpenShell
(alignment layout, stationing, cogo) and QGIS (TIN interpolation). Nexus has none; its own
docs mark Civil as "no mature open browser tool found: a build gap" (RFC 0027 row, DOC).

## C. Separation in Nexus

### C1. Boundaries

| Concern | Where it lives | Evidence |
|---|---|---|
| Data (entities, units, layers, events) | `packages/kernel` (Rust, `cdylib+rlib`), one `Kernel` struct per instance | `CONTEXT_NEXUS.md` section 2 (DOC); `kernel/Cargo.toml` (CODE) |
| Procedures | Same crate: `geometry_ops.rs` (offset, trim, extend, fillet, break, join), `geometry_intersections.rs`, `metrics.rs`, solver (`ezpz`), all `pub(crate)` | CODE (RUN R2) |
| Operation contract | `Command` enum, serde-tagged, **152 variants**; `execute_command(json) -> json` | CODE `commands.rs:27` (RUN R1) |
| Event log | `EventEnvelope{seq, timestamp_ms, attribution, schema_version=2, prev_hash, payload: CadEvent}`; `CadEvent` of about 44 variants; BLAKE3 over RFC 8785 JCS | CODE `events.rs:87-96, 122`, `canonical.rs:1-13` |
| Undo / redo | Applies and un-applies logged events; compound events for one undo step | CODE `undo.rs:1-60`; `apply.rs` |
| Entity store | `hecs::World` plus `id_map` and `cache` dual-write; "NexusWorld is the sole write path" | CODE `world.rs:8-14`; DOC DECISIONS EX-05 |
| Persistence | JSON snapshot in OPFS or Supabase Storage; the `nexus.projects` table holds only name, owner, counts | CODE `supabase/migrations/20260904120000_nexus_schema.sql:16-25`; DOC CONTEXT_NEXUS section 4 |
| Presentation | `packages/renderer` (Three.js), `packages/app` (Svelte 5, about 41k lines of ts/svelte) | CODE (counts via `wc`) |
| Agent surface | `packages/mcp` `tool-definitions.ts` (156 tool schemas, 2398 lines); native stdio `server/` binary | CODE; DOC CONTEXT_NEXUS 3.1 |

### C2. Direct answers

| Question | Answer |
|---|---|
| Command/operation log? | Yes. Event log with actor attribution (`Actor{kind: Human|Agent|System}`, `on_behalf_of` required for agents: `events.rs:17-83`). It is a **state-delta** log (old and new geometry), not a command log |
| Undo model? | Event-based, kernel-side (`undo.rs`) |
| Revision model? | Hash-chained events with schema version; **no named revisions, no accept/conflict step**. Snapshot v2 is Accepted in RFC 0006 but "not yet wired" per SD-66 D1 (DOC) |
| Entity store / ECS? | Yes: hecs, with components `Geometry`, `LayerRef`, `Style`, `EntityName`, `DrawOrder`, stub `BIMProperties`. The rule "ECS, never inheritance" is Nexus CLAUDE.md Rule 3 (DOC). In practice **one enum `GeometryType` holds all geometry**; adding a domain means adding a variant, not a component (INFERENCE from `components.rs` and `entity.rs`) |
| Server / Postgres / Supabase? | Supabase is auth, one `projects` table, and a storage bucket. **Entities are not rows.** The Rust `server/` is a 139-line stdin/stdout JSON loop over the kernel |

### C3. Where Nexus violates its own separation

| Violation | Evidence | Rule it breaks |
|---|---|---|
| Four parallel command surfaces (Rust enum 152, MCP schemas 156 + 12 custom, app command registry 74, TS mirror 61) that drift | CONTEXT_NEXUS 3.1 (DOC, audited 2026-10-08; may have moved) | Nexus Rule 1; Bonyad "one executable owner per procedure" |
| Snap computation exists in both Rust (`snaps.rs`, 1168 lines) and TS (`renderer/SnapEngine.ts`, 362 lines, with its own intersection and distance maths) | CODE (`wc -l`; `SnapEngine.ts:100`) | Bonyad: presentation must not own a procedure. (Possibly a deliberate hot-path duplicate: INFERENCE) |
| `server/src/main.rs` uses `unwrap_or(0.0)` and `unwrap_or(1.0)` for missing arguments (17 `unwrap_or` hits) | CODE `main.rs:27-31, 47-50` (RUN R6) | Nexus Rule "fail loud"; a silent default turns a missing radius into a unit circle |
| Hatch and constraint solver reference entities by id or index that are not stable across reload | CONTEXT_NEXUS section 4 "Index refs" (DOC, early); ULID allocator unwired (RUN R3) | Identity must precede references |
| Some kernel commands call `std::fs` (`SaveDrawing`, `OpenDrawing`) inside the pure kernel | CONTEXT_NEXUS section 2 (DOC) | Bonyad: no I/O in the geometry crate |
| BIM concept (`BIMProperties`) lives in the generic component module | CODE `components.rs:21` | Definition vs domain: stub, harmless today |
| DB holds a blob, so integrity (keys, kinds, finiteness) is entirely in the app | `supabase/migrations/...:16-25` | Opposite of Bonyad's "PostgreSQL preserves authoritative state" |

### C4. Comparison with Bonyad's rules

| Bonyad rule | Nexus | Delta |
|---|---|---|
| One executable owner per procedure | Rust kernel owns it in principle; duplicates in TS snaps and in four command lists | Bonyad's single OpenAPI contract with generated clients is the stronger answer |
| Concrete first, no universal JSON | One large enum plus JSON snapshot blob; effectively a universal document | Bonyad's per-kind tables are stricter |
| Authored vs derived | Not distinguished in the model (CalcRecord for measurements is planned, DOC) | Bonyad has more to say here |
| Propose then accept | `preview_command` dry-run exists but is not exposed to agents (CONTEXT section 10, DOC; may have changed) | Same direction |
| Definition vs instance | `BlockDef` owns; `BlockRef` references (A1) | Matches |
| Revision | Event log, no accept step | Bonyad milestone 2 adds the accept step |

## D. Identity, units, frames, definition/instance, layers

| Topic | Nexus | acadrust | LibreCAD | FreeCAD |
|---|---|---|---|---|
| Identity | `ent_N` counter in use. RFC 0006 (Accepted) specifies ULID ids minted once in live execution, never in replay; `IdAllocator` implemented but **unreferenced** (R3) | DXF/DWG `Handle` per entity, owner handle, preserved for round trip | In-memory counter (`rs_entity.cpp:167`) | Per-document long id, `Name`, `Label`, element map |
| Units | `InsUnits` 25 codes incl. US survey foot 21 = 1200/3937 m (`units.rs:34-64, 77`); `MeasurementRecord{value, unit, value_si, units_assumed, unverified}` for Length and Area only (`units.rs:294-317`); native units kept, converted on output (SD-21, DOC) | `$INSUNITS` in header (not opened) | 21-entry `RS2::Unit` | `Base::Quantity` |
| Frames | `DrawingUnits` and sysvars; named UCS as a record (`entity.rs:822`); OCS handled at import only (+Z/-Z) | OCS `normal` per entity; WCS point fields | Single plane | `Placement` per object |
| Definition vs instance | `BlockDef` (owns) / `BlockRef` (id); RFC 0042 (Draft) adds attribute instances computed from AttDef | `Block` + `Insert{block_name}` | `RS_Block` / `RS_Insert{name}` | Links, clones, App::Part (not opened) |
| Layers | `Layer{id, name, color, visible, locked, linetype, lineweight}` (`entity.rs:900-909`); lock enforcement is a Draft RFC (0040) | layer **name** on every entity | `RS_Layer` with frozen, locked, print, construction flags (`rs_layer.h:43-53`) | Draft layers are objects |
| Linetypes | `EntityStyle.linetype` string; `ltscale` and `psltscale` are document-level; RFC 0037 plans a linetype definition list in the plot job (DOC) | name + scale per entity | linetype directory | n/a |
| Paper vs model space | Only a `PSLTSCALE` sysvar exists; layouts/viewports are RFC 0037 in **Design** (`rfcs/0037:81`) | `Viewport` entity, layout objects | `RS_Graphic` paper-space layouts, read-only view (`rs_graphic.h:96-114`) | TechDraw (not opened) |

### D1. Hard lessons recorded in Nexus (DOC unless marked CODE)

| Lesson | Where | Takeaway for Bonyad |
|---|---|---|
| DXF export hard-coded `$INSUNITS = 6` (metres); the kernel had no unit model | RFC 0002 (Research) code evidence | Never export a guess as a declaration |
| A saved project **with no units record opened as "millimetres, declared"** and the next autosave wrote it back as confirmed | RFC 0048 summary; CODE `dxf-export.ts:206-211` now throws `UNITS_UNKNOWN` | Missing unit must be an error or a visibly assumed value, never a default that persists |
| Absolute tolerances (1e-8, 1e-10) are meaningful in metres but not at UTM magnitudes; naive shoelace sums lose precision at 1e12 products | RFC 0002; CODE `tolerance.rs:8-28` | Frame origin and tolerance belong to the project, not to constants |
| Tool text said radians where the kernel took degrees; an agent would fill 6 degrees instead of a full circle | `.claude-drafts/issues/pending/defect-d8a-arraypolar-angle-unit-text.md` (untracked draft) | Every angle crossing a boundary needs a typed unit |
| Dimension click offset under 1 unit silently replaced by 3, unit-blind and side-blind | `.claude-drafts/issues/pending/defect-dim-offset-silent-fallback.md` | No magic numbers in drawing units |
| A degenerate polyline returned area 0 and centroid (0,0) as **success** | RFC 0002 code evidence (`create.rs:674-678` at the time) | Fail loud; Bonyad's validation errors already follow this |
| Mixed-version event chains broke on a schema bump (found by experiment) | RFC 0007 (end of file, line about 412) | Version the event schema from day one |
| `CONTEXT_NEXUS.md` (2026-10-08) already contradicts HEAD in places: it says no INSUNITS and ids are `ent_N`; HEAD has `InsUnits` but still `ent_N` | CODE vs DOC | Audit documents age in days; date and commit-pin every claim |

I did not find a recorded linetype-scale fix in `DECISIONS.md`, `CHANGELOG.md` or the RFCs I opened (grep for `ltscale|linetype.scale`: only RFC 0006/0007/0009/0037 plumbing). The founder's recollection of "linetype-scale fixes" is **UNKNOWN** to me in this tree.

## E. Procedures

Where the geometric procedures live, whether they are callable, and under what licence.

| Procedure | Nexus (Apache-2.0) | LibreCAD (GPL-2.0) | FreeCAD (LGPL-2.1+) | Others |
|---|---|---|---|---|
| Length, area, centroid | `metrics.rs:65-188` (`polygon_moments`, `entity_metrics`), `dimensions.rs` (`measure_*`) | `rs_information`, `lc_secondmoment.h` | via OCCT | QGIS via GEOS |
| Offset | `geometry_ops.rs:236, 2028` (line, arc, circle, ellipse, polyline, rectangle; in-house, straight-chord polylines) | `lc_curveoffset.h`, `lc_offsetresultcheck.h` (arc-aware, budgeted) | OCCT offset | Nexus parks `cavalier_contours` (TC-08) |
| Trim / extend | `geometry_ops.rs:457, 1924`; **line-only** (CONTEXT_NEXUS, DOC) | `rs_modification` | OCCT | |
| Fillet / chamfer | `geometry_ops.rs:1278, 1535, 2125` | `rs_modification` | `ChFi2d` in Part | |
| Intersection | `geometry_intersections.rs:7-186` (line-line, line-circle, line-arc, circle-circle, tangents) | `rs_information`, `lc_parametriccurveintersection.h` | OCCT | |
| Mirror, break, join, explode | `geometry_ops.rs` | yes | yes | |
| Constraint solving | `solver_ezpz.rs` over `ezpz` (MIT), plus a hand-written solver for three constraint kinds | `libraries` (none confirmed) | Sketcher (not read) | |
| Tessellation / triangulation | Absent | earcut/poly2tri not used in LibreCAD (UNKNOWN) | `Mod/Mesh/App/Core/Triangulation.h` (ear clipping, Delaunay, constrained Delaunay) | QGIS vendors `earcut`, `delaunator-cpp` (MIT), `poly2tri` |
| TIN build and interpolate | Absent | Absent | Mesh Delaunay (no terrain model) | QGIS `qgsdualedgetriangulation`, TIN and Clough-Tocher interpolators (GPL-2.0-or-later) |
| Boolean ops (2D or 3D) | **Not found**; Nexus RFC 0028 recommends Manifold for meshes and OCCT for B-rep (DOC, Research) | none | OCCT fuse/cut/common | |
| Alignment layout, station-to-distance | Absent | Absent | Absent | IfcOpenShell `api/alignment` (LGPL-3.0-or-later) |
| Geodesic area | Absent | Absent | Absent | Bonyad's own research: `geographiclib-rs` (MIT) |

Reusability from Bonyad's pure geometry crate:

- Nexus's functions are `pub(crate)` and take Nexus `Entity` values (`geometry_ops.rs`, `geometry_intersections.rs`): **not callable as a library** without forking. The crate is not published to crates.io as far as I could see (UNKNOWN).
- Nexus's declared dependencies are all permissive (Cargo.toml of kernel plus the licence lookups in R7): hecs (MIT OR Apache-2.0), rstar (MIT OR Apache-2.0), ezpz (MIT), blake3 (CC0 or Apache-2.0), serde_jcs (MIT OR Apache-2.0), libm (MIT). Those, not Nexus code, are the pieces that could be named dependencies.
- `acadrust` is MPL-2.0 (file-level copyleft). Nexus uses it **unmodified, in its own WASM module** and says it "must not be linked into NEXUS code" (`scripts/build-dwg-reader.sh:9`, `dwg-reader/Cargo.toml` comment). Its output crosses the boundary as DXF text.
- `libdxfrw` (inside LibreCAD): GPL-2.0-or-later per its README; the FreeCAD DXF reader `dxf.h` is BSD-3-Clause (provenance of that file relative to LibreCAD's libdxfrw: UNKNOWN, check before any reuse).

## F. Reuse verdict

Principle: **Nexus is the founder's separate product; Bonyad is independent.** The recommendation
for Nexus is an *interface* (shared formats and conventions), never a source copy. Bonyad's licence is
undecided, so every row is stated against the strictest likely outcome (a permissive core).

| Component | Source licence | Verdict | Reason |
|---|---|---|---|
| Nexus kernel (entity enum, commands, events, ECS) | Apache-2.0 (`LICENSE`; RFC 0034 says the licence decision is still open) | **Read as reference only**; share a *wire format* if ever needed | Own product; internal functions are `pub(crate)` and Nexus-shaped; its 2D-only polyline without bulge is the wrong base for 3D/Civil |
| Nexus event envelope idea (attribution with `on_behalf_of`, hash chain over canonical JSON) | Apache-2.0 | **Reimplement** (the idea, not the code) in Bonyad's revision milestone | Matches manifesto section 5-6; keep Bonyad's own schema |
| Nexus units model (25 INSUNITS, survey foot exact factor, `MeasurementRecord`) | Apache-2.0 | **Reimplement**; the exact factors are public facts | Small, clear, and the lessons in D1 apply |
| Nexus DWG reader wrapper (`dwg-reader`) | Apache-2.0 wrapper over MPL-2.0 crate | **Reject for the core**; read as a pattern (fail-loud contract, load report, separate module) | A converter is an adapter, not a model; not in the first 3D/Civil slice |
| `acadrust` | MPL-2.0 | **Reuse only as an optional, separate-process adapter** if DWG is ever needed; **read as reference** for the entity field lists | Unmodified MPL in a separate module keeps copyleft file-local; acceptable under most outcomes, but decide after Bonyad's licence |
| `ezpz` constraint solver | MIT | **Candidate dependency** when constraints arrive (milestone 3 of the paved path), after a Bonyad experiment | Permissive; Nexus already pinned it |
| `hecs`, `rstar` | MIT OR Apache-2.0 | `rstar` is a **candidate dependency** for spatial queries; `hecs` **not needed** (Bonyad's store is Postgres) | Do not import an ECS into a model that Postgres owns |
| LibreCAD code (offset, trim, intersection) | GPL-2.0 | **Read as reference only** (algorithms and edge cases) | GPL-2.0 cannot be linked into a permissive core; its `lc_curveoffset.h` budget/validation approach is worth reading |
| FreeCAD code | LGPL-2.1-or-later (mostly); `dxf.h` BSD-3-Clause | **Read as reference**; OCCT is the real 3D dependency question (RFC 0028 in Nexus covers it) | LGPL linking rules complicate a Rust core; use a separate process/WASM module if ever |
| QGIS TIN code | GPL-2.0-or-later | **Read as reference only** | GPL; algorithms are standard (Delaunay, half-edge), so reimplement |
| `earcut`, `delaunator` (vendored by QGIS) | delaunator-cpp MIT (its LICENSE file); earcut licence UNKNOWN (not opened) | **Candidate algorithms**; prefer the Rust crates (`earcutr`, `delaunator`, `spade`) after checking their licences (**UNKNOWN**, not opened) | Permissive and small |
| IfcOpenShell alignment/cogo/georeference API | LGPL-3.0-or-later | **Read as the reference implementation**; use IFC 4.3 as the *exchange format*; reimplement stationing and PI layout in Bonyad's Rust crate | The IFC schema is the interface; the Python code is the test oracle, not a dependency |
| IfcOpenShell as a **test oracle** (run it separately to compare numbers) | LGPL-3.0 | **Reuse as an external tool**, not linked | Process boundary keeps licence out of the core |
| xc (finite elements) | GPL-3.0 | **Reject** for the core; reference for later structural work | Not geometry/civil in scope |
| Bonyad's own research: `geographiclib-rs` | MIT | **Dependency candidate** (already recommended in batch 1) | Permissive |

## G. Contradictions and gaps

### G1. Contradictions

| Between | Contradiction | Resolution I would propose |
|---|---|---|
| Nexus code vs Nexus CONTEXT_NEXUS.md (2026-10-08) | CONTEXT says units are display-only and event log is memory-only; HEAD has `InsUnits`, `MeasurementRecord` and `EventEnvelope` v2 | Treat DOC dates as stale after days; cite commit `909d680` |
| Nexus RFC 0006 (Accepted: ULIDs) vs kernel | The allocator exists, is tested, and is never called (R3) | Wiring is pending (SD-66 D1); do not count it as shipped |
| Nexus LICENSE (Apache-2.0, Cargo `license = "Apache-2.0"`) vs RFC 0034 and SD-66 D9 | The files say Apache-2.0; the decision log says the licence decision is "later" and the repo is private | Read the licence as "Apache-2.0 as declared, undecided as policy" |
| Nexus Rule 3 "ECS, no inheritance" vs `GeometryType` | Domain growth is a bigger enum, not components | Informational; Bonyad chose per-kind tables instead |
| Nexus scope lock SD-05 (no 3D/Civil code) vs CLAUDE.md "replace Civil 3D" | Vision says Civil; backlog rejects Civil PRs | Not a defect; confirms there is no Nexus code to find |
| Bonyad manifesto "PostgreSQL = state" vs Nexus | Nexus stores state as JSON blob and a project row | Nexus is no evidence for the Postgres model; only for the Rust-side procedures |
| Bonyad first-slice "line owns its endpoints; equal coordinates imply no connection" vs IFC/LandXML | LandXML lines can reference named points (`pntRef`) (Bonyad batch 1) | Already noted in `docs/research/README.md`; Civil will require references |
| FreeCAD and Nexus Hatch | FreeCAD/LibreCAD hatch **owns** its loops; Nexus hatch **references** entity ids | Pick ownership explicitly in milestone 3 (Bonyad's rule favours owning) |
| `acadrust` README "48 variants" vs my count | Matches (48, RUN R4) | none |

### G2. Gaps (not available anywhere I looked)

| Gap | Detail |
|---|---|
| A **readable Rust solid B-rep kernel** | None in these trees. Nexus RFC 0028 (Research) concludes none exists open source in the browser. FreeCAD uses OCCT (C++). `acadrust` holds ACIS blobs |
| **Corridor / assembly authoring model** | Only sweeping geometry mappings (IfcOpenShell). No assembly, subassembly, targets, or station-based rule model in any source |
| **LandXML reader/writer** | No code in any tree; Bonyad's own study of the schema is the only artefact |
| **Parcel topology**, grading, earthwork volumes | No code |
| **Pipe-network model** (inverts, structures, hydraulic grade) | `ArchPipe` is a BIM object, not a network |
| **Arc-aware polyline in a Rust model that is also 3D** | `acadrust` has bulge and 3D but is a file model, not a computation kernel |
| **Reliable DXF/DWG entity count** | No official AutoCAD number in any source; I used crate/library enumerations as denominators |
| Behaviour of any system | Nothing was executed except `grep`, `wc`, `ls`, `git`, and a licence lookup; accuracy of DWG reading, offset, or TIN was not tested |

## Source, commit and licence log

| Source | Path | Pinned commit (RUN: `git -C <dir> rev-parse HEAD`) | Licence (file read) |
|---|---|---|---|
| Nexus (main checkout, branch `dev`) | `/Users/bm/nexus-platform-ir` | `909d680fc5337eb324727f63b65a14f501f71f23` (commit title "chore(release): 0.11.0-ir.1 (#584)", 2026-10-21) | `LICENSE` is the Apache License 2.0 text (204 lines); crates declare `Apache-2.0`; RFC 0034 (licence policy) is **Research**, SD-66 D9 defers the decision |
| `acadrust` 0.6.5 | `~/.cargo/git/checkouts/acadrust-088101b71314caec/289a616` | `289a616da6c68518218594aa80802cbe7fa71309` (matches the rev in `dwg-reader/Cargo.toml`) | `LICENSE`: Mozilla Public License Version 2.0 |
| LibreCAD | `/Users/bm/sub-biz/bonyad/refs/librecad` | `d06eba4d4b361c8ae4a0c1e2c1ee2e8db3415622` (commit date 2026-10-21) | `LICENSE`: GPL v2 (text in `licenses/gpl-2.0.txt`); also `licenses/MIT.txt`, `OFL.txt` for components; `libraries/libdxfrw`: GPL v2 or later |
| FreeCAD | `.../refs/freecad` | `d3f4da791daa9e94f340b81770d13f090ec679c6` (version.json 27.1.0) | `LICENSE`: LGPL 2.1; SPDX `LGPL-2.1-or-later` in headers; `Mod/Import/App/dxf/dxf.h`: BSD-3-Clause |
| IfcOpenShell | `.../refs/ifcopenshell` | `f827c42b68558a6a0686105d6b2d45f3c1196942` | `COPYING.LESSER`: LGPL v3; Python headers say "LGPL v3 or any later version" |
| QGIS | `.../refs/qgis` | `149067ad0b9fc57561c3a5a97eed84348b0265f0` | `COPYING`: GPL v2; vendored `external/delaunator-cpp` MIT (Volodymyr Bilonenko, 2018) |
| xc | `.../refs/xc` | `54a7ea0cd4e9cad8515d56bcca62b744f8d95884` | `license.txt`: GPL v3 |
| Nexus reference repos (not used here) | `/Users/bm/nexus-platform-ir/refrence-repos/{FreeCAD,LibreCAD,QGIS,IfcOpenShell,...}` | FreeCAD there is `b0d42ef...` and LibreCAD `193a366...`: **different** commits from Bonyad's `refs/`; not read | n/a |
| Bonyad itself | `/Users/bm/sub-biz/bonyad` | branch `dev`, `f8bd022` at session start | `logic/Cargo.toml:7`: `license = "LicenseRef-Undecided"`; no `LICENSE` file |
| Other refs on disk, not opened | `refs/{blender,godot,o3de,opensees,projectlibre}` | `6421771f`, `7782e7e2`, `2462b90e`, `d0ac447e`, `0530be22` | not read |

Reusable Rust dependency licences (RUN R7, from `Cargo.toml` of the cargo registry copies):
hecs 0.11.0 `MIT OR Apache-2.0`; rstar 0.12.2 `MIT OR Apache-2.0`; ezpz 0.2.23 `MIT`;
blake3 1.8.7 `CC0-1.0 OR Apache-2.0 OR Apache-2.0 WITH LLVM-exception`; serde_jcs 0.2.0
`MIT OR Apache-2.0`; libm 0.2.16 `MIT`.

## Run log (read-only commands and results)

| Id | Command | Result |
|---|---|---|
| R1 | `sed -n 27,905p packages/kernel/src/commands.rs \| grep -c "^    [A-Z][A-Za-z0-9]*\( {\|,\)"` (in Nexus) | `152` |
| R2 | `grep -n "^pub(crate) fn\|^pub fn" packages/kernel/src/geometry_ops.rs` | functions listed at lines 8-2336 are all `pub(crate)` |
| R3 | `grep -rn "IdAllocator" packages/kernel/src \| grep -v "^./ids.rs"` (run from `src`) | no hits outside `ids.rs` (hits shown were `ids.rs` tests only); and `grep -rn "gen_id()" .` hits `create.rs:51,58,65,80,...`, i.e. `ent_N` ids still minted by `NexusWorld::gen_id` |
| R3b | `grep -n -i "bulge" packages/kernel/src/*.rs` | one hit: `metrics.rs:187` comment "until 115 adds bulges" |
| R4 | `sed -n 461,560p src/entities/mod.rs \| grep -c "^    [A-Z][A-Za-z0-9]*("` (in acadrust checkout) | `48` |
| R5 | `awk` over `libraries/libdxfrw/src/drw_entities.h` from `enum ETYPE` to its closing brace, counting non-comment lines | `65` |
| R6 | `grep -c unwrap_or server/src/main.rs` | `17`; `grep -c '^        "[a-z_]*" =>' server/src/main.rs` gives `5` tools (`create_line`, `create_circle`, `get_entities`, `undo`, `get_state`) |
| R7 | `grep -m1 '^license' ~/.cargo/registry/src/*/{hecs-0.11.0,rstar-0.12.2,ezpz-0.2.23,blake3-1.8.7,serde_jcs-0.2.0,libm-0.2.16}/Cargo.toml` | values listed above |
| R8 | `sed -n 46,206p packages/kernel/src/entity.rs \| grep -c "^    [A-Z][A-Za-z]* {"` | `26` |
| R9 | `find <nexus>/packages/app/src \( -name '*.ts' -o -name '*.svelte' \) \| grep -v test \| xargs wc -l \| tail -1` | `41091 total` |

## Questions for the founder

1. Bonyad's licence is `LicenseRef-Undecided`. Should milestone 3 assume a **permissive core** (so GPL/LGPL material stays reference-only, and IFC/LandXML are exchange formats), or is a copyleft core acceptable?
2. Is IFC 4.3 (alignment, linear placement, sectioned solids) an acceptable *shape to model Civil against*, with LandXML as the survey exchange format, or do you want Bonyad's own concepts first and mappings after?
3. For 3D, do you want a **surface/TIN first** (terrain, triangulated surface, no solids) in milestone 3, leaving B-rep to a later separate-process decision? The sources suggest no readable Rust solid kernel exists.
4. Nexus's Hatch references entities; FreeCAD and LibreCAD hatches own their loops. Which rule do you want for Bonyad composite entities (surface with holes, hatch, corridor)?
5. Do you recall a specific Nexus linetype-scale fix? I could not find it in the decision log, changelog or RFCs I opened.
