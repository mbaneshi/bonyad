import { expect, test } from "bun:test";
import { conform, maxTable, shortTable, type GapLike } from "../src/conform.ts";
import { snake, singular, firstSentences } from "../src/convert.ts";
import { checkDir } from "../src/check.ts";
import type { Entry, Field } from "../src/model.ts";

const source = { document: "d", accessed_on: "2026-10-23", licence: "L" };
const mk = (code: string, kind: Entry["kind"], fields: Field[], extra: Partial<Entry> = {}): Entry => ({
  code,
  name: code,
  kind,
  fidelity: "proxy",
  source,
  meaning: "m",
  fields,
  ...extra,
});
const f = (name: string, extra: Partial<Field> = {}): Field => ({ name, type: "text", meaning: "m", ...extra });

test("naming helpers", () => {
  expect(snake("bufferView")).toBe("buffer_view");
  expect(snake("glTFid")).toBe("gltf_id");
  expect(singular("children")).toBe("child");
  expect(firstSentences("One. Two. Three.", 2, 100)).toBe("One. Two.");
});

test("table names are shortened to fit the append-only name limit", () => {
  expect(maxTable("gltf")).toBe(46);
  const long = "mesh_primitive_khr_draco_mesh_compression_attribute";
  const s = shortTable(long, 46);
  expect(s.length).toBeLessThanOrEqual(46);
  expect(shortTable("node", 46)).toBe("node");
  expect(shortTable(long, 46)).toBe(s); // deterministic
});

test("array defaults move into the text, children lose their base, nested owners are promoted, empties go", () => {
  const gaps: GapLike[] = [];
  const out = conform(
    [
      mk("gltf.prop", "abstract", []),
      mk("gltf.extras", "object", []),
      mk("gltf.mesh", "entity", [f("name")], { base: "gltf.prop" }),
      mk("gltf.primitive", "child", [f("mode"), f("colour", { type: "array", of: "float", default: [1, 1, 1, 1] as unknown as number[] })], { parent: "gltf.mesh", base: "gltf.prop" }),
      mk("gltf.primitive_attr", "child", [f("key")], { parent: "gltf.primitive" }),
    ],
    gaps,
  );
  const by = (c: string) => out.find((e) => e.code === c)!;
  expect(by("gltf.extras")).toBeUndefined();
  expect(gaps.some((g) => g.where === "gltf.extras")).toBe(true);
  const prim = by("gltf.primitive");
  expect(prim.kind).toBe("object"); // owns a child, so it cannot be a child
  expect(prim.parent).toBeUndefined();
  expect(prim.fields.map((x) => x.name).slice(0, 2)).toEqual(["owner", "index"]);
  expect(prim.fields.find((x) => x.name === "owner")!.ref_to).toBe("gltf.mesh");
  const colour = prim.fields.find((x) => x.name === "colour")!;
  expect(colour.default).toBeUndefined();
  expect(colour.meaning).toContain("[1,1,1,1]");
  expect(by("gltf.primitive_attr").kind).toBe("child");
});

test("the committed catalogue passes the local check", () => {
  const { entries, errors } = checkDir(new URL("../../../../catalogue/gltf", import.meta.url).pathname, "gltf");
  expect(errors).toEqual([]);
  expect(entries.length).toBeGreaterThan(50);
  expect(entries.every((e) => e.kind !== "child" || !e.base)).toBe(true);
});
