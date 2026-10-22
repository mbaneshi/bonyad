// Minimal reader for the subset of the .usda text format used by OpenUSD schema.usda files.
// Only syntax is handled here; meaning is assigned in convert.ts.
import { z } from "zod";

export type Value =
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "path"; v: string }
  | { t: "asset"; v: string }
  | { t: "list"; v: Value[] }
  | { t: "tuple"; v: Value[] }
  | { t: "dict"; v: DictEntry[] };

export interface DictEntry {
  type: string;
  key: string;
  value: Value;
}

const ValueSchema: z.ZodType<Value> = z.lazy(() =>
  z.union([
    z.object({ t: z.literal("str"), v: z.string() }),
    z.object({ t: z.literal("num"), v: z.number() }),
    z.object({ t: z.literal("id"), v: z.string() }),
    z.object({ t: z.literal("path"), v: z.string() }),
    z.object({ t: z.literal("asset"), v: z.string() }),
    z.object({ t: z.literal("list"), v: z.array(ValueSchema) }),
    z.object({ t: z.literal("tuple"), v: z.array(ValueSchema) }),
    z.object({
      t: z.literal("dict"),
      v: z.array(z.object({ type: z.string(), key: z.string(), value: ValueSchema })),
    }),
  ]),
);

export const MetaEntrySchema = z.object({
  listOp: z.string().optional(),
  key: z.string(),
  value: ValueSchema,
});
export type MetaEntry = z.infer<typeof MetaEntrySchema>;

export const PropertySchema = z.object({
  kind: z.enum(["attribute", "relationship"]),
  custom: z.boolean(),
  variability: z.enum(["varying", "uniform", "config"]),
  type: z.string(), // "rel" for relationships
  name: z.string(),
  value: ValueSchema.optional(),
  meta: z.array(MetaEntrySchema),
});
export type Property = z.infer<typeof PropertySchema>;

export interface Prim {
  specifier: "def" | "class" | "over";
  typeName?: string;
  name: string;
  meta: MetaEntry[];
  properties: Property[];
  children: Prim[];
}
export const PrimSchema: z.ZodType<Prim> = z.lazy(() =>
  z.object({
    specifier: z.enum(["def", "class", "over"]),
    typeName: z.string().optional(),
    name: z.string(),
    meta: z.array(MetaEntrySchema),
    properties: z.array(PropertySchema),
    children: z.array(PrimSchema),
  }),
);

export const LayerSchema = z.object({
  header: z.array(MetaEntrySchema),
  prims: z.array(PrimSchema),
});
export type Layer = z.infer<typeof LayerSchema>;

type Tok =
  | { k: "str" | "asset" | "path" | "id" | "punct"; v: string }
  | { k: "num"; v: number };

const IDENT = /[A-Za-z_][A-Za-z0-9_:.\-]*(\[\])?/y;
const NUMBER = /[+-]?(?:inf|nan|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;

function unescape(s: string): string {
  return s.replace(/\\(.)/gs, (_m, c: string) =>
    c === "n" ? "\n" : c === "t" ? "\t" : c, // \\ -> \, \" -> ", others keep the char
  );
}

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const triple = src.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      let j = i + q.length;
      let raw = "";
      for (;;) {
        if (j >= n) throw new Error(`unterminated string at offset ${i}`);
        if (src[j] === "\\") {
          raw += src.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (src.startsWith(q, j)) break;
        raw += src[j];
        j++;
      }
      out.push({ k: "str", v: unescape(raw) });
      i = j + q.length;
      continue;
    }
    if (c === "@") {
      const triple = src.startsWith("@@@", i);
      const q = triple ? "@@@" : "@";
      const end = src.indexOf(q, i + q.length);
      if (end < 0) throw new Error(`unterminated asset path at offset ${i}`);
      out.push({ k: "asset", v: src.slice(i + q.length, end) });
      i = end + q.length;
      continue;
    }
    if (c === "<") {
      const end = src.indexOf(">", i);
      if (end < 0) throw new Error(`unterminated path at offset ${i}`);
      out.push({ k: "path", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if ("(){}[]=,;".includes(c)) {
      out.push({ k: "punct", v: c });
      i++;
      continue;
    }
    NUMBER.lastIndex = i;
    const nm = NUMBER.exec(src);
    if (nm && (/[0-9.+\-]/.test(c))) {
      const text = nm[0];
      // Non-finite numbers are kept as identifiers ("inf", "-inf", "nan"): JSON/YAML-safe, and consumers decide.
      if (/inf|nan/.test(text)) out.push({ k: "id", v: text });
      else out.push({ k: "num", v: Number(text) });
      i += text.length;
      continue;
    }
    IDENT.lastIndex = i;
    const im = IDENT.exec(src);
    if (im) {
      out.push({ k: "id", v: im[0] });
      i += im[0].length;
      continue;
    }
    throw new Error(`unexpected character ${JSON.stringify(c)} at offset ${i}`);
  }
  return out;
}

const LIST_OPS = new Set(["prepend", "append", "add", "delete", "reorder"]);
const VARIABILITY = new Set(["uniform", "varying", "config"]);
const SPECIFIERS = new Set(["def", "class", "over"]);

class Parser {
  private p = 0;
  constructor(private readonly toks: Tok[]) {}

  done(): boolean {
    return this.p >= this.toks.length;
  }
  private peek(o = 0): Tok | undefined {
    return this.toks[this.p + o];
  }
  private next(): Tok {
    const t = this.toks[this.p++];
    if (!t) throw new Error("unexpected end of input");
    return t;
  }
  private isPunct(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t?.k === "punct" && t.v === v;
  }
  private expectPunct(v: string): void {
    const t = this.next();
    if (t.k !== "punct" || t.v !== v) throw new Error(`expected '${v}' but found ${JSON.stringify(t)}`);
  }
  private id(): string {
    const t = this.next();
    if (t.k !== "id") throw new Error(`expected identifier but found ${JSON.stringify(t)}`);
    return t.v;
  }

  value(): Value {
    const t = this.next();
    switch (t.k) {
      case "str":
        return { t: "str", v: t.v };
      case "num":
        return { t: "num", v: t.v };
      case "id":
        return { t: "id", v: t.v };
      case "path":
        return { t: "path", v: t.v };
      case "asset":
        return { t: "asset", v: t.v };
      case "punct": {
        if (t.v === "[" || t.v === "(") {
          const close = t.v === "[" ? "]" : ")";
          const items: Value[] = [];
          while (!this.isPunct(close)) {
            items.push(this.value());
            if (this.isPunct(",")) this.next();
          }
          this.next();
          return { t: t.v === "[" ? "list" : "tuple", v: items };
        }
        if (t.v === "{") {
          const entries: DictEntry[] = [];
          while (!this.isPunct("}")) {
            const type = this.id();
            const kt = this.next();
            if (kt.k !== "id" && kt.k !== "str") throw new Error("bad dictionary key");
            this.expectPunct("=");
            entries.push({ type, key: String(kt.v), value: this.value() });
            if (this.isPunct(";")) this.next();
          }
          this.next();
          return { t: "dict", v: entries };
        }
        throw new Error(`unexpected '${t.v}' where a value was expected`);
      }
    }
  }

  // ( "docstring" key = value  prepend key = value ... )
  metadata(): MetaEntry[] {
    this.expectPunct("(");
    const out: MetaEntry[] = [];
    while (!this.isPunct(")")) {
      const t = this.peek();
      if (t?.k === "str") {
        this.next();
        out.push({ key: "doc", value: { t: "str", v: t.v } });
        continue;
      }
      let listOp: string | undefined;
      let key = this.id();
      if (LIST_OPS.has(key) && this.peek()?.k === "id") {
        listOp = key;
        key = this.id();
      }
      this.expectPunct("=");
      const value = this.value();
      out.push(listOp ? { listOp, key, value } : { key, value });
      if (this.isPunct(";")) this.next();
    }
    this.next();
    return out;
  }

  property(): Property {
    let custom = false;
    let variability: Property["variability"] = "varying";
    let t = this.id();
    if (LIST_OPS.has(t)) t = this.id(); // list-op prefix on a property: not used by schema files, tolerated
    if (t === "custom") {
      custom = true;
      t = this.id();
    }
    if (VARIABILITY.has(t)) {
      variability = t as Property["variability"];
      t = this.id();
    }
    const type = t;
    const name = this.id();
    let value: Value | undefined;
    if (this.isPunct("=")) {
      this.next();
      value = this.value();
    }
    const meta = this.isPunct("(") ? this.metadata() : [];
    const prop: Property = {
      kind: type === "rel" ? "relationship" : "attribute",
      custom,
      variability,
      type,
      name,
      meta,
    };
    if (value) prop.value = value;
    return prop;
  }

  prim(): Prim {
    const specifier = this.id() as Prim["specifier"];
    let typeName: string | undefined;
    if (this.peek()?.k === "id") typeName = this.id();
    const nt = this.next();
    if (nt.k !== "str") throw new Error(`expected prim name string, got ${JSON.stringify(nt)}`);
    const meta = this.isPunct("(") ? this.metadata() : [];
    const prim: Prim = { specifier, name: nt.v, meta, properties: [], children: [] };
    if (typeName) prim.typeName = typeName;
    this.expectPunct("{");
    while (!this.isPunct("}")) {
      const t = this.peek();
      if (t?.k === "id" && SPECIFIERS.has(t.v) && this.peek(1)?.k !== "punct" ) {
        prim.children.push(this.prim());
      } else {
        prim.properties.push(this.property());
      }
    }
    this.next();
    return prim;
  }

  layer(): Layer {
    const header = this.isPunct("(") ? this.metadata() : [];
    const prims: Prim[] = [];
    while (!this.done()) prims.push(this.prim());
    return { header, prims };
  }
}

export function parseUsda(src: string): Layer {
  const toks = tokenize(src);
  const layer = new Parser(toks).layer();
  return LayerSchema.parse(layer);
}

// ---- helpers for consumers ----
export function asString(v: Value | undefined): string | undefined {
  return v && (v.t === "str" || v.t === "id") ? v.v : undefined;
}
export function asStringList(v: Value | undefined): string[] {
  if (!v) return [];
  if (v.t === "list" || v.t === "tuple") return v.v.flatMap((x) => (x.t === "str" || x.t === "id" || x.t === "path" ? [x.v] : []));
  return v.t === "str" || v.t === "id" || v.t === "path" ? [v.v] : [];
}
export function findMeta(meta: MetaEntry[], key: string): MetaEntry[] {
  return meta.filter((m) => m.key === key);
}
export function dictGet(v: Value | undefined, key: string): Value | undefined {
  return v?.t === "dict" ? v.v.find((e) => e.key === key)?.value : undefined;
}
