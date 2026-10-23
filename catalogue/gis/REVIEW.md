# Review: schema `gis` (10 entries checked by hand against the source)

Selection: the 64 file names in `catalogue/gis/` were ordered by `awk 'BEGIN{srand(43)}{print rand(), $0}' | sort` (seed 43) and the first ten taken, so the sample is repeatable. Each was compared field by field with the pinned source in `tools/harvest/gis/.cache/` (see SOURCES.md). Date of review: 2026-10-23.

| # | Entry | Checked against | Result |
|---|---|---|---|
| 1 | `gpkgext_relation_mapping` | Related Tables annex-sql, `sample_mapping_table` (base_id, related_id, both INTEGER NOT NULL) | OK. Two int columns, no FK in the DDL, so plain ints. It is a convention entity: the real table has a user-chosen name. |
| 2 | `gpkg_geometry_columns` | GeoPackage core, features: table 'Geometry Columns Table Definition' | OK. Six columns, types and keys match; `z` and `m` carry the 0/1/2 prohibited/mandatory/optional values; geometry type names include the extension types CURVE and SURFACE (geometry-types annex). |
| 3 | `gpkg_contents` | core `1_base.adoc`, table 'Contents Table Definition' | OK. Eleven columns match, including `identifier` unique and nullable, `description` default `''`, `last_change` required. `data_type` is free text on purpose: the spec lets extensions define other values. |
| 4 | `geometrycollection_member` | SFA 6.1.3 GeometryCollection (`numGeometries`, `geometryN`) | OK after a fix: the first version had its own `position` field, which the validator rejected (reserved, added by the generator). Removed in all child types. |
| 5 | `gpkg_tile_matrix` | core `2b_tiles.adoc`, table 'Tile Matrix Table Definition' and Requirements on width/height/pixel size | OK. Every size column is "greater than 0" in the requirements and is `positive` here; `zoom_level` is non-negative. |
| 6 | `multicurve` | SFA 6.1.8; GeoPackage geometry-types annex (subtype statements) | PARTIAL, flagged `needs_review`. Hierarchy right (subtype of GeometryCollection, MultiLineString under it). SFA calls it non-instantiable; GeoPackage and GDAL allow it as a concrete type. Left abstract; decision listed in GAPS.md. |
| 7 | `coordinate_system_axis` | WKT2 7.5.3 / 7.5.4 (axis direction BNF), PROJ `axis` | OK after a fix: the first version also had `minimum_value`, `maximum_value` and `range_meaning` (AXISMINVALUE, AXISMAXVALUE, RANGEMEANING). Those keywords do not appear in OGC 18-010r7, so they were removed (rule 1). Direction list now equals the BNF; axis order is the child position. |
| 8 | `gpkg_data_columns` | schema extension annex, `CREATE TABLE gpkg_data_columns` | OK. Seven columns match. `table_name` is plain text, not a ref, because the DDL declares no foreign key. |
| 9 | `ogr_field_domain` | `ogr_feature.h` class OGRFieldDomain; `ogr_core.h` policy enums | OK. Members: name, description, type, field type, field subtype, split and merge policy all present; policy enum values copied from the header. Domain type is the concrete subtype (coded, range, glob), so no separate column. |
| 10 | `curvepolygon_ring` | SFA 6.1.11 CurvePolygon (`exteriorRing`, `interiorRingN`) | OK. Ring 0 is the exterior; other positions are holes. Ring type is `gis.curve`, which exists. |

Open items found while reviewing (also in GAPS.md): the `multicurve` concreteness, the `wkt` column on `spatial_reference` (stores a derived text), and `ogr_feature_defn.geometry_type` mirroring the first geometry field.

Not in the sample but flagged `needs_review` in the files themselves: `gpkg_ogr_contents`, `circularstring`, `ogr_feature_defn`, `ellipsoid`, `datum`, `coordinate_system`, `spatial_reference`. Reasons are in each file's `notes`.
