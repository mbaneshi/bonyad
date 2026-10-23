// Prints counts for a harvested catalogue directory and cross-checks it against the XSD:
// every xs:attribute of every element/complexType that was reached must appear as a field.
// Usage: bun run src/check.ts --xsd <LandXML-1.2.xsd> --dir <catalogue/landxml>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { Entry } from "./schema.ts";
import { parseXsd, type ComplexTypeDef, type ElementDef, type Particle, type Schema } from "./xsd.ts";

export interface Counts {
  types: number;
  byKind: Record<string, number>;
  fields: number;
  byFieldType: Record<string, number>;
  enums: number;
  enumValues: number;
  needsReview: number;
  danglingRefs: string[];
  danglingBases: string[];
  danglingParents: string[];
}

export function loadDir(dir: string): Entry[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => Entry.parse(parse(readFileSync(join(dir, f), "utf8"))));
}

export function count(entries: Entry[]): Counts {
  const codes = new Set(entries.map((e) => e.code));
  const c: Counts = { types: entries.length, byKind: {}, fields: 0, byFieldType: {}, enums: 0, enumValues: 0, needsReview: 0, danglingRefs: [], danglingBases: [], danglingParents: [] };
  for (const e of entries) {
    c.byKind[e.kind] = (c.byKind[e.kind] ?? 0) + 1;
    if (e.needs_review) c.needsReview++;
    if (e.base && !codes.has(e.base)) c.danglingBases.push(`${e.code} -> ${e.base}`);
    if (e.parent && !codes.has(e.parent)) c.danglingParents.push(`${e.code} -> ${e.parent}`);
    for (const f of e.fields) {
      c.fields++;
      c.byFieldType[f.type] = (c.byFieldType[f.type] ?? 0) + 1;
      if (f.type === "enum") {
        c.enums++;
        c.enumValues += f.values?.length ?? 0;
      }
      if (f.type === "ref" && f.ref_to && f.ref_to !== "any" && !codes.has(f.ref_to)) c.danglingRefs.push(`${e.code}.${f.name} -> ${f.ref_to}`);
    }
  }
  return c;
}

/** Attribute owners reached from the root: element names and named complexTypes (incl. bases). */
export function schemaAttributePairs(schema: Schema): Set<string> {
  const pairs = new Set<string>();
  const seenEl = new Set<string>();
  const addCt = (owner: string, ct: ComplexTypeDef) => {
    for (const a of ct.attributes) pairs.add(`${owner}/@${a.name}`);
    const base = ct.simpleContentBase ?? ct.extendsBase;
    if (base && schema.complexTypes.has(base)) {
      // attributes of a named base are owned by that type
      addCt(base, schema.complexTypes.get(base)!);
    }
  };
  const walkParticle = (p: Particle) => {
    for (const i of p.items) {
      if (i.kind === "element") visit(i.el);
      else if (i.kind !== "any") walkParticle(i);
    }
  };
  const visit = (el: ElementDef) => {
    const d = el.ref ? schema.elements.get(el.ref)! : el;
    const key = el.ref ?? `${d.name}#${Math.random()}`;
    if (el.ref) {
      if (seenEl.has(key)) return;
      seenEl.add(key);
    }
    const ct = d.inlineComplex ?? (d.type ? schema.complexTypes.get(d.type) : undefined);
    if (!ct) return;
    const owner = d.name!;
    if (d.type && schema.complexTypes.has(d.type)) {
      // type="PointType": its attributes are reported under the element's own name when inlined,
      // or under the type name as an abstract base; accept either
      for (const a of ct.attributes) pairs.add(`${owner}/@${a.name}`);
      addCt(d.type, ct);
    } else addCt(owner, ct);
    if (ct.particle) walkParticle(ct.particle);
    const base = ct.extendsBase;
    if (base && schema.complexTypes.get(base)?.particle) walkParticle(schema.complexTypes.get(base)!.particle!);
  };
  visit({ ref: "LandXML", doc: [], min: 1, max: 1, constraints: [] });
  return pairs;
}

/** Names of elements (other than the generalised Feature) that no catalogue entry mentions. */
export function unrepresentedElements(schema: Schema, entries: Entry[]): string[] {
  const text = entries.map((e) => [e.name, e.notes ?? "", ...e.fields.map((f) => f.source_ref ?? "")].join("\n")).join("\n");
  const names = new Set<string>();
  const walkP = (p: Particle) => {
    for (const i of p.items) {
      if (i.kind === "element") {
        const n = i.el.ref ?? i.el.name;
        if (n) names.add(n);
        if (!i.el.ref && i.el.inlineComplex?.particle) walkP(i.el.inlineComplex.particle);
      } else if (i.kind !== "any") walkP(i);
    }
  };
  for (const e of schema.elements.values()) if (e.inlineComplex?.particle) walkP(e.inlineComplex.particle);
  for (const ct of schema.complexTypes.values()) if (ct.particle) walkP(ct.particle);
  names.delete("Feature");
  const hit = (n: string) => new RegExp(`(^|[^A-Za-z0-9])${n}([^A-Za-z0-9]|$)`).test(text);
  return [...names].filter((n) => !hit(n)).sort();
}

export function coverage(schema: Schema, entries: Entry[]): { missing: string[]; total: number } {
  const have = new Set<string>();
  for (const e of entries) for (const f of e.fields) {
    const m = /^XSD ([^;]+?);/.exec(f.source_ref ?? "");
    if (m) have.add(m[1]!);
  }
  const want = schemaAttributePairs(schema);
  const missing = [...want].filter((p) => !have.has(p));
  return { missing, total: want.size };
}

if (import.meta.main) {
  const args = z.object({ xsd: z.string(), dir: z.string() }).parse(Object.fromEntries(process.argv.slice(2).reduce<string[][]>((a, v, i, arr) => (i % 2 === 0 ? [...a, [v.replace(/^--/, ""), arr[i + 1] ?? ""]] : a), [])));
  const entries = loadDir(args.dir);
  const c = count(entries);
  console.log(`types: ${c.types}`);
  console.log("by kind:", JSON.stringify(c.byKind));
  console.log(`fields: ${c.fields}`);
  console.log("by field type:", JSON.stringify(c.byFieldType));
  console.log(`enum fields: ${c.enums} (${c.enumValues} values)`);
  console.log(`needs_review: ${c.needsReview}`);
  console.log("dangling refs:", c.danglingRefs.length ? c.danglingRefs : "none");
  console.log("dangling bases:", c.danglingBases.length ? c.danglingBases : "none");
  console.log("dangling parents:", c.danglingParents.length ? c.danglingParents : "none");
  const cov = coverage(parseXsd(readFileSync(args.xsd, "utf8")), entries);
  console.log(`xsd attribute coverage: ${cov.total - cov.missing.length}/${cov.total}`);
  if (cov.missing.length) console.log("not covered:", cov.missing);
  const un = unrepresentedElements(parseXsd(readFileSync(args.xsd, "utf8")), entries);
  console.log(`xsd elements not mentioned by any entry: ${un.length}`, un);
  process.exit(c.danglingRefs.length + c.danglingBases.length + c.danglingParents.length ? 1 : 0);
}
