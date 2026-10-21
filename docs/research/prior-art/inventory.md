# Cross-discipline inventory (batch 1)

An inventory, not a survey. Each row says what a primary source established and what it
did not. **Studied** means a deeper record exists elsewhere in `docs/research/`. All
sources accessed 2026-10-21. "Not stated" means the fetched page did not say, not that
the fact is false.

| Item | Discipline | Kind | Verified from source | Not established |
|---|---|---|---|---|
| LandXML 1.2 | 1, 2, 5 | Exchange (XML) | **Studied**: `formats/landxml-1.2.md` | Licence terms; non-point elements |
| OGC 18-005r5 / ISO 19111 | 1 | Data model | **Studied**: `standards/crs-iso19111-ogc.md` | Clauses 6-12; EPSG terms (403) |
| Karney geodesics, GeographicLib | 1 | Procedure | **Studied**: `procedures/polygon-area.md` | Polygon-area accuracy figure |
| `geo` 0.33.1, `geographiclib-rs` 0.2.7 | 1, 2 | Rust implementations | **Studied**: same file | GeodTest pass status; ellipsoid in `geo` docs |
| GeoJSON, RFC 7946 | 2 | Exchange (JSON) | August 2016, Standards Track. WGS 84 only, decimal degrees (s.4). Order is longitude, latitude (s.3.1.1); optional third element is height in metres above the ellipsoid. `id` on Features is a SHOULD (s.3.2). Foreign members are allowed but have no processing model (s.6.1). Exterior rings counter-clockwise (s.3.1.6) | Round-trip behaviour of libraries |
| GTFS Schedule | 6 | Exchange (CSV files) | Models agency, stops, routes, trips, stop_times, shapes. Coordinates are WGS84 decimal degrees. Reference revised 2026-04-27. States that altering the dataset creates a new version. Extensions named: Fares v2, Flex | Maintainer text and licence (page truncated); last 52,385 chars unread |
| ASAM OpenDRIVE 1.9.0 | 6 | Exchange (XML `.xodr`) | Released 2026-05-19. Static road-network description; roads, lanes, objects attach to a reference line. Free download after accepting ASAM terms. OpenX suite is "in maintenance mode" | Geometry primitives and `geoReference` (not on the page); the specification text itself |
| SUMO | 6 | Procedure / simulator | Eclipse Public License 2.0; microscopic multimodal traffic simulation; repository has `tests` and `unittest`. Docs: https://sumo.dlr.de/docs | Language, release version, import formats (page silent) |
| EPANET (USEPA GUI repo) | 5 | Procedure / GUI | MIT licence; the GUI uses OWA EPANET engine v2.3; imports shapefiles, DXF, CSV | Equations, `.inp` format, engine API, tests |
| OpenSees | 4 | Procedure / simulator | Source repository, docs at https://OpenSees.github.io/OpenSeesDocumentation, `EXAMPLES` and `tests` directories, 9,511 commits on master | **Licence text** (a COPYRIGHT file exists), language, input format |
| IFC (buildingSMART, ISO 16739-1) | 3 | Exchange / data model | Nothing: HTTP 403 on both buildingSMART pages | Everything. Requires an alternative legitimate route |
| OGC CityGML 3.0 | 2, 3, 7 | Data model | Nothing: page exceeded the 10 MB fetch limit | Everything |
| DXF (Autodesk) | 3 | Exchange | Nothing opened. EPANET's GUI is reported to import DXF | Specification, licence, version |

## What the inventory already suggests (Interpretation)

1. **Most exchange formats fix a CRS and an axis order** (GeoJSON, GTFS) or carry one
   optionally (LandXML). Bonyad's engineering CRS is the odd one out; every importer
   must therefore supply an explicit conversion, not a rename.
2. **Identity is optional or weak in several formats** (GeoJSON `id` is a SHOULD; GTFS
   keys are strings scoped to a feed). Stable entity identity, which the manifesto puts
   first, is something Bonyad would add on import, not receive.
3. **Versioning exists but is coarse**: GTFS versions whole datasets. This is evidence
   for the manifesto's current-state-then-revision order, not against it.
4. **Simulators are separate procedure owners.** SUMO, EPANET and OpenSees are large
   executable owners of their domains. Their reuse question is "adapter or rewrite", and
   the answer needs a verified licence and an input format first.
