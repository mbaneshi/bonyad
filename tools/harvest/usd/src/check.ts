// Prints counts and validates the catalogue directory: schema, references, uniqueness.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { EntrySchema, type Entry } from "./model.ts";

export function checkDir(dir: string, schema: string): { entries: Entry[]; errors: string[] } {
  const errors: string[] = [];
  const entries: Entry[] = [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
  for (const f of files) {
    const r = EntrySchema.safeParse(parse(readFileSync(join(dir, f), "utf8")));
    if (!r.success) {
      errors.push(`${f}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const e = r.data;
    if (`${e.code.split(".")[1]}.yaml` !== f) errors.push(`${f}: file name does not match code ${e.code}`);
    if (!e.code.startsWith(`${schema}.`)) errors.push(`${f}: code ${e.code} is not in schema ${schema}`);
    entries.push(e);
  }
  const byCode = new Map(entries.map((e) => [e.code, e]));
  if (byCode.size !== entries.length) errors.push("duplicate codes");
  for (const e of entries) {
    if (e.base && !byCode.has(e.base)) errors.push(`${e.code}: unknown base ${e.base}`);
    if (e.parent && !byCode.has(e.parent)) errors.push(`${e.code}: unknown parent ${e.parent}`);
    for (const fld of e.fields)
      if (fld.type === "ref" && fld.ref_to !== "any" && fld.ref_to && !byCode.has(fld.ref_to)) errors.push(`${e.code}.${fld.name}: unknown ref_to ${fld.ref_to}`);
    // field names unique including bases
    const seen = new Set<string>();
    for (let c: Entry | undefined = e, guard = 0; c && guard < 50; c = c.base ? byCode.get(c.base) : undefined, guard++)
      for (const fld of c.fields) {
        if (seen.has(fld.name)) errors.push(`${e.code}: field ${fld.name} repeated through bases`);
        seen.add(fld.name);
      }
  }
  return { entries, errors };
}

export function report(entries: Entry[]): string {
  const kinds = new Map<string, number>();
  for (const e of entries) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
  const ft = new Map<string, number>();
  let fields = 0;
  for (const e of entries) for (const f of e.fields) { fields++; ft.set(f.type, (ft.get(f.type) ?? 0) + 1); }
  const review = entries.filter((e) => e.needs_review).length;
  const fmt = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ");
  return [
    `types: ${entries.length}  fields: ${fields}  needs_review: ${review}`,
    `by kind: ${fmt(kinds)}`,
    `by field type: ${fmt(ft)}`,
  ].join("\n");
}

if (import.meta.main) {
  const dir = resolve(process.argv[2] ?? "../../../catalogue/usd");
  const { entries, errors } = checkDir(dir, "usd");
  console.log(report(entries));
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("OK");
}
