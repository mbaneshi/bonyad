/** Extracts a C/C++ enum (name, explicit value, doc comment) from a header. Data only. */
export interface EnumEntry {
  name: string;
  value?: number | string;
  doc: string;
}

const tidy = (s: string) =>
  s
    .replace(/^\s*\*+\s?/gm, "")
    .replace(/\s+/g, " ")
    .replace(/@since .*$/, "")
    .trim();

export function parseCEnum(src: string, enumName: string): EnumEntry[] {
  // `typedef enum { ... } NAME;`  or  `enum class NAME { ... };`
  let body: string | undefined;
  const typedef = new RegExp(`typedef\\s+enum[^{;]*\\{([^}]*)\\}\\s*${enumName}\\s*;`).exec(src);
  if (typedef) body = typedef[1];
  else {
    const cls = new RegExp(`enum\\s+(?:class\\s+)?${enumName}\\b[^{]*\\{([\\s\\S]*?)\\}\\s*;`).exec(src);
    body = cls?.[1];
  }
  if (body === undefined) throw new Error(`enum ${enumName} not found`);
  body = body.replace(/^\s*#.*$/gm, "");
  const out: EnumEntry[] = [];
  let pending = "";
  let i = 0;
  while (i < body.length) {
    const rest = body.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\s+/.exec(rest))) i += m[0].length;
    else if ((m = /^\/\*\*<?([\s\S]*?)\*\//.exec(rest))) {
      const trailing = rest.startsWith("/**<");
      const doc = tidy(m[1]!);
      if (trailing && out.length && !out[out.length - 1]!.doc) out[out.length - 1]!.doc = doc;
      else pending = doc;
      i += m[0].length;
    } else if ((m = /^\/\*[\s\S]*?\*\//.exec(rest)) || (m = /^\/\/[^\n]*/.exec(rest))) i += m[0].length;
    else if ((m = /^,/.exec(rest))) i += 1;
    else if ((m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*([^,/]*?))?(?=\s*(?:,|\/\*|\/\/|$))/.exec(rest))) {
      const raw = m[2]?.trim();
      const entry: EnumEntry = { name: m[1]!, doc: pending };
      if (raw !== undefined && raw !== "") entry.value = /^-?\d+$/.test(raw) ? Number(raw) : raw;
      out.push(entry);
      pending = "";
      i += m[0].length;
    } else i += 1; // skip stray character
  }
  return out;
}

/** `#define NAME value` constants matching a prefix, with the preceding doc comment if any. */
export function parseDefines(src: string, prefix: string): EnumEntry[] {
  const out: EnumEntry[] = [];
  const re = new RegExp(`(?:/\\*\\*((?:(?!\\*/)[\\s\\S])*)\\*/\\s*)?#define\\s+(${prefix}\\w*)\\s+(-?\\d+)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push({ name: m[2]!, value: Number(m[3]), doc: tidy(m[1] ?? "") });
  return out;
}
