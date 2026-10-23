import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { buildAll, OUT } from "../src/build";
import { check } from "../src/check";
import { parseCEnum } from "../src/parse/cenum";
import { parseCreateTables } from "../src/parse/ddl";
import { EntitySchema } from "../src/schema";

const all = await buildAll();
const by = new Map(all.map((e) => [e.code, e]));

describe("catalogue/gis build", () => {
  test("every entity validates against the format and is in schema gis", () => {
    for (const e of all) {
      expect(EntitySchema.safeParse(e).success).toBe(true);
      expect(e.code.startsWith("gis.")).toBe(true);
      expect(e.fidelity).toBe("proxy");
    }
  });

  test("references close and no reserved column names", () => {
    expect(check(all).problems).toEqual([]);
  });

  test("provenance and licence on every entity", () => {
    for (const e of all) {
      expect(e.source.licence.length).toBeGreaterThan(3);
      expect(e.source.accessed_on).toBe("2026-10-23");
      expect(e.meaning.length).toBeGreaterThan(10);
      for (const f of e.fields) expect(f.meaning.length).toBeGreaterThan(3);
    }
  });

  test("covers the three scoped sources", () => {
    for (const c of ["gis.gpkg_contents", "gis.gpkg_geometry_columns", "gis.gpkg_spatial_ref_sys", "gis.gpkg_extensions", "gis.gpkg_tile_matrix",
      "gis.geometry", "gis.point", "gis.polygon", "gis.linestring",
      "gis.gdal_dataset", "gis.ogr_layer", "gis.ogr_feature", "gis.ogr_field_defn", "gis.ogr_geom_field_defn", "gis.ogr_field_domain"])
      expect(by.has(c)).toBe(true);
  });

  test("coordinate reference system coverage: datum, projection, axis order, units", () => {
    expect(by.get("gis.datum")).toBeDefined();
    expect(by.get("gis.map_projection")).toBeDefined();
    expect(by.get("gis.coordinate_system_axis")?.kind).toBe("child"); // child position is the axis order
    const axis = by.get("gis.coordinate_system_axis")!;
    expect(axis.fields.map((f) => f.name)).toEqual(expect.arrayContaining(["direction", "unit_name", "unit_to_si"]));
    const srs = by.get("gis.spatial_reference")!;
    expect(srs.fields.map((f) => f.name)).toEqual(expect.arrayContaining(["datum", "coordinate_system", "projection", "axis_mapping_strategy"]));
  });

  test("enums derived from GDAL headers match the header", async () => {
    const hdr = await readFile(join(import.meta.dir, "..", ".cache/gdal/ogr/ogr_core.h"), "utf8");
    const ft = parseCEnum(hdr, "OGRFieldType").filter((e) => e.name !== "OFTMaxType");
    const f = by.get("gis.ogr_field_defn")!.fields.find((x) => x.name === "field_type")!;
    expect(f.values!.map((v) => v.value)).toEqual(ft.map((e) => e.name));
    expect(ft.length).toBe(14);
  });

  test("the 18 SFA/GeoPackage geometry types are present", () => {
    for (const g of ["geometry", "point", "linestring", "polygon", "multipoint", "multilinestring", "multipolygon", "geometrycollection",
      "circularstring", "compoundcurve", "curvepolygon", "multicurve", "multisurface", "curve", "surface", "polyhedralsurface", "tin", "triangle"])
      expect(by.has(`gis.${g}`)).toBe(true);
  });

  test("YAML on disk is exactly what the builder produces (no hand edits)", async () => {
    const files = (await readdir(OUT)).filter((f) => f.endsWith(".yaml")).sort();
    expect(files).toEqual(all.map((e) => `${e.code.split(".")[1]}.yaml`).sort());
    for (const e of all) {
      const disk = parse(await readFile(join(OUT, `${e.code.split(".")[1]}.yaml`), "utf8"));
      expect(disk.code).toBe(e.code);
      expect(disk.fields.length).toBe(e.fields.length);
    }
  });
});

describe("parsers", () => {
  test("DDL parser: columns, primary and foreign keys", () => {
    const [t] = parseCreateTables("CREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, b TEXT, c INTEGER, CONSTRAINT fk FOREIGN KEY (c) REFERENCES z(k));");
    expect(t!.name).toBe("a");
    expect(t!.columns.map((c) => c.name)).toEqual(["id", "b", "c"]);
    expect(t!.foreignKeys[0]!.refTable).toBe("z");
  });
  test("C enum parser handles explicit values and docs", () => {
    const r = parseCEnum("typedef enum { A = 0, /**< first */ B = 5 /**< second */ } T;", "T");
    expect(r.map((e) => [e.name, e.value])).toEqual([["A", 0], ["B", 5]]);
    expect(r[1]!.doc).toBe("second");
  });
});
