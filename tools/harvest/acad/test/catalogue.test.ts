import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { CatType } from "../src/catalogue.ts";
import { normalize } from "../src/normalize.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
const DIR = join(REPO, "catalogue/acad");
const files = readdirSync(DIR).filter((f) => f.endsWith(".yaml")).sort();
const types: CatType[] = files.map((f) => CatType.parse(parse(readFileSync(join(DIR, f), "utf8"))));
const byCode = new Map(types.map((t) => [t.code, t]));

describe("catalogue/acad", () => {
  test("has the expected scale", () => {
    expect(types.length).toBeGreaterThanOrEqual(190);
    expect(types.reduce((a, t) => a + t.fields.length, 0)).toBeGreaterThanOrEqual(1200);
  });

  test("code equals the file name and the schema is acad", () => {
    for (const [i, t] of types.entries()) expect(t.code).toBe(`acad.${files[i]!.replace(/\.yaml$/, "")}`);
  });

  test("every type has meaning, source, licence and access date", () => {
    for (const t of types) {
      expect(t.meaning.length).toBeGreaterThan(0);
      expect(t.source.licence).toMatch(/MIT/);
      expect(String(t.source.accessed_on)).toMatch(/2026-10-23/);
      for (const f of t.fields) expect(f.meaning.length).toBeGreaterThan(0);
    }
  });

  test("base, parent and ref_to point at existing types", () => {
    for (const t of types) {
      if (t.base) expect(byCode.has(t.base), `${t.code} base ${t.base}`).toBe(true);
      if (t.parent) expect(byCode.has(t.parent), `${t.code} parent ${t.parent}`).toBe(true);
      for (const f of t.fields) if (f.type === "ref" && f.ref_to !== "any") expect(byCode.has(f.ref_to!), `${t.code}.${f.name} -> ${f.ref_to}`).toBe(true);
    }
  });

  test("format rules 5 and 9: children have no base, are not nested; no reserved column names", () => {
    const reserved = new Set(["entity_id", "revision_id", "kind", "type_code", "position"]);
    for (const t of types) {
      if (t.kind === "child") {
        expect(t.base, `${t.code} child with base`).toBeUndefined();
        expect(byCode.get(t.parent!)!.kind, `${t.code} nested`).not.toBe("child");
      }
      for (const f of t.fields) expect(reserved.has(f.name), `${t.code}.${f.name}`).toBe(false);
    }
  });

  test("format rule 4: base fields are not repeated", () => {
    for (const t of types) {
      const taken = new Set<string>();
      for (let b = t.base ? byCode.get(t.base) : undefined; b; b = b.base ? byCode.get(b.base) : undefined) for (const f of b.fields) taken.add(f.name);
      for (const f of t.fields) expect(taken.has(f.name), `${t.code}.${f.name}`).toBe(false);
    }
  });

  test("a type with no fields has a base or is abstract", () => {
    for (const t of types) if (t.fields.length === 0) expect(t.base !== undefined || t.kind === "abstract", t.code).toBe(true);
  });

  test("generated Rust names cannot clash (X and X_row)", () => {
    for (const t of types) if (t.code.endsWith("_row")) expect(byCode.has(t.code.slice(0, -4)), t.code).toBe(false);
  });

  test("angles converted from degrees say radians", () => {
    for (const t of types) for (const f of t.fields) if (f.type === "angle" && /degrees/i.test(f.source_ref ?? "")) expect(f.meaning, `${t.code}.${f.name}`).toMatch(/radian/i);
  });

  test("SOURCES.md, GAPS.md and REVIEW.md exist and SOURCES names both projects with pinned commits", () => {
    for (const n of ["SOURCES.md", "GAPS.md", "REVIEW.md"]) expect(existsSync(join(DIR, n))).toBe(true);
    const s = readFileSync(join(DIR, "SOURCES.md"), "utf8");
    expect(s).toContain("ACadSharp");
    expect(s).toContain("ezdxf");
    expect(s).toMatch(/[0-9a-f]{40}/);
    expect(s).toContain("MIT");
  });
});

// The 16 tables that already exist in db/migrations/20261023000005 must be described with the same columns.
describe("pilot tables match migration 20261023000005", () => {
  const sql = readFileSync(join(REPO, "db/migrations/20261023000005_phase1_entity_spine.sql"), "utf8");
  const IMPLICIT = new Set(["entity_id", "revision_id", "kind", "type_code", "position"]);
  const STOP = new Set(["primary", "unique", "foreign", "constraint", "check", "references"]);

  function migrationColumns(): Map<string, Set<string>> {
    const out = new Map<string, Set<string>>();
    for (const m of sql.matchAll(/create table (acad\.\w+) \(([\s\S]*?)\n\);/g)) {
      const cols = new Set<string>();
      for (const part of m[2]!.split(/\n|,(?=\s*"?[a-z_0-9]+"?\s+(?:core\.finite|text|integer|bigint|boolean|uuid)\b)/)) {
        const w = part.trim().match(/^"?([a-z_0-9]+)"?\s+\S/);
        if (w && !STOP.has(w[1]!)) cols.add(w[1]!);
      }
      out.set(m[1]!, cols);
    }
    return out;
  }
  const expand = (t: CatType): Set<string> => {
    const s = new Set<string>();
    for (const f of t.fields) {
      if (f.type === "point3" || f.type === "vector3") for (const a of ["x", "y", "z"]) s.add(`${f.name}_${a}`);
      else if (f.type === "point2") for (const a of ["x", "y"]) s.add(`${f.name}_${a}`);
      else s.add(f.name);
    }
    return s;
  };

  const mig = migrationColumns();
  test("the migration defines 16 acad tables", () => expect(mig.size).toBe(16));
  for (const [code, cols] of migrationColumns()) {
    test(`${code}`, () => {
      const t = byCode.get(code);
      expect(t, `${code} missing from the catalogue`).toBeDefined();
      const want = new Set([...cols].filter((c) => !IMPLICIT.has(c)));
      const have = expand(t!);
      // inherited columns live in the base table (migration repeats none), so compare own columns only
      expect([...have].sort()).toEqual([...want].sort());
    });
  }
});

describe("normalize", () => {
  const src = { document: "d", accessed_on: "2026-10-23", licence: "MIT" };
  const mk = (o: Partial<CatType> & Pick<CatType, "code" | "kind">): CatType => ({ name: o.code, fidelity: "faithful", source: src, meaning: "m", fields: [], ...o });
  const f = (name: string) => ({ name, type: "int" as const, meaning: "m" });

  test("flattens a child base and adds an index for a mixed list", () => {
    const out = normalize([
      mk({ code: "a.h", kind: "entity", fields: [f("x")] }),
      mk({ code: "a.h_path", kind: "child", parent: "a.h", fields: [f("flags")] }),
      mk({ code: "a.h_path_edge", kind: "child", parent: "a.h_path" }),
      mk({ code: "a.h_path_edge_line", kind: "child", parent: "a.h_path", base: "a.h_path_edge", fields: [f("len")] }),
    ]);
    const m = new Map(out.types.map((t) => [t.code, t]));
    expect(m.has("a.h_path_edge")).toBe(false);
    const line = m.get("a.h_path_edge_line")!;
    expect(line.base).toBeUndefined();
    expect(line.parent).toBe("a.h");
    expect(line.fields.map((x) => x.name)).toEqual(["path_index", "edge_index", "len"]);
  });

  test("re-parents a grandchild and records the index", () => {
    const out = normalize([
      mk({ code: "a.m", kind: "entity", fields: [f("x")] }),
      mk({ code: "a.m_vertex", kind: "child", parent: "a.m", fields: [f("v")] }),
      mk({ code: "a.m_vertex_segment", kind: "child", parent: "a.m_vertex", fields: [f("s")] }),
    ]);
    const seg = out.types.find((t) => t.code === "a.m_vertex_segment")!;
    expect(seg.parent).toBe("a.m");
    expect(seg.fields[0]!.name).toBe("vertex_index");
  });

  test("drops repeated base fields, renames reserved ones, drops field-less roots", () => {
    const out = normalize([
      mk({ code: "a.b", kind: "entity", fields: [f("layer")] }),
      mk({ code: "a.c", kind: "entity", base: "a.b", fields: [f("layer"), f("position")] }),
      mk({ code: "a.empty", kind: "object" }),
    ]);
    const c = out.types.find((t) => t.code === "a.c")!;
    expect(c.fields.map((x) => x.name)).toEqual(["dxf_position"]);
    expect(out.types.some((t) => t.code === "a.empty")).toBe(false);
    expect(out.gaps.some((g) => g.type === "a.empty")).toBe(true);
  });

  test("an unreachable ref_to becomes any", () => {
    const out = normalize([
      mk({ code: "a.p", kind: "entity", fields: [f("x")] }),
      mk({ code: "a.p_row", kind: "child", parent: "a.p", fields: [f("y")] }),
      mk({ code: "a.q", kind: "entity", fields: [{ name: "r_id", type: "ref", ref_to: "a.p_row", meaning: "m" }] }),
    ]);
    expect(out.types.find((t) => t.code === "a.q")!.fields[0]!.ref_to).toBe("any");
  });
});

// The authoritative validator lives with the catalogue foundation (issue 38). Run it when it is present.
const validator = join(REPO, "tools/catalogue/src/cli.ts");
describe.skipIf(!existsSync(validator))("catalogue validator (tools/catalogue)", () => {
  test("accepts catalogue/acad", () => {
    const r = Bun.spawnSync(["bun", validator, "validate", DIR], { cwd: join(REPO, "tools/catalogue") });
    expect(r.stderr.toString()).toBe("");
    expect(r.stdout.toString()).toMatch(/^OK: \d+ type/);
  });
});
