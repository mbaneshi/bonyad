// Usage: bun run src/check.ts <catalogue/ifc dir>   Validates every YAML against the contract and prints counts.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { Entry, validateSet } from "./model.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: check.ts <dir>");
  process.exit(2);
}
const entries: Entry[] = [];
let bad = 0;
for (const f of (await readdir(dir)).filter((x) => x.endsWith(".yaml")).sort()) {
  const r = Entry.safeParse(parse(await Bun.file(join(dir, f)).text()));
  if (!r.success) {
    bad++;
    console.error(f, r.error.issues[0]?.message, r.error.issues[0]?.path.join("."));
  } else {
    if (r.data.code.split(".")[1] + ".yaml" !== f) {
      bad++;
      console.error(f, "file name does not match code", r.data.code);
    }
    entries.push(r.data);
  }
}
const errs = validateSet(entries);
for (const e of errs.slice(0, 30)) console.error(e);
const count = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return Object.fromEntries([...m].sort());
};
const fields = entries.flatMap((e) => e.fields);
console.log("entries", entries.length, "invalid", bad, "cross-check errors", errs.length);
console.log("by kind", count(entries, (e) => e.kind));
console.log("total fields", fields.length);
console.log("abstract types", entries.filter((e) => e.kind === "abstract").length);
console.log("enum fields", fields.filter((f) => f.type === "enum").length, "distinct enums", new Set(fields.filter((f) => f.type === "enum").map((f) => f.source_ref?.match(/enumeration (\w+)/)?.[1])).size);
console.log("by field type", count(fields, (f) => f.type));
console.log("needs_review", entries.filter((e) => e.needs_review).length);
console.log("with base", entries.filter((e) => e.base).length, "roots", entries.filter((e) => !e.base && e.kind !== "child").map((e) => e.name).join(", "));
if (bad || errs.length) process.exit(1);
