# Exchange formats: which are open bridges between software, and what overlaps

**Body of knowledge:** A (formats and exchange). **Disciplines:** CAD, BIM, civil and survey, GIS, 3D scenes, point clouds.
**Status:** research note, not a decision. It feeds the file-module design; nothing here changes ADR 0003 or any code.

## Question

For the 24 import candidates the maintainer listed (DXF, DWG including Civil 3D objects, LandXML, IFC, RVT, glTF/GLB,
OpenUSD in four containers, MAX, FBX, GeoPackage, GeoJSON, Shapefile, Esri File Geodatabase, 3MF, OBJ, STL, LAS, LAZ,
COPC, E57, STEP AP242, CityGML, IDS, BCF): which are open standards that bridge software ecosystems, which carry
the same content as another, and which can be left out?

## How to read this note

Three questions per format, kept separate (an earlier draft mixed them):

1. **Standing.** Formal standard (an independent body governs it), openly documented (public specification, vendor or
   community controlled), or proprietary.
2. **What it carries.** Shape only, engineering meaning (objects, properties, relationships), or something that is not
   model data at all (requirements, issues).
3. **Can another supported route replace it** for what users actually need?

Evidence labels: **V** read in an official or primary source on 2026-10-23; **R** reported by a secondary or single
source; **U** general knowledge, not checked.

## Findings per format

| # | Format | Standing | Baseline (latest stable found) | Carries | Evidence |
|---|---|---|---|---|---|
| 1 | DXF | Openly documented, Autodesk-controlled. The reference leaves `3DSOLID` data as "proprietary data" and does not describe it. | R2018 format. AutoCAD 2026 writes it; 2027 reportedly the same. | Drawings and geometry. Unit only through the header `$INSUNITS` hint; value 0 means unspecified. | V (solids, `INSUNITS` meaning), R (2026/2027 format) |
| 2 | DWG (+ Civil 3D objects) | Proprietary. Third-party access through the Open Design Alliance or Autodesk RealDWG. Civil 3D objects are proprietary custom objects. | 2018 format | Native drawings | R |
| 3 | LandXML | Public schema, consortium; not ISO or OGC. Licence text not found in the XSD. | 1.2 (2008) is the last final release; 2.0 has been a draft since 2014. | Survey and civil: alignments, surfaces, parcels, pipe networks | V (XSD, see `landxml-1.2.md`), R (2.0 status) |
| 4 | IFC | Formal: ISO 16739-1:2024. | **IFC 4.3.2.0** (= 4.3 ADD2). Revit 2026 exports IFC2x3 views and IFC4 Reference/Design Transfer views, no IFC 4.3. Civil 3D's extension imports IFC 4, 4x1, 4x2, 4x3 and exports IFC 4, 4x3 RC4 and 4x3. | Building and infrastructure objects, properties, relationships | V (ISO status, Revit options), R (Civil 3D extension) |
| 5 | RVT | Proprietary | n/a | Revit project | U |
| 6 | glTF / GLB | Formal: ISO/IEC 12113:2022; Khronos keeps adding ratified KHR extensions. | glTF 2.0 | Renderable scenes. `.glb` is a container of the same model. 3ds Max 2026 exports it natively, without animation, skin, morpher or vertex colours, and flattens hierarchy. | V |
| 7 | OpenUSD (USD, USDA, USDC, USDZ) | Core specification ratified by AOUSD (Linux Foundation); open-source implementation. | Core Spec 1.0 (Dec 2025); software release 26.11.1 (21 Oct). 3ds Max exports meshes, materials, cameras, lights, blendshapes; `.usdz` export only. | Composed scenes. Four containers, one model. | V (release, Max), R (Core Spec 1.0) |
| 8 | MAX | Proprietary | n/a | 3ds Max scene | U |
| 9 | FBX | Proprietary and **undocumented**; the SDK may not be redistributed without Autodesk's written permission; Blender's specification is a reverse-engineered approximation. | n/a | Scenes, meshes, cameras, lights, animation | V (Library of Congress) |
| 10 | GeoPackage | Formal: OGC | **1.4.0** (12-128r19, approved 2023-12, published 2024-02) | GIS vectors, attributes, tiles, extensions in SQLite | V |
| 11 | GeoJSON | Formal: IETF RFC 7946 (Proposed Standard, 2016) | RFC 7946 | Simple features and properties, WGS 84 only | V |
| 12 | Shapefile | Openly documented, Esri-origin; not independently governed | Esri technical description, July 1998 | Legacy vector features in a multi-file set | V |
| 13 | Esri File Geodatabase | Proprietary. GDAL's `OpenFileGDB` driver reads, writes and updates vector layers since GDAL 3.6, rasters since 3.7. Limits: SDC/CDF compressed data unsupported, 64-bit OBJECTIDs read-only and incomplete, transactions emulated with unspecified concurrent behaviour. | n/a | Esri datasets | V (GDAL docs) |
| 14 | 3MF | Formal: ISO/IEC 25422:2025 | Core 1.3.0 published; 1.4.0 listed as latest revision | Additive-manufacturing models, units, materials | R |
| 15 | OBJ | De facto. No standards body; informal specification (an appendix of an old manual) with no authoritative copy; ownership "probably proprietary to Autodesk"; no formal licence statement. Companion MTL and texture files are needed for appearance. | n/a | Surface geometry, materials via MTL | V (Library of Congress) |
| 16 | STL | De facto. Proprietary (3D Systems) but openly documented; no formal governance and no single full specification. | n/a (ISO/ASTM 52915:2020, AMF, was meant to replace it; adoption unclear) | Triangular surface only: no units, no colour, one object per file | V (Library of Congress), R (AMF) |
| 17 | LAS | Industry specification, ASPRS | **1.4 R16 and 1.5 R00** (both 2025) | LiDAR and survey point clouds | V |
| 18 | LAZ | OGC Community Standard (LAZ 1.4, R1, 2025-11-15). Reference implementation LASzip is Apache 2.0 since October 2021. | LAZ 1.4 | The LAS data, losslessly compressed | R |
| 19 | COPC | Community specification (Hobu) | 1.0 | A strict subset of LAZ 1.4: point formats 6 to 8 plus required records, organised as an octree. Any LAZ 1.4 reader can read it sequentially. | R |
| 20 | E57 | Formal: ASTM E2807 | v1.0; vendor listing shows E2807-11(2026) | Terrestrial scanner data: points, images, scan poses | R |
| 21 | STEP AP242 | Formal: ISO 10303-242 | **ISO 10303-242:2025** (4th edition); a further edition is at committee draft | Exact solids, assemblies, product and manufacturing information | R |
| 22 | CityGML | Formal: OGC | 3.0 (conceptual model 2021; GML encoding adopted later) | Semantic city-scale models | R |
| 23 | IDS | Formal: buildingSMART | 1.0 (approved June 2024) | **Not model data.** Machine-readable information requirements on IFC objects, properties, classifications, materials and values. Licence terms not found. | V (scope), U (licence) |
| 24 | BCF | Formal: buildingSMART | 3.0 is current; BCF-XML and BCF-API are separate specifications | **Not model data.** Issues, comments, viewpoints | R |

## Overlap

**Same model, several containers (count once):** glTF and GLB; the four USD containers; LAS, LAZ and COPC. Reading LAZ
does not mean exploiting COPC: reading the points and fetching only the needed octree regions are different capabilities.

**Open twin of a closed original:** DXF for DWG, IFC for RVT, glTF and USD for MAX and FBX, GeoPackage for File Geodatabase.

**Different standards covering similar content:** LandXML and IFC 4.3 (alignments, surfaces, pipe networks); GeoPackage,
Shapefile, GeoJSON and File Geodatabase (vector features); glTF, USD, OBJ, STL and 3MF (triangle meshes); LAS and E57
(point clouds, but E57 also carries scanner context and images); STEP and DXF `3DSOLID` (exact solids).

**Not geometry exchange:** IDS (requirements) and BCF (issues). They belong to a validation and a collaboration module,
not the file module.

**Overlap is not equivalence.** IFC, STEP, glTF and CityGML each answer a different question (what is this element,
what is the exact engineered shape, how is it rendered, where does it sit in a city model). Converting everything to GLB
is a visualisation strategy, not a way to preserve engineering information.

## Three kinds of omission

| Kind | Meaning | Safe when |
|---|---|---|
| Merge a family | One importer for glTF and GLB, for the USD containers, for the LAS stack | always, but advertise support only for variants that are implemented and tested |
| Omit a native format | RVT, MAX, DWG, FBX, File Geodatabase | users can export a suitable open route, and the loss of that route is stated |
| Defer a legacy format | Shapefile, OBJ, STL | the exchange contract is under our control; existing customer files may still justify it |

## Calls for Bonyad

Bonyad is a foundation that proves one real scenario at a time under a no-reverse-engineering rule; it is not a general
converter. So the calls below are smaller than a market-wide list would be, and the first format follows the real project
(open decision O8).

| Call | Formats |
|---|---|
| Build, in an order set by the real project | DXF, LandXML, IFC (read 2x3, 4 and 4.3), GeoPackage, glTF, OpenUSD, LAS/LAZ/COPC |
| Through GDAL, no own parser | GeoJSON, Shapefile, File Geodatabase (vector only) |
| Defer | E57, STEP AP242 (B-rep is out of scope, O3), CityGML, 3MF, STL, OBJ |
| Omit as direct imports | DWG, RVT, MAX, FBX |
| Separate lane | IDS (validation, a case study for a `Requirement` concept, not for geometric constraints or solving), BCF (collaboration) |

## Findings about the catalogue and the plan

- The IFC catalogue is built from `reference_schemas/IFC4x3_RC4.exp` (issued 2021-07-22). The pinned upstream commit is
  the head of the development repository, but its schema directory stops at RC4 and holds no final 4.3.x file.
  Civil 3D can still export RC4, so the reader must keep accepting it. The location of the 4.3.2.0 schema was not found.
- The USD catalogue is pinned to development commit `bc32a65`, which has diverged from tag `v26.11.1` (21 commits only in
  the release, 49 only in the pin). It is a development snapshot, not a release.
- The same IFC schema directory contains `IFC2X3_TC1.exp` and `IFC4_ADD2_TC1.exp`, the schemas Revit actually exports.
- The `acad` catalogue has `insunits` on `block_record` only. The drawing-level DXF header, where the declared unit
  lives, is not a catalogued type. The merged milestone 3 spec (section 10) says DXF coordinates are "unitless"; the
  coordinates are bare numbers, and the declared unit is a hint, so that line needs a correction.
- Open loss before arrival: 3ds Max's own glTF exporter drops animation, skin, morpher and vertex colours and flattens
  hierarchy, so an "open export" is not lossless. A report can only describe what the exported file lacked.

## Exchange contract (proposed record per real path)

Exporting software and version; format, version and profile; entities supported; what is preserved, approximated or lost;
declared unit and coordinate system, and who confirmed them; acceptance test with a real file and an independent reader.

## Cross-check against an independent review (2026-10-23)

A second written review of the same 24 formats agrees on the standing of 20 and on the main architecture:
IDS and BCF leave the geometry list; LAS, LAZ and COPC form one family; glTF and USD are families; open-versus-native is
decided by what users can export. It differs in three ways.

- **Scope of the product.** It assumes a general interoperability application and recommends nine core families plus
  seven compatibility adapters. Bonyad proves one scenario first, so its list is longer than this note's.
- **Calls that differ.** E57 and STEP AP242 (kept there, deferred here), GeoJSON (a core family there, through GDAL here),
  DWG, RVT, FBX, OBJ, STL (compatibility adapters there, omitted or deferred here).
- **Gaps in that review.** It gives no version baselines, so it does not meet the need to attach each format to its latest
  stable definition. It does not mention the IFC version matrix (Revit exports IFC2x3 and IFC4, not 4.3), GDAL's File
  Geodatabase driver, the catalogue's RC4 and development-commit pins, or 3ds Max's documented glTF limits. Several
  claims rest on secondary sources.

Points taken from that review: the three-question frame above; the three kinds of omission; "reading LAZ is not
exploiting COPC"; E57 is not simply redundant with LAS; an old format is not redundant as an input just because a newer
one exists; a legacy input may be justified by customer files.

## Not verified

BCF 3.0 release date and whether a newer 3.x exists; Autodesk's current complete DXF reference; Civil 3D's exact IFC
schema revision in current builds (Autodesk's support page returned 403); the IDS licence terms; the latest glTF
extension list; whether 3ds Max 2026 imports glTF natively; whether LAS 1.5 breaks 1.4 readers; the location of the final
IFC 4.3.2.0 schema; ODA's current licensing; ArcGIS exporting GeoPackage (general knowledge).

## Sources (accessed 2026-10-23)

buildingSMART: IFC 4.3 approved; IDS 1.0. Autodesk: Revit 2026 IFC export setup; 3ds Max 2026 glTF export; AutoCAD
`INSUNITS`; DXF reference (`3DSOLID`); Civil 3D IFC 4.3 blog (2023); 3ds Max USD help (2025). Khronos: glTF 2.0 ISO release.
AOUSD and Linux Foundation: OpenUSD Core Specification 1.0; GitHub releases of PixarAnimationStudios/OpenUSD. OGC:
GeoPackage 12-128r19; CityGML; LAZ 1.4 community standard. IETF RFC 7946. Esri: shapefile technical description. GDAL:
OpenFileGDB driver. ASPRS: standards page. COPC specification. 3MF Consortium specification page. ISO: 10303-242, ISO/ASTM
52915. Library of Congress format descriptions for OBJ (fdd000507), STL (fdd000504), FBX (fdd000558). GitHub API for
`buildingSMART/IFC4.3.x-development` and `PixarAnimationStudios/OpenUSD`.
