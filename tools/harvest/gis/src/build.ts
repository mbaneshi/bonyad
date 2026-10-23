/** Builds catalogue/gis/*.yaml from the pinned sources. `bun run build` (after `bun run fetch`). */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import { ensure, ROOT } from "./fetch";
import { buildGpkg } from "./derive/gpkg";
import { buildGdal } from "./derive/gdal";
import { buildGpkgExtra } from "./hand/gpkg_extra";
import { buildSimpleFeatures } from "./hand/sf";
import { buildCrs } from "./hand/crs";
import { EntitySchema, type Entity } from "./schema";

export const OUT = process.env.GIS_CATALOGUE_OUT ?? join(ROOT, "..", "..", "..", "catalogue", "gis");

export async function buildAll(): Promise<Entity[]> {
  const all = [
    ...(await buildGpkg()),
    ...(await buildGpkgExtra()),
    ...buildSimpleFeatures(),
    ...(await buildGdal()),
    ...buildCrs(),
  ];
  const codes = new Set<string>();
  for (const e of all) {
    EntitySchema.parse(e);
    if (codes.has(e.code)) throw new Error(`duplicate ${e.code}`);
    codes.add(e.code);
  }
  return all;
}

if (import.meta.main) {
  await ensure(false);
  const all = await buildAll();
  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) if (f.endsWith(".yaml")) await rm(join(OUT, f));
  for (const e of all) {
    // key order: contract order, not insertion order
    const o = { code: e.code, name: e.name, kind: e.kind, base: e.base, parent: e.parent, fidelity: e.fidelity, source: e.source, meaning: e.meaning, fields: e.fields, needs_review: e.needs_review, notes: e.notes };
    await writeFile(join(OUT, `${e.code.split(".")[1]}.yaml`), stringify(o, { lineWidth: 0, defaultStringType: "PLAIN", defaultKeyType: "PLAIN" }));
  }
  console.log(`wrote ${all.length} entities to ${OUT}`);
}
