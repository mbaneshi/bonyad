// Turns the parsed LandXML 1.2 XSD into catalogue entries (catalogue-format v0).
//
// Modelling rules (applied the same way to every element):
//  R1  The root element is `object`; every other emitted type is a `child` of the type that
//      contains it in the XSD. Abstract types are named complexTypes used as an xs:extension base.
//  R2  Attributes become fields. A child element that occurs at most once, has no element
//      children of its own and is compact (coordinate text, or at most 4 attributes) is inlined into its parent as fields prefixed with the element name
//      (text content -> `<name>`, attributes -> `<name>_<attr>`).
//  R3  A repeated child element, or one with element children, becomes its own `child` type.
//      A text-only repeated element becomes an `array` field.
//  R4  Elements with neither attributes nor text (pure wrappers, e.g. Pnts, Units) are not
//      emitted; their children attach to the wrapper's parent.
//  R5  Feature (the schema's extension point, attachable to nearly every element) is emitted once
//      as a generalised type with an `owner` reference and is not listed per parent.
//  R6  Coordinate text ("north east [elev]") becomes a point3 with x = easting, y = northing.
import { isPointText, resolveSimple, shorten, type Resolved } from "./types.ts";
import { Entry, type Field } from "./schema.ts";
import type { AttrDef, ComplexTypeDef, ElementDef, Particle, Schema, SimpleTypeDef } from "./xsd.ts";

export interface BuildOptions {
  accessedOn: string;
  sourceUrl: string;
  xsdSha256: string;
  licence: string;
  /** names (as in the XSD) of element attributes that are derivable from other data */
  redundant?: Record<string, string[]>;
}

export function snake(s: string): string {
  if (s === "LandXML") return "landxml"; // the format's own name is one word
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([0-9])([A-Z][a-z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

interface Decl {
  name: string;
  def: ElementDef;
  global: boolean;
}

interface Eff {
  attrs: AttrDef[];
  particles: Particle[];
  textType?: string;
  textInline?: SimpleTypeDef;
  hasText: boolean;
  anyAttr: boolean;
  anyElement: boolean;
}

interface Child {
  decl: Decl;
  repeated: boolean;
  optional: boolean;
  soft: boolean;
  min: number;
  max: number | "unbounded";
  wrappers: string[];
  /** set when this child is a pure wrapper naming the role of `role` (its only child) */
  role?: Decl;
  /** set for an element with no attributes, text or children: only its presence carries meaning */
  marker?: boolean;
}

function hasElements(p: Particle): boolean {
  return p.items.some((i) => (i.kind === "element" ? true : i.kind === "any" ? false : hasElements(i)));
}

const GENERALISED = new Set(["Feature"]);
/** R2 inlines an attribute-only single child when it has at most this many attributes (coordinate elements are always inlined). */
const INLINE_MAX_ATTRS = 4;

export class Builder {
  readonly entries = new Map<string, Entry>();
  private parents = new Map<string, Map<string, string>>();
  private softNotes = new Map<string, Set<string>>();
  private wildcardNotes = new Set<string>();
  private keyrefs = new Map<string, string>(); // "Element@attr" -> target element name
  readonly reachableGlobals = new Set<string>();
  readonly log: string[] = [];
  /** child elements that produced nothing (must stay empty) */
  readonly dropped: string[] = [];

  constructor(
    private readonly schema: Schema,
    private readonly opts: BuildOptions,
  ) {
    this.indexKeyrefs();
  }

  // ------------------------------------------------------------- public

  build(): Entry[] {
    const root = this.global("LandXML");
    this.emit({ name: root.name, def: root.def, global: true }, null, "root");
    this.emitFeature();
    this.finalise();
    return [...this.entries.values()];
  }

  // ------------------------------------------------------------- lookup

  private global(name: string): Decl {
    const def = this.schema.elements.get(name);
    if (!def) throw new Error(`unknown global element ${name}`);
    return { name, def, global: true };
  }

  private declOf(el: ElementDef): Decl {
    if (el.ref) return this.global(el.ref);
    if (!el.name) throw new Error("anonymous element");
    return { name: el.name, def: el, global: false };
  }

  private complexOf(d: Decl): ComplexTypeDef | undefined {
    if (d.def.inlineComplex) return d.def.inlineComplex;
    if (d.def.type && !d.def.type.startsWith("xs:")) return this.schema.complexTypes.get(d.def.type);
    return undefined;
  }

  private isSimpleDecl(d: Decl): boolean {
    if (d.def.inlineSimple) return true;
    if (d.def.type?.startsWith("xs:")) return true;
    if (d.def.type && this.schema.simpleTypes.has(d.def.type)) return true;
    return false;
  }

  private effective(ct: ComplexTypeDef): Eff {
    const eff: Eff = { attrs: [], particles: [], hasText: false, anyAttr: ct.anyAttribute, anyElement: false };
    const baseName = ct.simpleContentBase ?? ct.extendsBase;
    if (baseName && !baseName.startsWith("xs:") && this.schema.complexTypes.has(baseName)) {
      const b = this.effective(this.schema.complexTypes.get(baseName)!);
      eff.attrs.push(...b.attrs);
      eff.particles.push(...b.particles);
      eff.textType = b.textType;
      eff.textInline = b.textInline;
      eff.hasText = b.hasText;
      eff.anyAttr ||= b.anyAttr;
    } else if (ct.simpleContentBase) {
      eff.textType = ct.simpleContentBase;
      eff.hasText = true;
    }
    eff.attrs.push(...ct.attributes);
    if (ct.particle) eff.particles.push(ct.particle);
    // mixed content whose only element content is a foreign-namespace wildcard (e.g. FieldNote):
    // the element is a free text note; foreign markup inside it is not modelled
    if (ct.mixed && !baseName && !eff.hasText && ct.particle && !hasElements(ct.particle)) {
      eff.hasText = true;
      eff.textType = "xs:string";
    }
    return eff;
  }

  private effOf(d: Decl): Eff | undefined {
    const ct = this.complexOf(d);
    return ct ? this.effective(ct) : undefined;
  }

  // ------------------------------------------------------------- children

  private collect(eff: Eff): Child[] {
    const out: Child[] = [];
    // A repeating xs:sequence repeats every member as a unit (strictly repeated); a repeating
    // xs:choice only permits a member to recur (modelled as at most once, flagged "soft").
    const walk = (p: Particle, seqAbove: boolean, choiceAbove: boolean, optionalAbove: boolean, wrappers: string[]) => {
      const many = p.max === "unbounded" || (typeof p.max === "number" && p.max > 1);
      const seqRep = seqAbove || (many && p.kind !== "choice");
      const choiceRep = choiceAbove || (many && p.kind === "choice");
      const opt = optionalAbove || p.min === 0 || p.kind === "choice";
      for (const item of p.items) {
        if (item.kind === "any") {
          eff.anyElement = true;
          continue;
        }
        if (item.kind !== "element") {
          walk(item, seqRep, choiceRep, opt, wrappers);
          continue;
        }
        const el = item.el;
        const d = this.declOf(el);
        if (GENERALISED.has(d.name)) continue;
        const own = el.max === "unbounded" || (typeof el.max === "number" && el.max > 1);
        out.push({
          decl: d,
          repeated: own || seqRep,
          soft: !own && !seqRep && choiceRep,
          optional: opt || el.min === 0,
          min: el.min,
          max: el.max,
          wrappers,
        });
      }
    };
    for (const p of eff.particles) walk(p, false, false, false, []);
    // merge duplicates of the same element
    const merged = new Map<string, Child>();
    for (const c of out) {
      const k = c.decl.global ? `g:${c.decl.name}` : `l:${c.decl.name}`;
      const prev = merged.get(k);
      if (!prev) merged.set(k, c);
      else {
        prev.repeated ||= c.repeated;
        prev.soft ||= c.soft;
        prev.optional &&= c.optional;
      }
    }
    return [...merged.values()];
  }

  private dedupe(children: Child[]): Child[] {
    const merged = new Map<string, Child>();
    for (const c of children) {
      const k = `${c.decl.global ? "g" : "l"}:${c.decl.name}:${c.role ? "role" : ""}`;
      const prev = merged.get(k);
      if (!prev) merged.set(k, { ...c });
      else {
        prev.repeated ||= c.repeated;
        prev.soft ||= c.soft;
        prev.optional &&= c.optional;
      }
    }
    return [...merged.values()];
  }

  /** Would this child be turned into fields of its parent (rules R2/R3 for single elements)? */
  private isInlinable(c: Child): boolean {
    if (c.repeated) return false;
    if (this.isSimpleDecl(c.decl)) return true;
    const e = this.effOf(c.decl);
    if (!e) return false;
    if (this.collect(e).length > 0) return false;
    if (e.attrs.length === 0 && e.hasText) return true;
    return (e.hasText && isPointText(e.textType, { schema: this.schema })) || e.attrs.length <= INLINE_MAX_ATTRS;
  }

  private isRoleChild(c: Child): boolean {
    if (this.isSimpleDecl(c.decl)) return false;
    const e = this.effOf(c.decl);
    if (!e) return false;
    const hasKids = this.collect(e).length > 0;
    return !c.repeated && (hasKids || e.attrs.length > INLINE_MAX_ATTRS);
  }

  /** Expand pure wrappers (no attributes, no text) into their children. */
  private expand(children: Child[]): Child[] {
    const out: Child[] = [];
    for (const c of children) {
      const eff = this.effOf(c.decl);
      let pure = !!eff && eff.attrs.length === 0 && !eff.hasText && eff.particles.length > 0 && !this.isSimpleDecl(c.decl);
      // a repeated wrapper whose children become fields is itself a row (e.g. AlignPI): keep it
      if (pure && c.repeated && this.collect(eff!).some((k) => this.isInlinable(k))) pure = false;
      if (!pure) {
        out.push(c);
        continue;
      }
      this.reachableGlobals.add(c.decl.name);
      const inner = this.collect(eff!);
      if (inner.length === 0) {
        // an empty element whose presence is the information (e.g. InletStruct)
        out.push({ ...c, marker: true });
        continue;
      }
      if (!c.repeated && inner.length === 1 && this.isRoleChild(inner[0]!)) {
        // a wrapper whose name is the role of its only (structured) child: keep the role
        out.push({ ...c, role: inner[0]!.decl });
        continue;
      }
      for (const ic of this.expand(inner)) {
        out.push({
          ...ic,
          repeated: ic.repeated || c.repeated,
          soft: ic.soft || c.soft,
          optional: ic.optional || c.optional,
          wrappers: [c.decl.name, ...ic.wrappers],
        });
      }
    }
    return out;
  }

  // ------------------------------------------------------------- naming

  private codeFor(d: Decl, parentLocal: string | null): string {
    return `landxml.${d.global || parentLocal === null ? snake(d.name) : `${parentLocal}_${snake(d.name)}`}`;
  }

  // ------------------------------------------------------------- emit

  private emit(d: Decl, parentCode: string | null, occ: string): string {
    const code = this.codeFor(d, parentCode ? parentCode.split(".")[1]! : null);
    if (d.global) this.reachableGlobals.add(d.name);
    if (this.entries.has(code) || this.inProgress.has(code)) {
      if (parentCode) this.addParent(code, parentCode, occ);
      return code;
    }
    this.inProgress.add(code);
    if (parentCode) this.addParent(code, parentCode, occ);

    if (this.isSimpleDecl(d)) return this.emitListRows(d, code, parentCode);
    const ct = this.complexOf(d)!;
    const eff = this.effective(ct);
    const baseName = ct.simpleContentBase ?? ct.extendsBase;
    let base: string | undefined;
    if (baseName && !baseName.startsWith("xs:") && this.schema.complexTypes.has(baseName)) {
      base = this.emitAbstract(baseName);
    }
    const ownAttrs = base ? ct.attributes : eff.attrs;
    const fields: Field[] = [];
    const names = new Set<string>();
    const add = (f: Field) => {
      if (names.has(f.name)) throw new Error(`duplicate field ${f.name} in ${code}`);
      names.add(f.name);
      fields.push(f);
    };

    // text content
    if (!base && eff.hasText) add(this.textField(d, eff));

    for (const a of ownAttrs) add(this.attrField(d.name, a, "", false, code));

    // children
    const own = this.effective({ ...ct, simpleContentBase: undefined, extendsBase: undefined });
    const pending: { child: Child }[] = [];
    const children = this.dedupe(this.expand(this.collect(base ? own : eff)));
    if (eff.anyElement || own.anyElement) this.wildcardNotes.add(code);
    if (eff.anyAttr) this.wildcardNotes.add(code);
    for (const c of children) {
      if (c.decl.global) this.reachableGlobals.add(c.decl.name);
      if (c.role) {
        pending.push({ child: c });
        continue;
      }
      if (c.marker) {
        const doc = c.decl.def.doc.length ? shorten(c.decl.def.doc[0]!, 200) : `Empty element ${c.decl.name}`;
        add({
          name: snake(c.decl.name),
          type: "bool",
          default: false,
          meaning: `True when the empty ${c.decl.name} element is present; the element carries no data, only its presence. ${doc}`.replace(/\s+/g, " "),
          source_ref: `XSD ${d.name}/${c.decl.name} (empty element)`,
        });
        continue;
      }
      const cEff = this.effOf(c.decl);
      const simple = this.isSimpleDecl(c.decl);
      const hasKids = cEff ? this.collect(cEff).length > 0 : false;
      const textOnly = cEff ? cEff.attrs.length === 0 && cEff.hasText && !hasKids : false;
      if (simple || textOnly) {
        if (c.repeated) {
          const r = this.simpleOf(c.decl, cEff);
          const f = this.fieldFor(snake(c.decl.name), r, c.decl.def.doc, `${c.decl.name} (element)`, true, c.decl.name, d.name);
          if (r.type === "array") {
            // each occurrence is a separate list (e.g. a gap-separated polyline): one row per occurrence
            pending.push({ child: c });
          } else {
            const scalar = ["text", "int", "bigint", "float", "bool", "date", "timestamp", "length", "angle", "area", "volume", "ratio"];
            const ofType = (scalar.includes(r.type) ? r.type : "text") as NonNullable<Field["of"]>;
            const allowed = r.values ? ` Allowed values: ${r.values.map((v) => v.value).join(", ")}.` : "";
            const g: Field = { ...f, type: "array", of: ofType, meaning: `${f.meaning} Repeated element, stored as an ordered array.${allowed}` };
            delete g.values;
            delete g.ref_to;
            delete g.unit; // a unit is only legal on a plain numeric field; the array's meaning already names it
            add(g);
          }
        } else {
          const r = this.simpleOf(c.decl, cEff);
          const f = this.fieldFor(snake(c.decl.name), r, c.decl.def.doc, `${c.decl.name} (element)`, c.optional || c.min === 0, c.decl.name, d.name);
          add(f);
        }
        continue;
      }
      const compact = cEff ? (cEff.hasText && isPointText(cEff.textType, { schema: this.schema })) || cEff.attrs.length <= INLINE_MAX_ATTRS : false;
      if (cEff && !c.repeated && !hasKids && compact) {
        // R2: inline attribute/text-only single element
        const inl = this.inlineFields(c.decl, cEff, c.optional, d.name, code);
        if (inl.length === 0) this.dropped.push(`${code}: element ${c.decl.name} has no attributes, text or children`);
        for (const f of inl) add(f);
        if (c.soft) this.addSoft(code, c.decl.name);
        continue;
      }
      pending.push({ child: c });
    }

    const meaning = this.typeMeaning(d.def.doc.length ? d.def.doc : ct.doc, d.name);
    const kind: Entry["kind"] = parentCode === null ? "object" : "child";
    const entry: Entry = {
      code,
      name: d.name,
      kind,
      ...(base ? { base } : {}),
      ...(parentCode ? { parent: parentCode } : {}),
      fidelity: "proxy",
      source: this.source(`element ${d.name}`),
      meaning,
      fields,
    };
    this.entries.set(code, entry);
    this.inProgress.delete(code);

    for (const { child: c } of pending) {
      if (c.role) this.emitRole(c, code);
      else this.emit(c.decl, code, this.occText(c));
    }
    return code;
  }

  private inProgress = new Set<string>();

  /** Wrapper element W naming the role of its only child C: type W (base = C's type), no own fields. */
  private emitRole(c: Child, parentCode: string): void {
    const role = c.role!;
    const wrapperCode = this.codeFor(c.decl, parentCode.split(".")[1]!);
    if (role.global) this.reachableGlobals.add(role.name);
    let baseCode = this.codeFor(role, parentCode.split(".")[1]!);
    if (!this.entries.has(baseCode) && !this.inProgress.has(baseCode)) baseCode = this.emit(role, parentCode, "role base");
    if (this.entries.has(wrapperCode)) {
      this.addParent(wrapperCode, parentCode, this.occText(c));
      return;
    }
    const entry: Entry = {
      code: wrapperCode,
      name: c.decl.name,
      kind: "child",
      base: baseCode,
      parent: parentCode,
      fidelity: "proxy",
      source: this.source(`element ${c.decl.name}`),
      meaning: this.typeMeaning(c.decl.def.doc, c.decl.name),
      fields: [],
      notes: `Role wrapper: in the XSD ${c.decl.name} contains exactly one ${role.name}; this type is a ${role.name} playing the role ${c.decl.name} and adds no fields of its own.`,
    };
    this.entries.set(wrapperCode, entry);
    this.addParent(wrapperCode, parentCode, this.occText(c));
  }

  /** A repeated element whose content is a list of numbers: one row per occurrence, holding the list. */
  private emitListRows(d: Decl, code: string, parentCode: string | null): string {
    const r = this.simpleOf(d, undefined);
    const f = this.fieldFor("values", r, d.def.doc, `${d.name} (element text)`, false, d.name, d.name);
    const entry: Entry = {
      code,
      name: d.name,
      kind: "child",
      ...(parentCode ? { parent: parentCode } : {}),
      fidelity: "proxy",
      source: this.source(`element ${d.name}`),
      meaning: this.typeMeaning(d.def.doc, d.name),
      fields: [f],
      notes: "One row per occurrence of the repeated list element; a row boundary is meaningful (for example a gap in a profile), so occurrences are not concatenated.",
    };
    this.entries.set(code, entry);
    this.inProgress.delete(code);
    return code;
  }

  private emitAbstract(typeName: string): string {
    const code = `landxml.${snake(typeName)}`;
    if (this.entries.has(code) || this.inProgress.has(code)) return code;
    this.inProgress.add(code);
    const ct = this.schema.complexTypes.get(typeName)!;
    const eff = this.effective(ct);
    const fields: Field[] = [];
    if (eff.hasText) {
      fields.push(this.textField({ name: typeName, def: { doc: [], min: 1, max: 1, constraints: [] }, global: false }, eff));
    }
    for (const a of eff.attrs) fields.push(this.attrField(typeName, a, "", false, code));
    const entry: Entry = {
      code,
      name: typeName,
      kind: "abstract",
      fidelity: "proxy",
      source: this.source(`complexType ${typeName}`),
      meaning: this.typeMeaning(ct.doc, typeName),
      fields,
      notes: "Named complexType used as the xs:extension base of stored elements; never stored itself.",
    };
    this.entries.set(code, entry);
    this.inProgress.delete(code);
    return code;
  }

  // Feature is the XSD's extension point; emitted once with an owner reference (R5).
  private emitFeature() {
    const d = this.global("Feature");
    const code = "landxml.feature";
    if (this.entries.has(code)) return;
    const ct = this.complexOf(d)!;
    const eff = this.effective(ct);
    const fields: Field[] = [
      {
        name: "owner",
        type: "ref",
        ref_to: "any",
        nullable: true,
        meaning: "The element this Feature is attached to (null for a top-level or nested Feature, see parent_feature).",
        source_ref: "not in the XSD: linkage added because Feature is listed under nearly every element",
      },
      {
        name: "parent_feature",
        type: "ref",
        ref_to: code,
        nullable: true,
        meaning: "The Feature that contains this one when Features are nested.",
        source_ref: "not in the XSD: linkage for nested Feature elements",
      },
    ];
    for (const a of eff.attrs) fields.push(this.attrField("Feature", a, "", false, code));
    const entry: Entry = {
      code,
      name: "Feature",
      kind: "object",
      fidelity: "proxy",
      source: this.source("element Feature"),
      meaning: this.typeMeaning(d.def.doc.length ? d.def.doc : ct.doc, "Feature"),
      fields,
      notes:
        "Generalised (rule R5): the XSD lists Feature as an optional repeated child of nearly every element; it is emitted once here, with owner and parent_feature added as linkage.",
    };
    this.entries.set(code, entry);
    this.reachableGlobals.add("Feature");
    // children of Feature (Property, DocFileRef, ...) are normal child types
    const children = this.dedupe(this.expand(this.collect(eff)));
    const saved = this.entries.get(code)!;
    for (const c of children) {
      const cEff = this.effOf(c.decl);
      if (this.isSimpleDecl(c.decl) || !cEff) continue;
      if (!c.repeated && this.collect(cEff).length === 0 && (cEff.attrs.length <= INLINE_MAX_ATTRS || cEff.hasText)) {
        for (const f of this.inlineFields(c.decl, cEff, c.optional, "Feature", code)) saved.fields.push(f);
        continue;
      }
      this.emit(c.decl, code, this.occText(c));
    }
  }

  // ------------------------------------------------------------- fields

  private simpleOf(d: Decl, eff: Eff | undefined): Resolved {
    const lk = { schema: this.schema };
    if (eff && eff.hasText) {
      if (isPointText(eff.textType, lk)) return { type: "point3", sourceType: eff.textType ?? "Point" };
      return resolveSimple(eff.textType, eff.textInline, lk);
    }
    if (d.def.inlineSimple) {
      const inl = d.def.inlineSimple;
      if (isPointText(inl.base, lk)) {
        return { type: "array", of: "float", sourceType: inl.base ?? "Point", convention: "Space-delimited list of doubles; consecutive values are the coordinates of successive points in the order the schema states." };
      }
      return resolveSimple(undefined, inl, lk);
    }
    return resolveSimple(d.def.type, undefined, lk);
  }

  private textField(d: Decl, eff: Eff): Field {
    const lk = { schema: this.schema };
    const doc = d.def.doc;
    if (isPointText(eff.textType, lk)) {
      return {
        name: "coordinates",
        type: "point3",
        nullable: true,
        meaning:
          "The element's coordinate text \"northing easting [elevation]\" stored as point3 with x = easting (second value), y = northing (first value), z = elevation (null when absent); null when only a pntRef is given. Lengths stay in the file's declared unit.",
        source_ref: `text content (${eff.textType})`,
      };
    }
    const r = resolveSimple(eff.textType, eff.textInline, lk);
    return this.fieldFor("value", r, doc, "text content", false, d.name, d.name);
  }

  private attrField(owner: string, a: AttrDef, prefix: string, forceNullable: boolean, code: string): Field {
    const lk = { schema: this.schema };
    let r: Resolved = resolveSimple(a.type, a.inline, lk);
    const keyrefTarget = this.keyrefs.get(`${owner}@${a.name}`);
    if (keyrefTarget && r.type === "text") {
      r = { type: "ref", ref_to: `landxml.${snake(keyrefTarget)}`, sourceType: a.type ?? "string", convention: `Holds the \`name\` of the referenced ${keyrefTarget} (the schema's xs:keyref).` };
    }
    const f = this.fieldFor(prefix + snake(a.name), r, a.doc, `${owner}/@${a.name}`, forceNullable || a.use !== "required", a.name, owner);
    if (a.default !== undefined) {
      const numeric = ["float", "int", "length", "angle", "area", "volume", "ratio"].includes(f.type);
      const dv = numeric ? Number(a.default) : a.default;
      f.default = dv as Field["default"];
    }
    if (a.fixed !== undefined) f.default = a.fixed;
    return f;
  }

  private inlineFields(d: Decl, eff: Eff, optional: boolean, ownerName: string, ownerCode: string): Field[] {
    const out: Field[] = [];
    const n = snake(d.name);
    if (eff.hasText) {
      const lk = { schema: this.schema };
      if (isPointText(eff.textType, lk)) {
        out.push({
          name: n,
          type: "point3",
          nullable: true,
          meaning: `${this.shortDoc(d.def.doc, `The ${d.name} point`)} Coordinate text \"northing easting [elevation]\" stored with x = easting, y = northing, z = elevation (null when absent or when only ${n}_pnt_ref is given).`,
          source_ref: `${ownerName}/${d.name} text content (${eff.textType})`,
        });
      } else {
        const r = resolveSimple(eff.textType, eff.textInline, lk);
        out.push(this.fieldFor(n, r, d.def.doc, `${ownerName}/${d.name} text content`, true, d.name, ownerName));
      }
    }
    for (const a of eff.attrs) {
      out.push(this.attrField(d.name, a, `${n}_`, optional, ownerCode));
    }
    return out;
  }

  private fieldFor(name: string, r: Resolved, doc: string[], sourceRef: string, nullable: boolean, attrName: string, ownerName: string): Field {
    const base = doc.length ? shorten(doc[0]!, 220) : r.typeDoc ? shorten(r.typeDoc, 220) : `${ownerName} ${attrName}; the XSD gives no description.`;
    const parts = [base.endsWith(".") ? base : base + (/[.!?"]$/.test(base) ? "" : ".")];
    if (r.convention) parts.push(r.convention);
    const red = this.opts.redundant?.[ownerName]?.includes(attrName);
    if (red) {
      parts.push("Redundant in the source: derivable from the geometry, so a claim to verify rather than authority.");
    }
    const f: Field = { name, type: r.type, meaning: parts.join(" ").replace(/\s+/g, " ").trim(), source_ref: `XSD ${sourceRef}; type ${r.sourceType}` };
    if (nullable) f.nullable = true;
    if (r.of) f.of = r.of;
    if (r.ref_to) f.ref_to = r.ref_to;
    if (r.values) f.values = r.values;
    if (r.unit) f.unit = r.unit;
    if (r.check) f.check = r.check;
    return f;
  }

  private shortDoc(doc: string[], fallback: string): string {
    const s = doc.length ? shorten(doc[0]!, 160) : fallback + ".";
    return s.endsWith(".") ? s : s + ".";
  }

  private typeMeaning(doc: string[], name: string): string {
    if (!doc.length) return `LandXML 1.2 \`${name}\`; the XSD gives no description.`;
    return shorten(doc.join(" "), 400);
  }

  private source(section: string): Entry["source"] {
    return {
      document: "LandXML 1.2 XML Schema (LandXML-1.2.xsd)",
      section,
      url: this.opts.sourceUrl,
      version: "1.2 (posted 2008-07-29)",
      accessed_on: this.opts.accessedOn,
      licence: this.opts.licence,
    };
  }

  // ------------------------------------------------------------- bookkeeping

  private occText(c: Child): string {
    // a member of a repeating xs:sequence repeats with the sequence even when its own maxOccurs is 1
    const max = c.max === "unbounded" || (c.repeated && Number(c.max) <= 1) ? "unbounded" : String(c.max);
    const via = c.wrappers.length ? ` via ${c.wrappers.join("/")}` : "";
    return `${c.repeated ? `${c.min}..${max}` : c.soft ? "at most once (XSD: unbounded choice)" : `${c.min}..${max}`}${via}`;
  }

  private addParent(code: string, parentCode: string, occ: string) {
    const m = this.parents.get(code) ?? new Map<string, string>();
    if (!m.has(parentCode)) m.set(parentCode, occ);
    this.parents.set(code, m);
  }

  private addSoft(code: string, name: string) {
    const s = this.softNotes.get(code) ?? new Set<string>();
    s.add(name);
    this.softNotes.set(code, s);
  }

  private indexKeyrefs() {
    const root = this.schema.elements.get("LandXML");
    if (!root) return;
    const last = (xp: string) => xp.split("/").pop()!.replace(/^\.\/\//, "");
    const keys = new Map<string, string>();
    for (const c of root.constraints) if (c.kind === "key") keys.set(c.name, last(c.selector));
    for (const c of root.constraints) {
      if (c.kind !== "keyref" || !c.refer) continue;
      const target = keys.get(c.refer);
      const field = c.fields[0];
      if (!target || !field?.startsWith("@")) continue;
      this.keyrefs.set(`${last(c.selector)}@${field.slice(1)}`, target);
    }
  }

  /**
   * Catalogue format rules 5 and 8: a `child` cannot be a parent and cannot have a `base`, and a type
   * that is a base needs its own table. Every type that contains other types, derives from a base,
   * or is a base becomes an `object` with a `container` reference to its XSD container; only
   * leaves stay `child` rows.
   */
  private normaliseKinds() {
    const derived = new Set<string>();
    for (const e of this.entries.values()) if (e.base) derived.add(e.base);
    const hasKids = this.collect(e).length > 0;
    return !c.repeated && (hasKids || e.attrs.length > INLINE_MAX_ATTRS);
  }

  /** Expand pure wrappers (no attributes, no text) into their children. */
  private expand(children: Child[]): Child[] {
    const out: Child[] = [];
    for (const c of children) {
      const eff = this.effOf(c.decl);
      let pure = !!eff && eff.attrs.length === 0 && !eff.hasText && eff.particles.length > 0 && !this.isSimpleDecl(c.decl);
      // a repeated wrapper whose children become fields is itself a row (e.g. AlignPI): keep it
      if (pure && c.repeated && this.collect(eff!).some((k) => this.isInlinable(k))) pure = false;
      if (!pure) {
        out.push(c);
        continue;
      }
      this.reachableGlobals.add(c.decl.name);
      const inner = this.collect(eff!);
      if (inner.length === 0) {
        // an empty element whose presence is the information (e.g. InletStruct)
        out.push({ ...c, marker: true });
        continue;
      }
      if (!c.repeated && inner.length === 1 && this.isRoleChild(inner[0]!)) {
        // a wrapper whose name is the role of its only (structured) child: keep the role
        out.push({ ...c, role: inner[0]!.decl });
        continue;
      }
      for (const ic of this.expand(inner)) {
        out.push({
          ...ic,
          repeated: ic.repeated || c.repeated,
          soft: ic.soft || c.soft,
          optional: ic.optional || c.optional,
          wrappers: [c.decl.name, ...ic.wrappers],
        });
      }
    }
    return out;
  }

  // ------------------------------------------------------------- naming

  private codeFor(d: Decl, parentLocal: string | null): string {
    return `landxml.${d.global || parentLocal === null ? snake(d.name) : `${parentLocal}_${snake(d.name)}`}`;
  }

  // ------------------------------------------------------------- emit

  private emit(d: Decl, parentCode: string | null, occ: string): string {
    const code = this.codeFor(d, parentCode ? parentCode.split(".")[1]! : null);
    if (d.global) this.reachableGlobals.add(d.name);
    if (this.entries.has(code) || this.inProgress.has(code)) {
      if (parentCode) this.addParent(code, parentCode, occ);
      return code;
    }
    this.inProgress.add(code);
    if (parentCode) this.addParent(code, parentCode, occ);

    if (this.isSimpleDecl(d)) return this.emitListRows(d, code, parentCode);
    const ct = this.complexOf(d)!;
    const eff = this.effective(ct);
    const baseName = ct.simpleContentBase ?? ct.extendsBase;
    let base: string | undefined;
    if (baseName && !baseName.startsWith("xs:") && this.schema.complexTypes.has(baseName)) {
      base = this.emitAbstract(baseName);
    }
    const ownAttrs = base ? ct.attributes : eff.attrs;
    const fields: Field[] = [];
    const names = new Set<string>();
    const add = (f: Field) => {
      if (names.has(f.name)) throw new Error(`duplicate field ${f.name} in ${code}`);
      names.add(f.name);
      fields.push(f);
    };

    // text content
    if (!base && eff.hasText) add(this.textField(d, eff));

    for (const a of ownAttrs) add(this.attrField(d.name, a, "", false, code));

    // children
    const own = this.effective({ ...ct, simpleContentBase: undefined, extendsBase: undefined });
    const pending: { child: Child }[] = [];
    const children = this.dedupe(this.expand(this.collect(base ? own : eff)));
    if (eff.anyElement || own.anyElement) this.wildcardNotes.add(code);
    if (eff.anyAttr) this.wildcardNotes.add(code);
    for (const c of children) {
      if (c.decl.global) this.reachableGlobals.add(c.decl.name);
      if (c.role) {
        pending.push({ child: c });
        continue;
      }
      if (c.marker) {
        const doc = c.decl.def.doc.length ? shorten(c.decl.def.doc[0]!, 200) : `Empty element ${c.decl.name}`;
        add({
          name: snake(c.decl.name),
          type: "bool",
          default: false,
          meaning: `True when the empty ${c.decl.name} element is present; the element carries no data, only its presence. ${doc}`.replace(/\s+/g, " "),
          source_ref: `XSD ${d.name}/${c.decl.name} (empty element)`,
        });
        continue;
      }
      const cEff = this.effOf(c.decl);
      const simple = this.isSimpleDecl(c.decl);
      const hasKids = cEff ? this.collect(cEff).length > 0 : false;
      const textOnly = cEff ? cEff.attrs.length === 0 && cEff.hasText && !hasKids : false;
      if (simple || textOnly) {
        if (c.repeated) {
          const r = this.simpleOf(c.decl, cEff);
          const f = this.fieldFor(snake(c.decl.name), r, c.decl.def.doc, `${c.decl.name} (element)`, true, c.decl.name, d.name);
          if (r.type === "array") {
            // each occurrence is a separate list (e.g. a gap-separated polyline): one row per occurrence
            pending.push({ child: c });
          } else {
            const scalar = ["text", "int", "bigint", "float", "bool", "date", "timestamp", "length", "angle", "area", "volume", "ratio"];
            const ofType = (scalar.includes(r.type) ? r.type : "text") as NonNullable<Field["of"]>;
            const allowed = r.values ? ` Allowed values: ${r.values.map((v) => v.value).join(", ")}.` : "";
            const g: Field = { ...f, type: "array", of: ofType, meaning: `${f.meaning} Repeated element, stored as an ordered array.${allowed}` };
            delete g.values;
            delete g.ref_to;
            delete g.unit; // a unit is only legal on a plain numeric field; the array's meaning already names it
            add(g);
          }
        } else {
          const r = this.simpleOf(c.decl, cEff);
          const f = this.fieldFor(snake(c.decl.name), r, c.decl.def.doc, `${c.decl.name} (element)`, c.optional || c.min === 0, c.decl.name, d.name);
          add(f);
        }
        continue;
      }
      const compact = cEff ? (cEff.hasText && isPointText(cEff.textType, { schema: this.schema })) || cEff.attrs.length <= INLINE_MAX_ATTRS : false;
      if (cEff && !c.repeated && !hasKids && compact) {
        // R2: inline attribute/text-only single element
        const inl = this.inlineFields(c.decl, cEff, c.optional, d.name, code);
        if (inl.length === 0) this.dropped.push(`${code}: element ${c.decl.name} has no attributes, text or children`);
        for (const f of inl) add(f);
        if (c.soft) this.addSoft(code, c.decl.name);
        continue;
      }
      pending.push({ child: c });
    }

    const meaning = this.typeMeaning(d.def.doc.length ? d.def.doc : ct.doc, d.name);
    const kind: Entry["kind"] = parentCode === null ? "object" : "child";
    const entry: Entry = {
      code,
      name: d.name,
      kind,
      ...(base ? { base } : {}),
      ...(parentCode ? { parent: parentCode } : {}),
      fidelity: "proxy",
      source: this.source(`element ${d.name}`),
      meaning,
      fields,
    };
    this.entries.set(code, entry);
    this.inProgress.delete(code);

    for (const { child: c } of pending) {
      if (c.role) this.emitRole(c, code);
      else this.emit(c.decl, code, this.occText(c));
    }
    return code;
  }

  private inProgress = new Set<string>();

  /** Wrapper element W naming the role of its only child C: type W (base = C's type), no own fields. */
  private emitRole(c: Child, parentCode: string): void {
    const role = c.role!;
    const wrapperCode = this.codeFor(c.decl, parentCode.split(".")[1]!);
    if (role.global) this.reachableGlobals.add(role.name);
    let baseCode = this.codeFor(role, parentCode.split(".")[1]!);
    if (!this.entries.has(baseCode) && !this.inProgress.has(baseCode)) baseCode = this.emit(role, parentCode, "role base");
    if (this.entries.has(wrapperCode)) {
      this.addParent(wrapperCode, parentCode, this.occText(c));
      return;
    }
    const entry: Entry = {
      code: wrapperCode,
      name: c.decl.name,
      kind: "child",
      base: baseCode,
      parent: parentCode,
      fidelity: "proxy",
      source: this.source(`element ${c.decl.name}`),
      meaning: this.typeMeaning(c.decl.def.doc, c.decl.name),
      fields: [],
      notes: `Role wrapper: in the XSD ${c.decl.name} contains exactly one ${role.name}; this type is a ${role.name} playing the role ${c.decl.name} and adds no fields of its own.`,
    };
    this.entries.set(wrapperCode, entry);
    this.addParent(wrapperCode, parentCode, this.occText(c));
  }

  /** A repeated element whose content is a list of numbers: one row per occurrence, holding the list. */
  private emitListRows(d: Decl, code: string, parentCode: string | null): string {
    const r = this.simpleOf(d, undefined);
    const f = this.fieldFor("values", r, d.def.doc, `${d.name} (element text)`, false, d.name, d.name);
    const entry: Entry = {
      code,
      name: d.name,
      kind: "child",
      ...(parentCode ? { parent: parentCode } : {}),
      fidelity: "proxy",
      source: this.source(`element ${d.name}`),
      meaning: this.typeMeaning(d.def.doc, d.name),
      fields: [f],
      notes: "One row per occurrence of the repeated list element; a row boundary is meaningful (for example a gap in a profile), so occurrences are not concatenated.",
    };
    this.entries.set(code, entry);
    this.inProgress.delete(code);
    return code;
  }

  private emitAbstract(typeName: string): string {
    const code = `landxml.${snake(typeName)}`;
    if (this.entries.has(code) || this.inProgress.has(code)) return code;
    this.inProgress.add(code);
    const ct = this.schema.complexTypes.get(typeName)!;
    const eff = this.effective(ct);
    const fields: Field[] = [];
    if (eff.hasText) {
      fields.push(this.textField({ name: typeName, def: { doc: [], min: 1, max: 1, constraints: [] }, global: false }, eff));
    }
    for (const a of eff.attrs) fields.push(this.attrField(typeName, a, "", false, code));
    const entry: Entry = {
      code,
      name: typeName,
      kind: "abstract",
      fidelity: "proxy",
      source: this.source(`complexType ${typeName}`),
      meaning: this.typeMeaning(ct.doc, typeName),
      fields,
      notes: "Named complexType used as the xs:extension base of stored elements; never stored itself.",
    };
    this.entries.set(code, entry);
    this.inProgress.delete(code);
    return code;
  }

  // Feature is the XSD's extension point; emitted once with an owner reference (R5).
  private emitFeature() {
    const d = this.global("Feature");
    const code = "landxml.feature";
    if (this.entries.has(code)) return;
    const ct = this.complexOf(d)!;
    const eff = this.effective(ct);
    const fields: Field[] = [
      {
        name: "owner",
        type: "ref",
        ref_to: "any",
        nullable: true,
        meaning: "The element this Feature is attached to (null for a top-level or nested Feature, see parent_feature).",
        source_ref: "not in the XSD: linkage added because Feature is listed under nearly every element",
      },
      {
        name: "parent_feature",
        type: "ref",
        ref_to: code,
        nullable: true,
        meaning: "The Feature that contains this one when Features are nested.",
        source_ref: "not in the XSD: linkage for nested Feature elements",
      },
    ];
    for (const a of eff.attrs) fields.push(this.attrField("Feature", a, "", false, code));
    const entry: Entry = {
      code,
      name: "Feature",
      kind: "object",
      fidelity: "proxy",
      source: this.source("element Feature"),
      meaning: this.typeMeaning(d.def.doc.length ? d.def.doc : ct.doc, "Feature"),
      fields,
      notes:
        "Generalised (rule R5): the XSD lists Feature as an optional repeated child of nearly every element; it is emitted once here, with owner and parent_feature added as linkage.",
    };
    this.entries.set(code, entry);
    this.reachableGlobals.add("Feature");
    // children of Feature (Property, DocFileRef, ...) are normal child types
    const children = this.dedupe(this.expand(this.collect(eff)));
    const saved = this.entries.get(code)!;
    for (const c of children) {
      const cEff = this.effOf(c.decl);
      if (this.isSimpleDecl(c.decl) || !cEff) continue;
      if (!c.repeated && this.collect(cEff).length === 0 && (cEff.attrs.length <= INLINE_MAX_ATTRS || cEff.hasText)) {
        for (const f of this.inlineFields(c.decl, cEff, c.optional, "Feature", code)) saved.fields.push(f);
        continue;
      }
      this.emit(c.decl, code, this.occText(c));
    }
  }

  // ------------------------------------------------------------- fields

  private simpleOf(d: Decl, eff: Eff | undefined): Resolved {
    const lk = { schema: this.schema };
    if (eff && eff.hasText) {
      if (isPointText(eff.textType, lk)) return { type: "point3", sourceType: eff.textType ?? "Point" };
      return resolveSimple(eff.textType, eff.textInline, lk);
    }
    if (d.def.inlineSimple) {
      const inl = d.def.inlineSimple;
      if (isPointText(inl.base, lk)) {
        return { type: "array", of: "float", sourceType: inl.base ?? "Point", convention: "Space-delimited list of doubles; consecutive values are the coordinates of successive points in the order the schema states." };
      }
      return resolveSimple(undefined, inl, lk);
    }
    return resolveSimple(d.def.type, undefined, lk);
  }

  private textField(d: Decl, eff: Eff): Field {
    const lk = { schema: this.schema };
    const doc = d.def.doc;
    if (isPointText(eff.textType, lk)) {
      return {
        name: "coordinates",
        type: "point3",
        nullable: true,
        meaning:
          "The element's coordinate text \"northing easting [elevation]\" stored as point3 with x = easting (second value), y = northing (first value), z = elevation (null when absent); null when only a pntRef is given. Lengths stay in the file's declared unit.",
        source_ref: `text content (${eff.textType})`,
      };
    }
    const r = resolveSimple(eff.textType, eff.textInline, lk);
    return this.fieldFor("value", r, doc, "text content", false, d.name, d.name);
  }

  private attrField(owner: string, a: AttrDef, prefix: string, forceNullable: boolean, code: string): Field {
    const lk = { schema: this.schema };
    let r: Resolved = resolveSimple(a.type, a.inline, lk);
    const keyrefTarget = this.keyrefs.get(`${owner}@${a.name}`);
    if (keyrefTarget && r.type === "text") {
      r = { type: "ref", ref_to: `landxml.${snake(keyrefTarget)}`, sourceType: a.type ?? "string", convention: `Holds the \`name\` of the referenced ${keyrefTarget} (the schema's xs:keyref).` };
    }
    const f = this.fieldFor(prefix + snake(a.name), r, a.doc, `${owner}/@${a.name}`, forceNullable || a.use !== "required", a.name, owner);
    if (a.default !== undefined) {
      const numeric = ["float", "int", "length", "angle", "area", "volume", "ratio"].includes(f.type);
      const dv = numeric ? Number(a.default) : a.default;
      f.default = dv as Field["default"];
    }
    if (a.fixed !== undefined) f.default = a.fixed;
    return f;
  }

  private inlineFields(d: Decl, eff: Eff, optional: boolean, ownerName: string, ownerCode: string): Field[] {
    const out: Field[] = [];
    const n = snake(d.name);
    if (eff.hasText) {
      const lk = { schema: this.schema };
      if (isPointText(eff.textType, lk)) {
        out.push({
          name: n,
          type: "point3",
          nullable: true,
          meaning: `${this.shortDoc(d.def.doc, `The ${d.name} point`)} Coordinate text \"northing easting [elevation]\" stored with x = easting, y = northing, z = elevation (null when absent or when only ${n}_pnt_ref is given).`,
          source_ref: `${ownerName}/${d.name} text content (${eff.textType})`,
        });
      } else {
        const r = resolveSimple(eff.textType, eff.textInline, lk);
        out.push(this.fieldFor(n, r, d.def.doc, `${ownerName}/${d.name} text content`, true, d.name, ownerName));
      }
    }
    for (const a of eff.attrs) {
      out.push(this.attrField(d.name, a, `${n}_`, optional, ownerCode));
    }
    return out;
  }

  private fieldFor(name: string, r: Resolved, doc: string[], sourceRef: string, nullable: boolean, attrName: string, ownerName: string): Field {
    const base = doc.length ? shorten(doc[0]!, 220) : r.typeDoc ? shorten(r.typeDoc, 220) : `${ownerName} ${attrName}; the XSD gives no description.`;
    const parts = [base.endsWith(".") ? base : base + (/[.!?"]$/.test(base) ? "" : ".")];
    if (r.convention) parts.push(r.convention);
    const red = this.opts.redundant?.[ownerName]?.includes(attrName);
    if (red) {
      parts.push("Redundant in the source: derivable from the geometry, so a claim to verify rather than authority.");
    }
    const f: Field = { name, type: r.type, meaning: parts.join(" ").replace(/\s+/g, " ").trim(), source_ref: `XSD ${sourceRef}; type ${r.sourceType}` };
    if (nullable) f.nullable = true;
    if (r.of) f.of = r.of;
    if (r.ref_to) f.ref_to = r.ref_to;
    if (r.values) f.values = r.values;
    if (r.unit) f.unit = r.unit;
    if (r.check) f.check = r.check;
    return f;
  }

  private shortDoc(doc: string[], fallback: string): string {
    const s = doc.length ? shorten(doc[0]!, 160) : fallback + ".";
    return s.endsWith(".") ? s : s + ".";
  }

  private typeMeaning(doc: string[], name: string): string {
    if (!doc.length) return `LandXML 1.2 \`${name}\`; the XSD gives no description.`;
    return shorten(doc.join(" "), 400);
  }

  private source(section: string): Entry["source"] {
    return {
      document: "LandXML 1.2 XML Schema (LandXML-1.2.xsd)",
      section,
      url: this.opts.sourceUrl,
      version: "1.2 (posted 2008-07-29)",
      accessed_on: this.opts.accessedOn,
      licence: this.opts.licence,
    };
  }

  // ------------------------------------------------------------- bookkeeping

  private occText(c: Child): string {
    // a member of a repeating xs:sequence repeats with the sequence even when its own maxOccurs is 1
    const max = c.max === "unbounded" || (c.repeated && Number(c.max) <= 1) ? "unbounded" : String(c.max);
    const via = c.wrappers.length ? ` via ${c.wrappers.join("/")}` : "";
    return `${c.repeated ? `${c.min}..${max}` : c.soft ? "at most once (XSD: unbounded choice)" : `${c.min}..${max}`}${via}`;
  }

  private addParent(code: string, parentCode: string, occ: string) {
    const m = this.parents.get(code) ?? new Map<string, string>();
    if (!m.has(parentCode)) m.set(parentCode, occ);
    this.parents.set(code, m);
  }

  private addSoft(code: string, name: string) {
    const s = this.softNotes.get(code) ?? new Set<string>();
    s.add(name);
    this.softNotes.set(code, s);
  }

  private indexKeyrefs() {
    const root = this.schema.elements.get("LandXML");
    if (!root) return;
    const last = (xp: string) => xp.split("/").pop()!.replace(/^\.\/\//, "");
    const keys = new Map<string, string>();
    for (const c of root.constraints) if (c.kind === "key") keys.set(c.name, last(c.selector));
    for (const c of root.constraints) {
      if (c.kind !== "keyref" || !c.refer) continue;
      const target = keys.get(c.refer);
      const field = c.fields[0];
      if (!target || !field?.startsWith("@")) continue;
      this.keyrefs.set(`${last(c.selector)}@${field.slice(1)}`, target);
    }
  }

  /**
   * Catalogue format rules 5 and 8: a `child` cannot be a parent and cannot have a `base`, and a type
   * that is a base needs its own table. Every type that contains other types, derives from a base,
   * or is a base becomes an `object` with a `container` reference to its XSD container; only
   * leaves stay `child` rows.
   */
  private normaliseKinds() {
    const derived = new Set<string>();
    for (const e of this.entries.values()) if (e.base) derived.add(e.base);
    for (const [code, e] of [...this.entries]) {
      if (e.kind === "abstract" && !derived.has(code)) {
        this.entries.delete(code);
        this.log.push(`dropped unused abstract type ${code} (nothing derives from it)`);
      }
    }
    const hasKids = new Set<string>();
    for (const e of this.entries.values()) if (e.parent) hasKids.add(e.parent);
    const chainHas = (e: Entry, name: string): boolean => {
      for (let cur: Entry | undefined = e; cur; cur = cur.base ? this.entries.get(cur.base) : undefined) {
        if (cur.fields.some((f) => f.name === name)) return true;
      }
      return false;
    };
    for (const e of this.entries.values()) {
      if (e.kind !== "child") continue;
      if (!(hasKids.has(e.code) || e.base || derived.has(e.code))) continue;
      const former = e.parent!;
      e.kind = "object";
      delete e.parent;
      const why = e.base ? "derives from a base type" : derived.has(e.code) ? "is the base of other types" : "contains other types";
      if (chainHas(e, "container")) {
        e.notes = `${e.notes ?? ""} Stored as an object (${why}); its container is ${former}, recorded by the container reference of its base.`.trim();
        continue;
      }
      e.fields.unshift({
        name: "container",
        type: "ref",
        ref_to: former,
        nullable: true,
        meaning: `The ${former} row that contains this one in the XSD (null for a stand-alone fragment).`,
        source_ref: "not in the XSD: linkage added because this type is stored as an object (it " + why + ")",
      });
      e.notes = `${e.notes ?? ""} Stored as an object rather than an ordered child because it ${why}; the XSD container is the container reference.`.trim();
    }
  }

  private finalise() {
    for (const [code, e] of this.entries) {
      const notes: string[] = [];
      let review: string | undefined;
      const ps = this.parents.get(code);
      if (ps && ps.size) {
        const list = [...ps.entries()];
        notes.push(`Occurs ${list.map(([p, o]) => `${o} in ${p}`).join("; ")}.`);
        const others = list.map(([p]) => p).filter((p) => p !== e.parent && p !== code);
        if (others.length) {
          review = `Contained by more than one type in the XSD (also ${others.join(", ")}); the catalogue allows one parent, so the first is used.`;
        }
        if (list.some(([p]) => p === code)) notes.push("May nest inside itself.");
      }
      const soft = this.softNotes.get(code);
      if (soft?.size) {
        notes.push(`Inlined elements ${[...soft].join(", ")} sit inside an unbounded xs:choice/xs:sequence in the XSD; modelled as at most once each.`);
        review ??= "Occurrence of inlined elements is a modelling judgement (XSD choice is unbounded).";
      }
      if (this.wildcardNotes.has(code)) notes.push("The XSD allows foreign-namespace content here (xs:any/xs:anyAttribute); not modelled.");
      if (e.notes) notes.unshift(e.notes);
      if (notes.length) e.notes = notes.join(" ");
      if (review) {
        e.needs_review = true;
        e.notes = `${e.notes ?? ""} Review: ${review}`.trim();
      }
    }
    this.normaliseKinds();
    // ref_to targets must exist
    const codes = new Set(this.entries.keys());
    for (const e of this.entries.values()) {
      for (const f of e.fields) {
        if (f.type === "ref" && f.ref_to && f.ref_to !== "any" && !codes.has(f.ref_to)) {
          this.log.push(`dangling ref_to ${f.ref_to} in ${e.code}.${f.name}`);
          f.ref_to = "any";
          f.meaning += " The intended target type is not defined in this catalogue, so the reference is untyped.";
          e.needs_review = true;
          e.notes = `${e.notes ?? ""} Review: ${f.name} referenced a type not present in the catalogue.`.trim();
        }
      }
      const v = Entry.safeParse(e);
      if (!v.success) throw new Error(`invalid entry ${e.code}: ${JSON.stringify(v.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })))}`);
    }
  }
}

export function buildCatalogue(schema: Schema, opts: BuildOptions): { entries: Entry[]; log: string[]; unreachable: string[]; dropped: string[] } {
  const b = new Builder(schema, opts);
  const entries = b.build();
  const unreachable = [...schema.elements.keys()].filter((n) => !b.reachableGlobals.has(n));
  return { entries, log: b.log, unreachable, dropped: b.dropped };
}
