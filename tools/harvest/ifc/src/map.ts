// EXPRESS schema -> neutral catalogue entries (contract: catalogue-format.md v0).
import type { EntityDef, Schema, TypeDef, TypeExpr } from "./express.ts";
import { sentences, type DocEntry } from "./docs.ts";
import { Entry, type ElementType, type Field } from "./model.ts";

export interface Provenance {
  schemaFile: string; // url of the EXPRESS file at the pinned commit
  docsBase: string; // url of the docs tree at the pinned commit
  version: string;
  accessedOn: string;
  licence: string;
}

export function snake(s: string): string {
  return s
    .replace(/(\d)D(?=[A-Z]|$)/g, "$1d")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}
export const codeOf = (entity: string) => "ifc." + snake(entity.replace(/^Ifc/, ""));

/** Longest table name the catalogue validator accepts: `ifc_<table>_append_only` must fit 63 bytes. */
export const MAX_TABLE = 47;
/**
 * Deterministic short name for an over-long child table: a readable prefix plus a
 * 6-hex-digit hash of the full name (so two long names can never collide).
 */
export function shortTable(table: string): string {
  if (table.length <= MAX_TABLE) return table;
  const h = new Bun.CryptoHasher("sha1").update(table).digest("hex").slice(0, 6);
  return `${table.slice(0, MAX_TABLE - 7).replace(/_+$/, "")}_${h}`;
}

type Scalar = { k: "scalar"; type: Field["type"]; check?: Field["check"]; via: string; lossy?: string };
type Resolved =
  | Scalar
  | { k: "enum"; typeName: string; values: string[] }
  | { k: "ref"; ref_to: string; via: string; mixed?: boolean }
  | { k: "agg"; agg: string; lo: string; hi: string; unique: boolean; elem: Resolved };

const MEASURE_BY_TYPE: Record<string, { type: Field["type"]; check?: Field["check"] }> = {
  IfcLengthMeasure: { type: "length" },
  IfcPositiveLengthMeasure: { type: "length", check: "positive" },
  IfcNonNegativeLengthMeasure: { type: "length", check: "non_negative" },
  IfcPlaneAngleMeasure: { type: "angle" },
  IfcPositivePlaneAngleMeasure: { type: "angle", check: "positive" },
  IfcAreaMeasure: { type: "area" },
  IfcVolumeMeasure: { type: "volume" },
  IfcRatioMeasure: { type: "ratio" },
  IfcPositiveRatioMeasure: { type: "ratio", check: "positive" },
  IfcNormalisedRatioMeasure: { type: "ratio", check: "unit_interval" },
  IfcPositiveInteger: { type: "int", check: "positive" },
  IfcDate: { type: "date" },
  IfcDateTime: { type: "timestamp" },
  IfcTimeStamp: { type: "timestamp" },
};

/** Narrow, verified WHERE shapes that justify each check. The harvest fails loudly when the source stops matching. */
const CHECK_EVIDENCE: Record<string, RegExp> = {
  IfcPositiveLengthMeasure: />\s*0\.?0?/,
  IfcNonNegativeLengthMeasure: />=\s*0\.?0?/,
  IfcPositivePlaneAngleMeasure: />\s*0\.?0?/,
  IfcPositiveRatioMeasure: />\s*0\.?0?/,
  IfcNormalisedRatioMeasure: /0\.?0?\s*<=|>=\s*0/,
  IfcPositiveInteger: />\s*0/,
};

export interface Stats {
  valueSelectAsText: Set<string>; // "Entity.Attr -> IfcSelect"
  mixedSelectAsAny: Set<string>;
  nestedRefChildren: Set<string>;
}

export class Mapper {
  readonly entries: Entry[] = [];
  readonly stats: Stats = { valueSelectAsText: new Set(), mixedSelectAsAny: new Set(), nestedRefChildren: new Set() };
  readonly gaps = { undocumentedAttrs: [] as string[], undocumentedLiterals: [] as string[], undocumentedEntities: [] as string[], syntheticLabel: [] as string[] };
  private ancestorsCache = new Map<string, string[]>();

  constructor(
    readonly schema: Schema,
    readonly docs: Map<string, DocEntry>,
    readonly prov: Provenance,
  ) {
    for (const [n, check] of Object.entries(CHECK_EVIDENCE)) {
      const t = schema.types.get(n);
      if (!t || !check.test(t.whereText)) throw new Error(`check evidence for ${n} no longer matches the source: ${t?.whereText}`);
    }
  }

  ancestors(name: string): string[] {
    const hit = this.ancestorsCache.get(name);
    if (hit) return hit;
    const out: string[] = [];
    let cur = this.schema.entities.get(name);
    while (cur && cur.subtypeOf[0]) {
      out.push(cur.subtypeOf[0]);
      cur = this.schema.entities.get(cur.subtypeOf[0]);
    }
    this.ancestorsCache.set(name, out);
    return out;
  }

  kindOf(e: EntityDef): Entry["kind"] {
    if (e.abstract) return "abstract";
    const self = [e.name, ...this.ancestors(e.name)];
    const has = (...n: string[]) => n.some((x) => self.includes(x));
    if (has("IfcProduct", "IfcRepresentationItem")) return "entity";
    if (has("IfcTypeObject", "IfcMaterialDefinition", "IfcProfileDef", "IfcPresentationStyle", "IfcPropertySetDefinition", "IfcPropertyTemplateDefinition")) return "symbol";
    return "object";
  }

  private isEntity = (n: string) => this.schema.entities.has(n);

  private lca(names: string[]): string | null {
    if (names.length === 0) return null;
    const chains = names.map((n) => [n, ...this.ancestors(n)]);
    for (const cand of chains[0]!) if (chains.every((c) => c.includes(cand))) return cand;
    return null;
  }

  private selectLeaves(name: string, seen = new Set<string>()): { entities: string[]; values: string[] } {
    const out = { entities: [] as string[], values: [] as string[] };
    if (seen.has(name)) return out;
    seen.add(name);
    const t = this.schema.types.get(name);
    if (!t || t.body.k !== "select") return out;
    for (const m of t.body.members) {
      if (this.isEntity(m)) out.entities.push(m);
      else if (this.schema.types.get(m)?.body.k === "select") {
        const r = this.selectLeaves(m, seen);
        out.entities.push(...r.entities);
        out.values.push(...r.values);
      } else out.values.push(m);
    }
    return out;
  }

  resolve(x: TypeExpr, ctx: string, via = ""): Resolved {
    if (x.k === "simple") {
      const m: Record<string, Field["type"]> = { REAL: "float", NUMBER: "float", INTEGER: "int", BOOLEAN: "bool", LOGICAL: "bool", STRING: "text", BINARY: "blob" };
      return { k: "scalar", type: m[x.name]!, via: via || x.name, lossy: x.name === "LOGICAL" ? "LOGICAL (TRUE, FALSE, UNKNOWN): UNKNOWN is stored as NULL" : undefined };
    }
    if (x.k === "agg") {
      return { k: "agg", agg: x.agg, lo: x.lo, hi: x.hi, unique: x.unique, elem: this.resolve(x.of, ctx, via) };
    }
    if (this.isEntity(x.name)) return { k: "ref", ref_to: codeOf(x.name), via: x.name };
    const t = this.schema.types.get(x.name);
    if (!t) throw new Error(`unknown type ${x.name} in ${ctx}`);
    return this.resolveDef(t, ctx);
  }

  private resolveDef(t: TypeDef, ctx: string): Resolved {
    if (t.body.k === "enum") return { k: "enum", typeName: t.name, values: t.body.values };
    if (t.body.k === "select") {
      const { entities, values } = this.selectLeaves(t.name);
      if (entities.length === 0) {
        this.stats.valueSelectAsText.add(`${ctx} -> ${t.name}`);
        return { k: "scalar", type: "text", via: t.name, lossy: `SELECT ${t.name} of value types, stored as text (the member type tag is not kept)` };
      }
      const common = this.lca(entities);
      if (values.length > 0) {
        this.stats.mixedSelectAsAny.add(`${ctx} -> ${t.name}`);
        return { k: "ref", ref_to: "any", via: t.name, mixed: true };
      }
      return { k: "ref", ref_to: common ? codeOf(common) : "any", via: t.name };
    }
    // alias: defined type = expr. Measure mapping looks at the name first, then the chain.
    const own = MEASURE_BY_TYPE[t.name];
    const inner = this.resolve(t.body.expr, ctx, t.name);
    if (inner.k === "scalar") {
      if (own) return { k: "scalar", type: own.type, check: own.check, via: t.name };
      // inherit a measure from the chain (e.g. IfcLengthMeasure -> ... )
      return { ...inner, via: t.name };
    }
    return inner;
  }

  private typeText(x: TypeExpr): string {
    if (x.k === "simple") return x.name;
    if (x.k === "named") return x.name;
    return `${x.agg} [${x.lo}:${x.hi}] OF ${x.unique ? "UNIQUE " : ""}${this.typeText(x.of)}`;
  }

  private describe(path: string | undefined, fallback: string, n: number, max: number): { text: string; found: boolean } {
    if (path) {
      let t = sentences(path, n, max);
      // a trailing sentence that introduces a list ("may include:") is dropped when an earlier sentence exists
      if (/[:;,]$/.test(t) && t.includes(". ")) t = t.slice(0, t.lastIndexOf(". ") + 1);
      t = t.replace(/\s*[:;,]$/, "");
      if (t) return { text: t.endsWith(".") || t.endsWith("…") ? t : t + ".", found: true };
    }
    return { text: fallback, found: false };
  }

  private source(section: string, docPath: string | undefined): Entry["source"] {
    return {
      document: "buildingSMART IFC4.3 EXPRESS schema (IFC4X3_RC4) with IFC4.3.x-development documentation",
      section,
      url: docPath ? `${this.prov.docsBase}/${docPath}` : this.prov.schemaFile,
      version: this.prov.version,
      accessed_on: this.prov.accessedOn,
      licence: this.prov.licence,
    };
  }

  private enumValues(typeName: string, d: Map<string, string> | undefined): { values: { value: string; meaning: string }[]; undocumented: string[] } {
    const t = this.schema.types.get(typeName)!;
    if (t.body.k !== "enum") throw new Error("not an enum");
    const undocumented: string[] = [];
    const values = t.body.values.map((v) => {
      const m = d?.get(v);
      const s = m ? sentences(m, 1, 220) : "";
      if (!s) {
        undocumented.push(v);
        return { value: v, meaning: `${v} (no description for this literal in the source documentation)` };
      }
      return { value: v, meaning: s.endsWith(".") || s.endsWith("…") ? s : s + "." };
    });
    return { values, undocumented };
  }

  /** Field for a resolved single-column value. Returns null when it needs a child table. */
  private fieldFor(r: Resolved, base: { name: string; nullable: boolean; meaning: string; source_ref: string }, review: string[]): Field | null {
    const f: Field = { name: base.name, type: "text", meaning: base.meaning, source_ref: base.source_ref };
    if (base.nullable) f.nullable = true;
    if (r.k === "scalar") {
      f.type = r.type;
      if (r.check) f.check = r.check;
      if (r.type === "angle") f.meaning += " Radians; converted from the project plane-angle unit at the source boundary.";
      if (r.lossy) {
        f.source_ref += `; ${r.lossy}`;
        if (r.type === "bool" && r.lossy.startsWith("LOGICAL")) f.nullable = true;
      }
      if (r.type === "timestamp" && r.via === "IfcTimeStamp") f.meaning += " Source stores seconds since 1970-01-01; converted at the boundary.";
      return f;
    }
    if (r.k === "ref") {
      f.type = "ref";
      f.ref_to = r.ref_to;
      if (r.mixed) review.push(`${base.name}: select ${r.via} mixes entities and value types; stored as ref to any, value members are not representable in one column`);
      if (codeOf(r.via) !== r.ref_to) f.source_ref += `; via select ${r.via}`;
      return f;
    }
    if (r.k === "enum") {
      f.type = "enum";
      return f; // values filled by caller (needs the docs)
    }
    return null;
  }

  mapEntity(e: EntityDef): void {
    const doc = this.docs.get(e.name);
    const code = codeOf(e.name);
    const review: string[] = [];
    const notes: string[] = [];
    const sum = this.describe(doc?.summary, `${e.name}: no description in the source documentation.`, 2, 360);
    if (!sum.found) {
      review.push(`no description found for ${e.name} in the documentation at the pinned commit`);
      this.gaps.undocumentedEntities.push(e.name);
    }
    const fields: Field[] = [];
    const children: Entry[] = [];
    e.attrs.forEach((a, i) => {
      const at = `${e.name}.${a.name}`;
      const ad = doc?.attrs.get(a.name);
      const desc = this.describe(ad, `${a.name} attribute of ${e.name} (not described in the source documentation).`, 1, 260);
      if (!desc.found) this.gaps.undocumentedAttrs.push(at);
      const sref = `${e.name} attribute ${i + 1}: ${a.optional ? "OPTIONAL " : ""}${this.typeText(a.type)}`;
      const r = this.resolve(a.type, at);
      const base = { name: snake(a.name), nullable: a.optional, meaning: desc.text, source_ref: sref };
      const single = this.fieldFor(r, base, review);
      if (single) {
        if (single.type === "enum" && r.k === "enum") {
          const ev = this.enumValues(r.typeName, this.docs.get(r.typeName)?.items);
          single.values = ev.values;
          single.source_ref += `; enumeration ${r.typeName}`;
          for (const u of ev.undocumented) this.gaps.undocumentedLiterals.push(`${r.typeName}.${u}`);
        }
        fields.push(single);
        return;
      }
      if (r.k !== "agg") throw new Error("unreachable");
      // aggregate
      const ordered = r.agg === "LIST" || r.agg === "ARRAY";
      const elem = r.elem;
      const arrayOf = (x: Resolved): ElementType | null =>
        x.k === "scalar" && (["text", "int", "bigint", "float", "bool", "date", "timestamp", "length", "angle", "area", "volume", "ratio"] as string[]).includes(x.type) ? (x.type as ElementType) : null;
      const elemType = arrayOf(elem);
      if (elemType) {
        const f: Field = { name: base.name, type: "array", of: elemType, meaning: base.meaning + (ordered ? "" : " Unordered set."), source_ref: sref };
        if (a.optional) f.nullable = true;
        if (elem.k === "scalar" && elem.type === "angle") f.meaning += " Radians; converted from the project plane-angle unit at the source boundary.";
        if (elem.k === "scalar" && elem.lossy) f.source_ref += `; elements are ${elem.lossy}`;
        fields.push(f);
        return;
      }
      // child table
      const fullTable = `${code.slice(4)}_${snake(a.name)}`;
      const childCode = "ifc." + shortTable(fullTable);
      const itemBase = { name: "item", nullable: false, meaning: `Element of ${at}.`, source_ref: sref };
      const cReview: string[] = [];
      let item: Field | null = null;
      let childNote = ordered ? "Rows are ordered by list position; the generator must add an ordinal column." : "Unordered set: row order carries no meaning.";
      if (elem.k === "agg") {
        const inner = arrayOf(elem.elem);
        if (inner) {
          item = { name: "item", type: "array", of: inner, meaning: `Inner list (${elem.agg} [${elem.lo}:${elem.hi}]) of ${at}.`, source_ref: sref };
          if (elem.elem.k === "scalar" && elem.elem.lossy) item.source_ref += `; elements are ${elem.elem.lossy}`;
          if (inner === "angle") item.meaning += " Radians; converted from the project plane-angle unit at the source boundary.";
        } else {
          item = this.fieldFor(elem.elem, itemBase, cReview);
          this.stats.nestedRefChildren.add(at);
          cReview.push(`${at} is a list of lists of non-scalar values (a grid); the row/column grouping of the inner list is not representable with a single ordinal`);
          childNote += " The element is a nested list (outer rows, inner entries); the inner grouping needs a second ordinal.";
        }
      } else {
        item = this.fieldFor(elem, itemBase, cReview);
      }
      if (!item) throw new Error(`cannot map ${at}`);
      if (item.type === "enum" && elem.k === "enum") {
        const ev = this.enumValues(elem.typeName, this.docs.get(elem.typeName)?.items);
        item.values = ev.values;
        for (const u of ev.undocumented) this.gaps.undocumentedLiterals.push(`${elem.typeName}.${u}`);
      }
      const c: Entry = {
        code: childCode,
        name: `${e.name}.${a.name}`,
        kind: "child",
        parent: code,
        fidelity: "proxy",
        source: this.source(`${e.name}.${a.name}`, doc?.path),
        meaning: `Rows of the ${a.name} list of ${e.name}. ${desc.text}`.slice(0, 400),
        fields: [item],
        notes: `${childNote} EXPRESS: ${a.optional ? "OPTIONAL " : ""}${this.typeText(a.type)}.${a.optional ? " The whole list is optional: no rows means not provided." : ""}${e.abstract ? " Owned by an abstract type: rows belong to the concrete subtype." : ""}`,
      };
      if (childCode !== `ifc.${fullTable}`) {
        c.notes += ` Table name abbreviated to fit the 63-byte Postgres identifier limit; full name would be ifc.${fullTable}.`;
      }
      if (cReview.length) {
        c.needs_review = true;
        c.notes += " Review: " + cReview.join("; ");
      }
      children.push(c);
    });
    if (e.derived.length) notes.push(`Derived attributes not stored: ${e.derived.join(", ")}.`);
    if (e.derivedRedeclared.length) notes.push(`Inherited attributes redeclared as derived here (always computed, never stored for this type): ${e.derivedRedeclared.join(", ")}.`);
    if (e.inverse.length) notes.push(`Inverse attributes not stored: ${e.inverse.join(", ")}.`);
    if (e.subtypeOf.length > 1) review.push("multiple supertypes");
    if (e.supertypeOf) notes.push(`SUPERTYPE OF ${e.supertypeOf.replace(/\s+/g, " ")}.`);
    const entry: Entry = {
      code,
      name: e.name,
      kind: this.kindOf(e),
      ...(e.subtypeOf[0] ? { base: codeOf(e.subtypeOf[0]) } : {}),
      fidelity: "proxy",
      source: this.source(e.name, doc?.path),
      meaning: sum.text,
      fields,
      ...(review.length ? { needs_review: true } : {}),
      ...(notes.length || review.length ? { notes: [...notes, ...(review.length ? ["Review: " + review.join("; ") + "."] : [])].join(" ") } : {}),
    };
    this.entries.push(entry, ...children);
  }

  /**
   * Containers whose only data is a child list (IfcMaterialList, IfcUnitAssignment...) and abstract
   * owners without columns have no table. Abstract: hang the child on the nearest ancestor that has
   * a table. Otherwise (no ancestor, or a concrete type): add one synthetic nullable `synthetic_label` column.
   */
  private fixTablelessOwners(): void {
    const by = new Map(this.entries.map((x) => [x.code, x]));
    const addLabel = (o: Entry) => {
      if (o.fields.length > 0) return;
      o.fields.push({
        name: "synthetic_label",
        type: "text",
        nullable: true,
        meaning: "Synthetic column, not in IFC: free label for this container row. IFC identifies it only by instance identity.",
        source_ref: "synthetic; added by the harvester so the type has a table to own its child list",
      });
      o.needs_review = true;
      o.notes = `${o.notes ? o.notes + " " : ""}Review: the type has no EXPRESS attribute that maps to a column (only a child list), so a synthetic nullable synthetic_label column was added.`;
      this.gaps.syntheticLabel.push(o.name);
    };
    for (const c of this.entries) {
      if (c.kind !== "child" || !c.parent) continue;
      const owner = by.get(c.parent)!;
      if (owner.fields.length > 0 || (owner.kind !== "abstract" && owner.base)) continue; // has a table already
      let anc: Entry | undefined = owner;
      while (anc && anc.kind === "abstract" && anc.fields.length === 0) anc = anc.base ? by.get(anc.base) : undefined;
      if (owner.kind === "abstract" && anc) {
        c.parent = anc.code;
        c.notes += ` Declared on abstract ${owner.name}, which has no table; attached to the nearest ancestor with a table, ${anc.name}.`;
      } else addLabel(owner);
    }
    for (const x of this.entries) if (x.kind !== "abstract" && x.kind !== "child" && x.fields.length === 0 && !x.base) addLabel(x);
  }

  run(): Entry[] {
    for (const e of this.schema.entities.values()) this.mapEntity(e);
    this.fixTablelessOwners();
    return this.entries.map((x) => Entry.parse(x));
  }
}
