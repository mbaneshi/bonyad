// Usage: bun run src/main.ts <IFC4x3_RC4.exp> <docs/schemas dir> <out dir> <repo-commit-sha>
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import { parseExpress } from "./express.ts";
import { loadDocs } from "./docs.ts";
import { Mapper } from "./map.ts";
import { validateSet } from "./model.ts";

const [exp, docsDir, outDir, sha] = process.argv.slice(2);
if (!exp || !docsDir || !outDir || !sha) {
  console.error("usage: main.ts <schema.exp> <docs/schemas> <outDir> <commit-sha>");
  process.exit(2);
}
const raw = await Bun.file(exp).text();
const sha256 = new Bun.CryptoHasher("sha256").update(raw).digest("hex");
const schema = parseExpress(raw);
const docs = await loadDocs(docsDir);
const repo = "https://github.com/buildingSMART/IFC4.3.x-development";
const m = new Mapper(schema, docs, {
  schemaFile: `${repo}/blob/${sha}/reference_schemas/IFC4x3_RC4.exp`,
  docsBase: `${repo}/blob/${sha}/docs/schemas`,
  version: `${schema.name} (EXPRESS issue date 2021-07-22); repo commit ${sha.slice(0, 12)}; exp sha256 ${sha256.slice(0, 12)}`,
  accessedOn: "2026-10-23",
  licence: "buildingSMART: CC BY-ND 4.0 (repo LICENSE.md); EXPRESS header allows translation with full attribution, consent needed for changes. See SOURCES.md",
});
const entries = m.run();
const errs = validateSet(entries);
if (errs.length) {
  console.error(errs.slice(0, 40).join("\n"));
  console.error(`${errs.length} validation errors`);
  process.exit(1);
}
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const e of entries) {
  await writeFile(join(outDir, `${e.code.split(".")[1]}.yaml`), stringify(e, { lineWidth: 0 }));
}
const uniq = (a: string[]) => [...new Set(a)].sort();
await writeFile(join(outDir, "_stats.json"), JSON.stringify({ stats: Object.fromEntries(Object.entries(m.stats).map(([k, v]) => [k, [...v]])), gaps: { attrs: uniq(m.gaps.undocumentedAttrs), literals: uniq(m.gaps.undocumentedLiterals), entities: uniq(m.gaps.undocumentedEntities) }, skipped: schema.skipped, sha256 }, null, 1));
console.log(`wrote ${entries.length} entries to ${outDir}`);
