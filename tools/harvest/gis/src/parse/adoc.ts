/** Minimal AsciiDoc pipe-table reader for the OGC GeoPackage sources. Data only; never evaluates input. */
export interface AdocTable {
  id: string;
  title: string;
  header: string[];
  rows: string[][];
}

export function cleanCell(s: string): string {
  return s
    .replace(/\^<<[^>]*>>\^/g, "")
    .replace(/footnote:\[[^\]]*\]/g, "")
    .replace(/<<[^>]*>>/g, "")
    .replace(/link:(\S+?)\[([^\]]*)\]/g, "$2")
    .replace(/https?:\/\/\S+?\[([^\]]*)\]/g, "$1")
    .replace(/\\([<>|'])/g, "$1")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === "\\" && line[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (c === "|") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.slice(1).map(cleanCell); // first piece precedes the leading '|'
}

export function parseTable(adoc: string, id: string): AdocTable {
  const lines = adoc.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^\\[(?:#|\\[)${id}[,\\]]`).test(l));
  if (start < 0) throw new Error(`table #${id} not found`);
  let title = "";
  let i = start + 1;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith(".") && !title) title = l.slice(1).trim();
    if (/^\|={3,}/.test(l)) break;
  }
  const rows: string[][] = [];
  for (i++; i < lines.length && !/^\|={3,}/.test(lines[i]!); i++) {
    const l = lines[i]!;
    if (l.startsWith("|")) rows.push(splitCells(l));
  }
  const [header, ...body] = rows;
  if (!header) throw new Error(`table #${id} has no rows`);
  return { id, title, header, rows: body };
}

/** All ```[source,sql]``` blocks (between ---- fences) in a document. */
export function sqlBlocks(adoc: string): string[] {
  const out: string[] = [];
  const lines = adoc.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\[source,sql\]/.test(lines[i]!)) {
      if (lines[i + 1]?.trim() !== "----") continue;
      const buf: string[] = [];
      for (i += 2; i < lines.length && lines[i]!.trim() !== "----"; i++) buf.push(lines[i]!);
      out.push(buf.join("\n"));
    }
  }
  return out;
}
