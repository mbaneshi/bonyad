// Minimal, strict reader for the subset of XML Schema that LandXML 1.2 uses.
// Input is untrusted data: it is parsed, never executed.
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export type Max = number | "unbounded";

export interface Documented {
  doc: string[];
}

export interface EnumValue {
  value: string;
  doc: string;
}

export interface SimpleTypeDef extends Documented {
  name?: string;
  /** restriction base (qualified as written, prefix stripped) */
  base?: string;
  enums: EnumValue[];
  /** xs:list itemType, or an inline simple type */
  listItem?: string;
  listInline?: SimpleTypeDef;
  length?: number;
  minLength?: number;
  maxLength?: number;
  minInclusive?: string;
  maxInclusive?: string;
}

export interface AttrDef extends Documented {
  name: string;
  type?: string;
  inline?: SimpleTypeDef;
  use: "required" | "optional" | "prohibited";
  default?: string;
  fixed?: string;
}

export interface ElementDef extends Documented {
  name?: string;
  ref?: string;
  type?: string;
  inlineComplex?: ComplexTypeDef;
  inlineSimple?: SimpleTypeDef;
  min: number;
  max: Max;
  /** identity constraints declared on this element (xs:key, xs:keyref, xs:unique) */
  constraints: Constraint[];
}

export interface Constraint {
  kind: "key" | "keyref" | "unique";
  name: string;
  refer?: string;
  selector: string;
  fields: string[];
}

export type ParticleItem = Particle | { kind: "element"; el: ElementDef } | { kind: "any"; namespace: string };

export interface Particle {
  kind: "sequence" | "choice" | "all";
  min: number;
  max: Max;
  items: ParticleItem[];
}

export interface ComplexTypeDef extends Documented {
  name?: string;
  mixed: boolean;
  attributes: AttrDef[];
  particle?: Particle;
  /** xs:simpleContent extension/restriction base (text content type) */
  simpleContentBase?: string;
  /** xs:complexContent extension base */
  extendsBase?: string;
  anyAttribute: boolean;
}

export interface Schema {
  targetNamespace: string;
  version: string;
  elements: Map<string, ElementDef>;
  complexTypes: Map<string, ComplexTypeDef>;
  simpleTypes: Map<string, SimpleTypeDef>;
}

// ---------------------------------------------------------------- parsing

// fast-xml-parser preserveOrder shape: [{ tag: [children...], ":@": {attrs} }, { "#text": "..." }]
// Zod guards the shape of the parser output at the boundary.
const NodeListSchema = z.array(z.record(z.string(), z.unknown()));

interface Tag {
  name: string;
  attrs: Record<string, string>;
  children: Tag[];
  text: string;
}

function toTags(nodes: unknown): Tag[] {
  const list = NodeListSchema.parse(nodes);
  const out: Tag[] = [];
  for (const node of list) {
    const attrsRaw = (node[":@"] ?? {}) as Record<string, unknown>;
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrsRaw)) attrs[k.replace(/^@_/, "")] = String(v);
    for (const key of Object.keys(node)) {
      if (key === ":@") continue;
      if (key === "#text") {
        out.push({ name: "#text", attrs: {}, children: [], text: String(node[key]) });
        continue;
      }
      if (key.startsWith("?") || key === "#comment") continue;
      const kids = node[key];
      const children = Array.isArray(kids) ? toTags(kids) : [];
      const text = children
        .filter((c) => c.name === "#text")
        .map((c) => c.text)
        .join("");
      out.push({ name: key, attrs, children: children.filter((c) => c.name !== "#text"), text });
    }
  }
  return out;
}

function strip(q: string | undefined): string | undefined {
  if (q === undefined) return undefined;
  const i = q.indexOf(":");
  return i < 0 ? q : q.slice(i + 1);
}

/** Keep "xs:" builtins distinguishable: returns "xs:double" for built-ins, bare name otherwise. */
function qname(q: string | undefined): string | undefined {
  if (q === undefined) return undefined;
  return q.startsWith("xs:") || q.startsWith("xsd:") ? "xs:" + q.slice(q.indexOf(":") + 1) : q;
}

function occurs(attrs: Record<string, string>): { min: number; max: Max } {
  const min = attrs.minOccurs === undefined ? 1 : Number(attrs.minOccurs);
  const max: Max = attrs.maxOccurs === undefined ? 1 : attrs.maxOccurs === "unbounded" ? "unbounded" : Number(attrs.maxOccurs);
  if (!Number.isFinite(min) || (max !== "unbounded" && !Number.isFinite(max))) throw new Error(`bad occurs ${JSON.stringify(attrs)}`);
  return { min, max };
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function docs(tag: Tag): string[] {
  const out: string[] = [];
  for (const ann of tag.children.filter((c) => strip(c.name) === "annotation")) {
    for (const d of ann.children.filter((c) => strip(c.name) === "documentation")) {
      // keep paragraph breaks out; collapse whitespace
      const t = collapse(d.text);
      if (t) out.push(t);
    }
  }
  return out;
}

function parseSimple(tag: Tag, name?: string): SimpleTypeDef {
  const def: SimpleTypeDef = { name, enums: [], doc: docs(tag) };
  for (const c of tag.children) {
    const n = strip(c.name);
    if (n === "restriction") {
      def.base = qname(c.attrs.base);
      for (const r of c.children) {
        const rn = strip(r.name);
        if (rn === "enumeration") def.enums.push({ value: r.attrs.value ?? "", doc: docs(r).join(" ") });
        else if (rn === "length") def.length = Number(r.attrs.value);
        else if (rn === "minLength") def.minLength = Number(r.attrs.value);
        else if (rn === "maxLength") def.maxLength = Number(r.attrs.value);
        else if (rn === "minInclusive") def.minInclusive = r.attrs.value;
        else if (rn === "maxInclusive") def.maxInclusive = r.attrs.value;
        else if (rn === "simpleType") def.listInline = parseSimple(r);
      }
    } else if (n === "list") {
      def.listItem = qname(c.attrs.itemType);
      const inner = c.children.find((x) => strip(x.name) === "simpleType");
      if (inner) def.listInline = parseSimple(inner);
    }
  }
  return def;
}

function parseAttr(tag: Tag): AttrDef {
  const name = tag.attrs.name;
  if (!name) throw new Error("xs:attribute without name (refs/groups are not used by LandXML 1.2)");
  const inner = tag.children.find((c) => strip(c.name) === "simpleType");
  const use = (tag.attrs.use ?? "optional") as AttrDef["use"];
  return {
    name,
    type: qname(tag.attrs.type),
    inline: inner ? parseSimple(inner) : undefined,
    use,
    default: tag.attrs.default,
    fixed: tag.attrs.fixed,
    doc: docs(tag),
  };
}

function parseParticle(tag: Tag): Particle {
  const o = occurs(tag.attrs);
  const items: ParticleItem[] = [];
  for (const c of tag.children) {
    const n = strip(c.name);
    if (n === "element") items.push({ kind: "element", el: parseElement(c) });
    else if (n === "sequence" || n === "choice" || n === "all") items.push(parseParticle(c));
    else if (n === "any") items.push({ kind: "any", namespace: c.attrs.namespace ?? "##any" });
  }
  return { kind: strip(tag.name) as Particle["kind"], min: o.min, max: o.max, items };
}

function parseComplex(tag: Tag, name?: string): ComplexTypeDef {
  const def: ComplexTypeDef = {
    name,
    mixed: tag.attrs.mixed === "true",
    attributes: [],
    anyAttribute: false,
    doc: docs(tag),
  };
  const absorb = (node: Tag) => {
    for (const c of node.children) {
      const n = strip(c.name);
      if (n === "attribute") def.attributes.push(parseAttr(c));
      else if (n === "anyAttribute") def.anyAttribute = true;
      else if (n === "sequence" || n === "choice" || n === "all") def.particle = parseParticle(c);
      else if (n === "simpleContent" || n === "complexContent") {
        const ext = c.children.find((x) => ["extension", "restriction"].includes(strip(x.name) ?? ""));
        if (!ext) continue;
        if (n === "simpleContent") def.simpleContentBase = qname(ext.attrs.base);
        else def.extendsBase = strip(ext.name) === "extension" ? qname(ext.attrs.base) : undefined;
        absorb(ext);
      }
    }
  };
  absorb(tag);
  return def;
}

function parseConstraint(tag: Tag): Constraint {
  const sel = tag.children.find((c) => strip(c.name) === "selector");
  return {
    kind: strip(tag.name) as Constraint["kind"],
    name: tag.attrs.name ?? "",
    refer: tag.attrs.refer,
    selector: sel?.attrs.xpath ?? "",
    fields: tag.children.filter((c) => strip(c.name) === "field").map((c) => c.attrs.xpath ?? ""),
  };
}

function parseElement(tag: Tag): ElementDef {
  const o = occurs(tag.attrs);
  const ct = tag.children.find((c) => strip(c.name) === "complexType");
  const st = tag.children.find((c) => strip(c.name) === "simpleType");
  return {
    name: tag.attrs.name,
    ref: strip(tag.attrs.ref),
    type: qname(tag.attrs.type),
    inlineComplex: ct ? parseComplex(ct) : undefined,
    inlineSimple: st ? parseSimple(st) : undefined,
    min: o.min,
    max: o.max,
    doc: docs(tag),
    constraints: tag.children.filter((c) => ["key", "keyref", "unique"].includes(strip(c.name) ?? "")).map(parseConstraint),
  };
}

export function parseXsd(xml: string): Schema {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
    commentPropName: "#comment",
  });
  const roots = toTags(parser.parse(xml));
  const root = roots.find((t) => strip(t.name) === "schema");
  if (!root) throw new Error("no xs:schema root");
  const schema: Schema = {
    targetNamespace: root.attrs.targetNamespace ?? "",
    version: root.attrs.version ?? "",
    elements: new Map(),
    complexTypes: new Map(),
    simpleTypes: new Map(),
  };
  // Some schema-level xs:annotation blocks sit just before the element they describe; keep them.
  let strayDoc: string[] = [];
  for (const c of root.children) {
    const n = strip(c.name);
    if (n === "annotation") {
      strayDoc = docs({ ...root, children: [c] });
      continue;
    }
    if (n === "element") {
      const e = parseElement(c);
      if (!e.name) throw new Error("global xs:element without name");
      if (e.doc.length === 0 && strayDoc.length) e.doc = strayDoc;
      strayDoc = [];
      schema.elements.set(e.name, e);
    } else if (n === "complexType") {
      strayDoc = [];
      const ct = parseComplex(c, c.attrs.name);
      schema.complexTypes.set(c.attrs.name ?? "", ct);
    } else if (n === "simpleType") {
      schema.simpleTypes.set(c.attrs.name ?? "", parseSimple(c, c.attrs.name));
    }
  }
  return schema;
}
