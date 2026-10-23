// Zod schema for one catalogue entry, following catalogue-format v0 (the contract).
import { z } from "zod";

const code = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, "code must be <schema>.<table>, lowercase [a-z0-9_]");
const snake = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const SCALARS = ["text", "int", "bigint", "float", "bool", "date", "timestamp"] as const;
export const MEASURES = ["length", "angle", "area", "volume", "ratio"] as const;
export const COMPOSITES = ["point2", "point3", "vector3", "matrix4"] as const;
export const OTHERS = ["ref", "enum", "array", "blob"] as const;

export const FieldType = z.enum([...SCALARS, ...MEASURES, ...COMPOSITES, ...OTHERS]);
const ElementType = z.enum([...SCALARS, ...MEASURES]);

export const Field = z
  .object({
    name: snake,
    type: FieldType,
    nullable: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]).optional(),
    unit: z.string().optional(),
    meaning: z.string().min(1),
    source_ref: z.string().optional(),
    ref_to: z.string().optional(),
    values: z.array(z.object({ value: z.string(), meaning: z.string().min(1) }).strict()).optional(),
    of: ElementType.optional(),
    check: z.enum(["positive", "non_negative", "non_zero", "unit_interval"]).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.type === "ref" && !f.ref_to) ctx.addIssue({ code: "custom", message: "ref needs ref_to" });
    if (f.type === "enum" && !(f.values && f.values.length)) ctx.addIssue({ code: "custom", message: "enum needs values" });
    if (f.type === "array" && !f.of) ctx.addIssue({ code: "custom", message: "array needs of" });
  });
export type Field = z.infer<typeof Field>;

export const Entry = z
  .object({
    code,
    name: z.string().min(1),
    kind: z.enum(["entity", "symbol", "object", "child", "abstract"]),
    base: code.optional(),
    parent: code.optional(),
    fidelity: z.enum(["faithful", "proxy"]),
    source: z
      .object({
        document: z.string(),
        section: z.string().optional(),
        url: z.string().optional(),
        version: z.string().optional(),
        accessed_on: z.string(),
        licence: z.string(),
      })
      .strict(),
    meaning: z.string().min(1),
    fields: z.array(Field),
    needs_review: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.kind === "child" && !e.parent) ctx.addIssue({ code: "custom", message: "child needs parent" });
    if (e.kind !== "child" && e.parent) ctx.addIssue({ code: "custom", message: "only child has parent" });
    if (e.kind !== "abstract" && !e.base && e.fields.length === 0) ctx.addIssue({ code: "custom", message: "non-abstract type needs fields" });
    const seen = new Set<string>();
    for (const f of e.fields) {
      if (seen.has(f.name)) ctx.addIssue({ code: "custom", message: `duplicate field ${f.name}` });
      seen.add(f.name);
    }
    if (e.needs_review && !e.notes) ctx.addIssue({ code: "custom", message: "needs_review needs a reason in notes" });
  });
export type Entry = z.infer<typeof Entry>;
