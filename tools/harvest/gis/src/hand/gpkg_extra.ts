/** GeoPackage entities that are not plain SQL tables in the spec DDL: the GDAL-added gpkg_ogr_contents
 *  table (structure derived from GDAL's CREATE statement), the R-tree index row, the user-table conventions
 *  and the GeoPackageBinary header. All prose here is hand-written and labelled as such. */
import { readSource } from "../fetch";
import { parseCreateTables } from "../parse/ddl";
import type { Entity } from "../schema";
import { HAND, gdalSource, gpkgSource } from "../common";

async function ogrContents(): Promise<Entity> {
  const cpp = await readSource("gdal", "ogr/ogrsf_frmts/gpkg/ogrgeopackagedatasource.cpp");
  const at = cpp.indexOf('"CREATE TABLE gpkg_ogr_contents("');
  if (at < 0) throw new Error("gpkg_ogr_contents DDL not found in GDAL source");
  // concatenate the adjacent C string literals that make up the statement
  const lits: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/gy;
  re.lastIndex = at;
  for (let m = re.exec(cpp); m; m = re.exec(cpp)) {
    lits.push(m[1]!);
    const ws = /\s*/y;
    ws.lastIndex = re.lastIndex;
    ws.exec(cpp);
    re.lastIndex = ws.lastIndex;
    if (cpp[re.lastIndex] !== '"') break;
  }
  const t = parseCreateTables(lits.join(""))[0];
  if (!t || t.name !== "gpkg_ogr_contents") throw new Error("could not parse gpkg_ogr_contents");
  const col = (n: string) => t.columns.find((c) => c.name === n)!;
  return {
    code: "gis.gpkg_ogr_contents",
    name: "gpkg_ogr_contents",
    kind: "symbol",
    fidelity: "proxy",
    source: gdalSource(
      "ogr/ogrsf_frmts/gpkg/ogrgeopackagedatasource.cpp",
      "GDALGeoPackageDataset: CREATE TABLE gpkg_ogr_contents (ADD_GPKG_OGR_CONTENTS option); doc/source/drivers/vector/gpkg.rst",
      "GDAL GeoPackage driver source and documentation",
    ),
    meaning: "GDAL-specific side table that keeps a cached feature count per content table, maintained by triggers.",
    fields: [
      {
        name: "table_name",
        type: "ref",
        ref_to: "gis.gpkg_contents",
        meaning: "Name of the content table the count belongs to; primary key of this table.",
        source_ref: `gpkg_ogr_contents.table_name ${col("table_name").sqlType} (primary key)`,
      },
      {
        name: "feature_count",
        type: "bigint",
        nullable: true,
        meaning: "Cached number of features in the table; NULL when not known.",
        source_ref: `gpkg_ogr_contents.feature_count ${col("feature_count").sqlType} DEFAULT NULL`,
      },
    ],
    needs_review: true,
    notes:
      "Columns DERIVED from the CREATE statement in GDAL's source. " + HAND + "the foreign-key-like ref on table_name (GDAL's DDL declares none; inferred from the name and the trigger name pattern trigger_%_feature_count_%), the type bigint, and the 'NULL when not known' wording are inferred from the column names and the driver docs ('add a gpkg_ogr_contents table to keep feature count, and associated triggers'); the exact trigger semantics were not read.",
  };
}

const RTREE_SRC = "spec/core/annexes/extension_spatialindex.adoc";

export async function buildGpkgExtra(): Promise<Entity[]> {
  const out: Entity[] = [await ogrContents()];

  // R-tree: template `CREATE VIRTUAL TABLE rtree_<t>_<c> USING rtree(id, minx, maxx, miny, maxy)`
  const sp = await readSource("geopackage", RTREE_SRC);
  const rt = /CREATE VIRTUAL TABLE rtree_<t>_<c> USING rtree\(([^)]*)\)/.exec(sp);
  if (!rt) throw new Error("rtree template not found");
  const cols = rt[1]!.split(",").map((s) => s.trim());
  if (cols.join() !== "id,minx,maxx,miny,maxy") throw new Error(`rtree columns changed: ${cols}`);
  out.push({
    code: "gis.gpkg_rtree_index_entry",
    name: "rtree_<t>_<c>",
    kind: "child",
    parent: "gis.gpkg_geometry_columns",
    fidelity: "proxy",
    source: gpkgSource(RTREE_SRC, "Spatial Indexes extension (gpkg_rtree_index), 'Create Virtual Table'"),
    meaning:
      "One bounding-box entry of the SQLite R-tree spatial index kept for a feature table geometry column; the table is named rtree_<t>_<c> for feature table <t> and geometry column <c>.",
    fields: [
      { name: "id", type: "bigint", meaning: "Feature table integer primary key value (the R-tree id parameter, a 64-bit signed integer).", source_ref: "rtree(id, ...)" },
      { name: "minx", type: "float", meaning: "Minimum x of the feature's bounding box, stored by SQLite R-tree as a 32-bit float.", source_ref: "rtree(..., minx, ...)" },
      { name: "maxx", type: "float", meaning: "Maximum x of the feature's bounding box, stored by SQLite R-tree as a 32-bit float.", source_ref: "rtree(..., maxx, ...)" },
      { name: "miny", type: "float", meaning: "Minimum y of the feature's bounding box, stored by SQLite R-tree as a 32-bit float.", source_ref: "rtree(..., miny, ...)" },
      { name: "maxy", type: "float", meaning: "Maximum y of the feature's bounding box, stored by SQLite R-tree as a 32-bit float.", source_ref: "rtree(..., maxy, ...)" },
    ],
    notes:
      "Columns DERIVED from the spec's CREATE VIRTUAL TABLE template by tools/harvest/gis/src/hand/gpkg_extra.ts (asserted by test). " + HAND + "entity meaning, field meanings (paraphrasing the spec sentence 'min- and max-value pairs (stored as 32-bit floating point numbers) for each dimension'), and the choice of gpkg_geometry_columns as parent (one index per geometry column). The index is derived data in the source; it is kept here only because the source specifies it, and a generator may choose to skip derived index tables. Insert/update/delete triggers are not modelled.",
  });

  const hand = (path: string, section: string) => gpkgSource(path, `${HAND}${section}`);

  out.push({
    code: "gis.gpkg_feature_row",
    name: "vector feature user data table",
    kind: "entity",
    fidelity: "proxy",
    source: hand("spec/core/2a_features.adoc", "Features > Vector Feature User Data Tables, Requirements 29-31 (+ Geometry Encoding, Requirement 19)"),
    meaning:
      "One feature (row) of a user-named vector feature table: an integer primary key and exactly one geometry column, plus any number of user-defined attribute columns.",
    fields: [
      { name: "feature_id", type: "bigint", meaning: "The INTEGER primary key column acting as a rowid alias (the table's own name for it is user-defined).", source_ref: "Requirement 29" },
      { name: "geometry", type: "blob", meaning: "The single geometry column, stored as a StandardGeoPackageBinary BLOB (header plus WKB); its declared SQL type comes from gpkg_geometry_columns.", source_ref: "Requirements 19, 30, 31" },
    ],
    notes:
      HAND + "convention entity. The spec requires only the primary key and one geometry column; the other columns of the informative sample table (text_attribute, real_attribute, boolean_attribute, raster_or_photo) are examples and are NOT modelled. User-defined attribute columns are open-ended and are covered by the layer / field definition entities (gis.ogr_feature_defn, gis.ogr_field_defn), not here. Views are allowed instead of tables (Requirement 150).",
  });

  out.push({
    code: "gis.gpkg_attribute_row",
    name: "attributes user data table",
    kind: "entity",
    fidelity: "proxy",
    source: hand("spec/core/2f_attributes.adoc", "Attributes > Attributes User Data Tables, Requirement 119"),
    meaning:
      "One row of a user-named non-spatial attribute table: an integer primary key plus any number of user-defined attribute columns.",
    fields: [
      { name: "attribute_id", type: "bigint", meaning: "The INTEGER primary key column acting as a rowid alias (the table's own name for it is user-defined).", source_ref: "Requirement 119" },
    ],
    notes:
      HAND + "convention entity. Only the integer primary key is required by Requirement 119; the sample table's other columns are informative examples and are not modelled.",
  });

  out.push({
    code: "gis.gpkg_binary_header",
    name: "GeoPackageBinaryHeader",
    kind: "object",
    fidelity: "proxy",
    source: hand("spec/core/2a_features.adoc", "Features > Geometry Encoding > BLOB Format (GeoPackageBinaryHeader and flags byte layout)"),
    meaning:
      "The fixed header that precedes the WKB in every geometry BLOB of a GeoPackage: magic, version, flags (decoded here into separate fields), SRS id and optional envelope.",
    fields: [
      { name: "magic", type: "text", default: "GP", meaning: "Two bytes 0x4750, 'GP' in ASCII.", source_ref: "GeoPackageBinaryHeader.magic" },
      { name: "version", type: "int", default: 0, meaning: "8-bit unsigned integer; 0 means version 1.", source_ref: "GeoPackageBinaryHeader.version" },
      {
        name: "binary_type",
        type: "enum",
        meaning: "Flag bit X: whether the geometry uses the standard or an extended (user-defined) encoding.",
        values: [
          { value: "standard", meaning: "StandardGeoPackageBinary, for all core and extended geometry types" },
          { value: "extended", meaning: "ExtendedGeoPackageBinary, for user-defined geometry types" },
        ],
        source_ref: "flags bit 5",
      },
      { name: "is_empty", type: "bool", meaning: "Flag bit Y: true when the geometry is empty (then no envelope is present).", source_ref: "flags bit 4" },
      {
        name: "envelope_indicator",
        type: "enum",
        meaning: "Flag bits E: which envelope, if any, follows the header.",
        values: [
          { value: "0", meaning: "No envelope (0 bytes)" },
          { value: "1", meaning: "Envelope is [minx, maxx, miny, maxy], 32 bytes" },
          { value: "2", meaning: "Envelope is [minx, maxx, miny, maxy, minz, maxz], 48 bytes" },
          { value: "3", meaning: "Envelope is [minx, maxx, miny, maxy, minm, maxm], 48 bytes" },
          { value: "4", meaning: "Envelope is [minx, maxx, miny, maxy, minz, maxz, minm, maxm], 64 bytes" },
        ],
        source_ref: "flags bits 3-1 (values 5-7 are invalid)",
      },
      {
        name: "byte_order",
        type: "enum",
        meaning: "Flag bit B: byte order of the srs_id and envelope values in the header (not of the WKB itself).",
        values: [
          { value: "big_endian", meaning: "0: most significant byte first" },
          { value: "little_endian", meaning: "1: least significant byte first" },
        ],
        source_ref: "flags bit 0",
      },
      { name: "srs_id", type: "int", meaning: "The SRS id of the geometry; refers to gpkg_spatial_ref_sys.srs_id.", source_ref: "GeoPackageBinaryHeader.srs_id" },
      { name: "envelope", type: "array", of: "float", nullable: true, meaning: "Envelope values in the order given by envelope_indicator, in CRS units; absent when the indicator is 0.", source_ref: "GeoPackageBinaryHeader.envelope" },
    ],
    notes:
      HAND + "this is a binary layout inside a BLOB, not a table in the file; kind object (the validator rejects an abstract type with fields and no subtype) so a decoded header can be stored if a later phase needs it. The flag bits R (6-7) are reserved and set to 0. Axis order in the WKB is always x,y,{z},{m} regardless of the SRS axis order (spec WARNING).",
  });

  return out;
}
