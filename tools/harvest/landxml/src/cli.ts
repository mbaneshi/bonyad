// Usage: bun run src/cli.ts --xsd <LandXML-1.2.xsd> --out <catalogue/landxml dir> [--accessed 2026-10-23]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { z } from "zod";
import { buildCatalogue } from "./build.ts";
import { REDUNDANT } from "./redundant.ts";
import { parseXsd } from "./xsd.ts";

/** SHA-256 of the exact LandXML-1.2.xsd this catalogue was harvested from (225,951 bytes). */
export const XSD_SHA256 = "f4f732341970a923943f94592a3fde0838534515d564a699761e85420fad4d77";
export const XSD_URL = "http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd";
export const LICENCE = "Not stated in the XSD. LandXML.org Open Software License v1.0 (BSD-style) covers the 1.2 SDK only; see SOURCES.md";

const Args = z.object({ xsd: z.string(), out: z.string(), accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-10-23") });

function parseArgs(argv: string[]): z.infer<typeof Args> {
  const m: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k?.startsWith("--")) throw new Error(`bad argument ${k}`);
    m[k.slice(2)] = argv[i + 1] ?? "";
  }
  return Args.parse(m);
}

export function harvest(xsdPath: string, outDir: string, accessed: string) {
  const bytes = readFileSync(xsdPath);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== XSD_SHA256) throw new Error(`XSD checksum mismatch: got ${sha}, expected ${XSD_SHA256}`);
  const schema = parseXsd(bytes.toString("utf8"));
  const { entries, log, unreachable, dropped } = buildCatalogue(schema, {
    accessedOn: accessed,
    sourceUrl: XSD_URL,
    xsdSha256: sha,
    licence: LICENCE,
    redundant: REDUNDANT,
  });
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith(".yaml")) rmSync(join(outDir, f));
  for (const e of entries) {
    const file = join(outDir, `${e.code.split(".")[1]}.yaml`);
    writeFileSync(file, stringify(e, { lineWidth: 0 }));
  }
  return { entries, log, unreachable, dropped, sha };
}

if (import.meta.main) {
  const a = parseArgs(process.argv.slice(2));
  const r = harvest(a.xsd, a.out, a.accessed);
  console.log(`wrote ${r.entries.length} entries to ${a.out} (xsd sha256 ${r.sha})`);
  for (const l of r.log) console.log("note:", l);
  console.log("dropped (must be empty):", r.dropped.join("; ") || "none");
  console.log("unreachable global elements:", r.unreachable.join(", ") || "none");
}
