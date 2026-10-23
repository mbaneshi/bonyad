# Gaps: schema `gis`

What this harvest does NOT cover, and why. Nothing here was invented to fill a hole.

## Out of scope by the brief
* Importers and exporters (file exchange); the `maps` key stays empty.
* Closed, undocumented formats (for example the File Geodatabase internals as ArcGIS writes them). Only open standards and GDAL's published model are used.
* Raster data model (GDALRasterBand, GDALColorTable, RAT) and the 2D gridded coverage beyond its two ancillary tables.

## Format limits (the model cannot say it)
* **JSON and map values:** per-format coordinate precision options (`OGRGeomCoordinatePrecision::oFormatSpecificOptions`, a string-to-list map) are dropped; the format has no JSON or map column.
* **Variant columns:** the bounds of a range field domain are text, because GDAL stores them in a union typed by the field type.
* **Rules across fields:** "exactly one of inverse flattening and semi-minor axis" (PROJ CHECK), geometry subtype restrictions in collections (a MultiPoint holds only Points), the Z/M-flag rules of a geometry type, and "all points of a geometry share one dimension" are written in `meaning` or `notes` but not enforced.
* **Derived values** (empty geometry, dimension, coordinate dimension, envelope, feature count) are not stored (rule 2). `gpkg_ogr_contents.feature_count` IS stored because it is an authoritative cache the format defines.
* **Nested children:** the Z/M/ZM variants of a geometry are carried by `has_z` and `has_m`, not by separate types. The WKB/ISO integer code of a geometry (SFA Table 7) is described in notes only.

## Not yet harvested
* **CRS:** parametric and temporal datums and coordinate systems beyond the type list; datum ensemble members; CRS usage records (`scope`, area-of-use bounding box and extent, WKT2 `BBOX`); coordinate operations and transformations (Helmert, grids, concatenated operations, PROJ `helmert_transformation`, `grid_transformation`); compound CRS metadata beyond the two component links; supersession and deprecation records; alias names. The EPSG/ESRI/IGNF data rows themselves are deliberately not harvested (licence and size); only the structure is.
* **GeoPackage:** the vendor-neutral extensions beyond those listed in SOURCES.md (for example `gpkg_geom_*` geometry extensions, tile encodings WebP and PNG details, the full semantics of `gpkg_extensions` scope values), triggers and views of the metadata extension, the "Non-linear Geometry Types" extension table beyond the type names, and the Zoom Other Intervals extension.
* **GDAL:** drivers and their capabilities, layer-level metadata domains, `OGRStyleTable` and style tools, `OGRSpatialReference` convenience getters that are derived (linear units name, UTM zone), and field types stored in `OGRField` unions.
* **Simple Features:** SQL/MM ST_ types and the SFA SQL (Part 2) views `GEOMETRY_COLUMNS` and `SPATIAL_REF_SYS`; GeoPackage's `gpkg_spatial_ref_sys` already covers the GeoPackage form.

## Open decisions (for the owner, not blockers)
1. `gis.spatial_reference.wkt` duplicates the structured CRS columns; keep it as the exchange-authoritative text, or drop it and derive (rule 2). See its `needs_review` note.
2. `gis.multicurve` is `abstract` per SFA; GeoPackage and GDAL both allow it as a concrete type. Flip to `entity` if concrete use must be stored.
3. `gis.ogr_feature_defn.geometry_type` mirrors the first geometry field; remove it if one source of truth is preferred.
4. No link yet between `gis.gpkg_spatial_ref_sys` and `gis.spatial_reference` (the same real-world CRS in two forms). Linking them belongs with the file-exchange phase.
