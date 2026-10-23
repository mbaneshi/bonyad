// Maps XSD simple types to catalogue field types. Every rule here is a statement about
// the LandXML 1.2 schema, taken from the schema's own type names and documentation.
import type { Field } from "./schema.ts";
import type { Schema, SimpleTypeDef } from "./xsd.ts";

export interface Resolved {
  type: Field["type"];
  of?: NonNullable<Field["of"]>;
  ref_to?: string;
  values?: { value: string; meaning: string }[];
  unit?: string;
  check?: Field["check"];
  /** sentence appended to the meaning to explain a conversion or a convention */
  convention?: string;
  /** documentation found on the named simple type */
  typeDoc?: string;
  /** what the source type was, for source_ref */
  sourceType: string;
}

/** XSD built-ins to catalogue scalars. */
const BUILTIN: Record<string, Partial<Resolved> & { type: Field["type"] }> = {
  "xs:string": { type: "text" },
  "xs:normalizedString": { type: "text" },
  "xs:token": { type: "text" },
  "xs:NMTOKEN": { type: "text" },
  "xs:anyURI": { type: "text" },
  "xs:ID": { type: "text" },
  "xs:anySimpleType": { type: "text" },
  "xs:double": { type: "float" },
  "xs:float": { type: "float" },
  "xs:decimal": { type: "float" },
  "xs:int": { type: "int" },
  "xs:integer": { type: "int" },
  "xs:long": { type: "bigint" },
  "xs:positiveInteger": { type: "int", check: "positive" },
  "xs:nonNegativeInteger": { type: "int", check: "non_negative" },
  "xs:boolean": { type: "bool" },
  "xs:date": { type: "date" },
  "xs:dateTime": { type: "timestamp" },
  // The catalogue has no time-of-day scalar; keep the ISO 8601 text as written.
  "xs:time": { type: "text", convention: "ISO 8601 time of day, kept as text (the catalogue has no time scalar)." },
  "xs:IDREF": { type: "ref", ref_to: "any", convention: "xs:IDREF: names the xs:ID `id` of another element in the same file." },
};

const ANGLE_UNIT = "Stored in radians. The file value is expressed in";
/** Named LandXML simple types that carry a physical dimension, by the schema's own definition. */
const MEASURE_BY_NAME: Record<string, Partial<Resolved> & { type: Field["type"] }> = {
  angle: {
    type: "angle",
    convention: `${ANGLE_UNIT} Units angularUnit (default radians) and is converted at the import boundary. The XSD defines it as measured counter-clockwise from east (0 = east).`,
  },
  direction: {
    type: "angle",
    convention: `${ANGLE_UNIT} Units directionUnit (default radians) and is converted at the import boundary. The XSD defines a horizontal direction as measured counter-clockwise from north (0 = north); only the unit is converted, the reference axis and sense are kept as the source defines them.`,
  },
  latLongAngle: {
    type: "angle",
    convention: `${ANGLE_UNIT} Units latLongAngularUnit (default decimal degrees) and is converted at the import boundary.`,
  },
  zenithAngle: {
    type: "angle",
    convention: `${ANGLE_UNIT} the Units angular unit and is converted at the import boundary. The XSD defines it with 0 = straight up, measured clockwise.`,
  },
  station: {
    type: "length",
    convention: "Distance along the geometry in the file's declared linear unit; kept unconverted. Not corrected for station equations.",
  },
  offsetDistance: { type: "length", convention: "In the file's declared linear unit; kept unconverted." },
  offsetElevation: { type: "length", convention: "In the file's declared linear unit; kept unconverted." },
  ellipsoidHeightType: { type: "length", convention: "Ellipsoid height in the unit given by Units elevationUnit; kept unconverted." },
  area: { type: "area", convention: "In the file's declared area unit; kept unconverted." },
  crossSectSurfaceArea: { type: "area", convention: "In the file's declared area unit; kept unconverted." },
  volume: { type: "volume", convention: "In the file's declared volume unit; kept unconverted." },
  crossSectSurfaceVolume: { type: "volume", convention: "In the file's declared volume unit; kept unconverted." },
  slope: { type: "float", unit: "percent" },
  crossSlope: { type: "float", unit: "percent" },
  GPSTime: { type: "float", unit: "second", convention: "GPS weeks * 604800 + seconds in the GPS week." },
};

/** LandXML name-reference types: they hold the `name` of another element. */
const NAME_REF_TARGET: Record<string, string> = {
  pointNameRef: "landxml.cg_point",
  cgPointsNameRef: "landxml.cg_points",
  alignmentNameRef: "landxml.alignment",
  surfaceNameRef: "landxml.surface",
  parcelNameRef: "landxml.parcel",
  planFeatureNameRef: "landxml.plan_feature",
  coordGeomNameRef: "landxml.coord_geom",
  pipeNameRef: "landxml.pipe",
  structNameRef: "landxml.struct",
  monumentNameRef: "landxml.monument",
  waterShedNameRef: "landxml.watershed",
  roadwayNameRef: "landxml.roadway",
  gradeModelNameRef: "landxml.grade_model",
  featureNameRef: "landxml.feature",
};

function firstSentences(s: string, max = 2): string {
  const parts = s.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [s];
  return parts.slice(0, max).join("").trim();
}

export function shorten(s: string, limit = 320): string {
  const t = firstSentences(s.replace(/\s+/g, " ").trim());
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return cut.slice(0, i > 80 ? i : limit).trim() + "...";
}

export interface Lookup {
  schema: Schema;
}

/** Resolve a (possibly named) simple type reference to a catalogue field type. */
export function resolveSimple(ref: string | undefined, inline: SimpleTypeDef | undefined, lk: Lookup, seen = new Set<string>()): Resolved {
  const sourceType = ref ?? inline?.name ?? "anonymous simpleType";
  if (!ref && !inline) return { type: "text", sourceType: "xs:anySimpleType" };

  if (ref && ref.startsWith("xs:")) {
    const b = BUILTIN[ref];
    if (!b) throw new Error(`unmapped XSD built-in ${ref}`);
    return { ...b, sourceType: ref };
  }

  if (ref) {
    if (seen.has(ref)) throw new Error(`cyclic simple type ${ref}`);
    seen.add(ref);
    const measure = MEASURE_BY_NAME[ref];
    const def = lk.schema.simpleTypes.get(ref);
    const typeDoc = def?.doc.join(" ") || undefined;
    if (measure && def) return { ...measure, typeDoc, sourceType: ref };
    const target = NAME_REF_TARGET[ref];
    if (target) return { type: "ref", ref_to: target, typeDoc, sourceType: ref, convention: "Holds the `name` attribute of the referenced element (a name-based reference, resolved when the file is imported)." };
    if (/NameRefs$/.test(ref) && def?.listItem) {
      return { type: "array", of: "text", typeDoc, sourceType: ref, convention: "Space-delimited list of element names (name-based references)." };
    }
    if (!def) throw new Error(`unknown simple type ${ref}`);
    const r = resolveSimple(undefined, def, lk, seen);
    return { ...r, typeDoc: typeDoc ?? r.typeDoc, sourceType: ref };
  }

  const def = inline!;
  if (def.enums.length) {
    return {
      type: "enum",
      values: def.enums.map((e) => ({
        value: e.value,
        meaning: e.doc ? shorten(e.doc, 160) : `Enumeration literal "${e.value}"; the XSD gives no description.`,
      })),
      sourceType,
    };
  }
  if (def.listItem || def.listInline) {
    const item = resolveSimple(def.listItem, def.listInline, lk, new Set(seen));
    if (item.type === "float" && def.name === "Point") return { type: "array", of: "float", sourceType, convention: "Space-delimited list of doubles." };
    if (item.type === "ref") return { type: "array", of: "text", sourceType, convention: "Space-delimited list of names." };
    const of = item.type as NonNullable<Field["of"]>;
    return { type: "array", of, sourceType, convention: "Space-delimited list in the source text." };
  }
  if (def.base) {
    const r = resolveSimple(def.base, undefined, lk, new Set(seen));
    // restricted point lists keep the list semantics
    return { ...r, sourceType };
  }
  return { type: "text", sourceType };
}

/** True if the (named or built-in) simple type is a LandXML coordinate list ("Point" family). */
export function isPointText(ref: string | undefined, lk: Lookup): boolean {
  let cur = ref;
  const seen = new Set<string>();
  while (cur && !cur.startsWith("xs:") && !seen.has(cur)) {
    seen.add(cur);
    if (cur === "Point") return true;
    const def = lk.schema.simpleTypes.get(cur);
    if (!def) return false;
    cur = def.base;
  }
  return false;
}
