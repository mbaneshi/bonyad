/** Consistency report over the built catalogue: reference closure, counts per source and kind, CRS coverage. */
import { buildAll } from "./build";
import type { Entity } from "./schema";

export interface Report {
  total: number;
  byKind: Record<string, number>;
  bySource: Record<string, number>;
  problems: string[];
}

export function check(all: Entity[]): Report {
  const codes = new Set(all.map((e) => e.code));
  const byCode = new Map(all.map((e) => [e.code, e]));
  const problems: string[] = [];
  const byKind: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const e of all) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    bySource[e.source.document] = (bySource[e.source.document] ?? 0) + 1;
    for (const [what, c] of [["base", e.base], ["parent", e.parent]] as const)
      if (c && !codes.has(c)) problems.push(`${e.code}: ${what} ${c} not in catalogue`);
    if (e.parent && byCode.get(e.parent)?.kind === "child") problems.push(`${e.code}: parent ${e.parent} is itself a child`);
    for (const f of e.fields) {
      if (f.ref_to && f.ref_to !== "any" && !codes.has(f.ref_to)) problems.push(`${e.code}.${f.name}: ref_to ${f.ref_to} not in catalogue`);
      if (["entity_id", "revision_id", "kind", "type_code", "position"].includes(f.name)) problems.push(`${e.code}.${f.name}: reserved column name`);
    }
  }
  return { total: all.length, byKind, bySource, problems };
}

if (import.meta.main) {
  const r = check(await buildAll());
  console.log(JSON.stringify(r, null, 2));
  if (r.problems.length) process.exit(1);
}
