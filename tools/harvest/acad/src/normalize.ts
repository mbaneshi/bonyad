// Post-processing that makes the raw harvest satisfy catalogue/FORMAT.md rules 4, 5, 8 and 9:
//  - a child type cannot have a `base`: the base's fields are copied into each subtype and the base is dropped
//  - children cannot be nested: a grandchild is re-parented to the owning non-child type and carries one
//    `<level>_index` field per skipped level, so the original nesting stays recoverable
//  - base fields are never repeated in a subtype
//  - reserved column names are renamed (with a note)
//  - a type without fields and without a base, or an abstract base nothing derives from, is dropped (and listed as a gap)
import type { CatType, Field } from "./catalogue.ts";
import type { Gap } from "./gapsdata.ts";

const RESERVED = new Set(["entity_id", "revision_id", "kind", "type_code", "position"]);
const STRUCTURAL = "structural key added by the harvest (not a DXF group code); keeps the original nesting recoverable";

export type Normalized = { types: CatType[]; gaps: Gap[]; stats: Record<string, number> };

/** [from, to, reason]: renames needed so the generator's Rust identifiers are unique. */
const RUST_CLASH_RENAMES: [string, string, string][] = [
  ["acad.field_value", "acad.field_value_entry", "the generated Rust enum name FieldValueUnits clashed with the enum of acad.field.value_units."],
];

const REBASE: [string, string][] = [
  ["acad.attribute_base", "acad.text"],
  ["acad.table_entity", "acad.insert"],
];

const suffix = (code: string) => code.split(".")[1]!;

/** Name of one nesting level, relative to the type that owns it. */
function hopName(code: string, ownerCode: string): string {
  const own = suffix(ownerCode) + "_";
  let s = suffix(code);
  if (s.startsWith(own)) s = s.slice(own.length);
  return s.startsWith("edge_") ? "edge" : s;
}

function addNote(t: CatType, note: string) {
  t.notes = [t.notes, note].filter(Boolean).join(" ");
}

export function normalize(input: CatType[]): Normalized {
  const types = new Map(input.map((t) => [t.code, structuredClone(t)]));
  const gaps: Gap[] = [];
  const stats: Record<string, number> = { flattened: 0, reparented: 0, dedupedFields: 0, renamed: 0, dropped: 0, refsLoosened: 0 };

  const baseChain = (t: CatType): CatType[] => {
    const r: CatType[] = [];
    for (let b = t.base ? types.get(t.base) : undefined; b && r.length < 20; b = b.base ? types.get(b.base) : undefined) r.push(b);
    return r;
  };

  // 1. children with a base: copy the base chain's fields, drop the base
  for (const t of [...types.values()]) {
    if (t.kind !== "child" || !t.base) continue;
    const chain = baseChain(t).reverse();
    const own = new Set(t.fields.map((f) => f.name));
    const inherited: Field[] = [];
    for (const b of chain) for (const f of b.fields) if (!own.has(f.name) && !inherited.some((x) => x.name === f.name)) inherited.push(structuredClone(f));
    const polymorphicBase = chain.find((b) => b.kind === "child");
    const extra: Field[] = [];
    if (polymorphicBase) {
      const name = `${hopName(polymorphicBase.code, t.parent!)}_index`;
      extra.push({ name, type: "int", meaning: `Index of this row in the owner's ordered list, which mixes several row types (${polymorphicBase.name}).`, source_ref: STRUCTURAL });
    }
    const baseCode = t.base;
    t.fields = [...extra, ...inherited, ...t.fields];
    delete t.base;
    addNote(t, `Fields of ${chain.map((b) => b.code).join(", ")} are copied in because a child type cannot have a base (FORMAT.md rule 5); base: ${baseCode}.`);
    stats.flattened!++;
  }

  // 1b. the 16 pilot tables exist in migration 20261023000005 with exactly their own fields and no subtypes
  //     (so no type_code column). ACadSharp derives ATTRIB/ATTDEF from TEXT and TABLE from INSERT; DXF repeats
  //     those groups in the derived entity, so the fields are copied and the derived type hangs off graphic_entity.
  for (const [code, pilot] of REBASE) {
    const t = types.get(code);
    const p = types.get(pilot);
    if (!t || !p || t.base !== pilot) continue;
    const own = new Set(t.fields.map((f) => f.name));
    t.fields = [...p.fields.filter((f) => !own.has(f.name)).map((f) => structuredClone(f)), ...t.fields];
    t.base = p.base;
    addNote(t, `Fields of ${pilot} are copied in (the DXF entity repeats those group codes) instead of deriving from it, so the migrated table ${pilot} keeps exactly its fields.`);
    stats.rebased = (stats.rebased ?? 0) + 1;
  }

  // a field-less polymorphic base has no rows of its own once its subtypes are flattened
  for (const t of [...types.values()]) {
    if (t.kind === "child" && t.fields.length === 0 && !t.base && ![...types.values()].some((x) => x.base === t.code)) {
      types.delete(t.code);
      stats.dropped!++;
      gaps.push({ type: t.code, what: t.name, why: "a field-less polymorphic list base; its subtypes carry the fields and an index field, so it is not stored", kind: "skipped" });
    }
  }

  // 2. nested children: re-parent to the owning non-child type
  for (const t of types.values()) {
    if (t.kind !== "child") continue;
    const hops: string[] = [];
    let p = types.get(t.parent!);
    let owner = t.parent!;
    while (p && p.kind === "child") {
      hops.push(hopName(p.code, p.parent!));
      owner = p.parent!;
      p = types.get(owner);
    }
    if (hops.length === 0) continue;
    const idx: Field[] = hops.reverse().map((h) => ({
      name: `${h}_index`, type: "int" as const,
      meaning: `Position of the owning ${h} row within its parent (0-based).`, source_ref: STRUCTURAL,
    }));
    const before = t.parent!;
    t.parent = owner;
    t.fields = [...idx, ...t.fields.filter((f) => !idx.some((i) => i.name === f.name))];
    addNote(t, `In the source this is nested inside ${before}; nested children are not supported (FORMAT.md rule 5), so it is a child of ${owner} and the *_index field(s) identify the owning row(s).`);
    stats.reparented!++;
  }

  // 3. base fields are not repeated in subtypes
  for (const t of types.values()) {
    const taken = new Set(baseChain(t).flatMap((b) => b.fields.map((f) => f.name)));
    const keep = t.fields.filter((f) => !taken.has(f.name));
    if (keep.length !== t.fields.length) {
      const dropped = t.fields.filter((f) => taken.has(f.name)).map((f) => f.name);
      stats.dedupedFields! += dropped.length;
      t.fields = keep;
      addNote(t, `Not repeated here (already defined on a base type): ${dropped.join(", ")}.`);
    }
  }

  // 4. reserved column names
  for (const t of types.values()) {
    for (const f of t.fields) {
      if (!RESERVED.has(f.name)) continue;
      const old = f.name;
      f.name = `dxf_${old}`;
      addNote(t, `Field \`${old}\` of the source is renamed \`${f.name}\` because \`${old}\` is a reserved column name (FORMAT.md rule 9).`);
      stats.renamed!++;
    }
  }

  // 4b. hand corrections where the source's own modelling would mislead
  const hv = types.get("acad.hatch_path_edge_polyline_vertex");
  if (hv) {
    const pt = hv.fields.find((f) => f.name === "point");
    if (pt && pt.type === "point3") {
      pt.type = "point2";
      pt.meaning = "Vertex position (X and Y only).";
      pt.source_ref = "count in group code 93; position in group codes 10, 20 (ACadSharp doc: 'Position values are only X and Y')";
      hv.fields.push({
        name: "bulge", type: "float", default: 0,
        meaning: "Bulge of the segment starting at this vertex (0 = straight); ACadSharp keeps it in the Z of the vertex, DXF stores it in an optional group 42.",
        source_ref: "group code 42 (optional; ACadSharp Polyline.Bulges = Vertices.Select(v => v.Z))",
      });
      hv.meaning = "Vertices of a polyline boundary path of a hatch (one row per vertex, ordered), each with an optional bulge.";
      addNote(hv, "Split into position (point2) and bulge: ACadSharp stores both in one XYZ.");
    }
  }

  // 5. drop types that cannot be stored; repeat until stable
  for (let changed = true; changed; ) {
    changed = false;
    const used = new Set<string>();
    for (const t of types.values()) {
      if (t.base) used.add(t.base);
      if (t.parent) used.add(t.parent);
    }
    for (const t of [...types.values()]) {
      const noFieldsNoBase = t.fields.length === 0 && !t.base && t.kind !== "abstract";
      const orphanAbstract = t.kind === "abstract" && t.fields.length > 0 && !used.has(t.code);
      const emptyBase = t.fields.length === 0 && !t.base && t.kind === "child" && !used.has(t.code);
      if (noFieldsNoBase || orphanAbstract || emptyBase) {
        types.delete(t.code);
        stats.dropped!++;
        gaps.push({
          type: t.code, what: t.name,
          why: noFieldsNoBase
            ? "the source defines no data fields for this type (only the common object data); the format requires at least one field, so it is not stored as a table"
            : "its fields were copied into each subtype (a child type cannot have a base), so the base itself is not stored",
          kind: "skipped",
        });
        changed = true;
      }
    }
  }

  // 6. references to types that are not in the catalogue, or are child rows without their own id
  for (const t of types.values()) {
    for (const f of t.fields) {
      if (f.type !== "ref" || !f.ref_to || f.ref_to === "any") continue;
      const target = types.get(f.ref_to);
      if (!target || target.kind === "child" || (target.kind === "abstract" && target.fields.length === 0)) {
        addNote(t, `Field \`${f.name}\` points at ${f.ref_to} in the source; that type is not an addressable table here, so ref_to is \`any\`.`);
        f.ref_to = "any";
        stats.refsLoosened!++;
      }
    }
  }
  // 7. the generator derives Rust names `<Type>` and `<Type>Row`; a type named `<other>_row` would clash with `<other>`
  for (const t of [...types.values()]) {
    if (!t.code.endsWith("_row")) continue;
    const other = t.code.slice(0, -4);
    if (!types.has(other)) continue;
    const next = `${t.code}_item`;
    types.delete(t.code);
    for (const x of types.values()) if (x.parent === t.code) x.parent = next;
    t.code = next;
    types.set(next, t);
    addNote(t, `Renamed from ${other}_row: the generated Rust row type of ${other} is already called ${other}_row.`);
    stats.renamed!++;
  }
  // 8. generated Rust enum names (`<Type><Field>`) must be unique too; hand renames found by running the generator
  for (const [from, to, why] of RUST_CLASH_RENAMES) {
    const t = types.get(from);
    if (!t) continue;
    types.delete(from);
    for (const x of types.values()) if (x.parent === from) x.parent = to;
    t.code = to;
    types.set(to, t);
    addNote(t, `Renamed from ${from}: ${why}`);
    stats.renamed!++;
  }
  return { types: [...types.values()], gaps, stats };
}
