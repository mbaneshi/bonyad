// Everything generated for one schema, as a map of repo-relative path -> content.
import { resolve as resolvePath } from "node:path";
import { generateCoverage, type CoverageSection } from "./coverage.ts";
import { generateDbml } from "./dbml.ts";
import type { Model } from "./model.ts";
import { crateName, enumName, generateCargoToml, generateDomain, generateLib, generateRows, rustNames } from "./rust.ts";
import { generateSeed } from "./seed.ts";
import { generateSql } from "./sql.ts";

export const REPO_ROOT = resolvePath(import.meta.dir, "../../..");

/** Format with the repo's pinned rustfmt (run from logic/ so rust-toolchain.toml applies). */
export async function formatRust(src: string): Promise<string> {
  const proc = Bun.spawn(["rustfmt", "--edition", "2024", "--emit", "stdout"], {
    cwd: resolvePath(REPO_ROOT, "logic"),
    stdin: new TextEncoder().encode(src),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`rustfmt failed (${code}): ${err}`);
  return out;
}

function checkRustNames(m: Model): void {
  const seen = new Map<string, string>();
  const claim = (name: string, who: string) => {
    const prev = seen.get(name);
    if (prev) throw new Error(`${m.schema}: Rust name ${name} is wanted by both ${prev} and ${who}`);
    seen.set(name, who);
  };
  for (const n of m.types.filter((t) => t.hasTable)) {
    const r = rustNames(n);
    claim(r.struct, n.code);
    claim(r.row, n.code);
  }
  for (const n of m.types.filter((t) => t.hasTable)) {
    for (const f of n.doc.fields.filter((x) => x.type === "enum")) {
      claim(enumName(n, f), `${n.code}.${f.name}`);
    }
  }
}

export async function buildOutputs(m: Model, golden: boolean): Promise<Map<string, string>> {
  checkRustNames(m);
  const s = m.schema;
  const out = new Map<string, string>();
  const dbDir = golden ? `db/generated/_golden/${s}` : `db/generated/${s}`;
  const crateDir = `logic/generated/${golden ? "golden-" : ""}${s.replaceAll("_", "-")}`;
  out.set(`${dbDir}/${s}.sql`, generateSql(m));
  out.set(`${dbDir}/${s}.catalogue.sql`, generateSeed(m));
  out.set(golden ? `docs/design/db/generated/_golden/${s}.dbml` : `docs/design/db/generated/${s}.dbml`, generateDbml(m));
  out.set(`${crateDir}/Cargo.toml`, generateCargoToml(m, golden));
  out.set(`${crateDir}/src/lib.rs`, await formatRust(generateLib(m)));
  out.set(`${crateDir}/src/domain.rs`, await formatRust(generateDomain(m)));
  out.set(`${crateDir}/src/rows.rs`, await formatRust(generateRows(m)));
  return out;
}

export { crateName, generateCoverage };
export type { CoverageSection };
