import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import type { Entry } from "./model.ts";

export function entryToYaml(e: Entry): string {
  return stringify(e, { lineWidth: 0, defaultStringType: "PLAIN", defaultKeyType: "PLAIN" });
}

/** Writes one YAML file per entry; removes stale *.yaml first so the directory is exactly the harvest. */
export function writeCatalogue(outDir: string, entries: Entry[]): void {
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith(".yaml")) rmSync(join(outDir, f));
  for (const e of entries) {
    const table = e.code.split(".")[1]!;
    writeFileSync(join(outDir, `${table}.yaml`), entryToYaml(e));
  }
}
