# Engineering landscape and commonality study

Status: **research, not decisions.** Nothing here changes code, schema, dependencies or
architecture; a finding becomes a change only through an RFC and founder review
(`CONTRIBUTING.md`). Batch 2, following `../README.md` (batch 1). All sources accessed
**2026-10-22** unless stated.

**Founder principle applied:** discover the foundation from the breadth of engineering
first; design implementation afterwards. A primitive earns its place only through
evidence across examples. Discipline-specific concepts are kept, not forced into a
generic primitive.

**Evidence labels** (as in `../README.md`): **[V]** Verified, a source we opened and cite;
**[I]** Interpretation of verified evidence; **[H]** Hypothesis, experiment named;
**[U]** Unknown, unreachable or not opened. Citations are `S<n>` entries in section 7.
Restricted or copyrighted texts (AGS 4.2, Gerber, ISO standards) are summarised, never
copied; IFC and EXPRESS identifiers are quoted only as names.

**Honest depth statement.** The research horizon is "all available engineering"; one
session cannot reach it. Deep means: a primary source was opened and specific rules,
fields or licence text were extracted. Everything else is inventory or gap, and the gaps
are listed in section 1 and section 6. Reading was done with `curl`, `gh api` and
`pdftotext` against source repositories, schemas and official documentation, not blogs.

Reused from batch 1 by link, not redone: LandXML 1.2 study
([`../formats/landxml-1.2.md`](../formats/landxml-1.2.md)), ISO 19111 / OGC 18-005r5
([`../standards/crs-iso19111-ogc.md`](../standards/crs-iso19111-ogc.md)), planar vs
geodesic area ([`../procedures/polygon-area.md`](../procedures/polygon-area.md)), the
slice mapping ([`../mappings/point-line-surface.md`](../mappings/point-line-surface.md)).
Newly extracted from LandXML in this batch: `Survey`, `Alignment`, `Surface`,
`PipeNetwork` (S1).

What exists in the repository today (read 2026-10-22): the geometry crate has `Point2`,
`LineGeometry { a, b }`, `SurfaceGeometry { vertices }` (open ring, no holes, no curves),
`Kind { Point, Line, Surface }`, and `ViolationCode` with six stable codes; the migration
has `projects(unit = 'm', frame = 'local-cartesian')`, `entities(id uuid, kind, label)`,
and per-kind geometry tables pinned by `(id, kind)`. The manifesto's `Entity`, `State`,
`Procedure`, `Contract`, `Dependency`, `Revision`, `Composition`, `Presentation` are the
vocabulary candidates are tested against.

---

## 1. Coverage matrix

Cell = **deep** (opened a primary source and extracted specifics), **inv** (inventory:
identified from a primary source or registry, not studied), **gap** (not opened, refused,
or unreachable). "Problems" is at best *inv* everywhere: no source opened here is a
practitioner survey, so problems are inferred from what the formats, rules and tools
exist to do (**[I]**).

| Discipline | Problems | Software / features | Standards / rules | File formats | Math / procedures | Implementations / SDKs (licence) |
|---|---|---|---|---|---|---|
| Surveying / geomatics | inv | inv: GNU Gama (S14) | **deep** ISO 19111 (batch 1); EPSG gap | **deep** LandXML `Survey` (S1); RINEX, SINEX, vendor job files gap | **deep** area (batch 1); network adjustment equations gap | **deep** PROJ MIT-style (S22), GeographicLib/`geographiclib-rs` MIT (batch 1); Gama licence **[U]** |
| Civil / transport / road | inv | inv: SUMO (S12) | inv: OpenDRIVE rule ids (S9); AASHTO, national design codes gap | **deep** LandXML `Alignment`/`Surface` (S1), OpenDRIVE 1.9.0 (S9), SUMO plain XML (S12); GTFS (batch 1) | inv: clothoid definition (S9); no solver read | inv: SUMO EPL-2.0 (S12), esmini MPL-2.0 (S9b, licence only) |
| Structural | inv | gap | gap (design codes restricted) | **deep** IFC structural analysis entities (S2); inv OpenSees Tcl commands (S11); SAF, CIS/2 gap | gap (FE/section analysis not read) | inv: OpenSees, **restrictive licence read** (S11); section-properties MIT (S23, licence only) |
| Geotechnical | inv | gap | inv: AGS rules only; ISO 14688/22475, Eurocode 7 gap | **deep** AGS 4.2 (S5); DIGGS **[U]** (page had no content) | gap | gap |
| Hydraulics / water networks / hydrology | inv | inv: EPANET, SWMM | gap | **deep** EPANET data structures (S6); inv SWMM enums (S7); LandXML `PipeNetwork` (S1); WaterML 2.0 **[U]** (404) | inv: EPANET solver named (Todini global gradient) (S6); SWMM routing not read | **deep** EPANET MIT (S6); inv SWMM public domain (S7); HEC-DSS MIT (S24, listing only); HEC-HMS/RAS **[U]** |
| MEP / building services / energy | inv | inv: EnergyPlus (S8) | gap (ASHRAE, CIBSE, EN standards) | **deep** EnergyPlus IDD (S8); IFC distribution ports (S2); gbXML **[U]** (not opened) | inv: pandapower pi-model (S16) only for electrical | **deep** EnergyPlus BSD-style (S8); OpenStudio, Modelica Buildings (licence not resolved) **[U]** |
| Architecture / BIM | inv | gap | **deep** IFC4.3 EXPRESS WHERE rules (S2); ISO 16739-1 text **[U]** | **deep** IFC4.3 RC4 (S2), BCF 3.0 schema (S4); CityGML 3.0 CM inv (S20) | inv: tessellation, voiding entities named | inv: IfcOpenShell LGPL-3.0, web-ifc MPL-2.0, xBIM CDDL (S3, licence heads only) |
| Mechanical / CAD-CAM | inv | inv: FreeCAD, SolveSpace | gap (ASME Y14.5, ISO GPS restricted); ISO 10303 page 403 | inv: G-code modal state (S13); STEP **[U]**; 3MF spec repo BSD-2 (S25, licence only) | **deep-ish** constraint solving: SolveSpace Newton/Jacobian, DOF, result codes (S10) | inv: OCCT LGPL-2.1, FreeCAD LGPL-2.1, SolveSpace GPL-3.0, LinuxCNC GPL-2.0 (S10, S13) |
| Electrical / power systems | inv | inv | gap (IEC 61970 CIM/CGMES, IEEE) | **deep** MATPOWER case format (S15), pandapower element tables (S16); CIM gap | inv: pi-equivalent line model (S16); power-flow algorithm not read | **deep** MATPOWER BSD-3 (data files excluded) (S15), pandapower BSD-3 (S16); OpenDSS **[U]** (archived 2017 mirror, licence not read) |
| Electronics / EDA | inv | inv: KiCad, ngspice | gap (IPC-2581, IPC-D-356, IEC 61131) | **deep** Gerber 2026.05 (S18), KiCad S-expression intro (S17) | gap (SPICE solver not read) | inv: KiCad GPL-3.0 (S17), ngspice mixed BSD-compatible (S19, licence head only) |
| Urban planning / GIS | inv | inv | gap (LADM ISO 19152, INSPIRE) | inv GeoPackage 1.4.0 (S21), CityGML 3.0 CM (S20), GeoJSON (batch 1) | gap | inv: PROJ, GDAL (licence heads), PostGIS GPL-2.0, UrbanSim BSD-3, pandana AGPL-3.0 (S22) |
| Quantities / cost / scheduling | inv | gap | gap (ICMS, NRM, CESMM, Uniclass: fetch redirected, **[U]**) | **deep** IFC quantity/cost/task entities (S2); MS Project XML, P6 XER gap | inv: schedule result fields (float, critical flag) seen in IFC (S2); CPM algorithm not read | gap |
| **Added: measurement (units, uncertainty, classification)** | inv | gap | **deep-ish** UCUM 2.2 (S26), QUDT (S27), JCGM 100/101/102 listing (S28) | **deep** units/uncertainty fields in S1, S2, S5, S8 | gap | **deep** `uom` 0.38.0 Apache-2.0 OR MIT (S29, registry only) |

Why "measurement" is added: every other row depends on it, and the evidence for
quantities and uncertainty cuts across rows (section 4, P2 and P12).

Disciplines justified but not started: land administration / cadastre (LADM), rail
(beyond OpenDRIVE/LandXML), environmental/coastal, process/chemical, mining, aerospace
(no source opened). Listed so the absence stays visible.

---

## 2. Representative problems, software, features, formats and procedures

Compact tables. "Problem" statements are **[I]** unless a rule is cited.

### 2.1 Surveying and geomatics

| Item | Content | Evidence |
|---|---|---|
| Problems | Establish positions with stated accuracy; reduce raw observations to coordinates; adjust networks; transform between coordinate systems; compute parcel areas and closures | **[I]** from S1 attributes (`dirClosure`, `distClosure`, `Survey`) |
| Observations in LandXML | `InstrumentSetup` (station name, instrument height, orientation azimuth), `RawObservation` (horizontal angle, slope distance, zenith angle, azimuth, target height, `timeStamp`, `status` modified/deleted), `ObservationGroup` ("all observations to the same point in a group should be averaged together") | **[V]** S1 |
| Survey metadata | surveyor, firm, certificate, `horizontalAccuracy`/`verticalAccuracy` on `Survey` as strings; `localUncertainity` and `positionalUncertainity` on `CgPoint` as `xs:double` with no unit or confidence field in the declaration | **[V]** S1 |
| Software | GNU Gama: adjustment of surveying networks; XML input; `gama-local` observes distances, directions, angles, height differences, 3D vectors, coordinates | **[V]** S14 (licence **[U]**, page names none) |
| Procedures | Geodesic polygon area (Karney); coordinate operations (ISO 19111 conversion vs transformation) | **[V]** batch 1 |

### 2.2 Civil, transport, road

| Item | Content | Evidence |
|---|---|---|
| Problems | Define a route in plan and profile; stationing; cross-sections and cut/fill; networks of lanes and junctions; traffic flow | **[I]** |
| LandXML `Alignment` | required `name`, `length`, `staStart`; children `CoordGeom`, `AlignPIs`, `Cant`, `StaEquation`*, `Profile`*, `CrossSects`, `Superelevation`*. `StaEquation` has `staInternal` (station with no equations applied), `staAhead`, optional `staBack`, `staIncrement` increasing/decreasing | **[V]** S1 |
| LandXML `CrossSect` | at station `sta`; `areaCut`, `areaFill`, `volumeCut`, `volumeFill` stored | **[V]** S1 |
| LandXML `Surface` | `Definition` of `Pnts` (ids unique per surface) and `Faces` of 3 (TIN) or 4 (grid) points; `SourceData` keeps points, contours, breaklines | **[V]** S1 |
| OpenDRIVE 1.9.0 | road reference line coordinate system: s along the line (metres, measured in the x/y plane, ignoring elevation), t lateral (positive left, tilted by superelevation), h up; geometry elements `line`, `spiral`, `arc`, `poly3`, `paramPoly3`; each `geometry` has `s`, `x`, `y`, `hdg` (rad), `length` (m); georeference is a PROJ string plus an affine offset applied before PROJ; rules carry identifiers such as `asam.net:xodr:1.9.0:road.geometry.spiral.curvature_change` ("curvStart and curvEnd should not be the same") | **[V]** S9 |
| SUMO plain XML | nodes (`id`, `x`, `y`, metres), edges (`from`, `to`, `numLanes`, `speed` in m/s, `length` computed from `shape` if omitted, `type` reference where explicit attributes override the type), connections lane to lane (0-indexed from the right) | **[V]** S12 |
| Procedures | Clothoid (linear curvature along length), station to coordinate, microscopic traffic simulation | **[V]** definition S9; solver **[U]** |
| Licences | OpenDRIVE: "basic, non-exclusive and unlimited license to use" (S9); SUMO EPL-2.0 (S12); esmini MPL-2.0 (S9b) | **[V]** |

### 2.3 Structural

| Item | Content | Evidence |
|---|---|---|
| Problems | Idealise a structure as members and joints; apply load cases and combinations; solve for displacement, force, stress; check capacity against a code | **[I]** |
| IFC structural analysis | `IfcStructuralAnalysisModel` (a system) with `LoadedBy` load groups and `HasResults` result groups; `IfcStructuralPointConnection`, `IfcStructuralCurveMember` (with `Axis`); `IfcStructuralLoadCase` with optional `SelfWeightCoefficients` (3 ratios) | **[V]** S2 |
| OpenSees | `model Basic -ndm -ndf` fixes spatial dimension and degrees of freedom per node (defaults ndf 1, 3, 6 for ndm 1, 2, 3); `node` has an integer tag, coordinates and optional mass; the commands document no unit argument | **[V]** S11 (unit-less by design: **[I]**) |
| Licence | OpenSees COPYRIGHT: free for educational/research/non-profit non-commercial use; other entities may use and modify only "for internal purposes"; commercial incorporation needs a licence from UC Berkeley's technology licensing office. Not reusable inside an open-source product without permission | **[V]** S11 |
| Procedures, codes | Finite element assembly, section properties, code checks | **[U]** not read; design codes are restricted |

### 2.4 Geotechnical

| Item | Content | Evidence |
|---|---|---|
| Problems | Record investigation locations, samples, strata, in-situ and lab tests; exchange between investigators, labs and designers | **[I]** |
| AGS 4.2 (Dec 2025) | Text file of GROUPs; each group has GROUP, HEADING, UNIT, TYPE rows then DATA rows. Rule 10: headings are KEY, REQUIRED or OTHER; Rule 10a: no two rows with the same KEY combination; Rule 10c: every KEY entry must exist in the PARENT GROUP, which must be in the file; Rule 11: `Record Link` fields reference rows outside the hierarchy as `GROUP|KEY|KEY`; Rule 15: every unit used must be listed in the UNIT group; Rule 16: every abbreviation used must be defined in ABBR; Rule 18: non-standard groups/headings must be declared in DICT | **[V]** S5 |
| Location fields | `LOCA_NATE/NATN` (m, 2DP), `LOCA_GREF` (grid system), `LOCA_GL` (ground level), `LOCA_LLZ` (geodetic datum), local grid `LOCA_LOCX`, depth-based fields in other groups relative to `LOCA_GL` | **[V]** S5 |
| Licence | "All rights reserved" (AGS); the AGS site asks organisations to register as a Data Format User. Summarised only here | **[V]** S5 |

### 2.5 Hydraulics, water networks, hydrology

| Item | Content | Evidence |
|---|---|---|
| Problems | Size and operate pipe networks; heads, flows, pressures, water quality; rainfall-runoff and drainage routing | **[I]** |
| EPANET 2.3 data model | `Snode`: ID, X, Y, El, demand list (base + pattern index + category name), initial quality, emitter coefficient, node type. `Slink`: ID, N1, N2 (node indices), Diam, Len, Kc, Km, bulk/wall reaction, leak area, link type, initial status/setting, optional `Vertices`. Comment in source: `Kc` is "pipe roughness, pump speed, valve setting" depending on type. `Spattern` (ID, factors), `Scurve` (ID, type, X and Y arrays). Input is converted to internal units after reading (`Ucf` factors) | **[V]** S6 |
| EPANET solver | header states "Todini's Global Gradient Algorithm"; head loss formulas named in source include Hazen-Williams and Darcy-Weisbach (custom friction-factor routine) | **[V]** S6 (equations not studied) |
| SWMM 5.2.4 | object classes named in `enums.h`: subcatchment, node, link, pollutant, land use, time pattern, curve, time series, control rules, transect, aquifer, unit hydrograph, snowmelt, shape; node subtypes junction, outfall, storage, divider; link subtypes conduit, pump and others | **[V]** S7 |
| LandXML `PipeNetwork` | `Structs` and `Pipes`; a pipe's `startRef`/`endRef` name structs; inverts live on the struct and are selected per pipe by `pipeRef`; `pipeNetType` sanitary/storm/water/other; XSD `keyref` enforces that references resolve | **[V]** S1 |
| Licences | EPANET MIT (S6); SWMM README: "released in the Public Domain" (the GitHub licence field is empty) (S7); HEC-DSS MIT (S24) | **[V]** |

### 2.6 MEP, building services, energy

| Item | Content | Evidence |
|---|---|---|
| Problems | Route and size distribution systems; load calculation; energy simulation; coordinate with architecture | **[I]** |
| IFC | `IfcDistributionPort` (flow direction, port type, system type) joined to an element by `IfcRelConnectsPortToElement`; ports are products in their own right | **[V]** S2 |
| EnergyPlus IDD | schema as data: each object lists fields with `\type`, `\units` (e.g. `m`, `W/m-K`, `kg/m3`, `J/kg-K`), `\minimum>` (exclusive), `\default`, `\key` (closed vocabulary), `\reference` / `\object-list` (typed references by name), `\ip-units` (display unit), `\required-field`. `BuildingSurface:Detailed` is a polygon by extensible x,y,z vertices that names its construction, zone, space and boundary condition | **[V]** S8 (v26.2.0) |
| Licence | EnergyPlus: BSD-style conditions plus US Government rights notice (first paragraphs read) | **[V]** S8 |

### 2.7 Architecture and BIM

| Item | Content | Evidence |
|---|---|---|
| Problems | Describe building elements, spaces, systems and their relationships for coordination, quantities, and handover | **[I]** |
| IFC4.3 RC4 reference schema | 876 entities, 441 types, 48 functions, 2 global rules in the EXPRESS file. `IfcRoot` is the root of objects, property definitions and relationships; `GlobalId` is a 22-character string with a UNIQUE rule; `OwnerHistory` is optional. Relationships are entities (`IfcRelAggregates`, `IfcRelNests`, `IfcRelConnectsElements`, `IfcRelAssociatesMaterial`, `IfcRelDefinesByType`, `IfcRelSequence`, `IfcRelSpaceBoundary`) with their own identity, attributes and WHERE rules (for example no self-reference) | **[V]** S2 |
| Caveat | The file is a Release Candidate 4 schema (`IFC4X3_RC4` header), not the final published IFC 4.3; the official publication page was refused in batch 1. Licence of the development repository: CC BY-ND 4.0 (share unmodified with attribution) | **[V]** S2 |
| BCF 3.0 | issue markup referencing IFC objects by `IfcGuid` attributes (for example `IfcProject`, `IfcSpatialStructureElement`); `VersionId` in `version.xsd`; licence CC BY-ND 4.0 | **[V]** S4 |
| Implementations | IfcOpenShell LGPL-3.0 (API), web-ifc MPL-2.0 (API), xBIM CDDL (licence file head) | **[V]** S3 |

### 2.8 Mechanical, CAD-CAM

| Item | Content | Evidence |
|---|---|---|
| Problems | Parametric shape definition with constraints; assemblies; tolerances; toolpaths | **[I]** |
| SolveSpace solver | constraint equations are linearised and solved by a modified Newton method; degrees of freedom are computed from Jacobian rank; results include OKAY, REDUNDANT_OKAY, DIDNT_CONVERGE, TOO_MANY_UNKNOWNS; a global length epsilon and a much smaller convergence tolerance are defined (comment in `system.cpp`) | **[V]** S10 (GPL-3.0; epsilon value not located) |
| G-code (LinuxCNC) | modal groups: units G20/G21, distance mode G90/G91, work offsets G54 to G59.3 each with per-axis offsets and XY rotation, cutter and tool-length compensation; "modes can carry over from previous programs". A program has meaning only relative to carried state | **[V]** S13 |
| STEP / ISO 10303 | ISO page returned HTTP 403 | **[U]** |

### 2.9 Electrical and power systems

| Item | Content | Evidence |
|---|---|---|
| Problems | Power flow, optimal power flow, short circuit, protection, distribution planning | **[I]** |
| MATPOWER case | `baseMVA`, `bus`, `gen`, `branch`, optional `gencost` matrices; bus type PQ/PV/reference/isolated; per-unit voltages; branch `f`, `t` are bus numbers; a branch with `tap = 0` is a line, otherwise a transformer; the solver adds result columns to the same bus/branch/gen matrices; case files are excluded from the BSD licence | **[V]** S15 |
| pandapower | element tables (bus, line, trafo, ...); lines created either from a standard type library (`std_types`: per-type parameters separate from per-element parameters such as length and bus) or from explicit parameters; unit appears in the column name (`r_ohm_per_km`, `c_nf_per_km`); zero-length lines are not allowed (division by zero in power flow), use a switch instead; pi-equivalent circuit equations given | **[V]** S16 |

### 2.10 Electronics and EDA

| Item | Content | Evidence |
|---|---|---|
| Problems | Capture circuits, lay out boards, verify connectivity and manufacturing output | **[I]** |
| KiCad S-expressions | all values in millimetres; coordinates relative to the containing object; UUID v4 identifiers; library ids `NICKNAME:ENTRY`; precision differs by file type (1 nm for boards, 0.0001 mm for schematics); zones reference nets by ordinal; no file-level version header on the intro page, token changes are noted per version (for example `module` renamed `footprint` in 6) | **[V]** S17 |
| Gerber 2026.05 | fixed-point coordinates declared by `%FS` format statement; objects are drawn with apertures; net membership is an *attribute label* (`TO.N`) on conducting objects, not a graph; spec is copyright Ucamco, may not be redistributed, extended or renamed without approval | **[V]** S18 |

### 2.11 Urban planning and GIS

| Item | Content | Evidence |
|---|---|---|
| GeoPackage 1.4.0 (OGC 12-128r19) | SQLite container for vector features, tiles and tabular data, with defined table schema, integrity assertions and an extension mechanism | **[V]** S21 (table names not confirmed from this page) |
| CityGML 3.0 | one conceptual model with several encodings; repository MIT | **[V]** S20 (modules not read) |
| Implementations | UrbanSim BSD-3-Clause; pandana AGPL-3.0; PostGIS GPL-2.0; PROJ and GDAL licence files are composite | **[V]** S22 |
| Standards, procedures | LADM, INSPIRE, zoning/regulation rules, accessibility analysis | **[U]** |

### 2.12 Quantities, cost, scheduling

| Item | Content | Evidence |
|---|---|---|
| IFC cost and schedule | `IfcCostItem` (cost values and cost quantities); `IfcTask` (status, milestone flag, priority, `TaskTime`); `IfcTaskTime` carries both inputs (scheduled start/finish/duration) and CPM-style results (early/late start and finish, free float, total float, critical flag, actual dates, completion); `IfcRelSequence` has `TimeLag` and a sequence type and forbids a process sequenced to itself | **[V]** S2 |
| Quantities | quantity-set property definitions give meaning by rule: wall `NetVolume` is "after subtracting the openings and after considering the connection geometry"; `Length` is "along center line" | **[V]** S2 (psd docs) |
| Standards and tools | ICMS, NRM, Uniclass (fetch redirected to a non-primary page), MS Project XML, P6 XER, OpenProject | **[U]** |

---

## 3. Shared concepts and semantic differences

Each row states how systems *actually* use the word. Columns of consequence are what a
foundation must not assume.

| Term | Meanings found (system: meaning) | Consequence for a foundation |
|---|---|---|
| **point** | IFC `IfcCartesianPoint`: a list of 1 to 3 length measures, a geometric item (not an `IfcRoot` subtype, so no `GlobalId`) **[V][I]**. LandXML `CgPoint`: a *named* survey object with `oID`, survey order, uncertainty, text "N E [Z]" **[V]**. EPANET node: a hydraulic role (demand, elevation, quality) that also carries X, Y **[V]**. MATPOWER bus: a network node with **no coordinates at all** **[V]**. OpenSees node: integer tag + coordinates + degrees of freedom **[V]**. SUMO node: junction with a type and optional shape **[V]** | A point may be a value, an identified object, or a role in a network. Bonyad's `Point` entity is the "identified object" reading only |
| **line** | LandXML `Line`: two endpoints inline and/or by `pntRef`, plus redundant `dir`, `length` **[V]**. OpenDRIVE `geometry`: start x, y, heading and length, not two endpoints **[V]**. EPANET link: **no geometry of its own**; `N1`, `N2` node indices, an authoritative `Len`, optional display vertices **[V]**. MATPOWER branch: from/to bus numbers, electrical parameters **[V]**. SUMO edge: from/to nodes plus optional shape, length computed if absent **[V]**. Gerber draw: a stroke with an aperture width **[V]** | "Line" is segment geometry, a connection between nodes, or a stroke. In networks the length is often an *input*, not a function of coordinates |
| **surface** | LandXML `Surface`: TIN/grid height model (points + faces) **[V]**; `Parcel` boundary: polygon of `CoordGeom` **[V]**. EnergyPlus `BuildingSurface:Detailed`: planar polygon with type (wall, floor, roof, ceiling) and boundary condition **[V]**. IFC `IfcTessellatedFaceSet`: triangulated or polygonal mesh in 3D **[V]** | Region, terrain model, envelope face and mesh differ in dimension, validity and what they bound. Bonyad's surface is the planar-region reading |
| **element** | IFC `IfcElement` = physical component; `IfcStructuralItem` family = analysis idealisation; both are `IfcProduct` subtypes **[V]**. OpenSees element = finite element joining nodes **[V]**. pandapower element = a table row **[V]**. EPANET has nodes and links, not "elements" **[V]** | The same real member can be a physical object *and* an analysis object; one "element" primitive would merge two different things |
| **material** | EnergyPlus `Material`: named property bundle with units and minima **[V]**. IFC: `IfcMaterial`, `IfcMaterialLayerSet` (layers, derived `TotalThickness`), extended `IfcMaterialProperties`, associated by relationship **[V]**. OpenSees: a constitutive model object (`uniaxialMaterial`, `nDMaterial`) **[V]** (docs path listing). AGS: soil described by coded geology rows, not a manufactured product **[V]** | Material is a data record, a layered assembly, or a behavioural law with state. Not one concept |
| **load** | IFC: `IfcStructuralLoad` family, load groups and cases, self-weight coefficients **[V]**. MATPOWER: `Pd`, `Qd` bus demand (MW, MVAr) **[V]**. EPANET: demand = base flow x time pattern at a node **[V]**. SWMM: inflows (class list) **[V]** | Physical quantity (force, power, flow), combination semantics (cases/combinations are structural), and time variation differ. "Load" is a role at a node, not a type |
| **network** | EPANET/SWMM/MATPOWER/pandapower/SUMO/LandXML pipes: nodes + links by reference **[V]**. IFC: elements joined through ports and relationship entities **[V]**. Gerber: net = attribute label on geometry **[V]**. KiCad: nets by ordinal number from pads and zones **[V]** | Edge-list graph, port graph, and *equivalence class of pins* (a net is a hyperedge, not an edge) are all "network" |
| **alignment** | LandXML: horizontal geometry + profiles + cant + superelevation + cross-sections + station equations **[V]**. OpenDRIVE: road reference line with s, t, h and geometry types **[V]**. IFC: `IfcAlignment` with horizontal, vertical and segment parts, and `IfcLinearPlacement` **[V]** | A one-dimensional reference curve *plus a coordinate system along it*; elevation and offset are not x, y, z |
| **unit** | IFC: `IfcUnitAssignment`, `IfcSIUnit` with derived dimensional exponents, `IfcConversionBasedUnit` with a measure-with-unit factor **[V]**. AGS: unit per column, declared in the file and registered in a UNIT group **[V]**. EnergyPlus: unit per field in the schema, plus a display unit **[V]**. SUMO: fixed (m, m/s) **[V]**. pandapower: unit in the column name **[V]**. MATPOWER: per-unit relative to `baseMVA` and `baseKV` **[V]**. OpenSees: none declared **[V]**. LandXML: a project-level `Units` choice of Metric or Imperial **[V]** (batch 1). UCUM: strings, with non-ratio "special" units excluded from algebra **[V]** | Binding point for the unit varies (value, column, field schema, project, none). Relative (per-unit) and non-ratio (Celsius) units break "number x unit" |
| **coordinate system** | ISO 19111: CRS = coordinate system + datum **[V]** (batch 1). IFC: context world coordinate system, optional true north, `IfcMapConversion` (eastings, northings, orthogonal height, X-axis direction, scale) to a projected CRS **[V]**. OpenDRIVE: inertial frame, affine offset then a PROJ string **[V]**. KiCad: coordinates relative to the containing object **[V]**. G-code: modal work offsets G54 to G59 **[V]**. LandXML: north, east order **[V]** (batch 1) | Frames form a *tree of transforms*; axis order and sign conventions differ; a frame can be modal state (G-code) |
| **tolerance / uncertainty** | LandXML: `positionalUncertainity` as a bare double **[V]**. IFC: `Precision` on the representation context **[V]**. SolveSpace: epsilon for geometric equality and a convergence tolerance **[V]**. AGS: reporting precision type `2DP` **[V]**. JCGM GUM: statistical measurement uncertainty and propagation **[V]** (listing). Design tolerance (ASME Y14.5) **[U]** | At least four different meanings share one word (section 4, P12) |
| **version / revision** | KiCad: per-token file-version notes **[V]**. AGS: edition of the format **[V]**. BCF: `VersionId` of the schema **[V]**. OpenDRIVE: rule identifiers embed the spec version **[V]**. IFC: `OwnerHistory` (creation, last modification, change action NOCHANGE/MODIFIED/ADDED/DELETED), optional **[V]**. GTFS: a changed dataset is a new version (batch 1). LandXML: `state` = abandoned/destroyed/existing/proposed **[V]** | Most formats version the *schema* or the *file*; few record per-entity change; "state" in LandXML is physical lifecycle, in IFC `State` is read/write/locked access **[V]**. Three unrelated ideas |
| **relationship / binding** | Index/number reference (EPANET `N1`, MATPOWER `f`, `t`) **[V]**. Name reference with schema-enforced resolution (LandXML `pntRef`, `startRef`, `keyref`) **[V]**. Objectified relationship with own `GlobalId` and attributes (IFC `IfcRel*`) **[V]**. Composite natural key with mandatory parent row (AGS Rule 10c) and free-form record links (Rule 11) **[V]**. Cross-document reference by external GUID (BCF -> IFC) **[V]**. Label on geometry (Gerber `.N`) **[V]**. Net number (KiCad) **[V]** | Binding has at least four implementations that differ in who owns the identity of the link, and whether the link can carry data |

---

## 4. Evidence-backed candidate primitive catalogue

Each candidate: meaning; examples from at least three systems (S-cites); identity vs
value; units; relationships; ownership; validity; composition; counterexamples; what it
must **not** swallow; verdict (**supported**, **weak**, **rejected**, **needs
experiment**). Verdicts are about whether the *concept* is evidenced, not about naming
or implementation. "Bonyad today" refers to the repository state described above.

### P1. Stable identity (an opaque, never-reused name for a thing)

- **Meaning.** A reference that survives edits and exports and lets other things refer
  to this one.
- **Examples.** IFC `GlobalId`: 22-char, UNIQUE in `IfcRoot` (S2). KiCad UUID v4
  (S17). EPANET string `ID` plus an array index (S6). OpenSees integer node tag (S11).
  MATPOWER bus number, a positive integer that doubles as matrix key (S15). SUMO `id`
  with forbidden characters (S12). AGS composite KEY (S5). LandXML `name` unique per
  collection via `xs:unique`, plus a separate `oID` (S1). BCF stores external IFC GUIDs
  (S4).
- **Identity vs value.** Always identity. But *scope* differs: global (IFC, KiCad),
  project (EPANET, LandXML), table (MATPOWER), composite and hierarchical (AGS).
- **Units.** None.
- **Relationships.** Target of every binding (P6).
- **Ownership.** Assigned by the model's owner; IFC and KiCad generate randomly,
  EPANET and LandXML take human-chosen names.
- **Validity.** Uniqueness within scope (IFC UR1, AGS Rule 10a, SUMO character rules,
  `xs:unique`). Optional in GeoJSON (batch 1).
- **Composition.** AGS shows identity composed from parent identity plus local key.
- **Counterexamples.** MATPOWER bus numbers carry meaning through ordering; EPANET
  resolves IDs to array indices internally, so "identity" and "index" are conflated
  inside the engine; IFC `OwnerHistory` is optional and `GlobalId` can be regenerated
  by exporters (**[U]**: not tested).
- **Must not swallow.** External/official identifiers (`oID`, `taxId`), human labels
  (names are claims, not identity), tag numbers used on drawings.
- **Verdict: supported.** Bonyad's UUID `id` plus `label` matches the evidence; the
  missing piece is a place for *external identifiers with a stated scope* (see P6 and
  section 6, Q2).

### P2. Quantity (a number bound to a dimension, with an explicit unit binding)

- **Meaning.** A value that is only meaningful with a physical dimension and a unit.
- **Examples.** IFC `IfcMeasureWithUnit` and `IfcSIUnit` with derived dimensional
  exponents, conversion-based units, and `IfcQuantityLength` rule `LengthValue >= 0`
  (S2). AGS: unit and type declared per column and every unit registered (Rules 8, 15)
  (S5). EnergyPlus `\units`, `\ip-units`, `\minimum>` per field (S8). pandapower unit
  in the name (S16). EPANET converts to internal units on read (S6). UCUM and QUDT
  (S26, S27). `uom` Rust crate (S29).
- **Identity vs value.** Value.
- **Units.** The subject of the primitive. Binding location varies: per value (IFC),
  per column (AGS), per field in schema (EnergyPlus), per project (LandXML,
  Bonyad), in the identifier (pandapower), implicit (SUMO, OpenSees).
- **Relationships.** None of its own; attaches to attributes.
- **Ownership.** The schema owns the dimension; the data owns the number.
- **Validity.** Range rules (EnergyPlus minima, IFC non-negativity), dimensional
  consistency.
- **Composition.** Products and quotients of units (UCUM `.` and `/`).
- **Counterexamples.** Per-unit values (MATPOWER) are relative to bases, not units.
  Celsius is an offset unit and "cannot take part in ordinary algebra" (UCUM). Angles
  are dimensionless yet convention-laden (section 3). OpenSees runs with no declared
  unit system.
- **Must not swallow.** Coordinates (P3), directions and angles with convention,
  relative/normalised values, counts.
- **Verdict: supported.** Strongest cross-discipline evidence in the study. Bonyad's
  single project metre is a degenerate case of the "schema owns the unit" pattern.
  Whether a stored value should carry its unit (IFC) or the column should (AGS,
  EnergyPlus) is **needs experiment** (X2).

### P3. Frame (a coordinate system related to another by a transform)

- **Meaning.** A named reference in which coordinates are interpreted, with a defined
  relation to a parent frame.
- **Examples.** ISO 19111 CRS, datum, coordinate operation (batch 1). IFC context
  world coordinate system, `IfcLocalPlacement` relative to another placement, and
  `IfcMapConversion` to a projected CRS (S2). OpenDRIVE inertial frame, affine offset,
  PROJ string (S9). KiCad coordinates relative to the containing object (S17). G-code
  work offsets (S13). LandXML `CoordinateSystem` (batch 1). AGS `LOCA_GREF`, local
  grid, datum fields (S5).
- **Identity vs value.** Identity (named, shared) plus a value (transform parameters).
- **Units.** Length unit of the frame; angle for rotation.
- **Relationships.** Parent frame (a tree). IFC enforces a rule on local placement
  correctness (`IfcCorrectLocalPlacement`).
- **Ownership.** The project owns frames; imported files bring their own.
- **Validity.** Axis order, handedness, datum, and scale (IfcMapConversion `Scale`
  optional). OpenDRIVE: apply the offset *before* PROJ.
- **Composition.** Chains of transforms; hierarchical placement.
- **Counterexamples.** Linear referencing (s, t) is not a Cartesian frame (P4). G-code
  frames are modal state, not data on objects. OpenSees has no frame concept.
- **Must not swallow.** Station/offset coordinates, vertical datums with a geoid model
  (**[U]**), time.
- **Verdict: supported** as "frame with a transform to a parent". Bonyad's single
  `local-cartesian` frame is the root of such a tree. Whether to model the parent link
  now is **needs experiment** (X3).

### P4. Position along a reference curve (linear referencing)

- **Meaning.** A location given as distance along a curve plus an offset, not as x, y.
- **Examples.** LandXML alignment stationing with `StaEquation` (station is not
  distance when equations apply) and survey observations that carry `alignRef`,
  `alignStationName`, `alignOffset` (S1). OpenDRIVE s (measured in the x/y plane, so
  not along the elevation profile) and t (positive left, tilted by superelevation)
  (S9). IFC `IfcLinearPlacement` and `IfcAlignment` (S2). AGS depth below ground level
  along a hole (S5). Counted as four systems.
- **Identity vs value.** Value that refers to an identified curve (P1).
- **Units.** Metres (or feet) for s and t; station values are formatted numbers in
  practice.
- **Relationships.** Bound to one reference curve; converts to a Cartesian point
  through that curve.
- **Ownership.** The alignment owns the mapping.
- **Validity.** s within `[staStart, staStart + length]`; direction sign; equations
  must be consistent.
- **Composition.** A product positioned at (s, t, h) on an alignment; lanes defined
  relative to a reference line.
- **Counterexamples.** Depth in a borehole is linear referencing along a mostly
  vertical, possibly deviated, curve; ground level can differ per hole.
- **Must not swallow.** The alignment's design content (horizontal, vertical, cant,
  superelevation, cross-sections), which is a civil-specific composite.
- **Verdict: supported, and distinct from P3.** Not representable by a point.
  Reference-curve definitions (line, arc, clothoid, polynomial) are separate
  discipline concepts.

### P5. Geometry as a representation, separate from the thing it represents

- **Meaning.** Shape is data attached to an entity, with a stated rule for whether it is
  authoritative or derived.
- **Examples.** IFC: `IfcProduct` has an optional `ObjectPlacement` and
  `Representation` (S2). EPANET: node coordinates and link `Vertices` are optional
  display data, link `Len` is an independent input (S6). MATPOWER: no geometry (S15).
  SUMO: `shape` optional, length derived from shape only when omitted (S12). LandXML:
  `Line` carries `dir`, `length` redundantly (S1). EnergyPlus: surface vertices *are*
  the authoritative geometry (S8).
- **Identity vs value.** Geometry is value; the owning entity is identity.
- **Units.** Length.
- **Relationships.** Entity to geometry (zero, one or several representations in IFC).
- **Ownership.** Entity owns its geometry (Bonyad's independent-geometry rule matches
  LandXML inline points and SUMO shapes).
- **Validity.** Geometric rules (ViolationCode set). IFC requires a placement when a
  shape representation exists.
- **Composition.** Placement relative to a frame (P3).
- **Counterexamples.** In EPANET and SUMO the length may *differ* from the geometric
  length, and is authoritative. ADR 0001 item 4 ("derive, never store") is right for
  measures that are consequences of geometry, but the evidence shows a second case,
  *authoritative input that happens to be geometric*, which needs a home (**[I]**,
  X4).
- **Must not swallow.** Topology/connectivity (P6), 3D solids and B-reps (not studied),
  schematic position (EDA), curved segments (OpenDRIVE, LandXML).
- **Verdict: supported.** Bonyad's Kind { Point, Line, Surface } describes
  *geometric* kind; IFC, EPANET and pandapower classify by *engineering* kind (P7).
  These are two axes; conflating them is the main risk found.

### P6. Reference (binding) between identified things

- **Meaning.** One thing refers to another, with defined cardinality and validity.
- **Examples.** EPANET `N1`/`N2` (S6). MATPOWER `f`/`t` (S15). LandXML `pntRef`,
  `startRef`/`endRef`, XSD `keyref` (S1). IFC `IfcRel*` entities with their own
  identity, attributes and WHERE rules (S2). AGS Rules 10c and 11 (S5). BCF to IFC by
  GUID (S4). KiCad net number (S17). Gerber `.N` label (S18).
- **Identity vs value.** Two forms: reference as an attribute (EPANET, MATPOWER,
  LandXML) and relationship as an entity (IFC). The first has no identity of its own;
  the second does.
- **Units.** None, except IFC `TimeLag` on sequence relations.
- **Relationships.** Directed or symmetric; typed by role (`RelatingElement` /
  `RelatedElement`, `RelatingObject` / `RelatedObjects`).
- **Ownership.** The referrer owns the reference. IFC makes the relation its own
  owner.
- **Validity.** Referent must exist (AGS 10c, `keyref`); no self-reference (IFC
  `NoSelfReference`, `RelSequence`); type restrictions (IFC `AllowedElements`);
  cardinality (IFC `Decomposes` at most one parent).
- **Composition.** Chains (sequence), trees (aggregation), graphs (connectivity).
- **Counterexamples.** Gerber nets are labels, not links; KiCad net-tie groups allow
  nets to short (S17); coordinate coincidence is *not* a binding in Bonyad (ADR 0002 item 2)
  while in a drawing file coincidence often implies connectivity (**[U]**: not tested
  on real files).
- **Must not swallow.** Containment/aggregation (P8), type-instance (P9), association
  (material, classification), sequence, space boundary, void-fill. IFC separates
  these by entity; a single `link` table would erase the validity rules above.
- **Verdict: supported as a family, rejected as a single table.** Evidence supports
  "reference with existence rule" as the common core, with relation *kinds* owning
  their own rules.

### P7. Engineering kind (classification of an entity with an open escape)

- **Meaning.** What the entity *is* in the discipline (pipe, pump, bus, wall).
- **Examples.** IFC subtype plus `PredefinedType`, where `USERDEFINED` requires
  `ObjectType` (S2). EPANET `NodeType`/`LinkType` with type-dependent fields (S6).
  SWMM node and link subtypes (S7). pandapower one table per element type (S16).
  LandXML pipe cross-section chosen by which child element exists (S1).
- **Identity vs value.** Value (immutable per entity in most; IFC allows type change
  by re-export).
- **Units.** None.
- **Relationships.** Determines which attributes, ports and rules apply.
- **Ownership.** The discipline module.
- **Validity.** Required attributes by kind; the user-defined escape needs a label.
- **Composition.** IFC `IsTypedBy` checks that the assigned type matches the kind.
- **Counterexamples.** EPANET's `Kc` means roughness, speed or setting by link type, so
  attribute *meaning* depends on kind; a deep subtype tree (876 entities) hides the
  per-kind rules in WHERE clauses.
- **Must not swallow.** Geometric kind (P5).
- **Verdict: supported.** Right shape in Rust: a tagged union per discipline
  (section 5), not an inheritance tree.

### P8. Composition (part-of structure)

- **Meaning.** An entity is made of, nested in, or contained by others.
- **Examples.** IFC `IfcRelAggregates` (unordered set), `IfcRelNests` (ordered list),
  `Decomposes` at most one parent (S2). KiCad symbols composed of numbered units
  (S17, partial). EnergyPlus zone, space, surface by name (S8). LandXML nested
  `Parcels` (S1). OpenDRIVE road, lane sections, lanes (S9).
- **Identity vs value.** Parts have identity; the structure is a relation.
- **Units.** None.
- **Relationships.** Tree (single parent) for decomposition; separate non-tree
  relations for spatial containment references (`ReferencedInStructures`).
- **Ownership.** Parent owns lifecycle of parts (cascade) in most systems.
- **Validity.** No self-reference, acyclic (**[I]**: IFC states only no self-reference
  in the rule read).
- **Composition.** The thing itself.
- **Counterexamples.** The manifesto's "composition" (turn a useful collection into a
  reusable *definition*) is closer to P9 (type/occurrence) than to IFC aggregation of
  instances.
- **Must not swallow.** Reusable definitions, assemblies with mating constraints (P13).
- **Verdict: supported** as instance decomposition. Reusable composition = **needs
  experiment** (X6).

### P9. Definition and occurrence (type vs instance)

- **Meaning.** Shared parameters live on a type; occurrences refer to it and may
  override.
- **Examples.** IFC `IfcTypeObject` and `IfcRelDefinesByType` (S2). pandapower
  `std_types` ("parameters depending on the element" vs "only on the type") (S16).
  SUMO `type` with explicit edge attributes overriding (S12). EnergyPlus Construction
  and Material referenced by name (S8). KiCad library id (S17). EPANET shared
  patterns and curves referenced by index (S6).
- **Identity vs value.** Type is an identified definition; occurrence is an identified
  instance referencing it.
- **Units.** As P2.
- **Relationships.** Occurrence to type (many to one).
- **Ownership.** Library or project owns types.
- **Validity.** Type must match the occurrence kind (IFC `CorrectTypeAssigned`).
- **Composition.** Types of assemblies.
- **Counterexamples.** Override rules differ: SUMO "explicit overrides type"; IFC
  property sets can sit on both; KiCad stores only the entry name in library files and
  resolves nickname per user (S17), so type reference is *environment-dependent*.
- **Must not swallow.** Materials as behavioural laws (P15), catalogue products with
  supplier data (**[U]**).
- **Verdict: supported.** Directly matches the manifesto's "definition and instance".

### P10. Validity rule with a stable identity and severity

- **Meaning.** A named, checkable condition on state, with an explicit outcome.
- **Examples.** IFC WHERE rules (names such as `NoSelfReference`, `WR22`) (S2). OpenDRIVE
  rules with version-scoped identifiers and "should/shall" wording (S9). AGS numbered
  rules 1 to 19 (S5). EnergyPlus minima and required fields (S8). pandapower zero-length
  line prohibition with advice (S16). SolveSpace result codes (S10). Bonyad
  `ViolationCode`.
- **Identity vs value.** Rule is a named definition; a violation is a value located by
  path.
- **Units.** Inherits from the checked value.
- **Relationships.** Attached to a kind, a field or a relationship.
- **Ownership.** The module that owns the concept; the database owns integrity only
  (Bonyad rule, matches AGS "KEY/REQUIRED").
- **Validity.** The rule itself is versioned with its spec (`xodr:1.4.0` vs `1.9.0`).
- **Counterexamples.** Some rules are advisory (OpenDRIVE "should"); some are solver
  outcomes (redundant but OK) rather than pass/fail.
- **Must not swallow.** Physical code checks (capacity ratio against a design code),
  which produce quantities, not just pass/fail.
- **Verdict: supported.** Bonyad's `ViolationCode` pattern is corroborated; add severity
  and rule-set version when a second rule source appears (**[H]**).

### P11. Field schema with declared type, unit and range (governed extension)

- **Meaning.** Extra attributes allowed only when their name, type, unit and constraints
  are declared.
- **Examples.** AGS DICT group for user-defined groups and headings (S5). EnergyPlus
  IDD field metadata (S8). IFC property sets, `UniquePropertyNames`, with quantity sets
  (S2). LandXML `Feature`/`Property` label-value pairs and wildcards (S1, batch 1).
  GeoJSON foreign members without processing model (batch 1).
- **Identity vs value.** Definition (field schema) plus values.
- **Units.** Declared per field.
- **Relationships.** Fields attach to a kind or a type (P7, P9).
- **Ownership.** Whoever introduces the field must declare it (AGS Rule 18).
- **Validity.** Declared.
- **Counterexamples.** LandXML `Property` is an untyped label-value pair, which is the
  entity-attribute-value shape the manifesto excludes; IFC property sets are generic
  containers whose real meaning lives in external definitions.
- **Must not swallow.** Core attributes that should be real columns.
- **Verdict: needs experiment.** Evidence shows *every* ecosystem needs a governed
  extension channel; whether it can be built without becoming EAV is untested (X7). Do
  not build ahead of need (manifesto section 8).

### P12. Tolerance and uncertainty (rejected as one primitive)

- **Meaning.** Four different things share the word.
- **Examples.**
  1. *Measurement uncertainty*: LandXML `positionalUncertainity` (a bare double with no
     stated confidence level in the declaration) (S1); GNU Gama network adjustment
     (S14); JCGM 100/101/102 (S28).
  2. *Model/computational tolerance*: IFC `Precision` of a representation context (S2);
     SolveSpace length epsilon and convergence tolerance (S10).
  3. *Reporting precision*: AGS type `2DP` (S5), KiCad file-type decimal places (S17),
     Gerber coordinate format (S18).
  4. *Design tolerance / fit*: ASME Y14.5, ISO GPS (**[U]**).
- **Verdict: rejected as a single primitive.** Supported as at least three concepts
  that attach to different things (a measured value, a model's equality test, a
  serialisation). Batch 1's "uncertainty on a point" (R7, H2) maps only to the first.

### P13. Declarative constraint solved against unknowns

- **Meaning.** Relations that determine parameters (equal length, tangent, fixed
  angle) and a solver that reports consistency and remaining freedom.
- **Examples.** SolveSpace (S10); FreeCAD Sketcher `planegcs` (S10b, file list only,
  not read); IFC records connections (`IfcRelConnectsElements`) but does not solve
  them (S2); EDA design rules (**[U]**).
- **Identity vs value.** Constraint is an identified relation; solution is a value.
- **Units.** Inherits.
- **Relationships.** Over parameters of entities.
- **Ownership.** The solver procedure.
- **Validity.** Result codes: satisfied, redundant, did not converge, too many unknowns;
  degrees of freedom from Jacobian rank.
- **Counterexamples.** "Degrees of freedom" means different things: SolveSpace counts
  free parameters of a sketch; OpenSees `ndf` counts nodal dofs of a structural model
  (S11). Recording a connection (IFC) is not constraint solving.
- **Must not swallow.** Binding (P6) and validity rules (P10).
- **Verdict: needs experiment.** Only two solving systems verified; matches the
  manifesto's milestone 3 but must be shown not to need more than P6 plus a procedure
  (X8).

### P14. Result set bound to inputs and a procedure version

- **Meaning.** Computed output kept distinct from authoritative input, with traceable
  inputs.
- **Examples.** IFC `HasResults` result groups on an analysis model; `IfcTaskTime`
  mixes scheduled values and computed float/critical-flag fields in one entity
  (S2). MATPOWER adds result columns to the same matrices that hold inputs (S15).
  EPANET writes results to a separate output module (`outfile.c`, `output.c` in the
  source tree, S6).
- **Identity vs value.** Result group has identity; values are values.
- **Units.** As P2.
- **Relationships.** To the model state and the procedure.
- **Ownership.** The procedure that produced it.
- **Validity.** Stale when inputs change; none of the sampled formats record this
  (**[I]**).
- **Counterexamples.** MATPOWER's `Vm`/`Va` are both initial values and results;
  `IfcTaskTime` mixes input and output.
- **Must not swallow.** Imported values asserted by a source (LandXML `area`), which are
  claims to check, not results.
- **Verdict: supported** as a need, since the sampled formats conflate or omit it.
  Representation is **needs experiment**.

### P15. Material (rejected as a single record)

- **Meaning.** Three concepts under one word (section 3): property bundle (EnergyPlus,
  S8), layered assembly (IFC layer set, S2), behavioural law (OpenSees, S11). Geotechnical
  soil/rock description (AGS, S5) is a fourth.
- **Verdict: rejected as one primitive.** Keep per discipline. Reuse only the generic
  parts: quantities (P2) and definition/occurrence (P9).

### P16. Time-varying definition (pattern, curve, series)

- **Meaning.** A table or function over time or another axis.
- **Examples.** EPANET `Spattern` (periodic factors) and `Scurve` (typed x/y points)
  (S6). SWMM time pattern, curve, time series as separate object classes (S7). IFC
  `IfcTaskTime` dates/durations (S2). HEC-DSS exists as a time-series store (S24, not
  read).
- **Counterexamples.** Pattern is relative (multipliers), curve is functional (head vs
  flow), series is absolute (time, value). Three shapes already in two systems.
- **Verdict: weak.** Evidence of need, not of a common structure; **needs experiment**
  once a time-varying case is in scope.

### P17. Observation (a measurement event with context)

- **Meaning.** A recorded measurement with instrument, setup, time and status.
- **Examples.** LandXML `InstrumentSetup`, `RawObservation`, `ObservationGroup`, with
  `status` modified/deleted (S1). GNU Gama observation types (S14). AGS sample and test
  groups keyed under locations (S5, structure only). WaterML 2.0 **[U]**.
- **Verdict: supported inside surveying; weak elsewhere.** Two systems verified in
  detail. The surveying proof path is the first place to test it (X9).

### P18. Lifecycle state, access state and data revision (three concepts, not one)

- **Examples.** LandXML `state` abandoned/destroyed/existing/proposed (S1). IFC `State`
  READWRITE/READONLY/LOCKED... (S2). IFC `ChangeAction` (S2). AGS `LOCA_STAT` coded
  status e.g. PRELIM (S5).
- **Verdict: supported as three separate things.** Physical lifecycle (what exists
  now), access/approval state, and revision (what history). The manifesto's Revision
  covers only the third.

### Discipline-specific concepts preserved (not primitives)

Network equations and head-loss models (water); per-unit systems and bus types (power);
apertures and layer stacks (Gerber/EDA); modal machine state (G-code); stationing
equations, cant, superelevation (rail/road); load combinations and design checks
(structural); borehole logs and sample hierarchies (geotechnical); CPM float and
critical path, cost quantity rules (scheduling and cost); thermal boundary conditions
(energy). Each is an owned vocabulary with its own procedures.

### Summary of verdicts

| ID | Candidate | Verdict |
|---|---|---|
| P1 | Stable identity | supported |
| P2 | Quantity (value + dimension + unit binding) | supported; binding site needs experiment |
| P3 | Frame with transform to parent | supported; scope needs experiment |
| P4 | Position along a reference curve | supported, distinct from P3 |
| P5 | Geometry as representation | supported; authority rule needed |
| P6 | Reference / binding | supported as family; rejected as one table |
| P7 | Engineering kind | supported |
| P8 | Composition (instance decomposition) | supported |
| P9 | Definition and occurrence | supported |
| P10 | Validity rule with stable identity | supported |
| P11 | Governed field schema | needs experiment (EAV risk) |
| P12 | Tolerance / uncertainty | **rejected** as one primitive |
| P13 | Declarative constraint | needs experiment |
| P14 | Result set bound to inputs | supported as a need; shape open |
| P15 | Material | **rejected** as one primitive |
| P16 | Time-varying definition | weak |
| P17 | Observation | supported in surveying; weak elsewhere |
| P18 | Lifecycle / access / revision | supported as three concepts |

---

## 5. Traceable mapping to proposed implementation boundaries

These are **proposals (H)**, not decisions. "Source" cites the evidence row. No new
table, crate or dependency is proposed for the current milestone (see
`../proposals/next-batch.md` section 5).

### 5.1 Database (tables, keys, constraints)

| Source example | Proposed boundary | Rule / constraint | Note |
|---|---|---|---|
| AGS Rules 10a, 10c (S5) | Composite or surrogate keys with FK to parent; unique key combinations | Matches existing `entities(id, kind)` pin pattern | Keep FKs in the database: integrity is DB-owned |
| IFC `UR1` GlobalId (S2) | UUID primary key (already) | UNIQUE | Add an *external identifiers* table keyed `(entity_id, scheme, value)` when an importer needs it (P1) |
| IFC relationships with attributes (S2) | One relationship table **per relation kind**, not one generic `links` | Per-kind CHECKs (no self-reference, allowed kinds) | Counter to P6 single-table idea |
| EPANET `N1`/`N2`, LandXML `pntRef` (S6, S1) | FKs from line endpoints to point entities, when milestone 3 arrives | `ON DELETE` policy must be explicit | Today independent geometry stays (ADR 0002 item 2) |
| EnergyPlus `\units`, `\minimum>` (S8) | Unit and range recorded per field in a Rust-side field definition, not as DB columns | DB keeps only finiteness CHECKs | Matches current `isfinite` checks |
| LandXML `state`, IFC `State`, `ChangeAction` (S1, S2) | Do not reuse one `status` column for all three (P18) | Separate columns or tables when needed | |
| EPANET `Len` independent of X,Y (S6) | A stored *input* attribute allowed beside geometry, flagged as authoritative | CHECK optional | Revisits "derive, never store" for authoritative inputs (X4) |

### 5.2 Modules and types (ownership, capabilities, dependencies)

| Source example | Proposed boundary | Allowed dependencies |
|---|---|---|
| SolveSpace separate expression, solver, group modules (S10); EPANET separate `hydsolver`, `qualroute`, `input*`, `outfile` modules (S6) | One crate per owned vocabulary or procedure family; solvers separate from data types | Procedures depend on value types; value types depend on nothing (matches `geometry` crate today) |
| EPANET link `Kc` overloaded by type (S6) | Per-kind **enum with typed payloads**, not a base type with a shared field | The enum lives in the discipline crate |
| IFC subtypes restrict supertype capabilities (below) | Composition and capability traits, not inheritance | Capabilities (has-geometry, has-ports) as small traits |
| OpenSees licence (S11) | No dependency; study only | n/a |
| PROJ/GeographicLib (batch 1, S22) | Reuse behind a procedure interface | Pure functions; no I/O |

### 5.3 Procedures (inputs, outputs, preconditions, effects)

| Source example | Proposed contract shape |
|---|---|
| EPANET converts to internal units after reading (S6) | Importers are procedures: input file + declared units/axis order, output validated entities + loss report; effect: none until accepted |
| SolveSpace result codes (S10) | A solver returns `satisfied | redundant | not_converged | too_many_unknowns` plus residual and freedom count, not a bare bool |
| MATPOWER result columns on inputs (S15) | Results are a *separate* value tied to input revision and procedure version (P14) |
| G-code modal state (S13) | A procedure's preconditions must name any carried state it depends on; preferably none |
| OpenDRIVE: apply offset before PROJ (S9) | Order of coordinate operations is part of the contract, tested with a reference case |

### 5.4 File modules (external mapping, preservation, loss)

| Format | Mapping | Preservation / loss to report |
|---|---|---|
| LandXML (S1) | CgPoint, Line, Parcel, Alignment, Surface, PipeNetwork | Axis swap (north, east); redundant stored measures become checks; `Feature`/wildcards: preserve or report (batch 1 R8) |
| IFC4.3 (S2, S3) | Elements, relationships, placements, units, map conversion | Large surface; 876 entities; map a subset; every unmapped entity reported |
| OpenDRIVE (S9) | Reference line, lanes | Geometry kinds beyond line need curve support |
| EPANET `.inp` / SUMO plain XML (S6, S12) | Network + curves + patterns | Unit system, internal conversion, display vertices |
| MATPOWER / pandapower (S15, S16) | Bus, branch, std types | Per-unit bases; data-file licence differs from code (S15) |
| AGS 4.2 (S5) | Location, sample, geology groups | Licence: format use requires registration; summarise only |
| Gerber / KiCad (S17, S18) | Geometry + net attributes | Licence: Gerber forbids derivatives and renaming; KiCad GPL-3.0 code, format documented |
| BCF (S4) | External references by IFC GUID | Cross-document identity (P1) |

### 5.5 Presentation (views)

| Source example | Proposed view | Note |
|---|---|---|
| EPANET display vertices (S6), SUMO shape (S12) | Schematic vs geographic position are different data | A view must say which it uses |
| OpenDRIVE, LandXML (S9, S1) | Plan view, profile view, cross-section view from one alignment | Views over P4 |
| AGS depth (S5) | Borehole log view along depth | |
| KiCad vs Gerber (S17, S18) | Same connectivity shown as net highlighting | Needs P6 net semantics |
| All | Units shown in a display unit distinct from stored unit (EnergyPlus `\ip-units`, S8) | Persian/RTL numerals are a presentation concern, not a stored one |

### 5.6 Agent interface

| Source example | Proposed boundary |
|---|---|
| EnergyPlus IDD field metadata (S8) | Machine-readable field schema (type, unit, range, vocabulary, reference) is exactly what an agent needs to discover meaning; expose it, don't hide it in prose |
| OpenDRIVE rule ids (S9) | Return rule identifiers with violations so an agent can cite and look up |
| SolveSpace result codes (S10) | Distinguish "not converged" from "invalid input" for repair loops |
| AGS DICT/ABBR (S5) | Self-describing vocabularies: an agent should be able to ask what a code means |

### 5.7 Where SOLID helps and where a class hierarchy is wrong

- **Single responsibility: applies.** EPANET separates input parsing, hydraulic solver,
  quality routing and output into modules (S6); SolveSpace separates symbolic algebra
  from solver (S10). Matches "every procedure has one executable owner" (manifesto s7).
- **Open/closed: applies to vocabularies, not to base classes.** IFC extends by
  `PredefinedType` + `USERDEFINED` + `ObjectType`; AGS extends through DICT (S2, S5).
  Closed core plus declared extension, not subclassing.
- **Liskov substitutability: a hierarchy fails on the evidence.** In IFC4.3 RC4 the
  supertype `IfcElement` has inverse `HasOpenings` and `FillsVoids`, while its subtype
  `IfcFeatureElementSubtraction` carries WHERE rules `HasNoSubtraction` (no openings)
  and `IsNotFilling` (no fills) (S2). A subtype that forbids supertype capabilities
  cannot be substituted. `IfcRelAssociatesMaterial` also lists element kinds it
  rejects (S2). **Verified** on these two entities; how often it occurs across all 876
  is **[H]** (X10).
- **Interface segregation: applies.** Small capability traits (has geometry, has ports,
  has material association) over one broad `Element`.
- **Dependency inversion: applies at procedure edges.** Procedures take value types
  and capability traits; infrastructure (database, files) implements ports. Matches the
  manifesto's "values and calculations separate from effects".
- **Class hierarchy is wrong for:** link types with type-dependent fields (EPANET `Kc`),
  materials (P15), tolerance (P12), and relationships (P6). A tagged union per
  discipline plus composition fits the evidence; a single tree does not.

---

## 6. Unresolved questions and falsifiable experiments

Experiments are small, throwaway, and outside the repository (per batch 1). IDs continue
from batch 1 (E1 to E5). Thresholds are proposals for the founder to adjust.

| ID | Hypothesis | Method | Pass / fail |
|---|---|---|---|
| X1 | The P1 to P10 set covers the entities of real files across at least five systems | Take one small legitimately distributable file each (LandXML sample, IFC sample from IfcOpenShell tests, EPANET example `.inp`, a pandapower network, a KiCad schematic); list every field; classify as mapped, extension, or no home | Pass if at most ~20% of fields have no home and none of the omissions is a *structural* concept; fail otherwise |
| X2 | The binding site of a unit (per value vs per field) does not change results | Run EPANET on one network in two flow-unit systems; convert; compare heads and flows | Agreement within solver tolerance proves the internal-units boundary works; disagreement exposes conversion bugs |
| X3 | A parent-linked frame tree is enough for LandXML, IFC and OpenDRIVE georeferencing | Convert one point through each system's chain (map conversion, offset + PROJ) and compare | Agreement within 1e-3 m, or document the case that needs more |
| X4 | Link length is authoritative input in network solvers | Build a tiny EPANET network where `Len` differs from coordinate distance; change coordinates only, then `Len` only | Pass if results change only with `Len` (confirms P5 counter-example); fail if solver derives length |
| X5 | Net as hyperedge (Gerber/KiCad) cannot be represented by pairwise links without loss | Build a three-pad net both ways; query "are A and C connected" after deleting B | Pass if the pairwise form needs extra rules |
| X6 | Reusable composition is closer to type/occurrence than to aggregation | Model one repeated sub-assembly in IFC (type + instances) and in EnergyPlus (construction); compare operations | Judge by the number of special cases |
| X7 | A governed field schema can avoid EAV | Implement P11 on paper for EnergyPlus `Material`: columns vs declared fields; check queries and constraints | Fail if constraints cannot be enforced at the database |
| X8 | One constraint solver result vocabulary fits SolveSpace and a second solver | Read FreeCAD `planegcs` result states | Pass if the four-state vocabulary maps |
| X9 | Observations (P17) map to survey adjustment input | Convert a LandXML `RawObservation` set to GNU Gama XML; run | Adjusted coordinates return with covariance |
| X10 | Liskov-unsafe subtype rules are widespread in IFC | Script over `ifc43.exp`: for each subtype WHERE rule that forces an inverse of a supertype to be empty, count | Pass (hierarchy objection strong) if more than a handful; fail if rare |
| X11 | LandXML angle conventions: `angle` 0 = east, `direction` 0 = north (found in XSD) match a real file | Extends E4: read `dir` in a real file and plot | One convention confirmed |
| X12 | AGS depth-along-hole is linear referencing | Compare with deviated-hole data if a legitimate sample exists | Pass if the same mapping rules apply |

### Unresolved questions

- **Q1 (founder).** Which discipline follows surveying: road/alignment (LandXML,
  OpenDRIVE, IFC alignment evidence is strongest here), water networks (EPANET and
  SWMM are open and compact), or power (MATPOWER and pandapower are open and compact)?
- **Q2 (founder).** External identifiers: may an entity carry several scoped identifiers
  (IFC GUID, official `oID`, drawing tag)? This affects P1.
- **Q3 (founder).** Geometric kind versus engineering kind: should `Kind` stay
  geometric, with discipline kind a second axis (P5, P7)?
- **Q4 (founder).** Licence stance toward reuse: permissive only (MIT/BSD/Apache), or
  also weak copyleft (LGPL, MPL) as a library behind a process boundary? OpenSees is
  excluded by its terms; PostGIS/pandana/KiCad/SolveSpace are copyleft.
- **Q5 (founder).** Jurisdiction: are Iranian national codes and units in scope? No
  source was opened; availability **[U]**.
- **Q6 (founder).** Buying access to restricted standards (ISO, IEC, Eurocode, ASME) is
  possible but not assumed; confirm.
- **Q7 (founder).** Are simulation results stored data (P14) or recomputed on demand?
- **Q8.** Does a second revision-like concept (access state, lifecycle) belong in the
  milestone 2 design, or is Revision only the history concept? (P18)
- **Q9.** Gaps to close in a further batch: IFC publication licence text (the final
  4.3 ADD2), ISO 16739-1, EPSG terms, STEP/ISO 10303, WaterML 2.0, DIGGS, CIM/CGMES,
  LADM, Uniclass/ICMS, structural codes, RINEX/SINEX, FreeCAD `planegcs`, SWMM routing,
  OpenDSS licence, Gama licence.
- **Q10.** A migration `20261022000004_revisions.sql` appeared in a directory listing
  early in this session and was absent when I later read the tree; the state of
  milestone 2 work is therefore **[U]** here, and nothing in this study depends on it.

---

## 7. Source log

All accessed **2026-10-22** (UTC date of session), read from the primary source unless
noted. "Commit" is the repository HEAD at access. Licence is what was read, not legal
advice.

| ID | Source | URL | Version / commit | Licence / terms |
|---|---|---|---|---|
| S1 | LandXML 1.2 XSD (Survey, Alignment, Surface, PipeNetwork, state, angle types) | http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd | 225,951 bytes, "Date Posted 7/29/2008" (same size as batch 1) | Unknown (none in file) |
| S2 | buildingSMART IFC4.3 development repository, `reference_schemas/IFC4x3_RC4_43c3555.exp`, `docs/.../Qto_WallBaseQuantities.md` | https://github.com/buildingSMART/IFC4.3.x-development | commit `7256780bd9` (2026-10-12), schema header `IFC4X3_RC4` (a release candidate) | Repository: CC BY-ND 4.0 with notices; schema file header copyright buildingSMART 1996-2021; "no changes without consent" |
| S3 | IfcOpenShell; web-ifc; XbimEssentials | https://github.com/IfcOpenShell/IfcOpenShell; https://github.com/ThatOpen/engine_web-ifc; https://github.com/xBimTeam/XbimEssentials | HEAD pushes 2026-10-21, 2026-10-21, 2026-08-28 | LGPL-3.0; MPL-2.0; CDDL (LICENCE.md head) |
| S4 | BCF-XML, branch `release_3_0` (`markup.xsd`, `version.xsd`) | https://github.com/buildingSMART/BCF-XML | branch `release_3_0` (commit not recorded) | CC BY-ND 4.0 |
| S5 | AGS 4 Electronic Transfer of Geotechnical Data, Edition 4.2 (rules, LOCA group), PDF read with `pdftotext` | https://www.ags.org.uk/data-format/ags-4-2/ ; https://www.ags.org.uk/content/uploads/2026/01/AGS-v-4-2-December-2025.pdf | Edition 4.2, December 2025, ISBN 978-0-9957482-3-1 | © AGS, all rights reserved; summarised, not copied |
| S6 | OWA EPANET (`types.h`, `hydsolver.c`, `input1.c`) | https://github.com/OpenWaterAnalytics/EPANET | commit `4123b5c611` (2026-10-20), release v2.3.5 (2026-02-20) | MIT |
| S7 | USEPA Stormwater-Management-Model (`enums.h`, README) | https://github.com/USEPA/Stormwater-Management-Model | commit `07c371f8a0`, release v5.2.4 | README: "released in the Public Domain"; GitHub licence field empty |
| S8 | EnergyPlus (`idd/Energy+.idd.in`, `LICENSE.txt`) | https://github.com/NatLabRockies/EnergyPlus | commit `719fb0bec4` (2026-10-21), release v26.2.0 | BSD-style conditions + US Government notice (first paragraphs read) |
| S9 | ASAM OpenDRIVE 1.9.0 spec sections 8.3, 8.5, 9.2, 9.4 | https://publications.pages.asam.net/standards/ASAM_OpenDRIVE/ASAM_OpenDRIVE_Specification/v1.9.0/specification/index.html | v1.9.0 (BS 1.9.0, 2026-05-08) | "basic, non-exclusive and unlimited license to use the standard" |
| S9b | esmini | https://github.com/esmini/esmini | HEAD 2026-10-21 | MPL-2.0 (API field); not read further |
| S10 | SolveSpace `src/system.cpp` | https://github.com/solvespace/solvespace | master, release v3.3 | GPL-3.0 |
| S10b | FreeCAD (`Sketcher/App/planegcs` listing only) | https://github.com/FreeCAD/FreeCAD | HEAD 2026-10-21 | LGPL-2.1 |
| S11 | OpenSees docs (`model.rst`, `node.rst`) and COPYRIGHT | https://github.com/OpenSees/OpenSeesDocumentation ; https://github.com/OpenSees/OpenSees | docs commit `8ec2d8e63a`; code HEAD 2026-10-16 | UC Regents licence: non-commercial for external parties, internal use only otherwise |
| S12 | SUMO plain-XML network docs | https://sumo.dlr.de/docs/Networks/PlainXML.html ; https://github.com/eclipse-sumo/sumo | docs version not stated; repo HEAD 2026-10-21 | EPL-2.0 |
| S13 | LinuxCNC G-code overview | https://linuxcnc.org/docs/html/gcode/overview.html ; https://github.com/LinuxCNC/linuxcnc | docs version not stated | Repo GPL-2.0; docs licence not shown |
| S14 | GNU Gama | https://www.gnu.org/software/gama/ | version not stated | Page: CC BY-ND 4.0 for the page itself; software licence **Unknown** here |
| S15 | MATPOWER `lib/caseformat.m`, LICENSE | https://github.com/MATPOWER/matpower | commit `80b6e16f76` (2026-10-12), release 8.1 | BSD-3; case data files excluded |
| S16 | pandapower docs (`doc/elements/line.rst`, `doc/std_types.rst`), LICENSE | https://github.com/e2nIEE/pandapower | commit `e1ca123b53` (2026-10-21), release v3.5.6 | BSD-3-Clause |
| S17 | KiCad S-expression file format intro; source mirror | https://dev-docs.kicad.org/en/file-formats/sexpr-intro/index.html ; https://github.com/KiCad/kicad-source-mirror | docs version not stated | GPL-3.0 (code); format doc terms not shown |
| S18 | Gerber Layer Format Specification Rev. 2026.05 (PDF via `pdftotext`) | https://www.ucamco.com/en/gerber/downloads | Revision 2026.05 (19 May 2026) | © Ucamco; no redistribution, derivatives or renaming without approval; summarised |
| S19 | ngspice | https://github.com/ngspice/ngspice | HEAD 2024-06-09 | Heterogeneous, BSD-compatible per COPYING head |
| S20 | CityGML 3.0 Conceptual Model repo | https://github.com/opengeospatial/CityGML-3.0CM | HEAD 2026-10-16 | MIT |
| S21 | OGC GeoPackage Encoding Standard | https://www.ogc.org/publications/standard/geopackage/ | 1.4.0 (12-128r19) | © OGC 2026; terms not shown |
| S22 | PROJ; GDAL; PostGIS; UrbanSim; pandana | https://github.com/OSGeo/PROJ ; https://github.com/OSGeo/gdal ; https://github.com/postgis/postgis ; https://github.com/UDST/urbansim ; https://github.com/UDST/pandana | HEADs 2026-10-01 to 2026-10-21 | PROJ MIT-style (COPYING); GDAL composite (LICENSE.TXT); GPL-2.0; BSD-3-Clause; AGPL-3.0 |
| S23 | section-properties | https://github.com/robbievanleeuwen/section-properties | HEAD 2026-04-16 | MIT (API field) |
| S24 | HEC-DSS | https://github.com/HydrologicEngineeringCenter/hec-dss | not recorded | MIT (search listing) |
| S25 | 3MF core spec repo | https://github.com/3MFConsortium/spec_core | HEAD 2025-02-11 | BSD-2-Clause (API field) |
| S26 | UCUM | https://ucum.org/ucum | 2.2 (2024-06-17), first 100,000 of 262,102 characters read | © Regenstrief / UCUM Organization; licence page not read |
| S27 | QUDT | https://www.qudt.org/ ; https://github.com/qudt/qudt-public-repo | release not stated; repo HEAD 2026-10-21 | CC BY 4.0 |
| S28 | JCGM 100:2008, 101:2008, 102:2011 publication listing | https://www.bipm.org/en/committees/jc/jcgm/publications | listing only; documents not read | Free PDF; © BIPM, terms not shown |
| S29 | crates.io registry: `uom` 0.38.0 (Apache-2.0 OR MIT), `nalgebra` 0.35.0 (Apache-2.0), `geo` 0.33.1 (MIT OR Apache-2.0), `petgraph` 0.8.3 (MIT OR Apache-2.0), `i_overlay` 9.1.0, `truck-modeling` 0.6.0 (Apache-2.0), `proj` 0.31.0, `geographiclib-rs` 0.2.7, `dxf` 0.6.2 | https://crates.io/api/v1/crates/ | as listed, fetched 2026-10-22 | as listed |

### Sources tried and not used (so the absence is visible)

| Source | Result |
|---|---|
| ISO 10303 / ISO catalogue page | HTTP 403 |
| AGS data-format pages (rules) | Navigation only; rules read from the PDF instead |
| DIGGS page, WaterML 2.0 (docs.ogc.org/is/10-126r4) | no content / HTTP 404 |
| Uniclass 2015 (nationalbimlibrary.com) | redirect to a vendor page, not followed; **[U]** |
| OpenSees `model_cmd.html` | HTTP 404; read RST source instead |
| Gerber page for data model | page silent; read PDF instead |
| ASAM OpenDRIVE landing page | redirect only; read v1.9.0 sections |

### Corrections or additions to batch 1

- LandXML `positionalUncertainity` and `localUncertainity` are `xs:double` (S1); the
  declaration carries no unit or confidence-level field.
- LandXML defines two angle types: `angle` ("assume 0 degrees = east") and `direction`
  ("assume 0 degrees = north"); this refines H3 (S1).
- OpenSees licence is now read (S11): restrictive; batch 1 listed it as Unknown.
