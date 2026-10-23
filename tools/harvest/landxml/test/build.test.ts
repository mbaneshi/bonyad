import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Builder, buildCatalogue, snake } from "../src/build.ts";
import { Entry } from "../src/schema.ts";
import { parseXsd } from "../src/xsd.ts";

const fixture = readFileSync(join(import.meta.dir, "fixtures/mini.xsd"), "utf8");
const opts = { accessedOn: "2026-10-23", sourceUrl: "urn:mini", xsdSha256: "x", licence: "fixture", redundant: { Road: ["length"] } };
const { entries } = buildCatalogue(parseXsd(fixture), opts);
const by = new Map(entries.map((e) => [e.code, e]));
const get = (code: string): Entry => {
  const e = by.get(code);
  if (!e) throw new Error(`missing ${code}; have ${[...by.keys()].join(", ")}`);
  return e;
};
const field = (code: string, name: string) => {
  const f = get(code).fields.find((x) => x.name === name);
  if (!f) throw new Error(`missing field ${code}.${name}`);
  return f;
};

describe("snake", () => {
  test("splits camelCase, keeps acronyms and digits together", () => {
    expect(snake("staStart")).toBe("sta_start");
    expect(snake("GPSAntennaDetails")).toBe("gps_antenna_details");
    expect(snake("PntList3D")).toBe("pnt_list3d");
    expect(snake("oID")).toBe("o_id");
    expect(snake("LandXML")).toBe("landxml");
    expect(snake("setup1RodA")).toBe("setup1_rod_a");
    expect(snake("area2DSurf")).toBe("area2d_surf");
  });
});

describe("fixture catalogue", () => {
  test("every entry validates against the contract schema", () => {
    for (const e of entries) expect(Entry.safeParse(e).success).toBe(true);
  });

  test("root is an object; types that are a parent, have a base or are a base are objects with a container ref; leaves are children", () => {
    expect(get("landxml.landxml").kind).toBe("object");
    expect(get("landxml.road").kind).toBe("object");
    expect(get("landxml.road").parent).toBeUndefined();
    expect(field("landxml.road", "container").ref_to).toBe("landxml.landxml");
    expect(get("landxml.leg").kind).toBe("child");
  });

  test("pure wrapper (Units) is elided; its child hangs off the wrapper's parent", () => {
    expect(by.has("landxml.units")).toBe(false);
    expect(get("landxml.metric").parent).toBe("landxml.landxml");
  });

  test("wrapper Legs is elided and the repeated Leg becomes a child of Road", () => {
    expect(by.has("landxml.legs")).toBe(false);
    expect(get("landxml.leg").kind).toBe("child");
  });

  test("an attribute-heavy single child is a type, not inlined fields", () => {
    expect(get("landxml.metric").fields.map((f) => f.name)).toEqual(["linear_unit", "angular_unit", "a", "b", "c"]);
    expect(field("landxml.metric", "angular_unit").default).toBe("radians");
  });

  test("coordinate children are inlined as point3 plus prefixed attributes", () => {
    expect(field("landxml.road", "start").type).toBe("point3");
    expect(field("landxml.road", "end_colour").type).toBe("enum");
    expect(field("landxml.road", "start").meaning).toContain("x = easting");
  });

  test("extension base becomes an abstract type and keeps only own fields", () => {
    expect(get("landxml.point_type").kind).toBe("abstract");
    expect(get("landxml.pt").base).toBe("landxml.point_type");
    expect(get("landxml.pt").fields.map((f) => f.name)).toEqual(["container", "ord"]);
    expect(field("landxml.pt", "ord").check).toBe("positive");
  });

  test("angles and directions are radians with the unit conversion stated; station is a length", () => {
    expect(field("landxml.road", "dir").type).toBe("angle");
    expect(field("landxml.road", "dir").meaning).toContain("counter-clockwise from north");
    expect(field("landxml.road", "rot").meaning).toContain("counter-clockwise from east");
    expect(field("landxml.road", "sta").type).toBe("length");
  });

  test("plain xs:double stays float (dimension not stated by the XSD)", () => {
    expect(field("landxml.road", "length").type).toBe("float");
  });

  test("redundant list marks derived attributes", () => {
    expect(field("landxml.road", "length").meaning).toContain("Redundant in the source");
  });

  test("role wrappers keep the role as a type based on the child", () => {
    const r = get("landxml.in_spiral");
    expect(r.base).toBe("landxml.spiral");
    expect(r.kind).toBe("object");
    expect(r.parent).toBeUndefined();
    expect(r.fields).toEqual([]); // the container reference lives on the base (spiral)
    expect(by.has("landxml.out_spiral")).toBe(true);
  });

  test("Feature is generalised: not listed under parents, emitted once with owner", () => {
    expect(get("landxml.feature").fields[0]?.name).toBe("owner");
    expect(get("landxml.property").parent).toBe("landxml.feature");
  });

  test("stray top-level annotation documents the next element", () => {
    expect(get("landxml.leg").meaning).toBe("One leg.");
  });

  test("type meaning is trimmed to two sentences", () => {
    expect(get("landxml.road").meaning).toBe("A road. Second sentence.");
  });

  test("name refs become ref fields only for known targets; unknown name types stay text", () => {
    expect(field("landxml.road", "partner").type).toBe("text");
  });

  test("a type used twice is emitted once; the build is deterministic", () => {
    const again = buildCatalogue(parseXsd(fixture), opts).entries;
    expect(JSON.stringify(again)).toBe(JSON.stringify(entries));
    expect(entries.filter((e) => e.code === "landxml.spiral").length).toBe(1);
  });
});

describe("builder safety", () => {
  test("unknown global element reference fails loudly", () => {
    const bad = fixture.replace('<xs:element ref="Units"/>', '<xs:element ref="Nope"/>');
    expect(() => new Builder(parseXsd(bad), opts).build()).toThrow(/unknown global element Nope/);
  });
});

describe("catalogue format compliance", () => {
  test("no child is a parent or has a base; every parent exists", () => {
    const codes = new Set(entries.map((e) => e.code));
    const parents = new Set(entries.filter((e) => e.parent).map((e) => e.parent!));
    for (const e of entries) {
      if (e.kind === "child") {
        expect(e.base).toBeUndefined();
        expect(parents.has(e.code)).toBe(false);
      }
      if (e.parent) expect(codes.has(e.parent)).toBe(true);
    }
  });
  test("no reserved column names", () => {
    for (const e of entries) for (const f of e.fields) expect(["entity_id", "revision_id", "kind", "type_code", "position"]).not.toContain(f.name);
  });
});
