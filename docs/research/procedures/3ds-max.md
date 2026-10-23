# Procedure study: 3ds Max (modifier stack, poly editing, controllers, identity)

**Body of knowledge:** C (procedures). **Discipline:** 3D modelling and animation.
**Status:** research, not decisions. Accessed 2026-10-23.

## How to read this note

3ds Max is closed source. Behaviour comes from Autodesk help, MAXScript and SDK pages,
cross-checked against Blender (`refs/blender/source/blender/modifiers`, `bmesh`, `depsgraph`),
MeshLab and Wings3D under `refs/`.

- **V-page** means a page was opened with the fetch tool (a summarising tool: paraphrase).
  **V-snip** means the claim comes from an Autodesk search-result excerpt that was not opened
  in full. V-snip is weaker evidence than V-page. Forum hits and `knowledge.autodesk.com`
  were not used.
- Labels otherwise follow the research README (**Interpretation**, **Hypothesis**,
  **Unknown**).
- Pages that failed to load: the "Editing the Stack" pages returned "Help." only (2023 GUID
  `B6B1F918...`) or HTTP 503 (knowledge.autodesk.com); the 2025 stack right-click page was a
  404; `docs.autodesk.com` (SDK v16) had a certificate error. So **no stack-collapse or
  instanced-modifier claim is V-page**.
- Line references into `refs/` come from the reading pass and were **not** independently
  re-checked by the author of this note.

## Common to all records

| Topic | Record |
|---|---|
| Units | The default system unit is 1 inch, and generic units equal inches; display units differ from system units. V-snip: `help.autodesk.com/cloudhelp/2025/ENU/3DSMax-Customizing/files/GUID-69E92759-6CD9-4663-B993-635D081853D2.htm` |
| Time | Stored as integer ticks, `TIME_TICKSPERSEC = 4800`. V-snip: `help.autodesk.com/cloudhelp/2025/ENU/MAXDEV-CPP-API-REF/maxtypes_8h.html` |
| Z-up | **Unknown** from the documentation (no hit). **Hypothesis:** 3ds Max is Z-up. Experiment: create a Box and read its height axis in MAXScript. Blender is Z-up (**Interpretation**) |
| Tolerances | Mostly **Unknown** unless stated |

## Procedure records

### 1. Modifier stack

| Field | Record |
|---|---|
| Purpose | Non-destructive procedural history applied to a base object |
| Inputs | A base object (parametric or editable), an ordered modifier list, and a per-modifier `ModContext` |
| Output | An evaluated `ObjectState` (the pipeline result) |
| Basis | The SDK has `Modifier::ModifyObject` on an `IDerivedObject`. Object-space modifiers are called with `node == NULL` and world-space modifiers with a non-NULL node. `ChannelsUsed` and `ChannelsChanged` declare which data channels a modifier reads and writes. `IDerivedObject` has add, replace and `GetModContext` operations. V-snip: `help.autodesk.com/view/MAXDEV/2025/ENU/?guid=topology_modifiers` and `help.autodesk.com/cloudhelp/2017/ENU/Max-SDK/cpp_ref/class_i_derived_object.html` |
| Assumptions | Stack order matters (**Interpretation**, standard behaviour); modifiers declare their channel needs |
| Failure modes | **Unknown** |
| Effects | A pure derive from the base object plus the stack. Collapse To and Collapse All flatten to an editable object and lose parametric adjustment (V-snip, 2023 "Editing the Stack"). Instanced modifiers appear in italics; Make Unique converts one to a unique copy (V-snip). Whether collapsing preserves instance links is **Unknown** (the only evidence is a forum thread, which is not evidence) |
| Invalidation | Re-evaluation is triggered by `REFMSG_CHANGE` or when the object's validity interval does not cover the current time. `LocalValidity` is used for caching, not to decide whether `ModifyObject` runs. V-snip: `help.autodesk.com/cloudhelp/2022/ENU/Max-Developer-Help/cpp_ref/class_modifier.html` |
| Open source | Blender `ModifierTypeInfo` and `mesh_calc_modifiers` (`blenkernel/intern/mesh_data_update.cc:274`); `BKE_modifier_is_enabled` checks at `:342` and `:376`; `BKE_modifier_modify_mesh` called at `:225`; a mode flag (Realtime or Render, `:298`) gates each modifier. Difference: in Blender the base mesh data is an ID and the evaluated copy lives in the depsgraph's copy-on-write copy; in 3ds Max, per-channel validity intervals drive caching, whereas Blender uses dependency-graph tags (**Interpretation**) |

### 2. Editable Poly operations (Extrude, Bevel, Inset, Chamfer, Weld, Attach, Collapse)

| Field | Record |
|---|---|
| Purpose | Topology edits on a poly base object |
| Inputs | A sub-object selection (vertex, edge, border, polygon) plus dialog or drag parameters (height, inset amount, chamfer amount). Exact parameter schemas **Unknown** |
| Outputs | A mutated poly mesh |
| Basis | Edit Geometry rollout. Attach merges other scene objects into the selected poly object and converts non-mesh objects to editable poly. Collapse welds a selection to its centre. V-snip: `help.autodesk.com/cloudhelp/2026/ENU/3DSMax-Modeling/files/GUID-8DA624B4-32AB-473A-B5B4-77B8934DAE1B.htm`. Chamfer treats borders identically; Inset affects only the outer edges of a polygon selection; Extrude applies equally to all selected polygons; Edge Extrude can weld only border edges with a single attached polygon (V-snip, 2023/2024 help) |
| Tolerances | Weld has a threshold but its value is **Unknown** |
| Effects | Destructive: it mutates the Editable Poly base. The Edit Poly modifier is the stack-recorded variant, with Model and Animate modes (V-snip: `help.autodesk.com/cloudhelp/2016/ENU/3DSMax/files/GUID-1230619A-8CB3-4411-B07D-C133716F61F9.htm`) |
| Invalidation | Any edit changes the base, so the whole stack above is re-evaluated (**Interpretation**) |
| Open source | Blender bmesh operators are declared in `bmesh/intern/bmesh_opdefines.cc`: `extrude_face_region` `:1562`, `inset_individual` `:2775`, `inset_region` `:2810`, `bevel` `:2588`, `remove_doubles` `:517`, `mirror` `:438`, `symmetrize` `:3053`. Implementations: `bmo_inset_region_exec` at `bmo_inset.cc:669`, `bmo_bevel_exec` at `bmo_bevel.cc:21`. Each takes named typed slots and tags output geometry in a slot map. Wings3D weld is `wings_body.erl:875` (tolerance argument at `:881`), on a persistent winged-edge (`#we`) structure with undo. Difference: Blender and Wings expose typed operator contracts with explicit slots; the 3ds Max contract is **Unknown** (the MAXScript `polyop` interface was not examined) |

### 3. Boolean and ProBoolean

| Field | Record |
|---|---|
| Purpose | Combine meshes by Union, Intersection, Subtraction, Merge, Attach or Insert; ProBoolean also has Imprint and Cookie. V-snip: `help.autodesk.com/cloudhelp/2026/ENU/3DSMax-Modeling/files/GUID-7621338C-661E-4A8E-9CC5-87DC8420D51A.htm` |
| Inputs | Operand A (base) plus one or more operand B objects; the operation mode is an enum |
| Output | A combined mesh. Imprint only adds edges to the base object (V-snip) |
| Effects | ProBoolean is a compound object and keeps operands (**Interpretation**). Autodesk recommends the Boolean modifier for procedural work (V-snip: `help.autodesk.com/view/3DSMAX/2024/ENU/?guid=3DBEB7C2-43CC-4B78-9463-5DD448FD921C`) |
| Failures, tolerances | **Unknown**. **Hypothesis:** non-manifold operands fail or give artefacts. Experiment: test on open meshes |
| Open source | Blender `MOD_boolean.cc`, `modify_mesh` at `:529`, `modifierType_Boolean` at `:693`. MeshLab `src/meshlabplugins/filter_mesh_booleans/filter_mesh_booleans.cpp` (not opened). Wings3D `wings_bool.erl` (weld `:492`, `inset_face` `:855`; not studied in depth). Difference: Blender's modifier references the operand object, which enters the depsgraph as a relation |

### 4. TurboSmooth and subdivision

| Field | Record |
|---|---|
| Inputs | Iterations (default 1, range 0 to 10), Render Iters (a separate render value), Isoline Display. MAXScript properties `iterations`, `renderIterations`, `useRenderIterations`, `isolineDisplay`. V-snip: `help.autodesk.com/cloudhelp/2015/ENU/MAXScript-Help/files/GUID-05FAC300-EED9-4999-8B9F-4EE4E87E19A4.htm` |
| Cost | Up to about four times the faces per iteration (V-snip). Autodesk advises turning Isoline Display off before collapsing (V-snip), which shows display state can leak into collapsed results |
| Effects | Stack-recorded; derived |
| Open source | Blender `MOD_subsurf.cc`, `modify_mesh` at `:192`, `modifierType_Subsurf` at `:446`. Both keep separate viewport and render levels |

### 5. Shell and Push

**Unknown.** The search found only a table-of-contents entry for Shell and nothing for Push;
no official parameter page was verified. **Hypothesis:** Shell adds thickness (inner and
outer amounts) and Push offsets vertices along normals. Experiment: apply each to a Box and
read the modifier properties. Open source: Blender solidify, `MOD_solidify.cc`, `modify_mesh`
at `:56`, `modifierType_Solidify` at `:237`.

### 6. Symmetry and Mirror

| Field | Record |
|---|---|
| Purpose | Mirror a mesh about X, Y or Z, optionally slicing and welding along the seam. V-snip: `help.autodesk.com/view/3DSMAX/2024/ENU/?guid=FFA6B09E-BBEC-40D7-B951-F84CB7251A4B` |
| Behaviour | Edits made below the Symmetry modifier in the stack also appear on the mirrored half (V-snip), so symmetry is derived from upstream authoring and is not stored geometry |
| Effects | Stack-recorded; derived |
| Open source | Blender `MOD_mirror.cc`, `modify_mesh` at `:118`, `modifierType_Mirror` at `:225`; its `update_depsgraph` (`:54`, `:55`) adds a relation to the mirror object's transform. The bmesh mirror operator is a destructive variant (`bmesh_opdefines.cc:438`) |

### 7. Transform hierarchy and pivots

| Field | Record |
|---|---|
| Inputs | Node TM (4x4, world, inherits the parent), object-offset TM, parent link |
| Documented relationships | `GetNodeTM` returns the world matrix including parent inheritance but excluding the object offset and space warps. `ObjectTM = ObjectOffsetTM * NodeWorldTM`, and the object TM is not inherited. Moving the pivot alters the node TM and compensates in the object offset. V-snip: `help.autodesk.com/cloudhelp/2021/ENU/Max-Developer-Help/developer/3ds_max_sdk_features/modeling/transformation_and_rotation/using_the_node_and_object_offset.html` and the `INode` class reference |
| Effects | A pivot edit mutates two authored transforms with no visible geometry change. Link constraint and Link behaviours are not verified (**Unknown**) |
| Open source | Blender stores `Object.parentinv` (`DNA_object_types.h:551`, `:686`) as the parent-inverse matrix, which plays a similar role to the offset TM; the pivot is an object origin with no separate offset (**Interpretation**) |

### 8. Animation controllers

| Field | Record |
|---|---|
| Inputs | `TimeValue` (integer ticks, 4800 per second; 200 ticks per frame at 24 fps per the MAXScript docs, V-snip) |
| Documented API | `Control::GetValue(t, void* val, Interval& valid, method)` returns the value and narrows the validity interval. `SetValue` has a commit flag; `CommitValue` and `RestoreValue` make or discard temporary values. **V-page:** `help.autodesk.com/cloudhelp/2025/ENU/MAXDEV-CPP-API-REF/class_control.html` (the page text had no interval or revision details; only the first 100,000 of 243,247 characters were read) |
| Intervals | Start at `FOREVER` and intersect with each animated parameter; Max skips queries inside the interval (V-snip: SDK "Lesson 4: Animation Controllers" and "Intervals") |
| Time versus revision | No revision counter was found in the documentation (**Unknown**). The staleness test is validity-interval membership plus `REFMSG_CHANGE` (see record 1). **Interpretation:** Max uses time-interval validity where Blender uses tag-based invalidation |
| Open source | Blender depsgraph tagging (`depsgraph/intern/depsgraph_tag.cc`, `ID_RECALC_GEOMETRY` at `:147`), `deg_graph_flush_updates` (`eval/deg_eval_flush.cc:308`), `BKE_object_eval_transform_final` (`object_update.cc:114`) |

### 9. Skin and skeleton deformation

| Field | Record |
|---|---|
| Documented | Each bone gets a capsule envelope. Vertex weights sum to 1.0. Rigid Vertices assigns each vertex wholly to one bone. Dual-quaternion skinning avoids volume loss under twist. V-snip: `help.autodesk.com/cloudhelp/2021/ENU/3DSMax-Modifiers/files/GUID-5C7FB2B6-5CD6-461D-8E56-03D153E80145.htm` |
| Effects | A stack-recorded deform. Bone transforms are inputs from other nodes, so the result depends on the bones' node TMs at time t. The bind-pose storage format is **Unknown** |
| Open source | Blender `MOD_armature.cc`, `modifierType_Armature` at `:244`; `update_depsgraph` adds relations to the armature object's pose evaluation (`:108`) and transform (`:111`, `:113`) |

### 10. Object identity and clone

| Field | Record |
|---|---|
| Handle | `node.handle` is a unique id; `maxOps.getNodeByHandle` looks it up. Use `inode.handle` to avoid a base-object property named `handle`. **V-page:** `help.autodesk.com/cloudhelp/2022/ENU/MAXScript-Help/files/3ds-Max-Objects-and-Interfaces/Node-MAXWrapper/Node-Common-Properties-Operators/GUID-40BD721E-9323-4FCF-8ABB-19E8EA92C675.html`. The page says nothing about persistence across save and load, reuse, or clone |
| Reuse | V-snip (AnimHandle page, `help.autodesk.com/cloudhelp/2016/ENU/MAXScript-Help/files/GUID-25211F97-E81A-4D49-AFB6-50B30894FBEB.htm`): handles are never reused after deletion. It covers the AnimHandle system generally, not nodes specifically |
| Name uniqueness | `getNodeByName` returns the first match, so names can collide (V-snip). Unique-name enforcement on clone is **Unknown** |
| Clone modes | Copy, instance, reference. Documented only through the MAXScript instance/reference-replacement operation, where the destination node's geometry and modifiers are replaced by the source's and it keeps its material, transform, visibility and name (V-snip). What each mode shares (base object, modifiers) is **Unknown** officially. **Hypothesis:** instance shares the whole derived object; reference shares the base while adding a new modifier layer above. Experiment: use `instance` and `reference` and compare `node.baseobject` and `node.modifiers` identity |
| Open source | Blender ID names are unique per `Main` via `BKE_main_namemap_get_unique_name` (`lib_id.cc:2043`); `session_uid` is an in-session counter (`lib_id.cc:1577-1583`, not persistent); `BKE_object_duplicate` (`object.cc:2658`) uses `dupflag` to decide whether data is copied or linked |

## Classification

| Kind | Procedures |
|---|---|
| Destructive edit | Editable Poly operations (Extrude, Bevel, Inset, Chamfer, Weld, Attach, Collapse); stack Collapse To and Collapse All; pivot edit (mutates the node TM and the offset) |
| Modifier-recorded | Edit Poly modifier, Boolean modifier, TurboSmooth, Shell, Push, Symmetry, Skin |
| Derived | The evaluated `ObjectState`; the Symmetry mirrored half; controller values at time t; the world TM from the link chain |

## Findings relevant to separating authored state from evaluated state

1. **The stack is a base plus an ordered list of pure derivations.** Collapse is a one-way
   conversion that turns authored procedure into authored base (V-snip). Interpretation: in
   Bonyad terms, a "bake" needs its own typed procedure with provenance recorded.
2. **Max invalidates by validity interval plus a change message** (`REFMSG_CHANGE`), not by
   revision (V-snip). Interpretation: Bonyad should record the evaluation time and an
   explicit dependency set with each derived result, and not rely on interval caches.
3. **Identity and transform are layered.** The handle is stable and never reused (V-snip),
   names are not unique, and a pivot movement is split between the node TM and the object
   offset. Interpretation: identity should use a handle-like id and not names, and a pivot
   change should be modelled as a TM edit that leaves the geometry's world position unchanged.

## Not verified

- Official text on stack collapse, instance preservation and modifier-instance semantics
  (pages failed to load).
- Shell and Push parameters and semantics; Z-up (no documentation hit).
- Weld, Chamfer and Boolean tolerances and failure modes.
- Link constraint and parenting semantics.
- Handle persistence across save and load; clone behaviour; name uniqueness; what
  copy, instance and reference share.
- Revision counters in the controller system; bind-pose storage for Skin.
- MeshLab boolean filter details (file located, not read); Wings3D procedures other than
  weld and bool.
