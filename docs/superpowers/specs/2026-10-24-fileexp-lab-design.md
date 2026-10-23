# File-exchange lab: design

Status: draft for review. Nothing here is a decision; the lab is an experiment space and the product does not depend on it.

## 1. Purpose

Learn what exchange formats, real tasks and SDK behaviour reveal about primitives, composition rules and procedure
boundaries, in a space that cannot touch the product. The lab produces **conclusions** (research notes), not product code.

It supports the research-first method: formats are evidence for the model, never its definition. Format accidents must
not leak into Bonyad's core.

## 2. Non-goals

- No product feature, no UI, no importer shipped to users.
- No native closed formats (DWG, RVT, MAX, FBX). Only open, versioned standards; native apps matter only as producers of
  open-format fixtures from apps the maintainer legitimately holds.
- No reverse engineering of any binary or undocumented grammar.
- No claim of "support" by extension. Support means: a named version, a stated subset, a loss report, a reference
  fixture checked by an independent reader.
- No third model. Nothing in the lab is a second source of truth for the product.

## 3. Isolation rules

| Concern | Rule |
|---|---|
| Code | `labs/fileexp/` with its own Cargo workspace. Not a member of `logic/`; nothing in product code imports it. |
| Database | A separate database `bonyad_lab` on the same server. Own migrations, no foreign keys or views into `bonyad.*`, `core.*`, `acad.*`, `proc.*` or `skill.*`. Disposable: `dropdb`, `createdb`, migrate. |
| CI | A separate scheduled and on-demand job. It is not a required check on product PRs. |
| Output | Generated code and SQL live only under `labs/fileexp/`. Harvested catalogue schemas stay DBML-only in the product (Discussion #57 section 4); SQL and Rust for them exist only inside the lab. |
| Exit | Only research notes leave the lab. Code moves to the product only by a separate decision. |

## 4. Pipeline

```
formats/<name>.yaml  ->  harvest  ->  catalogue YAML  ->  generate  ->  adapter skeleton  ->  conformance  ->  report
```

| Stage | Input | Output | Automation |
|---|---|---|---|
| Registry | `formats/<name>.yaml` | pinned format list | written once; a version watcher reports newer versions and never bumps a pin |
| Harvest | official schema (XSD, EXPRESS, JSON Schema, spreadsheet spec, SDK docs) | `catalogue/<schema>/<type>.yaml` | one harvester per format; no generic harvester is promised |
| Generate | catalogue YAML | DBML, SQL tables, Rust types and row types | the existing `tools/catalogue` generator, pointed at the lab |
| Adapter skeleton | generated types plus a mapping file | reader and writer stubs with a loss-report hook | stubs generated; the mapping is written by hand |
| Conformance | fixture plus an independent reader | pass or fail, loss report | automated |
| Report | all runs | coverage table per format and version | automated |

The hand-written **mapping** (what a format's type means in Bonyad terms) is the research judgement and is deliberately
not automated: automating it would hide the evidence the lab exists to produce.

Rules: generated files are never edited (fix the YAML or the generator); one command per format (`lab run <format>`);
generated headers record the exact standard, tool and generator versions so a rebuild is reproducible.

## 5. Registry entry

Each `formats/<name>.yaml` records: the standard and exact revision; the official source URL; the licence of the
specification text and of any reference SDK; open or closed; readable without payment (yes, no, unverified); the older
versions to read; fixture sources with licence and checksum; the independent reader to check against; and an evidence
status per claim (Verified, Reported, Unverified) with the date.

## 6. Format scope

Pins are the 2026-10-23 baseline from ADR 0004 (parked draft) and are re-confirmed by the version watcher before use.

| Group | Format | Pin to re-confirm | Evidence |
|---|---|---|---|
| Geometry and civil | LandXML | 1.2 | repo research; catalogue has 170 types |
| Geometry | DXF | R2018 | repo research; `3DSOLID` preserved, not interpreted |
| BIM | IFC | 4.3.2.0 (ISO 16739-1:2024); read 2x3, 4 ADD2, 4.3 RC4 | repo research |
| GIS | GeoPackage | 1.4.0 | repo research |
| Visualisation | glTF | 2.0 (ISO/IEC 12113:2022) | repo research |
| Point clouds | LAS, LAZ, COPC | LAS 1.4 R16 or 1.5 R00, LAZ 1.4, COPC 1.0 | repo research |
| Scene | OpenUSD | Core Specification 1.0; release 26.11.1 | repo research |
| Tabular | CSV | no standard version; each use needs a declared profile (columns, units, coordinate order, delimiter, encoding) | n/a |
| Structural | SAF | documentation 2.2.0 (C# SDK 1.7.3, Apache-2.0) | Verified 2026-10-24: Excel-based `.xlsx`; examples for 2.2.0 to 1.0.5; the specification text's licence is **unverified** |
| Structural | IFC structural analysis domain | IFC4 ADD2 TC1 (tag `IFC4.0.2.1`) | Verified 2026-10-24 from buildingSMART's GitHub source: in scope are curve and surface members, connections and supports, loads with groups, cases and combinations, and force and displacement results; out of scope are dynamic analysis, prestressed loads, finite-element topology, and detailed mesh results, stresses and strains. This applies to that release only |
| Structural | CIS/2 (STEP) | no version stated by CSI | Verified: ETABS documents import and export; version and field coverage unverified |
| Structural | STEP AP209 | not pinned | Reported: NIST's example shows finite elements, boundary conditions, loads and displacement results; not fetched by us, and CSI support is unestablished |
| Structural | CSI `.s2k`, `.e2k`, `.f2k` | none | Verified that the commands exist; a complete public format specification **has not been located**, so no independent parser is written (see section 8) |
| Conditional | STEP AP242, E57, GeoJSON, CityGML, 3MF | see ADR 0004 | open questions in the parked ADR |
| Geometry (not structural) | SAB (ACIS binary) | none | Verified as Spatial's solid-geometry format; low priority, grouped with STEP |

Structural findings checked on 2026-10-24 against primary pages:

- SAP2000, ETABS and CSiBridge support IFC 2x3 and IFC 4 import and export (CSI ETABS features page).
- CSI's IFC technical note is dated October 2013 and covers ETABS 2013.1.2 or later and SAP2000 16.0.2 or later; it is
  historical evidence of what transfers, not a description of current releases. It says structural analysis view files
  are the best import and are "written by very few if any 3D building modeling programs"; architectural files import
  only when the geometry is described in a usable way and usually need endpoint adjustment.
- SAP2000's warning that a text file "does not contain all of the information about the model" applies to the automatic
  `.$2k` recovery file saved beside the `.SDB`, not to deliberate `.s2k` exports.
- SAFE's File > Import lists `.F2k`, DXF/DWG, an architectural plan, `.mdb` and `.xls`; IFC is not listed. Native IFC
  in SAFE is unresolved.
- ETABS export lists `.e2k`, tables to Excel and Access, a partial `.edb`, a SAFE `.f2k`, DXF/DWG, CIS/2 STEP, a steel
  detailing neutral file, IFC and IGES.

## 7. Experiments, in order

1. **Pipeline on LandXML.** Harvest, generate, one real fixture, independent reader. Establishes that the pipeline runs
   end to end. Does not establish that LandXML's types are Bonyad's primitives.
2. **Own experimental format (`lab-format`).** A small versioned text format with header, unit and records, plus reader,
   writer and a round-trip test. Tests identity, units and loss reporting. It is an experiment, never a product format
   (ADR 0004 rejected a Bonyad exchange file as a feature; this does not reopen that).
3. **CSV profile.** One survey-point profile (point number, northing, easting, elevation, code) with declared units and
   axis order. Tests the profile mechanism.
4. **DXF adapter** against a real AutoCAD export, checked with an independent reader. Tests entity mapping and
   `$INSUNITS` handling.
5. **SAF schema harvest.** Spreadsheet-based harvest, which differs from XSD or EXPRESS. Tests whether the pipeline
   generalises.
6. **Structural comparison.** SAF against the IFC structural analysis domain: which concepts coincide (members, supports,
   loads, load cases and combinations, results) and which differ. Research note only.

After each: record what held, what broke and what the check cannot establish.

## 8. Rules on closed or unspecified formats

The CSI text formats are readable but their grammar is not published in the pages checked. Until a published
specification is located, the lab writes no independent `.s2k`, `.e2k` or `.f2k` parser. CSI's documented API is a
separate route to investigate later and is outside this spec.

## 9. Acceptance for the lab itself

- `lab run <format>` runs the full pipeline for any registered format, offline once fixtures are cached.
- Dropping and recreating `bonyad_lab` yields an identical state.
- A product build and the product test suite pass with the `labs/` directory deleted.
- Every registry claim carries an evidence status and date.

## 10. Open questions

- Separate database or schema (recommended: separate database).
- Whether the first format is LandXML (fits the surveying path) or DXF (fits the AutoCAD pilot).
- The licence of the SAF specification text and examples.
- Native IFC support in SAFE.
- What each application and version actually preserves, established only by exchange tests.
- Where the version watcher runs and who reviews its reports.
- Whether the lab survives once the core model exists, or is deleted (a README states the deletion condition).

## 11. Relationship to parked work

ADR 0003, ADR 0004, the milestone 3 spec and the ports draft are parked until the core model is defined. This lab keeps
and builds on the two things kept: the entity inventory (`catalogue/`) and the file-format research
(`docs/research/formats/`). It makes no decision that those documents propose.
