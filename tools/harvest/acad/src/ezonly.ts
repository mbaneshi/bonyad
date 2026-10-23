// Types ACadSharp does not model (LIGHT, SUN, HELIX, MPOLYGON, ...) and types it models without any DXF group
// codes (the surface family, ...) are filled from ezdxf's attribute tables. Fields keep their ezdxf names.
import { CatType, type Field } from "./catalogue.ts";
import type { Ctx } from "./build.ts";
import type { EzAttr, EzType } from "./ezdxf.ts";
import { VERSIONS } from "./ezdxf.ts";
import { BINARY, BOOL, DOUBLE, INT16, INT32, INT64, POINTER } from "./groupcodes.ts";
import { codeFromDxfName, humanize } from "./naming.ts";
import { ACCESSED, SHAs } from "./pins.ts";
import { TARGET_VERSION } from "./gapsdata.ts";

type Spec = {
  dxf: string;
  kind: "entity" | "object";
  base?: string; // catalogue code of the base type
  aliasOf?: string; // same group codes as this DXF type (ezdxf: class X(Y) with no attribute table of its own)
  code?: string;
  ezClass?: string; // pick this ezdxf class when a DXF type has several
  file?: string; // ezdxf file that defines the class (alias types)
  cls?: string;
};

const SPECS: Spec[] = [
  { dxf: "LIGHT", kind: "entity" },
  { dxf: "SUN", kind: "object" },
  { dxf: "HELIX", kind: "entity", base: "acad.spline" },
  { dxf: "MPOLYGON", kind: "entity" },
  { dxf: "LARGE_RADIAL_DIMENSION", kind: "entity", base: "acad.dimension" },
  { dxf: "TRACE", kind: "entity", base: "acad.solid", aliasOf: "SOLID", file: "entities/solid.py", cls: "Trace" },
  { dxf: "PDFREFERENCE", kind: "entity", base: "acad.underlay_entity", aliasOf: "PDFUNDERLAY", file: "entities/underlay.py", cls: "PdfReference" },
  { dxf: "DWFUNDERLAY", kind: "entity", base: "acad.underlay_entity", aliasOf: "PDFUNDERLAY", file: "entities/underlay.py", cls: "DwfUnderlay" },
  { dxf: "DGNUNDERLAY", kind: "entity", base: "acad.underlay_entity", aliasOf: "PDFUNDERLAY", file: "entities/underlay.py", cls: "DgnUnderlay" },
  { dxf: "DWFDEFINITION", kind: "object", base: "acad.underlay_definition", aliasOf: "PDFDEFINITION", file: "entities/underlay.py", cls: "DwfDefinition" },
  { dxf: "DGNDEFINITION", kind: "object", base: "acad.underlay_definition", aliasOf: "PDFDEFINITION", file: "entities/underlay.py", cls: "DgnDefinition" },
  { dxf: "CLASS", kind: "object", code: "acad.dxf_class" },
];

function ownAttribs(c: Ctx, t: EzType): EzAttr[] {
  const byClass = new Map<string, EzType>();
  for (const list of c.ez.values()) for (const x of list) byClass.set(x.className, x);
  const baseMarkers = new Set<string>();
  for (let b = byClass.get(t.bases[0] ?? ""), i = 0; b && i < 10; b = byClass.get(b.bases[0] ?? ""), i++) for (const a of b.attribs) baseMarkers.add(a.subclass);
  return t.attribs.filter((a) => !baseMarkers.has(a.subclass));
}

const lengthTokens = new Set(["radius", "height", "width", "thickness", "elevation", "distance", "length", "offset", "spacing", "diameter"]);

function ezField(c: Ctx, dxf: string, a: EzAttr): Field | null {
  if (a.code <= 0 || a.code === 5 || a.code === 330 || a.code === 100) return null;
  const nm = a.name;
  const tokens = nm.split("_");
  const rawDoc = c.docs.attr.get(dxf)?.get(nm) || a.comment;
  const doc = /^(in )?(degrees|radians)\??\.?$/i.test(rawDoc.trim()) || /^\.\./.test(rawDoc) ? "" : rawDoc;
  const meaning = doc ? doc.charAt(0).toUpperCase() + doc.slice(1).replace(/\.?$/, ".") : `${humanize(nm)}.`;
  const ver = a.dxfversion && a.dxfversion !== "AC1009" ? `; first in ${VERSIONS[a.dxfversion] ?? a.dxfversion}` : "";
  const f: Partial<Field> & { name: string; meaning: string } = { name: nm, meaning };
  let type: Field["type"];
  let codes = `group code ${a.code}`;
  if (a.xtype === "point3d" || a.xtype === "any_point") { type = nm.match(/extrusion|normal|direction|vector|axis/) ? "vector3" : "point3"; codes = `group codes ${a.code}, ${a.code + 10}, ${a.code + 20}`; }
  else if (a.xtype === "point2d") { type = "point2"; codes = `group codes ${a.code}, ${a.code + 10}`; }
  else if (BOOL.has(a.code)) type = "bool";
  else if (BINARY.has(a.code)) type = "blob";
  else if (POINTER.has(a.code)) type = "ref";
  else if (INT64.has(a.code)) type = "bigint";
  else if (INT16.has(a.code) || INT32.has(a.code)) type = "int";
  else if (DOUBLE.has(a.code)) {
    const deg = (a.code >= 50 && a.code <= 58) || /degree/i.test(a.comment);
    type = deg ? "angle" : tokens.some((x) => lengthTokens.has(x)) ? "length" : "float";
    if (deg) f.meaning = `${meaning.replace(/\.$/, "")}. Radians here; DXF stores degrees.`;
  } else type = "text";
  const field: Field = { ...f, type } as Field;
  if (type === "ref") { field.ref_to = "any"; field.name = nm.endsWith("_handle") ? nm.replace(/_handle$/, "_id") : nm.endsWith("_id") ? nm : `${nm}_id`; field.nullable = true; }
  if (a.optional && field.default === undefined) field.nullable = true;
  const d = a.default;
  if (d !== null) {
    if (type === "bool" && /^(0|1|True|False)$/.test(d)) field.default = d === "1" || d === "True";
    else if (["int", "bigint", "float", "length", "angle"].includes(type) && /^-?\d+(\.\d+)?$/.test(d)) field.default = Number(d);
    else if (type === "text" && /^"[^"]*"$/.test(d)) field.default = d.slice(1, -1);
    else if ((type === "point3" || type === "vector3") && d === "NULLVEC") field.default = [0, 0, 0];
    else if (type === "vector3" && d === "Z_AXIS") field.default = [0, 0, 1];
    else if (type === "vector3" && d === "X_AXIS") field.default = [1, 0, 0];
    else if (type === "vector3" && d === "Y_AXIS") field.default = [0, 1, 0];
  }
  if (field.nullable && field.default !== undefined && a.optional) delete field.nullable;
  field.source_ref = `${codes}${ver}; ezdxf attribute dxf.${nm}${doc ? "" : "; no description in the sources"}`;
  return field;
}

function ezSource(c: Ctx, t: EzType, dxf: string): CatType["source"] {
  const since = c.docs.since.get(dxf);
  return {
    document: "ezdxf attribute tables (DXFAttr) and reference docs",
    section: `${t.className} (DXF ${dxf})`,
    url: `https://github.com/mozman/ezdxf/blob/${SHAs.ezdxf}/src/ezdxf/${t.file}`,
    version: since ? `${TARGET_VERSION}; required DXF version ${VERSIONS[since] ?? since}` : TARGET_VERSION,
    accessed_on: ACCESSED,
    licence: "MIT (ezdxf)",
  };
}

function fieldsFor(c: Ctx, t: EzType, dxf: string): Field[] {
  const seen = new Set<string>();
  const out: Field[] = [];
  for (const a of ownAttribs(c, t)) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    const f = ezField(c, dxf, a);
    if (f && !out.some((x) => x.name === f.name)) out.push(f);
  }
  return out;
}

export function harvestEzOnly(c: Ctx, _b: unknown): string[] {
  const done: string[] = [];
  const pick = (dxf: string, cls?: string) => (c.ez.get(dxf) ?? []).find((t) => !cls || t.className === cls) ?? (c.ez.get(dxf) ?? [])[0];
  const acadDxfNames = new Set([...c.codeOf.keys()].map((t) => t.dxfName).filter(Boolean));
  for (const s of SPECS) {
    if (acadDxfNames.has(s.dxf)) continue;
    const t = pick(s.dxf, s.ezClass);
    const alias: EzType | undefined = s.aliasOf ? { dxfType: s.aliasOf, className: s.cls ?? "", file: s.file ?? "", bases: [], attribs: [], doc: "" } : undefined;
    // classes that only subclass another ezdxf class have no DXFATTRIBS of their own and are not in c.ez
    const code = s.code ?? `acad.${codeFromDxfName(s.dxf)}`;
    const base = s.base ?? (s.kind === "entity" ? "acad.graphic_entity" : undefined);
    let fields: Field[] = [];
    let source: CatType["source"];
    let meaning = c.docs.desc.get(s.dxf) ?? "";
    let notes = "";
    if (t && !s.aliasOf) {
      fields = fieldsFor(c, t, s.dxf);
      source = ezSource(c, t, s.dxf);
    } else if (alias) {
      source = ezSource(c, alias, s.dxf);
      source.section = `${s.dxf} (a ${alias.dxfType}-derived class in ezdxf)`;
      notes = `Same group codes as ${s.aliasOf}; ezdxf defines ${s.dxf} as a subclass of the ${s.aliasOf} class with no attribute table of its own.`;
      meaning = meaning || `${humanize(s.dxf.toLowerCase())}: a variant of the DXF ${s.aliasOf} type with the same group codes.`;
    } else continue;
    if (!meaning) meaning = t?.doc ? t.doc : `${humanize(s.dxf.toLowerCase())} (DXF ${s.dxf}).`;
    const needs = !c.docs.desc.get(s.dxf) && !alias;
    const ct: CatType = {
      code, name: s.dxf, kind: s.kind, ...(base ? { base } : {}), fidelity: "faithful", source,
      meaning: meaning.endsWith(".") ? meaning : `${meaning}.`, fields,
      ...(needs || fields.length === 0 ? { needs_review: true } : {}),
      notes: [notes, "Harvested from ezdxf only: ACadSharp does not model this DXF type.", needs ? "Type description taken from the ezdxf class docstring or generated from the name; no reference text was found." : ""].filter(Boolean).join(" "),
    };
    c.out.set(code, ct);
    done.push(s.dxf);
  }
  // supplement: ACadSharp types that came out without any group code of their own get the ezdxf attributes
  // whose group codes neither they nor their bases already cover
  const coveredChain = (code: string): Set<number> => {
    const r = new Set<number>();
    for (let k: string | undefined = code, i = 0; k && i < 12; k = c.out.get(k)?.base, i++) for (const x of c.covered.get(k) ?? []) r.add(x);
    return r;
  };
  for (const [cs, code] of c.codeOf) {
    const ct = c.out.get(code);
    if (!ct || ct.fields.length > 0 || !cs.dxfName || code === "acad.graphic_entity") continue;
    if ([...c.codeOf.keys()].filter((x) => x.dxfName === cs.dxfName).length > 1) continue; // shared DXF name: ezdxf's table mixes the variants
    const t = (c.ez.get(cs.dxfName) ?? []).find((x) => x.attribs.length > 0);
    if (!t) continue;
    const cov = coveredChain(code);
    const fields = fieldsFor(c, { ...t, attribs: t.attribs.filter((a) => !cov.has(a.code)) }, cs.dxfName);
    if (fields.length === 0) continue;
    ct.fields = fields;
    ct.source = { ...ct.source, document: `${ct.source.document}; fields from ezdxf ${t.file}` };
    ct.needs_review = true;
    ct.notes = [ct.notes?.replace(/ACadSharp carries no DXF group codes for this class \(it is DWG-only or its DXF layout is undocumented there\); the type is listed for completeness\./, "").trim(), "ACadSharp has no group codes for this class; the fields come from ezdxf's attribute table."].filter(Boolean).join(" ");
    done.push(`${cs.dxfName} (fields from ezdxf)`);
  }
  return done;
}
