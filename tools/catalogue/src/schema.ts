// Zod schema for one catalogue file (catalogue/FORMAT.md is the prose twin of this file).
import { z } from "zod";

export const SCALARS = ["text", "int", "bigint", "float", "bool", "date", "timestamp"] as const;
export const MEASURES = ["length", "angle", "area", "volume", "ratio"] as const;
export const COMPOSITES = ["point2", "point3", "vector3", "matrix4"] as const;
export const FIELD_TYPES = [...SCALARS, ...MEASURES, ...COMPOSITES, "ref", "enum", "array", "blob"] as const;
export const ELEMENT_TYPES = [...SCALARS, ...MEASURES] as const;
export const CHECKS = ["positive", "non_negative", "non_zero", "unit_interval"] as const;
export const KINDS = ["entity", "symbol", "object", "child", "abstract"] as const;
export const FIDELITIES = ["faithful", "proxy"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];
export type Kind = (typeof KINDS)[number];

export const NUMERIC_TYPES: readonly string[] = ["int", "bigint", "float", ...MEASURES];
export const COMPONENTS: Record<string, number> = { point2: 2, point3: 3, vector3: 3, matrix4: 16 };

const codeRe = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const nameRe = /^[a-z][a-z0-9_]*$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const text = z.string().trim().min(1);

export const SourceSchema = z
  .object({
    document: text,
    section: text.optional(),
    url: z.string().url().optional(),
    version: z.union([text, z.number()]).transform(String).optional(),
    accessed_on: z.string().regex(dateRe, "accessed_on must be YYYY-MM-DD"),
    licence: text,
  })
  .strict();

export const EnumValueSchema = z.object({ value: text, meaning: text }).strict();

const literal = z.union([z.string(), z.number(), z.boolean(), z.array(z.number())]);

export const FieldSchema = z
  .object({
    name: z.string().regex(nameRe, "field name must be snake_case [a-z][a-z0-9_]*").max(50),
    type: z.enum(FIELD_TYPES),
    nullable: z.boolean().optional(),
    default: literal.optional(),
    unit: text.optional(),
    meaning: text,
    source_ref: z.union([text, z.number()]).transform(String).optional(),
    ref_to: z.string().optional(),
    values: z.array(EnumValueSchema).optional(),
    of: z.enum(ELEMENT_TYPES).optional(),
    check: z.enum(CHECKS).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    min_items: z.number().int().min(0).optional(),
    // RESERVED for later cross-format mapping. Must stay empty.
    maps: z.unknown().optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    if (f.maps !== undefined && f.maps !== null) {
      const empty = (Array.isArray(f.maps) && f.maps.length === 0) ||
        (typeof f.maps === "object" && !Array.isArray(f.maps) && Object.keys(f.maps).length === 0);
      if (!empty) bad("`maps` is reserved for later and must stay empty");
    }
    if (f.type === "ref") {
      if (!f.ref_to) bad("type ref needs ref_to (a type code or `any`)");
      else if (f.ref_to !== "any" && !codeRe.test(f.ref_to)) bad(`ref_to "${f.ref_to}" is not a type code or "any"`);
    } else if (f.ref_to !== undefined) bad("ref_to is only for type ref");
    if (f.type === "enum") {
      if (!f.values || f.values.length === 0) bad("type enum needs a non-empty values list");
      else {
        const seen = new Set<string>();
        for (const v of f.values) {
          if (seen.has(v.value)) bad(`duplicate enum value "${v.value}"`);
          seen.add(v.value);
        }
      }
    } else if (f.values !== undefined) bad("values is only for type enum");
    if (f.type === "array") {
      if (!f.of) bad("type array needs `of` (a scalar or measure type)");
    } else if (f.of !== undefined) bad("`of` is only for type array");
    const numeric = NUMERIC_TYPES.includes(f.type) || f.type in COMPONENTS;
    if (f.check !== undefined && !numeric) bad("`check` is only for numeric and composite types");
    if ((f.min !== undefined || f.max !== undefined) && !numeric) bad("`min`/`max` are only for numeric and composite types");
    if (f.check !== undefined && (f.min !== undefined || f.max !== undefined)) bad("use either `check` or `min`/`max`, not both");
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) bad("min is greater than max");
    if (f.min_items !== undefined && f.type !== "array") bad("`min_items` is only for type array");
    if (f.unit !== undefined && !numeric) bad("`unit` is only for numeric types");
    if (f.default !== undefined) {
      const d = f.default;
      const isNum = typeof d === "number" && Number.isFinite(d);
      let ok = false;
      switch (f.type) {
        case "text":
          ok = typeof d === "string";
          break;
        case "date":
          ok = typeof d === "string" && dateRe.test(d);
          break;
        case "timestamp":
          ok = typeof d === "string";
          break;
        case "int":
        case "bigint":
          ok = isNum && Number.isInteger(d);
          break;
        case "float":
        case "length":
        case "angle":
        case "area":
        case "volume":
        case "ratio":
          ok = isNum;
          break;
        case "bool":
          ok = typeof d === "boolean";
          break;
        case "enum":
          ok = typeof d === "string" && (f.values ?? []).some((v) => v.value === d);
          break;
        case "point2":
        case "point3":
        case "vector3":
        case "matrix4":
          ok = Array.isArray(d) && d.length === COMPONENTS[f.type] && d.every((n) => Number.isFinite(n));
          break;
        default:
          ok = false; // ref, array and blob take no default
      }
      if (!ok) bad(`default ${JSON.stringify(d)} does not fit type ${f.type}`);
    }
  });

export const TypeSchema = z
  .object({
    code: z.string().regex(codeRe, "code must be <schema>.<table>, lowercase [a-z0-9_]").max(61),
    name: text,
    kind: z.enum(KINDS),
    base: z.string().regex(codeRe).optional(),
    parent: z.string().regex(codeRe).optional(),
    fidelity: z.enum(FIDELITIES),
    source: SourceSchema,
    meaning: text,
    fields: z.array(FieldSchema),
    needs_review: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    if (t.kind === "child") {
      if (!t.parent) bad("kind child needs `parent`");
      if (t.base) bad("a child type cannot have a `base`");
    } else if (t.parent) bad("`parent` is only for kind child");
    if (t.kind !== "abstract" && t.fields.length === 0 && !t.base) {
      bad("only an abstract type or a type with a `base` may have no fields");
    }
  });

export type Field = z.infer<typeof FieldSchema>;
export type TypeDoc = z.infer<typeof TypeSchema>;
