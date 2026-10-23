import { EntrySchema, type Entry, type Field } from "./model.ts";
import type { Doc, Node } from "./schema.ts";
import { conform } from "./conform.ts";

export interface Gap {
  where: string;
  what: string;
}

export interface Config {
  repo: string;
  commit: string;
  accessedOn: string;
  coreVersion: string;
  coreLicence: string;
  extLicence: string;
  /** Khronos extension schemas are under the Khronos Specification Copyright: do not copy their descriptions. */
  withholdExtensionText: boolean;
}

// ---------- naming ----------
export function snake(s: string): string {
  return s
    .replace(/^glTF/, "gltf_")
    .replace(/[:.\-]+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
const codeOfStem = (s: string): string => (s === "glTF" ? "gltf.gltf" : `gltf.${snake(s)}`);
export function singular(p: string): string {
  if (p === "children") return "child";
  if (/ies$/.test(p)) return p.slice(0, -3) + "y";
  if (/s$/.test(p) && !/ss$/.test(p)) return p.slice(0, -1);
  return p;
}

export function cleanText(s: string): string {
  return s
    .replace(/\*\*([A-Z ]+)\*\*/g, "$1")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function firstSentences(raw: string | undefined, n: number, max: number): string | undefined {
  if (!raw) return undefined;
  const s = cleanText(raw);
  if (!s) return undefined;
  const parts = s.match(/[^.!?]*[.!?](?=\s|$)/g);
  let out = parts && parts.length ? parts.slice(0, n).map((x) => x.trim()).join(" ") : s;
  if (out.length > max) {
    out = out.slice(0, max);
    const cut = out.lastIndexOf(" ");
    out = (cut > max * 0.6 ? out.slice(0, cut) : out).replace(/[,;:\s]+$/, "") + " ...";
  }
  return out;
}

// ---------- spec model ----------
type Via = "single" | "array" | "map";

type Desc =
  | { k: "skip" }
  | { k: "gap"; why: string }
  | { k: "prim"; node: Node }
  | { k: "id"; via: Via }
  | { k: "doc"; stem: string; via: Via }
  | { k: "inline"; node: Node; via: Via; nested?: Node };

interface TypeSpec {
  code: string;
  name: string;
  doc: Doc;
  node: Node; // object-bearing node
  scope: string; // "core" or extension name
  synthetic: boolean;
  isRootNode: boolean; // top level of a schema file (so $ref / allOf are bases)
  kind: Entry["kind"];
  parent?: string;
  base?: string;
  baseStem?: string;
  extraFields: Field[]; // e.g. map key
  notes: string[];
  review: string[];
  hasChildren: boolean;
  usedAsBase: boolean;
  placement?: string;
}

interface Site {
  owner: string; // code
  prop: string;
  via: Via;
}

const ROOT_KIND: Record<string, Entry["kind"]> = {
  scene: "entity",
  node: "entity",
  mesh: "entity",
  camera: "entity",
  skin: "entity",
  animation: "entity",
  material: "symbol",
  texture: "symbol",
  sampler: "symbol",
  image: "symbol",
  accessor: "symbol",
  bufferView: "symbol",
  buffer: "symbol",
};

const NOUNS = ["bufferView", "buffer", "accessor", "camera", "image", "material", "mesh", "node", "sampler", "scene", "skin", "texture", "animation", "light"];

export function convert(docs: Doc[], cfg: Config): { entries: Entry[]; gaps: Gap[]; refTable: string[] } {
  const gaps: Gap[] = [];
  const byKey = new Map<string, Doc>(); // "core:stem" or "ext:stem"
  for (const d of docs) byKey.set(`${d.ext ?? "core"}:${d.stem}`, d);
  const lookup = (stem: string, from: Doc): Doc | undefined => byKey.get(`${from.ext ?? "core"}:${stem}`) ?? byKey.get(`core:${stem}`);
  const specs = new Map<string, TypeSpec>();
  const sitesByDoc = new Map<Doc, Site[]>();

  // ---- phase A: one type per schema file
  const docSpec = new Map<Doc, TypeSpec>();
  for (const d of docs) {
    const codeStem = d.ext && !d.stem.includes(d.ext) ? `${d.ext}.${d.stem}` : d.stem;
    const spec: TypeSpec = {
      code: codeOfStem(codeStem),
      name: codeStem,
      doc: d,
      node: d.node,
      scope: d.ext ?? "core",
      synthetic: false,
      isRootNode: true,
      kind: "object",
      extraFields: [],
      notes: [],
      review: [],
      hasChildren: false,
      usedAsBase: false,
    };
    if (specs.has(spec.code)) throw new Error(`code collision ${spec.code}`);
    specs.set(spec.code, spec);
    docSpec.set(d, spec);
  }

  const resolveDef = (ref: string, d: Doc): Node | undefined => (ref.startsWith("#/definitions/") ? d.node.definitions?.[ref.slice(14)] : undefined);
  const refOf = (n: Node): string | undefined => n.$ref ?? (n.allOf && n.allOf.length === 1 ? n.allOf[0]!.$ref : undefined);
  // a node that has its own properties and also extends a schema is an inline object WITH a base, not a plain reference
  const pureRefOf = (n: Node): string | undefined => (n.properties ? undefined : refOf(n));
  const stemOfRef = (ref: string): string => ref.replace(/^.*\//, "").replace(/\.schema\.json$/, "");

  const describe = (p: Node, d: Doc): Desc => {
    const ref = pureRefOf(p);
    const classify = (r: string, via: Via): Desc => {
      if (r.startsWith("#/definitions/")) {
        const def = resolveDef(r, d);
        return def ? { k: "inline", node: def, via } : { k: "gap", why: `unresolved local reference ${r}` };
      }
      const stem = stemOfRef(r);
      if (stem === "glTFid") return { k: "id", via };
      if (stem === "extensions" || stem === "extras") return { k: "skip" };
      if (!lookup(stem, d)) return { k: "gap", why: `reference to unknown schema ${r}` };
      return { k: "doc", stem, via };
    };
    if (ref) return classify(ref, "single");
    const t = Array.isArray(p.type) ? p.type[0] : p.type;
    if (t === "array") {
      const it = p.items;
      if (!it) return { k: "gap", why: "array without items" };
      const ir = pureRefOf(it);
      if (ir) return classify(ir, "array");
      if (it.type === "object" || it.properties || it.additionalProperties) {
        if (typeof it.additionalProperties === "object" && !it.properties) {
          const ar = refOf(it.additionalProperties);
          if (ar && stemOfRef(ar) === "glTFid") return { k: "inline", node: it, via: "array", nested: it.additionalProperties };
        }
        return { k: "inline", node: it, via: "array" };
      }
      return { k: "prim", node: p };
    }
    if (t === "object" || p.properties || p.additionalProperties) {
      if (p.properties) return { k: "inline", node: p, via: "single" };
      if (typeof p.additionalProperties === "object") {
        const ar = refOf(p.additionalProperties);
        if (ar) {
          const c = classify(ar, "map");
          return c;
        }
        return { k: "gap", why: "object map whose values are inline or primitive" };
      }
      return { k: "gap", why: "free-form object (additionalProperties without a schema)" };
    }
    if (t === undefined && !p.anyOf && !p.enum && !p.const) {
      if (Object.keys(p).filter((k) => k !== "description" && k !== "gltf_detailedDescription").length === 0) return { k: "skip" }; // `{}`
      return { k: "gap", why: "property without a recognised type" };
    }
    return { k: "prim", node: p };
  };

  const isIdMap = (p: Node): boolean => {
    const ap = p.additionalProperties;
    return typeof ap === "object" && !!refOf(ap) && stemOfRef(refOf(ap)!) === "glTFid" && p.type === "object" && !p.properties;
  };

  // ---- phase B: synthetic child types for inline objects; collect doc reference sites
  const addSite = (stem: string, from: Doc, s: Site) => {
    const target = lookup(stem, from)!;
    const l = sitesByDoc.get(target) ?? [];
    l.push(s);
    sitesByDoc.set(target, l);
  };
  const inlineKids: { parent: TypeSpec; prop: string; spec: TypeSpec; via: Via; desc: Desc }[] = [];
  const scan = (spec: TypeSpec): void => {
    const props = spec.node.properties ?? {};
    for (const [pn, pv] of Object.entries(props)) {
      if (pn === "extensions" || pn === "extras") continue;
      const dsc = describe(pv, spec.doc);
      if (dsc.k === "doc") addSite(dsc.stem, spec.doc, { owner: spec.code, prop: pn, via: dsc.via });
      else if (dsc.k === "id" && dsc.via === "map") {
        // handled below as inline map
      }
      const mkKid = (code: string, name: string, node: Node, parent: TypeSpec, placement: string): TypeSpec => {
        if (specs.has(code)) throw new Error(`inline code collision ${code}`);
        const kid: TypeSpec = {
          code, name, doc: spec.doc, node, scope: spec.scope, synthetic: true, isRootNode: false, kind: "child", parent: parent.code,
          extraFields: [], notes: [], review: [], hasChildren: false, usedAsBase: false, placement,
        };
        specs.set(code, kid);
        parent.hasChildren = true;
        return kid;
      };
      const kidCode = `${spec.code}_${snake(singular(pn))}`;
      const kidName = `${spec.name}.${singular(pn)}`;
      if (dsc.k === "id" && dsc.via === "map") {
        const kid = mkKid(kidCode, kidName, pv, spec, "map");
        inlineKids.push({ parent: spec, prop: pn, spec: kid, via: "map", desc: dsc });
      } else if (dsc.k === "inline") {
        const kid = mkKid(kidCode, kidName, dsc.node, spec, dsc.via);
        inlineKids.push({ parent: spec, prop: pn, spec: kid, via: dsc.via, desc: dsc });
        if (dsc.via === "array" && isIdMap(dsc.node)) {
          const g = mkKid(`${kidCode}_entry`, `${kidName}.entry`, dsc.node, kid, "map");
          inlineKids.push({ parent: kid, prop: pn, spec: g, via: "map", desc: dsc });
        } else scan(kid);
      }
    }
    // base reference
    if (spec.isRootNode) {
      const br = refOf(spec.node);
      if (br && !br.startsWith("#")) {
        const bs = lookup(stemOfRef(br), spec.doc);
        if (bs) {
          const bspec = docSpec.get(bs)!;
          bspec.usedAsBase = true;
          spec.base = bspec.code;
          spec.baseStem = bs.stem;
        }
      }
    } else if (spec.node.allOf || spec.node.$ref) {
      const br = refOf(spec.node);
      if (br && !br.startsWith("#")) {
        const bs = lookup(stemOfRef(br), spec.doc);
        if (bs) {
          docSpec.get(bs)!.usedAsBase = true;
          spec.base = docSpec.get(bs)!.code;
        }
      }
    }
  };
  for (const s of [...docSpec.values()]) scan(s);

  // ---- phase C: classify document types
  const stemOfSpec = (s: TypeSpec) => s.doc.stem;
  const extSegPrefix = (d: Doc): string | undefined => {
    if (!d.ext) return undefined;
    const segs = d.stem.split(".");
    const i = segs.indexOf(d.ext);
    if (i <= 0) return undefined;
    return segs.slice(0, i).join(".");
  };
  for (const [d, s] of docSpec) {
    const sites = sitesByDoc.get(d) ?? [];
    if (d.stem === "glTF") {
      s.kind = "object";
      continue;
    }
    if (sites.length === 1) {
      const site = sites[0]!;
      if (site.owner === "gltf.gltf" && site.via === "array") {
        s.kind = ROOT_KIND[d.stem] ?? "entity";
        if (!ROOT_KIND[d.stem]) s.review.push("element type of a root array; entity/symbol choice is a guess");
        s.placement = "root-array";
      } else {
        s.kind = "child";
        s.parent = site.owner;
        s.placement = site.via === "single" ? "single" : site.via;
        if (site.via === "map") {
          s.extraFields.push({ name: "key", type: "text", meaning: "Name of this entry in the parent's JSON object (the property name under which it is stored).", source_ref: "JSON object key" });
        }
      }
    } else if (sites.length > 1) {
      s.kind = "object";
      s.placement = "shared";
      s.notes.push(`Embedded value object shared by ${sites.length} properties (${sites.map((x) => `${x.owner}.${x.prop}`).join(", ")}); owners hold a ref to a row of this type.`);
    } else if (d.ext) {
      const prefix = extSegPrefix(d);
      const target = prefix ? [...docSpec.values()].find((x) => !x.doc.ext && x.doc.stem === prefix) : undefined;
      if (target) {
        s.kind = "child";
        s.parent = target.code;
        s.placement = "extension";
        s.notes.push(`Attached as the extensions.${d.ext} object of a ${prefix} (at most one per parent).`);
      } else {
        s.kind = "object";
        s.review.push(`extension schema ${d.stem} is not attached to a known type by file-name prefix; where it applies needs checking against the extension README`);
      }
    } else if (s.usedAsBase) {
      s.kind = "abstract";
    } else {
      s.kind = "object";
      s.review.push("schema is neither referenced nor used as a base");
    }
    if (s.placement === "single") s.notes.push("Nested single object: at most one row per parent.");
    if (s.placement === "array") s.notes.push("Ordered rows: element order is the array order (the index is the position).");
    if (s.placement === "map") s.notes.push("Keyed rows: one row per entry of the parent's JSON object.");
    if (s.placement === "root-array") s.notes.push("Element of a root-level array of the glTF document; other types refer to it by its position (index) in that array.");
  }
  for (const k of inlineKids) {
    const s = k.spec;
    if (k.via === "single") s.notes.push("Nested single object: at most one row per parent.");
    if (k.via === "array") s.notes.push("Ordered rows: element order is the array order (the index is the position).");
    if (k.via === "map") s.notes.push("Keyed rows: one row per entry of the parent's JSON object.");
    if (k.via === "map" || s.placement === "map")
      s.extraFields.push({ name: "key", type: "text", meaning: "Name of this entry in the parent's JSON object (the property name under which it is stored).", source_ref: "JSON object key" });
  }

  // ---- phase D: fields
  const entryByCode = new Map<string, Entry>();
  const extraKids: TypeSpec[] = [];
  const pending: { field: Field; nouns: string[]; spec: TypeSpec; prop: string; entryKey: string }[] = [];
  const text = (spec: TypeSpec, t: string | undefined, fallback: string, n = 1, max = 240): string => {
    if (spec.scope !== "core" && cfg.withholdExtensionText) return fallback;
    return firstSentences(t, n, max) ?? fallback;
  };

  const mapPrim = (p: Node, spec: TypeSpec, pn: string, req: boolean): Field | undefined => {
    const desc = p.description;
    const ext = spec.scope !== "core";
    const t = Array.isArray(p.type) ? p.type[0] : p.type;
    const sref = `${spec.doc.file.split("/").pop()}#properties/${pn}`;
    const name = snake(pn);
    const rangeBits: string[] = [];
    const exMin = p.exclusiveMinimum === true ? p.minimum : typeof p.exclusiveMinimum === "number" ? p.exclusiveMinimum : undefined;
    const exMax = p.exclusiveMaximum === true ? p.maximum : typeof p.exclusiveMaximum === "number" ? p.exclusiveMaximum : undefined;
    if (p.minimum !== undefined && p.exclusiveMinimum !== true) rangeBits.push(`minimum ${p.minimum}`);
    if (exMin !== undefined) rangeBits.push(`greater than ${exMin}`);
    if (p.maximum !== undefined && p.exclusiveMaximum !== true) rangeBits.push(`maximum ${p.maximum}`);
    if (exMax !== undefined) rangeBits.push(`less than ${exMax}`);
    if (p.oneOf?.length && p.oneOf.every((o) => o.minimum !== undefined || o.maximum !== undefined))
      rangeBits.push(`one of (${p.oneOf.map((o) => [o.minimum !== undefined ? `minimum ${o.minimum}` : "", o.maximum !== undefined ? `maximum ${o.maximum}` : ""].filter(Boolean).join(" and ")).join(" or ")}), not enforced`);
    const rangeNote = rangeBits.length ? ` Range: ${rangeBits.join(", ")}.` : "";
    const base = text(spec, desc, `Property ${pn} of ${spec.name}.`);
    const mk = (f: Omit<Field, "name" | "source_ref" | "meaning"> & { meaning?: string }): Field => {
      const { meaning, ...rest } = f;
      const fld: Field = { name, ...rest, meaning: meaning ?? base + rangeNote, source_ref: sref } as Field;
      if (fld.default === undefined && !req) fld.nullable = true;
      return fld;
    };
    const dflt = p.default;
    const lit = (v: unknown): Field["default"] | undefined =>
      typeof v === "number" || typeof v === "string" || typeof v === "boolean" ? v : Array.isArray(v) && v.every((x) => typeof x === "number") ? (v as number[]) : undefined;

    // enumerations: anyOf of const (+ trailing open type) or enum
    const alts = p.anyOf ?? [];
    const consts = alts.filter((a) => a.const !== undefined);
    if (consts.length || (p.enum && p.enum.length)) {
      const open = alts.some((a) => a.const === undefined && a.type !== undefined);
      const vals = consts.length
        ? consts.map((a) => ({
            value: String(a.const),
            meaning:
              spec.scope !== "core" && cfg.withholdExtensionText
                ? `Value ${JSON.stringify(a.const)} listed in the schema.`
                : firstSentences(a.description, 1, 200) ?? `Value ${JSON.stringify(a.const)} listed in the schema.`,
          }))
        : (p.enum ?? []).map((v) => ({ value: String(v), meaning: `Value ${JSON.stringify(v)} listed in the schema.` }));
      const numericCodes = consts.some((a) => typeof a.const === "number");
      const extra = [numericCodes ? " The stored value is the integer code shown as the enum value." : "", open ? " The schema also accepts other values of the same type (for example from extensions)." : ""].join("");
      const f = mk({ type: "enum", values: vals, meaning: base + extra });
      if (dflt !== undefined && lit(dflt) !== undefined) f.default = String(dflt);
      if (ext && !desc) void 0;
      return f;
    }
    if (t === "boolean") {
      const f = mk({ type: "bool" });
      if (typeof dflt === "boolean") f.default = dflt;
      return f;
    }
    if (t === "string") {
      const f = mk({ type: "text" });
      if (typeof dflt === "string") f.default = dflt;
      return f;
    }
    if (t === "integer" || t === "number") {
      const isAngle = /radian/i.test(desc ?? ""); // detection only: the description text itself is still withheld for extensions
      let type: Field["type"] = t === "integer" ? (/^byte(Length|Offset|Stride)$/.test(pn) ? "bigint" : "int") : "float";
      if (isAngle) type = "angle";
      const f = mk({ type, meaning: isAngle ? `${base} Stored in radians (as in the source).${rangeNote}` : undefined });
      if (lit(dflt) !== undefined && !Array.isArray(dflt)) f.default = lit(dflt) as number;
      if (exMin === 0) f.check = "positive";
      else if (p.minimum === 0 && p.maximum === 1) f.check = "unit_interval";
      else if (p.minimum === 0) f.check = "non_negative";
      else if (t === "integer" && p.minimum === 1) f.check = "positive";
      return f;
    }
    if (t === "array") {
      const it = p.items;
      const itType = it ? (Array.isArray(it.type) ? it.type[0] : it.type) : undefined;
      if (itType === "number" || itType === "integer") {
        const n = p.minItems !== undefined && p.minItems === p.maxItems ? p.minItems : undefined;
        const colour = /colou?r/i.test(pn) ? " Components are R, G, B." : "";
        let f: Field;
        if (n === 16) f = mk({ type: "matrix4" });
        else if (n === 3) f = mk({ type: "vector3", meaning: base + colour + rangeNote });
        else if (n === 2) f = mk({ type: "point2", meaning: `${base} Two components (x, y).` });
        else f = mk({ type: "array", of: itType === "integer" ? "int" : "float", meaning: `${base}${n ? ` Exactly ${n} numbers.` : ""}${rangeNote}` });
        if (lit(dflt) !== undefined) f.default = lit(dflt) as number[];
        return f;
      }
      if (itType === "string") return mk({ type: "array", of: "text" });
      return undefined;
    }
    return undefined;
  };

  const entries: Entry[] = [];
  const sourceFor = (spec: TypeSpec, section: string) => ({
    document: spec.scope === "core" ? "glTF 2.0 JSON Schema" : `glTF extension ${spec.scope} JSON Schema`,
    section,
    url: `https://github.com/${cfg.repo}/blob/${cfg.commit}/${spec.doc.file}`,
    version: cfg.coreVersion,
    accessed_on: cfg.accessedOn,
    licence: spec.scope === "core" ? cfg.coreLicence : cfg.extLicence,
  });

  const order: TypeSpec[] = [];
  const seen = new Set<string>();
  const visit = (s: TypeSpec): void => {
    if (seen.has(s.code)) return;
    seen.add(s.code);
    if (s.base) visit(specs.get(s.base)!);
    order.push(s);
  };
  for (const s of specs.values()) visit(s);

  const fieldsByCode = new Map<string, Set<string>>();
  const allNames = (code: string | undefined): Set<string> => {
    const out = new Set<string>();
    for (let c = code ? specs.get(code) : undefined, g = 0; c && g < 20; c = c.base ? specs.get(c.base) : undefined, g++) for (const n of fieldsByCode.get(c.code) ?? []) out.add(n);
    return out;
  };

  for (const spec of order) {
    const node = spec.node;
    const required = new Set(node.required ?? []);
    const fields: Field[] = [...spec.extraFields.map((f) => ({ ...f }))];
    const used = allNames(spec.base);
    for (const f of fields) used.add(f.name);
    const mine = new Set(fields.map((f) => f.name));
    fieldsByCode.set(spec.code, mine);
    const addField = (f: Field, pn: string): void => {
      if (used.has(f.name)) {
        spec.review.push(`field ${f.name} (from ${pn}) collides with an inherited or generated field and was dropped`);
        return;
      }
      used.add(f.name);
      mine.add(f.name);
      fields.push(f);
    };
    const sref = (pn: string) => `${spec.doc.file.split("/").pop()}#properties/${pn}`;
    if (spec.synthetic && spec.placement === "map" && isIdMap(node)) {
      const rf: Field = {
        name: "value",
        type: "ref",
        ref_to: "any",
        meaning: `${text(spec, node.description, "Index of the referenced element.")} (index into the document's array of the referenced type)`,
        source_ref: `${spec.doc.file.split("/").pop()}#additionalProperties`,
      };
      pending.push({ field: rf, nouns: nounsFor(node.description, "value"), spec, prop: "value", entryKey: spec.code });
      fields.push(rf);
      used.add("value");
      mine.add("value");
    }

    for (const [pn, pv] of Object.entries(node.properties ?? {})) {
      if (pn === "extensions" || pn === "extras") continue;
      const dsc = describe(pv, spec.doc);
      const req = required.has(pn);
      const name = snake(pn);
      const baseText = text(spec, pv.description, `Property ${pn} of ${spec.name}.`);
      if (dsc.k === "skip") continue;
      if (dsc.k === "gap") {
        gaps.push({ where: `${spec.doc.file}: ${spec.name}.${pn}`, what: `not modelled: ${dsc.why}` });
        spec.review.push(`property ${pn} not modelled (${dsc.why})`);
        continue;
      }
      if (dsc.k === "id" && dsc.via === "single") {
        const f: Field = { name, type: "ref", ref_to: "any", meaning: `${baseText} (index into the document's array of the referenced type)`, source_ref: sref(pn), ...(req ? {} : { nullable: true }) };
        fields.length; // no-op for clarity
        const nouns = nounsFor(pv.description, pn);
        pending.push({ field: f, nouns, spec, prop: pn, entryKey: spec.code });
        addField(f, pn);
        continue;
      }
      if (dsc.k === "id" && dsc.via === "array") {
        // ordered ids -> child type with one ref field
        const code = `${spec.code}_${snake(singular(pn))}`;
        if (specs.has(code)) throw new Error(`collision ${code}`);
        const kid = makeKid(spec, code, `${spec.name}.${singular(pn)}`, pn, "Ordered rows: element order is the array order (the index is the position).");
        const rf: Field = { name: snake(singular(pn)), type: "ref", ref_to: "any", meaning: `${baseText} Each row holds one index.`, source_ref: sref(pn) };
        pending.push({ field: rf, nouns: nounsFor(pv.description, pn), spec: kid, prop: pn, entryKey: code });
        kid.extraFields.push(rf);
        extraKids.push(kid);
        spec.hasChildren = true;
        continue;
      }
      if (dsc.k === "id" && dsc.via === "map") {
        continue; // handled as synthetic kid below
      }
      if (dsc.k === "doc") {
        const target = lookup(dsc.stem, spec.doc)!;
        const tspec = docSpec.get(target)!;
        if (tspec.kind === "child" && tspec.parent === spec.code) continue; // the child holds the link
        if (dsc.via !== "single") {
          spec.review.push(`property ${pn} is an ${dsc.via} of ${tspec.code} that is not owned by this type; not modelled`);
          gaps.push({ where: `${spec.doc.file}: ${spec.name}.${pn}`, what: `${dsc.via} of shared type ${tspec.code} not modelled` });
          continue;
        }
        addField({ name, type: "ref", ref_to: tspec.code, meaning: `${baseText} Refers to a ${tspec.name} row.`, source_ref: sref(pn), ...(req ? {} : { nullable: true }) }, pn);
        continue;
      }
      if (dsc.k === "inline") continue; // synthetic child created in phase B
      const f = mapPrim(pv, spec, pn, req);
      if (!f) {
        gaps.push({ where: `${spec.doc.file}: ${spec.name}.${pn}`, what: "property shape not understood" });
        spec.review.push(`property ${pn} not modelled (shape not understood)`);
        continue;
      }
      addField(f, pn);
    }

    // constraints
    if (node.dependentRequired) for (const [k, v] of Object.entries(node.dependentRequired)) spec.notes.push(`Constraint: if ${k} is defined then ${v.join(", ")} must be defined (not enforced by the catalogue).`);
    if (node.oneOf && node.oneOf.every((o) => o.required && Object.keys(o).length === 1)) spec.notes.push(`Constraint: exactly one of ${node.oneOf.map((o) => o.required!.join("+")).join(" or ")} must be defined (not enforced by the catalogue).`);
    else if (node.oneOf || node.anyOf || node.not) {
      gaps.push({ where: `${spec.doc.file}: ${spec.name}`, what: "oneOf/anyOf/not at type level is not modelled" });
      spec.review.push("type-level oneOf/anyOf/not not modelled");
    }
    if (node.additionalProperties === true) spec.notes.push("The schema allows additional properties (free-form members not modelled).");

    const meaningRaw = node.description;
    const meaning =
      spec.scope === "core"
        ? firstSentences(meaningRaw, 2, 320) ?? (node.title ? `${node.title}.` : `glTF type ${spec.name}.`)
        : `${node.title ?? spec.name}${spec.parent ? `; extension object attached to ${spec.parent}` : ""}.`;
    const entry: Entry = {
      code: spec.code,
      name: spec.name,
      kind: spec.kind,
      ...(spec.base ? { base: spec.base } : {}),
      ...(spec.kind === "child" && spec.parent ? { parent: spec.parent } : {}),
      fidelity: "proxy",
      source: sourceFor(spec, spec.synthetic ? `${spec.doc.stem}, inline object` : spec.doc.stem),
      meaning,
      fields,
      ...(spec.review.length ? { needs_review: true } : {}),
      notes: [...spec.notes, ...(spec.review.length ? [`Review: ${spec.review.join("; ")}.`] : [])].join(" ") || undefined,
    } as Entry;
    if (!entry.notes) delete (entry as { notes?: string }).notes;
    entryByCode.set(spec.code, entry);
  }
  // kids created while building (id arrays) need their own entries
  for (const kid of extraKids) {
    const fields = kid.extraFields;
    const entry: Entry = {
      code: kid.code,
      name: kid.name,
      kind: "child",
      parent: kid.parent!,
      fidelity: "proxy",
      source: sourceFor(kid, `${kid.doc.stem}, property ${kid.placement}`),
      meaning: `One ordered row of the ${kid.name.split(".").pop()} index list of ${kid.parent}.`,
      fields,
      notes: kid.notes.join(" "),
    };
    entryByCode.set(kid.code, entry);
  }

  function nounsFor(desc: string | undefined, pn: string): string[] {
    const out: string[] = [];
    const d = desc ?? "";
    const re = new RegExp(`\\b(${NOUNS.join("|")}|packet|variant)s?\\b`, "i");
    const m = re.exec(d.replace(/\binverse-bind\b/i, "").replace(/buffer view/gi, "bufferView"));
    if (m) out.push(m[1]!);
    out.push(pn, singular(pn));
    return out;
  }
  function makeKid(owner: TypeSpec, code: string, name: string, prop: string, note: string): TypeSpec {
    return {
      code,
      name,
      doc: owner.doc,
      node: {},
      scope: owner.scope,
      synthetic: true,
      isRootNode: false,
      kind: "child",
      parent: owner.code,
      extraFields: [],
      notes: [note],
      review: [],
      hasChildren: false,
      usedAsBase: false,
      placement: prop,
    };
  }
  return finish();

  function finish(): { entries: Entry[]; gaps: Gap[]; refTable: string[] } {
    const refTable: string[] = [];
    // resolve pending refs
    const allSpecs = [...specs.values(), ...extraKids];
    const codeFor = (noun: string, from: TypeSpec): string | undefined => {
      const cands: string[] = [];
      const n = noun;
      const rootStem = from.doc.stem.split(".")[0]!;
      if (from.scope !== "core") {
        cands.push(`gltf.${snake(`${from.scope}.${n}`)}`, `gltf.${snake(`${from.scope}.${singular(n)}`)}`);
        // children of an extension root: lights -> light
        for (const s of allSpecs) if (s.scope === from.scope && s.code.endsWith(`_${snake(singular(n))}`)) cands.push(s.code);
      }
      cands.push(`gltf.${snake(`${rootStem}.${n}`)}`, `gltf.${snake(n)}`, `gltf.${snake(singular(n))}`);
      return cands.find((c) => c !== from.code && (specs.has(c) || extraKids.some((k) => k.code === c)));
    };
    for (const p of pending) {
      let target: string | undefined;
      for (const n of p.nouns) {
        target = codeFor(n, p.spec);
        if (target) break;
      }
      if (target) {
        p.field.ref_to = target;
        refTable.push(`${p.spec.code}.${p.field.name} -> ${target}`);
      } else {
        p.field.ref_to = "any";
        const e = entryByCode.get(p.entryKey);
        if (e) {
          e.needs_review = true;
          e.notes = `${e.notes ? e.notes + " " : ""}Review: could not tell which type ${p.prop} refers to; ref_to is any.`;
        }
        gaps.push({ where: `${p.spec.doc.file}: ${p.spec.name}.${p.prop}`, what: "id target type not resolvable from the schema text; ref_to any" });
        refTable.push(`${p.spec.code}.${p.field.name} -> any (UNRESOLVED)`);
      }
    }
    for (const [code, e] of entryByCode) {
      const fixed = EntrySchema.parse(e);
      entries.push(fixed);
      void code;
    }
    const final = conform(entries, gaps);
    // the table reports the FINAL codes (after promotion, folding and shortening), not the ones first resolved
    const fin = new Set(final.map((e) => e.code));
    refTable.length = 0;
    for (const e of final)
      for (const f of e.fields)
        if (f.type === "ref" && f.name !== "owner") refTable.push(`${e.code}.${f.name} -> ${f.ref_to === "any" || !fin.has(f.ref_to!) ? "any (unresolved)" : f.ref_to}`);
    refTable.sort();
    // stable order: by code
    final.sort((a, b) => (a.code < b.code ? -1 : 1));
    // child fields ref resolution may have changed after parse; validate again
    return { entries: final.map((e) => EntrySchema.parse(e)), gaps, refTable };
  }
}
