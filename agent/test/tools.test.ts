import { describe, expect, test } from "bun:test";
import { TOOL_BY_NAME } from "../src/tools";
import { uuidV5 } from "../src/uuid";

describe("uuidV5", () => {
  test("is stable and well-formed", () => {
    expect(uuidV5("toolu_01")).toBe(uuidV5("toolu_01"));
    expect(uuidV5("toolu_01")).not.toBe(uuidV5("toolu_02"));
    expect(uuidV5("toolu_01")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  test("matches the RFC 4122 test vector for the DNS namespace", () => {
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });
});

describe("tool input validation", () => {
  const ok = (name: string, input: unknown) => TOOL_BY_NAME.get(name)!.schema.safeParse(input).success;
  test("accepts well-formed input", () => {
    expect(ok("create_point", { x: 1, y: 1 })).toBe(true);
    expect(ok("create_surface", { vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }] })).toBe(true);
    expect(ok("update_geometry", { entity_id: crypto.randomUUID(), geometry: { kind: "point", x: 1, y: 2 } })).toBe(true);
  });
  test("rejects wrong types, missing fields, extra fields and non-finite numbers", () => {
    expect(ok("create_point", { x: "1", y: 1 })).toBe(false);
    expect(ok("create_point", { x: 1 })).toBe(false);
    expect(ok("create_point", { x: 1, y: 1, label: "A" })).toBe(false);
    expect(ok("create_point", { x: Infinity, y: 1 })).toBe(false);
    expect(ok("create_point", { x: NaN, y: 1 })).toBe(false);
    expect(ok("create_line", { a: { x: 0, y: 0 } })).toBe(false);
    expect(ok("measure_entity", { entity_id: "not-a-uuid" })).toBe(false);
    expect(ok("update_geometry", { entity_id: crypto.randomUUID(), geometry: { kind: "circle", r: 1 } })).toBe(false);
  });
});
