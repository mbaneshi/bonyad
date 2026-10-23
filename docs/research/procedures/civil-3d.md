# Procedure study: Civil 3D (alignment, profile, surface, earthwork, corridor, parcel, survey)

**Body of knowledge:** C (procedures). **Discipline:** civil engineering, surveying.
**Status:** research, not decisions. Accessed 2026-10-23. Companion to
[`../formats/landxml-1.2.md`](../formats/landxml-1.2.md).

## How to read this note

Civil 3D is closed source. Behaviour comes from Autodesk help and API pages, cross-checked
against QGIS under `refs/qgis/src/analysis/` and FreeCAD.

- Pages were fetched through a summarising tool: **paraphrase**, not verbatim.
- Labels follow the research README. A claim that appeared only in a search-result excerpt
  is **Interpretation (snippet-only)**.
- The `view/CIV3D/2025/?guid=` URLs returned "Page Not Found"; the `cloudhelp/<year>/ENU/...`
  URLs worked.
- File and line references into `refs/` come from the reading pass and were **not**
  independently re-checked by the author of this note.
- Frame, unit and vertical datum handling is **Unknown** for every procedure: no opened page
  states it. The pages specify units only as "ambient settings" (VolDev). Interpretation:
  Civil 3D keeps frame, unit and datum implicit in drawing settings.

## Sources

Base: `https://help.autodesk.com/cloudhelp/`.

| Key | Path under base |
|---|---|
| SurfDef | `2024/ENU/Civil3D-UserGuide/files/GUID-EB41E9FE-56DC-4469-8280-2C2C8B7F1B1B.htm` |
| BuildOpt | `2023/ENU/Civil3D-UserGuide/files/GUID-FBCE86FA-8941-4A9A-9F89-17C8B334A45E.htm` |
| Brk | `2017/ENU/Civil3D-UserGuide/files/GUID-FCCAF28A-506B-4773-9706-DD1F1F8CC933.htm` |
| Rebuild | `2020/ENU/Civil3D-UserGuide/files/GUID-EA66F3B2-5C3B-4397-92F9-04869060FEAA.htm` |
| APIAuto | `2022/ENU/Civil3D-API/files/html/07e9799f-7ec6-d387-9ce3-ddc335fe4daf.htm` |
| APISurf | `2022/ENU/Civil3D-API/files/html/920bd60e-abec-8757-d031-b9acc5d4753a.htm` |
| Gloss | `2021/ENU/Civil3D-UserGuide/files/GUID-296B42FD-1E33-46D2-88C0-F3B78FF81BE6.htm` |
| Comp | `2019/ENU/Civil3D-UserGuide/files/GUID-A3C76CEC-EE1F-45D4-8D34-E819EB51BD24.htm` |
| Mat | `2023/ENU/Civil3D-UserGuide/files/GUID-DA6342C6-EEF9-420C-8522-9A980172AFBD.htm` |
| VolDev | `2020/ENU/Civil3D-DevGuide/files/GUID-AFBAEC7F-052A-4123-8918-1FC729A709A1.htm` |
| PtLoc | `2022/ENU/Civil3D-API/files/html/88bd4d90-d361-ae5a-3d00-b532063337ce.htm` |
| StaEq | `2016/ENU/Civil3D-DevGuide/files/GUID-F23CC3E9-C29D-4B98-90A2-604C3D8BDC81.htm` |
| StaCtl | `2019/ENU/Civil3D-UserGuide/files/GUID-B7E7615D-3EEB-4DB0-87CF-83D1FF6DD001.htm` |
| Prof | `2019/ENU/Civil3D-UserGuide/files/GUID-49C6EA06-84FF-4358-850C-2C462DF542C3.htm` |
| CorrBR | `2023/ENU/Civil3D-UserGuide/files/GUID-84DF6A7F-47E9-47BC-A40D-EDD1558B5F5B.htm` |
| CorrPar | `2023/ENU/Civil3D-UserGuide/files/GUID-2FE5FB9F-AF80-4E10-89F4-A809C1D873E8.htm` |
| Mapchk | `2023/ENU/Civil3D-UserGuide/files/GUID-A9197827-323C-4780-9046-CCF372BA7052.htm` |
| LSQ | `2024/ENU/Civil3D-UserGuide/files/GUID-00FB26B1-BAB5-4190-B3FB-7FE3624E7F1E.htm` |

Local context: `docs/research/formats/landxml-1.2.md` lines 15-66 (Surfaces, Alignments,
PipeNetworks, Roadways and Survey are **not** studied there, lines 68-71; units lines 21-27;
north-east order lines 29-33; stored redundant area and length lines 59-61).
FreeCAD has no LandXML, Civil 3D or Trails code (grep of `freecad/src` and `freecad/data`
found nothing: absence only). Closest: `refs/freecad/src/Mod/BIM/ArchSite.py` (Terrain,
`AdditionVolume` near line 687, `SubtractionVolume` near 697, fuse and cut near 878-882).

## Procedure records

### 1. Horizontal alignment: station and offset to point, and station equations

| Field | Record |
|---|---|
| Purpose | Map (station, offset) to (easting, northing[, bearing]) and the inverse |
| Typed inputs | Alignment entity (line, curve and spiral sequence), station and offset (doubles), a tolerance for entity choice. Units: PtLoc says "Units: not specified" |
| Outputs | **Verified (PtLoc):** pure coordinates (easting, northing, optionally bearing). The inverse `StationOffset`: snippet-only |
| Basis | Not documented on opened pages. **Hypothesis:** closed-form line, arc and clothoid parametrisation. Experiment: compare against a hand-built arc |
| Preconditions | A negative station throws (snippet-only). Some functions need the raw station, ignoring equations, for example `GetDesignSpeed` (**Verified**, StaEq) |
| Station equations | **Verified (StaEq, StaCtl):** each has a location, a new station basis (Station Ahead, with a Raw Station Back) and an increasing or decreasing flag. Changing the reference point or reference station "removes all station equations and design speeds" |
| Tolerances / failures | Tolerance picks the entity at a boundary (snippet-only). Exception for negative stations (snippet-only) |
| Effects | The query is pure. Editing equations or the reference point is a mutation with a destructive side effect (StaCtl) |
| Dependency | **Unknown** for dependent profiles and sample lines. StaCtl advises using Station Equations rather than moving the reference once profiles and cross sections exist |
| Open source | None for alignments in QGIS or FreeCAD. FreeCAD `BIM/ArchAxis.py` exists but was not read (**Unknown**). LandXML `CoordGeom` is the exchange form (`landxml-1.2.md:37-39`) |

### 2. Vertical profile and elevation at station

| Field | Record |
|---|---|
| Inputs | PVIs (station, elevation), curve length or K (snippet-only), alignment reference |
| Outputs | A Profile entity; elevation at a station is derived |
| Basis | **Verified (Prof):** tangents between PVIs, with free, fixed and floating curves staying tangent to neighbours; the page "does not mention K values or grades" and does not say what is stored versus computed. "Quadratic parabola, constant rate of change of grade" is snippet-only. **Hypothesis:** elevation on a curve is quadratic in station, y = y0 + g1·x + (g2-g1)·x²/(2L). Experiment: read two PVIs and a curve and compare |
| Failures | **Verified (Prof):** design-check violations are reported against a criteria file; message text **Unknown** |
| Effects | Query is pure; moving a PVI keeps tangents attached (snippet-only) |
| Dependency | The profile is tied to its alignment; a station-equation reset removes related data (StaCtl) |
| Open source | None found |

### 3. TIN surface from points and breaklines

| Field | Record |
|---|---|
| Purpose | Build a triangulated surface from ordered definition operations |
| Inputs | **Verified (SurfDef):** points, breaklines, contours, boundaries, DEM files, point groups, drawing objects. Breakline types: standard, proximity, wall, non-destructive (Brk). Units and datum **Unknown** |
| Outputs | A Surface entity holding a definition (ordered operation list) plus the derived triangulation |
| Basis | **Verified (SurfDef):** points less than 0.0001 units apart are merged and the second dropped, with an Event Viewer message if elevations differ; co-circular points can triangulate differently, so the result depends on order. **Verified (Brk):** breaklines force triangle edges. Delaunay is not named on the Brk page; "Delaunay on points with breaklines forced" is snippet-only |
| Clean-up | **Verified (BuildOpt):** maximum triangle length and maximum angle strip border triangles (angle step first); crossing breaklines are corrected only if Allow Crossing Breaklines = Yes, using first, last or average elevation; exclude elevations below or above thresholds; copy-deleted-dependents option |
| Failure modes | Event Viewer messages (merged points with different elevation, unset targets, others) |
| Effects | Mutation of the Surface's definition. **Verified (SurfDef):** adding data updates incrementally; removing data triggers a full rebuild |
| Open source | QGIS `QgsDualEdgeTriangulation` (`qgsdualedgetriangulation.h:48`; `addLine` `:59`, `addPoint` `:60`; `swapEdge` `qgsdualedgetriangulation.cpp:3075`). `QgsTriangulation::ForcedCrossBehavior` (`qgstriangulation.h:48-53`: SnappingTypeVertex, DeleteFirst, InsertVertex) is an explicit enum, whereas Civil 3D uses a global Yes/No plus an elevation rule. No maximum-length or angle trimming seen in the files opened (**Unknown** elsewhere) |

### 4. Surface elevation query

| Field | Record |
|---|---|
| Inputs, outputs | Surface, x, y; a number (pure) |
| Basis | **Verified (APISurf):** `FindElevationAtXY` exists. `FindTriangleAtXY` on TinSurface is snippet-only. Linear in each triangle: **Interpretation** (planar facets) |
| Outside extent | **Unknown** (neither opened pages nor snippets state an exception or sentinel). Experiment: query a point outside the hull |
| Effects | Pure. **Hypothesis:** an out-of-date surface may return a stale Z. Experiment: edit, do not rebuild, query |
| Open source | QGIS `LinTriangleInterpolator::calcPoint` (`LinTriangleInterpolator.cpp:113-141`) solves the plane through three vertices and returns false outside the convex hull (comment at line 123): an explicit failure signal that the Civil 3D pages do not show |

### 5. Earthwork volume

Methods (**Verified** unless noted):

- **Volume surface, grid.** A differential grid from a base and a comparison surface, with X
  and Y spacing and orientation from ambient settings; the elevation difference is measured
  at each grid intersection (Gloss, VolDev). Cut, fill and net come from the elevation
  differences: the three names are snippet-only; Comp does not state output names. VolDev
  requires "every property".
- **Volume surface, TIN.** A differential surface from the composite of points of both
  surfaces; value = top minus bottom, for example 150 - 100 = 50 (Gloss).
- **Composite volumes (Comp).** Uses the points of both surfaces plus the locations where
  their triangle edges intersect, building a composite triangulation of prismoidal segments.
  The page "doesn't explicitly address" overlap or areas covered by only one surface, and
  does not list cut, fill or net output names.
- **Sectional, sample lines (Mat).** Methods Average End Area, Prismoidal and Composite.
  Curve correction applies to Average End Area only. Outputs a material list stored in the
  sample line group, feeding tables, reports and mass haul. Behaviour of sample lines
  extending outside the surface: not stated. Average End Area as the mean of two end areas
  times distance, best when shapes are similar, and prismoidal adding a mid-station section:
  snippet-only.
- **API.** `Surface.GetBoundedVolumes(Point3dCollection)` computes the volume of a bounded
  area (APISurf).

| Field | Record |
|---|---|
| Frame / datum | **Unknown** |
| Effects | Volume-surface creation is a new entity (`TinVolumeSurface.Create(name, baseId, comparisonId)`, VolDev 2024 page); volumes are derived |
| Dependency | The volume surface depends on both source surfaces (**Interpretation**, from creation by ids). Staleness propagation **Unknown** |
| Open source | QGIS `QgsRasterSurfaceVolumeAlgorithm` (`qgsalgorithmrastersurfacevolume.cpp:130-247`): one raster minus a LEVEL (`:125`, `:175`), summed per pixel and multiplied by pixel area (`:210-212`); four modes (`:60-63`: count only above, only below, subtract below, add below); NoData pixels skipped (`:170-172`). Differences: one surface against a constant plane, not two surfaces; no cut/fill/net triple, only one signed or absolute total; a pure function of the raster. FreeCAD `ArchSite.py` (near 850-882): `AdditionVolume` and `SubtractionVolume` by solid fuse and cut on Terrain, an exact B-rep boolean with a different basis |

**Reference case (not run): 10 m x 10 m, existing surface 1 m above design, expected cut 100 m3, fill 0.**

| Method | Outcome (all **Hypothesis**) | Experiment |
|---|---|---|
| Grid volume | Exact at any spacing, because the difference is a constant 1; approximate in general (sampling at intersections) | Build both surfaces, read the volume surface |
| TIN, composite | Exact (prisms of constant height, planar facets) | Same |
| Average end area | Exact only if sections are constant (area 10 x 1 = 10 m2, times 10 m length = 100 m3); would differ if sample-line spacing leaves a gap at the ends (edge handling **Unknown**) | Same |
| Prismoidal | Exact here (constant section) | Same |

### 6. Corridor model

| Field | Record |
|---|---|
| Purpose | Sweep an assembly along a baseline |
| Inputs | **Verified (CorrPar, CorrBR):** horizontal baseline (alignment or feature line), vertical baseline (profile or the feature line itself), regions (start and end station, assembly), frequency, targets mapped to drawing objects |
| Outputs | A Corridor entity with derived geometry and surfaces. **Verified (CorrBR):** the first region spans the baseline, and the next starts at the previous end |
| Failure modes | **Verified (CorrBR):** unset required targets produce Event Viewer messages |
| Dependency | **Verified (CorrBR, CorrPar):** a cleared region checkbox means that section is not reprocessed when alignments, subassemblies or surfaces change. "Lock Regions To" geometry versus station decides how region stations follow alignment edits. Snippet-only: unloading an xref target marks the corridor Out Of Date; Rebuild does not always work, `ForceUpdateCorridor` exists; 2022.1 Rebuild All follows dependency relationships |
| Open source | None |

### 7. Grading and feature lines (snippet-only, not opened)

PIs (geometry vertices) and elevation points (grade breaks only); crossing creates a split
point controlled by the two grades; style priority decides which line sets elevation at a
crossing, otherwise the most recently modified line wins; dynamic link from corridor feature
lines; grading objects live under Sites, and sites interact. Evidence: **Interpretation
(snippet-only)**. Effects: mutation. Open source: none.

### 8. Pipe network connectivity (snippet-only)

Structures (rim, sump), pipes (invert), part lists and rules (cover and gradient, drop
across a structure). Rim elevation can move when connected pipes violate clearance or the
referenced surface changes; "Match inverts, crowns, centerlines" tools exist.
**Interpretation:** connectivity is stored as structure-to-pipe references and elevations
are derived by rules. Open source: none found.

### 9. Parcel area and closure

| Field | Record |
|---|---|
| Inputs | Parcel segments (bearing and distance labels, or true coordinates) |
| Outputs | **Verified (Mapchk):** area, perimeter and error of closure as a ratio ("1 part in X") with direction and distance; roughly 1:10,000 is acceptable and the annotated area must match. Mapcheck uses label precision and Inverse uses coordinates with no closure error (snippet-only) |
| Effects | Mapcheck data is stored in the drawing; the result is derived |
| Compare | LandXML `Parcel` area, `dirClosure`, `distClosure` as stored redundant values (`landxml-1.2.md:40-43`, `:59-61`) |
| Open source | QGIS `QgsCurvePolygon::area` (`qgscurvepolygon.cpp:483`) computes from coordinates; no label-based closure |

### 10. Survey observation reduction

**Verified (LSQ):** least squares minimises squared residuals; traverse loops and networks of
distances and angles by the observation-equation method; produces `network.lso`; adjusted
coordinates can update the survey database. Weights, iterations and failure reports are not
on the page. Snippet-only: Compass, Transit and Crandall methods, default 8 iterations,
`.lsi` and `.lso` files, 3D only with LSQ vertical. Effects: the reduction is derived;
updating the database is a mutation. Open source: none; LandXML Survey is unstudied.

### 11. Dependency and invalidation (cross-cutting, **Verified**)

Editing surface data or build parameters can leave a surface out of date; an icon appears in
Prospector; a manual Rebuild or Rebuild - Automatic follows (Rebuild). API: `IsOutOfDate`,
`AutoRebuild`, `Rebuild`, `CreateSnapshot`, `IsSnapshotOutOfDate` (APISurf). If `AutoRebuild`
and `IsOutOfDate` are both true, the surface rebuilds at the end of the command; this cannot
be set on data-shortcut references (APIAuto). Rebuild "reprocesses all operations in order"
(APISurf). Adding data is incremental; removing it triggers a full rebuild (SurfDef).

## Classification

| Procedure | Class |
|---|---|
| Station/offset to point, point to station | pure calculation |
| Station equation edit, reference reset | mutation with a destructive side effect |
| Profile elevation at station | pure calculation over stored PVIs |
| Surface build or edit | mutation of the definition; triangulation derived, with dependency |
| Surface elevation query | pure (stale if the surface is out of date: **Hypothesis**) |
| Volume surface (grid, TIN), composite | new entity, derived, depends on two surfaces |
| Sectional volumes (material list) | derived, stored on the sample line group, with dependency |
| `GetBoundedVolumes` | pure |
| Corridor | derived, with dependency (alignments, profiles, surfaces, targets) |
| Feature line, grading | mutation, dependency on crossings and priority |
| Pipe network | mutation with rule-driven derived elevations |
| Mapcheck, parcel closure | derived, stored |
| Least squares | derived file output, optional database update |

## Findings relevant to separating entity state from procedures

1. **A Surface stores an ordered operation list (the definition) and a derived
   triangulation.** The result depends on operation order and on tie-breaking (co-circular
   points, the 0.0001 merge) (**Verified**, SurfDef). Interpretation: store the definition
   as entity state and the triangulation as a cached derived result keyed to the definition
   hash plus build parameters.
2. **Invalidation is a flag plus a user-driven or end-of-command rebuild** (`IsOutOfDate`
   plus `AutoRebuild`), and corridors add a per-region opt-out of reprocessing (**Verified**,
   CorrBR). Interpretation: recording input versions in each result would make staleness
   computed instead of flagged, and queries on stale results could be refused or marked.
3. **Volume methods differ in basis** (differential grid, composite triangulation, sectional
   averaging), and the pages do not name outputs or edge behaviour for non-overlapping
   extents. Interpretation: the reference case should be a conformance test across methods,
   and the result should be typed as (cut, fill, net, method, resolution) with an explicit
   overlap policy. QGIS's raster volume function is the contrast: pure, one surface against
   a constant level, NoData skipped.

## Not verified

- Any 2025 `view/CIV3D` GUID page (the volume-methods page `GUID-1E3A9CD9...` returned Page
  Not Found). Average End Area and Prismoidal formulas and sample-line behaviour outside the
  surface are snippet-only.
- Output names (cut, fill, net) as the reports present them; overlap and outside-extent
  handling for every volume method.
- Vertical datum and unit handling anywhere; `FindElevationAtXY` outside the hull; the
  station and offset algorithm and tolerance semantics; the negative-station exception
  (snippet-only).
- PVI and K curve formulas; feature line, pipe network and survey detail beyond snippets;
  the .NET API pages for Alignment, Profile and Corridor classes.
- FreeCAD `ArchAxis.py` and Civil 3D LandXML export and import behaviour.
- No code was run; every reference-case outcome above is a Hypothesis.
