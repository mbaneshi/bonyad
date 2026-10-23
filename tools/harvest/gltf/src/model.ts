// The catalogue entry contract (catalogue/FORMAT.md v0), expressed as Zod. Used at every output boundary.
import { z } from "zod";

const SNAKE = /^[a-z][a-z0-9_]*$/;

export const FieldTypeSchema = z.enum([
  "text", "int", "bigint", "float", "bool", "date", "timestamp",
  "length", "angle", "area", "volume", "ratio",
  "point2", "point3", "vector3", "matrix4",
  "ref", "enum", "array", "blob",
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

const ScalarOrMeasure = z.enum([
  "text", "int", "bigint", "float", "bool", "date", "timestamp",
  "length", "angle", "area", "volume", "ratio",
]);

export const FieldSchema = z
  .object({
    name: z.string().regex(SNAKE),
    type: FieldTypeSchema,
    nullable: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.number(), z.string(), z.boolean()]))]).optional(),
    unit: z.string().optional(),
    meaning: z.string().min(1),
    source_ref: z.string().optional(),
    ref_to: z.string().optional(),
    values: z.array(z.object({ value: z.string(), meaning: z.string().min(1) }).strict()).optional(),
    of: ScalarOrMeasure.optional(),
    check: z.enum(["positive", "non_negative", "non_zero", "unit_interval"]).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.type === "ref" && !f.ref_to) ctx.addIssue({ code: "custom", message: `ref field ${f.name} needs ref_to` });
    if (f.type === "enum" && !(f.values && f.values.length)) ctx.addIssue({ code: "custom", message: `enum field ${f.name} needs values` });
    if (f.type === "array" && !f.of) ctx.addIssue({ code: "custom", message: `array field ${f.name} needs of` });
  });
export type Field = z.infer<typeof FieldSchema>;

export const SourceSchema = z
  .object({
    document: z.string().min(1),
    section: z.string().optional(),
    url: z.string().url().optional(),
    version: z.string().optional(),
    accessed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    licence: z.string().min(1),
  })
  .strict();

const CODE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export const EntrySchema = z
  .object({
    code: z.string().regex(CODE),
    name: z.string().min(1),
    kind: z.enum(["entity", "symbol", "object", "child", "abstract"]),
    base: z.string().regex(CODE).optional(),
    parent: z.string().regex(CODE).optional(),
    fidelity: z.enum(["faithful", "proxy"]),
    source: SourceSchema,
    meaning: z.string().min(1),
    fields: z.array(FieldSchema),
    needs_review: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.kind === "child" && !e.parent) ctx.addIssue({ code: "custom", message: `child ${e.code} needs parent` });
    if (e.kind !== "child" && e.parent) ctx.addIssue({ code: "custom", message: `${e.code}: parent only valid on child` });
    const seen = new Set<string>();
    for (const f of e.fields) {
      if (seen.has(f.name)) ctx.addIssue({ code: "custom", message: `${e.code}: duplicate field ${f.name}` });
      seen.add(f.name);
    }
    if (e.needs_review && !e.notes) ctx.addIssue({ code: "custom", message: `${e.code}: needs_review requires notes` });
  });
export type Entry = z.infer<typeof EntrySchema>;
