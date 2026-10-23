// The catalogue format v0 (see the contract in the task brief) as Zod schemas, plus YAML (de)serialisation.
import { z } from "zod";
import { Document, isMap, isSeq, stringify, visit, parse } from "yaml";

export const SCALARS = ["text", "int", "bigint", "float", "bool", "date", "timestamp"] as const;
export const MEASURES = ["length", "angle", "area", "volume", "ratio"] as const;
export const COMPOSITES = ["point2", "point3", "vector3", "matrix4"] as const;
export const FIELD_TYPES = [...SCALARS, ...MEASURES, ...COMPOSITES, "ref", "enum", "array", "blob"] as const;
export const KINDS = ["entity", "symbol", "object", "child", "abstract"] as const;
export const CHECKS = ["positive", "non_negative", "non_zero", "unit_interval"] as const;

export const Source = z.object({
  document: z.string().min(1),
  section: z.string().optional(),
  url: z.string().optional(),
  version: z.string().optional(),
  accessed_on: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()]),
  licence: z.string().min(1),
});

export const Field = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    type: z.enum(FIELD_TYPES),
    nullable: z.boolean().optional(),
    default: z.union([z.number(), z.string(), z.boolean(), z.array(z.number())]).optional(),
    unit: z.string().optional(),
    meaning: z.string().min(1),
    source_ref: z.string().optional(),
    ref_to: z.string().optional(),
    values: z.array(z.object({ value: z.string(), meaning: z.string() })).optional(),
    of: z.enum([...SCALARS, ...MEASURES]).optional(),
    check: z.enum(CHECKS).optional(),
    maps: z.never().optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.type === "ref" && !f.ref_to) ctx.addIssue({ code: "custom", message: "ref needs ref_to" });
    if (f.type === "enum" && (!f.values || f.values.length === 0)) ctx.addIssue({ code: "custom", message: "enum needs values" });
    if (f.type === "array" && !f.of) ctx.addIssue({ code: "custom", message: "array needs of" });
    if (f.type !== "ref" && f.ref_to) ctx.addIssue({ code: "custom", message: "ref_to only for ref" });
    if (f.type !== "enum" && f.values) ctx.addIssue({ code: "custom", message: "values only for enum" });
    if (f.type !== "array" && f.of) ctx.addIssue({ code: "custom", message: "of only for array" });
  });
export type Field = z.infer<typeof Field>;

export const CatType = z
  .object({
    code: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/),
    name: z.string().min(1),
    kind: z.enum(KINDS),
    base: z.string().optional(),
    parent: z.string().optional(),
    fidelity: z.enum(["faithful", "proxy"]),
    source: Source,
    meaning: z.string().min(1),
    fields: z.array(Field),
    needs_review: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.kind === "child" && !t.parent) ctx.addIssue({ code: "custom", message: "child needs parent" });
    if (t.kind !== "child" && t.parent) ctx.addIssue({ code: "custom", message: "parent only for child" });
    const seen = new Set<string>();
    for (const f of t.fields) {
      if (seen.has(f.name)) ctx.addIssue({ code: "custom", message: `duplicate field ${f.name}` });
      seen.add(f.name);
    }
  });
export type CatType = z.infer<typeof CatType>;

const FIELD_ORDER = ["name", "type", "nullable", "default", "check", "unit", "ref_to", "of", "values", "meaning", "source_ref"];
const KEY_ORDER = ["code", "name", "kind", "base", "parent", "fidelity", "source", "meaning", "needs_review", "notes", "fields"];

export function toYaml(t: CatType): string {
  const ordered: Record<string, unknown> = {};
  for (const k of KEY_ORDER) if ((t as Record<string, unknown>)[k] !== undefined) ordered[k] = (t as Record<string, unknown>)[k];
  ordered.fields = t.fields.map((f) => {
    const o: Record<string, unknown> = {};
    for (const k of FIELD_ORDER) if ((f as Record<string, unknown>)[k] !== undefined) o[k] = (f as Record<string, unknown>)[k];
    return o;
  });
  const doc = new Document(ordered);
  visit(doc, {
    Map(_k, node, path) {
      const parent = path[path.length - 1];
      // one line per field and for the source block; everything else block style
      if (isSeq(parent) && path.length >= 2) node.flow = true;
      const gp = path[path.length - 2];
      if (isMap(gp) && gp.items.some((p) => p.value === node && String((p.key as { value?: unknown }).value) === "source")) node.flow = true;
    },
    Seq(_k, node, path) {
      const parent = path[path.length - 1];
      // numeric default vectors like [0, 0, 1]
      if (isMap(parent) || !parent) {
        if (node.items.every((i) => typeof (i as { value?: unknown }).value === "number")) node.flow = true;
      }
    },
  });
  return stringify(doc, { lineWidth: 0, defaultStringType: "PLAIN", defaultKeyType: "PLAIN" }).replace(/\n*$/, "\n");
}

export function readYaml(text: string): unknown {
  return parse(text);
}
