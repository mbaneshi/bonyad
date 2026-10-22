import { z } from "zod";
import { asString, asStringList, dictGet, findMeta, type Layer, type Prim, type Property, type Value } from "./usda.ts";
import { EntrySchema, type Entry, type Field } from "./model.ts";
import { cleanDoc, sentences, snake } from "./text.ts";

export const Provenance = z.object({
  repo: z.string(),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  version: z.string(),
  accessedOn: z.string(),
  licence: z.string(),
});
export type Provenance = z.infer<typeof Provenance>;

export interface Gap {
  where: string;
  what: string;
}

export interface ModuleInput {
  module: string; // e.g. usdGeom
  path: string; // repo-relative path of schema.usda
  layer: Layer;
}

type Mapped =
  | { shape: "field"; type: Field["type"]; of?: Field["of"]; note?: string; review?: string }
  | { shape: "child"; field: Pick<Field, "type" | "of">; note?: string; review?: string }
  | { shape: "skip"; why: string };

const SCALARS: Record<string, Field["type"]> = {
  bool: "bool",
  uchar: "int",
  int: "int",
  uint: "int",
  int64: "bigint",
  uint64: "bigint",
  half: "float",
  float: "float",
  double: "float",
  timecode: "float",
  string: "text",
  token: "text",
  asset: "text",
  pathExpression: "text",
};

interface Tuple {
  type: Field["type"];
  of?: Field["of"];
  note?: string;
  review?: string;
}
const QUAT_REVIEW = "component order of the quaternion is not stated in schema.usda";
const TUPLES: Record<string, Tuple> = {
  point3f: { type: "point3" },
  point3d: { type: "point3" },
  point3h: { type: "point3" },
  vector3f: { type: "vector3" },
  vector3d: { type: "vector3" },
  vector3h: { type: "vector3" },
  normal3f: { type: "vector3" },
  normal3d: { type: "vector3" },
  normal3h: { type: "vector3" },
  float3: { type: "vector3" },
  double3: { type: "vector3" },
  half3: { type: "vector3" },
  color3f: { type: "vector3", note: "RGB colour stored as x=r, y=g, z=b" },
  color3d: { type: "vector3", note: "RGB colour stored as x=r, y=g, z=b" },
  color3h: { type: "vector3", note: "RGB colour stored as x=r, y=g, z=b" },
  float2: { type: "point2" },
  double2: { type: "point2" },
  half2: { type: "point2" },
  texCoord2f: { type: "point2" },
  texCoord2d: { type: "point2" },
  texCoord2h: { type: "point2" },
  matrix4d: { type: "matrix4" },
  float4: { type: "array", of: "float", note: "fixed length 4" },
  double4: { type: "array", of: "float", note: "fixed length 4" },
  half4: { type: "array", of: "float", note: "fixed length 4" },
  color4f: { type: "array", of: "float", note: "fixed length 4, RGBA" },
  quatf: { type: "array", of: "float", note: "quaternion, four floats", review: QUAT_REVIEW },
  quath: { type: "array", of: "float", note: "quaternion, four floats", review: QUAT_REVIEW },
  quatd: { type: "array", of: "float", note: "quaternion, four floats", review: QUAT_REVIEW },
  int2: { type: "array", of: "int", note: "fixed length 2" },
  int3: { type: "array", of: "int", note: "fixed length 3" },
  int4: { type: "array", of: "int", note: "fixed length 4" },
};

export function mapType(t: string): Mapped {
  const isArr = t.endsWith("[]");
  const base = isArr ? t.slice(0, -2) : t;
  if (t === "opaque") return { shape: "skip", why: "opaque attributes can never hold a value" };
  if (base in SCALARS) {
    const s = SCALARS[base]!;
    if (isArr) return { shape: "field", type: "array", of: s as Field["of"] };
    return { shape: "field", type: s };
  }
  if (base in TUPLES) {
    const tu = TUPLES[base]!;
    const extra = { ...(tu.note ? { note: tu.note } : {}), ...(tu.review ? { review: tu.review } : {}) };
    if (isArr) {
      const f: Pick<Field, "type" | "of"> = tu.of ? { type: tu.type, of: tu.of } : { type: tu.type };
      return { shape: "child", field: f, ...extra };
    }
    return { shape: "field", type: tu.type, ...(tu.of ? { of: tu.of } : {}), ...extra };
  }
  return { shape: "skip", why: `unmapped USD value type '${t}'` };
}

function defaultFrom(v: Value | undefined, type: string): Field["default"] | undefined {
  if (!v) return undefined;
  const scalar = (x: Value): string | number | boolean | undefined => {
    if (x.t === "num") return x.v;
    if (x.t === "str") return x.v;
    if (x.t === "id") return x.v === "true" ? true : x.v === "false" ? false : undefined;
    return undefined;
  };
  if (v.t === "id" && v.v === "None") return undefined;
  if (v.t === "tuple" || v.t === "list") {
    const items = v.v.map(scalar);
    if (items.some((x) => x === undefined)) return undefined;
    return items as (string | number | boolean)[];
  }
  const s = scalar(v);
  if (s === undefined) return undefined;
  if (type === "bool" && typeof s === "number") return s !== 0;
  return s;
}

export function valueMeanings(doc: string | undefined, tokens: string[]): { value: string; meaning: string }[] {
  const meanings = new Map<string, string>();
  if (doc) {
    const bullet = /^\s*(?:[-*]\s+)?[_`]{1,2}([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)[_`]{1,2}\s*:\s*(.*)$/;
    let cur: string | undefined;
    let buf = "";
    const flush = () => {
      if (cur && !meanings.has(cur)) meanings.set(cur, cleanDoc(buf));
      cur = undefined;
      buf = "";
    };
    for (const line of doc.split("\n")) {
      const m = bullet.exec(line);
      if (m) {
        flush();
        cur = m[1]!;
        buf = m[2]!;
      } else if (cur && line.trim() !== "") buf += " " + line.trim();
      else flush();
    }
    flush();
  }
  return tokens.map((value) => {
    const m = meanings.get(value);
    const text = m ? sentences(m, 1, 220) : undefined;
    return { value, meaning: text ?? `The token "${value}" (the schema gives no per-value description).` };
  });
}

interface ClassInfo {
  prim: Prim;
  module: ModuleInput;
  code: string;
  inherits: string[];
  isApi: boolean;
}

const inheritsOf = (p: Prim): string[] =>
  findMeta(p.meta, "inherits")
    .flatMap((m) => asStringList(m.value))
    .map((s) => s.replace(/^\//, ""));

export function convertModules(modules: ModuleInput[], prov: Provenance): { entries: Entry[]; gaps: Gap[] } {
  const gaps: Gap[] = [];
  const classes = new Map<string, ClassInfo>();
  for (const mod of modules) {
    for (const prim of mod.layer.prims) {
      if (prim.name === "GLOBAL") continue; // library token documentation only
      if (prim.specifier !== "class") {
        gaps.push({ where: `${mod.path}: ${prim.specifier} "${prim.name}"`, what: "non-class prim ignored" });
        continue;
      }
      if (classes.has(prim.name)) throw new Error(`duplicate class name ${prim.name} (${mod.path})`);
      classes.set(prim.name, { prim, module: mod, code: `usd.${snake(prim.name)}`, inherits: inheritsOf(prim), isApi: false });
    }
  }
  const codes = new Set<string>();
  for (const c of classes.values()) {
    if (codes.has(c.code)) throw new Error(`code collision ${c.code}`);
    codes.add(c.code);
  }
  const chainHas = (name: string, target: string, seen = new Set<string>()): boolean => {
    if (name === target) return true;
    if (seen.has(name)) return false;
    seen.add(name);
    const c = classes.get(name);
    return !!c && c.inherits.some((p) => chainHas(p, target, seen));
  };
  for (const c of classes.values()) c.isApi = chainHas(c.prim.name, "APISchemaBase");

  const entries: Entry[] = [];
  const fieldNamesByClass = new Map<string, Set<string>>();
  const allFieldNames = (name: string): Set<string> => {
    const out = new Set<string>();
    const c = classes.get(name);
    if (!c) return out;
    for (const p of c.inherits) for (const n of allFieldNames(p)) out.add(n);
    for (const n of fieldNamesByClass.get(name) ?? []) out.add(n);
    return out;
  };
  const order: string[] = [];
  const visit = (n: string, stack: Set<string>) => {
    if (order.includes(n)) return;
    if (stack.has(n)) throw new Error(`inheritance cycle at ${n}`);
    stack.add(n);
    for (const p of classes.get(n)?.inherits ?? []) if (classes.has(p)) visit(p, stack);
    stack.delete(n);
    order.push(n);
  };
  for (const n of classes.keys()) visit(n, new Set());

  for (const name of order) {
    const c = classes.get(name)!;
    const { prim, module } = c;
    const doc = asString(findMeta(prim.meta, "doc")[0]?.value);
    const cdata = findMeta(prim.meta, "customData")[0]?.value;
    const apiType = asString(dictGet(cdata, "apiSchemaType"));
    const canApply = asStringList(dictGet(cdata, "apiSchemaCanOnlyApplyTo"));
    const nsPrefix = asString(dictGet(cdata, "propertyNamespacePrefix"));
    const builtIn = findMeta(prim.meta, "apiSchemas").flatMap((m) => asStringList(m.value));
    const isTyped = prim.typeName !== undefined;
    const notes: string[] = [`Defined in ${module.path} (module ${module.module}).`];
    const reviews: string[] = [];

    let kind: Entry["kind"];
    if (name === "Typed" || name === "APISchemaBase") kind = "abstract";
    else if (c.isApi) kind = "object";
    else if (isTyped) kind = name === "Material" ? "symbol" : "entity";
    else kind = "abstract";

    if (c.isApi && name !== "APISchemaBase") {
      notes.push(`API schema (${apiType ?? "apiSchemaType not stated"}): it adds properties to an existing prim and is not a prim type of its own.`);
      if (canApply.length) notes.push(`Can only be applied to: ${canApply.join(", ")}.`);
      if (nsPrefix) notes.push(`Properties live under the "${nsPrefix}:" namespace${apiType === "multipleApply" ? ", followed by an instance name" : ""}.`);
      gaps.push({ where: `usd.${snake(name)}`, what: "API schema: which prim it applies to is recorded in notes only; catalogue format v0 has no applied-API relation" });
    }
    if (builtIn.length) notes.push(`Applies built-in API schemas: ${builtIn.join(", ")}.`);
    if (c.inherits.length > 1) {
      notes.push(`Also inherits: ${c.inherits.slice(1).join(", ")}.`);
      reviews.push("multiple inheritance; only the first parent is used as base");
    }
    if (isTyped && prim.typeName !== name) notes.push(`typeName is ${prim.typeName}.`);
    if (/_\d+$/.test(name)) reviews.push("class name ends in _N; it looks like a versioned variant of another schema but the file does not say so");
    if (!doc) reviews.push("class has no doc in schema.usda");
    const meaning = sentences(doc, 2, 380) ?? `USD schema class ${name} (schema.usda carries no description for it).`;

    const fields: Field[] = [];
    const children: Entry[] = [];
    const used = allFieldNames(name);
    const mine = new Set<string>();
    fieldNamesByClass.set(name, mine);
    const sourceFor = (section: string) => ({
      document: `OpenUSD ${module.path}`,
      section,
      url: `https://github.com/${prov.repo}/blob/${prov.commit}/${module.path}`,
      version: prov.version,
      accessed_on: prov.accessedOn,
      licence: prov.licence,
    });
    const inherited = new Set(used);
    const push = (f: Field, prop: Property): void => {
      if (inherited.has(f.name) && !mine.has(f.name)) {
        // a subclass redeclaring a base property overrides its fallback; the base field already exists
        const d = f.default === undefined ? "no fallback value" : `fallback ${JSON.stringify(f.default)}`;
        notes.push(`Redeclares inherited property ${prop.name} (${d}); no new column.`);
        return;
      }
      if (used.has(f.name)) throw new Error(`field name collision ${name}.${f.name} (from ${prop.name})`);
      used.add(f.name);
      mine.add(f.name);
      fields.push(f);
    };

    for (const prop of prim.properties) {
      const pdoc = asString(findMeta(prop.meta, "doc")[0]?.value);
      const allowed = findMeta(prop.meta, "allowedTokens").flatMap((m) => asStringList(m.value));
      const uniform = prop.variability === "uniform";
      const varNote = uniform ? "Uniform: one value, not time-sampled." : "Varying: may carry time samples (animatable).";
      const fname = prop.name === "__INSTANCE_NAME__" ? snake(nsPrefix ?? "instance") : snake(prop.name);
      const srcName = nsPrefix && apiType === "multipleApply" ? `${nsPrefix}:<instanceName>:${prop.name}` : prop.name;
      const short = sentences(pdoc, 1, 230);
      const base = short ?? `Property ${prop.name} (no description in schema.usda).`;
      if (!short) reviews.push(`property ${prop.name} has no doc`);

      if (prop.kind === "relationship") {
        push(
          {
            name: fname,
            type: "ref",
            ref_to: "any",
            nullable: true,
            meaning: `${base} Relationship: targets are prim or property paths and USD allows several.`,
            source_ref: `rel ${srcName}`,
          },
          prop,
        );
        continue;
      }
      const m = mapType(prop.type);
      if (m.shape === "skip") {
        gaps.push({ where: `${module.path}: ${name}.${prop.name}`, what: `skipped: ${m.why}` });
        continue;
      }
      const sref = `${prop.variability === "varying" ? "" : prop.variability + " "}${prop.type} ${srcName}`;
      if (m.shape === "child") {
        const ccode = `usd.${snake(name)}_${snake(prop.name)}`;
        if (codes.has(ccode)) throw new Error(`child code collision ${ccode}`);
        codes.add(ccode);
        const cNotes = ["Array attribute modelled as ordered child rows (format rule 5); element order is the array order."];
        const childEntry: Entry = {
          code: ccode,
          name: `${name}.${prop.name}`,
          kind: "child",
          parent: c.code,
          fidelity: "proxy",
          source: sourceFor(`class ${name}, property ${prop.name}`),
          meaning: `One element of the ordered ${prop.type} array ${prop.name} of ${name}. ${base}`,
          fields: [
            {
              name: "value",
              type: m.field.type,
              ...(m.field.of ? { of: m.field.of } : {}),
              meaning: `Element value (${prop.type.replace("[]", "")})${m.note ? `, ${m.note}` : ""}. ${varNote}`,
              source_ref: sref,
            },
          ],
        };
        if (m.review) {
          childEntry.needs_review = true;
          cNotes.push(`Review: ${m.review}.`);
        }
        if (prop.name === "extent") {
          childEntry.needs_review = true;
          cNotes.push("Review: extent is a cached bounding box derivable from the geometry (format rule 2); kept because the schema defines it as authored data.");
        }
        childEntry.notes = cNotes.join(" ");
        children.push(childEntry);
        continue;
      }
      const dflt = defaultFrom(prop.value, prop.type);
      let f: Field;
      if (m.type === "text" && allowed.length && prop.type === "token") {
        f = { name: fname, type: "enum", values: valueMeanings(pdoc, allowed), meaning: `${base} ${varNote}`, source_ref: sref };
      } else {
        f = {
          name: fname,
          type: m.type,
          ...(m.of ? { of: m.of } : {}),
          meaning: `${base}${m.note ? ` (${m.note})` : ""} ${varNote}`,
          source_ref: sref,
        };
      }
      if (prop.type.startsWith("asset")) f.meaning += " Holds an asset path.";
      if (prop.type === "timecode") f.meaning += " Holds a time code.";
      if (dflt !== undefined) f.default = dflt;
      else f.nullable = true;
      if (prop.value?.t === "id" && /inf|nan/.test(prop.value.v)) {
        f.meaning += ` Fallback value is ${prop.value.v}.`;
        gaps.push({ where: `${module.path}: ${name}.${prop.name}`, what: `fallback ${prop.value.v} cannot be a YAML default; stated in the field meaning only` });
      }
      push(f, prop);
      if (m.review) reviews.push(`${prop.name}: ${m.review}`);
    }

    const baseName = c.inherits[0];
    const entry: Entry = {
      code: c.code,
      name,
      kind,
      ...(baseName && classes.has(baseName) ? { base: classes.get(baseName)!.code } : {}),
      fidelity: "proxy",
      source: sourceFor(`class ${name}`),
      meaning,
      fields,
      ...(reviews.length ? { needs_review: true } : {}),
      notes: notes.join(" ") + (reviews.length ? ` Review: ${reviews.join("; ")}.` : ""),
    };
    entries.push(EntrySchema.parse(entry));
    for (const ch of children) entries.push(EntrySchema.parse(ch));
  }
  return { entries, gaps };
}
