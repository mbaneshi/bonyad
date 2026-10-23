// Identifier helpers shared by every emitter.

const PG_RESERVED = new Set(
  `all analyse analyze and any array as asc asymmetric both case cast check collate column constraint
create current_catalog current_date current_role current_time current_timestamp current_user default
deferrable desc distinct do else end except false fetch for foreign from grant group having in initially
intersect into lateral leading limit localtime localtimestamp not null offset on only or order placing
primary references returning select session_user some symmetric system_user table then to trailing true
union unique user using variadic when where window with`.split(/\s+/),
);

/** Quote a Postgres identifier only when it is a reserved word (keeps output identical to hand-written SQL). */
export function pgIdent(name: string): string {
  return PG_RESERVED.has(name) ? `"${name}"` : name;
}

export function pgTable(code: string): string {
  const [schema, table] = code.split(".") as [string, string];
  return `${pgIdent(schema)}.${pgIdent(table)}`;
}

export function pgString(s: string): string {
  return `'${s.replaceAll("'", "''")}'`;
}

/** snake_case or free text to PascalCase. Words are split on anything that is not [A-Za-z0-9]. */
export function pascal(s: string): string {
  return s
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

const RUST_KEYWORDS = new Set(
  `as break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref
return self Self static struct super trait true type unsafe use where while async await dyn abstract become
box do final macro override priv typeof unsized virtual yield try gen`.split(/\s+/),
);
const RUST_NO_RAW = new Set(["crate", "self", "Self", "super"]);

/** A valid Rust field identifier for a snake_case name. */
export function rustIdent(name: string): string {
  if (RUST_NO_RAW.has(name)) return `${name}_`;
  if (RUST_KEYWORDS.has(name)) return `r#${name}`;
  return name;
}

export function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
