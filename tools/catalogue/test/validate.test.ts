import { describe, expect, test } from "bun:test";
import { loadModels } from "../src/model.ts";
import { TypeSchema } from "../src/schema.ts";
import { tempCatalogue, typeYaml } from "./helpers.ts";

const reasons = (files: Record<string, string>) => loadModels(tempCatalogue(files)).problems.map((p) => p.reason);

describe("field rules (Zod)", () => {
  const base = {
    code: "s.t",
    name: "T",
    kind: "entity",
    fidelity: "faithful",
    source: { document: "d", accessed_on: "2026-10-23", licence: "l" },
    meaning: "m",
  };
  const parse = (fields: unknown[], extra: object = {}) => TypeSchema.safeParse({ ...base, fields, ...extra });
  const issues = (fields: unknown[], extra: object = {}) => {
    const r = parse(fields, extra);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  test("accepts a valid type", () => {
    expect(parse([{ name: "a", type: "length", meaning: "x", check: "positive", default: 1 }]).success).toBe(true);
  });
  test("rejects unknown keys", () => {
    expect(issues([{ name: "a", type: "int", meaning: "x", colour: 1 }]).join()).toContain("Unrecognized key");
    expect(parse([], { aliases: ["x"] }).success).toBe(false);
  });
  test("ref needs ref_to, enum needs values, array needs of", () => {
    expect(issues([{ name: "a", type: "ref", meaning: "x" }]).join()).toContain("ref_to");
    expect(issues([{ name: "a", type: "enum", meaning: "x" }]).join()).toContain("values");
    expect(issues([{ name: "a", type: "array", meaning: "x" }]).join()).toContain("`of`");
  });
  test("ref_to must be a code or any", () => {
    expect(issues([{ name: "a", type: "ref", ref_to: "Wall", meaning: "x" }]).join()).toContain("ref_to");
    expect(parse([{ name: "a", type: "ref", ref_to: "any", meaning: "x" }]).success).toBe(true);
  });
  test("defaults must fit the type", () => {
    expect(issues([{ name: "a", type: "int", meaning: "x", default: 1.5 }]).join()).toContain("does not fit");
    expect(issues([{ name: "a", type: "point3", meaning: "x", default: [0, 0] }]).join()).toContain("does not fit");
    expect(issues([{ name: "a", type: "enum", meaning: "x", values: [{ value: "p", meaning: "m" }], default: "q" }]).join()).toContain("does not fit");
    expect(parse([{ name: "a", type: "matrix4", meaning: "x", default: Array(16).fill(0) }]).success).toBe(true);
  });
  test("check and min/max exclude each other and only fit numbers", () => {
    expect(issues([{ name: "a", type: "int", meaning: "x", check: "positive", min: 0 }]).join()).toContain("either");
    expect(issues([{ name: "a", type: "text", meaning: "x", check: "positive" }]).join()).toContain("numeric");
    expect(issues([{ name: "a", type: "int", meaning: "x", min: 5, max: 1 }]).join()).toContain("greater than max");
  });
  test("maps is reserved and must stay empty", () => {
    expect(parse([{ name: "a", type: "int", meaning: "x", maps: [] }]).success).toBe(true);
    expect(issues([{ name: "a", type: "int", meaning: "x", maps: [{ to: "ifc.wall" }] }]).join()).toContain("reserved");
  });
  test("child needs parent; a type without fields needs a base or abstract", () => {
    expect(issues([{ name: "a", type: "int", meaning: "x" }], { kind: "child" }).join()).toContain("parent");
    expect(issues([]).join()).toContain("no fields");
    expect(parse([], { kind: "abstract" }).success).toBe(true);
  });
  test("code and field names are snake_case", () => {
    expect(parse([], { code: "S.T", kind: "abstract" }).success).toBe(false);
    expect(parse([{ name: "Bad", type: "int", meaning: "x" }]).success).toBe(false);
  });
  test("meaning is required on types and fields", () => {
    expect(parse([{ name: "a", type: "int" }]).success).toBe(false);
    expect(TypeSchema.safeParse({ ...base, meaning: undefined, fields: [] }).success).toBe(false);
  });
});

describe("directory validation", () => {
  test("a valid catalogue passes", () => {
    expect(
      reasons({
        "s/a.yaml": typeYaml("s.a"),
        "s/b.yaml": typeYaml("s.b", { base: "s.a", fields: ["  - {name: b, type: int, meaning: B}"] }),
      }),
    ).toEqual([]);
  });
  test("reports the file for YAML syntax errors", () => {
    const root = tempCatalogue({ "s/a.yaml": "code: [unclosed" });
    const p = loadModels(root).problems;
    expect(p).toHaveLength(1);
    expect(p[0]?.file.endsWith("s/a.yaml")).toBe(true);
    expect(p[0]?.reason).toContain("YAML syntax");
  });
  test("code must match the path", () => {
    expect(reasons({ "s/a.yaml": typeYaml("s.other") }).join()).toContain("does not match the path");
  });
  test("missing base, missing parent, base in another schema", () => {
    expect(reasons({ "s/a.yaml": typeYaml("s.a", { base: "s.nope" }) }).join()).toContain("not in the catalogue");
    expect(reasons({ "s/a.yaml": typeYaml("s.a", { kind: "child", parent: "s.nope" }) }).join()).toContain("not in the catalogue");
    expect(reasons({ "s/a.yaml": typeYaml("s.a"), "t/b.yaml": typeYaml("t.b", { base: "s.a" }) }).join()).toContain("another schema");
  });
  test("a base chain must not loop", () => {
    const r = reasons({ "s/a.yaml": typeYaml("s.a", { base: "s.b" }), "s/b.yaml": typeYaml("s.b", { base: "s.a" }) });
    expect(r.join()).toContain("loops");
  });
  test("base fields are not repeated", () => {
    const r = reasons({ "s/a.yaml": typeYaml("s.a"), "s/b.yaml": typeYaml("s.b", { base: "s.a" }) });
    expect(r.join()).toContain('field "a"');
  });
  test("generated key names are reserved, and expanded columns must not collide", () => {
    expect(reasons({ "s/a.yaml": typeYaml("s.a", { fields: ["  - {name: kind, type: int, meaning: x}"] }) }).join()).toContain("reserved");
    const r = reasons({
      "s/a.yaml": typeYaml("s.a", { fields: ["  - {name: p, type: point2, meaning: x}", "  - {name: p_x, type: int, meaning: y}"] }),
    });
    expect(r.join()).toContain("collides");
  });
  test("a child's parent must have a table and not be a child", () => {
    expect(
      reasons({
        "s/p.yaml": typeYaml("s.p", { kind: "abstract", fields: [] }),
        "s/c.yaml": typeYaml("s.c", { kind: "child", parent: "s.p" }),
      }).join(),
    ).toContain("has no table");
    expect(
      reasons({
        "s/p.yaml": typeYaml("s.p"),
        "s/c.yaml": typeYaml("s.c", { kind: "child", parent: "s.p" }),
        "s/d.yaml": typeYaml("s.d", { kind: "child", parent: "s.c" }),
      }).join(),
    ).toContain("nested children");
  });
  test("an abstract type with fields needs a descendant", () => {
    expect(reasons({ "s/a.yaml": typeYaml("s.a", { kind: "abstract" }) }).join()).toContain("no type derives");
  });
  test("ref_to must exist when its schema is loaded, and is free otherwise", () => {
    const f = (to: string) => [`  - {name: r, type: ref, ref_to: ${to}, meaning: x}`];
    expect(reasons({ "s/a.yaml": typeYaml("s.a", { fields: f("s.nope") }) }).join()).toContain("ref_to");
    expect(reasons({ "s/a.yaml": typeYaml("s.a", { fields: f("other.thing") }) })).toEqual([]);
    expect(reasons({ "s/a.yaml": typeYaml("s.a", { fields: f("any") }) })).toEqual([]);
  });
  test("duplicate codes are reported", () => {
    // two files cannot share a path, so use a nested directory with the same schema name
    const r = reasons({ "s/a.yaml": typeYaml("s.a"), "x/s/a.yaml": typeYaml("s.a") });
    expect(r.join()).toContain("duplicate code");
  });
});
