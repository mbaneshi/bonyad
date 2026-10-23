# Procedure study: Revit (BIM elements, identity, rooms, phases, worksets)

**Body of knowledge:** C (procedures). **Discipline:** building information modelling.
**Status:** research, not decisions. Accessed 2026-10-23.

## How to read this note

Revit is closed source. Behaviour comes from the Revit API developer guide and reference,
cross-checked against IfcOpenShell (`refs/ifcopenshell/src/ifcopenshell-python/ifcopenshell/api/`,
abbreviated `api/`) and, partly, Bonsai.

- The fetch tool returns a small-model **summary** of a page, not raw text. "Verified" here
  means the page was fetched and the summary states it. A claim supported only by a search
  result is **Verified (search snippet)** in the reading pass; this note keeps that label so
  the weaker support is visible, and treats such claims as Interpretation-grade.
- A blog post (blog.autodesk.io) is Interpretation-grade evidence.
- File and line references into `refs/` come from the reading pass and were **not**
  independently re-checked by the author of this note.
- Short names: DG = `help.autodesk.com/cloudhelp/<year>/<lang>/Revit-API/files/Revit_API_Developers_Guide/...`;
  REF26 = `help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/...`.

## Common to all records

| Topic | Record |
|---|---|
| Units | Revit stores lengths in feet and other basics in metric (force, for example, in kg-ft/s²). Convert with `UnitUtils.ConvertFromInternalUnits` and `ForgeTypeId` (`UnitTypeId`, `SpecTypeId`). **Verified (search snippet):** DG 2021 and 2022 "Units". IFC contrast: units are declared in the file; `util/unit.py:873 calculate_unit_scale`, `:756 convert_unit` |
| Transactions | Regeneration and auto-join run when a model-changing transaction commits, and when `Document.Regenerate()` or `AutoJoinElements()` is called; both calls need an open transaction. A failed explicit regeneration throws `RegenerationFailedException` and must be rolled back. Only one transaction can be open at a time, with no nesting. **Verified (search snippet):** DG 2024 "Transactions" |
| Tolerance | Nothing numeric was verified for any procedure (**Unknown**) |

## Procedure records

### 1. Place a family instance and change its type

| Field | Record |
|---|---|
| Purpose | Add an occurrence of a `FamilySymbol` (a type) |
| Inputs | `Document.Create.NewFamilyInstance` has 12 overloads: place by point (optional host, level, reference direction), by curve plus level, by face or reference plus line or direction, or in a view (detail). **Verified:** REF26 `0c0d640b-7810-55e4-3c5e-cd295dede87b.htm` (overload list only) |
| Outputs | A new `FamilyInstance` element. With nested instances, the framework regenerates automatically during the call (**Verified (search snippet)**, 2025 reference) |
| Failure | The wrong overload for the category can return null silently; example: a non-structural type used for a beam creates nothing (blog.autodesk.io "Inserting a Beam": Interpretation-grade) |
| Effects | **Interpretation:** a mutation in a transaction. The type-change API (`FamilyInstance.Symbol` or `ChangeTypeId`) was not verified |
| Dependency | Nested instances regenerate; the rest is **Unknown** |
| IFC analogue | `api/root/create_entity.py:26` creates the occurrence. `api/type/assign_type.py:30` links it with `IfcRelDefinesByType` (`:256-260`; `RelatingType` at `:260`). Placement is an `IfcLocalPlacement`, not a hosting parameter. Revit puts type and instance in one element graph (Symbol property); IFC uses an explicit relationship entity |

### 2. Element identity

| Field | Record |
|---|---|
| `ElementId` | Unique per project; `Document.GetElement` returns null if the id no longer exists. **Verified:** DG 2021 General_Properties, which also says the id is "never changed in the element model" |
| Conflict | REF26 `44f3f7b1-3229-3404-93c9-dc5e70337dd6.htm` (the `ElementId` class) says ids "are subject to change during a Revit session" and should not be reused across external-command runs; for durable references it suggests a shared parameter holding an external identifier (**Verified**). **Interpretation:** treat `ElementId` as session-scoped |
| `UniqueId` | A string that works like a GUID and is unique across projects (**Verified**, DG 2021; no lifetime stated) |
| Copy | One FAQ snippet says `UniqueId`s can be duplicated when a document is created by copying another; an older FAQ says a copied wall gets a new one (**search snippet**, and the two disagree) |
| Worksharing sync | `ElementId`s may be affected; `UniqueId`s stay stable (**search snippet**, not opened) |
| Delete, undo, save | **Unknown** |
| IFC analogue | `GlobalId` is minted at creation with `ifcopenshell.guid.new()`, `api/root/create_entity.py:83`. The copy path goes through `util.element.copy` (`api/root/copy_class.py:79-82`); whether it regenerates the `GlobalId` is **Unknown** (only those lines were read) |

### 3. Parameter change and regeneration

| Field | Record |
|---|---|
| Verified part | Transaction and regeneration rules above; geometry can be unobtainable for new elements until regeneration, so commit first (search snippet) |
| Not verified | Instance versus type parameters, shared parameters, formula-driven family parameters and constraints (**Unknown**) |
| Effects | Mutation in a transaction. Regeneration is automatic on commit |
| Dependency | Dependents are recomputed on regeneration (**Interpretation**) |
| IFC analogue | `api/pset/edit_pset.py:31`, `edit_qto.py:36`. IFC stores values and does not recompute them. Type-level inheritance is resolved at read time (`util/element.py:167 get_psets`, parameter `should_inherit`). Revit has live parametric dependency; IFC has none |

### 4. Wall creation, joining and relationships

| Field | Record |
|---|---|
| Create | `Wall.Create(Document, Curve, ElementId level, bool)` makes a rectangular-profile wall on that level with the default wall type (search snippet) |
| Joins | `JoinGeometryUtils`: `AreElementsJoined`, `GetJoinedElements`, `JoinGeometry`, `UnjoinGeometry`; elements must share a common face (search snippet). Revit joins intersecting walls by default; the user can disallow a join at a wall end ("Disallow Wall Joins", search snippet). No API page for disallowing joins was found (**Unknown**) |
| Effects | Mutation in a transaction. Joins are auto-applied on commit or by `AutoJoinElements` |
| IFC analogue | `api/feature/add_feature.py:61` returns an `IfcRelVoidsElement` for openings. `api/spatial/assign_container.py:30` creates `IfcRelContainedInSpatialStructure` (`:156-161`). Revit stores joins and hosting as element state; IFC stores explicit relationship entities. No `IfcRelConnectsPathElements` creator was found under `api/` (**Hypothesis:** check Bonsai) |

### 5. Room and space area from boundaries

| Field | Record |
|---|---|
| Create | **Verified (DG 2024 PTB "Rooms"):** `NewRoom(level, UV)` creates a room at a point; `NewRoom(Phase)` creates an unplaced room that goes into a schedule; `Room.Unplace()` detaches it |
| Read-only outputs | **Verified (same page):** `Area`, `Perimeter`, `UnboundedHeight`, `Volume`, `ClosedShell`. `Volume` is 0 unless `AreaVolumeSettings.ComputeVolumes` is on |
| Boundaries | **Verified (same page):** `GetBoundarySegments` returns `IList<IList<BoundarySegment>>`, one inner list per loop; null if the room is not enclosed or is schedule-only. Walls, columns and roofs bound a room only if Room Bounding is true; room separation lines (`OST_AreaSeparationLines`) also bound. Adding a wall changes the boundary, so commit before re-reading |
| Area basis | **Verified (DG 2027 "About Room Area", GUID-9348929C...):** perimeter is measured at a computation height above the base level; the boundary location defaults to the wall finish face, with alternatives wall center, core layer and core center. Walls and columns bound by default |
| Geometry calculator | `SpatialElementGeometryCalculator` takes `SpatialElementBoundaryLocation` (finish versus centerline) and `StoredFreeBoundaryFaces`; its cache clears on any document change. Floors are almost never returned as boundary elements; door and window openings are excluded (search snippet) |
| Unbounded rooms | Only the null boundary is verified. Whether `Area` is 0 or a warning is raised is **Unknown**. The unit of `Area` (internal ft², **Interpretation**) is not stated on the page |
| IFC analogue | `api/boundary/*` (`edit_attributes`, `copy_boundary`, `remove_boundary`, `assign_connection_geometry:28`) covers `IfcRelSpaceBoundary`. Area is not computed by the api; it is stored as a quantity set (`api/pset/edit_qto.py:36`). Geometry areas come from `util/shape.py:474 get_area` and `:70 get_volume`. IFC stores the boundary relationship; Revit derives the room from walls at regeneration |

### 6. Schedules and quantity take-off

Revit side: **Unknown** (how schedules derive quantities was not verified). IFC analogue:
Bonsai `bim/module/qto/helper.py:35 calculate_faces_areas`, `:39 calculate_volumes`;
results are written with `edit_qto`.

### 7. Phases and design options

| Field | Record |
|---|---|
| Phases | Each element has `CreatedPhaseId` and `DemolishedPhaseId`. `Element.HasPhases` tells whether it has them; an `ArePhasesModifiable` check exists; `Document.Phases` lists phases and the `Phase` class has little API (search snippet) |
| Design options | **Verified (DG 2025 DEU "Design_Options"):** `Element.DesignOption` is null for main-model elements. Only one option is active per document, and the element iterator returns only the active option's elements |
| Effects | Setting phase ids is a mutation. Collector results depend on the active option (a hidden-state query). Phase-filter semantics **Unknown** |
| IFC analogue | No phase or option mechanism found under `api/`. `api/sequence/` is a work schedule, not model state. **Hypothesis:** design options map to separate IFC files or `IfcGroup`. Experiment: inspect Bonsai |

### 8. Worksets and collaboration ownership

**Verified (DG 2024 ITA "Editing_Elements_in_Worksets"):**

- Edits require ownership of the element or its workset. API changes count as user changes;
  updater changes count as system changes and are exempt.
- `WorksharingUtils.CheckoutElements` and `CheckoutWorksets` get as many as possible;
  checking out one element may pull in related ones, such as a whole group;
  `RelinquishOwnership` releases them.
- Editing an unowned element fails during the transaction; a `FailuresPreprocessor` with
  `SetClearAfterRollback` can handle it. `CheckoutElementsRequestTooLargeException` applies
  to cloud models.
- Check `GetModelUpdatesStatus` for `UpdatedInCentral` or `DeletedInCentral` before editing,
  even after a checkout.
- `Element.WorksetId` is read-only; change it through the `ELEM_PARTITION_PARAM` parameter
  (search snippet).

IFC analogue: `api/owner/` and `api/group/` exist (listed, not opened). There is no
per-element lock in IFC. **Hypothesis:** `IfcOwnerHistory` is the nearest thing. Experiment:
read `api/owner`.

### 9. `FilteredElementCollector` query model

Quick filters work on the low-memory `ElementRecord`; slow filters need the full `Element`,
so pair them with a quick one. `WhereElementIsNotElementType` and `WhereElementIsElementType`
are quick shortcuts for `ElementIsElementTypeFilter`. Some slow filters cannot be inverted,
for example `RoomFilter`, `AreaFilter` and `FamilyInstanceFilter`. Native filters should run
before LINQ (search snippet: DG 2018 "Applying_Filters"). Effects: a pure query, no
transaction. IFC analogue: `util/selector.py` (listed, not opened); the entity graph is
queried with `file.by_type`.

### 10. Rules and constraints

Revit alignment and dimension constraints and the "Check" tools: **Unknown**, not researched.
IFC analogue: `api/constraint/assign_constraint.py:26`. Its docstring says it creates an
`IfcRelAssociatesConstraint` and that constraints are "assumed (but not explicit)" to be
inherited from the type. Metrics (`add_metric.py`) hold the rule. Evaluation is separate: the
constraint only flags mismatches and does not enforce them.

## Classification

| Procedure | Class |
|---|---|
| Collector query, `GetElement`, `GetBoundarySegments`, phase and design-option reads, checkout status, `ConvertFromInternalUnits` | pure query |
| `NewFamilyInstance`, `Wall.Create`, `JoinGeometry`, `NewRoom`, `Unplace`, phase, workset and parameter set, `CheckoutElements` | mutation in a transaction (checkout is not a model transaction: **Interpretation**) |
| Room `Area`, `Perimeter`, `Volume`; wall joins on commit; nested instances; regenerated geometry and boundaries | derived (by regeneration) |

## Findings relevant to separating entity state from procedures

1. **Identity is split.** `ElementId` is session-scoped (REF26 `44f3f7b1...`) and `UniqueId`
   is the portable key. Revit's own documentation recommends an external identifier in a
   shared parameter. Interpretation: a stable Bonyad entity id independent of any CAD id,
   with the Revit ids kept as adapter aliases.
2. **Derived values (room area, boundaries, joins, geometry) are not set; Revit recomputes
   them on commit or `Regenerate`.** Query results also depend on hidden state: the active
   design option, the phase, and the computation-height setting. IFC stores outputs as
   quantity sets and boundary relationships. Interpretation: entity = stored inputs;
   procedure = typed derivation with its settings as explicit inputs, so the derived value
   can be invalidated and not stored as truth.
3. **Definition and occurrence are one graph in Revit** (Symbol plus instance, hosting,
   joins). IFC makes the link a relationship entity (`IfcRelDefinesByType`,
   `api/type/assign_type.py:256-260`) and resolves the type's properties at read time
   (`util/element.py:167`, `should_inherit`). Interpretation: model type-to-occurrence as an
   explicit relationship procedure, with inheritance resolved at read time.

## Not verified

- Per-overload exceptions and warnings for `NewFamilyInstance`, `Wall.Create` and `NewRoom`
  (the overload page had no such detail).
- Instance, type, shared and formula parameters; Revit's constraint and Check tools.
- Schedules and quantity take-off in Revit.
- `UniqueId` behaviour on delete, undo, save and copy (sources disagree on copy).
- Unbounded and redundant room outcomes, and the unit of `Room.Area`.
- Numeric tolerances for any procedure; phase-filter semantics.
- Whether `copy_class` mints a new `GlobalId` (only `copy_class.py:79-82` was read;
  `util.element.copy` was not opened).
- The FreeCAD BIM / NativeIFC analogue (not opened); Bonsai only partly sampled.
- Several claims rest on search snippets rather than opened pages (marked above); the
  `Transaction_Classes` page returned only a term list.
