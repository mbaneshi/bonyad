/** GeoPackage table definitions DERIVED from the spec: column names, SQL types, nullability, defaults and
 *  foreign keys come from the normative DDL; field descriptions come from the spec's column tables.
 *  Everything hand-written (entity meaning, enum values, renames, checks) lives in SPECS below and is
 *  labelled as such in `notes`. */
import { readSource } from "../fetch";
import { cleanCell, parseTable, sqlBlocks, type AdocTable } from "../parse/adoc";
import { parseCreateTables, type Column, type Table } from "../parse/ddl";
import type { Entity, Field } from "../schema";
import { HAND, gpkgSource } from "../common";

type Override = Partial<Field> & { rename?: string };

export interface GpkgSpec {
  code: string;
  name: string; // the source's own spelling
  kind: Entity["kind"];
  parent?: string;
  meaning: string;
  notes?: string;
  needs_review?: boolean;
  ddl: { file: string; table: string };
  desc: { file: string; id: string };
  /** extension columns that the DDL file above does not have (e.g. CRS WKT extension) */
  extra?: { file: string; id: string; columns: string[]; note: string };
  overrides?: Record<string, Override>;
  section: string;
  /** spec file used for the entity's source.url */
  docPath: string;
}

const CORE = "spec/core/annexes/ddl.adoc";
const SQLTYPE: Record<string, Field["type"]> = {
  TEXT: "text",
  INTEGER: "int",
  TINYINT: "int",
  DOUBLE: "float",
  REAL: "float",
  NUMERIC: "float",
  DATETIME: "timestamp",
  BOOLEAN: "bool",
  BLOB: "blob",
  GEOMETRY: "blob",
};

const range012 = (what: string) => [
  { value: 0, meaning: `${what} values prohibited` },
  { value: 1, meaning: `${what} values mandatory` },
  { value: 2, meaning: `${what} values optional` },
];

export const SPECS: GpkgSpec[] = [
  {
    code: "gis.gpkg_spatial_ref_sys",
    name: "gpkg_spatial_ref_sys",
    kind: "symbol",
    meaning:
      "One spatial reference system (CRS) definition available inside a GeoPackage file; features, tiles and contents point to it by srs_id.",
    ddl: { file: CORE, table: "gpkg_spatial_ref_sys" },
    desc: { file: "spec/core/1_base.adoc", id: "gpkg_spatial_ref_sys_cols" },
    extra: {
      file: "spec/crs_wkt/clause_7_normative_text.adoc",
      id: "gpkg_spatial_ref_sys_cols_crs_wkt",
      columns: ["definition_12_063", "epoch"],
      note: "Columns definition_12_063 and epoch exist only when the gpkg_crs_wkt_1_1 extension is in use (nullable here because plain core files lack them; the extension marks definition_12_063 NOT NULL).",
    },
    overrides: {
      srs_id: { meaning: "Unique identifier of the SRS within this GeoPackage; the key used by gpkg_contents, gpkg_geometry_columns, gpkg_tile_matrix_set and the GeoPackageBinary header. Reserved: 4326 (WGS-84), -1 (undefined Cartesian), 0 (undefined geographic)." },
    },
    section: "Spatial Reference Systems (table 'Spatial Ref Sys Table Definition') + Annex C DDL; CRS WKT extension (gpkg_crs_wkt_1_1) table for definition_12_063/epoch",
    docPath: "spec/core/1_base.adoc",
  },
  {
    code: "gis.gpkg_contents",
    name: "gpkg_contents",
    kind: "symbol",
    meaning:
      "The table of contents of a GeoPackage: one row per feature, attribute or tile table (or extension content) with a name, type, bounding box and SRS.",
    ddl: { file: CORE, table: "gpkg_contents" },
    desc: { file: "spec/core/1_base.adoc", id: "gpkg_contents_cols" },
    overrides: {
      data_type: { meaning: "Type of data stored in the table or view: 'features', 'attributes' or 'tiles', or an implementer-defined value for extension content (so kept as free text, not an enum)." },
      last_change: { meaning: "Timestamp of last change to the content, ISO 8601 (default is the current UTC time, strftime('%Y-%m-%dT%H:%M:%fZ','now')); informative only." },
      min_x: { meaning: "Bounding box minimum easting or longitude for all content in table_name, in CRS units (informative only for tiles)." },
      min_y: { meaning: "Bounding box minimum northing or latitude for all content in table_name, in CRS units (informative only for tiles)." },
      max_x: { meaning: "Bounding box maximum easting or longitude for all content in table_name, in CRS units (informative only for tiles)." },
      max_y: { meaning: "Bounding box maximum northing or latitude for all content in table_name, in CRS units (informative only for tiles)." },
    },
    section: "Contents (table 'Contents Table Definition') + Annex C DDL gpkg_contents",
    docPath: "spec/core/1_base.adoc",
  },
  {
    code: "gis.gpkg_geometry_columns",
    name: "gpkg_geometry_columns",
    kind: "symbol",
    meaning:
      "Declares the single geometry column of each vector feature table: its geometry type, SRS and whether Z and M values are prohibited, mandatory or optional.",
    ddl: { file: CORE, table: "gpkg_geometry_columns" },
    desc: { file: "spec/core/2a_features.adoc", id: "gpkg_geometry_columns_cols" },
    overrides: {
      geometry_type_name: {
        type: "enum",
        meaning: "Uppercase geometry type name from the GeoPackage geometry type tables (core codes 0-7, extension codes 8-14).",
        values: [
          [0, "GEOMETRY", "core"], [1, "POINT", "core"], [2, "LINESTRING", "core"], [3, "POLYGON", "core"],
          [4, "MULTIPOINT", "core"], [5, "MULTILINESTRING", "core"], [6, "MULTIPOLYGON", "core"], [7, "GEOMETRYCOLLECTION", "core"],
          [8, "CIRCULARSTRING", "extension"], [9, "COMPOUNDCURVE", "extension"], [10, "CURVEPOLYGON", "extension"],
          [11, "MULTICURVE", "extension"], [12, "MULTISURFACE", "extension"], [13, "CURVE", "extension"], [14, "SURFACE", "extension"],
        ].map(([c, n, k]) => ({ value: n as string, meaning: `Geometry type code ${c} (${k} type)` })),
      },
      z: { type: "enum", values: range012("Z"), meaning: "Whether z values are prohibited (0), mandatory (1) or optional (2)." },
      m: { type: "enum", values: range012("M"), meaning: "Whether m values are prohibited (0), mandatory (1) or optional (2)." },
    },
    section: "Features > Geometry Columns (table 'Geometry Columns Table Definition') + Annex C DDL; Annex 'Geometry Types (Normative)' for the enum",
    docPath: "spec/core/2a_features.adoc",
  },
  {
    code: "gis.gpkg_tile_matrix_set",
    name: "gpkg_tile_matrix_set",
    kind: "symbol",
    meaning:
      "Defines the spatial reference system and overall bounding box of a tile pyramid user data table.",
    ddl: { file: CORE, table: "gpkg_tile_matrix_set" },
    desc: { file: "spec/core/2b_tiles.adoc", id: "gpkg_tile_matrix_set_cols" },
    section: "Tiles > Tile Matrix Set (table 'Tile Matrix Set Table Definition') + Annex C DDL",
    docPath: "spec/core/2b_tiles.adoc",
  },
  {
    code: "gis.gpkg_tile_matrix",
    name: "gpkg_tile_matrix",
    kind: "child",
    parent: "gis.gpkg_contents",
    meaning:
      "Describes one zoom level of a tile pyramid: matrix size in tiles, tile size in pixels and pixel size in CRS units.",
    notes: "Parent is gpkg_contents because that is the foreign key the DDL declares (fk_tmm_table_name); a tile matrix row also pairs with the same-named gpkg_tile_matrix_set row.",
    ddl: { file: CORE, table: "gpkg_tile_matrix" },
    desc: { file: "spec/core/2b_tiles.adoc", id: "gpkg_tile_matrix_cols" },
    overrides: {
      zoom_level: { check: "non_negative" },
      matrix_width: { check: "positive" },
      matrix_height: { check: "positive" },
      tile_width: { check: "positive", unit: "pixel" },
      tile_height: { check: "positive", unit: "pixel" },
      pixel_x_size: { check: "positive" },
      pixel_y_size: { check: "positive" },
    },
    section: "Tiles > Tile Matrix (table 'Tile Matrix Metadata Table Definition') + Annex C DDL",
    docPath: "spec/core/2b_tiles.adoc",
  },
  {
    code: "gis.gpkg_extensions",
    name: "gpkg_extensions",
    kind: "symbol",
    meaning:
      "Registry of extensions in use: which extension applies to the whole file, a table or a single column, and whether it affects readers and writers or only writers.",
    ddl: { file: CORE, table: "gpkg_extensions" },
    desc: { file: "spec/core/2e_extensions-mechanism.adoc", id: "gpkg_extensions_cols" },
    overrides: {
      scope: {
        type: "enum",
        meaning: "Scope of the extension's effects on readers and writers.",
        values: [
          { value: "read-write", meaning: "Affects both readers and writers" },
          { value: "write-only", meaning: "Affects writers only; readers may ignore it" },
        ],
      },
    },
    notes: "No primary key in the DDL; uniqueness is (table_name, column_name, extension_name).",
    section: "Extension Mechanism > Extensions (table 'GeoPackage Extensions Table Definition') + Annex C DDL gpkg_extensions",
    docPath: "spec/core/2e_extensions-mechanism.adoc",
  },
  {
    code: "gis.gpkg_data_columns",
    name: "gpkg_data_columns",
    kind: "symbol",
    meaning:
      "Schema extension: human-readable name, title, description, MIME type and value constraint for a column of a content table.",
    ddl: { file: "spec/core/annexes/extension_schema.adoc", table: "gpkg_data_columns" },
    desc: { file: "spec/core/annexes/extension_schema.adoc", id: "gpkg_data_columns_cols" },
    overrides: {
      constraint_name: { type: "text" },
    },
    notes: "constraint_name references gpkg_data_column_constraints.constraint_name, which is not unique alone (several enum rows share a name), so it stays text rather than ref.",
    section: "Schema extension (gpkg_schema), table 'Data Columns Table Definition' + its Table Definition SQL",
    docPath: "spec/core/annexes/extension_schema.adoc",
  },
  {
    code: "gis.gpkg_data_column_constraints",
    name: "gpkg_data_column_constraints",
    kind: "symbol",
    meaning:
      "Schema extension: one constraint row (range, enum member or glob) that data columns can reference by constraint_name.",
    ddl: { file: "spec/core/annexes/extension_schema.adoc", table: "gpkg_data_column_constraints" },
    desc: { file: "spec/core/annexes/extension_schema.adoc", id: "gpkg_data_column_constraints_cols" },
    overrides: {
      constraint_type: {
        type: "enum",
        meaning: "Type name of the constraint.",
        values: [
          { value: "range", meaning: "A numeric range given by min/max and their inclusivity flags" },
          { value: "enum", meaning: "One allowed value (one row per allowed value, sharing constraint_name)" },
          { value: "glob", meaning: "A glob pattern the value must match" },
        ],
      },
    },
    notes: "Rows are jointly unique on (constraint_name, constraint_type, value); no single-column key.",
    section: "Schema extension (gpkg_schema), table 'Data Column Constraints Table Definition' + its Table Definition SQL",
    docPath: "spec/core/annexes/extension_schema.adoc",
  },
  {
    code: "gis.gpkg_metadata",
    name: "gpkg_metadata",
    kind: "symbol",
    meaning:
      "Metadata extension: one metadata document (for example ISO 19115 XML) with its scope, standard URI and MIME type.",
    ddl: { file: "spec/core/annexes/extension_metadata.adoc", table: "gpkg_metadata" },
    desc: { file: "spec/core/annexes/extension_metadata.adoc", id: "gpkg_metadata_cols" },
    overrides: {
      id: { rename: "metadata_id", meaning: "Autoincrement primary key; referenced by gpkg_metadata_reference.md_file_id and md_parent_id. (Source column name is id; renamed to avoid clashing with a generated surrogate key.)" },
      md_scope: {
        type: "enum",
        meaning: "Case sensitive name of the data scope to which this metadata applies.",
        values: [
          ["undefined", "Metadata information scope is undefined"], ["fieldSession", "Information applies to the field session"],
          ["collectionSession", "Information applies to the collection session"], ["series", "Information applies to the (dataset) series"],
          ["dataset", "Information applies to the (geographic feature) dataset"], ["featureType", "Information applies to a feature type (class)"],
          ["feature", "Information applies to a feature (instance)"], ["attributeType", "Information applies to the attribute class"],
          ["attribute", "Information applies to the characteristic of a feature (instance)"], ["tile", "Information applies to a tile, a spatial subset of geographic data"],
          ["model", "Information applies to a copy or imitation of an existing or hypothetical object"], ["catalog", "Metadata applies to a feature catalog"],
          ["schema", "Metadata applies to an application schema"], ["taxonomy", "Metadata applies to a taxonomy or knowledge system"],
          ["software", "Information applies to a computer program or routine"], ["service", "Information applies to a capability which a service provider entity makes available to a service user entity"],
          ["collectionHardware", "Information applies to the collection hardware class"], ["nonGeographicDataset", "Information applies to non-geographic data"],
          ["dimensionGroup", "Information applies to a dimension group"], ["style", "Information applies to a specific style"],
        ].map(([v, m]) => ({ value: v!, meaning: m! })),
      },
    },
    section: "Metadata extension (gpkg_metadata), table 'Metadata Table Definition' + 'Metadata Scopes' table + its Table Definition SQL",
    docPath: "spec/core/annexes/extension_metadata.adoc",
  },
  {
    code: "gis.gpkg_metadata_reference",
    name: "gpkg_metadata_reference",
    kind: "symbol",
    meaning:
      "Metadata extension: links a gpkg_metadata document to the whole file, a table, a column, a row or a row/column cell, optionally with a hierarchical parent.",
    ddl: { file: "spec/core/annexes/extension_metadata.adoc", table: "gpkg_metadata_reference" },
    desc: { file: "spec/core/annexes/extension_metadata.adoc", id: "gpkg_metadata_reference_cols" },
    overrides: {
      reference_scope: {
        type: "enum",
        meaning: "Lowercase scope of the target this metadata reference applies to.",
        values: [
          { value: "geopackage", meaning: "The whole GeoPackage (table_name is NULL)" },
          { value: "table", meaning: "A whole table" },
          { value: "column", meaning: "A column of a table" },
          { value: "row", meaning: "A row of a table" },
          { value: "row/col", meaning: "A single cell: a column within a row" },
        ],
      },
      md_file_id: { type: "ref", ref_to: "gis.gpkg_metadata" },
      md_parent_id: { type: "ref", ref_to: "gis.gpkg_metadata" },
    },
    notes: "No primary key in the DDL. table_name and column_name are free text naming user tables (not foreign keys).",
    section: "Metadata extension (gpkg_metadata_reference), table 'Metadata Reference Table Definition' + its Table Definition SQL",
    docPath: "spec/core/annexes/extension_metadata.adoc",
  },
  {
    code: "gis.gpkgext_relations",
    name: "gpkgext_relations",
    kind: "symbol",
    meaning:
      "Related Tables extension: declares a relationship between a base data table and a related table through a named mapping table.",
    ddl: { file: "spec/related-tables/annex-sql.adoc", table: "gpkgext_relations" },
    desc: { file: "spec/related-tables/clause_7_normative_text.adoc", id: "gpkgext_relations_table" },
    overrides: {
      id: { rename: "relation_id", meaning: "Autoincrement primary key. (Source column name is id; renamed to avoid clashing with a generated surrogate key.)" },
    },
    notes: "The Related Tables extension document has no stable OGC version in this repository snapshot (its extensions-table 'definition' is listed as TBD).",
    section: "OGC Related Tables Extension, clause 7 table 'Extended Relations Table Definition' + Annex 'Table Definition SQL'",
    docPath: "spec/related-tables/clause_7_normative_text.adoc",
  },
  {
    code: "gis.gpkgext_relation_mapping",
    name: "User-Defined Mapping Table",
    kind: "child",
    parent: "gis.gpkgext_relations",
    meaning:
      "Related Tables extension: one row of a user-defined mapping table, pairing the primary key of a base-table row with that of a related-table row.",
    notes: "The mapping table's own name is stored in gpkgext_relations.mapping_table_name, one table per relation; the spec says it may contain other columns not listed here.",
    ddl: { file: "spec/related-tables/annex-sql.adoc", table: "sample_mapping_table" },
    desc: { file: "spec/related-tables/clause_7_normative_text.adoc", id: "gpkgext_user_defined_mapping_table" },
    section: "OGC Related Tables Extension, clause 7 table 'User-Defined Mapping Table Definition' + Annex SQL sample_mapping_table (informative)",
    docPath: "spec/related-tables/clause_7_normative_text.adoc",
  },
  {
    code: "gis.gpkg_2d_gridded_coverage_ancillary",
    name: "gpkg_2d_gridded_coverage_ancillary",
    kind: "symbol",
    meaning:
      "Tiled Gridded Coverage extension: per tile matrix set encoding of grid cell values (data type, scale, offset, null value, units, quantity).",
    ddl: { file: "spec/2d-gridded-coverage/annex-c.adoc", table: "gpkg_2d_gridded_coverage_ancillary" },
    desc: { file: "spec/2d-gridded-coverage/clause_7_normative_text.adoc", id: "CoverageAncillaryTableDefinition" },
    overrides: {
      id: { rename: "coverage_ancillary_id", meaning: "Autoincrement primary key. (Source column name is id; renamed to avoid clashing with a generated surrogate key.)" },
      datatype: { type: "enum", meaning: "Data type of the grid cell values.", values: [{ value: "integer", meaning: "Cell values stored as integers; scale and offset apply" }, { value: "float", meaning: "Cell values stored as floating point; scale and offset do not apply" }] },
      tile_matrix_set_name: { type: "ref", ref_to: "gis.gpkg_tile_matrix_set" },
    },
    section: "OGC GeoPackage Extension for Tiled Gridded Coverage Data, table 'Coverage Ancillary Table Definition' + Annex C SQL",
    docPath: "spec/2d-gridded-coverage/clause_7_normative_text.adoc",
  },
  {
    code: "gis.gpkg_2d_gridded_tile_ancillary",
    name: "gpkg_2d_gridded_tile_ancillary",
    kind: "symbol",
    meaning:
      "Tiled Gridded Coverage extension: per-tile scale, offset and optional statistics for one tile of a gridded coverage tile table.",
    ddl: { file: "spec/2d-gridded-coverage/annex-c.adoc", table: "gpkg_2d_gridded_tile_ancillary" },
    desc: { file: "spec/2d-gridded-coverage/clause_7_normative_text.adoc", id: "TileAncillaryTableDefinition" },
    overrides: {
      id: { rename: "tile_ancillary_id", meaning: "Autoincrement primary key. (Source column name is id; renamed to avoid clashing with a generated surrogate key.)" },
      tpudt_name: { type: "ref", ref_to: "gis.gpkg_contents" },
      tpudt_id: { type: "bigint" },
    },
    notes: "tpudt_id is the id of a row in the tile pyramid user data table named by tpudt_name, so it cannot be a typed ref; (tpudt_name, tpudt_id) are jointly unique.",
    section: "OGC GeoPackage Extension for Tiled Gridded Coverage Data, table 'Tile Ancillary Table Definition' + Annex C SQL",
    docPath: "spec/2d-gridded-coverage/clause_7_normative_text.adoc",
  },
];

// ---------------------------------------------------------------------------------------------

function ddlTable(sqlDoc: string, name: string): Table {
  for (const b of sqlBlocks(sqlDoc)) for (const t of parseCreateTables(b)) if (t.name === name) return t;
  throw new Error(`DDL for ${name} not found`);
}

function descRows(t: AdocTable): Map<string, { type: string; text: string }> {
  const nameIx = t.header.findIndex((h) => /^column name$/i.test(h.replace(/\*/g, "")));
  const typeIx = t.header.findIndex((h) => /^(column )?type$/i.test(h.replace(/\*/g, "")));
  const descIx = t.header.findIndex((h) => /description/i.test(h));
  if (nameIx < 0 || descIx < 0) throw new Error(`table ${t.id}: cannot find name/description columns in ${JSON.stringify(t.header)}`);
  const m = new Map<string, { type: string; text: string }>();
  for (const r of t.rows) m.set(r[nameIx]!.replace(/\s*\^.*$/, "").trim(), { type: r[typeIx] ?? "", text: r[descIx]! });
  return m;
}

const sentence = (s: string) => {
  const t = cleanCell(s).replace(/\s+/g, " ").trim();
  return t.endsWith(".") ? t : t + ".";
};

function literalDefault(c: Column): Field["default"] | undefined {
  const d = c.default;
  if (d === undefined) return undefined;
  if (/^'.*'$/.test(d)) return d.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(d)) return Number(d);
  return undefined; // expressions such as strftime(...) are described in meaning instead
}

export async function buildGpkg(): Promise<Entity[]> {
  const out: Entity[] = [];
  const codeByTable = new Map(SPECS.map((s) => [s.ddl.table, s.code]));
  codeByTable.set("sample_mapping_table", "gis.gpkgext_relation_mapping");
  for (const s of SPECS) {
    const ddl = ddlTable(await readSource("geopackage", s.ddl.file), s.ddl.table);
    const desc = descRows(parseTable(await readSource("geopackage", s.desc.file), s.desc.id));
    const fields: Field[] = [];
    for (const c of ddl.columns) {
      const o = s.overrides?.[c.name] ?? {};
      const d = desc.get(c.name);
      if (!d && !o.meaning) throw new Error(`${s.code}.${c.name}: no description in spec table ${s.desc.id}`);
      const fk = ddl.foreignKeys.find((f) => f.columns.length === 1 && f.columns[0] === c.name);
      const base: Field = {
        name: o.rename ?? c.name,
        type: SQLTYPE[c.sqlType] ?? (() => { throw new Error(`type ${c.sqlType}`); })(),
        meaning: o.meaning ?? sentence(d!.text),
        source_ref: `${ddl.name}.${c.name} ${c.sqlType}${c.primaryKey || ddl.primaryKey.includes(c.name) ? " (primary key)" : ""}${fk ? ` -> ${fk.refTable}.${fk.refColumns[0]}` : ""}`,
      };
      if (!(c.notNull || ddl.primaryKey.includes(c.name))) base.nullable = true;
      const lit = literalDefault(c);
      if (lit !== undefined) base.default = lit;
      if (fk) {
        const to = codeByTable.get(fk.refTable);
        if (!to) throw new Error(`${s.code}.${c.name}: FK to unknown ${fk.refTable}`);
        base.type = "ref";
        base.ref_to = to;
      }
      const { rename: _r, meaning: _m, ...rest } = o;
      out_assign(base, rest);
      fields.push(base);
    }
    if (s.extra) {
      const ex = descRows(parseTable(await readSource("geopackage", s.extra.file), s.extra.id));
      for (const col of s.extra.columns) {
        const d = ex.get(col);
        if (!d) throw new Error(`${s.code}: extension column ${col} missing`);
        fields.push({
          name: col,
          type: SQLTYPE[d.type.toUpperCase()] ?? "text",
          nullable: true,
          meaning: sentence(d.text),
          source_ref: `${s.extra.id} (CRS WKT extension) ${d.type}`,
        });
      }
    }
    const e: Entity = {
      code: s.code,
      name: s.name,
      kind: s.kind,
      ...(s.parent ? { parent: s.parent } : {}),
      fidelity: "proxy",
      source: gpkgSource(s.docPath, s.section),
      meaning: s.meaning,
      fields: fields.map(clean),
      notes: [
        "Columns, SQL types, nullability and foreign keys DERIVED by tools/harvest/gis/src/derive/gpkg.ts from the spec DDL; field meanings are the spec's own column descriptions (lightly cleaned). Entity meaning" + (s.overrides ? ", enum values and checks" : "") + " are " + HAND.trim().replace(/:$/, "") + " (reviewed).",
        s.extra?.note,
        s.notes,
      ].filter(Boolean).join(" "),
      ...(s.needs_review ? { needs_review: true } : {}),
    };
    out.push(e);
  }
  return out;
}

function out_assign(f: Field, o: Partial<Field>) {
  Object.assign(f, o);
  // an enum replaces the raw SQL type; a ref-or-enum override must not keep stale keys
  if (f.type !== "ref") delete f.ref_to;
}

function clean(f: Field): Field {
  // YAML hygiene: drop undefined keys
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as Field;
}
