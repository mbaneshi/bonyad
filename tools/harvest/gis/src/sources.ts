/** Pinned public sources for the gis harvest. Everything is read-only data; nothing fetched is executed. */
export interface Pin {
  id: string;
  repo: string; // owner/name on GitHub
  commit: string; // full SHA (immutable)
  release: string; // human version label
  licence: string;
  licenceUrl: string;
  files: string[]; // paths relative to repo root
}

export const ACCESSED_ON = "2026-10-23";

export const PINS: Pin[] = [
  {
    id: "geopackage",
    repo: "opengeospatial/geopackage",
    commit: "fe83fdd5949a3faba09117e6e1dcc003fdb5a900",
    release: "OGC GeoPackage Encoding Standard 1.4.0 (spec sources, master 2024-01-31)",
    licence:
      "OGC License Agreement (LICENSE.md in the repository): free copy, use, modify, merge, publish, distribute and sublicense, provided all copyright notices are retained intact; modified copies must carry a notice that they include modifications not approved by OGC; the OGC name may not be used to promote. Copyright licence only, no patent rights.",
    licenceUrl: "https://github.com/opengeospatial/geopackage/blob/fe83fdd5949a3faba09117e6e1dcc003fdb5a900/LICENSE.md",
    files: [
      "LICENSE.md",
      "spec/core/annexes/ddl.adoc",
      "spec/core/1_base.adoc",
      "spec/core/2a_features.adoc",
      "spec/core/2b_tiles.adoc",
      "spec/core/2e_extensions-mechanism.adoc",
      "spec/core/2f_attributes.adoc",
      "spec/core/annexes/geometrytypes.adoc",
      "spec/core/annexes/extension_metadata.adoc",
      "spec/core/annexes/extension_schema.adoc",
      "spec/core/annexes/extension_spatialindex.adoc",
      "spec/crs_wkt/clause_7_normative_text.adoc",
      "spec/crs_wkt/annex-b.adoc",
      "spec/related-tables/clause_7_normative_text.adoc",
      "spec/related-tables/annex-sql.adoc",
      "spec/2d-gridded-coverage/clause_7_normative_text.adoc",
      "spec/2d-gridded-coverage/annex-c.adoc",
    ],
  },
  {
    id: "gdal",
    repo: "OSGeo/gdal",
    commit: "c8b4c45fca87d3e6fbf80e7a7898b8a661ad0edc",
    release: "GDAL v3.13.3",
    licence: "MIT (GDAL/OGR general licence, LICENSE.TXT)",
    licenceUrl: "https://github.com/OSGeo/gdal/blob/c8b4c45fca87d3e6fbf80e7a7898b8a661ad0edc/LICENSE.TXT",
    files: [
      "LICENSE.TXT",
      "ogr/ogr_core.h",
      "ogr/ogr_feature.h",
      "ogr/ogr_geomcoordinateprecision.h",
      "ogr/ogr_srs_api.h",
      "gcore/gdal.h",
      "gcore/gdal_relationship.h",
      "doc/source/user/vector_data_model.rst",
      "doc/source/drivers/vector/gpkg.rst",
      "ogr/ogrsf_frmts/gpkg/ogrgeopackagedatasource.cpp",
    ],
  },
  {
    id: "proj",
    repo: "OSGeo/PROJ",
    commit: "1df2be61c0e4732aa1326126113776b291ae7657",
    release: "PROJ 9.9.0",
    licence: "MIT (COPYING). Only table STRUCTURE is used; EPSG/ESRI/IGNF data rows are not harvested.",
    licenceUrl: "https://github.com/OSGeo/PROJ/blob/1df2be61c0e4732aa1326126113776b291ae7657/COPYING",
    files: ["COPYING", "data/sql/proj_db_table_defs.sql"],
  },
];

export const rawUrl = (p: Pin, path: string) =>
  `https://raw.githubusercontent.com/${p.repo}/${p.commit}/${path}`;
export const blobUrl = (p: Pin, path: string) =>
  `https://github.com/${p.repo}/blob/${p.commit}/${path}`;
export const pin = (id: string): Pin => {
  const p = PINS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown pin ${id}`);
  return p;
};

/** Non-GitHub public documents (hash-pinned; the text is only read, never executed). */
export interface WebSource {
  id: string;
  url: string;
  file: string; // cache file name under .cache/web/
  title: string;
  version: string;
  licence: string;
}
const OGC_LICENCE =
  "OGC License Agreement embedded in the document: free copy/use/modify/merge/publish/distribute/sublicense provided all copyright notices are retained intact; modified copies must state they include modifications not approved by OGC; copyright licence only, no patent rights.";
export const WEB: WebSource[] = [
  {
    id: "sfa",
    url: "https://docs.ogc.org/is/06-103r4/06-103r4.pdf",
    file: "06-103r4.pdf",
    title: "OpenGIS Implementation Standard for Geographic information - Simple feature access - Part 1: Common architecture (OGC 06-103r4)",
    version: "1.2.1 (Corrigendum, 2011-05-28)",
    licence: OGC_LICENCE,
  },
  {
    id: "wkt2",
    url: "https://docs.ogc.org/is/18-010r7/18-010r7.html",
    file: "18-010r7.html",
    title: "OGC Well-known text representation of coordinate reference systems (OGC 18-010r7, ISO 19162:2019)",
    version: "2019",
    licence: OGC_LICENCE,
  },
];
