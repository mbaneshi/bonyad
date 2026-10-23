// Harvest: ACadSharp (C# attributes carry DXF group codes) + ezdxf (versions, LIGHT/SUN/HELIX/...) -> catalogue/acad/*.yaml
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CatType, toYaml, type Field } from "./catalogue.ts";
import type { CsProp, CsType } from "./csharp.ts";
import { EXISTING, type Spec } from "./existing.ts";
import { loadEzdxf, loadEzDocs, VERSIONS, type EzDocs, type EzType } from "./ezdxf.ts";
import { codeFromDxfName, humanize, singular, snake } from "./naming.ts";
import { ACAD_ROOT, loadAcadSharp, WORK } from "./sources.ts";
import { SHAs, ACCESSED } from "./pins.ts";
import { harvestEzOnly } from "./ezonly.ts";
import { counts, gapsMd, sourcesMd } from "./report.ts";
import { normalize } from "./normalize.ts";
import { STRUCTURE } from "./structure.ts";
import { TARGET_VERSION, GAPS_DATA, type Gap } from "./gapsdata.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = resolve(HERE, "../../../../catalogue/acad");

export type Ctx = {
  all: CsType[];
  top: Map<string, CsType>;
  nested: Map<string, CsType>;
  ez: Map<string, EzType[]>;
  docs: EzDocs;
  out: Map<string, CatType>;
  gaps: Gap[];
  codeOf: Map<CsType, string>;
  covered: Map<string, Set<number>>;
  stats: { ignored: number; noDoc: number; props: number; inlined: number };
};

// ------------------------------------------------------------------ class index
function index(all: CsType[]) {
  const top = new Map<string, CsType>();
  const nested = new Map<string, CsType>();
  for (const t of all) {
    if (t.outer) nested.set(`${t.outer}.${t.name}`, t);
    else if (!top.has(t.name) || (t.dxfName && !top.get(t.name)?.dxfName)) top.set(t.name, t);
  }
  return { top, nested };
}
function resolveType(c: Ctx, name: string, from: CsType | null): CsType | undefined {
  const n = name.replace(/\?$/, "").replace(/<.*$/, "").split(".").pop() ?? name;
  if (from) {
    const a = c.nested.get(`${from.name}.${n}`) ?? (from.outer ? c.nested.get(`${from.outer}.${n}`) : undefined);
    if (a) return a;
    if (name.includes(".")) {
      const [o] = name.split(".");
      const q = c.nested.get(`${o}.${n}`);
      if (q) return q;
    }
  }
  return c.top.get(n);
}
function baseOf(c: Ctx, t: CsType): CsType | undefined {
  return t.base ? resolveType(c, t.base, t) : undefined;
}
function chain(c: Ctx, t: CsType): CsType[] {
  const r: CsType[] = [];
  for (let x: CsType | undefined = t, i = 0; x && i < 20; x = baseOf(c, x), i++) r.push(x);
  return r;
}
type Cat = "entity" | "symbol" | "object" | null;
function categoryOf(c: Ctx, t: CsType): Cat {
  for (const x of chain(c, t)) {
    if (x.name === "Entity" && !x.outer) return "entity";
    if (x.name === "TableEntry") return "symbol";
    if (x.name === "NonGraphicalObject") return "object";
  }
  return null;
}

// ------------------------------------------------------------------ properties
type Prop = CsProp & { owner: CsType; inh?: CsType };
/** Own properties of t; a redeclared property without a group code inherits code and wording from the base property of the same name. */
function ownProps(c: Ctx, t: CsType): Prop[] {
  const anc = chain(c, t).slice(1).filter((a) => a.name !== "Entity" && a.name !== "CadObject");
  return t.props.map((p) => {
    let q: CsProp = p;
    let inh: CsType | undefined;
    if (!p.code && !p.collection || !p.doc) {
      const ifaces = t.bases.map((b) => resolveType(c, b, t)).filter((x): x is CsType => !!x);
      for (const a of [...anc, ...ifaces, ...anc.flatMap((x) => x.bases.map((b) => resolveType(c, b, x)).filter((y): y is CsType => !!y))]) {
        const b = a.props.find((x) => x.name === p.name);
        if (b) {
          q = { ...p, code: p.code ?? b.code, collection: p.collection ?? b.collection, doc: p.doc || b.doc };
          if (!p.code && !p.collection && b.code && chain(c, t).includes(a)) inh = a;
          break;
        }
      }
    }
    return { ...q, owner: t, inh };
  });
}

const LENGTH_TOKENS = new Set(["radius", "height", "width", "thickness", "elevation", "distance", "length", "offset", "spacing", "diameter"]);
const RATIO_TOKENS = new Set(["scale", "factor", "ratio"]);
const REF_LIST = new Set(["List", "IList", "IEnumerable", "IReadOnlyList", "ICollection", "CadObjectCollection", "ObservableCollection", "SeqendCollection", "HashSet"]);
const DICT = new Set(["Dictionary", "IReadOnlyDictionary", "IDictionary"]);
const INTS = new Set(["int", "short", "ushort", "uint", "byte", "sbyte"]);
const BIGS = new Set(["long", "ulong"]);

function listOf(type: string): { kind: "list" | "dict"; elem: string } | null {
  const m = type.match(/^(\w+)<(.+)>$/);
  if (!m) return type.endsWith("[]") && type !== "byte[]" ? { kind: "list", elem: type.slice(0, -2) } : null;
  const outer = m[1] ?? "";
  const inner = m[2] ?? "";
  if (REF_LIST.has(outer)) return { kind: "list", elem: inner };
  if (DICT.has(outer)) return { kind: "dict", elem: inner.split(",").slice(1).join(",").trim() };
  return null;
}

function codesText(codes: number[], plural: string): string {
  return `${codes.length > 1 ? plural : plural.replace(/s$/, "")} ${codes.join(", ")}`;
}

function parseDefault(expr: string | null, type: Field["type"]): Field["default"] | undefined {
  if (expr === null) return undefined;
  const e = expr.trim();
  if (type === "bool") return e === "true" ? true : e === "false" ? false : undefined;
  if (type === "text") return e === "string.Empty" || e === '""' ? "" : /^"[^"]*"$/.test(e) ? e.slice(1, -1) : undefined;
  if (["int", "bigint", "float", "length", "angle", "ratio", "area", "volume"].includes(type)) {
    const m = e.match(/^(-?\d+(?:\.\d+)?)[dDfFmMuUlL]*$/);
    return m ? Number(m[1]) : undefined;
  }
  if (type === "point3" || type === "vector3") {
    if (e === "XYZ.Zero") return [0, 0, 0];
    if (e === "XYZ.AxisX") return [1, 0, 0];
    if (e === "XYZ.AxisY") return [0, 1, 0];
    if (e === "XYZ.AxisZ") return [0, 0, 1];
    const m = e.match(/^new\s*(?:XYZ)?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
  }
  if (type === "point2") {
    if (e === "XY.Zero") return [0, 0];
    const m = e.match(/^new\s*(?:XY)?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/);
    return m ? [Number(m[1]), Number(m[2])] : undefined;
  }
  return undefined;
}

export function ezText(c: Ctx, dxfName: string | null, code: number): string {
  if (!dxfName) return "";
  for (const t of c.ez.get(dxfName) ?? []) {
    const a = t.attribs.find((x) => x.code === code);
    if (!a) continue;
    const d = c.docs.attr.get(dxfName)?.get(a.name);
    if (d) return d.charAt(0).toUpperCase() + d.slice(1).replace(/\.?$/, ".");
    if (a.comment && !/^(in )?(degrees|radians)\??\.?$/i.test(a.comment.trim())) return a.comment.charAt(0).toUpperCase() + a.comment.slice(1).replace(/\.?$/, ".");
  }
  return "";
}

function ezVersionNote(c: Ctx, dxfName: string | null, code: number): string {
  if (!dxfName) return "";
  for (const t of c.ez.get(dxfName) ?? []) {
    const a = t.attribs.find((x) => x.code === code);
    if (a?.dxfversion && a.dxfversion !== "AC1009") return `; first in ${VERSIONS[a.dxfversion] ?? a.dxfversion} (ezdxf)`;
    if (a) return "";
  }
  return "";
}

function enumField(e: CsType, p: Prop): Pick<Field, "type" | "values" | "meaning"> | { type: "int"; meaning: string } {
  const members = e.members.filter((m) => m.value !== null);
  const doc = p.doc || `${humanize(snake(p.name))}.`;
  if (e.isFlags) {
    const bits = members.filter((m) => (m.value ?? 0) !== 0).map((m) => `${m.value} ${m.name}`).join(", ");
    return { type: "int", meaning: `${doc.replace(/\.$/, "")}. Bit-coded: ${bits || "no named bits"}.` };
  }
  return {
    type: "enum",
    meaning: doc,
    values: members.map((m) => ({ value: m.name, meaning: `DXF value ${m.value}${m.doc ? `: ${m.doc}` : ""}` })),
  };
}

type Emit = { fields: Field[]; children: CatType[] };

class Builder {
  constructor(private c: Ctx) {}

  cover(code: string, codes: number[]) {
    const s = this.c.covered.get(code) ?? new Set<number>();
    for (const x of codes) s.add(x);
    this.c.covered.set(code, s);
  }

  /** Fields (and child tables) for the given properties of `owner`, which is stored as `ownerCode`. */
  fieldsFor(owner: CsType, ownerCode: string, props: Prop[], dxfName: string | null, prefix = ""): Emit {
    const res: Emit = { fields: [], children: [] };
    for (const p of props) {
      const ca = p.code ?? p.collection;
      if (!ca) continue;
      this.c.stats.props++;
      if (ca.flags.includes("Ignored")) {
        this.c.stats.ignored++;
        this.c.gaps.push({ type: ownerCode, what: `${owner.name}.${p.name} (group ${ca.codes.join(", ")})`, why: "ACadSharp marks the property Ignored (not written to or read from DXF, or derived)", kind: "ignored" });
        this.cover(ownerCode, ca.codes);
        continue;
      }
      this.cover(ownerCode, ca.codes);
      const e = this.prop(owner, ownerCode, p, ca.codes, ca.flags, dxfName, prefix);
      res.fields.push(...e.fields);
      res.children.push(...e.children);
    }
    return res;
  }

  private mk(p: Prop, name: string, f: Partial<Field> & Pick<Field, "type">, codes: number[], flags: string[], dxfName: string | null, extraRef = ""): Field {
    let doc = p.doc;
    let docNote = "";
    if (!doc && codes.length) {
      doc = ezText(this.c, dxfName, codes[0]!);
      if (doc) docNote = "; wording from ezdxf";
    }
    if (!doc) { this.c.stats.noDoc++; docNote = "; no description in the sources"; }
    const label = codes.length ? codesText(codes, "group codes") : "";
    const flagText = flags.includes("Count") ? " (list; count precedes)" : flags.includes("Handle") ? " (stored as a handle)" : flags.includes("Name") ? " (stored as a name)" : "";
    const ver = codes.length ? ezVersionNote(this.c, dxfName, codes[0]!) : "";
    const field: Field = {
      name,
      meaning: (doc || `${humanize(snake(p.name))}.`).replace(/\s+$/, ""),
      source_ref: `${label}${flagText}${extraRef}${ver}${docNote}`.trim() || `ACadSharp ${p.owner.name}.${p.name}`,
      ...f,
    };
    return field;
  }

  private prop(owner: CsType, ownerCode: string, p: Prop, codes: number[], flags: string[], dxfName: string | null, prefix: string): Emit {
    const raw = p.type.trim();
    const nullable = raw.endsWith("?");
    const type = raw.replace(/\?$/, "");
    const optional = flags.includes("Optional");
    const nm = prefix + snake(p.name);
    const tokens = nm.split("_");
    const out: Emit = { fields: [], children: [] };
    const base = (f: Partial<Field> & Pick<Field, "type">) => {
      const ff = this.mk(p, nm, f, codes, flags, dxfName);
      const d0 = parseDefault(p.default, ff.type);
      if (d0 !== undefined && ff.default === undefined) ff.default = d0;
      if ((nullable || optional && ff.default === undefined) && !ff.nullable) ff.nullable = true;
      if (p.default?.trim() === "null") ff.nullable = true;
      return ff;
    };
    const lst = listOf(type);
    if (lst) return this.listField(owner, ownerCode, p, lst, codes, flags, dxfName, prefix, nm);

    // scalars
    if (type === "double" || type === "float") {
      const isAngle = flags.includes("IsAngle");
      const rangeAngle = !isAngle && codes.length === 1 && codes[0]! >= 50 && codes[0]! <= 58;
      const t: Field["type"] = isAngle || rangeAngle ? "angle" : tokens.some((x) => LENGTH_TOKENS.has(x)) ? "length" : tokens.some((x) => RATIO_TOKENS.has(x)) ? "ratio" : "float";
      const f = base({ type: t });
      if (t === "angle") {
        f.meaning = `${f.meaning.replace(/\.$/, "")}. Radians here; DXF stores degrees.`;
        if (rangeAngle) f.source_ref += "; group codes 50-58 are angles in degrees per the DXF group-code table (ACadSharp does not flag this property)";
      }
      const d = parseDefault(p.default, t);
      if (d !== undefined) f.default = d;
      out.fields.push(f);
      return out;
    }
    if (INTS.has(type) || BIGS.has(type)) {
      const t = BIGS.has(type) ? "bigint" : "int";
      const f = base({ type: t });
      const d = parseDefault(p.default, t);
      if (d !== undefined) f.default = d;
      out.fields.push(f);
      return out;
    }
    if (type === "bool") {
      const f = base({ type: "bool" });
      const d = parseDefault(p.default, "bool");
      if (d !== undefined) f.default = d;
      out.fields.push(f);
      return out;
    }
    if (type === "string" || type === "char" || type === "Guid") {
      const f = base({ type: "text" });
      const d = parseDefault(p.default, "text");
      if (d !== undefined) f.default = d;
      else if (!f.nullable && p.name !== "Name" && (p.default === null || p.default.trim() === "null")) f.nullable = true;
      out.fields.push(f);
      return out;
    }
    if (type === "XYZ" || type === "XY") {
      const vec = codes[0] === 210 || tokens.some((x) => ["normal", "direction", "vector", "axis", "extrusion"].includes(x));
      const t: Field["type"] = type === "XY" ? "point2" : vec ? "vector3" : "point3";
      const f = base({ type: t });
      const d = parseDefault(p.default, t);
      if (d !== undefined) f.default = d;
      out.fields.push(f);
      return out;
    }
    if (type === "Matrix4") { out.fields.push(base({ type: "matrix4" })); return out; }
    if (type === "byte[]" || type === "Stream" || type === "StringBuilder") {
      const f = base({ type: "blob" });
      if (type === "StringBuilder") f.meaning += " ACIS payload (SAT text in DXF; SAB binary from R2013).";
      out.fields.push(f);
      return out;
    }
    if (type === "Color") {
      // index colour (62/63/...), true colour (420/421/...), optional colour-book name (430/431/...)
      const [ci, ct, cb] = codes;
      const f1 = this.mk(p, nm, { type: "int", nullable: true }, ci !== undefined ? [ci] : [], [], dxfName);
      f1.meaning = `${p.doc || humanize(nm)} as an AutoCAD Color Index (0 ByBlock, 256 ByLayer, 1 to 255 index, negative = off).`.replace(/\.\./g, ".");
      out.fields.push(f1);
      if (ct !== undefined) {
        const f2 = this.mk(p, `${nm}_true`, { type: "int", nullable: true }, [ct], [], dxfName);
        f2.meaning = `${p.doc || humanize(nm)} as a 24-bit true colour (0x00RRGGBB); null when an index colour is used.`;
        out.fields.push(f2);
      }
      if (cb !== undefined) {
        const f3 = this.mk(p, `${nm}_book`, { type: "text", nullable: true }, [cb], [], dxfName);
        f3.meaning = `${p.doc || humanize(nm)}: name of the colour-book colour, when one is used.`;
        out.fields.push(f3);
      }
      return out;
    }
    if (type === "Transparency") {
      out.fields.push(base({ type: "int", nullable: true }));
      return out;
    }
    if (type === "PaperMargin" || type === "Vector2") { /* falls through to class handling */ }

    if (type === "T" || type === "IHandledCadObject" || type === "CadObject" || type === "Entity") {
      const f = base({ type: "ref", ref_to: "any" });
      f.name = (nm.endsWith("_id") ? nm : `${nm}_id`).replace(/^entity_id$/, "target_entity_id");
      f.nullable = true;
      f.meaning = `${p.doc ? p.doc.replace(/\.$/, "") : humanize(nm)}. Reference; DXF stores the handle.`;
      out.fields.push(f);
      return out;
    }
    const r = resolveType(this.c, type, p.owner);
    if (!r) {
      this.c.gaps.push({ type: ownerCode, what: `${owner.name}.${p.name}: ${type} (group ${codes.join(", ")})`, why: "type not resolvable in the parsed ACadSharp sources", kind: "unmapped" });
      return out;
    }
    if (r.kind === "enum") {
      const ef = enumField(r, p);
      const f = base({ ...ef } as Partial<Field> & Pick<Field, "type">);
      const m = p.default?.match(/^[\w.]+\.(\w+)$/);
      if (m && r.members.some((x) => x.name === m[1])) {
        if (f.type === "enum") f.default = m[1]!;
        else { const v = r.members.find((x) => x.name === m[1])?.value; if (v != null) f.default = v; }
      }
      out.fields.push(f);
      return out;
    }
    const cat = categoryOf(this.c, r);
    if (cat === "symbol" || cat === "object" || cat === "entity" || r.name === "CadObject" || (flags.includes("Handle") && !this.isEmbeddable(r))) {
      const target = this.c.codeOf.get(r);
      const f = base({ type: "ref", ref_to: target ?? "any" });
      const id = nm.endsWith("_id") ? nm : `${nm}_id`;
      f.name = id === "entity_id" ? "target_entity_id" : id;
      f.nullable = true;
      f.meaning = `${p.doc ? p.doc.replace(/\.$/, "") : humanize(nm)}. Reference${flags.includes("Name") ? "; DXF stores the name" : "; DXF stores the handle"}.`;
      out.fields.push(f);
      return out;
    }
    if (this.isEmbeddable(r)) {
      // an embedded value object: inline its fields with the property name as prefix
      this.c.stats.inlined++;
      const inner = this.fieldsFor(r, ownerCode, [...chain(this.c, r).reverse().flatMap((x) => ownProps(this.c, x))], dxfName, `${nm}_`);
      out.fields.push(...inner.fields);
      out.children.push(...inner.children);
      return out;
    }
    this.c.gaps.push({ type: ownerCode, what: `${owner.name}.${p.name}: ${type}`, why: "no mapping rule for this type", kind: "unmapped" });
    return out;
  }

  private isEmbeddable(r: CsType): boolean {
    return r.kind === "class" && !r.dxfName && ownPropsCount(r) > 0 && !["Entity", "CadObject"].includes(r.name);
  }

  private listField(owner: CsType, ownerCode: string, p: Prop, lst: { kind: "list" | "dict"; elem: string }, codes: number[], flags: string[], dxfName: string | null, prefix: string, nm: string): Emit {
    const out: Emit = { fields: [], children: [] };
    const elem = lst.elem.replace(/\?$/, "");
    const colCodes = p.collection?.codes ?? [];
    const allCodes = [...new Set([...codes, ...colCodes])];
    const srcRef = `${codes.length ? `count in ${codesText(codes, "group codes")}; ` : ""}${colCodes.length ? `repeated ${codesText(colCodes, "group codes")}` : ""}`.replace(/; $/, "");
    const mkChild = (suffix: string, fields: Field[], meaning: string, extra?: Partial<CatType>): CatType => {
      const single = singular(snake(p.name));
      const code = `${ownerCode}_${prefix}${single}`;
      return {
        code, name: `${owner.name}.${p.name}${suffix}`, kind: "child", parent: ownerCode, fidelity: "faithful",
        source: this.sourceFor(owner, p.line, dxfName), meaning, fields, ...extra,
      };
    };
    const docOrName = p.doc || `${humanize(snake(p.name))}.`;
    if (lst.kind === "list" && (elem === "double" || elem === "float")) {
      out.fields.push(this.mk(p, nm, { type: "array", of: "float" }, allCodes, flags, dxfName, ""));
      out.fields.at(-1)!.source_ref = srcRef || out.fields.at(-1)!.source_ref;
      return out;
    }
    if (lst.kind === "list" && (INTS.has(elem) || BIGS.has(elem))) {
      out.fields.push(this.mk(p, nm, { type: "array", of: BIGS.has(elem) ? "bigint" : "int" }, allCodes, flags, dxfName, ""));
      out.fields.at(-1)!.source_ref = srcRef || out.fields.at(-1)!.source_ref;
      return out;
    }
    const mkf = (name: string, f: Partial<Field> & Pick<Field, "type">, meaning: string, src: string): Field => ({ name, ...f, meaning, source_ref: src });
    if (lst.kind === "list" && (elem === "XYZ" || elem === "XY")) {
      const child = mkChild("", [mkf("point", { type: elem === "XY" ? "point2" : "point3" }, `${elem === "XY" ? "2D" : "3D"} point of the list.`, srcRef || "ACadSharp")], docOrName.replace(/\.$/, "") + " (one row per point, ordered).");
      out.children.push(child);
      return out;
    }
    if (lst.kind === "list" && elem === "int[]") {
      out.children.push(mkChild("", [mkf("indices", { type: "array", of: "int" }, "Indices of one entry.", srcRef || "ACadSharp")], docOrName.replace(/\.$/, "") + " (one row per entry, ordered)."));
      return out;
    }
    const r = resolveType(this.c, elem, p.owner);
    if (lst.kind === "list" && elem === "string") {
      out.children.push(mkChild("", [mkf("value", { type: "text" }, "One string of the list.", srcRef || "ACadSharp")], docOrName.replace(/\.$/, "") + " (one row per string, ordered)."));
      return out;
    }
    if (lst.kind === "list" && (!r || categoryOf(this.c, r) !== null || ["T", "CadObject", "IHandledCadObject", "Entity"].includes(elem))) {
      const target = r ? this.c.codeOf.get(r) : undefined;
      const single = singular(snake(p.name));
      const fname = `${single === "entity" ? "target_entity" : single}_id`;
      out.children.push(mkChild("", [mkf(fname, { type: "ref", ref_to: target ?? "any" }, `Reference to one member of the list${r ? ` (${r.name})` : ""}.`, srcRef || "ACadSharp")], docOrName.replace(/\.$/, "") + " (one row per reference, ordered)."));
      return out;
    }
    if (r && r.kind === "class") {
      // list of value objects -> child table(s); polymorphic element classes become child subtypes
      const baseCode = `${ownerCode}_${prefix}${singular(snake(p.name))}`;
      const keyField = lst.kind === "dict" ? [mkf("key", { type: "text" }, "Dictionary key of the entry.", srcRef || "ACadSharp")] : [];
      const subs = this.c.all.filter((x) => x.kind === "class" && x.outer === r.outer && x.base && baseOf(this.c, x) === r && x !== r);
      const mkElem = (cls: CsType, code: string, base?: string): CatType => {
        const props = (base ? ownProps(this.c, cls) : chain(this.c, cls).reverse().flatMap((x) => ownProps(this.c, x)));
        const inner = this.fieldsFor(cls, code, props, dxfName, "");
        const fields = [...(base ? [] : keyField), ...inner.fields];
        const ct: CatType = {
          code, name: `${owner.name}.${p.name}${base ? ` (${cls.name})` : ""}`, kind: "child", parent: ownerCode, fidelity: "faithful",
          source: this.sourceFor(cls, cls.line, dxfName),
          meaning: (cls.doc || docOrName).replace(/\.$/, "") + (base ? "." : " (one row per entry, ordered)."),
          fields, ...(base ? { base } : {}),
        };
        out.children.push(...inner.children);
        return ct;
      };
      const parentRow = mkElem(r, baseCode);
      if (subs.length) parentRow.notes = `Polymorphic list: each row is one of the subtypes ${subs.map((s) => `${baseCode}_${snake(s.name)}`).join(", ")}; the common fields live here.`;
      out.children.push(parentRow);
      for (const s of subs) out.children.push(mkElem(s, `${baseCode}_${snake(s.name)}`, baseCode));
      if (srcRef) parentRow.notes = `${parentRow.notes ? parentRow.notes + " " : ""}Source: ${srcRef}.`;
      return out;
    }
    this.c.gaps.push({ type: ownerCode, what: `${owner.name}.${p.name}: ${p.type} (group ${allCodes.join(", ")})`, why: "collection element type has no mapping rule", kind: "unmapped" });
    return out;
  }

  sourceFor(t: CsType, line: number, _dxf: string | null): CatType["source"] {
    return {
      document: `ACadSharp (DxfCodeValue attributes), cross-checked with ezdxf`,
      section: `${t.outer ? t.outer + "." : ""}${t.name}`,
      url: `https://github.com/DomCR/ACadSharp/blob/${SHAs.acadsharp}/src/ACadSharp/${t.file}#L${line}`,
      version: TARGET_VERSION,
      accessed_on: ACCESSED,
      licence: "MIT (ACadSharp, ezdxf)",
    };
  }
}

function ownPropsCount(r: CsType): number {
  return r.props.filter((p) => p.code || p.collection).length;
}

// ------------------------------------------------------------------ main
export function buildAll(): { types: CatType[]; gaps: Gap[]; ctx: Ctx; ezOnly: string[]; normStats: Record<string, number> } {
  const all = loadAcadSharp();
  const { top, nested } = index(all);
  const { types: ezTypes } = loadEzdxf();
  const ez = new Map<string, EzType[]>();
  for (const t of ezTypes) ez.set(t.dxfType, [...(ez.get(t.dxfType) ?? []), t]);
  const c: Ctx = { all, top, nested, ez, docs: loadEzDocs(), out: new Map(), gaps: [], codeOf: new Map(), covered: new Map(), stats: { ignored: 0, noDoc: 0, props: 0, inlined: 0 } };
  const b = new Builder(c);

  // 1. decide which ACadSharp classes become catalogue types, and their codes
  const dxfCount = new Map<string, number>();
  for (const t of all) if (t.kind === "class" && t.dxfName) dxfCount.set(t.dxfName, (dxfCount.get(t.dxfName) ?? 0) + 1);
  const included = new Set<CsType>();
  const isThirdParty = (t: CsType) => /^(Entities\/AecEntities|Entities\/Mechanical|Objects\/AEC)\//.test(t.file);
  for (const t of all) {
    if (t.kind !== "class" || !t.dxfName || t.outer) continue;
    if (STRUCTURE.skipClasses.has(t.name)) continue;
    if (isThirdParty(t)) { c.gaps.push({ type: `acad.${snake(t.name)}`, what: `${t.dxfName} (${t.name})`, why: "Autodesk Architecture/Mechanical vertical-product class; ACadSharp carries no DXF group codes for it", kind: "skipped" }); continue; }
    if (!categoryOf(c, t)) continue;
    included.add(t);
  }
  // ancestors that carry group codes become abstract bases
  const abstracts = new Set<CsType>();
  for (const t of [...included]) {
    for (const a of chain(c, t).slice(1)) {
      if (["Entity", "TableEntry", "NonGraphicalObject", "CadObject"].includes(a.name)) break;
      if (!included.has(a) && ownPropsCount(a) > 0) abstracts.add(a);
    }
  }
  const codeFor = (t: CsType): string => {
    if (STRUCTURE.codeOverrides[t.name]) return STRUCTURE.codeOverrides[t.name]!;
    if (t.dxfName && (dxfCount.get(t.dxfName) ?? 0) === 1 && !abstracts.has(t) && !/^(ACDB_|ACAD_)/.test(t.dxfName)) return `acad.${codeFromDxfName(t.dxfName)}`;
    return `acad.${snake(t.name)}`;
  };
  const seen = new Map<string, CsType>();
  for (const t of [...included, ...abstracts]) {
    let code = codeFor(t);
    if (seen.has(code)) code = `acad.${snake(t.name)}`;
    seen.set(code, t);
    c.codeOf.set(t, code);
  }
  // pilot types keep their migration codes; Entity maps to graphic_entity
  const entityRoot = top.get("Entity")!;
  c.codeOf.set(entityRoot, "acad.graphic_entity");

  // 2. the 16 pilot tables (hand-curated field lists, wording from the sources)
  const csByName = (n: string): CsType | undefined => (n.includes(".") ? nested.get(n) : top.get(n));
  for (const e of EXISTING) {
    const cs = csByName(e.cs)!;
    const anc = chain(c, cs);
    const props = anc.flatMap((x) => ownProps(c, x));
    if (e.cs === "Entity") props.push(...ownProps(c, entityRoot));
    const dxfName = cs.dxfName ?? (cs.outer ? top.get(cs.outer)?.dxfName ?? null : null);
    const fields: Field[] = e.fields.map((s) => {
      const f: Field = { name: s.name, type: s.type, meaning: "" } as Field;
      for (const k of ["nullable", "default", "unit", "ref_to", "of", "check", "values"] as const) if ((s as Record<string, unknown>)[k] !== undefined) (f as Record<string, unknown>)[k] = (s as Record<string, unknown>)[k];
      let meaning = s.meaning;
      let ref = s.source_ref;
      if (s.from) {
        const prop = props.find((p) => (p.code ?? p.collection)?.codes[0] === s.from![0]);
        if (!meaning) meaning = prop?.doc ?? "";
        ref = ref ?? `group code${s.from.length > 1 ? "s" : ""} ${s.from.join(", ")}${ezVersionNote(c, dxfName ?? (e.code === "acad.graphic_entity" ? "LINE" : null), s.from[0]!)}`;
        if (!prop) ref += " (not in ACadSharp for this class; wording from the pilot migration)";
      }
      f.meaning = meaning || `${humanize(s.name)}.`;
      if (ref) f.source_ref = ref;
      return f;
    });
    const typeCode = e.code;
    const t: CatType = {
      code: typeCode, name: cs.dxfName ?? (e.code === "acad.graphic_entity" ? "Common entity data" : cs.name), kind: e.kind,
      ...(e.base ? { base: e.base } : {}), ...(e.parent ? { parent: e.parent } : {}),
      fidelity: "faithful", source: b.sourceFor(cs, cs.line, dxfName),
      meaning: PILOT_MEANING[typeCode] ?? (cs.doc || `${cs.name}.`), fields, notes: e.notes,
    };
    c.out.set(typeCode, t);
    c.codeOf.set(cs, typeCode);
    c.covered.set(typeCode, new Set(e.fields.flatMap((f) => f.from ?? [])));
  }
  // pilot codes win over the derived ones
  for (const e of EXISTING) {
    const cs = csByName(e.cs)!;
    if (included.has(cs) || abstracts.has(cs)) c.codeOf.set(cs, e.code);
  }

  // 3. everything else
  const done = new Set(EXISTING.map((e) => e.code));
  const tableEntry = top.get("TableEntry")!;
  const classes = [...included, ...abstracts].sort((x, y) => (c.codeOf.get(x) ?? "").localeCompare(c.codeOf.get(y) ?? ""));
  for (const t of classes) {
    const code = c.codeOf.get(t)!;
    if (done.has(code) || c.out.has(code)) continue;
    const cat = categoryOf(c, t);
    const anc = chain(c, t).slice(1);
    const nearest = anc.find((a) => included.has(a) || abstracts.has(a));
    let base = nearest ? c.codeOf.get(nearest) : cat === "entity" ? "acad.graphic_entity" : undefined;
    const isAbstract = abstracts.has(t);
    let props = ownProps(c, t).filter((p) => !(p.inh && (included.has(p.inh) || abstracts.has(p.inh))));
    if (cat === "symbol" && !nearest) props = [...ownProps(c, tableEntry).filter((p) => p.name !== "Flags" || !t.props.some((q) => q.name === "Flags")), ...props];
    const dxfName = t.dxfName ?? anc.find((a) => a.dxfName)?.dxfName ?? null;
    const em = b.fieldsFor(t, code, props, dxfName);
    dedupe(em.fields, code);
    const kind: CatType["kind"] = STRUCTURE.kindOverrides[t.name] ?? (isAbstract ? "abstract" : cat === "entity" ? "entity" : cat === "symbol" ? "symbol" : "object");
    const parentOverride = STRUCTURE.childOf[t.name];
    const ct: CatType = {
      code, name: STRUCTURE.nameOverrides[t.name] ?? (t.dxfName && (isRootOfDxfName(c, t) || (dxfCount.get(t.dxfName) ?? 0) === 1) ? t.dxfName : t.dxfName ? `${t.dxfName} (${t.name})` : t.name),
      kind: parentOverride ? "child" : kind,
      ...(base && !(parentOverride && !nearest) && !STRUCTURE.noEntityBase.has(t.name) ? { base } : {}),
      ...(parentOverride ? { parent: parentOverride } : {}),
      fidelity: "faithful", source: b.sourceFor(t, t.line, dxfName),
      meaning: typeMeaning(c, t, dxfName),
      fields: em.fields,
    };
    const notes: string[] = [];
    const chainHasFields = anc.some((a) => (included.has(a) || abstracts.has(a)) && ownPropsCount(a) > 0);
    if (em.fields.length === 0 && !chainHasFields) { ct.needs_review = true; notes.push("ACadSharp carries no DXF group codes for this class (it is DWG-only or its DXF layout is undocumented there); the type is listed for completeness."); }
    if (ct.meaning.startsWith("(placeholder)")) { ct.needs_review = true; ct.meaning = ct.meaning.replace("(placeholder) ", ""); notes.push("No source gives a description of this type; the meaning is a placeholder derived from the class name."); }
    if (notes.length) ct.notes = notes.join(" ");
    c.out.set(code, ct);
    for (const ch of em.children) c.out.set(ch.code, ch);
    if (t.subclass) ct.notes = [ct.notes, `DXF subclass marker ${t.subclass}.`].filter(Boolean).join(" ");
  }

  // 4. types ezdxf documents and ACadSharp does not
  const ezOnly = harvestEzOnly(c, b);
  const norm = normalize([...c.out.values()].map((t) => CatType.parse(t)));
  c.gaps.push(...norm.gaps);
  return { types: norm.types.map((t) => CatType.parse(t)), gaps: c.gaps, ctx: c, ezOnly, normStats: norm.stats };
}

const GENERIC = /^((Represents|Defines|Class|Standard class|The standard class)\b.*\b(entity|object|class|record|entities)|An? \w+ (entity|object))\.?$/i;
function typeMeaning(c: Ctx, t: CsType, dxfName: string | null): string {
  if (t.doc && !GENERIC.test(t.doc)) return t.doc.endsWith(".") ? t.doc : `${t.doc}.`;
  const shared = !!t.dxfName && c.all.filter((x) => x.kind === "class" && x.dxfName === t.dxfName).length > 1;
  const root = !shared || isRootOfDxfName(c, t);
  const d = dxfName && root ? c.docs.desc.get(dxfName) : undefined;
  if (d) return d.endsWith(".") ? d : `${d}.`;
  if (shared && (!root || !t.doc || GENERIC.test(t.doc))) return `${humanize(snake(t.name))}: a variant of the DXF ${t.dxfName} entity${t.subclass ? `, marked by subclass ${t.subclass}` : ""}.`;
  if (t.doc) return `${t.doc.endsWith(".") ? t.doc : t.doc + "."}`.replace(/^Represents an? /, "(placeholder) A ");
  return `(placeholder) ${humanize(snake(t.name))} (${t.dxfName ?? "no DXF name"}).`;
}

function isRootOfDxfName(c: Ctx, t: CsType): boolean {
  const b = baseOf(c, t);
  return !(b && b.dxfName === t.dxfName);
}

function dedupe(fields: Field[], code: string) {
  const seen = new Map<string, number>();
  for (const f of fields) {
    const n = seen.get(f.name) ?? 0;
    seen.set(f.name, n + 1);
    if (n > 0) f.name = `${f.name}_${n + 1}`;
  }
  const bad = new Set(["entity_id", "revision_id", "kind", "type_code", "position"]);
  for (const f of fields) if (bad.has(f.name)) throw new Error(`reserved column name ${f.name} in ${code}`);
}

const PILOT_MEANING: Record<string, string> = {
  "acad.graphic_entity": "The fields every AutoCAD graphic entity shares (DXF common entity group codes), stored once; each entity table points at it.",
  "acad.layer": "A layer: a named visibility, colour, linetype and plot grouping that entities are assigned to (DXF LAYER table entry).",
  "acad.linetype": "A linetype definition (DXF LTYPE table entry): a named dash/dot pattern.",
  "acad.block_record": "A block definition (DXF BLOCK_RECORD): a named container of entities; model space and each paper space are blocks too.",
  "acad.insert": "One placement of a block definition at a point with scale, rotation and optional row/column array (DXF INSERT).",
  "acad.point": "A single point in 3D space (DXF POINT).",
  "acad.line": "A straight segment between two 3D points (DXF LINE).",
  "acad.circle": "A circle given by centre and radius (DXF CIRCLE).",
  "acad.arc": "A circular arc given by centre, radius and start and end angle, counter-clockwise (DXF ARC).",
  "acad.lwpolyline": "A lightweight 2D polyline in a plane at one elevation; vertices may carry a bulge for arc segments (DXF LWPOLYLINE).",
  "acad.lwpolyline_vertex": "One vertex of a lightweight polyline, with optional segment widths and a bulge.",
  "acad.face3d": "A planar three- or four-sided 3D face (DXF 3DFACE) with per-edge visibility.",
  "acad.mesh": "A subdivision mesh header (DXF MESH); its vertices and faces are child rows.",
  "acad.mesh_vertex": "One vertex of a subdivision mesh (level 0).",
  "acad.mesh_face": "One face of a subdivision mesh: an ordered list of vertex indices (level 0).",
  "acad.text": "A single-line text string with height, rotation, style and justification (DXF TEXT).",
};

// ------------------------------------------------------------------ CLI
if (import.meta.main) {
  const { types, gaps, ctx, ezOnly, normStats } = buildAll();
  mkdirSync(OUT_DIR, { recursive: true });
  for (const f of readdirSync(OUT_DIR)) if (f.endsWith(".yaml")) rmSync(join(OUT_DIR, f));
  for (const t of types) writeFileSync(join(OUT_DIR, `${t.code.split(".")[1]}.yaml`), toYaml(t));
  writeFileSync(join(OUT_DIR, "SOURCES.md"), sourcesMd());
  writeFileSync(join(OUT_DIR, "GAPS.md"), gapsMd(types, gaps, ezOnly, ctx.stats, normStats));
  const n = counts(types);
  console.log(`wrote ${n.types} types, ${n.fields} fields (${JSON.stringify(n.byKind)}); ignored ${ctx.stats.ignored}, undocumented ${ctx.stats.noDoc}, inlined ${ctx.stats.inlined}`);
}
void WORK; void ACAD_ROOT;
