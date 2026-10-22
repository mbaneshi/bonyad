// Rust for one schema: pure domain types (no sqlx) and generated row types with conversions.
import type { Column, Model, TypeNode } from "./model.ts";
import { componentParts } from "./model.ts";
import { COMPONENTS, type Field } from "./schema.ts";
import { oneLine, pascal, rustIdent } from "./names.ts";

const U = "bonyad_units";
const STRING = "::std::string::String";
const VEC = "::std::vec::Vec";
const OPTION = "::core::option::Option";
const RESULT = "::core::result::Result";
const MEASURE_NEWTYPE: Record<string, string> = {
  length: "Length",
  angle: "Angle",
  area: "Area",
  volume: "Volume",
  ratio: "Ratio",
};
const SCALAR_DOMAIN: Record<string, string> = {
  text: STRING,
  int: "i32",
  bigint: "i64",
  float: "f64",
  bool: "bool",
  date: "::time::Date",
  timestamp: "::time::OffsetDateTime",
};

export interface RustNames {
  struct: string;
  row: string;
}

export function rustNames(n: TypeNode): RustNames {
  const p = pascal(n.table);
  return { struct: p, row: `${p}Row` };
}

export function enumName(n: TypeNode, f: Field): string {
  return `${pascal(n.table)}${pascal(f.name)}`;
}

function variantNames(values: { value: string }[]): string[] {
  const used = new Set<string>();
  return values.map((v, i) => {
    let name = pascal(v.value);
    if (name === "") name = `Value${i}`;
    if (/^[0-9]/.test(name)) name = `V${name}`;
    if (name === "Self") name = "Self_";
    let candidate = name;
    for (let k = 2; used.has(candidate); k++) candidate = `${name}${k}`;
    used.add(candidate);
    return candidate;
  });
}

/** Domain type of a field. */
function domainType(n: TypeNode, f: Field): string {
  let t: string;
  if (f.type in MEASURE_NEWTYPE) t = `${U}::${MEASURE_NEWTYPE[f.type]}`;
  else if (f.type === "point2") t = `${U}::Point2`;
  else if (f.type === "point3") t = `${U}::Point3`;
  else if (f.type === "vector3") t = `${U}::Vector3`;
  else if (f.type === "matrix4") t = `${U}::Matrix4`;
  else if (f.type === "ref") t = "::uuid::Uuid";
  else if (f.type === "blob") t = `${VEC}<u8>`;
  else if (f.type === "enum") t = enumName(n, f);
  else if (f.type === "array") {
    const el = f.of as string;
    t = `${VEC}<${el in MEASURE_NEWTYPE ? `${U}::${MEASURE_NEWTYPE[el]}` : SCALAR_DOMAIN[el]}>`;
  } else t = SCALAR_DOMAIN[f.type] as string;
  return f.nullable ? `${OPTION}<${t}>` : t;
}

function rowType(c: Column): string {
  let t: string;
  if (c.rust.t === "array") t = `${VEC}<${c.rust.elem}>`;
  else if (c.rust.t === "enum") t = STRING;
  else t = c.rust.row;
  return c.notNull ? t : `${OPTION}<${t}>`;
}

const isComposite = (f: Field) => f.type in COMPONENTS;
const isFallible = (n: TypeNode) => n.doc.fields.some((f) => f.type === "enum" || (isComposite(f) && f.nullable));

function colId(c: Column): string {
  return rustIdent(c.name);
}

/** Expression building the domain value of field f from `row`. */
function fromRowExpr(n: TypeNode, f: Field): string {
  const cols = n.columns.filter((c) => c.field === f);
  const r = (c: Column) => `row.${colId(c)}`;
  if (isComposite(f)) {
    const parts = componentParts(f.type);
    const build = (vars: string[]): string => {
      if (f.type === "point2") return `${U}::Point2 { x: ${U}::Length(${vars[0]}), y: ${U}::Length(${vars[1]}) }`;
      if (f.type === "point3")
        return `${U}::Point3 { x: ${U}::Length(${vars[0]}), y: ${U}::Length(${vars[1]}), z: ${U}::Length(${vars[2]}) }`;
      if (f.type === "vector3") return `${U}::Vector3 { x: ${vars[0]}, y: ${vars[1]}, z: ${vars[2]} }`;
      return `${U}::Matrix4([${vars.join(", ")}])`;
    };
    if (!f.nullable) return build(cols.map(r));
    const vars = parts.map((_, i) => `v${i}`);
    return `{
        let parts = [${cols.map(r).join(", ")}];
        if parts.iter().all(${OPTION}::is_none) {
            ${OPTION}::None
        } else if parts.iter().all(${OPTION}::is_some) {
            let [${vars.join(", ")}] = parts.map(|v| v.unwrap_or_default());
            ${OPTION}::Some(${build(vars)})
        } else {
            return ${RESULT}::Err(crate::ConversionError::new("${f.name}", "some components are null and some are not"));
        }
    }`;
  }
  const c = cols[0] as Column;
  const raw = r(c);
  const measure = MEASURE_NEWTYPE[f.type];
  if (measure) return f.nullable ? `${raw}.map(${U}::${measure})` : `${U}::${measure}(${raw})`;
  if (f.type === "enum") {
    const e = `crate::domain::${enumName(n, f)}`;
    const bad = `crate::ConversionError::new("${f.name}", "unknown enum value")`;
    return f.nullable
      ? `${raw}.as_deref().map(|v| ${e}::parse(v).ok_or(${bad})).transpose()?`
      : `${e}::parse(&${raw}).ok_or(${bad})?`;
  }
  if (f.type === "array" && (f.of as string) in MEASURE_NEWTYPE) {
    const m = `${U}::${MEASURE_NEWTYPE[f.of as string]}`;
    return f.nullable
      ? `${raw}.map(|v| v.into_iter().map(${m}).collect())`
      : `${raw}.into_iter().map(${m}).collect()`;
  }
  return raw;
}

/** [column id, expression] pairs filling the row from `self`. */
function intoRowExprs(n: TypeNode, f: Field): [string, string][] {
  const cols = n.columns.filter((c) => c.field === f);
  const fid = rustIdent(f.name);
  const s = `self.${fid}`;
  if (isComposite(f)) {
    const parts = componentParts(f.type);
    return cols.map((c, i) => {
      const part = parts[i] as string;
      let access: string;
      if (f.type === "matrix4") access = `.0[${i}]`;
      else if (f.type === "vector3") access = `.${part}`;
      else access = `.${part}.0`;
      return [colId(c), f.nullable ? `${s}.map(|v| v${access})` : `${s}${access}`];
    });
  }
  const c = cols[0] as Column;
  const measure = MEASURE_NEWTYPE[f.type];
  let e = s;
  if (measure) e = f.nullable ? `${s}.map(|v| v.0)` : `${s}.0`;
  else if (f.type === "enum") e = f.nullable ? `${s}.map(|v| v.as_str().to_owned())` : `${s}.as_str().to_owned()`;
  else if (f.type === "array" && (f.of as string) in MEASURE_NEWTYPE) {
    e = f.nullable
      ? `${s}.map(|v| v.into_iter().map(|x| x.0).collect())`
      : `${s}.into_iter().map(|x| x.0).collect()`;
  }
  return [[colId(c), e]];
}

export function generateDomain(m: Model): string {
  const out: string[] = [
    `//! Pure domain types for the \`${m.schema}\` catalogue: units as newtypes, no database dependency.`,
    "//!",
    "//! Each struct holds the type's OWN fields. A type with a `base` keeps the base fields in the base",
    "//! type's struct (see the row types in `rows`).",
    "",
  ];
  for (const n of m.types.filter((t) => t.hasTable)) {
    const names = rustNames(n);
    out.push(`/// ${oneLine(n.doc.name)}: ${oneLine(n.doc.meaning)} (\`${n.code}\`)`);
    out.push("#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]");
    out.push(`pub struct ${names.struct} {`);
    for (const f of n.doc.fields) {
      out.push(`    /// ${oneLine(f.meaning)}`);
      out.push(`    pub ${rustIdent(f.name)}: ${domainType(n, f)},`);
    }
    out.push("}", "");
    for (const f of n.doc.fields.filter((x) => x.type === "enum")) {
      const e = enumName(n, f);
      const vs = f.values as { value: string; meaning: string }[];
      const vn = variantNames(vs);
      out.push(`/// ${oneLine(f.meaning)} (\`${n.code}.${f.name}\`)`);
      out.push("#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, ::serde::Serialize, ::serde::Deserialize)]");
      out.push(`pub enum ${e} {`);
      vs.forEach((v, i) => {
        out.push(`    /// ${oneLine(v.meaning)}`);
        out.push(`    #[serde(rename = ${JSON.stringify(v.value)})]`);
        out.push(`    ${vn[i]},`);
      });
      out.push("}", "");
      out.push(`impl ${e} {`);
      out.push(`    /// Every value, in catalogue order.`);
      out.push(`    pub const ALL: [${e}; ${vs.length}] = [${vn.map((v) => `${e}::${v}`).join(", ")}];`, "");
      out.push("    /// The stored text (what the database column holds).");
      out.push("    pub fn as_str(self) -> &'static str {", "        match self {");
      vs.forEach((v, i) => out.push(`            ${e}::${vn[i]} => ${JSON.stringify(v.value)},`));
      out.push("        }", "    }", "");
      out.push("    /// The value for stored text, if it is one of the catalogue's values.");
      out.push(`    pub fn parse(text: &str) -> ${OPTION}<Self> {`, "        match text {");
      vs.forEach((v, i) => out.push(`            ${JSON.stringify(v.value)} => ${OPTION}::Some(${e}::${vn[i]}),`));
      out.push(`            _ => ${OPTION}::None,`, "        }", "    }", "}", "");
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}

export function generateRows(m: Model): string {
  const out: string[] = [
    `//! Row types for the \`${m.schema}\` tables (sqlx::FromRow) and their conversions to the domain types.`,
    "//!",
    "//! Key columns come first. `into_row` takes the key values a domain value does not carry.",
    "",
  ];
  for (const n of m.types.filter((t) => t.hasTable)) {
    const names = rustNames(n);
    const dom = `crate::domain::${names.struct}`;
    out.push(`/// One row of \`${n.code}\`.`);
    out.push("#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]");
    out.push(`pub struct ${names.row} {`);
    out.push("    pub entity_id: ::uuid::Uuid,", "    pub revision_id: i64,");
    if (n.isChild) out.push("    pub position: i32,");
    else out.push(`    pub ${n.discriminator}: ${STRING},`);
    for (const c of n.columns) {
      if (colId(c) !== c.name) out.push(`    #[sqlx(rename = ${JSON.stringify(c.name)})]`);
      out.push(`    pub ${colId(c)}: ${rowType(c)},`);
    }
    out.push("}", "");

    const hasFields = n.doc.fields.length > 0;
    const rowVar = hasFields ? "row" : "_row";
    if (isFallible(n)) {
      out.push(`impl ::core::convert::TryFrom<${names.row}> for ${dom} {`);
      out.push("    type Error = crate::ConversionError;", "");
      out.push(`    fn try_from(${rowVar}: ${names.row}) -> ${RESULT}<Self, Self::Error> {`);
      out.push(`        ${RESULT}::Ok(Self {`);
    } else {
      out.push(`impl ::core::convert::From<${names.row}> for ${dom} {`);
      out.push(`    fn from(${rowVar}: ${names.row}) -> Self {`, "        Self {");
    }
    for (const f of n.doc.fields) out.push(`            ${rustIdent(f.name)}: ${fromRowExpr(n, f)},`);
    out.push(isFallible(n) ? "        })" : "        }", "    }", "}", "");

    const extra = n.isChild ? ", position: i32" : n.discriminator === "type_code" ? `, type_code: impl ::core::convert::Into<${STRING}>` : "";
    const disc = n.isChild
      ? "position"
      : n.discriminator === "kind"
        ? `kind: ${JSON.stringify(n.code)}.to_owned()`
        : "type_code: type_code.into()";
    out.push(`impl ${dom} {`);
    out.push("    /// The row for this value, with the key columns the value does not carry.");
    out.push(`    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64${extra}) -> ${names.row} {`);
    out.push(`        ${names.row} {`, "            entity_id,", "            revision_id,", `            ${disc},`);
    for (const f of n.doc.fields) for (const [id, e] of intoRowExprs(n, f)) out.push(`            ${id}: ${e},`);
    out.push("        }", "    }", "}", "");
  }
  out.push("#[cfg(test)]", "mod tests {", "    use super::*;", "");
  for (const n of m.types.filter((t) => t.hasTable)) out.push(...testsFor(n), "");
  out.push("}");
  return `${out.join("\n").trimEnd()}\n`;
}

/** A deterministic sample value for a column, distinct per column index. */
function sampleValue(n: TypeNode, c: Column, i: number): string {
  const f = c.field;
  const x = (1.5 + i * 0.25).toFixed(2);
  switch (c.rust.t) {
    case "enum":
      return `${JSON.stringify((f.values as { value: string }[])[0]?.value)}.to_owned()`;
    case "array":
      return `vec![${c.rust.elem === "f64" ? x : c.rust.elem === "i32" ? "1" : c.rust.elem === "i64" ? "1" : c.rust.elem === "bool" ? "true" : c.rust.elem === STRING ? '"x".to_owned()' : c.rust.elem === "::time::Date" ? DATE : "::time::OffsetDateTime::UNIX_EPOCH"}]`;
    default:
  }
  const t = c.rust.row;
  if (t === "f64") return x;
  if (t === "i32" || t === "i64") return `${i + 1}`;
  if (t === "bool") return "true";
  if (t === STRING) return `"x".to_owned()`;
  if (t === "::uuid::Uuid") return `::uuid::Uuid::from_u128(${i + 1})`;
  if (t === "::time::Date") return DATE;
  if (t === "::time::OffsetDateTime") return "::time::OffsetDateTime::UNIX_EPOCH";
  return "vec![1, 2, 3]";
}
const DATE = "::time::Date::from_calendar_date(2026, ::time::Month::October, 23).expect(\"valid date\")";

function rowLiteral(n: TypeNode, mode: "filled" | "nulls" | { partial: Field }): string {
  const names = rustNames(n);
  const key = n.isChild ? "position: 3," : n.discriminator === "kind" ? `kind: ${JSON.stringify(n.code)}.to_owned(),` : `type_code: ${JSON.stringify(n.concrete ? n.code : n.typeCodes[0])}.to_owned(),`;
  const lines = [`${names.row} {`, "entity_id: ::uuid::Uuid::from_u128(100),", "revision_id: 7,", key];
  n.columns.forEach((c, i) => {
    let v = sampleValue(n, c, i);
    if (!c.notNull) {
      const partial = typeof mode === "object" && mode.partial === c.field;
      const keep = mode === "filled" || (partial && c.part === componentParts(c.field.type)[0]);
      v = keep ? `${OPTION}::Some(${v})` : `${OPTION}::None`;
    }
    lines.push(`${colId(c)}: ${v},`);
  });
  lines.push("}");
  return lines.join("\n");
}

function testsFor(n: TypeNode): string[] {
  const names = rustNames(n);
  const dom = `crate::domain::${names.struct}`;
  const extra = n.isChild ? ", row.position" : n.discriminator === "type_code" ? ", row.type_code.clone()" : "";
  const conv = (v: string) => (isFallible(n) ? `<${dom} as ::core::convert::TryFrom<${names.row}>>::try_from(${v}).expect("converts")` : `${dom}::from(${v})`);
  const out: string[] = [];
  const modes: ["filled" | "nulls", string][] = [["filled", "filled"]];
  if (n.columns.some((c) => !c.notNull)) modes.push(["nulls", "nulls"]);
  for (const [mode, label] of modes) {
    out.push("#[test]", `fn ${n.table}_round_trips_${label}() {`, `let row = ${rowLiteral(n, mode)};`);
    out.push(`let value = ${conv("row.clone()")};`, `assert_eq!(value.into_row(row.entity_id, row.revision_id${extra}), row);`, "}");
  }
  for (const f of n.doc.fields.filter((x) => isComposite(x) && x.nullable)) {
    out.push("#[test]", `fn ${n.table}_${f.name}_rejects_partial_null() {`, `let row = ${rowLiteral(n, { partial: f })};`);
    out.push(`assert!(<${dom} as ::core::convert::TryFrom<${names.row}>>::try_from(row).is_err());`, "}");
  }
  return out;
}

export function crateName(schema: string, golden: boolean): string {
  return `bonyad-cat-${golden ? "golden-" : ""}${schema.replaceAll("_", "-")}`;
}

export function generateLib(m: Model): string {
  return `//! GENERATED by tools/catalogue from catalogue/${m.schema}/. Do not edit: change the catalogue and regenerate.
//!
//! Entity types of the \`${m.schema}\` schema: \`domain\` holds pure types (no database), \`rows\` the
//! sqlx row types and their conversions.
#![allow(clippy::enum_variant_names, clippy::upper_case_acronyms)]

pub mod domain;
pub mod rows;

/// A stored row could not be turned into a domain value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversionError {
    pub column: &'static str,
    pub reason: &'static str,
}

impl ConversionError {
    pub fn new(column: &'static str, reason: &'static str) -> Self {
        Self { column, reason }
    }
}

impl ::core::fmt::Display for ConversionError {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        write!(f, "column {}: {}", self.column, self.reason)
    }
}

impl ::std::error::Error for ConversionError {}
`;
}

export function generateCargoToml(m: Model, golden: boolean): string {
  return `# GENERATED by tools/catalogue from catalogue/${m.schema}/. Do not edit.
[package]
name = "${crateName(m.schema, golden)}"
version = "0.0.0"
edition.workspace = true
license.workspace = true
publish.workspace = true
description = "Generated entity types for the ${m.schema} catalogue schema."

[lints]
workspace = true

[dependencies]
bonyad-units = { workspace = true }
serde = { workspace = true }
sqlx = { workspace = true }
time = { workspace = true, features = ["serde"] }
uuid = { workspace = true }
`;
}
