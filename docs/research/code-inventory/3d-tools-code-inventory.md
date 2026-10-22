# 3D modelling tools: code-level inventory (how open-source 3D tools structure their models)

Status: **research, not decisions.** Read-only reading of shallow clones in `refs/`; nothing here changes
Bonyad's schema, dependencies or licence. Written 2026-10-22 for the founder's question: *the next
milestone covers 3D CAD entities, separated across database, procedures and presentation; how do the real
tools do it?* Follows [`cad-and-nexus-code-inventory.md`](cad-and-nexus-code-inventory.md) (format, labels and
licence conventions reused; its findings are not repeated: Nexus is 2D-only, no readable Rust solid kernel,
IfcOpenShell alignment code, QGIS TIN, LibreCAD offset).

Evidence labels: **CODE** (file, symbol, line range I opened), **DOC** (prose, comment, readme), **INFERENCE**
(my reading), **UNKNOWN** (not opened or not present on disk), **RUN** (read-only command, exact output in the
run log). Paths are relative to `refs/<tool>/` unless absolute.

## Executive summary

1. Three priority tools, three answers to "authored vs derived": **FreeCAD** keeps a typed property graph and
   persists the computed B-rep next to the recipe; **SolveSpace** keeps a small user-editable core
   (groups, requests, constraints) and regenerates everything else, but also saves the derived entities and
   solved parameters; **OpenSCAD** persists only source text and caches results in memory under a key that is
   the textual dump of the sub-tree.
2. **None of them tags a result with "inputs + procedure version" as data.** The nearest things are OpenSCAD's
   content-keyed cache (key = canonical text of the subtree, no procedure version), FreeCAD's
   `TopoShapeOpCodes::Version = 15` plus per-property element-map version check, and SolveSpace's
   `clean` flag on groups. Bonyad's manifesto rule (section 5) is stricter than all three.
3. **Identity of derived topology is the hardest unsolved-then-solved problem.** FreeCAD names faces by index
   (`Face12`) and, since the merged toponaming work, additionally by a *mapped name* that encodes the
   operation chain (`ElementMap`, `MappedName`, 40+ op codes). SolveSpace derives entity handles from
   (request, group, remap-table) integers and persists the remap table. Wings3D never reuses ids. OpenSCAD has
   no identity at all.
4. **The cleanest pure procedures are the constraint solvers** (`planegcs` in FreeCAD, `System` in SolveSpace):
   numbers and equations in, numbers plus DOF plus conflicting/redundant lists out. Both are copyleft
   (LGPL-2.1+, GPL-3.0+): reference-only unless a process boundary is justified.
5. **There is no permissive B-rep path.** Every solid operation goes through OpenCASCADE (FreeCAD), SolveSpace's
   own GPL NURBS booleans, or Manifold/CGAL meshes (OpenSCAD). Licences of OCCT, CGAL and Manifold are
   **UNKNOWN** here (not in `refs/`); only OpenSCAD's own exception for CGAL was read.
6. **IFC via Bonsai is the closest existing pattern to Bonyad's rule**: an authoritative entity graph
   (IfcOpenShell `ifc_file`), named operations (`api.geometry.add_representation`), and Blender objects as a
   *linked mirror* of IFC entities, not the other way round.
7. Every tool lets the GUI leak into the model somewhere, usually by name or by one stray field
   (section E). All three priority tools can run headless (FreeCAD App-only build, `openscad` CLI,
   `solvespace-cli`); none was executed here.
8. MeshLab's core mesh structure lives in the `vcglib` submodule, which is **empty** in this clone: the
   mesh data structure is UNKNOWN; only the filter-plugin contract could be read.
9. Disk was at 100 percent (2.6 GiB free): the only file written is this one plus one README index line.
10. Things I could not cover are listed in section 0.

**The 5 most decision-relevant findings**

| # | Finding | Why it matters for a Bonyad 3D milestone |
|---|---|---|
| 1 | FreeCAD stores recipe **and** computed `Shape` as ordinary properties of one object; `Shape` is *not* flagged `Prop_Output` (CODE `Mod/Part/App/PartFeature.cpp:97`); the authored/derived split exists only by convention | Bonyad can do better: separate tables for recipe rows and derived-result rows, with inputs and procedure version, instead of one object holding both |
| 2 | OpenSCAD's evaluator key is the **canonical text of the sub-tree** (`Tree::getIdString`, `src/core/Tree.cc:45-57`) and results are cached by that key (`GeometryCache`, 100 MB default) | A content-addressed derived-result key (hash of canonical recipe + procedure version) is proven workable and tiny; it is also the only staleness mechanism in these tools that needs no dependency graph |
| 3 | FreeCAD's topological-naming fix required an `ElementMap` per shape, `MappedName` strings carrying op codes, a `StringHasher` table in the file, and version stamps (`TopoShapeOpCode.h:49`) | If authored data ever references derived sub-shapes (face 3 of an extrusion), the cost is large. Reference authored things (profile, sketch, path), not derived topology, in the first 3D slice |
| 4 | SolveSpace separates `Sketch` (user-editable: `group`, `request`, `constraint`, `style`) from generated (`entity`, `param`) in one class (`src/solvespace.h:398-410`); `Group.clean` + `MarkGroupDirty` regenerate from the first dirty group onward (`src/generate.cpp:18-32`) | A small ordered list of "feature rows" (group = a step with a type and operand refs) plus constraints is a complete 3D authoring model; regeneration order is the list order |
| 5 | No tool has an open, readable, permissive kernel for solids; OpenSCAD-style mesh booleans (Manifold) are the lightest route, B-rep needs OCCT behind a process boundary | Supports "mesh/TIN and planar faces first, B-rep deferred" as the honest first slice (section I) |

## 0. What I could and could not read

| Source | Read | Not read / limits |
|---|---|---|
| FreeCAD (`src/App`, `src/Base`, `Mod/Part`, `Mod/PartDesign`, `Mod/Sketcher` incl. `planegcs`, `Mod/Mesh/App/Core`, `Mod/BIM`, `Mod/Import`) | Document/DocumentObject/Property headers and recompute loop; Part::Feature, TopoShape, element-map headers; PartDesign Body/Feature/Pad properties; Sketcher Constraint and SketchObject; planegcs headers; Mesh kernel headers; BIM `ArchWall.execute` head | `Mod/Draft` (listing only), `Mod/Surface`, `Mod/Points`, `Mod/OpenSCAD`, `Mod/Assembly`, `Mod/TechDraw`, `Mod/Fem`, `Mod/CAM`; OCCT itself (not in `refs/`); no build; no `.FCStd` file opened; expression grammar `Expression.y` not read |
| SolveSpace | `sketch.h`, `solvespace.h`, `param.h`, `generate.cpp` (dirty logic), `system.cpp` (Solve), `file.cpp` (save table), `group.cpp` (Remap), `groupmesh.cpp` (head), `export*.cpp` (listing and heads), `include/slvs.h`, CLI usage text | `srf/` NURBS boolean code (head of `boolean.cpp` only), constraint equation bodies (`constrainteq.cpp`), mesh/BSP code, importers; no `.slvs` sample opened |
| OpenSCAD | `core/node.h`, `primitives.h`, `enums.h`, `Tree.cc`, `GeometryEvaluator.{h,cc}` (evaluate and cache), `GeometryCache.h`, `geometry/Geometry.h`, `PolySet.h`, `Polygon2d.h`, `ManifoldGeometry.h`, `io/export.h`, `openscad.cc` flags | Parser (`parser.y`, `lexer.l`) not read; module/function evaluation (`Context`, `Value`) by listing only; `submodules/manifold`, `Clipper2` are **empty** in this clone |
| Blender (light) | `DNA_mesh_types.h`, `BKE_object_types.hh`, `DEG_depsgraph*.hh`, `DNA_modifier_types.h` heads | Depsgraph builder, evaluation scheduler, Geometry Nodes evaluator, RNA: not opened |
| IfcOpenShell + Bonsai (light) | `api/geometry/*` listing, `add_slab_representation.py`, `bonsai/core/geometry.py:54-112`, `bonsai/tool/ifc.py:298-312`, `ifcgeom/abstract_kernel.h`, `ifcgeom/kernels/` listing | `taxonomy.h` not opened; IFC schema not read; no entity-relationship walk of IfcRel* classes |
| MeshLab (light) | `FilterPlugin` interface, `MeshModel` mask enum, `common/` listing | `vcglib` (the actual mesh structure and algorithms) is an empty submodule: **UNKNOWN**; filter plugin bodies not read |
| Wings3D (light) | `wings.hrl` (`we`, `edge` records), `e3d.hrl` (mesh), `wings_ff_wings.erl` save/load lines | Operation modules (`wings_extrude_face.erl` etc.) listed only |
| Behaviour | Nothing executed. No build, no test, no file conversion | All claims are static readings |

## A. Entity / object catalogue

### A1. FreeCAD (commit `d3f4da7`, version 27.1.0)

| Layer | Type | Fields / role | Ownership | Evidence |
|---|---|---|---|---|
| Base | `App::DocumentObject` | `Label`, `Label2`, `ExpressionEngine`, `Visibility`; numeric `_Id`; status bits (`Touch`, `Error`, `Recompute`, `Freeze`...) | Document owns objects; objects reference each other by `PropertyLink*` | CODE `src/App/DocumentObject.h:141-168`, `:61-84` (ObjectStatus), `:1518` (`_Id`) |
| Base | `App::Property` family | `PropertyString/Bool/Float/Placement/Link/LinkSub/LinkList/ExpressionEngine/...`; per-property type bits `Prop_ReadOnly, Transient, Hidden, Output, NoRecompute, NoPersist, Input` | A property belongs to exactly one container | CODE `src/App/PropertyContainer.h:57-75`; `src/App/Property.h:100-135`; link family `src/App/PropertyLinks.h:113,667,797,913,1072` |
| Geometry feature | `App::GeoFeature` | adds `Placement` (position + rotation) | | CODE `src/App/GeoFeature.h:57` |
| Geometry feature | `Part::Feature` | adds `PropertyPartShape Shape`, `ShapeMaterial` | **owns** a `TopoShape` value | CODE `Mod/Part/App/PartFeature.h:67,76-77`; `PartFeature.cpp:94-100` |
| Kernel value | `Part::TopoShape : Data::ComplexGeoData` | wraps OpenCASCADE `TopoDS_Shape` (`ShapeProtector _Shape`) plus `ElementMap`, `Tag`, `Hasher` | value; shape owns sub-shapes (vertex, edge, wire, face, shell, solid, compsolid, compound as OCCT `TopAbs_*`) | CODE `Mod/Part/App/TopoShape.h:285`, `:3078`; `Mod/Part/App/TopoShape*.pyi` per-type wrappers (listing) |
| Primitive | `Part::Box` etc. | e.g. `Length, Width, Height` (defaults 10.0) | recipe only; result in inherited `Shape` | CODE `Mod/Part/App/FeaturePartBox.cpp:41-43` |
| Parametric | `PartDesign::Body` | `AllowCompound`, group of features, tip | owns an ordered feature list (`Group`) | CODE `Mod/PartDesign/App/Body.cpp:48`; `Body.h` (Tip/insertion helpers at `:68-143`) |
| Parametric | `PartDesign::Feature` | `BaseFeature` (link to previous feature), `_Body`, `SuppressedShape` | references previous feature | CODE `Mod/PartDesign/App/Feature.cpp:113-126` |
| Parametric | `PartDesign::ProfileBased` | `Profile` (link to sketch), `Midplane`, `Reversed`, `UpToFace`... | **references** the sketch | CODE `Mod/PartDesign/App/FeatureSketchBased.cpp:93-100` |
| Parametric | `PartDesign::Pad` | `SideType, Type, Type2, Length, Length2, UseCustomVector, ReferenceAxis, StartType, StartOffset, UpToFace, UpToShape, Offset, TaperAngle(2)` | | CODE `Mod/PartDesign/App/FeaturePad.cpp:54-111`; `execute()` = `buildExtrusion(MakeFace | MakeFuse)` at `:121-124` |
| Add/sub | `FeatureAddSub` | `AddSubShape`, `Operation` | | CODE `Mod/PartDesign/App/FeatureAddSub.cpp:52-53` |
| Sketch | `Sketcher::SketchObject` | `Geometry` (list), `Constraints` (list), `ExternalGeometry`, `FullyConstrained` (Output, ReadOnly), `Exports`, `InternalShape`, `MakeInternals`; private `geoLastId` | **owns** its geometry and constraints | CODE `Mod/Sketcher/App/SketchObject.cpp:188-230`; `SketchObject.h:1236` |
| Sketch geometry | `Part::Geom*` (`GeomPoint`, `GeomLineSegment`, `GeomCircle`, `GeomArcOfCircle`, ellipse/hyperbola/parabola and arcs, `GeomBezierCurve`, `GeomBSplineCurve`, surfaces: plane, cylinder, cone, sphere, torus, Bezier/BSpline, extrusion, revolution, offset...) | OCCT `Geom_*` wrappers, `Base::Persistence` | value objects held by the sketch | CODE `Mod/Part/App/Geometry.h:86,164,204,288,317,448,588,620,851,882,942-1329` |
| Sketch constraint | `Sketcher::Constraint` | `Type`, `Name`, `Value`, `First/Second/Third` (geo ids) + `FirstPos/SecondPos/ThirdPos` (point positions), `isDriving`, `isInVirtualSpace`, `AlignmentType` | references geometry **by integer geo id** within the sketch | CODE `Mod/Sketcher/App/Constraint.h:52-77` (22 types incl. `Coincident, Horizontal, Vertical, Parallel, Tangent, Distance, DistanceX/Y, Angle, Perpendicular, Radius, Diameter, Equal, PointOnObject, Symmetric, InternalAlignment, SnellsLaw, Block, Weight`), `:232-278` |
| Sketch ids | `GeoEnum` | fixed ids: `RtPnt = -1` (root point), H/V axes negative, `GeoUndef = -2000`; geometry also carries a persistent `Id` via an extension | | CODE `Mod/Sketcher/App/GeoEnum.h:73-77`; `SketchGeometryExtension.h:74-107` |
| Mesh | `Mesh::MeshObject` over `MeshCore::MeshKernel` | `MeshPointArray`, `MeshFacetArray`; `MeshFacet` (indices + neighbours) | indexed triangle mesh | CODE `Mod/Mesh/App/Core/MeshKernel.h:65`, `:91-104`; `Elements.h:105,278,445,697,755` |
| BIM | `Arch::Component` (Python) wall, floor, site...; IFC class as property `IfcType` | Python `Proxy` object holds `execute(obj)` | extrusion of a `Base` shape | CODE `Mod/BIM/ArchComponent.py:177,197,1205-1240`; `ArchWall.py:504`; `App/FeaturePython.h:189,465` (Proxy) |

Identity: `_Id` is a per-document integer (`DocumentObject.h:258-260`); `Label` is user-facing and mutable;
the unique `Name` (e.g. `Pad001`) is a string. Units: base length unit is **mm** (`Base/Unit.h:38-40`,
`Base/Quantity.h:212`); `PropertyUnits.h` attaches a `Base::Unit` to float properties. Frames: each
`GeoFeature` has a `Placement` relative to its container; sketches are placed by attachment
(`Part2DObject`, `AttachExtension`; listing only).

### A2. SolveSpace (commit `30e1c3a`, version 3.3)

| Type | Fields | Role | Evidence |
|---|---|---|---|
| `Param` | `h`, `val`, `known`, `free` (+ solver-only `substd`) | one scalar unknown; handle = (request index << 16 or group) \| param index | CODE `src/param.h:13-37` |
| `Group` | `type` (DRAWING_3D 5000, DRAWING_WORKPLANE 5001, EXTRUDE 5100, LATHE 5101, REVOLVE 5102, HELIX 5103, ROTATE 5200, TRANSLATE 5201, LINKED 5300), `subtype`, `opA`, `opB` (operand groups), `meshCombine` (UNION/DIFFERENCE/ASSEMBLE/INTERSECTION), `visible`, `suppress`, `relaxConstraints`, `allowRedundant`, `valA/B/C`, `predef`, `remap`, `name`; **derived**: `polyLoops`, `bezierLoops`, `thisShell`, `runningShell`, `thisMesh`, `runningMesh`, `displayMesh`; **status**: `clean`, `solved{how,dof,remove}`, `booleanFailed` | one ordered *step* of the model: a sketch plane or a 3D feature; **mixes authored and derived fields in one class** | CODE `src/sketch.h:165-340` |
| `Request` | `type` (WORKPLANE 100, DATUM_POINT 101, LINE_SEGMENT 200, CUBIC 300, CUBIC_PERIODIC 301, CIRCLE 400, ARC_OF_CIRCLE 500, TTF_TEXT 600, IMAGE 700), `extraPoints`, `workplane`, `group`, `style`, `construction`, text/font/file | what the user *asked to draw*; generates entities and params | CODE `src/sketch.h:366-410` |
| `EntityBase` / `Entity` | `type` (POINT_IN_3D 2000, POINT_IN_2D 2001, POINT_N_* copies 2010-2014, NORMAL_* 3000-3012, DISTANCE 4000-4001, FACE_* 5000-5006, WORKPLANE 10000, LINE_SEGMENT 11000, CUBIC 12000/12001, CIRCLE 13000, ARC_OF_CIRCLE 14000, TTF_TEXT 15000, IMAGE 16000), `group`, `workplane`, `point[12]`, `normal`, `distance`; numeric cache `actPoint`, `actNormal`, `actDistance` | **generated** from requests and group operations | CODE `src/sketch.h:414-470`, `:566-615` |
| `Constraint` | `type` (about 47: POINTS_COINCIDENT 20, PT_PT_DISTANCE 30 ... PT_ON_CIRCLE 100, ANGLE 120, PARALLEL 121, PERPENDICULAR 122, tangent 123-125, EQUAL_RADIUS 130, WHERE_DRAGGED 200, COMMENT 1000), `group`, `workplane`, `valA`, `valP`, `ptA, ptB, entityA..D`, `other, other2`, `reference` (driven dimension), `comment` | references entities by handle | CODE `src/sketch.h:652-750` |
| `Sketch` | `group`, `groupOrder`, `constraint`, `request`, `style` (**user-editable**); `entity`, `param` (**generated**) | the whole document | CODE `src/solvespace.h:398-410` (comments at 399 and 408) |

Identity (CODE `src/sketch.h:75-125`): `hGroup` = index; `hRequest` = index; `hEntity` = (request index << 16) \|
entity index; `hParam` = (request index << 16) \| param index. Entities produced by group operations (extrude,
step-and-repeat) get handles from `hGroup::entity(i)` where `i` comes from a per-group `remap` table
(`Group::Remap`, `src/group.cpp:864-876`, hard limit 2^16 entities per group, with a comment that the
limit lifts when handles become 64-bit). Units: coordinates are stored in the file in model units; CLI text says
"the unit is mm" for exports (DOC `src/platform/entrycli.cpp:33`); `viewUnits`/`MmPerUnit` are view settings
(CODE `src/solvespace.h:528,543`). Frames: 3D points are in the file's world frame; 2D points live on a
`WORKPLANE` entity (origin point + normal quaternion).

### A3. OpenSCAD (commit `7bbf603`)

| Stage | Type | Fields | Evidence |
|---|---|---|---|
| Source | `.scad` text: modules, functions, assignments, `$fn/$fa/$fs` special variables | the only authored artefact | UNKNOWN for grammar (parser not read); DOC `src/core/CurveDiscretizer.h:29-84` on `$fn` |
| AST node | `AbstractNode` (children, `modinst`, per-tree `idx`) | tree built by instantiating modules (`SourceFile::instantiate`, `src/core/SourceFile.cc:183`) | CODE `src/core/node.h:31-71` |
| Leaf nodes | `CubeNode(x,y,z,center)`, `SphereNode`, `CylinderNode`, `PolyhedronNode(points, faces)`, `SquareNode`, `CircleNode`, `PolygonNode`; also `TextNode`, `ImportNode`, `SurfaceNode` | recipe parameters, no geometry | CODE `src/core/primitives.h:43-144` |
| Op nodes | `TransformNode`, `CsgOpNode` (`OpenSCADOperator`: UNION, INTERSECTION, DIFFERENCE, MINKOWSKI, HULL, FILL, RESIZE), `CgalAdvNode`, `LinearExtrudeNode`, `RotateExtrudeNode`, `ProjectionNode`, `OffsetNode`, `RoofNode`, `ColorNode`, `RenderNode` | | CODE `src/core/enums.h:4`; `CgalAdvNode.h:9`; visitor list `src/geometry/GeometryEvaluator.h:30-49` |
| Evaluated geometry | `Geometry` abstract base: `PolySet` (3D polygon soup: `indices`, `vertices`, optional per-polygon colours), `Polygon2d` (outlines), `CGALNefGeometry`, `ManifoldGeometry` (wraps `manifold::Manifold` + `originalIDs` + colour map), `GeometryList` | derived values | CODE `src/geometry/Geometry.h:22-73`; `PolySet.h:23-27`; `Polygon2d.h:29-46`; `manifold/ManifoldGeometry.h:23-37,80-81` |

Identity: node `idx` is "mostly (only?) for debugging" per the source comment (CODE `src/core/node.h:33-36`).
Manifold's `originalIDs` track which input a face came from, used for colour (INFERENCE from
`ManifoldGeometry.h:29-30,80-81`). Units: **none in the language**; STL has none; the 3MF exporter takes a unit
option (`io/export_enums.h:28-35`, CODE `io/export_3mf_v2.cc:348-350`). Frames: Cartesian, right-handed,
transforms are 4x4 matrices applied by `TransformNode` (INFERENCE from `Transform3d` in `Geometry.h:46`).

### A4. Secondary tools

| Tool | Type | Fields / role | Evidence |
|---|---|---|---|
| Blender | `Mesh` (DNA struct) | `id`, counts `verts_num, edges_num, faces_num, corners_num`, `face_offset_indices`, four `CustomData` attribute sets (`vert_data, edge_data, face_data, corner_data`) | CODE `source/blender/makesdna/DNA_mesh_types.h:149-195` |
| Blender | `ModifierData` | `type`, `mode`, `flag`, plus a persistent per-object identifier "stable across sessions; same on original and evaluated; unchanged on rename or reorder" | CODE `DNA_modifier_types.h:169-191` (identifier comment at 188-191) |
| Blender | `NodesModifierData.node_group` | Geometry Nodes tree reference | CODE `DNA_modifier_types.h:2545-2547` |
| Blender | `Object_Runtime` | `data_orig`, `data_eval`, `bounds_eval`, `geometry_set_eval` | CODE `source/blender/blenkernel/BKE_object_types.hh:76-94` |
| IFC (IfcOpenShell) | IFC entity instances (`IfcWall`, `IfcExtrudedAreaSolid`, `IfcArbitraryClosedProfileDef`, `IfcAxis2Placement3D`, `IfcCartesianPoint`, `IfcDirection`...) created through `file.create_entity` | recipe-level solids with profile, placement, depth | CODE `src/ifcopenshell-python/ifcopenshell/api/geometry/add_slab_representation.py:126-152` |
| IFC | operation namespace `api.geometry.*`: `add_representation, add_wall_representation, add_slab_representation, add_boolean, clip_solid, edit_object_placement, assign_representation, regenerate_wall_representation, connect_wall ...` | named operations over a model | CODE listing `src/ifcopenshell-python/ifcopenshell/api/geometry/` |
| MeshLab | `MeshModel` with attribute bit-mask (`MM_VERTCOORD 0x1 ... MM_FACEFACETOPO 0x40000`) | which per-vertex/face attributes are allocated | CODE `src/common/ml_document/mesh_model.h:76-96` |
| Wings3D | `#we{}` winged-edge record: `es` (edges array), `fs` (faces), `vp` (vertex positions), `vc` (vertex-to-incident-edge), `he` (hard edges), `mat`, `next_id` ("we never re-use IDs"), `holes`; `#edge{vs, ve, lf, rf, ltpr, ltsu, rtpr, rtsu}` | pure functional topology | CODE `src/wings.hrl:170-193, 233-241` |
| Wings3D | `#e3d_mesh{type, vs, vc, tx, ns, fs, he, matrix}` and `#e3d_face{vs, vc, tx, ns, mat, sg, vis}` | indexed exchange mesh | CODE `e3d/e3d.hrl:40-59` |

## B. Authored vs evaluated; recompute; persistence

| Aspect | FreeCAD | SolveSpace | OpenSCAD | Blender | IFC/Bonsai |
|---|---|---|---|---|---|
| Authored | Property values of each object (including `Constraints`, `Geometry`, `Pad.Length`, expressions) | `Group`, `Request`, `Constraint`, `Style` rows and the group's authored fields | `.scad` text | Original datablocks (`Mesh`, modifier stack) | IFC entity graph |
| Derived | `Part::Feature.Shape` (TopoShape + element map), `AddSubShape`, `SuppressedShape`, sketch `Shape`, `FullyConstrained` | `Entity`/`Param` (generated), `Group.thisShell/thisMesh/runningShell/runningMesh/displayMesh`, `polyLoops`, `solved{}` | `Geometry` values (`PolySet`, `ManifoldGeometry`, `Polygon2d`) | Evaluated object: `data_eval`, `geometry_set_eval` on a **copy** (copy-on-evaluation) | Blender mesh per representation (cache, linked by `IfcStore.link_element`) |
| Marker of "derived" | Type bits exist (`Prop_Output`, `Transient`, `NoPersist`) but `Shape` uses none of them | Comment in `Sketch` class ("These are generated from the above"); no type-level marker | Separate class hierarchy (AST vs `Geometry`) | Separate object (evaluated copy) with `data_orig` back-pointer | Separate store |
| Dirty/recompute | `Touch` bit; `mustExecute()` + `ExpressionEngine.isTouched()`; topological sort by `getDependencyList(DepSort)`; **two passes** "to allow some form of dependency inversion"; failed object filters its dependants | `Group.clean`; `MarkGroupDirty` marks the group **and every later group** dirty; `GenerateAll(DIRTY\|ALL\|REGEN\|UNTIL_ACTIVE)` re-solves from first dirty | No dirty state; whole tree re-evaluated per render, sub-tree results reused via content key | Depsgraph with relations; tags; `DEG_get_original` maps back | Application-level: Bonsai marks objects "edited" and writes back lazily (CODE `tool/ifc.py:305-312`) |
| Cache | Result is the persisted property itself | Persisted derived entities in `.slvs` (see F) | In-memory LRU `GeometryCache` (100 MB default) keyed by sub-tree text; separate `CGALCache` | Evaluated copy lives in session | Mirror lives in session |
| Evidence | CODE `src/App/Document.cpp:2855-3010` (recompute), `:3264-3319` (`_recomputeFeature`), `:2671` (`getDependencyList`), `:3194-3223` (cycle message); `src/App/DocumentObject.cpp:282-310` | CODE `src/generate.cpp:13-32,156-221`; `src/system.cpp:515-629`; `src/solvespace.h:682-695` | CODE `src/geometry/GeometryEvaluator.cc:78-113,371-380`; `src/core/Tree.cc:45-57`; `GeometryCache.h:10-40` | CODE `BKE_object_types.hh:76-94`; `DEG_depsgraph_query.hh:125-137` | CODE `bonsai/core/geometry.py:54-112` |

FreeCAD detail (CODE `Document.cpp:2925-3010`): objects are sorted topologically; each is asked
`mustRecompute()` (`Freeze` -> false; `Enforce` -> true; else `mustExecute() > 0`, which checks
`ExpressionEngine.isTouched()` and extensions, `DocumentObject.cpp:282-310`); `_recomputeFeature` runs the
expression engine for non-output properties, then `Feat->recompute()`, then output expressions, catching C++
exceptions per object and logging `(object, reason)` in a recompute log (`:3264-3319`). After a successful
recompute, dependants are *enforced* (`enforceRecompute`), or in fine-grained mode only when the specific
property edge was touched (`getInListProp`). Result: a **staleness flag** (touch), not a staleness
**comparison** (no stored input hash).

SolveSpace detail (CODE `generate.cpp:18-32`): the model is an ordered list of groups; dirtiness is
monotone along that list. `GenerateAll` solves each dirty group in order (`SolveGroup`), regenerates the group's
shell/mesh (`Group::GenerateShellAndMesh`, `groupmesh.cpp:212`) and **degrades gracefully**: if the NURBS boolean
fails, `booleanFailed` is set and the group falls back to mesh (CODE `groupmesh.cpp:213-214,415-416`,
`sketch.h:Group::booleanFailed`; `forceToMesh` field).

OpenSCAD detail (CODE `GeometryEvaluator.cc:78-113`): `evaluateGeometry` first asks `smartCacheGet` (key =
`tree.getIdString(node)`, a canonical dump of the subtree), else traverses with a visitor, then inserts the raw
result. The result is converted to a `PolySet` on demand (and tessellated if non-convex); this conversion is
*not* cached because "it would conflict with subsequent calls where allownef is true" (comment at `:93-95`).

Hard facts for Bonyad's "authoritative vs derived" rule:

- INFERENCE: of the six tools, only OpenSCAD and Blender (evaluated copy) keep derived results in structurally
  separate objects. FreeCAD and SolveSpace mix them in one object, and both pay for it (FreeCAD's persisted
  `Shape` makes files large and ties file compatibility to OCCT/brep and element-map versions; SolveSpace has
  to save derived entities because linked files read them without regenerating, see F).
- No tool records *which procedure version* produced a result, except FreeCAD for element names
  (`TopoShapeOpCodes::Version = 15`, CODE `Mod/Part/App/TopoShapeOpCode.h:49`; check on restore at
  `PropertyTopoShape.cpp:449-520`).

## C. Identity and stability

| Tool | Scheme | What breaks | Evidence |
|---|---|---|---|
| FreeCAD, objects | `Name` (unique string) and `_Id` (int) per document | renaming `Label` is cosmetic; links are by pointer in memory, by name in XML | CODE `DocumentObject.h:258-260,1518` |
| FreeCAD, sub-shape (classic) | **Index names** `Vertex3`, `Edge12`, `Face7` (`IndexedName` = type name + positive int) derived from OCCT traversal order | any upstream edit that changes traversal order re-labels downstream references: the "topological naming problem" | CODE `src/App/IndexedName.h:42-57` (design); DOC (class comment) |
| FreeCAD, sub-shape (current) | `ElementMap` per shape maps `MappedName` to `IndexedName`; `MappedName` = immutable "data" part + mutable "postfix"; names encode op codes (`FUS, CUT, CMN, XTR, FLT, CHF, OFS, RVL, LFT, SWP, MIR, SKT`... 40+), tags and history; postfix markers `;:H, ;:T, ;:X, ;:C, ;:I, ;:U`; missing reference prefix `?`; element history is traceable (`getElementHistory`, `traceElement`) | A name can become "missing" (`?`); the map version must match the algorithm version | CODE `src/App/ElementMap.h:80`; `MappedName.h:56`; `ElementNamingUtils.h:50-70` (constants, `MISSING_PREFIX` at `:57`); `ComplexGeoData.h:387-401,510,584`; `TopoShapeOpCode.h:49-93` |
| FreeCAD, persistence of names | A `StringHasher` table is written into the document; `Document.xml` carries `StringHasher="1"`; the table file is `StringHasher.Table` | Without it, mapped names are not restorable. A source comment cites an upstream bug where persisting this table forced a writer assertion to be removed (issue #27489) | CODE `Document.cpp:1118-1135`, `:1245-1280`; DOC comment at `:1128-1133` |
| FreeCAD, hard lessons recorded in code | Comments mark the merge: "Toponaming April 2024 Deprecated in favor of TopoShape method" (`PartDesign/App/Feature.h:175`, `FeatureSketchBased.h:110,130,137`); "Toponaming migration, February 2024" note on removed helpers (`TopoShape.h:2950-2958`); "original Toponaming branch by realthunder" (`TopoShape.h:118,126`) | the fix lived in a long-running external branch before merging | DOC |
| FreeCAD, sketch | geometry/constraints by **list index** (`First`, `Second`), root and axes at negative fixed ids; plus a separate persistent geometry `Id` and `geoLastId` counter | deleting geometry renumbers indices; constraints are rewritten (INFERENCE from the two schemes coexisting) | CODE `Constraint.h:275-278`; `GeoEnum.h:73-77`; `SketchObject.h:1236` |
| SolveSpace | structured integer handles; derived entities via `Group::remap` persisted in the file (`Group.remap`, type `M`) | 16-bit limit per group (assert with message); changing the *request* set changes handles | CODE `sketch.h:75-125`; `group.cpp:864-876`; `file.cpp:121` |
| OpenSCAD | none; node `idx` is per-tree and "mostly for debugging" | n/a (no references survive, there are none) | CODE `node.h:33-37,66` |
| Blender | `ModifierData` persistent identifier (stable across sessions, same on original and evaluated, survives rename and reorder); `ID` datablocks by name + library; evaluated copies mapped back by `DEG_get_original` | | CODE `DNA_modifier_types.h:188-191`; `DEG_depsgraph_query.hh:125-137` |
| IFC | `GlobalId` (22-char GUID) on rooted entities, plus STEP `#id` instance ids in the file (INFERENCE from IFC schema knowledge; **UNKNOWN**: not opened in the clones) | | UNKNOWN |
| Wings3D | numeric ids per vertex/edge/face; `next_id` "needed because we never re-use IDs" | | CODE `wings.hrl:185-188` |

## D. Constraints, parameters, and the solver boundary

| Aspect | FreeCAD Sketcher + planegcs | SolveSpace | OpenSCAD |
|---|---|---|---|
| Constraint as data | `Sketcher::Constraint` row: type enum, geo ids, point positions, `Value`, `isDriving` (driven = reference) | `ConstraintBase` row: type enum, entity handles, `valA`, `valP` (a param handle), `reference` flag | none |
| Parameter expressions | General: `PropertyExpressionEngine` maps `ObjectIdentifier` -> `ExpressionInfo` on every object (`std::map`), executed before and after `recompute()` (CODE `App/PropertyExpressionEngine.h:123,332-360`; `Document.cpp:3264-3290`); a lexer/parser in `Expression.l/.y` (listing) | Dimensions are numbers; a constraint's `valP` can point at a param; equations are `Expr` trees internally (`expr.h`; listing) | Expressions are the language itself |
| Solver | `GCS::System` in `Mod/Sketcher/App/planegcs/`; algorithms `BFGS, LevenbergMarquardt, DogLeg` (CODE `GCS.h:62-67`); `diagnose()` computes DOF, conflicting, redundant and partially-redundant tags (CODE `GCS.h:140-145,632-672`) | `System::Solve`: substitution of trivial equations, Jacobian, Newton with damping, rank test (`TestRank`), `FindWhichToRemoveToFixJacobian`; hard cap `MAX_UNKNOWNS = 2048` | n/a |
| Inputs | geometry parameters (as `double*`), constraints with tags | `ParamList`, `EntityList`, equations from constraints | |
| Outputs | updated parameters; `SolveStatus` {Success, Converged, Failed, SuccessfulSolutionInvalid} (CODE `GCS.h:53-58`); `dofs`; lists of conflicting/redundant tags; sketch-level `lastDoF, lastHasRedundancies, lastConflicting, lastRedundant, lastMalformedConstraints` (CODE `SketchObject.h:726-778,1176-1187`); `FullyConstrained` output property | `SolveResult` {OKAY 0, DIDNT_CONVERGE 10, REDUNDANT_OKAY 11, REDUNDANT_DIDNT_CONVERGE 12, TOO_MANY_UNKNOWNS 20} (CODE `solvespace.h:46-52`); `dof` out-param; `bad` list of constraint handles (CODE `system.cpp:515-629`) | |
| Failure modes | over-constrained (conflicting), redundant, malformed, not converged, solution invalid | didn't converge (lists unsatisfied constraints), redundant-but-OK, too many unknowns; DOF is suppressed per group when `suppressDofCalculation` or redundancy allowed | |
| Purity of boundary | `planegcs` includes only `Base/Console.h`, `Base/Tools.h`, Eigen, boost (RUN R5) -> near-pure; `Sketch.cpp` adapts `Part::Geometry` <-> GCS geometry (CODE `Sketch.h`, `Sketch.cpp:4964 Sketch::solve`) | `System` writes results back to global `SK.param` inside `Solve` (CODE `system.cpp:603-612`), so it is a procedure with a side effect on the document, not a pure function | |
| Stable C API | none (C++/Python only) | **yes**: `include/slvs.h` defines `Slvs_System` in/out: params, entities, constraints, `failed[]`, `dof`, `result`; `Slvs_Solve(sys, group)`; types listed as `SLVS_C_*`/`SLVS_E_*` (CODE `include/slvs.h:51-112,176-211,500`) | |

INFERENCE: SolveSpace's `slvs.h` is the only existing "solver as pure function with a flat C ABI" in the
set; its data model (params, entities with point handles, constraints with entity handles, a `failed` list and
`dof`) is essentially a table schema. It is GPL-3.0 (see H).

## E. Separation: data model, procedures, persistence, presentation

| Tool | Data model | Procedures | Persistence | Presentation | Where it leaks | Headless |
|---|---|---|---|---|---|---|
| FreeCAD | `src/App`, `src/Base` | `Mod/*/App` (OCCT-based) | `Document::Save/saveToFile` + per-property `Save/SaveDocFile` | `src/Gui`, `Mod/*/Gui` view providers | (1) `Document.cpp` signals are labelled "essentially the boundary between the App and Gui namespaces" (CODE `Document.h:210-222`); (2) `Document::saveToFile` calls `signalSaveDocument(writer)` so the Gui writes `GuiDocument.xml` into the same zip (CODE `Document.cpp:2056-2060`); (3) PartDesign App features return the **string** `"PartDesignGui::ViewProviderPython"` (CODE `PartDesign/App/Feature.cpp:695`, `FeatureAddSub.cpp:210`, `FeatureRefine.cpp:127`); (4) `App::Application` mentions `QApplication` strings (CODE `Application.cpp:2461`, `MergeDocuments.cpp:86`); (5) Python `Proxy` objects in features mean logic lives in saved scripts (`FeaturePython.h:189,465`) | **Yes**: `src/Main/MainCmd.cpp` (FreeCADCmd) builds with App only (CODE listing of `src/Main`; build not run) |
| SolveSpace | `sketch.h`, `solvespace.h` classes | `system.cpp`, `constraint*.cpp`, `srf/`, `polygon.cpp`, `mesh.cpp` | `file.cpp` table-driven text | `ui.h`, `draw*.cpp`, `platform/gui*` | (1) `Entity` carries `screenBBox`, `edges`, `beziers` draw caches and `Draw()` (CODE `sketch.h:566-612`); (2) `Constraint.disp` (offset, style) stored in the constraint row; (3) `Group.displayMesh/displayOutlines` and `visible` live in `Group`; (4) global `SS` singleton | **Yes**: `solvespace-cli` (CODE `src/platform/entrycli.cpp:46-54,318`: `export-view`, `export-wireframe`, `export-mesh`, `export-surfaces`, `regenerate`); `libslvs` (`include/slvs.h`) |
| OpenSCAD | `core/*Node`, `Value`, `Context` | `geometry/*`, `geometry/cgal`, `geometry/manifold` | none (text file) | `src/gui`, `glview` | `AbstractPolyNode::render_mode_e { RENDER_CGAL, RENDER_OPENCSG }` puts a renderer choice in the model class (CODE `core/node.h:90-97`); `ModuleInstantiation` flags like `isBackground()` | **Yes**: the `openscad` binary with `-o file.stl` etc.; backend flag `--backend CGAL\|Manifold` (CODE `openscad.cc:888-890,1025`) |
| Blender | `makesdna` (plain structs saved verbatim) | `blenkernel`, `bmesh`, `geometry`, `modifiers`, `nodes` | `blenloader` + DNA reflection (file stores DNA struct definitions: DOC `doc/blender_file_format`) | `editors`, `draw`, `gpu` | `ModifierData.ui_expand_flag`, `layout_panel_open_flag` stored in the data struct (CODE `DNA_modifier_types.h:179-185`) | yes (`--background`; UNKNOWN: not opened) |
| IFC / Bonsai | IFC entity graph in `ifcopenshell.file` | `ifcopenshell.api.*` (named operations), `ifcgeom` kernels | IFC-SPF text file | Blender add-on (`bonsai`) | Bonsai `core/*` is written against abstract `tool.*` interfaces to keep Blender out (CODE `bonsai/core/geometry.py:54-66`) | yes (library) |
| MeshLab | `MeshDocument`, `MeshModel` | `FilterPlugin` objects with declared requirement and post-condition masks | project file + filter scripts (`filter_history`) | Qt GUI | Filters can need a GL context (`FilterPlugin` doc) | `meshlabserver` / pymeshlab (UNKNOWN) |
| Wings3D | `#we{}` records (immutable Erlang terms) | `wings_*.erl` ops | `term_to_binary(..., [compressed])` with a header (CODE `wings_ff_wings.erl:1284,1372`) | wx/OpenGL | hard-edge and material info live in the same record | no (UNKNOWN) |

Process-boundary note (INFERENCE, supports H): each priority tool exposes a command-line or C-ABI route that
takes a file and returns a file or numbers. The Bonyad Rust server could call them as a **subprocess** without
linking, which is the usual way to keep copyleft out of a permissive core. Not tested.

## F. File formats

| Format | Structure | Persists | Lossless for | Loses / caveats | Evidence |
|---|---|---|---|---|---|
| **FCStd** | zip containing `Document.xml` (objects, properties, `<Document SchemaVersion="4" ProgramVersion=... StringHasher="1">`), `GuiDocument.xml`, `StringHasher.Table`, and one extra file per shape property (`*.brp` BREP text or `.bin` binary when `SaveBinaryBrep`) | **Everything**: recipe, expressions, computed shapes and element maps, Python proxy references | Authored model and the cached shapes | Needs the same module classes at load; Python features need their modules; cached shapes depend on OCCT BREP format and element-map version | CODE `Document.cpp:1118-1135,2025-2060`; `PropertyTopoShape.cpp:387-445,731-760` |
| **.slvs** | Text file, header `\xb1\xb2\xb3SolveSpaceREVa` then repeated blocks `Group.* ... AddGroup`, `Param.* AddParam`, `Request.* AddRequest`, `Entity.* AddEntity`, `Constraint.* AddConstraint`, `Style.* AddStyle`; field list in a single table (`SAVED[]`, types `x` hex, `d` int, `f` float, `b` bool, `S` string, `P` path, `c` colour, `M` remap) | Authored rows **and** generated entities (with numeric `actPoint`, `actNormal`, `actDistance`) and solved `Param.val`; **not** shells or meshes | Sketch and constraints; table-driven so schema is explicit | Derived NURBS shells and meshes are recomputed on load; linked files read the saved entities | CODE `src/file.cpp:10,89-171,172-215,303-346` |
| **.scad** | UTF-8 source | Everything the user wrote | Recipe | No geometry; results depend on the evaluator version and `$fn/$fa/$fs` | UNKNOWN for grammar |
| STL (ASCII/binary), OBJ, OFF, WRL, 3MF, DXF, SVG, PDF, PNG, POV, CSG text, AST, NEF3 | exporters per format | meshes or 2D outlines | n/a | STL: triangle soup, no units; 3MF has units (`micron, millimeter, centimeter, meter, inch, foot`) and colour/material options | CODE `src/io/export.h:28-47`; `export_enums.h:28-40` |
| SolveSpace exports | STL, OBJ, three.js, VRML (mesh); **STEP** (NURBS surfaces, `ExportSurfacesTo`), DXF/SVG/EPS/PDF/HPGL/G-code (2D views, per-code listing) | derived | | STEP export writes surfaces and curves; no feature history | CODE `src/export.cpp:811,866,901,951,1132`; `exportstep.cpp:631` |
| FreeCAD exports | STEP, IGES, glTF via `Mod/Import/App/Writer{Step,Iges,Gltf}.cpp`; BREP `exportBrep`; STL `exportStl(file, deflection)` | derived shapes | | no parametric history in STEP/IGES/STL (INFERENCE; formats carry no history) | CODE `Mod/Import/App/` listing; `Mod/Part/App/TopoShape.h:518-522` |
| IFC SPF | entity graph text | recipe-level geometry (extrusion, profile, boolean) or tessellated | | | CODE `add_slab_representation.py:126-152` |
| `.wings` | `term_to_binary` of the shape list, 32-bit size header | records incl. hard edges, materials | | Erlang-term versioning; not an exchange format | CODE `wings_ff_wings.erl:37-39,1372` |
| `.blend` | DNA structs written with reflection; DNA is stored in the file | everything incl. modifiers | | | DOC `doc/blender_file_format/` |

## G. Procedures and kernels

| Procedure family | Provider in the tool | Dependency | Licence (as far as read) | Could Bonyad call it from Rust? |
|---|---|---|---|---|
| B-rep booleans, extrusion, revolve, loft, sweep, fillet, chamfer, offset, thicken | FreeCAD `TopoShape::makeElement*` over OpenCASCADE (`makeElementPrism, makeElementOffset, makeElementBoolean, makeElementFuse`; op codes `FUS, CUT, CMN, XTR, RVL, LFT, SWP, FLT, CHF, OFS, THK`) | OCCT (C++), not in `refs/` | FreeCAD code LGPL-2.1+ (SPDX in headers); OCCT licence **UNKNOWN** here | Process boundary only (FreeCADCmd/Python script or STEP/BREP files); not FFI-friendly. Reference for operation list and parameters |
| 2D sketch solving | planegcs (FreeCAD) / `System` (SolveSpace) | Eigen, boost / Eigen | LGPL-2.1+ / GPL-3.0+ | Reference only; or `libslvs` as a separate process (GPL-3). The previous inventory's candidate `ezpz` (MIT) remains the permissive option |
| NURBS (rational polynomial) shell booleans, trimmed surfaces, STEP export | SolveSpace `src/srf/*` (`boolean.cpp`, `surface.cpp`, `ratpoly.cpp`, `surfinter.cpp`, `triangulate.cpp`) | self-contained | GPL-3.0+ | Reference only (readable, ~one team's code; head of `boolean.cpp` read) |
| Mesh booleans | OpenSCAD `geometry/manifold/*` (Manifold), `geometry/cgal/*` (CGAL Nef) | Manifold (submodule, empty here), CGAL | OpenSCAD GPL-2.0 with CGAL linking exception (CODE `COPYING:1-12`); Manifold and CGAL licences **UNKNOWN** here | Manifold is a C++ library with permissive reputation (**UNKNOWN: verify before relying**); Rust bindings exist (**UNKNOWN**). Process boundary via `openscad -o x.stl` is available |
| 2D polygon clipping/offset | OpenSCAD `ClipperUtils.cc` over Clipper2 | Clipper2 (submodule, empty) | **UNKNOWN** | Rust `clipper2` ports exist (**UNKNOWN**) |
| Mesh algorithms (decimation, curvature, cylinder fit, segmentation, set operations) | FreeCAD `Mod/Mesh/App/Core/*`; MeshLab filters | self-contained; vcglib (empty) | LGPL-2.1+ (FreeCAD, SPDX at `MeshKernel.h:1`); MeshLab GPL-3.0 (`LICENSE.txt:1-2`) | Reference only |
| Mesh topology edits | Wings3D `wings_*` over winged-edge records | Erlang | Wings licence is a permissive "any purpose" grant with notice retention (CODE `license.terms:1-14`, Tcl-style) | Reference (algorithms for extrude/bevel/dissolve on winged-edge), reimplement |
| IFC geometry to kernel | IfcOpenShell `ifcgeom` abstract kernel: `convert_impl(taxonomy::{matrix4, point3, direction3, line, circle, ellipse, bspline_curve, edge, loop, shell, face, extrusion, ...})`; kernels `opencascade`, `cgal`, `manifold`, `passthrough`; `supports_boolean_operations()` | OCCT/CGAL/Manifold | LGPL-3.0 | Reference: an explicit **intermediate "taxonomy"** between the IFC entity model and any kernel is the pattern to read (CODE `ifcgeom/abstract_kernel.h:63-112`; `taxonomy.h` not opened) |

Dependencies of the tools themselves are mostly large C++ frameworks (Qt, OCCT, CGAL, Eigen, boost); a Rust
process cannot reuse them without FFI, and none provides a C ABI except SolveSpace `slvs.h`.

## H. Reuse verdicts

Bonyad licence: `LicenseRef-Undecided` (previous inventory, citing `logic/Cargo.toml:7`). Rule applied:
**copyleft (GPL/LGPL/AGPL) = reference-only, unless a process boundary is justified**.

| Component | Licence (file read) | Verdict | Reason |
|---|---|---|---|
| FreeCAD document model (`App`) | LGPL-2.1+ | **Read as reference** | Property/touched/recompute design is instructive; C++/Qt-flavoured and tied to the Python runtime. Do not link |
| FreeCAD `TopoShape`, element map, op codes | LGPL-2.1+ | **Read as reference**; **reimplement the idea** only if derived topology becomes referenced | The naming scheme is a research result in itself; cost is high |
| FreeCAD Sketcher data (constraint list), `planegcs` | LGPL-2.1+ | **Read as reference** | A constraint list is easy to model as rows; solver reference only. Permissive alternative: `ezpz` (MIT, per previous inventory), after an experiment |
| FreeCAD as an external tool (FreeCADCmd for STEP/BREP conversion or as a test oracle) | LGPL-2.1+ | **Process boundary justified** as optional oracle/converter, not as a dependency | Keeps licence out of the core; untested here |
| SolveSpace (all), `libslvs` | GPL-3.0+ (`COPYING.txt`; `README.md:356`) | **Read as reference only**; `slvs.h` ABI is a good data-contract sketch. Optional **external process** for comparison runs | GPL-3 incompatible with a permissive core |
| SolveSpace NURBS code | GPL-3.0+ | **Read as reference only** | The only readable NURBS boolean/STEP-export code in the set |
| OpenSCAD (language, evaluator, exporters) | GPL-2.0 + CGAL exception (`COPYING`) | **Read as reference**; CLI usable as an **external process** | Evaluation pipeline and content-keyed cache are worth copying as ideas |
| Manifold, Clipper2 | **UNKNOWN** (empty submodules) | **Not decided**: verify licences and Rust bindings in a separate step | Mesh boolean and 2D clip are the most practical permissive building blocks, if the licence check passes |
| OpenCASCADE, CGAL | **UNKNOWN** (not in `refs/`) | **Not decided** | Needed to answer "B-rep via process boundary" |
| Blender | GPL-2.0-or-later (`DEG_depsgraph.hh:3` SPDX; `COPYING`: "Apart from the GNU GPL, Blender is not available under other licenses") | **Read as reference only** | Copy-on-evaluation and `data_orig/data_eval` are the pattern |
| IfcOpenShell, Bonsai | LGPL-3.0+ (`COPYING.LESSER`; module headers) | **Read as reference**; IFC as the **exchange format**; library as an optional **external test oracle** | Operation naming (`api.geometry.*`) and mirror-with-link pattern |
| MeshLab | GPL-3.0 (`LICENSE.txt`) | **Read as reference only** (filter contract) | vcglib not present: algorithms unreadable here |
| Wings3D | permissive, notice retention (`license.terms`) | **Read as reference**; **reimplement** winged-edge ideas if a half-edge mesh is needed | Only permissively licensed 3D modeller in the set |
| STEP/IGES/STL/OBJ/OFF/3MF/glTF as formats | open formats | **Use as exchange formats** | Interfaces, not code |

## I. Implications for a Bonyad 3D milestone (INFERENCE, not decisions)

What the tools say about a minimal first 3D slice, using Bonyad's rules (concrete types first, no EAV, one
executable owner per procedure, definition vs instance, authored vs derived, propose then accept):

1. **Entity kinds that are enough to prove the 3D path** (candidates):
   - `point3` (x, y, z), `segment3` (two owned endpoints, as today's `line` owns its endpoints),
   - `planar_face` (ordered owned boundary vertices in 3D plus an owned or derived plane),
   - a **recipe** entity such as `extrusion` (profile = reference to a planar sketch/face, direction, depth),
   - a **mesh/TIN** entity (vertices + triangle index table) as the derived/imported result type.
   B-rep (`solid`, `shell`, `edge`, `wire` with topology) deferred: no readable permissive kernel exists, and
   every tool pays heavily for sub-shape identity (finding 3).
2. **Recipe vs evaluated result** (sketch only): *definition rows* (extrusion parameters; referenced profile
   entity id; unit, frame) vs *derived-result rows* (mesh or face set) carrying `input_hash`,
   `procedure_id`, `procedure_version`, `computed_at`, and a status (`ok|failed|stale`), so staleness is a
   comparison, not a flag. OpenSCAD's content key (hash of the canonical recipe) and FreeCAD's version stamp are
   the two proven halves; neither tool has both. Procedure owner: one Rust function per operation, as the
   manifesto says; no second implementation in SQL.
3. **Authoring order**: SolveSpace's ordered `group` list and FreeCAD's `BaseFeature` chain both show that a
   feature tree is an ordered list where each step names its operand(s). A single table of ordered feature
   rows with typed per-kind tables (as the first slice does for point/line/surface) fits; no generic property
   bag (the FreeCAD `Property` family is exactly what the manifesto forbids as a universal store).
4. **Constraints** (milestone 3 of the paved path, not 3D itself): rows with a type enum, entity references and
   an optional value, plus a separately computed result (`dof`, `conflicting[]`, `redundant[]`, `status`).
   Both `planegcs` and `slvs.h` return exactly those outputs, so the result row shape is validated by two tools.
5. **Units and frames**: FreeCAD fixes the base unit to mm in `Base`; SolveSpace has none in the model;
   OpenSCAD has none. Bonyad's `unit='m'` and `frame='local-cartesian'` checks are *stricter* than any of them,
   and a 3D slice needs a stated handedness and axis convention (not found stated in any tool's model header:
   **UNKNOWN**).
6. **What each tool would warn against**:
   - FreeCAD: referencing derived topology by index; mixing recipe and result in one object type; GUI strings in
     App classes; a Python proxy that makes saved data executable.
   - SolveSpace: 16-bit handle packing and a global singleton; presentation fields (`disp.offset`,
     `displayMesh`) in model rows; a solver that writes into the global document.
   - OpenSCAD: no identity and no units, so no result can be referenced after edit.
   - Blender: tying the saved format to in-memory struct layout (needs DNA reflection to survive).
   - IFC/Bonsai: letting the mirror (Blender object) become the source of truth during editing (the "edited"
     flag and lazy write-back is a staleness window).
   - Wings3D: ids that cannot be reused is a good rule; a single record that holds geometry and material and
     hard edges mixes concerns.
7. **Process boundary**: converters/oracles (`openscad`, `freecadcmd`, `solvespace-cli`) can sit behind a
   Rust procedure that writes a derived-result row, which keeps "one executable owner per procedure" even when
   the computation is external. Untested.

## J. Contradictions and gaps

### J1. Contradictions

| Between | Contradiction | Note |
|---|---|---|
| Bonyad manifesto section 3 ("authoritative data and derived results" kept apart) vs FreeCAD and SolveSpace | Both persist derived geometry beside authored data, deliberately (FreeCAD: shapes + element maps; SolveSpace: entities for linked files) | Reasons are speed of load and element-name stability (INFERENCE). Bonyad would need an explicit "derived results table" and a rule for when they are discarded |
| Manifesto "result tied to inputs and procedure version" vs all tools | Only a flag (`Touch`, `clean`) or a content key (OpenSCAD) | No tool stores the pair (inputs, procedure version) |
| FreeCAD `Prop_Output` bit vs `Part::Feature.Shape` | Output flag exists in the type system, unused for the main derived property | CODE `PropertyContainer.h:57-75` vs `PartFeature.cpp:97` |
| FreeCAD `PartDesign` sketch references vs "owned geometry" | A `Pad` **references** a sketch (which owns its geometry); the first-slice rule says "a surface owns its boundary" | Consistent with Bonyad if the sketch is a separate entity kind and the recipe references it |
| SolveSpace comment "known/convenience: part is entirely described by the entities" (CODE `sketch.h:566-580`) vs `Sketch` comment (user-editable vs generated) | Generated entities are persisted because a linked file must be readable without re-solving | Cost of the shortcut is visible in `Entity` carrying draw caches |
| OpenSCAD manual-style "no persistent state" vs 3MF colour/material options | Evaluator tracks `originalIDs` and colours inside Manifold geometry, i.e. provenance exists inside the derived value | CODE `ManifoldGeometry.h:29-30,80-81` |
| FreeCAD "Toponaming" status: classic index names still exist and are used in `getTopoShape(..., NoElementMap)` (CODE `PartFeature.cpp:909`) | Two naming schemes coexist | Migration is incomplete in places (INFERENCE from "Toponaming migration" notes) |

### J2. Gaps (absent in everything I read)

| Gap | Detail |
|---|---|
| Procedure-version stamping on derived results | Only FreeCAD element-map version exists |
| Explicit authored/derived marker as data | Only conventions and comments |
| A stored 3D **axis/handedness convention** and unit in the model | Not found in FreeCAD/SolveSpace/OpenSCAD model headers (UNKNOWN: not exhaustively searched) |
| A permissive, readable B-rep kernel | None in `refs/` |
| Constraint solver in Rust | Only the MIT `ezpz` from the previous inventory |
| 3D constraints (assembly/part mating) | SolveSpace does 3D point/plane constraints; FreeCAD `Mod/Assembly` has its own solver: **UNKNOWN** (not read) |
| MeshLab/vcglib mesh algorithms | Submodule empty |
| Manifold, Clipper2, OCCT, CGAL licences | Not on disk |
| Behaviour of any tool | Nothing executed |
| FreeCAD `Mod/Draft`, `Surface`, `Points`, `Assembly`, `TechDraw`, `CAM`, `Fem` | Not read |
| Blender depsgraph internals; Geometry Nodes evaluator | Not read |
| IFC schema classes (`IfcRel*`, property sets) as modelled by `ifcopenshell` | Not walked; relationships/Psets question (part of the brief) is therefore **only answered at the API-name level** |

## Source, commit and licence log

| Source | Path | Pinned commit (RUN `git -C <dir> rev-parse HEAD`; date from `git log -1`) | Licence (file read) |
|---|---|---|---|
| FreeCAD | `/Users/bm/sub-biz/bonyad/refs/freecad` | `d3f4da791daa9e94f340b81770d13f090ec679c6` (2026-10-21; `version.json` major 27) | `LICENSE` (LGPL 2.1 text); SPDX `LGPL-2.1-or-later` in `App/Document.cpp:1`, `TopoShape.h:1`, `planegcs/GCS.h:1`, `MeshKernel.h:1` |
| SolveSpace | `.../refs/solvespace` | `30e1c3ac0beb77fe3e098315b1bb662840ddc99a` (2026-10-20; CMake `VERSION 3.3`) | `COPYING.txt` GPL v3; `README.md:356` "GPL v3 or later" |
| OpenSCAD | `.../refs/openscad` | `7bbf603833e167712e9cc7ae3432001dc26817d0` (2026-10-18) | `COPYING`: GPL v2 plus a CGAL linking exception (lines 1-12). Submodules `manifold`, `Clipper2`, `mimalloc`, `OpenCSG` listed in `.gitmodules` but **empty** |
| Blender | `.../refs/blender` | `6421771fd4d65965a2259e14d222f4913f192d03` (2026-10-21) | `COPYING` (GPL; "not available under other licenses", line 7); SPDX `GPL-2.0-or-later` in `DEG_depsgraph.hh:3` |
| IfcOpenShell | `.../refs/ifcopenshell` | `f827c42b68558a6a0686105d6b2d45f3c1196942` (2026-10-21) | `COPYING.LESSER` LGPL v3; Python headers "LGPL v3 or any later version" (same as previous inventory) |
| MeshLab | `.../refs/meshlab` | `71e7b0b53cd98f520f84cb17b31bac6f1ef947cc` (2026-07-24; `ML_VERSION` 2025.07) | `LICENSE.txt` GPL v3. `src/vcglib` is empty |
| Wings3D | `.../refs/wings3d` | `db8cc3b7f1ba32fe24a819859860f5df8e0e782c` (2026-10-16) | `license.terms` (permissive: use, copy, modify, distribute for any purpose, notice retained) |
| Previous inventory | `docs/research/code-inventory/cad-and-nexus-code-inventory.md` | n/a | n/a |
| Bonyad | `/Users/bm/sub-biz/bonyad` | branch `dev`, `f8bd022` at session start | `LicenseRef-Undecided` (per previous inventory) |
| Not opened | `refs/{godot,librecad,o3de,opensees,projectlibre,qgis,xc}` | | not part of this inventory |

## Run log (read-only commands executed)

| Id | Command | Result |
|---|---|---|
| R1 | `for d in refs/*/; do git -C $d rev-parse HEAD; done` | commits as in the log above |
| R2 | `df -h .` (in `bonyad`) | `/dev/disk3s1 926Gi 881Gi 2.6Gi 100%` |
| R3 | `ls refs/openscad/submodules/manifold refs/openscad/submodules/Clipper2` | both directories empty |
| R4 | `ls refs/meshlab/src/vcglib \| wc -l` | `0` |
| R5 | `grep -h "#include" planegcs/*.h planegcs/*.cpp \| sort -u` (in `freecad/src/Mod/Sketcher/App`) | project includes limited to `../../SketcherGlobal.h`, `Constraints.h`, `GCS.h`, `Geo.h`, `qp_eq.h`, `SubSystem.h`, `Util.h`, `<Base/Console.h>`, `<Base/Tools.h>`, `<FCConfig.h>`, `boost_graph_adjacency_list.hpp`, boost graph and math headers; Eigen; standard library |
| R6 | `grep -n "ADD_PROPERTY" Mod/Part/App/PartFeature.cpp` | `97: ADD_PROPERTY(Shape, (TopoDS_Shape()));` (no `Prop_Output` type argument) |
| R7 | `grep -n "SaveBinaryBrep\|putNextEntry" src/App/Document.cpp` region 2025-2060 | `writer.putNextEntry("Document.xml")` and `writer.setMode("BinaryBrep")` conditional |
| R8 | `ls refs/freecad/src/Main` | `CMakeLists.txt core-main.dox ... FreeCADGuiPy.cpp ... MainCmd.cpp MainGui.cpp MainPy.cpp` |
| R9 | `grep -n "export-view\|export-wireframe\|export-mesh\|export-surfaces\|regenerate" src/platform/entrycli.cpp` (in solvespace) | usage lines `:46-54` and branches `:250,275,290,305,318` |
| R10 | `grep -n "backend" src/openscad.cc` (in openscad) | `888-889` help text "3D rendering backend to use: 'CGAL' (old/slow) or 'Manifold' (new/fast) [default]"; `1025` option read |
| R11 | `sed -n` / `grep -n` over the files named in each CODE label | content as summarised; no file modified |

## Questions for the founder

1. **Permissive core?** The conclusions in H assume copyleft is reference-only. If a copyleft core (GPL-3) is acceptable, SolveSpace's solver and NURBS code and FreeCAD's `planegcs` become dependency candidates and the 3D milestone shrinks a lot.
2. **Mesh first or B-rep early?** The evidence supports (planar faces, extrusion recipe, mesh/TIN) first and B-rep behind a process boundary later. Do you accept that B-rep is out of the first 3D milestone?
3. **May derived results get their own tables** (inputs + procedure version + status), or do you want them to live next to the recipe as FreeCAD and SolveSpace do?
4. **Do you want me to verify the missing licences** (Manifold, Clipper2, OpenCASCADE, CGAL) by fetching their repositories into `refs/` in a separate step (disk is at 2.6 GiB free)?
5. **Axis and handedness convention** for 3D (z-up right-handed assumed): should the milestone state it as a project property next to `unit` and `frame`?
