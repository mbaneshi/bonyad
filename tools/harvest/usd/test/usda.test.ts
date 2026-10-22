import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { asString, dictGet, findMeta, parseUsda, tokenize } from "../src/usda.ts";

const mini = readFileSync(new URL("./fixtures/mini.usda", import.meta.url), "utf8");

test("tokenizer handles comments, triple strings, escapes, paths and non-finite numbers", () => {
  const t = tokenize(`# c\n"a\\\\em" """x "q" y""" </Typed> inf -inf 1e-3 float3[] a:b`);
  expect(t.map((x) => x.v)).toEqual(["a\\em", 'x "q" y', "/Typed", "inf", "-inf", 0.001, "float3[]", "a:b"]);
});

test("parses prims, metadata, nested dictionaries and properties", () => {
  const layer = parseUsda(mini);
  expect(layer.prims.map((p) => p.name)).toEqual(["GLOBAL", "Typed", "APISchemaBase", "Shape", "Ball", "TintAPI"]);
  const ball = layer.prims.find((p) => p.name === "Ball")!;
  expect(ball.typeName).toBe("Ball");
  expect(findMeta(ball.meta, "inherits")[0]!.value).toEqual({ t: "path", v: "/Shape" });
  expect(ball.properties.map((p) => p.name)).toEqual(["radius", "centres", "solid", "limit", "marker", "tint"]);
  const solid = ball.properties.find((p) => p.name === "solid")!;
  expect(solid.variability).toBe("uniform");
  const global = layer.prims[0]!;
  const cd = findMeta(global.meta, "customData")[0]!.value;
  expect(asString(dictGet(cd, "libraryName"))).toBe("usdMini");
  const shape = layer.prims.find((p) => p.name === "Shape")!;
  expect(shape.properties.find((p) => p.name === "proxyPrim")!.kind).toBe("relationship");
  expect(shape.properties[0]!.meta.map((m) => m.key)).toEqual(["allowedTokens", "doc"]);
});

test("rejects malformed input", () => {
  expect(() => parseUsda(`class "A" ( doc = "x" ) {`)).toThrow();
  expect(() => parseUsda(`class "A" ( doc = """x ) { }`)).toThrow();
});
