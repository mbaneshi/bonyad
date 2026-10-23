# Sources for catalogue/acad

Every entry in `catalogue/acad/*.yaml` is derived from the two open-source projects below. Nothing was
decompiled, no Autodesk software was installed or run, and no proprietary specification text was copied.
Both repositories are MIT licensed; the licence text lives in each repository's `LICENSE` file.

| Source | URL | Pinned commit | Licence | Accessed | Used for |
|---|---|---|---|---|---|
| ACadSharp (C# DXF/DWG library by Albert Domenech) | https://github.com/DomCR/ACadSharp | `29137f3adaf75ddebd532179eda1e811525ca574` | MIT (Copyright (c) 2021 Albert Domenech) | 2026-10-23 | Class hierarchy, property names and the DXF group codes in `[DxfCodeValue(...)]` attributes, XML doc comments, enums |
| ezdxf (Python DXF library by Manfred Moitzi) | https://github.com/mozman/ezdxf | `7b202613e0d689955b8932a22bcbcf68bdd684f0` (1.4.6b0) | MIT (Copyright (c) 2020 Manfred Moitzi) | 2026-10-23 | Attribute tables (`DefSubclass` / `DXFAttr`) for the first DXF version of each group code and for the types ACadSharp does not model; wording of descriptions |

Target DXF version of the catalogue: DXF R2018 (AC1032).

## How the data was produced

`tools/harvest/acad` reads the pinned source trees **as text** (nothing from them is executed) and writes the YAML:

1. `src/csharp.ts` and `src/sources.ts` parse ACadSharp's C# files; `src/ezdxf.ts` and `src/ezonly.ts` parse ezdxf's Python attribute tables.
2. `src/build.ts` maps classes to catalogue types and properties to fields; `src/existing.ts` holds the 16 hand-curated field lists of the tables that already exist in migration `20261023000005`.
3. `src/normalize.ts` applies the structural rules of `catalogue/FORMAT.md` (no base on a child, no nested children, no repeated base fields, reserved names).
4. `src/report.ts` writes this file and `GAPS.md`.

To reproduce: clone both repositories at the pinned commits into a directory, set `HARVEST_DIR` to it (expected layout `ACadSharp/` and `ezdxf/` inside), then `cd tools/harvest/acad && bun install && bun run harvest`.

Each YAML file also carries its own `source` block (class, file and line in ACadSharp at the pinned commit, licence, access date).

## Not used

- The Autodesk DXF Reference (help.autodesk.com) was consulted for orientation only. Its text is under Autodesk's own terms, so none of it is copied here; the same facts are read from the MIT projects above.
- DWG-only structures, closed or undocumented application formats, and any decompiled or cracked material are out of scope.
