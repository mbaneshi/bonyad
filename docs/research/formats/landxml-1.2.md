# LandXML 1.2: schema study

**Body of knowledge:** A (formats and exchange). **Discipline:** surveying, civil.

## Source

| Item | Value |
|---|---|
| Artifact | `LandXML-1.2.xsd` (225,951 bytes) |
| URL | http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd |
| Version / date | `version="1.2"`; file comment "Date Posted: 7/29/2008", edited by an Autodesk author |
| Accessed | 2026-10-21, downloaded with `curl`, read locally |
| Licence / terms | **Unknown.** The file contains no copyright or licence text (`grep -i 'copyright\|license'` found nothing). Terms on the landxml.org site were not reachable (connection reset twice). |

## What the schema defines (all **Verified** from the XSD)

- **Root `LandXML`** may contain, in any order and repeatedly: `Units`,
  `CoordinateSystem`, `Project`, `Application`, `Alignments`, `CgPoints`, `Amendment`,
  `GradeModel`, `Monuments`, `Parcels`, `PlanFeatures`, `PipeNetworks`, `Roadways`,
  `Surfaces`, `Survey`, `FeatureDictionary`.
- **Units** is a *choice* of `Metric` or `Imperial`. Each declares area, linear, volume,
  temperature and pressure units (required), plus optional diameter, width, height,
  velocity and flow units, and `angularUnit`, `directionUnit`, `latLongAngularUnit`
  (default "decimal degrees"), `elevationUnit` (default "meter").
- **Angles and directions** default to radians. The schema's own documentation says
  angular values are "measured counter-clockwise from east=0" and horizontal directions
  "counter-clockwise from 0 degrees = north". Survey practice usually measures bearings
  *clockwise* from north, so this is worth a test file before any import (hypothesis H3).
- **`CgPoint`**: "COrdinate GeOmetry Point", identified by a `name` attribute. Its text
  content is "two or three double numeric values: (Northing Easting) or (Northing
  Easting Elevation)". Further attributes include `oID` (official ID), `pntSurv`,
  `surveyOrder`, `zoneNumber`, `localUncertainity` and `positionalUncertainity`
  (sic, spelled as in the schema).
- **Point reference:** every point-typed element (`Start`, `End`, `Center`, `PI`) holds
  either coordinates inline, or a `pntRef` naming a point elsewhere in the file, or both;
  if both, the inline coordinates are the location and the reference is informational.
- **`CoordGeom`** is "a sequential list of Line and/or Curve and/or Spiral elements"
  (also `IrregularLine`, `Chain`). **`Line`** has required `Start` and `End`, and optional
  `dir`, `length`, `name`, `oID`, `staStart`, `state`.
- **`Parcel`** requires `name`; carries `CoordGeom`, optional `Center`, `Title`,
  `Exclusions`, nested `Parcels`; and attributes including `area` (double), `oID`,
  `owner`, `parcelType`, `taxId`, `dirClosure`, `distClosure`. `Parcels` enforces unique
  parcel names (`xs:unique`).
- **`CoordinateSystem`** is a deliberately "simplified" description reusing EPSG: an
  `epsgCode` string, `ogcWktCode`, datum names, `ellipsoidName`, and many name fields
  for geographic, projected, vertical and local systems. It is optional.
- **Extension:** `Feature` (with `Property` label/value pairs and `DocFileRef`) carries
  data "not explicitly defined by the LandXML schema". The schema also has 6 live `xs:any`
  wildcards (all `namespace="##other" processContents="skip"`; two further `##any`
  wildcards are commented out) and 2 `xs:anyAttribute`, which allow foreign-namespace
  content. Whether a given consumer *preserves* unknown content is a property of
  implementations, not of the schema (**Unknown**; see `proposals/next-batch.md`, E3).

## Interpretation

1. LandXML separates **named reference points** (`CgPoints`) from **geometry that may
   or may not reference them**. That is the same fork Bonyad made in ADR 0002 item 2
   (independent geometry now, binding later). The standard supports both.
2. `area`, `length`, `dir` are **stored, redundant** values on `Parcel` and `Line`.
   Bonyad derives length and area and never stores them (ADR 0001 item 4). On import
   these become *claims to check*, not facts: recompute and compare.
3. `Units` is project-level and rich (area, volume, pressure...), while the slice has one
   `unit` string on the project. LandXML covers units for later disciplines (pipes,
   flow) that Bonyad has not needed yet.
4. Coordinate order *north, east* is a trap for any importer that assumes x, y. See
   `mappings/point-line-surface.md` and the reference case in `procedures/polygon-area.md`.

## Not studied

`Survey` (instrument observations), `Alignments`, `Surfaces` (TIN), `PipeNetworks`,
`Roadways`, and the `FeatureDictionary`. Observations are the most relevant for the
surveying proof path; they are the first candidate for batch 2.
