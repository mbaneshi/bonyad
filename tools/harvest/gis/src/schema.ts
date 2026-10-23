/** Zod model of catalogue format v0 (the contract). A local mirror so this harvest stands alone;
 *  the foundation worker's validator is the authority and must also accept these files. */
import { z } from "zod";

export const SCALARS = ["text", "int", "bigint", "float", "bool", "date", "timestamp"] as const;
export const MEASURES = ["length", "angle", "area", "volume", "ratio"] as const;
export const COMPOSITES = ["point2", "point3", "vector3", "matrix4"] as const;
export const ARRAY_OF = [...SCALARS, ...MEASURES] as const;
export const KINDS = ["entity", "symbol", "object", "child", "abstract"] as const;
export const CHECKS = ["positive", "non_negative", "non_zero", "unit_interval"] as const;
export const FIELD_TYPES = [...SCALARS, ...MEASURES, ...COMPOSITES, "ref", "enum", "array", "blob"] as const;

const snake = /^[a-z][a-z0-9_]*$/;
const typeCode = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const nonEmpty = z.string().trim().min(1);

export const FieldSchema = z
  .object({
    name: z.string().regex(snake),
    type: z.enum(FIELD_TYPES),
    nullable: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]).optional(),
    unit: nonEmpty.optional(),
    meaning: nonEmpty,
    source_ref: nonEmpty.optional(),
    ref_to: nonEmpty.optional(),
    values: z.array(z.object({ value: z.string().min(1), meaning: nonEmpty }).strict()).optional(),
    of: z.enum(ARRAY_OF).optional(),
    check: z.enum(CHECKS).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    min_items: z.number().int().optional(),
    maps: z.never().optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const need = (cond: boolean, msg: string) => cond || ctx.addIssue({ code: "custom", message: `${f.name}: ${msg}` });
    need(f.type !== "ref" || !!f.ref_to, "ref needs ref_to");
    need(f.type === "ref" || !f.ref_to, "ref_to only on ref");
    need(f.type !== "enum" || (!!f.values && f.values.length > 0), "enum needs values");
    need(f.type === "enum" || !f.values, "values only on enum");
    need(f.type !== "array" || !!f.of, "array needs of");
    need(f.type === "array" || !f.of, "of only on array");
    need(!(f.check && (f.min !== undefined || f.max !== undefined)), "check cannot be combined with min/max");
    if (f.ref_to) need(f.ref_to === "any" || typeCode.test(f.ref_to), "ref_to must be a type code or any");
  });

export const SourceSchema = z
  .object({
    document: nonEmpty,
    section: nonEmpty,
    url: nonEmpty.optional(),
    version: nonEmpty.optional(),
    accessed_on: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()]),
    licence: nonEmpty,
  })
  .strict();

export const EntitySchema = z
  .object({
    code: z.string().regex(typeCode),
    name: nonEmpty,
    kind: z.enum(KINDS),
    base: z.string().regex(typeCode).optional(),
    parent: z.string().regex(typeCode).optional(),
    fidelity: z.enum(["faithful", "proxy"]),
    source: SourceSchema,
    meaning: nonEmpty,
    fields: z.array(FieldSchema),
    needs_review: z.boolean().optional(),
    notes: nonEmpty.optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: "custom", message: `${e.code}: ${message}` });
    if (e.kind === "child" && !e.parent) add("child needs parent");
    if (e.kind !== "child" && e.parent) add("parent only on child");
    if (e.kind !== "abstract" && e.fields.length === 0 && !e.base) add("non-abstract type without fields or base");
    if (e.needs_review && !e.notes) add("needs_review requires notes explaining why");
    const seen = new Set<string>();
    for (const f of e.fields) {
      if (seen.has(f.name)) add(`duplicate field ${f.name}`);
      seen.add(f.name);
    }
  });

export type Field = z.infer<typeof FieldSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Source = z.infer<typeof SourceSchema>;
