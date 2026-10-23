import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { convertModules, mapType, valueMeanings } from "../src/convert.ts";
import { parseUsda } from "../src/usda.ts";
import { cleanDoc, sentences, snake } from "../src/text.ts";
import { entryToYaml } from "../src/emit.ts";
import { parse } from "yaml";
import { EntrySchema } from "../src/model.ts";

const prov = { repo: "o/r", commit: "a".repeat(40), version: "v", accessedOn: "2026-10-23", licence: "L" };
const layer = parseUsda(readFileSync(new URL("./fixtures/mini.usda", import.meta.url), "utf8"));
const { entries, gaps } = convertModules([{ module: "usdMini", path: "mini.usda", layer }], prov);
const by = (c: string) => entries.find((e) => e.code === c)!;

test("snake and text helpers", () => {
  expect(snake("OpenVDBAsset")).toBe("open_vdb_asset");
  expect(snake("Field3DAsset")).toBe("field3d_asset");
  expect(snake("xformOp:rotateXYZ")).toBe("xform_op_rotate_xyz");
  expect(cleanDoc("a \\em b \\ref X \"c d\" `e`")).toBe("a b c d e");
  expect(sentences("One. Two. Three.", 2, 100)).toBe("One. Two.");
});

test("type mapping follows the brief", () => {
  expect(mapType("double")).toEqual({ shape: "field", type: "float" });
  expect(mapType("int[]")).toEqual({ shape: "field", type: "array", of: "int" });
  expect(mapType("point3f")).toMatchObject({ type: "point3" });
  expect(mapType("point3f[]")).toMatchObject({ shape: "child" });
  expect(mapType("opaque").shape).toBe("skip");
});

test("classes become typed entries with bases and kinds", () => {
  expect(by("usd.shape").kind).toBe("abstract");
  expect(by("usd.ball").kind).toBe("entity");
  expect(by("usd.ball").base).toBe("usd.shape");
  expect(by("usd.tint_api").kind).toBe("object");
  expect(by("usd.tint_api").notes).toContain("Can only be applied to: Ball");
  expect(by("usd.shape").meaning).toBe("An abstract shape. Has a visibility switch.");
});

test("enums carry per-value meanings from the doc bullets", () => {
  const vis = by("usd.shape").fields.find((f) => f.name === "visibility")!;
  expect(vis.type).toBe("enum");
  expect(vis.values![0]).toEqual({ value: "inherited", meaning: "follow the parent" });
  expect(valueMeanings(undefined, ["x"])[0]!.meaning).toContain("no per-value");
});

test("variability, defaults, relationships, children and skips", () => {
  const ball = by("usd.ball");
  const solid = ball.fields.find((f) => f.name === "solid")!;
  expect(solid.default).toBe(false);
  expect(solid.meaning).toContain("Uniform");
  expect(ball.fields.find((f) => f.name === "radius")!.default).toBe(1);
  expect(ball.fields.find((f) => f.name === "limit")!.meaning).toContain("Fallback value is inf");
  expect(ball.fields.some((f) => f.name === "marker")).toBe(false);
  expect(gaps.some((g) => g.what.includes("opaque"))).toBe(true);
  expect(by("usd.shape").fields.find((f) => f.name === "proxy_prim")).toMatchObject({ type: "ref", ref_to: "any" });
  expect(by("usd.ball_centres")).toMatchObject({ kind: "child", parent: "usd.ball" });
  expect(by("usd.shape_extent").needs_review).toBe(true);
  expect(by("usd.ball").fields.find((f) => f.name === "tint")!.type).toBe("vector3");
});

test("every entry validates and round-trips through YAML", () => {
  for (const e of entries) expect(EntrySchema.parse(parse(entryToYaml(e)))).toEqual(e);
});

test("long table names are shortened to fit the append-only limit", async () => {
  const { shortTable, maxTable } = await import("../src/text.ts");
  expect(maxTable("usd")).toBe(47);
  const t = "particle_field_orientation_attribute_api_orientationsh";
  expect(shortTable(t, 47).length).toBeLessThanOrEqual(47);
  expect(shortTable("mesh", 47)).toBe("mesh");
});

test("array attributes of a field-less abstract class are folded in as flat arrays", async () => {
  const { flattenOrphanChildren } = await import("../src/convert.ts");
  const source = { document: "d", accessed_on: "2026-10-23", licence: "L" };
  const abs = { code: "usd.pb", name: "PB", kind: "abstract" as const, fidelity: "proxy" as const, source, meaning: "m", fields: [] };
  const child = {
    code: "usd.pb_points",
    name: "PB.points",
    kind: "child" as const,
    parent: "usd.pb",
    fidelity: "proxy" as const,
    source,
    meaning: "One element of the ordered point3f array points of PB.",
    fields: [{ name: "value", type: "point3" as const, meaning: "v" }],
  };
  const list = [abs, child];
  const gaps: { where: string; what: string }[] = [];
  flattenOrphanChildren(list as never, gaps);
  expect(list.length).toBe(1);
  expect(list[0]!.fields[0]).toMatchObject({ name: "points", type: "array", of: "float" });
  expect(gaps.length).toBe(1);
});

test("sentence splitting leaves i.e. and e.g. alone", () => {
  expect(sentences("A capsule, i.e. a cylinder with caps. Second one.", 1, 200)).toBe("A capsule, i.e. a cylinder with caps.");
  expect(sentences("Use e.g. this. Then that.", 1, 200)).toBe("Use e.g. this.");
});

test("unmarked list bullets give per-value meanings", () => {
  const v = valueMeanings("Modes:\n- alpha: First thing.\n- beta: Second thing.", ["alpha", "beta", "gamma"]);
  expect(v[0]!.meaning).toBe("First thing.");
  expect(v[1]!.meaning).toBe("Second thing.");
  expect(v[2]!.meaning).toContain("no per-value");
});
