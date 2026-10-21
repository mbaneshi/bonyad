# Mapping to the current point-line-surface slice

Quality scale: **exact** (same meaning, no loss), **partial** (same meaning, some
information has nowhere to go), **lossy** (information destroyed or invented),
**unresolved** (no confident answer yet). Bonyad side checked against `logic/crates/geometry`
and `db/migrations/20261021000001_geometry.sql` on `dev` at `a65e3af`.

| Source concept | Meaning | Candidate Bonyad concept | Quality | Missing information | Evidence |
|---|---|---|---|---|---|
| LandXML `CgPoint` `name` | Project-scoped point name | Entity `label` | partial | Names are unique references; Bonyad identity is a UUID, label is free text | XSD `CgPoint`, `Parcels` `xs:unique` |
| LandXML `CgPoint` `oID` | Official ID | none | unresolved | A second, external identifier on an entity | XSD `CgPoint` |
| LandXML `CgPoint` text `N E [Z]` | Northing, easting, optional elevation | `Point2 { x, y }` | **lossy unless converted** | Axis order is swapped (x = easting, y = northing); elevation has no home (slice is 2D) | XSD `CgPoint` doc; run in `procedures/polygon-area.md` |
| `CgPoint` `positionalUncertainity` | Uncertainty of a position | none | unresolved | A value-with-uncertainty concept (manifesto: "values, quantities, units and uncertainty") | XSD `CgPoint` attributes |
| `Line` with inline `Start`/`End` | Segment whose endpoints are coordinates | `LineGeometry { a, b }` | **exact** | Optional `dir`, `length` are redundant claims | XSD `Line`, `PointType` |
| `Line` with `pntRef` | Segment whose endpoints refer to named points | A line bound to point entities | unresolved | Deferred by ADR 0002 item 2; standard confirms the concept exists | XSD `PointType` doc |
| `CoordGeom` ring (`Line`/`Curve`/`Spiral`) | Boundary as ordered segments | `SurfaceGeometry { vertices }` | partial | Curves and spirals have no representation; only straight edges map | XSD `CoordGeom` |
| `Parcel` | Named, owned land area with a boundary | Entity of kind surface | partial | `owner`, `taxId`, `parcelType`, titles and exclusions (holes) are domain data with no home | XSD `Parcel` |
| `Parcel/@area`, `Line/@length` | Stored measurements | derived `MeasureEntity` | **different by design** | Bonyad derives and never stores (ADR 0001 item 4); imported values become checks | XSD; `measure.rs` |
| `Units` (Metric/Imperial) | Project units per quantity | `project.unit = 'm'` | partial | Only metres; no area or angle unit; imperial files cannot be imported unconverted | XSD `Units`; migration `CHECK (unit = 'm')` |
| Direction convention | Counter-clockwise from north per schema doc | none | unresolved | Bonyad has no angles yet | XSD `Units` doc (see H3) |
| `CoordinateSystem` | EPSG code, datum, ellipsoid | `project.frame = 'local-cartesian'` | partial | A project-level CRS beyond one local frame | XSD; `standards/crs-iso19111-ogc.md` |
| `Feature` / `Property` / `xs:any` | Extension data | none | unresolved | Unknown-content preservation policy | XSD |
| GeoJSON `Polygon` | Rings, exterior counter-clockwise | `SurfaceGeometry` | partial | Holes; geographic CRS only | RFC 7946 s.3.1.6, s.4 |
| GeoJSON Feature `id` | Optional identity | Entity `id` | partial | May be absent; Bonyad needs one (see ADR 0002 item 10) | RFC 7946 s.3.2 |
| GeoJSON position | longitude, latitude (degrees) | `Point2` | **lossy** | Degrees are not metres; needs a conversion procedure | RFC 7946 s.3.1.1, s.4 |

## Implications for the slice (Interpretation, not decisions)

1. **No mapping contradicts independent geometry.** The inline form of LandXML lines
   and rings is exactly Bonyad's ownership model.
2. **Binding is real.** `pntRef` is a standard feature; ADR 0002 deferring it is
   consistent with the sources, and the future design has a precedent to read.
3. **The largest gaps are not geometric**: axis convention, CRS, uncertainty and unit
   handling. Each is a candidate *value* concept, not a new entity.
4. **Importers must be procedures with contracts**, not parsers that rename fields. The
   axis swap alone silently reverses polygon winding.
