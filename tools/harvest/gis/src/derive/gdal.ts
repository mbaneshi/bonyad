/** GDAL/OGR vector data model (dataset, layer, feature definition, field and geometry-field definitions,
 *  field domains, relationships). Enumerations and their one-line meanings are DERIVED from the pinned GDAL
 *  headers (parseCEnum); the entity structure follows the member lists of the classes in ogr_feature.h /
 *  gdal_relationship.h and the prose of doc/source/user/vector_data_model.rst. Entity prose is HAND-AUTHORED. */
import { readSource } from "../fetch";
import { parseCEnum, type EnumEntry } from "../parse/cenum";
import type { Entity, Field } from "../schema";
import { HAND, gdalSource } from "../common";

const DOC = "doc/source/user/vector_data_model.rst";
const FEAT = "ogr/ogr_feature.h";
const CORE = "ogr/ogr_core.h";
const REL = "gcore/gdal_relationship.h";
const NOTE =
  "Structure follows the members of the cited GDAL class; enumeration values are DERIVED from the header by tools/harvest/gis/src/derive/gdal.ts. Entity and field prose is " +
  HAND.trim().replace(/:$/, "") + ". Runtime-only state (reference counts, sealed/ignored flags, caches) is not data and is not modelled.";

const clean = (s: string) => (s ? s.replace(/\s+/g, " ").replace(/\.$/, "") : "");

function enumField(
  name: string,
  entries: EnumEntry[],
  meaning: string,
  source_ref: string,
  opts: Partial<Field> = {},
): Field {
  const seen = new Set<string>();
  const values = entries
    .filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true)))
    .map((e) => ({
      value: e.name,
      meaning: (clean(e.doc) || e.name) + (e.value !== undefined ? ` (code ${e.value})` : ""),
    }));
  return { name, type: "enum", values, meaning, source_ref, ...opts };
}

export async function buildGdal(): Promise<Entity[]> {
  const core = await readSource("gdal", CORE);
  const gdalh = await readSource("gdal", "gcore/gdal.h");
  const fieldType = parseCEnum(core, "OGRFieldType").filter((e) => e.name !== "OFTMaxType");
  const subType = parseCEnum(core, "OGRFieldSubType").filter((e) => e.name !== "OFSTMaxSubType");
  const just = parseCEnum(core, "OGRJustification");
  // base geometry codes only: Z/M/ZM flavours are base + 1000/2000/3000 (header comment) and are carried by has_z/has_m
  const geomBase = parseCEnum(core, "OGRwkbGeometryType").filter((e) => typeof e.value === "number" && e.value >= 0 && e.value <= 101);
  const domType = parseCEnum(core, "OGRFieldDomainType");
  const split = parseCEnum(core, "OGRFieldDomainSplitPolicy");
  const merge = parseCEnum(core, "OGRFieldDomainMergePolicy");
  const card = parseCEnum(gdalh, "GDALRelationshipCardinality");
  const rtype = parseCEnum(gdalh, "GDALRelationshipType");
  for (const [n, a, min] of [["field type", fieldType, 14], ["geometry", geomBase, 18], ["domain type", domType, 3], ["cardinality", card, 4], ["rel type", rtype, 3]] as const)
    if (a.length < min) throw new Error(`GDAL header parse: ${n} has ${a.length} entries, expected >= ${min}`);

  const src = (file: string, section: string, doc = "GDAL/OGR vector data model") => gdalSource(file, section, doc);
  const base = { fidelity: "proxy" as const, notes: NOTE };
  const out: Entity[] = [];

  out.push({
    ...base,
    code: "gis.gdal_dataset",
    name: "GDALDataset",
    kind: "entity",
    source: src(DOC, "Dataset"),
    meaning: "A file, set of files, database or gateway holding a set of layers; the root container of the OGR vector model.",
    fields: [
      { name: "name", type: "text", meaning: "Dataset name, usually a file name or a database connection string, used to reopen it with a driver.", source_ref: "vector_data_model.rst: 'A GDALDataset has a name'" },
      { name: "driver_name", type: "text", nullable: true, meaning: "Short name of the GDALDriver (format translator) that opened or created the dataset, for example GPKG.", source_ref: "GDALDriver, vector_data_model.rst 'Drivers'" },
    ],
  });

  out.push({
    ...base,
    code: "gis.ogr_feature_defn",
    name: "OGRFeatureDefn",
    kind: "symbol",
    source: src(FEAT, "class OGRFeatureDefn; vector_data_model.rst 'Feature / Feature Definition'", "GDAL/OGR source (ogr_feature.h) and documentation"),
    meaning: "The schema of a feature class: its name, allowed geometry type, and (through child rows) the attribute fields and geometry fields shared by all its features.",
    fields: [
      { name: "feature_class_name", type: "text", meaning: "Feature class name, normally used as the layer name.", source_ref: "OGRFeatureDefn::pszFeatureClassName" },
      enumField("geometry_type", geomBase, "Geometry type allowed for the features (OGRFeatureDefn::GetGeomType); wkbUnknown means any type. The Z, M and ZM variants are this code plus 1000, 2000 or 3000 and are not separate values here.", "OGRFeatureDefn::GetGeomType, OGRwkbGeometryType", { default: "wkbUnknown" }),
    ],
    needs_review: true,
    notes: NOTE + " Review: since GDAL 1.11 the geometry type of a definition is the type of its first geometry field; a definition can hold several geometry fields (gis.ogr_geom_field_defn), so this column is a convenience mirror of the first one. Confirm before relying on it.",
  });

  out.push({
    ...base,
    code: "gis.ogr_layer",
    name: "OGRLayer",
    kind: "entity",
    source: src(DOC, "Layer"),
    meaning: "A layer of features inside a dataset; all its features share one OGRFeatureDefn.",
    fields: [
      { name: "dataset", type: "ref", ref_to: "gis.gdal_dataset", meaning: "The dataset that owns the layer.", source_ref: "vector_data_model.rst: layers are owned by their GDALDataset" },
      { name: "definition", type: "ref", ref_to: "gis.ogr_feature_defn", meaning: "The feature definition (schema) of the layer; the relationship is one-to-one.", source_ref: "vector_data_model.rst: 'always has a one-to-one relationship to an OGRFeatureDefn'" },
    ],
  });

  out.push({
    ...base,
    code: "gis.ogr_field_defn",
    name: "OGRFieldDefn",
    kind: "child",
    parent: "gis.ogr_feature_defn",
    source: src(FEAT, "class OGRFieldDefn", "GDAL/OGR source (ogr_feature.h) and documentation"),
    meaning: "Definition of one attribute field of a feature class: type, subtype, width and precision, nullability, uniqueness, default and optional field domain. Order within the feature definition is the child position.",
    fields: [
      { name: "name", type: "text", meaning: "Field name.", source_ref: "OGRFieldDefn::pszName" },
      { name: "alternative_name", type: "text", nullable: true, meaning: "Alternative name (alias) of the field, for display.", source_ref: "OGRFieldDefn::pszAlternativeName" },
      enumField("field_type", fieldType, "Field type from OGRFieldType.", "OGRFieldDefn::eType"),
      enumField("field_subtype", subType, "Restriction hint on the field type (for example OFTInteger with OFSTBoolean).", "OGRFieldDefn::eSubType", { default: "OFSTNone" }),
      enumField("justify", just, "Display justification of the field values.", "OGRFieldDefn::eJustify", { default: "OJUndefined" }),
      { name: "width", type: "int", default: 0, check: "non_negative", meaning: "Maximum width of the formatted value; zero means variable.", source_ref: "OGRFieldDefn::nWidth ('Zero is variable')" },
      { name: "precision", type: "int", default: 0, check: "non_negative", meaning: "Number of decimal digits for real fields.", source_ref: "OGRFieldDefn::nPrecision" },
      { name: "default_value", type: "text", nullable: true, meaning: "Default value expression used when a value is not specified.", source_ref: "OGRFieldDefn::pszDefault" },
      { name: "nullable", type: "bool", default: true, meaning: "Whether the field may be null.", source_ref: "OGRFieldDefn::bNullable" },
      { name: "is_unique", type: "bool", default: false, meaning: "Whether values must be unique within the layer.", source_ref: "OGRFieldDefn::bUnique" },
      { name: "is_generated", type: "bool", default: false, meaning: "Whether the field is a generated (computed) column; tracked by drivers such as GPKG.", source_ref: "OGRFieldDefn::m_bGenerated" },
      { name: "domain", type: "ref", ref_to: "gis.ogr_field_domain", nullable: true, meaning: "The single field domain constraining the values, if any; the domain belongs to the dataset.", source_ref: "OGRFieldDefn::m_osDomainName" },
      { name: "comment", type: "text", nullable: true, meaning: "Free-text field comment.", source_ref: "OGRFieldDefn::m_osComment" },
      { name: "tz_flag", type: "int", default: 0, meaning: "Time-zone flag of date-time fields: 0 unknown, 1 local time, 2 mixed time zones, 100 UTC, other values encode the offset in 15-minute steps (UTC offset = (flag - 100) * 15 minutes).", source_ref: "OGR_TZFLAG_* in ogr_core.h; OGRFieldDefn::m_nTZFlag" },
    ],
  });

  out.push({
    ...base,
    code: "gis.ogr_geom_field_defn",
    name: "OGRGeomFieldDefn",
    kind: "child",
    parent: "gis.ogr_feature_defn",
    source: src(FEAT, "class OGRGeomFieldDefn; ogr_geomcoordinateprecision.h", "GDAL/OGR source (ogr_feature.h) and documentation"),
    meaning: "Definition of one geometry field of a feature class: allowed geometry type, spatial reference system, nullability and coordinate precision.",
    fields: [
      { name: "name", type: "text", meaning: "Geometry field name (may be empty for formats with a single anonymous geometry).", source_ref: "OGRGeomFieldDefn::pszName" },
      enumField("geometry_type", geomBase, "Geometry type allowed in this field; all values possible except wkbNone. Z/M variants are carried by the code offsets 1000/2000/3000.", "OGRGeomFieldDefn::eGeomType", { default: "wkbUnknown" }),
      { name: "spatial_reference", type: "ref", ref_to: "gis.spatial_reference", nullable: true, meaning: "Spatial reference system of the field; null when unknown.", source_ref: "OGRGeomFieldDefn::poSRS" },
      { name: "nullable", type: "bool", default: true, meaning: "Whether the geometry may be null.", source_ref: "OGRGeomFieldDefn::bNullable" },
      { name: "xy_resolution", type: "float", nullable: true, meaning: "Resolution of the X and Y coordinates in the units of the SRS X/Y axes (1e-3 on a metre CRS is 1 mm); null when unknown (the header uses 0 for unknown).", source_ref: "OGRGeomCoordinatePrecision::dfXYResolution" },
      { name: "z_resolution", type: "float", nullable: true, meaning: "Resolution of the Z coordinate in the units of the SRS Z axis; null when unknown.", source_ref: "OGRGeomCoordinatePrecision::dfZResolution" },
      { name: "m_resolution", type: "float", nullable: true, meaning: "Resolution of the M coordinate; null when unknown.", source_ref: "OGRGeomCoordinatePrecision::dfMResolution" },
    ],
    notes: NOTE + " Per-format coordinate precision options (oFormatSpecificOptions, a string map) are not modelled: no JSON or map column exists in the format; listed in GAPS.md.",
  });

  out.push({
    ...base,
    code: "gis.ogr_feature",
    name: "OGRFeature",
    kind: "entity",
    source: src(FEAT, "class OGRFeature; vector_data_model.rst 'Feature / Feature Definition'", "GDAL/OGR source (ogr_feature.h) and documentation"),
    meaning: "One vector feature: an identity within a layer plus its geometries and attribute values, interpreted through a feature definition. Attribute values live in the layer's own columns, not here.",
    fields: [
      { name: "definition", type: "ref", ref_to: "gis.ogr_feature_defn", meaning: "The feature class definition that gives meaning to the feature's fields.", source_ref: "OGRFeature::poDefn" },
      { name: "fid", type: "bigint", nullable: true, meaning: "Feature id, unique within its layer (64-bit); null stands for OGRNullFID (-1), a feature not yet written.", source_ref: "OGRFeature::nFID; OGRNullFID -1" },
      { name: "style_string", type: "text", nullable: true, meaning: "OGR feature style string (pen, brush, symbol, label tools) for this feature.", source_ref: "OGRFeature::m_pszStyleString" },
      { name: "native_data", type: "text", nullable: true, meaning: "Format-specific serialisation of the feature as read from the source (for example GeoJSON), kept for round trips.", source_ref: "OGRFeature::m_pszNativeData" },
      { name: "native_media_type", type: "text", nullable: true, meaning: "Media type of native_data, for example application/vnd.geo+json.", source_ref: "OGRFeature::m_pszNativeMediaType" },
    ],
  });

  const domainFields: Field[] = [
    { name: "dataset", type: "ref", ref_to: "gis.gdal_dataset", meaning: "The dataset the domain is associated with.", source_ref: "vector_data_model.rst 'Field Domains'" },
    { name: "name", type: "text", meaning: "Domain name, unique within the dataset.", source_ref: "OGRFieldDomain::m_osName" },
    { name: "description", type: "text", nullable: true, meaning: "Domain description.", source_ref: "OGRFieldDomain::m_osDescription" },
    enumField("field_type", fieldType, "Field type of the values the domain constrains.", "OGRFieldDomain::m_eFieldType"),
    enumField("field_subtype", subType, "Field subtype of the constrained values.", "OGRFieldDomain::m_eFieldSubType", { default: "OFSTNone" }),
    enumField("split_policy", split, "How the attribute value is computed when a feature is split in two.", "OGRFieldDomain::m_eSplitPolicy", { default: "OFDSP_DEFAULT_VALUE" }),
    enumField("merge_policy", merge, "How the attribute value is computed when two features are merged.", "OGRFieldDomain::m_eMergePolicy", { default: "OFDMP_DEFAULT_VALUE" }),
  ];
  out.push({
    ...base,
    code: "gis.ogr_field_domain",
    name: "OGRFieldDomain",
    kind: "abstract",
    source: src(FEAT, "class OGRFieldDomain; vector_data_model.rst 'Field Domains'", "GDAL/OGR source (ogr_feature.h) and documentation"),
    meaning: "Describes the values an attribute field may hold (coded list, range or glob pattern). GDAL stores it but does not validate against it.",
    fields: domainFields,
    notes: NOTE + " The domain type is the concrete subtype (coded, range, glob), recorded by the generated type_code column, so no separate domain_type column exists (OGRFieldDomainType: " + domType.map((d) => d.name).join(", ") + ").",
  });
  out.push({
    ...base,
    code: "gis.ogr_coded_field_domain",
    name: "OGRCodedFieldDomain",
    kind: "entity",
    base: "gis.ogr_field_domain",
    source: src(FEAT, "class OGRCodedFieldDomain", "GDAL/OGR source (ogr_feature.h)"),
    meaning: "A domain that constrains values to those present in an enumeration of code/value pairs.",
    fields: [],
  });
  out.push({
    ...base,
    code: "gis.ogr_coded_value",
    name: "OGRCodedValue",
    kind: "child",
    parent: "gis.ogr_coded_field_domain",
    source: src(FEAT, "struct OGRCodedValue; class OGRCodedFieldDomain", "GDAL/OGR source (ogr_core.h, ogr_feature.h)"),
    meaning: "One allowed code of a coded domain with its optional human-readable value.",
    fields: [
      { name: "code", type: "text", meaning: "The stored code, written as text whatever the field type.", source_ref: "OGRCodedValue::pszCode" },
      { name: "value", type: "text", nullable: true, meaning: "Description of the code; absent when the domain only lists codes.", source_ref: "OGRCodedValue::pszValue" },
    ],
  });
  out.push({
    ...base,
    code: "gis.ogr_range_field_domain",
    name: "OGRRangeFieldDomain",
    kind: "entity",
    base: "gis.ogr_field_domain",
    source: src(FEAT, "class OGRRangeFieldDomain", "GDAL/OGR source (ogr_feature.h)"),
    meaning: "A domain that constrains numeric or date values to a range with optionally inclusive bounds.",
    fields: [
      { name: "min_value", type: "text", nullable: true, meaning: "Lower bound as text (the header stores it in a union typed by the field type); absent when unbounded.", source_ref: "OGRRangeFieldDomain::m_sMin" },
      { name: "min_is_inclusive", type: "bool", default: true, meaning: "Whether the lower bound itself is allowed.", source_ref: "OGRRangeFieldDomain::m_bMinIsInclusive" },
      { name: "max_value", type: "text", nullable: true, meaning: "Upper bound as text; absent when unbounded.", source_ref: "OGRRangeFieldDomain::m_sMax" },
      { name: "max_is_inclusive", type: "bool", default: true, meaning: "Whether the upper bound itself is allowed.", source_ref: "OGRRangeFieldDomain::m_bMaxIsInclusive" },
    ],
    notes: NOTE + " Bounds are text because the source union (OGRField) is typed by the owning field_type and the catalogue format has no variant column.",
  });
  out.push({
    ...base,
    code: "gis.ogr_glob_field_domain",
    name: "OGRGlobFieldDomain",
    kind: "entity",
    base: "gis.ogr_field_domain",
    source: src(FEAT, "class OGRGlobFieldDomain", "GDAL/OGR source (ogr_feature.h)"),
    meaning: "A domain that constrains values to those matching a glob pattern (used by GeoPackage).",
    fields: [{ name: "glob", type: "text", meaning: "The glob pattern the values must match.", source_ref: "OGRGlobFieldDomain::m_osGlob" }],
  });

  out.push({
    ...base,
    code: "gis.gdal_relationship",
    name: "GDALRelationship",
    kind: "entity",
    source: src(REL, "class GDALRelationship; gdal.h 'Relationships'", "GDAL source (gdal_relationship.h, gdal.h)"),
    meaning: "A relationship between two tables (layers) of a dataset, for example a foreign key, optionally through a mapping table.",
    fields: [
      { name: "dataset", type: "ref", ref_to: "gis.gdal_dataset", meaning: "The dataset that holds the relationship.", source_ref: "vector_data_model.rst: GDALDataset may be aware of relationships" },
      { name: "name", type: "text", meaning: "Relationship name.", source_ref: "GDALRelationship::m_osName" },
      { name: "left_table_name", type: "text", meaning: "Name of the left (origin) table.", source_ref: "GDALRelationship::m_osLeftTableName" },
      { name: "right_table_name", type: "text", meaning: "Name of the right (destination) table.", source_ref: "GDALRelationship::m_osRightTableName" },
      enumField("cardinality", card, "Cardinality of the relationship.", "GDALRelationship::m_eCardinality", { default: "GRC_ONE_TO_MANY" }),
      enumField("relationship_type", rtype, "Type of the relationship.", "GDALRelationship::m_eType", { default: "GRT_ASSOCIATION" }),
      { name: "mapping_table_name", type: "text", nullable: true, meaning: "Name of the mapping table for many-to-many relationships.", source_ref: "GDALRelationship::m_osMappingTableName" },
      { name: "left_table_fields", type: "array", of: "text", meaning: "Left-table field names that form the key.", source_ref: "GDALRelationship::m_osListLeftTableFields" },
      { name: "right_table_fields", type: "array", of: "text", meaning: "Right-table field names that form the key.", source_ref: "GDALRelationship::m_osListRightTableFields" },
      { name: "left_mapping_table_fields", type: "array", of: "text", nullable: true, meaning: "Mapping-table fields that point at the left table.", source_ref: "GDALRelationship::m_osListLeftMappingTableFields" },
      { name: "right_mapping_table_fields", type: "array", of: "text", nullable: true, meaning: "Mapping-table fields that point at the right table.", source_ref: "GDALRelationship::m_osListRightMappingTableFields" },
      { name: "forward_path_label", type: "text", nullable: true, meaning: "Label of the relationship path from the left to the right table.", source_ref: "GDALRelationship::m_osForwardPathLabel" },
      { name: "backward_path_label", type: "text", nullable: true, meaning: "Label of the relationship path from the right to the left table.", source_ref: "GDALRelationship::m_osBackwardPathLabel" },
      { name: "related_table_type", type: "text", nullable: true, meaning: "Type string of the related table, for example media or features (GeoPackage related-tables extension).", source_ref: "GDALRelationship::m_osRelatedTableType" },
    ],
  });
  return out;
}
