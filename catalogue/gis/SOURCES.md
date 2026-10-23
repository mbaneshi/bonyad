# Sources: schema `gis` (fidelity `proxy`)

Every source is public and machine-readable; nothing proprietary and no application was installed. Pinned by commit or document version; file hashes are in `tools/harvest/gis/sources.lock.json` (verified on every `bun run fetch`). Access date for all rows: **2026-10-23**.

| # | Source | Version / pin | URL | Licence |
|---|---|---|---|---|
| 1 | OGC GeoPackage Encoding Standard (OGC 12-128r19), AsciiDoc sources: core, tiles, attributes, extensions mechanism, geometry-types / metadata / schema / spatial-index annexes, DDL annex, plus the CRS WKT, Related Tables and 2D Gridded Coverage extensions | 1.4.0, repository `opengeospatial/geopackage` commit `fe83fdd5949a3faba09117e6e1dcc003fdb5a900` | https://github.com/opengeospatial/geopackage/tree/fe83fdd5949a3faba09117e6e1dcc003fdb5a900 | OGC License Agreement (`LICENSE.md` in the repository): free copy, use, modify, merge, publish, distribute and sublicense, provided all copyright notices are retained intact; modified copies must state they include modifications not approved by OGC; the OGC name may not be used to promote. Copyright licence only, no patent rights. |
| 2 | OGC Simple Feature Access, Part 1: Common architecture (OGC 06-103r4 / ISO 19125-1) | 1.2.1 (Corrigendum, 2011-05-28) | https://docs.ogc.org/is/06-103r4/06-103r4.pdf | OGC License Agreement embedded in the document (same terms as row 1) |
| 3 | OGC Well-known text representation of coordinate reference systems (OGC 18-010r7 / ISO 19162:2019) | 2019 | https://docs.ogc.org/is/18-010r7/18-010r7.html | OGC License Agreement embedded in the document (same terms as row 1) |
| 4 | GDAL/OGR: headers `ogr/ogr_core.h`, `ogr_feature.h`, `ogr_geometry.h`, `ogr_geomcoordinateprecision.h`, `ogr_srs_api.h`, `gcore/gdal.h`, `gcore/gdal_relationship.h`; docs `doc/source/user/vector_data_model.rst`, `doc/source/drivers/vector/gpkg.rst`; driver source `ogr/ogrsf_frmts/gpkg/ogrgeopackagedatasource.cpp` | GDAL v3.13.3, `OSGeo/GDAL` commit `c8b4c45fca87d3e6fbf80e7a7898b8a661ad0edc` | https://github.com/OSGeo/gdal/tree/c8b4c45fca87d3e6fbf80e7a7898b8a661ad0edc | MIT (GDAL/OGR general licence, `LICENSE.TXT`) |
| 5 | PROJ database table definitions (`data/sql/proj_db_table_defs.sql`). Only table STRUCTURE is read, as a cross-check for the CRS entities; EPSG, ESRI and IGNF data rows are NOT harvested | PROJ 9.9.0, `OSGeo/PROJ` commit `1df2be61c0e4732aa1326126113776b291ae7657` | https://github.com/OSGeo/PROJ/tree/1df2be61c0e4732aa1326126113776b291ae7657 | MIT (`COPYING`) |

## How each entity group relates to its source

| Group | Entities | Method | Primary source |
|---|---|---|---|
| GeoPackage tables | `gpkg_contents`, `gpkg_spatial_ref_sys`, `gpkg_geometry_columns`, `gpkg_tile_matrix_set`, `gpkg_tile_matrix`, `gpkg_extensions`, `gpkg_data_columns`, `gpkg_data_column_constraints`, `gpkg_metadata`, `gpkg_metadata_reference`, `gpkgext_relations`, `gpkgext_relation_mapping`, 2D gridded coverage ancillary tables, user-table conventions (`gpkg_feature_row`, `gpkg_attribute_row`, `gpkg_tile_row`) | Columns, SQL types, nullability and foreign keys DERIVED by parsing the spec's DDL; column meanings are the spec's own description cells | 1 |
| GeoPackage non-table | `gpkg_ogr_contents` (GDAL-added table, DDL from the GDAL source), `gpkg_rtree_index_entry`, `gpkg_binary_header` | DDL parsed (ogr_contents); the other two hand-authored from the spec | 1, 4 |
| Simple Features | `geometry` and its 17 subtypes plus child rows (points, rings, members, patches) | Hand-authored from the clauses cited per entity; hierarchy cross-checked against the GeoPackage geometry-types annex and GDAL `ogr_geometry.h` | 2, 1, 4 |
| GDAL/OGR model | `gdal_dataset`, `ogr_layer`, `ogr_feature_defn`, `ogr_field_defn`, `ogr_geom_field_defn`, `ogr_feature`, field domains (`ogr_field_domain`, coded, range, glob, `ogr_coded_value`), `gdal_relationship` | Structure from class members in the headers; enumerations DERIVED from the headers; prose hand-authored | 4 |
| Coordinate reference systems | `spatial_reference`, `datum`, `ellipsoid`, `prime_meridian`, `coordinate_system`, `coordinate_system_axis` (axis order), `map_projection`, `map_projection_parameter` | Hand-authored from the WKT2 clauses; PROJ table structure used as a cross-check | 3, 5 |

Derived versus hand-authored is also written into the `notes` of every entity, so a reader of one YAML file can tell. Reproduce with `cd tools/harvest/gis && bun install && bun run fetch && bun run build`.

## Counts

* 64 entity types, 258 fields, validated by `tools/catalogue` (`cd tools/catalogue && bun run validate ../../catalogue`).
* By kind: 25 entity, 19 symbol, 14 child, 5 abstract, 1 object.
* By group: 20 GeoPackage, 24 Simple Features (geometry), 12 GDAL/OGR, 8 coordinate reference system.
* Flagged `needs_review: true`: 8 (see REVIEW.md and the `notes` of each).

## Coordinate reference system coverage

The brief asks for the CRS fields the rest of the catalogue lacks. Covered: datum (`datum`, with ellipsoid, prime meridian, anchor, dynamic frame epoch, ensemble accuracy), projection (`map_projection` with ordered `map_projection_parameter` rows), axis order (the position of each `coordinate_system_axis` row, plus its direction, meridian and bearing), units (axis and parameter unit names with the factor to SI), axis mapping strategy (GDAL), epoch, authority identifier, and the verbatim WKT2 text. Not covered: see GAPS.md.

## Licence notice

Text of the OGC specifications is quoted only as short column descriptions, always attributed to the source in each entity's `source` block. The catalogue files are modifications and condensations of that text and are NOT approved by OGC. OGC and its standards names are used for identification only, not for promotion. Copyright notices of the source documents are retained in the pinned sources linked above.
