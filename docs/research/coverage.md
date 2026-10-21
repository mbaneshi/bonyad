# Coverage matrix

Legend: **Deep** = studied against primary sources with a reference case · **Inventory**
= identified from a primary source, not studied · **Gap** = not yet investigated or
sources unreachable. This matrix does not claim exhaustive coverage of any discipline.

| Discipline | A. Formats | B. Standards | C. Procedures / prior art |
|---|---|---|---|
| 1. Surveying, geodesy, coordinates | **Deep**: LandXML 1.2 | **Deep**: ISO 19111 / OGC 18-005r5 (conceptual); EPSG terms **Gap** (403) | **Deep**: planar and geodesic polygon area (Karney) |
| 2. Civil, terrain, infrastructure, GIS | Inventory: GeoJSON RFC 7946, LandXML surfaces/alignments (schema element names only) | **Gap** | **Gap** |
| 3. Architecture, drafting, BIM | **Gap**: IFC (buildingSMART refused access), DXF not opened, CityGML 3.0 page too large to fetch | **Gap** | **Gap** |
| 4. Structures, materials, analysis | **Gap** | **Gap**: design codes are restricted/regulatory | Inventory: OpenSees repository only; licence text not read |
| 5. MEP and networks | LandXML `PipeNetworks` (element name only) | **Gap** | Inventory: EPANET (MIT, GUI repo; engine is OWA EPANET) |
| 6. Traffic and transportation | Inventory: GTFS Schedule; ASAM OpenDRIVE 1.9.0 | **Gap** | Inventory: SUMO (EPL-2.0) |
| 7. Urban planning | **Gap** | **Gap** | **Gap** |
| 8. Quantities, scheduling, facilities, PM | **Gap** | **Gap** | **Gap** |

## Why these gaps

- **Access refused (HTTP 403):** buildingSMART (IFC), EPSG terms of use, and the ASAM
  detail page for the specification text itself. Not bypassed. Batch 2 should try
  legitimate alternatives (the published specification repositories, the ISO catalogue
  entry, or a manual download by a maintainer).
- **Fetch limit:** OGC CityGML 3.0 exceeded the fetch size. Needs paged reading.
- **Not started:** urban planning, quantities, scheduling, facilities. These have no
  verified source yet; they are listed so the absence stays visible.
- **Regulatory vs technical:** structural design codes and building regulations are
  jurisdiction-specific and often restricted. They need their own method, not just
  more fetching.
