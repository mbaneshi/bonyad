// Reads the buildingSMART IFC4.3.x-development documentation (Markdown) for descriptions. Input is untrusted text: only read, never executed.
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface DocEntry {
  path: string; // relative to docs/schemas
  summary: string; // short definition (first paragraph)
  attrs: Map<string, string>; // attribute name -> first paragraph
  items: Map<string, string>; // enumeration literal -> first paragraph
}

const PLACEHOLDERS: [RegExp, string][] = [
  [/\be\.g\./g, "e§g§"],
  [/\bi\.e\./g, "i§e§"],
  [/\betc\./g, "etc§"],
  [/\bvs\./g, "vs§"],
  [/\bNo\./g, "No§"],
];

export function clean(md: string): string {
  return md
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|[\s(])_([A-Za-z0-9_]+)_(?=[\s).,;:]|$)/g, "$1$2")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First `n` sentences of a paragraph, capped at `max` characters (cut at a word boundary with an ellipsis when still too long). */
export function sentences(text: string, n: number, max: number): string {
  let t = text;
  for (const [re, to] of PLACEHOLDERS) t = t.replace(re, to);
  const parts = t.split(/(?<=[a-z0-9)\]"'])\.\s+(?=[A-Z(])/);
  let out = parts.slice(0, n).join(". ");
  if (parts.length > n && !out.endsWith(".")) out += ".";
  out = out.replaceAll("§", ".");
  if (out.length > max) {
    out = out.slice(0, max);
    out = out.slice(0, out.lastIndexOf(" ")) + " …";
  }
  return out;
}

function firstParagraph(lines: string[]): string {
  const para: string[] = [];
  for (const l of lines) {
    if (l.trim() === "") {
      if (para.length) break;
      continue;
    }
    if (l.startsWith(">") || l.startsWith("```") || l.startsWith("|") || l.startsWith("#")) {
      if (para.length) break;
      continue;
    }
    para.push(l.trim());
  }
  return clean(para.join(" "));
}

export function parseDoc(path: string, md: string): DocEntry {
  const lines = md.split("\n");
  const endShort = lines.findIndex((l) => l.includes("end of short definition"));
  const h1 = lines.findIndex((l) => l.startsWith("# "));
  const summary = firstParagraph(lines.slice(h1 + 1, endShort >= 0 ? endShort : undefined));
  const attrs = new Map<string, string>();
  const items = new Map<string, string>();
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith("## ")) section = l.slice(3).trim();
    else if (l.startsWith("### ") && (section === "Attributes" || section === "Items")) {
      const name = l.slice(4).trim();
      const body = firstParagraph(lines.slice(i + 1, (() => { const j = lines.findIndex((x, k) => k > i && /^#{2,3} /.test(x)); return j < 0 ? lines.length : j; })()));
      (section === "Attributes" ? attrs : items).set(name, body);
    }
  }
  return { path, summary, attrs, items };
}

export async function loadDocs(docsRoot: string): Promise<Map<string, DocEntry>> {
  const out = new Map<string, DocEntry>();
  const walk = async (dir: string) => {
    for (const d of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) await walk(p);
      else if (d.name.endsWith(".md") && /\/(Entities|Types)$/.test(dir)) {
        const name = d.name.slice(0, -3);
        out.set(name, parseDoc(p.slice(docsRoot.length + 1), await Bun.file(p).text()));
      }
    }
  };
  await walk(docsRoot);
  return out;
}
