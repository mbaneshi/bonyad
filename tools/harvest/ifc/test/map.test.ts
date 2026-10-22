import { describe, expect, test } from "bun:test";
import { parseExpress } from "../src/express.ts";
import { Mapper, snake } from "../src/map.ts";
import { parseDoc, sentences } from "../src/docs.ts";
import { Entry, validateSet } from "../src/model.ts";

const SRC = `
SCHEMA T;
TYPE IfcLengthMeasure = REAL; END_TYPE;
TYPE IfcPositiveLengthMeasure = IfcLengthMeasure; WHERE WR1 : SELF > 0.; END_TYPE;
TYPE IfcNonNegativeLengthMeasure = IfcLengthMeasure; WHERE WR1 : SELF >= 0.; END_TYPE;
TYPE IfcPositivePlaneAngleMeasure = IfcPlaneAngleMeasure; WHERE WR1 : SELF > 0.; END_TYPE;
TYPE IfcPlaneAngleMeasure = REAL; END_TYPE;
TYPE IfcPositiveRatioMeasure = IfcRatioMeasure; WHERE WR1 : SELF > 0.; END_TYPE;
TYPE IfcRatioMeasure = REAL; END_TYPE;
TYPE IfcNormalisedRatioMeasure = IfcRatioMeasure; WHERE WR1 : {0.0 <= SELF <= 1.0}; END_TYPE;
TYPE IfcPositiveInteger = IfcInteger; WHERE WR1 : SELF > 0; END_TYPE;
TYPE IfcInteger = INTEGER; END_TYPE;
TYPE IfcLabel = STRING(255); END_TYPE;
TYPE IfcKindEnum = ENUMERATION OF (A, USERDEFINED); END_TYPE;
TYPE IfcValue = SELECT (IfcLabel, IfcInteger); END_TYPE;
TYPE IfcShapeSelect = SELECT (IfcSolid, IfcCurve); END_TYPE;
ENTITY IfcRoot ABSTRACT SUPERTYPE OF (ONEOF (IfcProduct));
  Id : IfcLabel;
END_ENTITY;
ENTITY IfcProduct ABSTRACT SUBTYPE OF (IfcRoot); Placement : OPTIONAL IfcRoot; END_ENTITY;
ENTITY IfcSolid SUBTYPE OF (IfcProduct); END_ENTITY;
ENTITY IfcCurve SUBTYPE OF (IfcProduct); END_ENTITY;
ENTITY IfcThing2DHorizontal SUBTYPE OF (IfcSolid);
  Len : IfcPositiveLengthMeasure;
  Ang : OPTIONAL IfcPlaneAngleMeasure;
  Kind : IfcKindEnum;
  Val : IfcValue;
  Shape : IfcShapeSelect;
  Coords : LIST [1:3] OF IfcLengthMeasure;
  Items : LIST [1:?] OF IfcSolid;
  Members : SET [1:?] OF IfcCurve;
  Idx : LIST [1:?] OF LIST [3:3] OF IfcPositiveInteger;
 INVERSE Back : SET [0:?] OF IfcSolid FOR Placement;
END_ENTITY;
END_SCHEMA;
`;
const DOC = `# IfcThing2DHorizontal

A thing. It has two sentences.
<!-- end of short definition -->

## Attributes

### Len
The _length_ of it. Second sentence.

### Kind
`;
const prov = { schemaFile: "https://example.org/s.exp", docsBase: "https://example.org/docs", version: "t", accessedOn: "2026-10-23", licence: "test" };

describe("mapper", () => {
  const s = parseExpress(SRC);
  const docs = new Map([["IfcThing2DHorizontal", parseDoc("x/IfcThing2DHorizontal.md", DOC)]]);
  const m = new Mapper(s, docs, prov);
  const entries = m.run();
  const by = new Map(entries.map((e) => [e.code, e]));
  const thing = by.get("ifc.thing2d_horizontal")!;
  const field = (n: string) => thing.fields.find((f) => f.name === n)!;

  test("codes and inheritance", () => {
    expect(snake("Alignment2DHorizontal")).toBe("alignment2d_horizontal");
    expect(snake("BSplineSurface")).toBe("b_spline_surface");
    expect(snake("SIUnit")).toBe("si_unit");
    expect(thing.base).toBe("ifc.solid");
    expect(by.get("ifc.product")!.kind).toBe("abstract");
    expect(thing.kind).toBe("entity");
  });
  test("measures and checks", () => {
    expect(field("len")).toMatchObject({ type: "length", check: "positive", meaning: "The length of it." });
    expect(field("ang")).toMatchObject({ type: "angle", nullable: true });
    expect(field("ang").meaning).toContain("Radians");
  });
  test("enum, selects", () => {
    expect(field("kind").type).toBe("enum");
    expect(field("kind").values!.map((v) => v.value)).toEqual(["A", "USERDEFINED"]);
    expect(field("val")).toMatchObject({ type: "text" });
    expect(field("shape")).toMatchObject({ type: "ref", ref_to: "ifc.product" });
  });
  test("aggregates become arrays or child tables", () => {
    expect(field("coords")).toMatchObject({ type: "array", of: "length" });
    const items = by.get("ifc.thing2d_horizontal_items")!;
    expect(items).toMatchObject({ kind: "child", parent: "ifc.thing2d_horizontal" });
    expect(items.fields[0]).toMatchObject({ name: "item", type: "ref", ref_to: "ifc.solid" });
    expect(by.get("ifc.thing2d_horizontal_members")!.notes).toContain("Unordered");
    expect(by.get("ifc.thing2d_horizontal_idx")!.fields[0]).toMatchObject({ type: "array", of: "int" });
  });
  test("inverse attributes are not stored, and are noted", () => {
    expect(thing.fields.some((f) => f.name === "back")).toBe(false);
    expect(thing.notes).toContain("Inverse attributes not stored: Back");
  });
  test("whole set validates against the contract", () => {
    expect(validateSet(entries)).toEqual([]);
    for (const e of entries) Entry.parse(e);
  });
  test("missing check evidence fails loudly", () => {
    const bad = parseExpress(SRC.replace("SELF > 0.; END_TYPE;\nTYPE IfcNonNeg", "SELF < 0.; END_TYPE;\nTYPE IfcNonNeg"));
    expect(() => new Mapper(bad, docs, prov)).toThrow();
  });
});

describe("docs helpers", () => {
  test("sentences keeps abbreviations together", () => {
    expect(sentences("Use e.g. walls. Second one. Third one.", 2, 200)).toBe("Use e.g. walls. Second one.");
  });
  test("parseDoc", () => {
    const d = parseDoc("p", DOC);
    expect(d.summary).toBe("A thing. It has two sentences.");
    expect(d.attrs.get("Kind")).toBe("");
  });
});
