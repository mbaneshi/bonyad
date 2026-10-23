// Post-pass that makes the harvested entries satisfy catalogue/FORMAT.md rules the raw conversion does not know:
// children carry no base (5), arrays take no default, empty types are abstract or removed (8), and the generated
// "<schema>_<table>_append_only" name stays within Postgres' 63 bytes.
import type { Entry, Field } from "./model.ts";

export interface GapLike {
  where: string;
  what: string;
}

export const maxTable = (schema: string): number => 63 - schema.length - 1 - "_append_only".length;

const ABBREV: [RegExp, string][] = [
  [/interactivity/g, "interact"],
  [/declaration/g, "decl"],
  [/compression/g, "compr"],
  [/attribute/g, "attr"],
];

/** Shortens a snake_case table name by abbreviating long words; truncates with a short hash as a last resort. */
export function shortTable(t: string, max: number): string {
  if (t.length <= max) return t;
  let s = t;
  for (const [re, to] of ABBREV) {
    s = s.replace(re, to);
    if (s.length <= max) return s;
  }
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${s.slice(0, max - 4)}_${(h % 0xfff).toString(16).padStart(3, "0")}`.replace(/__+/g, "_");
}

const note = (e: Entry, text: string): void => {
  e.notes = e.notes ? `${e.notes} ${text}` : text;
};

export function conform(entries: Entry[], gaps: GapLike[]): Entry[] {
  let list = [...entries];
  const byCode = () => new Map(list.map((e) => [e.code, e]));

  // 1. arrays take no default: keep the stated default in the text
  for (const e of list)
    for (const f of e.fields)
      if (f.type === "array" && f.default !== undefined) {
        f.meaning += ` Default in the schema: ${JSON.stringify(f.default)}.`;
        delete f.default;
        f.nullable = true;
      }

  // 1b. a child that owns children cannot stay a child (format rule 5): it becomes an `object` row of its own that
  // points at its owner and records its position in the owner's array
  {
    const parents = new Set(list.filter((e) => e.kind === "child").map((e) => e.parent!));
    for (const e of list) {
      if (e.kind === "child" && parents.has(e.code)) {
        const owner = e.parent!;
        e.kind = "object";
        delete e.parent;
        e.fields.unshift(
          { name: "owner", type: "ref", ref_to: owner, meaning: `The ${owner.split(".")[1]} row this object belongs to.`, source_ref: "JSON nesting" },
          { name: "index", type: "int", meaning: "Position of this object in its owner's array (0 for a single nested object).", source_ref: "array position in the source JSON" },
        );
        note(e, `Promoted from a child row to an object row because it owns child rows itself (format rule 5: no nested children); owner and index keep the nesting.`);
      }
    }
  }
  // 1c. children carry no base: flatten the base chain's fields into the child
  const m = byCode();
  for (const e of list) {
    if (e.kind === "child" && e.base) {
      const chain: Entry[] = [];
      for (let b = m.get(e.base); b; b = b.base ? m.get(b.base) : undefined) chain.unshift(b);
      const have = new Set(e.fields.map((f) => f.name));
      const inherited: Field[] = [];
      for (const b of chain) for (const f of b.fields) if (!have.has(f.name)) { have.add(f.name); inherited.push({ ...f }); }
      e.fields = [...inherited, ...e.fields];
      if (inherited.length) note(e, `Fields of the source base type ${e.base.split(".")[1]} are copied here because a child type cannot have a base.`);
      delete e.base;
    }
  }

  // 2. drop free-form placeholders: no fields, no base, nothing to store
  const usedAsBase = () => new Set(list.map((e) => e.base).filter(Boolean) as string[]);
  const removed = new Map<string, string>(); // code -> replacement ref_to ("any")
  const hasKids = (c: string) => list.some((e) => e.parent === c);

  const base = usedAsBase();
  for (const e of [...list]) {
    if (e.fields.length === 0 && !e.base && e.kind !== "abstract") {
      if (base.has(e.code)) {
        e.kind = "abstract";
        delete e.parent;
        e.needs_review = e.needs_review;
        continue;
      }
      if (hasKids(e.code)) continue;
      removed.set(e.code, "any");
      gaps.push({ where: e.code, what: "free-form or generic JSON container with no named members; not modelled as a type" });
      list = list.filter((x) => x !== e);
    }
  }
  // dangling refs to removed types
  for (const e of list)
    for (const f of [...e.fields]) {
      if (f.type === "ref" && f.ref_to && removed.has(f.ref_to)) {
        gaps.push({ where: `${e.code}.${f.name}`, what: `refers to ${f.ref_to}, a free-form container that was not modelled; field dropped` });
        e.fields = e.fields.filter((x) => x !== f);
        e.needs_review = true;
        note(e, `Review: member ${f.name} points to a free-form JSON object that is not modelled (see GAPS.md).`);
      }
    }

  // 4. identifier length
  const rename = new Map<string, string>();
  const taken = new Set(list.map((e) => e.code));
  for (const e of list) {
    const [schema, table] = e.code.split(".") as [string, string];
    const short = shortTable(table, maxTable(schema));
    if (short !== table) {
      const code = `${schema}.${short}`;
      if (taken.has(code)) throw new Error(`short name collision ${code}`);
      taken.add(code);
      rename.set(e.code, code);
    }
  }
  const re = (c: string | undefined) => (c ? rename.get(c) ?? c : c);
  for (const e of list) {
    if (rename.has(e.code)) note(e, `Table name shortened from ${e.code.split(".")[1]} to fit Postgres' 63-byte identifier limit.`);
    e.code = re(e.code)!;
    if (e.base) e.base = re(e.base);
    if (e.parent) e.parent = re(e.parent);
    for (const f of e.fields) if (f.ref_to) f.ref_to = re(f.ref_to);
  }
  return list;
}
