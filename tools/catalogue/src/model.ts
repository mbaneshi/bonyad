// Loads catalogue YAML and resolves it into a model the emitters share.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { COMPONENTS, TypeSchema, type Field, type TypeDoc } from "./schema.ts";
import { pgIdent } from "./names.ts";

export interface FileProblem {
  file: string;
  reason: string;
}

export interface LoadedDoc {
  file: string;
  doc: TypeDoc;
}

/** Every *.yaml / *.yml under dir, recursively, in sorted order. */
export function listYaml(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function loadDocs(dir: string): { docs: LoadedDoc[]; problems: FileProblem[] } {
  const docs: LoadedDoc[] = [];
  const problems: FileProblem[] = [];
  for (const file of listYaml(dir)) {
    let raw: unknown;
    try {
      raw = parseYaml(readFileSync(file, "utf8"));
    } catch (e) {
      problems.push({ file, reason: `YAML syntax: ${(e as Error).message.split("\n")[0]}` });
      continue;
    }
    const parsed = TypeSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({ file, reason: `${issue.path.join(".") || "(root)"}: ${issue.message}` });
      }
      continue;
    }
    docs.push({ file, doc: parsed.data });
  }
  return { docs, problems };
}

// ---------------------------------------------------------------- resolved model

export interface Column {
  name: string; // SQL column name
  sql: string; // SQL type
  rust: RustKind; // how Rust sees it
  notNull: boolean;
  defaultSql?: string;
  checks: string[]; // already rendered, e.g. "radius > 0"
  refersToEntity: boolean;
  field: Field;
  part?: string; // component suffix for composites
}

export type RustKind =
  | { t: "prim"; row: string; sqlx: string }
  | { t: "enum" }
  | { t: "array"; elem: string };

export interface TypeNode {
  doc: TypeDoc;
  file: string;
  code: string;
  schema: string;
  table: string;
  isChild: boolean;
  hasTable: boolean;
  base?: TypeNode;
  parent?: TypeNode;
  tabledBase?: TypeNode; // nearest ancestor along `base` that has a table
  concrete: boolean;
  discriminator: "kind" | "type_code" | "none";
  typeCodes: string[]; // for type_code tables: every concrete code that may sit here
  columns: Column[];
}

export interface Model {
  schema: string;
  types: TypeNode[]; // dependency order: bases and parents first, ties by code
  byCode: Map<string, TypeNode>;
}

const SCALAR_SQL: Record<string, string> = {
  text: "text",
  int: "integer",
  bigint: "bigint",
  float: "core.finite",
  bool: "boolean",
  date: "date",
  timestamp: "timestamptz",
  length: "core.finite",
  angle: "core.finite",
  area: "core.finite",
  volume: "core.finite",
  ratio: "core.finite",
};
const SCALAR_RUST: Record<string, string> = {
  text: "::std::string::String",
  int: "i32",
  bigint: "i64",
  float: "f64",
  bool: "bool",
  date: "::time::Date",
  timestamp: "::time::OffsetDateTime",
  length: "f64",
  angle: "f64",
  area: "f64",
  volume: "f64",
  ratio: "f64",
};

const AXES: Record<string, string[]> = {
  point2: ["x", "y"],
  point3: ["x", "y", "z"],
  vector3: ["x", "y", "z"],
  matrix4: Array.from({ length: 16 }, (_, i) => `m${Math.floor(i / 4)}${i % 4}`),
};

export function componentParts(type: string): string[] {
  return AXES[type] ?? [];
}

function checkExpr(col: string, f: Field): string[] {
  const c = pgIdent(col);
  const out: string[] = [];
  switch (f.check) {
    case "positive":
      out.push(`${c} > 0`);
      break;
    case "non_negative":
      out.push(`${c} >= 0`);
      break;
    case "non_zero":
      out.push(`${c} <> 0`);
      break;
    case "unit_interval":
      out.push(`${c} between 0 and 1`);
      break;
  }
  if (f.min !== undefined && f.max !== undefined) out.push(`${c} between ${f.min} and ${f.max}`);
  else if (f.min !== undefined) out.push(`${c} >= ${f.min}`);
  else if (f.max !== undefined) out.push(`${c} <= ${f.max}`);
  if (f.min_items !== undefined) out.push(`cardinality(${c}) >= ${f.min_items}`);
  return out;
}

function literal(v: string | number | boolean): string {
  if (typeof v === "string") return `'${v.replaceAll("'", "''")}'`;
  return String(v);
}

function expandField(f: Field): Column[] {
  const base = { notNull: !f.nullable, field: f, refersToEntity: false } as const;
  if (f.type in COMPONENTS) {
    const parts = AXES[f.type] as string[];
    const defs = Array.isArray(f.default) ? f.default : undefined;
    return parts.map((p, i) => {
      const name = `${f.name}_${p}`;
      const col: Column = {
        ...base,
        name,
        sql: "core.finite",
        rust: { t: "prim", row: "f64", sqlx: "f64" },
        checks: checkExpr(name, f),
        part: p,
      };
      if (defs) col.defaultSql = literal(defs[i] as number);
      return col;
    });
  }
  const col: Column = {
    ...base,
    name: f.name,
    sql: "text",
    rust: { t: "prim", row: "::std::string::String", sqlx: "String" },
    checks: checkExpr(f.name, f),
  };
  switch (f.type) {
    case "ref":
      col.sql = "uuid";
      col.rust = { t: "prim", row: "::uuid::Uuid", sqlx: "uuid" };
      col.refersToEntity = true;
      break;
    case "blob":
      col.sql = "bytea";
      col.rust = { t: "prim", row: "::std::vec::Vec<u8>", sqlx: "bytea" };
      break;
    case "enum":
      col.sql = "text";
      col.rust = { t: "enum" };
      col.checks.push(`${pgIdent(f.name)} in (${(f.values ?? []).map((v) => literal(v.value)).join(", ")})`);
      break;
    case "array": {
      const el = f.of as string;
      col.sql = `${SCALAR_SQL[el]}[]`;
      col.rust = { t: "array", elem: SCALAR_RUST[el] as string };
      break;
    }
    default:
      col.sql = SCALAR_SQL[f.type] as string;
      col.rust = { t: "prim", row: SCALAR_RUST[f.type] as string, sqlx: SCALAR_RUST[f.type] as string };
  }
  if (f.default !== undefined && !Array.isArray(f.default)) col.defaultSql = literal(f.default);
  return [col];
}

export interface ResolveResult {
  models: Model[];
  problems: FileProblem[];
}

/** Cross-file checks plus the resolved model, one Model per schema. */
export function resolve(loaded: LoadedDoc[]): ResolveResult {
  const problems: FileProblem[] = [];
  const err = (file: string, reason: string) => problems.push({ file, reason });
  const byCode = new Map<string, TypeNode>();

  for (const { file, doc } of loaded) {
    const [schema, table] = doc.code.split(".") as [string, string];
    const dirs = file.split(sep);
    const wantDir = dirs[dirs.length - 2];
    const stem = basename(file).replace(/\.ya?ml$/, "");
    if (wantDir !== schema || stem !== table) {
      err(file, `code "${doc.code}" does not match the path (expected .../${schema}/${table}.yaml)`);
    }
    if (byCode.has(doc.code)) {
      err(file, `duplicate code "${doc.code}" (also in ${byCode.get(doc.code)?.file})`);
      continue;
    }
    if (`${schema}_${table}_append_only`.length > 63) {
      err(file, `"${schema}_${table}_append_only" would exceed Postgres' 63-byte identifier limit; shorten the table name`);
    }
    byCode.set(doc.code, {
      doc,
      file,
      code: doc.code,
      schema,
      table,
      isChild: doc.kind === "child",
      hasTable: doc.kind !== "abstract" || doc.fields.length > 0,
      concrete: doc.kind !== "abstract",
      discriminator: "none",
      typeCodes: [],
      columns: [],
    });
  }
  const schemasLoaded = new Set([...byCode.values()].map((n) => n.schema));

  // links
  for (const n of byCode.values()) {
    const { doc } = n;
    if (doc.base) {
      const b = byCode.get(doc.base);
      if (!b) err(n.file, `base "${doc.base}" is not in the catalogue`);
      else if (b.schema !== n.schema) err(n.file, `base "${doc.base}" is in another schema; a hierarchy stays inside one source format`);
      else if (b.isChild) err(n.file, `base "${doc.base}" is a child type`);
      else n.base = b;
    }
    if (doc.parent) {
      const p = byCode.get(doc.parent);
      if (!p) err(n.file, `parent "${doc.parent}" is not in the catalogue`);
      else if (p.schema !== n.schema) err(n.file, `parent "${doc.parent}" is in another schema`);
      else if (p.isChild) err(n.file, `parent "${doc.parent}" is itself a child type (nested children are not supported yet)`);
      else if (!p.hasTable) err(n.file, `parent "${doc.parent}" has no table (abstract without fields)`);
      else n.parent = p;
    }
  }
  // cycles
  for (const n of byCode.values()) {
    const seen = new Set<string>([n.code]);
    for (let b = n.base; b; b = b.base) {
      if (seen.has(b.code)) {
        err(n.file, `base chain loops back to "${b.code}"`);
        n.base = undefined;
        break;
      }
      seen.add(b.code);
    }
  }
  // ancestors, field names, tabled base
  const allAncestors = (n: TypeNode): TypeNode[] => {
    const out: TypeNode[] = [];
    for (let b = n.base; b; b = b.base) out.push(b);
    return out;
  };
  for (const n of byCode.values()) {
    for (let b = n.base; b; b = b.base) {
      if (b.hasTable) {
        n.tabledBase = b;
        break;
      }
    }
    const names = new Map<string, string>();
    for (const a of [...allAncestors(n).reverse(), n]) {
      for (const f of a.doc.fields) {
        const prev = names.get(f.name);
        if (prev) err(n.file, `field "${f.name}" in ${a.code} repeats the one in ${prev} (base fields are not repeated in a child type)`);
        else names.set(f.name, a.code);
      }
    }
    for (const f of n.doc.fields) {
      if (f.type === "ref" && f.ref_to && f.ref_to !== "any") {
        const sch = f.ref_to.split(".")[0] as string;
        if (schemasLoaded.has(sch) && !byCode.has(f.ref_to)) err(n.file, `field "${f.name}": ref_to "${f.ref_to}" is not in the catalogue`);
      }
    }
  }
  // discriminators and type-code lists
  const concreteDescendants = (x: TypeNode): string[] =>
    [...byCode.values()].filter((d) => d !== x && d.concrete && allAncestors(d).includes(x)).map((d) => d.code);
  for (const n of byCode.values()) {
    if (!n.hasTable || n.isChild) continue;
    const hasDerived = [...byCode.values()].some((d) => d.hasTable && !d.isChild && d.tabledBase === n);
    if (hasDerived) {
      n.discriminator = "type_code";
      n.typeCodes = [...new Set([...(n.concrete ? [n.code] : []), ...concreteDescendants(n)])].sort();
    } else if (n.concrete) {
      n.discriminator = "kind";
    } else {
      err(n.file, "abstract type has fields but no type derives from it, so it can never be stored");
    }
  }
  // columns
  const RESERVED = new Set(["entity_id", "revision_id", "kind", "type_code"]);
  for (const n of byCode.values()) {
    const taken = new Set<string>();
    for (const f of n.doc.fields) {
      if (RESERVED.has(f.name) || (n.isChild && f.name === "position")) {
        err(n.file, `field name "${f.name}" is reserved for the generated key columns; rename it and say why in notes`);
      }
      for (const c of expandField(f)) {
        if (taken.has(c.name) || RESERVED.has(c.name) || (n.isChild && c.name === "position")) {
          err(n.file, `column "${c.name}" (from field "${f.name}") collides with another column`);
        }
        taken.add(c.name);
        n.columns.push(c);
      }
    }
  }

  // order: bases and parents first, then by code
  const order: TypeNode[] = [];
  const done = new Set<string>();
  const visit = (n: TypeNode, stack: Set<string>) => {
    if (done.has(n.code) || stack.has(n.code)) return;
    stack.add(n.code);
    if (n.base) visit(n.base, stack);
    if (n.parent) visit(n.parent, stack);
    done.add(n.code);
    order.push(n);
  };
  for (const n of [...byCode.values()].sort((a, b) => (a.code < b.code ? -1 : 1))) visit(n, new Set());

  const models: Model[] = [...schemasLoaded].sort().map((schema) => {
    const types = order.filter((n) => n.schema === schema);
    return { schema, types, byCode: new Map(types.map((t) => [t.code, t])) };
  });
  return { models, problems };
}

export function loadModels(dir: string): ResolveResult {
  const { docs, problems } = loadDocs(dir);
  const r = resolve(docs);
  return { models: r.models, problems: [...problems, ...r.problems] };
}

export function rel(root: string, p: string): string {
  return relative(root, p);
}
