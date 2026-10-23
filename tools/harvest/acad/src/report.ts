// SOURCES.md and GAPS.md for catalogue/acad, written by the harvest so they cannot drift from the data.
import type { CatType } from "./catalogue.ts";
import type { Gap } from "./gapsdata.ts";
import { TARGET_VERSION } from "./gapsdata.ts";
import { ACCESSED, SHAs } from "./pins.ts";

export function counts(types: CatType[]) {
  const byKind: Record<string, number> = {};
  for (const t of types) byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  return { types: types.length, fields: types.reduce((a, t) => a + t.fields.length, 0), byKind, needsReview: types.filter((t) => t.needs_review).length };
}

export function sourcesMd(): string {
  return `# Sources for catalogue/acad

Every entry in \`catalogue/acad/*.yaml\` is derived from the two open-source projects below. Nothing was
decompiled, no Autodesk software was installed or run, and no proprietary specification text was copied.
Both repositories are MIT licensed; the licence text lives in each repository's \`LICENSE\` file.

| Source | URL | Pinned commit | Licence | Accessed | Used for |
|---|---|---|---|---|---|
| ACadSharp (C# DXF/DWG library by Albert Domenech) | https://github.com/DomCR/ACadSharp | \`${SHAs.acadsharp}\` | MIT (Copyright (c) 2021 Albert Domenech) | ${ACCESSED} | Class hierarchy, property names and the DXF group codes in \`[DxfCodeValue(...)]\` attributes, XML doc comments, enums |
| ezdxf (Python DXF library by Manfred Moitzi) | https://github.com/mozman/ezdxf | \`${SHAs.ezdxf}\` (1.4.6b0) | MIT (Copyright (c) 2020 Manfred Moitzi) | ${ACCESSED} | Attribute tables (\`DefSubclass\` / \`DXFAttr\`) for the first DXF version of each group code and for the types ACadSharp does not model; wording of descriptions |

Target DXF version of the catalogue: ${TARGET_VERSION}.

## How the data was produced

\`tools/harvest/acad\` reads the pinned source trees **as text** (nothing from them is executed) and writes the YAML:

1. \`src/csharp.ts\` and \`src/sources.ts\` parse ACadSharp's C# files; \`src/ezdxf.ts\` and \`src/ezonly.ts\` parse ezdxf's Python attribute tables.
2. \`src/build.ts\` maps classes to catalogue types and properties to fields; \`src/existing.ts\` holds the 16 hand-curated field lists of the tables that already exist in migration \`20261023000005\`.
3. \`src/normalize.ts\` applies the structural rules of \`catalogue/FORMAT.md\` (no base on a child, no nested children, no repeated base fields, reserved names).
4. \`src/report.ts\` writes this file and \`GAPS.md\`.

To reproduce: clone both repositories at the pinned commits into a directory, set \`HARVEST_DIR\` to it (expected layout \`ACadSharp/\` and \`ezdxf/\` inside), then \`cd tools/harvest/acad && bun install && bun run harvest\`.

Each YAML file also carries its own \`source\` block (class, file and line in ACadSharp at the pinned commit, licence, access date).

## Not used

- The Autodesk DXF Reference (help.autodesk.com) was consulted for orientation only. Its text is under Autodesk's own terms, so none of it is copied here; the same facts are read from the MIT projects above.
- DWG-only structures, closed or undocumented application formats, and any decompiled or cracked material are out of scope.
`;
}

export function gapsMd(types: CatType[], gaps: Gap[], ezOnly: string[], stats: { ignored: number; noDoc: number; props: number; inlined: number }, norm: Record<string, number>): string {
  const c = counts(types);
  const byKind = (k: Gap["kind"]) => gaps.filter((g) => g.kind === k);
  const lines = (g: Gap[]) => g.map((x) => `- \`${x.type}\`: ${x.what}. ${x.why}.`).join("\n") || "- none";
  const review = types.filter((t) => t.needs_review).map((t) => `\`${t.code}\``).join(", ");
  return `# Gaps in catalogue/acad

What the harvest could not cover, and why. Nothing here was guessed.

## Totals

- ${c.types} types (${Object.entries(c.byKind).map(([k, n]) => `${n} ${k}`).join(", ")}) with ${c.fields} fields.
- ${stats.props} ACadSharp properties carrying a group code were visited; ${stats.noDoc} of the resulting fields have no description in either source (their \`source_ref\` says so and the \`meaning\` is the humanised property name).
- ${c.needsReview} types are flagged \`needs_review\`.

## Skipped Autodesk vertical-product classes

ACadSharp lists these classes but carries no DXF group codes for them (they belong to AutoCAD Architecture / Mechanical).

${lines(byKind("skipped").filter((g) => /vertical-product/.test(g.why)))}

## Types that cannot be stored under the format rules

${lines(byKind("skipped").filter((g) => !/vertical-product/.test(g.why)))}

## Properties ACadSharp marks Ignored

They are not read or written by ACadSharp's DXF code, so no group code is certain.

${lines(byKind("ignored"))}

## Properties with no mapping

${lines(byKind("unmapped"))}

## Types taken from ezdxf only

ACadSharp has no class for these DXF types; their fields come from ezdxf's attribute tables (\`(fields from ezdxf)\` means only part of the type was modelled there). Aliases mean ezdxf defines the type as a subclass with no attribute table of its own.

${ezOnly.map((n) => `- ${n}`).join("\n") || "- none"}

## Structural adjustments forced by the format (FORMAT.md rules 5 and 9)

${Object.entries(norm).map(([k, n]) => `- ${k}: ${n}`).join("\n")}

Each affected YAML file explains the change in its \`notes\`.

## Flagged needs_review

${review || "none"}

## Not harvested at all

- Application-specific (closed) data inside proxy entities, and DWG-only objects.
- Header variables, the CLASSES section and the THUMBNAILIMAGE section are file structure, not entities; they are out of scope for this issue.
- Group codes that ACadSharp's DXF reader does not model are absent unless ezdxf lists them.
`;
}
