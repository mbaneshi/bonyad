// Seed rows for core.source, core.entity_type and core.field_doc (idempotent).
import { createHash } from "node:crypto";
import type { Model, TypeNode } from "./model.ts";
import { oneLine, pgString } from "./names.ts";
import { GENERATED_BANNER } from "./sql.ts";

/** Name-based (v5-style) uuid so the same source always gets the same id. */
export function sourceId(schema: string, s: TypeNode["doc"]["source"]): string {
  const key = ["bonyad-catalogue-source", schema, s.document, s.section ?? "", s.url ?? "", s.version ?? "", s.accessed_on].join("\n");
  const h = createHash("sha1").update(key).digest();
  h[6] = ((h[6] as number) & 0x0f) | 0x50;
  h[8] = ((h[8] as number) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const nullable = (v: string | undefined) => (v === undefined ? "null" : pgString(v));

const UNIT_OF: Record<string, string> = {
  length: "project length unit",
  angle: "radian",
  area: "project length unit squared",
  volume: "project length unit cubed",
};

export function generateSeed(m: Model): string {
  const tabled = m.types.filter((t) => t.hasTable);
  const sources = new Map<string, TypeNode["doc"]["source"]>();
  for (const n of tabled) sources.set(sourceId(m.schema, n.doc.source), n.doc.source);
  const out = [GENERATED_BANNER(m.schema).replace("Needs the `core` spine", "Seed rows; needs the `core` spine"), ""];

  out.push("insert into core.source (id, software, document, section, url, version, accessed_on) values");
  const srcRows = [...sources.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, s]) =>
      `    (${pgString(id)}, ${pgString(m.schema)}, ${pgString(s.document)}, ${nullable(s.section)}, ${nullable(s.url)}, ${nullable(s.version)}, ${pgString(s.accessed_on)})`,
    );
  out.push(`${srcRows.join(",\n")}\non conflict (id) do nothing;\n`);

  out.push("insert into core.entity_type (code, software, name, db_table, meaning, source_id) values");
  const typeRows = tabled.map((n) =>
    `    (${pgString(n.code)}, ${pgString(m.schema)}, ${pgString(n.doc.name)}, ${pgString(n.code)}, ${pgString(oneLine(n.doc.meaning))}, ${pgString(sourceId(m.schema, n.doc.source))})`,
  );
  out.push(`${[...typeRows].sort().join(",\n")}\non conflict (code) do nothing;\n`);

  const fieldRows: string[] = [];
  for (const n of tabled) {
    for (const c of n.columns) {
      const f = c.field;
      const meaning = c.part ? `${oneLine(f.meaning)} (${c.part})` : oneLine(f.meaning);
      const unit = f.unit ?? UNIT_OF[f.type];
      fieldRows.push(
        `    (${pgString(n.code)}, ${pgString(c.name)}, ${pgString(meaning)}, ${nullable(unit)}, ${nullable(f.source_ref)})`,
      );
    }
  }
  if (fieldRows.length > 0) {
    out.push("insert into core.field_doc (type_code, column_name, meaning, unit, source_ref) values");
    out.push(`${fieldRows.sort().join(",\n")}\non conflict (type_code, column_name) do nothing;`);
  }
  return `${out.join("\n")}\n`;
}
