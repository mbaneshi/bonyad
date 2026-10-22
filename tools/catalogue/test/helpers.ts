import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** A temp catalogue root with the given files (path relative to the root -> YAML text). */
export function tempCatalogue(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "catalogue-test-"));
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  return root;
}

export const SOURCE = `source: {document: "Spec", accessed_on: 2026-10-23, licence: "MIT"}`;

/** Minimal valid type YAML; extra lines are appended verbatim. */
export function typeYaml(code: string, opts: { kind?: string; base?: string; parent?: string; fields?: string[]; extra?: string[] } = {}): string {
  const lines = [`code: ${code}`, `name: ${code.split(".")[1]}`, `kind: ${opts.kind ?? "entity"}`];
  if (opts.base) lines.push(`base: ${opts.base}`);
  if (opts.parent) lines.push(`parent: ${opts.parent}`);
  lines.push("fidelity: faithful", SOURCE, "meaning: A test type.");
  const fields = opts.fields ?? ["  - {name: a, type: int, meaning: A field}"];
  lines.push(fields.length ? "fields:" : "fields: []", ...fields, ...(opts.extra ?? []));
  return `${lines.join("\n")}\n`;
}
