# Adoption recommendations, experiments and the next batch

Research findings are **not** architecture decisions. Each item below is a
recommendation with a small experiment that could confirm or kill it. Anything touching
a shared contract needs an RFC and founder review.

## 1. Recommendations

| # | Finding | Recommendation | Fit / licence / maintenance | Experiment |
|---|---|---|---|---|
| R1 | LandXML `CgPoints`, `Parcels`, `Line` map cleanly to the slice (exact for inline lines) | **Adapt through a file module**: a one-way, read-only import that produces validated slice entities and an import report | XSD licence **Unknown**; schema is 2008 but widely used (**Unknown** current maintenance) | E1 |
| R2 | North/east order and direction conventions are silent hazards | **Learn from it**: any importer declares axis order and unit in its contract; add a conformance test, not a convention | n/a | E1, E4 |
| R3 | Karney geodesic area exists in MIT / dual-licensed Rust crates | **Defer, then reuse an implementation through a procedure interface** when a geographic CRS is needed. Keep planar area in the pure crate | `geographiclib-rs` 0.2.7 MIT; `geo` 0.33.1 MIT OR Apache-2.0 | E2 |
| R4 | A CRS needs datum, axis order and unit, not a name | **Defer**: do not model CRS until a second CRS is needed. Record that the current `local-cartesian` is an engineering CRS | ISO 19111 / OGC 18-005r5 is royalty free per the page | none yet |
| R5 | `pntRef` shows point binding is standard | **Learn from it** when milestone 3 (relationships) is designed | n/a | read LandXML `Survey` and reference semantics (batch 2) |
| R6 | GeoJSON, GTFS fix WGS84 | **Defer**: GeoJSON import/export needs a CRS conversion first | RFC 7946 | E2 |
| R7 | Uncertainty appears on `CgPoint` | **Propose a domain extension later**, only after surveying observations are read | n/a | batch 2 |
| R8 | Extension content is allowed by the schema | **Learn from it**: decide whether unknown content is preserved or reported, before the first importer | n/a | E3 |
| R9 | IFC, CityGML, DXF, EPSG terms unreachable | **Unknown**: seek legitimate access before any recommendation | n/a | batch 2 |
| R10 | SUMO, EPANET, OpenSees are large procedure owners | **Defer**: adapter vs rewrite needs verified licence and input format | SUMO EPL-2.0; EPANET MIT (GUI repo); OpenSees **Unknown** | batch 3 |

## 2. Experiments (each small and falsifiable)

| ID | Hypothesis | Method | Pass / fail |
|---|---|---|---|
| E1 | A sample LandXML file with 4 `CgPoint`s, one parcel and lines imports to the slice with correct areas | Find or author a legitimately distributable sample; read it with a throwaway script; compare recomputed area with `Parcel/@area` | Areas agree within tolerance **and** winding is counter-clockwise after the axis swap |
| E2 | `geographiclib-rs` reproduces `GeodTest-short.dat` and the reference case in `procedures/polygon-area.md` | Download the 1/50 test file; run in a scratch Rust project outside the repo | Max error within the library's stated bound; otherwise reject R3 |
| E3 | A foreign-namespace element survives import and export unchanged | Round-trip a file with `Feature` and a foreign element through one open-source reader | Unknown content preserved or explicitly reported |
| E4 (H3) | Schema text says directions are counter-clockwise from north; survey practice says clockwise | Read LandXML 1.2 documentation and a real file with `dir` attributes | One convention is confirmed, or files contradict the schema |
| E5 (H1) | A UTM zone area differs from geodesic area by about twice the scale error | Compute with a projection library for one polygon, compare to the geodesic area | Difference near 2e-4 relative at the central meridian, or the hypothesis is rejected |

## 3. Hypotheses carried forward

H1 (projected-CRS area error), H2 (the slice needs a stored uncertainty concept only after
observations are read), H3 (direction convention).

## 4. Next smallest research batch (proposal)

1. Read LandXML `Survey` (instrument setups, observations) and the reference rules; it is
   the most direct input to the founder's surveying proof path. **Surveying, A.**
2. Find a legitimately redistributable LandXML sample set and run E1. **A + C.**
3. Resolve the access gaps: IFC, EPSG terms, CityGML (paged). **A + B.**
4. One inventory row each for urban planning and quantities, so the matrix has no empty
   rows. **Coverage.**

Run E2 and E5 only if the founder wants a geographic or projected CRS in milestone 2.

## 5. Not recommended now

No new crate, table, dependency or schema change. No LandXML parser in the repository.
No CRS entity. The slice continues unchanged.

## 6. Questions for the founder

1. Is a read-only LandXML import a plausible future milestone, or should batch 2 look at
   a different surveying format first?
2. Do you have a legitimately shareable survey file (any format) we can use as a
   reference case?
3. Is GIS-style geographic data (degrees) within the vision for the first year, or is
   the local engineering CRS enough for milestones 2 and 3?
