/** Coordinate reference system entities: datum, ellipsoid, prime meridian, coordinate system and axes,
 *  map projection (conversion) and the spatial reference itself. HAND-AUTHORED from the OGC WKT2 standard
 *  (OGC 18-010r7 / ISO 19162:2019, which names the concepts and their attributes) and cross-checked against
 *  the table STRUCTURE of the PROJ database (data/sql/proj_db_table_defs.sql). No EPSG/ESRI data rows are used.
 *  Lengths are metres and angles radians: values are converted at the source boundary (the WKT unit factor). */
import type { Entity, Field } from "../schema";
import { HAND, projSource, wkt2Source } from "../common";

const NOTE =
  "CRS model is " + HAND.trim().replace(/:$/, "") + ": the attribute set follows the cited WKT2 clauses and the PROJ table columns, not generated. Measures are stored in SI base units (metres, radians); the source unit and its conversion factor are kept where they cannot be recovered, so a value in feet or degrees is converted once at import.";

const dirs = [
  "north", "northNorthEast", "northEast", "eastNorthEast", "east", "eastSouthEast", "southEast", "southSouthEast",
  "south", "southSouthWest", "southWest", "westSouthWest", "west", "westNorthWest", "northWest", "northNorthWest",
  "geocentricX", "geocentricY", "geocentricZ", "up", "down", "forward", "aft", "port", "starboard",
  "clockwise", "counterClockwise", "columnPositive", "columnNegative", "rowPositive", "rowNegative",
  "displayRight", "displayLeft", "displayUp", "displayDown", "future", "past", "towards", "awayFrom", "unspecified",
];

const authority = (what: string): Field[] => [
  { name: "authority_name", type: "text", nullable: true, meaning: `Authority that defines this ${what}, for example EPSG.`, source_ref: "WKT2 <identifier> ID[authority, code] (7.3.4)" },
  { name: "authority_code", type: "text", nullable: true, meaning: `Code of this ${what} within the authority; text because authorities use both numbers and strings.`, source_ref: "WKT2 <identifier> ID[authority, code]; PROJ code INTEGER_OR_TEXT" },
];

export function buildCrs(): Entity[] {
  const base = { fidelity: "proxy" as const, notes: NOTE };
  const out: Entity[] = [];

  out.push({
    ...base,
    code: "gis.ellipsoid",
    name: "Ellipsoid",
    kind: "symbol",
    source: wkt2Source("8.2.1 Ellipsoid (ELLIPSOID / SPHEROID); PROJ table ellipsoid"),
    meaning: "A reference ellipsoid (an oblate spheroid approximating the shape of a body), defined by its semi-major axis and either its inverse flattening or its semi-minor axis.",
    fields: [
      { name: "name", type: "text", meaning: "Ellipsoid name.", source_ref: "WKT2 <ellipsoid name>" },
      { name: "semi_major_axis", type: "length", check: "positive", meaning: "Semi-major axis a, in metres (converted from the WKT length unit).", source_ref: "WKT2 <semi-major axis>; PROJ ellipsoid.semi_major_axis" },
      { name: "inverse_flattening", type: "float", nullable: true, meaning: "Inverse flattening 1/f = a/(a-b); 0 for a sphere, otherwise at least 1. Exactly one of inverse_flattening and semi_minor_axis is given.", source_ref: "WKT2 <inverse flattening>; PROJ ellipsoid.inv_flattening CHECK (= 0 OR >= 1.0)" },
      { name: "semi_minor_axis", type: "length", nullable: true, check: "positive", meaning: "Semi-minor axis b, in metres, when the ellipsoid is defined by it instead of the inverse flattening.", source_ref: "PROJ ellipsoid.semi_minor_axis (mutually exclusive with inv_flattening)" },
      ...authority("ellipsoid"),
    ],
    needs_review: true,
    notes: NOTE + " Review: the 'exactly one of inverse_flattening / semi_minor_axis' rule is a PROJ CHECK constraint, not a WKT2 rule (WKT2 always writes inverse flattening); not enforceable in the field model.",
  });

  out.push({
    ...base,
    code: "gis.prime_meridian",
    name: "PrimeMeridian",
    kind: "symbol",
    source: wkt2Source("8.2.2 Prime meridian (PRIMEM); PROJ table prime_meridian"),
    meaning: "The meridian from which longitudes are counted, given as a longitude relative to Greenwich.",
    fields: [
      { name: "name", type: "text", meaning: "Prime meridian name, for example Greenwich.", source_ref: "WKT2 <prime meridian name>" },
      { name: "longitude", type: "angle", meaning: "Longitude of the meridian relative to Greenwich, in radians (converted from the WKT angle unit, degrees by default).", source_ref: "WKT2 <irm longitude>; PROJ prime_meridian.longitude" },
      ...authority("prime meridian"),
    ],
  });

  out.push({
    ...base,
    code: "gis.datum",
    name: "Datum",
    kind: "symbol",
    source: wkt2Source("Clause 8 (geodetic CRS datum), 10 (vertical), 12 (engineering), 7.6 datum ensemble, 7.7 dynamic; PROJ tables geodetic_datum, vertical_datum, engineering_datum"),
    meaning: "A reference frame that ties a coordinate system to the Earth (or another body): a geodetic datum with its ellipsoid and prime meridian, a vertical datum, an engineering datum, or an ensemble of such frames.",
    fields: [
      { name: "name", type: "text", meaning: "Datum name, for example World Geodetic System 1984.", source_ref: "WKT2 <datum name>" },
      {
        name: "datum_kind", type: "enum",
        meaning: "Which kind of datum this is; decides which other attributes apply.",
        values: [
          { value: "geodetic", meaning: "Geodetic reference frame (DATUM / TRF / GEODETICDATUM); has an ellipsoid and a prime meridian" },
          { value: "vertical", meaning: "Vertical reference frame (VDATUM / VRF); heights or depths" },
          { value: "engineering", meaning: "Engineering datum (EDATUM): a local, non-geodetic frame" },
          { value: "ensemble", meaning: "Datum ensemble: a collection of reference frames treated as one at a stated accuracy" },
        ],
        source_ref: "WKT2 clauses 8, 10, 12, 7.6",
      },
      { name: "ellipsoid", type: "ref", ref_to: "gis.ellipsoid", nullable: true, meaning: "Ellipsoid of a geodetic datum; absent for other kinds.", source_ref: "WKT2 8.2.1; PROJ geodetic_datum.ellipsoid_*" },
      { name: "prime_meridian", type: "ref", ref_to: "gis.prime_meridian", nullable: true, meaning: "Prime meridian of a geodetic datum; Greenwich when WKT omits it.", source_ref: "WKT2 8.2.2; PROJ geodetic_datum.prime_meridian_*" },
      { name: "anchor", type: "text", nullable: true, meaning: "Description of how the datum is anchored to the Earth (a point or a realisation).", source_ref: "WKT2 ANCHOR (8, 10, 11, 12); PROJ geodetic_datum.anchor" },
      { name: "anchor_epoch", type: "float", nullable: true, unit: "decimal year", meaning: "Epoch of the anchor, as a decimal year.", source_ref: "PROJ geodetic_datum.anchor_epoch" },
      { name: "frame_reference_epoch", type: "float", nullable: true, unit: "decimal year", meaning: "Epoch of the coordinates that define a dynamic reference frame; present only for dynamic datums.", source_ref: "WKT2 7.7 DYNAMIC[FRAMEEPOCH[..]]; PROJ geodetic_datum.frame_reference_epoch" },
      { name: "ensemble_accuracy", type: "length", nullable: true, check: "positive", meaning: "Accuracy of a datum ensemble in metres: the largest difference expected between members.", source_ref: "WKT2 7.6 ENSEMBLEACCURACY; PROJ geodetic_datum.ensemble_accuracy" },
      { name: "publication_date", type: "date", nullable: true, meaning: "Publication date of the datum definition.", source_ref: "PROJ geodetic_datum.publication_date" },
      ...authority("datum"),
    ],
    needs_review: true,
    notes: NOTE + " Review: the four kinds fold WKT2's separate datum types into one table so a CRS can point at one row; parametric and temporal datums are omitted (no use in the vector model) and listed in GAPS.md. Ensemble members (WKT2 MEMBER) are not modelled.",
  });

  out.push({
    ...base,
    code: "gis.coordinate_system",
    name: "CoordinateSystem",
    kind: "symbol",
    source: wkt2Source("7.5 Coordinate system (CS); PROJ table coordinate_system"),
    meaning: "The set of axes, with their order, direction and unit, that gives meaning to coordinate tuples of a CRS.",
    fields: [
      {
        name: "cs_type", type: "enum",
        meaning: "Type of coordinate system.",
        values: [
          { value: "Cartesian", meaning: "Straight perpendicular axes, all in one unit (2 or 3 axes)" },
          { value: "ellipsoidal", meaning: "Geodetic latitude, longitude and optional ellipsoidal height" },
          { value: "spherical", meaning: "Spherical coordinates (distance, longitude, latitude)" },
          { value: "vertical", meaning: "One axis, height or depth" },
          { value: "ordinal", meaning: "Ordinal coordinate system, as used for image grids" },
          { value: "affine", meaning: "Affine (possibly skewed or unequally scaled) axes" },
          { value: "cylindrical", meaning: "Cylindrical coordinates" },
          { value: "polar", meaning: "Polar coordinates" },
          { value: "linear", meaning: "One-dimensional linear coordinate system along a path (for example linear referencing)" },
          { value: "parametric", meaning: "Parametric values" },
          { value: "temporalCount", meaning: "Temporal coordinates as a count of intervals" },
          { value: "temporalMeasure", meaning: "Temporal coordinates as a measure" },
          { value: "temporalDateTime", meaning: "Temporal coordinates as a date and time" },
        ],
        source_ref: "WKT2 7.5.2 <cs type>; PROJ coordinate_system.type (subset)",
      },
      { name: "dimension", type: "int", min: 1, max: 4, meaning: "Number of axes (the order of the coordinate tuple).", source_ref: "WKT2 7.5.2 <dimension>; PROJ coordinate_system.dimension BETWEEN 1 AND 3" },
      ...authority("coordinate system"),
    ],
    notes: NOTE + " PROJ limits the dimension to 3; WKT2 allows more for some types, so the bound here is the WKT2-based 4 (review).",
    needs_review: true,
  });

  out.push({
    ...base,
    code: "gis.coordinate_system_axis",
    name: "Axis",
    kind: "child",
    parent: "gis.coordinate_system",
    source: wkt2Source("7.5.3 Axis (AXIS), 7.5.4 axis direction; PROJ table axis"),
    meaning: "One axis of a coordinate system. Its position in the parent is the axis order (ORDER), which is what makes 'axis order' (latitude first or longitude first) explicit.",
    fields: [
      { name: "name", type: "text", meaning: "Axis name, for example latitude or easting.", source_ref: "WKT2 <axis name and abbreviation>" },
      { name: "abbreviation", type: "text", nullable: true, meaning: "Axis abbreviation, for example Lat or E.", source_ref: "WKT2 axis abbreviation; PROJ axis.abbrev" },
      { name: "direction", type: "enum", meaning: "Direction in which the axis values increase.", values: dirs.map((d) => ({ value: d, meaning: `WKT2 axis direction '${d}'` })), source_ref: "WKT2 7.5.4 <axis direction>; PROJ axis.orientation" },
      { name: "meridian", type: "angle", nullable: true, meaning: "For north/south directions in polar projections: the meridian along which the axis points, in radians.", source_ref: "WKT2 7.5.4 MERIDIAN" },
      { name: "bearing", type: "angle", nullable: true, meaning: "For clockwise/counterClockwise directions: the reference bearing, in radians.", source_ref: "WKT2 7.5.4 BEARING" },
      { name: "unit_name", type: "text", nullable: true, meaning: "Name of the axis unit, for example metre or degree.", source_ref: "WKT2 7.4 <axis unit>; PROJ unit_of_measure.name" },
      { name: "unit_to_si", type: "float", nullable: true, check: "positive", meaning: "Conversion factor from the axis unit to the SI base unit (metre, or radian for angles); for degrees 0.0174532925199433.", source_ref: "WKT2 7.4.1 unit conversion factor; PROJ unit_of_measure.conv_factor" },
    ],
    notes: NOTE + " Axis position (ORDER) is the child's generated position column. The direction values are copied from the BNF in 7.5.4.",
  });

  out.push({
    ...base,
    code: "gis.map_projection",
    name: "Conversion",
    kind: "symbol",
    source: wkt2Source("9.3 Map projection (CONVERSION / PROJECTION); PROJ tables conversion_method, conversion_table"),
    meaning: "The coordinate conversion with its method and parameter values that turns geographic coordinates into projected ones (the 'projection' of a projected CRS).",
    fields: [
      { name: "name", type: "text", meaning: "Conversion name, for example UTM zone 32N.", source_ref: "WKT2 <map projection name>" },
      { name: "method_name", type: "text", meaning: "Name of the projection method, for example Transverse Mercator.", source_ref: "WKT2 <map projection method name>; PROJ conversion_method.name" },
      { name: "method_authority_name", type: "text", nullable: true, meaning: "Authority of the method identifier.", source_ref: "WKT2 method ID" },
      { name: "method_authority_code", type: "text", nullable: true, meaning: "Code of the method within the authority.", source_ref: "WKT2 method ID; PROJ conversion_method.code" },
      ...authority("conversion"),
    ],
  });

  out.push({
    ...base,
    code: "gis.map_projection_parameter",
    name: "Parameter",
    kind: "child",
    parent: "gis.map_projection",
    source: wkt2Source("9.3.3 Map projection parameter (PARAMETER, PARAMETERFILE); PROJ table conversion_param"),
    meaning: "One named parameter of a map projection (latitude of origin, false easting, scale factor) with its value and unit.",
    fields: [
      { name: "name", type: "text", meaning: "Parameter name, for example Latitude of natural origin.", source_ref: "WKT2 <map projection parameter name>; PROJ conversion_param.name" },
      { name: "value", type: "float", nullable: true, meaning: "Parameter value in the unit given by unit_name; absent when the parameter is a file reference.", source_ref: "WKT2 <parameter value>" },
      { name: "file_name", type: "text", nullable: true, meaning: "File holding the parameter value, when the value is a file.", source_ref: "WKT2 PARAMETERFILE" },
      { name: "unit_name", type: "text", nullable: true, meaning: "Unit of the value: degree, metre, or unity for scale.", source_ref: "WKT2 <parameter unit>" },
      { name: "unit_to_si", type: "float", nullable: true, check: "positive", meaning: "Conversion factor from the parameter unit to the SI base unit.", source_ref: "WKT2 unit conversion factor" },
      ...authority("parameter"),
    ],
    notes: NOTE + " The value is kept in its source unit (with unit_to_si) because a parameter's quantity depends on the method; converting needs the method table, which is not harvested.",
  });

  out.push({
    ...base,
    code: "gis.spatial_reference",
    name: "OGRSpatialReference",
    kind: "entity",
    source: wkt2Source("Clauses 8-17 (CRS types), 7.3 general rules; GDAL OGRSpatialReference (doc/source/user/vector_data_model.rst 'Spatial Reference'); PROJ tables geodetic_crs, projected_crs, vertical_crs, compound_crs"),
    meaning: "A coordinate reference system: how coordinates of a geometry relate to the Earth. It names the datum, the coordinate system with axis order and units, and (for projected CRSs) the map projection.",
    fields: [
      { name: "name", type: "text", meaning: "CRS name, for example WGS 84 / UTM zone 32N.", source_ref: "WKT2 <crs name>" },
      {
        name: "crs_type", type: "enum",
        meaning: "Kind of CRS (the WKT2 keyword).",
        values: [
          { value: "geographic_2d", meaning: "GEOGCRS with an ellipsoidal 2D coordinate system (latitude, longitude)" },
          { value: "geographic_3d", meaning: "GEOGCRS with an ellipsoidal 3D coordinate system (with ellipsoidal height)" },
          { value: "geocentric", meaning: "GEODCRS with an earth-centred Cartesian coordinate system" },
          { value: "projected", meaning: "PROJCRS: a geographic base CRS plus a map projection" },
          { value: "vertical", meaning: "VERTCRS: heights or depths against a vertical datum" },
          { value: "engineering", meaning: "ENGCRS: a local engineering coordinate system" },
          { value: "compound", meaning: "COMPOUNDCRS: a horizontal CRS combined with a vertical one" },
          { value: "derived", meaning: "A CRS derived from another by a coordinate conversion" },
        ],
        source_ref: "WKT2 clauses 8-17 keywords; PROJ geodetic_crs.type",
      },
      { name: "datum", type: "ref", ref_to: "gis.datum", nullable: true, meaning: "Datum of the CRS; absent for projected and compound CRSs, which take it from their base.", source_ref: "WKT2 DATUM / TRF; PROJ geodetic_crs.datum_*" },
      { name: "coordinate_system", type: "ref", ref_to: "gis.coordinate_system", nullable: true, meaning: "Coordinate system with axes (axis order and units).", source_ref: "WKT2 CS[..]; PROJ *_crs.coordinate_system_*" },
      { name: "base_crs", type: "ref", ref_to: "gis.spatial_reference", nullable: true, meaning: "Base CRS of a projected or derived CRS (BASEGEOGCRS).", source_ref: "WKT2 BASEGEOGCRS (9.2); PROJ projected_crs.geodetic_crs_*" },
      { name: "projection", type: "ref", ref_to: "gis.map_projection", nullable: true, meaning: "Map projection of a projected CRS.", source_ref: "WKT2 CONVERSION (9.3); PROJ projected_crs.conversion_*" },
      { name: "horizontal_crs", type: "ref", ref_to: "gis.spatial_reference", nullable: true, meaning: "Horizontal component of a compound CRS.", source_ref: "WKT2 COMPOUNDCRS (16)" },
      { name: "vertical_crs", type: "ref", ref_to: "gis.spatial_reference", nullable: true, meaning: "Vertical component of a compound CRS.", source_ref: "WKT2 COMPOUNDCRS (16)" },
      { name: "coordinate_epoch", type: "float", nullable: true, unit: "decimal year", meaning: "Epoch to which coordinates are referenced, for a dynamic CRS.", source_ref: "WKT2 3.1.6 coordinate epoch; 9.4 / 18 COORDEPOCH" },
      {
        name: "axis_mapping_strategy", type: "enum", default: "authority_compliant",
        meaning: "How GDAL maps the order of data axes (x,y) to the CRS axis order. Stored coordinates are x,y regardless; this says how to read the CRS.",
        values: [
          { value: "traditional_gis_order", meaning: "OAMS_TRADITIONAL_GIS_ORDER: longitude/easting first" },
          { value: "authority_compliant", meaning: "OAMS_AUTHORITY_COMPLIANT: the order mandated by the CRS authority (for EPSG:4326 latitude first)" },
          { value: "custom", meaning: "OAMS_CUSTOM: a custom mapping" },
        ],
        source_ref: "OSRAxisMappingStrategy in ogr_srs_api.h",
      },
      { name: "wkt", type: "text", nullable: true, meaning: "The full WKT2 text of the CRS, as stored by GeoPackage definition_12_063 or read by GDAL; a verbatim copy for exchange, not a replacement for the structured columns.", source_ref: "WKT2 7.2; GeoPackage gpkg_spatial_ref_sys.definition_12_063" },
      ...authority("CRS"),
      { name: "scope", type: "text", nullable: true, meaning: "Description of the purpose for which the CRS is suitable.", source_ref: "WKT2 7.3.3 SCOPE" },
      { name: "area_description", type: "text", nullable: true, meaning: "Text description of the area of use.", source_ref: "WKT2 7.3.3 AREA" },
    ],
    needs_review: true,
    notes: NOTE + " Review: wkt duplicates the structured columns (rule 2 says never store derived values). It is kept because the open exchange formats (GeoPackage, GDAL) treat WKT as the authoritative definition and the structured columns as a decoded view; decide which side wins before importers are written. Area-of-use bounding box (WKT2 BBOX) is not modelled yet (GAPS.md).",
  });

  return out;
}
