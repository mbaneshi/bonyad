import { ACCESSED_ON, blobUrl, pin } from "./sources";
import type { Source } from "./schema";

export const HAND = "HAND-AUTHORED: ";

export function gpkgSource(path: string, section: string, doc = "OGC GeoPackage Encoding Standard, OGC 12-128r19"): Source {
  const p = pin("geopackage");
  return {
    document: doc,
    section,
    url: blobUrl(p, path),
    version: "1.4.0 (repository commit fe83fdd)",
    accessed_on: ACCESSED_ON,
    licence: "OGC License Agreement (opengeospatial/geopackage LICENSE.md)",
  };
}

export function gdalSource(path: string, section: string, doc = "GDAL/OGR source and documentation"): Source {
  const p = pin("gdal");
  return {
    document: doc,
    section,
    url: blobUrl(p, path),
    version: "GDAL 3.13.3 (commit c8b4c45)",
    accessed_on: ACCESSED_ON,
    licence: "MIT (GDAL/OGR)",
  };
}

export function projSource(path: string, section: string, doc = "PROJ database table definitions (data/sql/proj_db_table_defs.sql)"): Source {
  const p = pin("proj");
  return {
    document: doc,
    section,
    url: blobUrl(p, path),
    version: "PROJ 9.9.0 (commit 1df2be6)",
    accessed_on: ACCESSED_ON,
    licence: "MIT (PROJ, table structure only)",
  };
}

/** snake_case helper for derived names. */
export const snake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
