import { describe, expect, test } from "bun:test";
import { parseExpress, stripComments } from "../src/express.ts";

const FIX = `
(* header (* nested *) comment *)
SCHEMA TEST;
TYPE IfcLengthMeasure = REAL; END_TYPE;
TYPE IfcPositiveLengthMeasure = IfcLengthMeasure;
 WHERE
   WR1 : SELF > 0.;
END_TYPE;
TYPE IfcLabel = STRING(255); END_TYPE;
TYPE IfcKindEnum = ENUMERATION OF (A, B, USERDEFINED, NOTDEFINED); END_TYPE; -- trailing
TYPE IfcThingSelect = SELECT (IfcFoo, IfcBar); END_TYPE;
TYPE IfcLineIndex = LIST [2:?] OF IfcLabel; END_TYPE;
FUNCTION IfcHelper(x : IfcLabel) : BOOLEAN;
  LOCAL a : INTEGER := 0; END_LOCAL;
  RETURN (TRUE);
END_FUNCTION;
ENTITY IfcRoot ABSTRACT SUPERTYPE OF (ONEOF (IfcFoo, IfcBar));
  Name : OPTIONAL IfcLabel;
  Tags, Others : SET [0:?] OF IfcLabel;
 INVERSE
  Backs : SET [0:1] OF IfcBar FOR Root;
 UNIQUE
  UR1 : Name;
END_ENTITY;
ENTITY IfcFoo
 SUBTYPE OF (IfcRoot);
  Kind : OPTIONAL IfcKindEnum;
  Grid : LIST [1:?] OF LIST [3:3] OF IfcLengthMeasure;
  Pts : LIST [3:?] OF UNIQUE IfcBar;
 DERIVE
  Count : INTEGER := SIZEOF(Pts);
  SELF\\IfcRoot.Name : OPTIONAL IfcLabel := NIL;
 WHERE
  W1 : EXISTS(Kind) OR (Count > 0);
END_ENTITY;
ENTITY IfcBar SUBTYPE OF (IfcRoot); END_ENTITY;
RULE IfcRule FOR (IfcFoo); WHERE R1 : TRUE; END_RULE;
END_SCHEMA;
`;

describe("express parser", () => {
  const s = parseExpress(FIX);
  test("schema, counts, skipped blocks", () => {
    expect(s.name).toBe("TEST");
    expect(s.types.size).toBe(6);
    expect(s.entities.size).toBe(3);
    expect(s.skipped).toEqual({ functions: 1, rules: 1 });
  });
  test("enum, select, alias, aggregate types", () => {
    expect(s.types.get("IfcKindEnum")!.body).toEqual({ k: "enum", values: ["A", "B", "USERDEFINED", "NOTDEFINED"] });
    expect(s.types.get("IfcThingSelect")!.body).toEqual({ k: "select", members: ["IfcFoo", "IfcBar"] });
    expect(s.types.get("IfcPositiveLengthMeasure")!.where).toEqual(["WR1"]);
    expect(s.types.get("IfcLineIndex")!.body.k).toBe("expr");
  });
  test("entity header", () => {
    const r = s.entities.get("IfcRoot")!;
    expect(r.abstract).toBe(true);
    expect(r.supertypeOf).toContain("IfcFoo");
    expect(s.entities.get("IfcFoo")!.subtypeOf).toEqual(["IfcRoot"]);
  });
  test("attributes: optional, multiple names, nested aggregates, unique", () => {
    const r = s.entities.get("IfcRoot")!;
    expect(r.attrs.map((a) => [a.name, a.optional])).toEqual([["Name", true], ["Tags", false], ["Others", false]]);
    const foo = s.entities.get("IfcFoo")!;
    const grid = foo.attrs.find((a) => a.name === "Grid")!.type;
    expect(grid.k === "agg" && grid.of.k === "agg" && grid.of.lo === "3").toBe(true);
    const pts = foo.attrs.find((a) => a.name === "Pts")!.type;
    expect(pts.k === "agg" && pts.unique).toBe(true);
  });
  test("inverse and derived are collected, never stored", () => {
    expect(s.entities.get("IfcRoot")!.inverse).toEqual(["Backs"]);
    const foo = s.entities.get("IfcFoo")!;
    expect(foo.derived).toEqual(["Count"]);
    expect(foo.derivedRedeclared).toEqual(["Name"]);
    expect(foo.attrs.map((a) => a.name)).toEqual(["Kind", "Grid", "Pts"]);
  });
  test("comments are stripped, strings kept", () => {
    expect(stripComments("a (* x (* y *) z *) b -- c\nd 'it''s (* not *)'")).toBe("a   b \nd 'it''s (* not *)'");
  });
});
