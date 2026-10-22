/** Parser for the restricted SQL DDL subset used by the GeoPackage spec and PROJ table defs.
 *  Understands CREATE TABLE with column definitions, inline NOT NULL / PRIMARY KEY / UNIQUE / DEFAULT,
 *  and table constraints (PRIMARY KEY, UNIQUE, FOREIGN KEY ... REFERENCES). Anything else is ignored. */
export interface Column {
  name: string;
  sqlType: string;
  notNull: boolean;
  primaryKey: boolean;
  unique: boolean;
  default?: string;
  checkIn?: string[]; // from CHECK (col IN ('a','b'))
  comment?: string;
}
export interface ForeignKey {
  columns: string[];
  refTable: string;
  refColumns: string[];
}
export interface Table {
  name: string;
  columns: Column[];
  primaryKey: string[];
  unique: string[][];
  foreignKeys: ForeignKey[];
}

const stripQuotes = (s: string) => s.replace(/^['"`]|['"`]$/g, "");

function splitTop(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  let quote = "";
  for (const c of body) {
    if (quote) {
      cur += c;
      if (c === quote) quote = "";
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
    } else if (c === "(") {
      depth++;
      cur += c;
    } else if (c === ")") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const cols = (s: string) => s.split(",").map((x) => stripQuotes(x.trim()));

export function parseCreateTables(sql: string): Table[] {
  // drop '--' line comments and '/* */' comments but remember '//' trailing comments per line
  const comments = new Map<string, string>();
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => {
      const m = l.match(/^(.*?)(?:\/\/|--)\s*(.*)$/);
      if (m) {
        const colName = m[1]!.trim().split(/\s+/)[0];
        if (colName && m[2]) comments.set(colName, m[2].trim());
        return m[1]!;
      }
      return l;
    })
    .join("\n");

  const tables: Table[] = [];
  const re = /CREATE\s+TABLE\s+(?:IF NOT EXISTS\s+)?['"`]?(\w+)['"`]?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    let depth = 1;
    let j = re.lastIndex;
    for (; j < cleaned.length && depth > 0; j++) {
      if (cleaned[j] === "(") depth++;
      else if (cleaned[j] === ")") depth--;
    }
    const body = cleaned.slice(re.lastIndex, j - 1);
    const t: Table = { name: m[1]!, columns: [], primaryKey: [], unique: [], foreignKeys: [] };
    for (const item of splitTop(body)) {
      const up = item.toUpperCase();
      let c: RegExpMatchArray | null;
      if (up.startsWith("CONSTRAINT") || up.startsWith("PRIMARY KEY") || up.startsWith("UNIQUE") || up.startsWith("FOREIGN KEY") || up.startsWith("CHECK")) {
        if ((c = item.match(/PRIMARY KEY\s*\(([^)]*)\)/i))) t.primaryKey = cols(c[1]!);
        else if ((c = item.match(/FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s+['"`]?(\w+)['"`]?\s*\(([^)]*)\)/i)))
          t.foreignKeys.push({ columns: cols(c[1]!), refTable: c[2]!, refColumns: cols(c[3]!) });
        else if ((c = item.match(/UNIQUE\s*\(([^)]*)\)/i))) t.unique.push(cols(c[1]!));
        continue;
      }
      const cm = item.match(/^['"`]?(\w+)['"`]?\s+([A-Za-z_]+)(.*)$/s);
      if (!cm) continue;
      const rest = cm[3]!;
      const col: Column = {
        name: cm[1]!,
        sqlType: cm[2]!.toUpperCase(),
        notNull: /NOT\s+NULL/i.test(rest),
        primaryKey: /PRIMARY\s+KEY/i.test(rest),
        unique: /\bUNIQUE\b/i.test(rest),
      };
      const d = rest.match(/DEFAULT\s+(\([^)]*(?:\([^)]*\)[^)]*)*\)|'[^']*'|[^\s,]+)/i);
      if (d) col.default = d[1]!;
      const ci = rest.match(/CHECK\s*\(\s*\w+\s+IN\s*\(([^)]*)\)\s*\)/i);
      if (ci) col.checkIn = ci[1]!.split(",").map((x) => stripQuotes(x.trim()));
      const cmt = comments.get(col.name);
      if (cmt) col.comment = cmt;
      if (col.primaryKey) t.primaryKey = [col.name];
      t.columns.push(col);
    }
    tables.push(t);
  }
  return tables;
}
