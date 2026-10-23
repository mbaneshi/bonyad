// Zod schema for one catalogue entry (contract: catalogue-format.md v0). Every entry is validated before it is written.
import { z } from "zod";

const SCALARS = ["text", "int", "bigint", "float", "bool", "date", "timestamp"] as const;
const MEASURES = ["length", "angle", "area", "volume", "ratio"] as const;
const COMPOSITES = ["point2", "point3", "vector3", "matrix4"] as const;
export const FIELD_TYPES = [...SCALARS, ...MEASURES, ...COMPOSITES, "ref", "enum", "array", "blob"] as const;
export const ELEMENT_TYPES = [...SCALARS, ...MEASURES] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

const code = z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/);
const snakeName = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const Field = z
  .object({
    name: snakeName,
    type: z.enum(FIELD_TYPES),
    nullable: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]).optional(),
    unit: z.string().optional(),
    meaning: z.string().min(1),
    source_ref: z.string().optional(),
    ref_to: z.string().optional(),
    values: z.array(z.object({ value: z.string().min(1), meaning: z.string().min(1) })).optional(),
    of: z.enum(ELEMENT_TYPES).optional(),
    check: z.enum(["positive", "non_negative", "non_zero", "unit_interval"]).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.type === "ref" && !f.ref_to) ctx.addIssue({ code: "custom", message: "ref needs ref_to" });
    if (f.type === "enum" && !(f.values && f.values.length > 0)) ctx.addIssue({ code: "custom", message: "enum needs values" });
    if (f.type === "array" && !f.of) ctx.addIssue({ code: "custom", message: "array needs of" });
  });
export type Field = z.infer<typeof Field>;

export const Source = z
  .object({
    document: z.string().min(1),
    section: z.string().optional(),
    url: z.string().url().optional(),
    version: z.string().optional(),
    accessed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    licence: z.string().min(1),
  })
  .strict();

export const Entry = z
  .object({
    code,
    name: z.string().min(1),
    kind: z.enum(["entity", "symbol", "object", "child", "abstract"]),
    base: code.optional(),
    parent: code.optional(),
    fidelity: z.enum(["faithful", "proxy"]),
    source: Source,
    meaning: z.string().min(1),
    fields: z.array(Field),
    needs_review: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.kind === "child" && !e.parent) ctx.addIssue({ code: "custom", message: "child needs parent" });
    if (e.kind !== "child" && e.parent) ctx.addIssue({ code: "custom", message: "only child has parent" });
    if (e.kind !== "abstract" && e.fields.length === 0 && e.kind === "child") ctx.addIssue({ code: "custom", message: "child without fields" });
  });
export type Entry = z.infer<typeof Entry>;

/** Cross-entry checks: unique codes, resolvable base/parent/ref_to, unique field names across bases, no base cycles. */
export function validateSet(entries: Entry[]): string[] {
  const errs: string[] = [];
  const by = new Map<string, Entry>();
  for (const e of entries) {
    if (by.has(e.code)) errs.push(`duplicate code ${e.code}`);
    by.set(e.code, e);
  }
  for (const e of entries) {
    if (e.base && !by.has(e.base)) errs.push(`${e.code}: unknown base ${e.base}`);
    if (e.parent && !by.has(e.parent)) errs.push(`${e.code}: unknown parent ${e.parent}`);
    const seen = new Set<string>();
    let cur: Entry | undefined = e;
    let guard = 0;
    while (cur && guard++ < 100) {
      for (const f of cur.fields) {
        if (seen.has(f.name)) errs.push(`${e.code}: duplicate field name ${f.name} (via ${cur.code})`);
        seen.add(f.name);
      }
      cur = cur.base ? by.get(cur.base) : undefined;
    }
    if (guard >= 100) errs.push(`${e.code}: base cycle`);
    for (const f of e.fields) if (f.type === "ref" && f.ref_to !== "any" && !by.has(f.ref_to!)) errs.push(`${e.code}.${f.name}: unknown ref_to ${f.ref_to}`);
  }
  return errs;
}
