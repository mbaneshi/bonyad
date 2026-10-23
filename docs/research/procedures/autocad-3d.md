# Procedure study: AutoCAD 3D solids and surfaces

**Body of knowledge:** C (procedures). **Discipline:** 3D CAD (solid and surface modelling).
**Status:** research, not decisions. Accessed 2026-10-23.

## How to read this note

AutoCAD is closed source. Documented behaviour comes from Autodesk help pages; an
open-source cross-check comes from the clones under `refs/` (FreeCAD `Part`, OpenSCAD,
LibreCAD for contrast).

- The help pages were fetched through a summarising tool, so quoted behaviour is
  **paraphrase**, not verbatim text.
- Labels follow the research README: **Verified** (a page we opened states it),
  **Interpretation**, **Hypothesis** (an experiment is named), **Unknown**. A claim that
  rests only on a search-result excerpt is labelled **Interpretation (snippet-only)**.
- File and line references into `refs/` were produced by the reading pass and have **not**
  been independently re-checked by the author of this note.
- No page states a numeric tolerance. No page lists literal error strings except where
  quoted. The geometry kernel is **Unknown** (one page names "ShapeManager" only under the
  Check option of SOLIDEDIT).

## Sources

Base: `https://help.autodesk.com/cloudhelp/<year>/<lang>/AutoCAD-Core/files/`.

| Key | Page (GUID) | Year |
|---|---|---|
| A-EXT | `GUID-85FD1106-8F10-4EE8-B0FB-99F1E3AEE405.htm` (EXTRUDE) | 2027 ENG |
| A-REV | `GUID-6FF936FD-99BA-432A-A43B-4573FD924AF3.htm` (REVOLVE) | 2023 |
| A-SWP | `GUID-2391CE97-3794-402C-8BC1-E2DCB452DD13.htm` (SWEEP) | 2015 |
| A-LFT | `GUID-0A041818-2E32-4212-A3D8-CE0361C3D229.htm` (LOFT) | 2023 |
| A-SUB | `GUID-14872FC1-8827-4D3B-978E-20936F9A78E5.htm` (SUBTRACT) | 2021 |
| A-INT | `GUID-904008EB-D92A-4B69-B79F-6C3A033DB3DF.htm` (INTERSECT) | 2021 |
| A-CMP | `GUID-D90ABDE8-7E62-4C4C-8EEB-7BA03430D380.htm` (composites, history) | 2021 |
| A-SLC | `GUID-27593C5E-4B89-41F2-872B-927D69517CBF.htm` (SLICE) | 2023 |
| A-MP | `GUID-CAA51229-293E-4A0C-BFF3-93226252CF13.htm` (MASSPROP) | 2020 |
| A-FIL | `GUID-606915F4-ADC1-4EAD-AC51-17A5BA5966C1.htm` (fillet, steps only) | 2021 |
| A-SE | `GUID-D54C266B-2B68-4660-ACA5-0579432F149C.htm` (SOLIDEDIT) | 2027 ENG |
| A-SH | `GUID-956A861D-00ED-48E9-88D6-8D67C2E2AD21.htm` (SOLIDHIST) | 2018 |

Open-source paths: FreeCAD `refs/freecad/src/Mod/Part/App/` (LGPL), OpenSCAD
`refs/openscad/src/geometry/` (GPL). Reading only; nothing was copied.

## Procedure records

### 1. EXTRUDE

| Field | Record |
|---|---|
| Purpose | **Verified (A-EXT):** a closed object gives a 3D solid, an open one a surface |
| Typed inputs | **Verified (A-EXT):** profile (arc, circle, ellipse, line, 2D or 3D polyline, region, spline, helix, 2D solid, 3D face, solid or surface edge or face, others; meshes need MESHEXTRUDE). Height along the UCS Z current when the object was created, or a two-point Direction that cannot be parallel to the profile plane. Taper angle -90 to +90 degrees (positive tapers inward). Path: most curves, but not regions, faces or surfaces. Mode: solid or surface. Height may be an expression |
| Outputs | **Verified:** a solid or surface (NURBS or procedural per SURFACEMODELINGMODE). **Interpretation:** a new entity; the source is deleted or kept per DELOBJ, so the profile is not mutated in place |
| Frame / units | **Verified:** UCS-relative, drawing units for height, degrees for taper. For a path, the profile is moved to the path's centroid |
| Basis | **Unknown** (closed kernel) |
| Preconditions | **Verified:** a 2D polyline with crossing segments cannot be extruded; polyline width and thickness are ignored; a path should not be coplanar with the profile or have sharp curvature |
| Tolerances | **Unknown** |
| Failure modes | **Verified:** a large taper or height can collapse the shape to a point before full height. No error strings listed |
| Effects | **Verified:** creates an object; DELOBJ governs whether source and path are deleted |
| History | No history statement on the page. **Hypothesis:** with associativity on, surfaces keep their sources (A-REV and A-SWP say so for revolve and sweep). Experiment: extrude with SURFACEASSOCIATIVITY=1, then edit the profile |
| Open source | FreeCAD `FeatureExtrusion.cpp:241-268` guards zero direction, zero length and a taper near 90 degrees against `Precision::Confusion()` and `Precision::Angular()`; `:351-358` takes the taper branch through `ExtrusionHelper::makeElementDraft` and throws "Drafting shape failed"; the plain branch is `TopoShape::makePrism`, `TopoShape.cpp:2675-2681` (`BRepPrimAPI_MakePrism`). FreeCAD keeps the recipe as properties (`Symmetric`, `TaperAngle`, `TaperAngleRev`, lines 135-140), the opposite of AutoCAD's one-shot default. OpenSCAD `linear_extrude.cc:126`, `:240-285` is a mesh slice stack with scale and twist; 2D polygons only, no taper angle, no path. LibreCAD has no 3D |

### 2. REVOLVE

| Field | Record |
|---|---|
| Typed inputs | **Verified (A-REV):** profile (arc, circle, ellipse, spline, polyline, trace, 2D solid, region, solid or surface; open or closed, planar or non-planar). Axis: two points, an object, or UCS X/Y/Z, with Reverse. Angle: counter-clockwise positive, plus a start angle. Mode: solid or surface |
| Outputs | **Verified (A-REV):** open profiles always give surfaces. A solid needs a full 360 degrees: **Interpretation (snippet-only, 2024 page)**; not in the opened 2023 page |
| Frame / units | **Verified:** UCS axes, right-hand rule, degrees |
| Preconditions | **Verified:** not inside a block; no self-intersection; polyline width ignored |
| Effects / history | **Verified:** DELOBJ deletes the source, but is ignored when associativity is on, so the source is kept (a link) |
| Tolerances, failure strings | **Unknown** |
| Open source | FreeCAD `TopoShape.cpp:2684` (`revolve`) and `:2726` use `BRepPrimAPI_MakeRevol`; a closed wire is first made into a face (`:2283`). OpenSCAD `rotate_extrude.cc:83` returns nothing for angle 0; `:104-110` builds N polygonal sections with `closed = (angle == 360)`, so it is discretised, not exact |

### 3. SWEEP

| Field | Record |
|---|---|
| Typed inputs | **Verified (A-SWP):** profile (2D or 3D spline or polyline, region, line, arc, circle, helix, face, edge sub-object); path (curve or edge). Options: Alignment (profile normal to path tangent), Base Point, Scale (uniform, start to end), Twist (total rotation), Bank (3D paths), Mode |
| Outputs | **Verified:** an open profile gives a surface; a closed one a solid or surface |
| Effects / history | **Verified:** DELOBJ deletes originals, ignored for associative surfaces |
| Failures, tolerances | **Unknown** |
| Open source | FreeCAD `TopoShape.cpp:2193` (`makeSweep`), `:2079` (`BRepOffsetAPI_MakePipeShell`), `:2129` (`makeTube`). FreeCAD exposes Frenet, trihedron, binormal and auxiliary-spine modes plus `SetTolerance(tol3d, boundTol, tolAngular)`, a transition mode and `Generated()` face-origin tracking (`BRepOffsetAPI_MakePipeShellPyImp.cpp:78-440`). OpenSCAD has no sweep |

### 4. LOFT

| Field | Record |
|---|---|
| Typed inputs | **Verified (A-LFT):** at least two cross sections, open or closed, planar or non-planar, in lofting order; a point may be first or last. Guides must intersect every section, start on the first and end on the last. A path must intersect all section planes. Continuity G0/G1/G2 and bulge apply only when LOFTNORMALS=1 (smooth fit) |
| Outputs | **Verified:** open sections give a surface; closed ones a solid or surface by Mode |
| Effects | DELOBJ decides whether originals are deleted: **Interpretation (snippet-only, 2021 task page, not A-LFT)** |
| Failures, tolerances | **Unknown** (the Loft Settings page failed to render) |
| Open source | FreeCAD `TopoShape.cpp:2594-2603` (`BRepOffsetAPI_ThruSections(isSolid, isRuled)`), throws "ThruSections failed" at `:2834`, `BRepBuilderAPI_MakeSolid` at `:2850`. Ruled and smooth modes; no guide curves or continuity setting in what was read. OpenSCAD has none |

### 5. UNION, SUBTRACT, INTERSECT

| Field | Record |
|---|---|
| Typed inputs | **Verified (A-SUB, A-INT, A-CMP):** SUBTRACT takes a "from" set and a "to subtract" set. INTERSECT takes two or more solids, surfaces or regions, grouped by coplanarity for regions. Mixed types: solid with surface via INTERSECT gives a surface; solid minus surface is disallowed; solid plus surface via UNION is disallowed; meshes must be converted first |
| Outputs | **Verified:** SUBTRACT gives "a single new 3D solid or surface"; INTERSECT a new object. **Unknown:** whether the originals persist (pages silent) |
| Failures | **Unknown:** non-overlapping intersect and coincident-face behaviour not described |
| History | **Verified (A-CMP, A-SH):** a composite records its originals only if its History property is Record, which SOLIDHIST (default 0, saved in the drawing) sets for new solids. The BREP command or History=None drops it. SHOWHIST displays it |
| Tolerances | **Unknown** |
| Open source | FreeCAD `TopoShape.cpp:1759-1888` (`cut`, `common`, `fuse` with `SetRunParallel` and `SetFuzzyValue(tolerance)`, e.g. `:1777`, `:1790`): the fuzzy value is an explicit tolerance that AutoCAD does not document. `FeaturePartBoolean.cpp:47-58` optionally validates and throws "Resulting shape is invalid"; features keep inputs as links. OpenSCAD `GeometryEvaluator.cc:175-190` (UNION, choosing Manifold or CGAL), `:444-446` (2D Clipper operators): pure over a CSG tree, no persistent result |

### 6. SLICE

| Field | Record |
|---|---|
| Typed inputs | **Verified (A-SLC):** solids and surfaces (surfaces only by planes), not meshes. Plane from 2 points, a planar object, a surface, Z axis, view, UCS plane or 3 points. Keep both sides, or pick a point on the side to keep (not on the plane) |
| Outputs | **Verified:** new solids or surfaces keeping layer and colour; the result has no history and is not associative |
| Originals | **Unknown** (page silent). At most two composite solids per input: **Interpretation (snippet-only)** |
| Open source | FreeCAD `TopoShape.cpp:1973-1977` (`slice` via `CrossSection`) returns wires, not solids, closer to SECTION; a solid split uses `BRepAlgoAPI` booleans (`FeaturePartCut`) |

### 7. SECTION

| Field | Record |
|---|---|
| Everything | A planar cut of solids, surfaces or meshes making a 2D region per object: **Interpretation (snippet-only; the page failed to render)**. All other fields **Unknown**. The only adjacent page opened was SECTIONPLANE, a live section object |
| Open source | FreeCAD `TopoShape.cpp:1907`, `:1930` (`BRepAlgoAPI_Section` wrapper with fuzzy value), `FeaturePartSection.cpp:62-70` (throws "Section failed"); yields edges and wires, not regions |

### 8. MASSPROP

| Field | Record |
|---|---|
| Typed inputs | **Verified (A-MP):** 2D regions or 3D solids |
| Outputs | **Verified:** solids give mass, volume, bounding box, centroid and inertia, with density fixed at 1.00 so mass equals volume; regions give area, perimeter, bounding box and centroid. Optional `.mpr` text file |
| Frame | **Verified:** all values are in the current UCS; multiple regions must be coplanar with the first |
| Effects | The page is silent on mutation; **Interpretation:** pure calculation |
| Failures, tolerances | **Unknown** |
| Open source | FreeCAD `TopoShape.cpp:1185-1199` (`getShapeProperties`: `BRepGProp::VolumeProperties` for solids, `SurfaceProperties` for faces). OpenSCAD: none in the files searched (**Unknown** whether elsewhere) |

### 9. FILLETEDGE, CHAMFEREDGE

| Field | Record |
|---|---|
| Inputs | **Verified (A-FIL, steps only):** pick a solid edge, enter a radius, pick more edges. Chain and loop options and chamfer Distance 1 and 2 (default 1) on edges that share a face: **Interpretation (snippet-only)** |
| Outputs, failures, history | **Unknown** (command pages failed to render) |
| Open source | FreeCAD `FeatureFillet.cpp:64`, `:109` (`BRepFilletAPI_MakeFillet.Add(r1, r2, edge)`) and `FeatureChamfer.cpp:56`, `:99` (`MakeChamfer.Add(d1, d2, edge, face)`); the chamfer needs a reference face, which matches AutoCAD's shared-face rule (**Interpretation**). OpenSCAD has none |

### 10. SHELL (SOLIDEDIT, Body)

| Field | Record |
|---|---|
| Behaviour | **Verified (A-SE):** selected faces are removed and the rest offset; a positive distance goes inward, negative outward; one shell per solid; a face is not deleted if the result would be invalid; the page advises copying the solid first |
| Effects | **Interpretation:** SOLIDEDIT edits the existing solid in place (a mutation, not a derived object) |
| Related | **Verified (A-SE):** Separate splits lumps, Clean removes redundant edges, Check validates the solid |
| Open source | FreeCAD `TopoShape.cpp:3251-3262` (`BRepOffsetAPI_MakeThickSolid.MakeThickSolidByJoin(shape, remFaces, offset, tol, mode, intersection, selfInter, join)`): exposes tolerance and join type, which AutoCAD does not |

## Classification

| Procedure | Class |
|---|---|
| MASSPROP | pure calculation (**Interpretation**; the page is silent) |
| EXTRUDE, REVOLVE, SWEEP, LOFT | derive a new entity from a profile; source consumed by DELOBJ, kept when associative (**Verified** for REVOLVE, SWEEP, LOFT) |
| UNION, SUBTRACT, INTERSECT | derived, history optional (**Verified**: SOLIDHIST) |
| SLICE | derived, no history (**Verified**) |
| SECTION | derived 2D region (snippet-only) |
| FILLETEDGE, CHAMFEREDGE, SHELL | in-place edit of a solid (**Hypothesis** for fillet and chamfer; **Interpretation** for shell) |

## Findings relevant to separating entity state from procedures

1. **Recipe memory is a per-document switch, not a property of the operation.** Composite
   solids keep component history only under SOLIDHIST=1 (default 0). The same BREP command
   that clears history also makes the result a plain body (**Verified**, A-SH, A-CMP).
   FreeCAD does the opposite: every feature stores its parameters and input links.
   Interpretation: a "derived-from" link should be an explicit optional edge in the model.
2. **DELOBJ makes "consumes inputs" a global side-effect setting.** It decides whether
   profile and path survive extrude, revolve, sweep and loft, and it is ignored when
   associativity is on (**Verified**). Interpretation: a procedure's declared effect (pure
   or consuming) should be explicit per call, not read from a drawing variable.
3. **Output kind depends on input kind and a Mode flag.** An open profile gives a surface,
   a closed one a solid or surface, and mixed solid/surface booleans are asymmetric
   (**Verified**, A-CMP, A-LFT, A-SWP). Interpretation: typed contracts need conditional or
   sum-typed outputs. FreeCAD takes the kind from the OpenCASCADE result instead.

## Not verified

- Any numeric tolerance, and the geometry kernel's role in each command.
- Literal AutoCAD error strings (no page lists them).
- Full pages for SECTION, FILLETEDGE, CHAMFEREDGE and LOFT Settings. Pages under
  `view/ACD/...?guid=` returned "Page Not Found" or empty text through the fetcher.
- Whether the originals survive UNION, SUBTRACT, INTERSECT and SLICE.
- Whether SURFACEASSOCIATIVITY affects EXTRUDE.
- The ObjectARX and .NET API (for example `Solid3d.CreateExtrudedSolid`, `BooleanOperation`):
  not opened.
- Behaviour on non-overlapping or coincident booleans; MASSPROP precision.
- FreeCAD fillet and chamfer failure handling beyond the `Standard_Failure` catch near
  `FeatureFillet.cpp:126`.
