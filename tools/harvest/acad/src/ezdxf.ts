// Reads ezdxf's attribute tables (`DefSubclass("AcDb...", {"name": DXFAttr(code, ...)})`) as text.
// Used (a) to add the first DXF version of each group code to source_ref and (b) as the primary
// source for DXF types ACadSharp does not model (LIGHT, HELIX, SUN, ...). Nothing is executed.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WORK } from "./sources.ts";

export const EZDXF_ROOT = join(WORK, "ezdxf/src/ezdxf");

export type EzAttr = {
  name: string; code: number; xtype: string | null; default: string | null;
  optional: boolean; dxfversion: string | null; comment: string; subclass: string; // subclass marker e.g. AcDbLine
};
export type EzType = { dxfType: string; className: string; file: string; bases: string[]; attribs: EzAttr[]; doc: string };

export const VERSIONS: Record<string, string> = {
  AC1009: "R12", AC1015: "R2000", AC1018: "R2004", AC1021: "R2007", AC1024: "R2010", AC1027: "R2013", AC1032: "R2018",
};
const VERSION_CONST: Record<string, string> = {
  DXF12: "AC1009", DXF2000: "AC1015", DXF2004: "AC1018", DXF2007: "AC1021", DXF2010: "AC1024", DXF2013: "AC1027", DXF2018: "AC1032",
};

function balanced(src: string, start: number, open: string, close: string): number {
  let d = 0;
  let inStr: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i]!;
    if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === open) d++;
    else if (c === close) { d--; if (d === 0) return i; }
  }
  return -1;
}

type Sub = { varName: string; marker: string; attribs: EzAttr[] };

function parseSubclasses(src: string): Sub[] {
  const out: Sub[] = [];
  const re = /^(\w+)\s*=\s*DefSubclass\(\s*(None|"[^"]*"|[\w.]+)\s*,\s*\{/gm;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const open = m.index + m[0].length - 1;
    const end = balanced(src, open, "{", "}");
    if (end < 0) continue;
    const body = src.slice(open + 1, end);
    const marker = (m[2] ?? "").replace(/"/g, "");
    const attribs: EzAttr[] = [];
    const lines = body.split("\n");
    let pendingComment: string[] = [];
    let offset = 0;
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("#")) pendingComment.push(t.replace(/^#\s?/, ""));
      const am = t.match(/^"(\w+)":\s*DXFAttr\(/);
      if (am) {
        const abs = open + 1 + offset + line.indexOf("DXFAttr(") + "DXFAttr".length;
        const e = balanced(src, abs, "(", ")");
        const args = src.slice(abs + 1, e);
        const code = Number(args.match(/^\s*(-?\d+)/)?.[1] ?? NaN);
        const trailing = src.slice(e + 1, src.indexOf("\n", e)).match(/#\s*(.*)$/)?.[1] ?? "";
        if (Number.isFinite(code)) {
          const ver = args.match(/dxfversion\s*=\s*(\w+)/)?.[1] ?? null;
          attribs.push({
            name: am[1] ?? "", code,
            xtype: args.match(/xtype\s*=\s*XType\.(\w+)/)?.[1] ?? null,
            default: args.match(/default\s*=\s*([^,\n)]+(?:\([^)]*\))?)/)?.[1]?.trim() ?? null,
            optional: /optional\s*=\s*True/.test(args),
            dxfversion: ver ? (VERSION_CONST[ver] ?? ver) : null,
            comment: [...pendingComment, trailing].filter(Boolean).join(" ").trim(),
            subclass: marker,
          });
        }
        pendingComment = [];
      } else if (t !== "" && !t.startsWith("#")) {
        if (!/^["\w]/.test(t) || t.startsWith('"')) { /* continuation lines keep comment context */ }
      }
      offset += line.length + 1;
      if (am) pendingComment = [];
    }
    out.push({ varName: m[1] ?? "", marker, attribs });
  }
  return out;
}

export function loadEzdxf(): { types: EzType[]; subs: Map<string, Sub> } {
  const dir = join(EZDXF_ROOT, "entities");
  const subs = new Map<string, Sub>();
  const files = readdirSync(dir).filter((f) => f.endsWith(".py"));
  const texts = new Map<string, string>();
  for (const f of files) {
    const s = readFileSync(join(dir, f), "utf8");
    texts.set(f, s);
    for (const sub of parseSubclasses(s)) subs.set(sub.varName, sub);
  }
  const types: EzType[] = [];
  for (const [f, s] of texts) {
    const re = /^class (\w+)\(([^)]*)\):\s*\n((?:(?:    .*|)\n)+)/gm;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const body = m[3] ?? "";
      const dt = body.match(/^\s+DXFTYPE = "([^"]+)"/m)?.[1];
      const da = body.match(/^\s+DXFATTRIBS = DXFAttributes\(([^)]*)\)/m)?.[1];
      if (!dt || !da) continue;
      const vars = da.split(",").map((x) => x.trim()).filter(Boolean);
      const attribs: EzAttr[] = [];
      for (const v of vars) {
        const sub = subs.get(v);
        if (!sub || v === "base_class" || v === "acdb_entity") continue;
        attribs.push(...sub.attribs);
      }
      const doc = body.match(/^\s+"""([\s\S]*?)"""/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
      types.push({ dxfType: dt, className: m[1] ?? "", file: `entities/${f}`, bases: (m[2] ?? "").split(",").map((x) => x.trim()), attribs, doc });
    }
  }
  return { types, subs };
}

// ------------------------------------------------------------------ ezdxf reference docs (reStructuredText)
export type EzDocs = {
  desc: Map<string, string>; // DXF type -> first paragraph
  since: Map<string, string>; // DXF type -> "Required DXF version" (AC10xx)
  attr: Map<string, Map<string, string>>; // DXF type -> ezdxf attribute name -> description
  file: Map<string, string>;
};

export function cleanRst(s: string): string {
  return s
    .replace(/:\w+:`~?([^`]*?)(?:\s*<[^>]*>)?`/g, (_m, x: string) => x.replace(/^dxf\./, "").replace(/^ezdxf\.\w+\./, ""))
    .replace(/``([^`]*)``/g, "$1")
    .replace(/`([^`]*?)`_?/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

export function loadEzDocs(): EzDocs {
  const root = join(WORK, "ezdxf/docs/source");
  const docs: EzDocs = { desc: new Map(), since: new Map(), attr: new Map(), file: new Map() };
  for (const d of ["dxfentities", "dxfobjects", "tables"]) {
    const dir = join(root, d);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".rst"))) {
      const text = readFileSync(join(dir, f), "utf8");
      const types = [...text.matchAll(/^DXF type\s+``'([^']+)'``/gm)].map((m) => m[1] ?? "");
      if (types.length === 0) continue;
      const afterModule = text.replace(/^[\s\S]*?\.\. module::[^\n]*\n(?:\s+:[^\n]*\n)*\n/, "");
      const para = afterModule.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith("..") && !p.startsWith("=") && !p.startsWith("- "));
      const since = text.match(/^Required DXF version\s+DXF \w+ \(``'(AC\d+)'``\)/m)?.[1];
      const attrs = new Map<string, string>();
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const am = lines[i]!.match(/^(\s*)\.\. attribute:: dxf\.(\w+)\s*$/);
        if (!am) continue;
        const indent = am[1]!.length;
        const body: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j]!;
          if (l.trim() === "") { if (body.length) break; continue; }
          const ind = l.length - l.trimStart().length;
          if (ind <= indent || l.trim().startsWith(".. ")) break;
          body.push(l.trim());
        }
        attrs.set(am[2] ?? "", cleanRst(body.join(" ")));
      }
      types.forEach((t, i) => {
        if (para && i === 0) docs.desc.set(t, firstSentence(cleanRst(para)));
        if (since) docs.since.set(t, since);
        docs.attr.set(t, new Map([...(docs.attr.get(t) ?? new Map()), ...attrs]));
        docs.file.set(t, `docs/source/${d}/${f}`);
      });
    }
  }
  return docs;
}

function firstSentence(s: string): string {
  const t = s
    .replace(/\((?:\w+ )?DXF Reference\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = t.match(/^(.*?[a-z)\]"])\.(?:\s|$)/);
  return (m?.[1] ?? t).replace(/\s+([,.])/g, "$1");
}
