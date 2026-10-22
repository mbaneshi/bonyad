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
