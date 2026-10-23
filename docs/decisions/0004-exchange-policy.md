# ADR 0004: Exchange policy, open versioned standards through declared exchange profiles

Date: 2026-10-23 · Status: **proposed**, drafted to be locked by the maintainer. Three points are marked **⚑ confirm**;
locking means the maintainer changes this line to `locked` after settling them (the ledger rule: the AI drafts, the human locks).

Context: [manifesto](../manifesto.md) sections 3, 7 and 8; the research note
[exchange formats](../research/formats/exchange-format-landscape.md) (24 candidates, evidence labelled);
[Discussion #57](https://github.com/mbaneshi/bonyad/discussions/57) (what the catalogue becomes);
[issue #61](https://github.com/mbaneshi/bonyad/issues/61) (which entity model is the target); [ADR 0003](0003-procedure-registry.md).

## Problem

Users will want to bring files from AutoCAD, Civil 3D, Revit, 3ds Max and ArcGIS into Bonyad and take results back. Twenty-four
formats were proposed. Treating them as equal importers would define all of engineering exchange upfront (manifesto
section 9), would put closed formats at the foundation, and would let "we support IFC" mean anything. The research also
showed that an open export is not lossless (3ds Max's own glTF exporter drops animation, skin and morpher data and
flattens hierarchy), and that the format a program actually writes is often not the newest one (Revit 2026 exports IFC2x3
and IFC4, not IFC 4.3).

## Decision

1. **Bonyad has no proprietary exchange file.** Authoritative state is the PostgreSQL database and the domain model (manifesto
   section 4). Both may differ from any exchange standard. All exchange happens in adapters at the boundary. A portable
   backup or project package is a separate future decision.
2. **Cross-software exchange uses open, publicly specified, versioned standards.** That means formal standards, or openly
   documented specifications. A proprietary or undocumented format is never the canonical contract.
3. **The unit of support is an exchange profile, not a file extension.** Every supported format has a published profile
   that declares: the standard and its exact revision; accepted and produced encodings and packaging; the exchange purpose;
   the supported subset (entities, geometry representations, attributes, relationships); how extensions are handled
   (accepted, required, preserved or rejected); units, axes, handedness, coordinate reference and origin; the precision and
   tolerance policy; the identity policy for ids and references; the policy for older, newer and unknown versions; the
   validation rules and test fixtures; and the known losses.
4. **Import and export are separate claims.** A reader that accepts a file does not show that the writer reproduces its
   information. Each direction has its own profile entry.
5. **Results are reported honestly, in three separate outputs:** the run status (`succeeded`, `failed` or `unknown`), a loss
   report (preserved, converted, not transferred), and a validation result. A run can succeed and still lose information.
   "Lossless" is never claimed without a reference test. An exact solid exported as a mesh is a visualisation export, not a
   CAD round trip. A report about an imported file can only describe what that file lacked, not what the source project had.
6. **Formats are organised in tiers, and promotion needs a real scenario.** A format moves into the build set when a real
   project needs it, recorded in its profile with a real test file. The initial order is set by the real project (open
   decision O8).

| Tier | Formats |
|---|---|
| Core (eligible to build first) | IFC, LandXML, DXF, GeoPackage, glTF/GLB, LAS/LAZ/COPC (one point-cloud family) |
| Conditional (added when a workflow needs it) | OpenUSD, **⚑ STEP AP242**, **⚑ E57**, **⚑ GeoJSON** (through GDAL, no own parser), CityGML, 3MF |
| Separate lane, never in the geometry list | IDS (validation, requirements), BCF (collaboration). Promoted to the first release only if BIM checking becomes product scope. |
| Not imported directly | DWG (including Civil 3D objects), RVT, MAX, FBX, Esri File Geodatabase, Shapefile, OBJ, STL |

7. **Proprietary, native and legacy formats are optional compatibility adapters,** added only when real customer files
   justify them, and only by a route that respects the no-reverse-engineering rule (Discussion #57, section 4) and the
   licence assumption O1: the open format the program exports, a licensed library, or a service. Shapefile and File
   Geodatabase (vector layers only) arrive through GDAL when needed. The preferred submission routes are IFC for Revit,
   glTF or USD for 3ds Max, DXF and LandXML for AutoCAD and Civil 3D, and GeoPackage for ArcGIS.
8. **Each profile pins the latest stable published definition at adoption and lists older versions it reads where real
   exporters still produce them.** Baselines found on 2026-10-23, each to be re-confirmed when its profile is written:

| Format | Target | Older versions to read |
|---|---|---|
| IFC | 4.3.2.0 (ISO 16739-1:2024) | 2x3 TC1, 4 ADD2 TC1 (Revit exports these), 4x3 RC4 (Civil 3D can still export it) |
| LandXML | 1.2 (2008; 2.0 is a draft) | none identified |
| DXF | R2018 format | older formats as the reference allows; `3DSOLID` data preserved, not interpreted |
| GeoPackage | 1.4.0 | none identified |
| glTF | 2.0 (ISO/IEC 12113:2022) and named ratified extensions | none |
| LAS family | LAS 1.4 R16 or 1.5 R00 (to be named in the profile); LAZ 1.4; COPC 1.0 | LAS 1.4 R15 and earlier |
| OpenUSD | Core Specification 1.0; release 26.11.1 | none |
| STEP AP242 | ISO 10303-242:2025 | AP214, AP203 if met |
| E57, GeoJSON, CityGML, 3MF | ASTM E2807 v1.0; RFC 7946; OGC 3.0; ISO/IEC 25422:2025 | none |

9. **Constraints on the file module's design** (the module itself is not designed here):
   the original file is stored content-addressed with its dependent files (xrefs, textures, buffers) as one import package;
   a stable source-document identity sits above any file version, with an external-id map, so a re-import compares three
   states (the base version, the current Bonyad state, the incoming file); the upload writes bytes first and the model change
   is then accepted in one PostgreSQL transaction with `expected_revision`, because storage and the database share no
   transaction; unparsed content is kept only as an opaque residue tied to the stored original and is never a queryable
   attribute bag (manifesto section 8); the declared unit is recorded, confirmed or overridden by the user, and the applied
   conversion stored; and an adapter is accepted on a reference fixture checked by an independent reader, not on a round trip
   alone.

## Alternatives considered

| Option | Why not |
|---|---|
| Support all 24 as equal importers | Defines all of exchange upfront; makes closed formats foundational |
| Make native importers the foundation (RVT, DWG, MAX, FBX) | Closed or undocumented; needs a licensed library or reverse engineering, which is ruled out |
| Claim support by extension ("we support IFC") | Hides the version, subset and losses; Revit's IFC export alone spans three schemas |
| Nine core families for a general interoperability application (STEP, E57 and GeoJSON as core) | A market-wide scope. Bonyad proves one scenario at a time, and B-rep is out of scope (O3) |
| A Bonyad exchange file | Adds a private format nobody asked for; exchange belongs to standards |

## Consequences

- No importer is built by this decision. The file module waits behind the entity-model decision (#61), the procedure
  registry (ADR 0003 and its reconciliation) and Discussion #57, and starts with one format and one real file.
- The IFC and OpenUSD catalogue pins need a stable target (IFC is on RC4, OpenUSD on a development commit). RC4 stays
  readable.
- The DXF header, which carries the declared unit, needs a place in the catalogue, and the milestone 3 spec's line that DXF
  coordinates are "unitless" is corrected: they are bare numbers with a declared unit that may be unspecified.
- Every profile and its test file become a reviewable artefact, so a claim of support can be checked.

## Verification (to be written as tests)

1. The first profile (a bounded DXF subset from a real file) imports, is edited, exports, opens in an independent reader or
   the target program, and imports again, with units and geometry preserved, no duplicate entities, a surfaced conflict when
   both sides changed the same object, and a report of every unsupported item.
2. A profile missing any item of decision 3 is refused at review.
3. A run that succeeds with losses reports its losses; `unknown` is never shown as success.

## Points to confirm before locking

| # | Question | Draft answer |
|---|---|---|
| ⚑1 | STEP AP242 core or conditional? | Conditional: exact B-rep is out of scope (O3) |
| ⚑2 | E57 core or conditional? | Conditional: add when a terrestrial-scan workflow exists; it is not redundant with LAS |
| ⚑3 | GeoJSON core or conditional? | Conditional, through GDAL; no own parser |
