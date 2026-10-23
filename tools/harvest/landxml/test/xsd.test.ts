import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseXsd } from "../src/xsd.ts";

const s = parseXsd(readFileSync(join(import.meta.dir, "fixtures/mini.xsd"), "utf8"));

test("reads schema header", () => {
  expect(s.targetNamespace).toBe("urn:mini");
  expect(s.version).toBe("9");
});

test("reads elements, complex and simple types", () => {
  expect(s.elements.has("Road")).toBe(true);
  expect(s.complexTypes.has("PointType")).toBe(true);
  expect(s.simpleTypes.get("colour")?.enums.map((e) => e.value)).toEqual(["red", "blue"]);
});

test("reads attributes with use, default and type", () => {
  const metric = s.elements.get("Metric")!.inlineComplex!;
  const lin = metric.attributes.find((a) => a.name === "linearUnit")!;
  expect(lin.use).toBe("required");
  expect(metric.attributes.find((a) => a.name === "angularUnit")!.default).toBe("radians");
});

test("keeps particle structure and occurrences", () => {
  const legs = s.elements.get("Legs")!.inlineComplex!.particle!;
  expect(legs.kind).toBe("sequence");
  const first = legs.items[0]!;
  expect(first.kind === "element" && first.el.max).toBe("unbounded");
});

test("simpleContent extension records its base", () => {
  expect(s.complexTypes.get("PointType")!.simpleContentBase).toBe("Point3dOpt");
});

test("a document without xs:schema is rejected", () => {
  expect(() => parseXsd("<a/>")).toThrow(/no xs:schema/);
});
