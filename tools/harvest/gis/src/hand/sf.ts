/** OGC Simple Features geometry model (plus the SQL/MM curve types GeoPackage and GDAL carry), HAND-AUTHORED
 *  from OGC 06-103r4, the GeoPackage geometry-types annex and GDAL's ogr_geometry.h / ogr_core.h.
 *  Type hierarchy follows the GeoPackage annex "Geometry Types" subtype statements; Z and M handling follows
 *  SFA 6.1.2.1 (coordinate dimension) and the ISO WKB code table 7. */
import type { Entity, Field, Source } from "../schema";
import { HAND, gdalSource, gpkgSource, sfaSource } from "../common";

const GPKG_GT = "spec/core/annexes/geometrytypes.adoc";
const NOTE_COMMON =
  "Geometry model is " + HAND + "its hierarchy, parts-as-child decomposition and field set were authored from the cited clauses, not generated. Child rows carry no position field: the generated position column is the order (rules 5 and 9 of FORMAT.md).";

const xyzm = (): Field[] => [
  { name: "x", type: "float", meaning: "X coordinate (easting or longitude) in the units of the geometry's CRS; not converted to radians because the unit belongs to the CRS axis, not to the geometry.", source_ref: "SFA 6.1.4 Point.X()" },
  { name: "y", type: "float", meaning: "Y coordinate (northing or latitude) in the units of the geometry's CRS.", source_ref: "SFA 6.1.4 Point.Y()" },
  { name: "z", type: "float", nullable: true, meaning: "Z coordinate (typically altitude or elevation); present only when the owning geometry has_z is true.", source_ref: "SFA 6.1.4 Point.Z(), NIL if absent" },
  { name: "m", type: "float", nullable: true, meaning: "M coordinate (a measurement); present only when the owning geometry has_m is true.", source_ref: "SFA 6.1.4 Point.M(), NIL if absent" },
];

function e(
  code: string,
  name: string,
  kind: Entity["kind"],
  source: Source,
  meaning: string,
  fields: Field[],
  extra: Partial<Entity> = {},
): Entity {
  return { code, name, kind, fidelity: "proxy", source, meaning, fields, ...extra, notes: [NOTE_COMMON, extra.notes].filter(Boolean).join(" ") };
}

export function buildSimpleFeatures(): Entity[] {
  const out: Entity[] = [];

  out.push(
    e(
      "gis.geometry",
      "Geometry",
      "abstract",
      sfaSource("6.1.2 Geometry (6.1.2.1 Description, 6.1.2.2 Basic methods); 8.2.3 Table 7 integer codes"),
      "Root of the geometry hierarchy: a 0, 1 or 2-dimensional object in 2D, 3D or 4D coordinate space (x,y plus optional z and m) tied to one spatial reference system.",
      [
        { name: "spatial_reference", type: "ref", ref_to: "gis.spatial_reference", nullable: true, meaning: "The spatial reference system all coordinates of this geometry are in (SFA SRID()); NULL when unknown.", source_ref: "SFA 6.1.2.1 spatialRS / SRID()" },
        { name: "has_z", type: "bool", default: false, meaning: "True when the points of this geometry carry a z coordinate (SFA is3D()).", source_ref: "SFA 6.1.2.2 is3D()" },
        { name: "has_m", type: "bool", default: false, meaning: "True when the points of this geometry carry an m coordinate (SFA isMeasured()).", source_ref: "SFA 6.1.2.2 isMeasured()" },
      ],
      {
        notes:
          "Dimension rule: coordinate dimension is 2 (x,y), 3 (x,y,z or x,y,m) or 4 (x,y,z,m), selected by has_z/has_m (SFA 6.1.2.1); in ISO WKB the type code is the base code plus 1000 for Z, 2000 for M and 3000 for ZM (SFA Table 7); all points of one geometry share the same dimension. Whether a geometry is empty, and its coordinate_dimension / dimension, are derived and not stored. Axis order in stored coordinates is always x,y,z,m regardless of the CRS axis order (GeoPackage binary encoding warning).",
      },
    ),
  );

  out.push(
    e("gis.point", "Point", "entity", sfaSource("6.1.4 Point"), "A single location in coordinate space with x and y and optionally z and m.", xyzm(), {
      base: "gis.geometry",
      notes: "An empty Point is encoded with all coordinates NaN in GeoPackage (Requirement 152); store NaN, not NULL, for x and y in that case.",
    }),
  );

  out.push(
    e("gis.curve", "Curve", "abstract", sfaSource("6.1.6 Curve"), "Abstract base of all 1-dimensional geometries: a curve has length but no area; interpolation between points depends on the subtype.", [], {
      base: "gis.geometry",
      notes: "Subtypes in GeoPackage: LineString, CircularString, CompoundCurve (geometrytypes annex). SFA defines only LineString as a Curve subclass; the others come from ISO SQL/MM Part 3 (GeoPackage extension geometry types, GDAL).",
    }),
  );

  const vertexSrc = sfaSource("6.1.7 LineString (numPoints/pointN)");
  out.push(
    e("gis.linestring", "LineString", "entity", sfaSource("6.1.7 LineString, Line, LinearRing"), "A Curve with linear interpolation between an ordered list of two or more points.", [], {
      base: "gis.curve",
      notes:
        "Vertices live in the child gis.linestring_point. A Line is a LineString with exactly 2 points; a LinearRing is a LineString that is closed and simple (both SFA 6.1.7.1) and is used as polygon rings - not separate stored types here.",
    }),
    e("gis.linestring_point", "LineString point", "child", vertexSrc, "One ordered vertex of a LineString.", xyzm(), {
      parent: "gis.linestring",
      notes: "Z/M columns follow the owning LineString's has_z/has_m.",
    }),
  );

  out.push(
    e("gis.circularstring", "CircularString", "entity", gpkgSource(GPKG_GT, `${HAND}Geometry Types (Normative), extension codes (8) + subtype statements`), "A Curve made of one or several circular arc segments connected end to end (ISO SQL/MM Part 3).", [], {
      base: "gis.curve",
      needs_review: true,
      notes:
        "Source for the definition is GDAL ogr_geometry.h ('a curve made of one or several arc circles', Compatibility: ISO SQL/MM Part 3) and the GeoPackage geometry-type annex (code 8). The rules on the number of control points (arc = three points) are not stated in the harvested sources and are NOT asserted; the ISO SQL/MM text was not read.",
    }),
    e("gis.circularstring_point", "CircularString point", "child", gdalSource("ogr/ogr_geometry.h", "OGRCircularString"), "One ordered control point of a CircularString.", xyzm(), {
      parent: "gis.circularstring",
    }),
  );

  out.push(
    e("gis.compoundcurve", "CompoundCurve", "entity", gdalSource("ogr/ogr_geometry.h", "OGRCompoundCurve (class comment); geometry types annex code 9"), "A Curve made of an ordered sequence of contiguous curves (LineStrings and CircularStrings), each starting where the previous ends.", [], {
      base: "gis.curve",
      notes: "Member curves are in the child gis.compoundcurve_member.",
    }),
    e("gis.compoundcurve_member", "CompoundCurve member", "child", gdalSource("ogr/ogr_geometry.h", "OGRCompoundCurve (class comment)"), "One component curve of a CompoundCurve, in order.", [
      { name: "curve", type: "ref", ref_to: "gis.curve", meaning: "The component curve; a LineString or CircularString (GDAL: 'made of curves: OGRLineString and OGRCircularString').", source_ref: "OGRCompoundCurve" },
    ], { parent: "gis.compoundcurve" }),
  );

  out.push(
    e("gis.surface", "Surface", "abstract", sfaSource("6.1.10 Surface"), "Abstract base of all 2-dimensional geometries: a surface has area.", [], { base: "gis.geometry" }),
  );

  out.push(
    e("gis.curvepolygon", "CurvePolygon", "entity", gpkgSource(GPKG_GT, `${HAND}Geometry Types (Normative), extension code 10 + descriptions`), "A planar surface defined by one exterior ring and zero or more interior rings, each ring being a Curve.", [], {
      base: "gis.surface",
      notes: "Rings are in the child gis.curvepolygon_ring. Position 0 is the exterior ring (GDAL OGRCurvePolygon: 'one outer (curve) ring, and zero or more inner rings'; SFA exteriorRing()/interiorRingN()).",
    }),
    e("gis.curvepolygon_ring", "CurvePolygon ring", "child", gpkgSource(GPKG_GT, `${HAND}CurvePolygon description`), "One ring of a CurvePolygon or Polygon, in order: position 0 is the exterior ring, higher positions are interior rings (holes).", [
      { name: "ring", type: "ref", ref_to: "gis.curve", meaning: "The closed curve forming this ring; a closed simple LineString (LinearRing) for a Polygon.", source_ref: "SFA 6.1.11 exteriorRing()/interiorRingN()" },
    ], { parent: "gis.curvepolygon" }),
  );

  out.push(
    e("gis.polygon", "Polygon", "entity", sfaSource("6.1.11 Polygon, Triangle"), "A planar surface defined by one exterior boundary and zero or more interior boundaries, each a LinearRing (closed simple LineString).", [], {
      base: "gis.curvepolygon",
      notes: "Base is CurvePolygon because the GeoPackage geometry-types annex states 'CURVEPOLYGON subtype is POLYGON' (GDAL: OGRPolygon : OGRCurvePolygon); SFA itself places Polygon directly under Surface. Rings (gis.curvepolygon_ring) must be LineStrings.",
    }),
    e("gis.triangle", "Triangle", "entity", sfaSource("6.1.11 Polygon, Triangle"), "A Polygon with three distinct, non-collinear vertices and no interior boundary.", [], {
      base: "gis.polygon",
      notes: "Exactly one exterior ring; the ISO code is 17 (GDAL wkbTriangle, ISO SQL/MM Part 3), which is not in SFA 1.2.1 Table 7.",
    }),
  );

  out.push(
    e("gis.polyhedralsurface", "PolyhedralSurface", "entity", sfaSource("6.1.12 PolyhedralSurface"), "A contiguous collection of Polygon patches that share common boundary segments; if closed it bounds a solid.", [], {
      base: "gis.surface",
      notes: "Patches are in the child gis.polyhedralsurface_patch. ISO code 15.",
    }),
    e("gis.polyhedralsurface_patch", "PolyhedralSurface patch", "child", sfaSource("6.1.12 PolyhedralSurface"), "One Polygon patch of a PolyhedralSurface or TIN, in order.", [
      { name: "patch", type: "ref", ref_to: "gis.polygon", meaning: "The polygon forming this patch; a Triangle when the parent is a TIN.", source_ref: "SFA 6.1.12.1" },
    ], { parent: "gis.polyhedralsurface" }),
    e("gis.tin", "TIN", "entity", sfaSource("6.1.12 PolyhedralSurface (TIN definition)"), "A triangulated irregular network: a PolyhedralSurface consisting only of Triangle patches.", [], {
      base: "gis.polyhedralsurface",
      notes: "Uses gis.polyhedralsurface_patch rows whose patch must be a gis.triangle. ISO code 16 (GDAL OGRTriangulatedSurface).",
    }),
  );

  out.push(
    e("gis.geometrycollection", "GeometryCollection", "entity", sfaSource("6.1.3 GeometryCollection"), "An ordered collection of zero or more geometries that share one spatial reference system; places no other constraint on its elements.", [], {
      base: "gis.geometry",
      notes: "Elements are in the child gis.geometrycollection_member. Subclasses restrict the element type; the restriction is documented on each subclass and is not expressible in the field model.",
    }),
    e("gis.geometrycollection_member", "GeometryCollection member", "child", sfaSource("6.1.3 GeometryCollection (geometryN)"), "One element of a GeometryCollection or of any Multi* geometry, in order.", [
      { name: "geometry", type: "ref", ref_to: "gis.geometry", meaning: "The element geometry (GeometryN); its allowed type depends on the parent subtype.", source_ref: "SFA 6.1.3.2 GeometryN(N)" },
    ], { parent: "gis.geometrycollection" }),
    e("gis.multipoint", "MultiPoint", "entity", sfaSource("6.1.5 MultiPoint"), "A 0-dimensional GeometryCollection whose elements are restricted to Points.", [], { base: "gis.geometrycollection", notes: "GeoPackage: GEOMETRYCOLLECTION subtypes are MULTIPOINT, MULTICURVE and MULTISURFACE. ISO code 4." }),
    e("gis.multicurve", "MultiCurve", "abstract", sfaSource("6.1.8 MultiCurve"), "A 1-dimensional GeometryCollection whose elements are Curves.", [], {
      base: "gis.geometrycollection",
      needs_review: true,
      notes: "SFA calls MultiCurve a 'non-instantiable class' included for extensibility, so it is abstract here; GeoPackage still lists MULTICURVE (code 11) as a declarable geometry type and GDAL has a concrete OGRMultiCurve (SQL/MM), so a concrete use is possible. Left abstract per SFA; confirm against SQL/MM.",
    }),
    e("gis.multilinestring", "MultiLineString", "entity", sfaSource("6.1.9 MultiLineString"), "A MultiCurve whose elements are LineStrings.", [], { base: "gis.multicurve", notes: "ISO code 5. Concrete although its base is abstract." }),
    e("gis.multisurface", "MultiSurface", "entity", sfaSource("6.1.13 MultiSurface"), "A 2-dimensional GeometryCollection whose elements are Surfaces, usable for heterogeneous collections of polygons and polyhedral surfaces.", [], { base: "gis.geometrycollection", notes: "SFA: MultiSurface is instantiable. ISO code 12." }),
    e("gis.multipolygon", "MultiPolygon", "entity", sfaSource("6.1.14 MultiPolygon"), "A MultiSurface whose elements are Polygons whose interiors do not intersect.", [], { base: "gis.multisurface", notes: "ISO code 6." }),
  );

  return out;
}
