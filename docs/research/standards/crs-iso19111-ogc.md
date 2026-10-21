# Coordinate reference systems: ISO 19111 and OGC 18-005r5

**Body of knowledge:** B (standards and domain semantics). **Type:** data-model standard
(conceptual schema). It is not an exchange format and not a calculation standard.

## Source

| Item | Value |
|---|---|
| Document | OGC Abstract Specification Topic 2: *Referencing by coordinates*, Corrigendum |
| Number / version | OGC 18-005r5, version 5.0.1 |
| Dates | submitted 2021-02-23, approved 2021-03-26, published 2021-07-02 |
| Aligned with | ISO 19111:2019 (third edition); replaces ISO 19111:2007 and ISO 19111-2:2009 |
| URL | https://docs.ogc.org/as/18-005r5/18-005r5.html |
| Accessed | 2026-10-21; first 100,000 of 215,143 characters read |
| Access terms | Copyright OGC 2021; described on the page as an OGC Member-approved international standard "on a royalty free, non-discriminatory basis". Further rights point to ogc.org/legal (not opened). The ISO text itself is **not** read here. |
| Jurisdiction | International; no regulatory force by itself |

## Verified from the page

- A **coordinate reference system (CRS)** is a "coordinate system that is related to an
  object by a datum" (clause 3.1.9). A **datum** is the parameter or set of parameters
  that fixes origin, scale and orientation of a coordinate system (3.1.15).
- Scope covers spatial, parametric, temporal and compound CRSs, plus **coordinate
  operations** (conversions, transformations, point motion) and optional **coordinate
  metadata**.
- A **geodetic CRS** is 3D, based on a geodetic reference frame; with an ellipsoidal
  coordinate system it is a **geographic CRS**. A **projected CRS** derives from a
  geographic one by a map projection. An **engineering (local) CRS** rests on an
  engineering datum tied to a local reference (a building site, a ship), not to Earth's
  geodetic or vertical frames.

## Not read

Clauses 6 to 12 (the full UML schema, coordinate operation detail), the conformance
annexes, and anything in the EPSG registry (the EPSG terms page returned HTTP 403).
EPSG codes are *referenced* by LandXML (`CoordinateSystem/@epsgCode`); whether Bonyad may
redistribute EPSG parameters is **Unknown** and must be settled before bundling any.

## Interpretation: what this teaches Bonyad

1. Bonyad's current `frame = 'local-cartesian'` and `unit = 'm'` (both constrained by
   `CHECK` in `db/migrations/20261021000001_geometry.sql`) are, in this vocabulary, an
   **engineering CRS** with one fixed linear unit. That is a legitimate, named CRS kind,
   not a missing feature.
2. A CRS is **more than a name**: datum, axis order and direction, and unit belong
   together. A bare coordinate pair without them is ambiguous (see the LandXML north/east
   and GeoJSON longitude/latitude conflict in `mappings/point-line-surface.md`).
3. **Conversions between CRSs are procedures** with inputs, outputs and validity limits.
   They fit the manifesto's "every procedure has exactly one executable owner"; the
   owner should be a library, not hand-written maths.
4. Whether a CRS is a Bonyad *entity*, a *value* on the project, or a *definition* that
   instances refer to is **unresolved** and should not be decided before a second CRS is
   needed by a real case.
