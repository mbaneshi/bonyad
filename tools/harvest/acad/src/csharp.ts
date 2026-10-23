// Minimal, line-oriented reader for the parts of ACadSharp's C# that carry DXF knowledge:
// classes, enums, properties, doc comments and the [DxfName]/[DxfSubClass]/[DxfCodeValue] attributes.
// It never executes or compiles anything; the source is read as text only.
import { z } from "zod";

export const CodeAttr = z.object({
  kind: z.enum(["value", "collection"]),
  flags: z.array(z.string()), // DxfReferenceType members, e.g. Handle, Name, IsAngle, Count, Optional
  codes: z.array(z.number().int()),
});
export type CodeAttr = z.infer<typeof CodeAttr>;

export const CsProp = z.object({
  name: z.string(),
  type: z.string(),
  default: z.string().nullable(),
  doc: z.string(),
  code: CodeAttr.nullable(),
  collection: CodeAttr.nullable(),
  line: z.number().int(),
});
export type CsProp = z.infer<typeof CsProp>;

export const CsEnumMember = z.object({ name: z.string(), value: z.number().nullable(), doc: z.string() });
export type CsEnumMember = z.infer<typeof CsEnumMember>;

export const CsType = z.object({
  kind: z.enum(["class", "enum"]),
  name: z.string(), // simple name
  outer: z.string().nullable(), // enclosing class (nested types)
  base: z.string().nullable(),
  bases: z.array(z.string()),
  isAbstract: z.boolean(),
  dxfName: z.string().nullable(), // [DxfName(DxfFileToken.X)] resolved through the token table
  dxfNameToken: z.string().nullable(),
  subclass: z.string().nullable(), // [DxfSubClass(DxfSubclassMarker.X)] resolved
  subclassToken: z.string().nullable(),
  doc: z.string(),
  isFlags: z.boolean(),
  props: z.array(CsProp),
  members: z.array(CsEnumMember),
  file: z.string(),
  line: z.number().int(),
});
export type CsType = z.infer<typeof CsType>;

export function cleanDoc(lines: string[]): { summary: string; remarks: string } {
  const text = lines.map((l) => l.replace(/^\s*\/\/\/ ?/, "")).join(" ");
  const pick = (tag: string) => {
    const m = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
    return m?.[1] ?? "";
  };
  const strip = (s: string) =>
    s
      .replace(/<see\s+(?:cref|langword)="([^"]+)"\s*\/>/g, (_m, c: string) => c.replace(/^[A-Za-z]:/, "").split(".").pop() ?? c)
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  return { summary: strip(pick("summary")), remarks: strip(pick("remarks")) };
}

function parseAttr(text: string): CodeAttr | null {
  const m = text.match(/^\[(DxfCodeValue|DxfCollectionCodeValue)\((.*)\)\]$/);
  if (!m) return null;
  const args = (m[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const flags: string[] = [];
  const codes: number[] = [];
  for (const a of args) {
    if (/^-?\d+$/.test(a)) codes.push(Number(a));
    else for (const f of a.split("|")) flags.push(f.trim().replace(/^DxfReferenceType\./, ""));
  }
  return { kind: m[1] === "DxfCodeValue" ? "value" : "collection", flags, codes };
}

function evalEnum(expr: string, known: Map<string, number>): number | null {
  let e = expr.trim();
  if (!e) return null;
  e = e.replace(/\b[A-Za-z_]\w*\b/g, (id) => (known.has(id) ? String(known.get(id)) : id));
  if (!/^[0-9a-fA-Fx\s<>|()+\-&]+$/.test(e)) return null;
  try {
    // Only digits, hex, shifts and bit-ors survive the filter above; evaluated as a pure number expression.
    const v = Function(`"use strict"; return (${e});`)() as unknown;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function parseCs(source: string, file: string, tokens: Tokens): CsType[] {
  const out: CsType[] = [];
  type Scope = { t: CsType; depth: number };
  const stack: Scope[] = [];
  let depth = 0;
  let doc: string[] = [];
  let attrs: string[] = [];
  let pending: CsType | null = null;
  let nextVal = 0;
  const known = new Map<string, number>();
  const lines = source.replace(/^﻿/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    if (line.startsWith("///")) { doc.push(line); continue; }
    if (line.startsWith("//") || line === "") continue;
    if (line.startsWith("[") && line.endsWith("]") && !line.startsWith("[]")) { attrs.push(line); continue; }
    const top = stack[stack.length - 1];
    const atMember = top !== undefined && depth === top.depth;
    const decl = line.match(/^(?:(?:public|internal|protected|private|abstract|sealed|partial|static)\s+)*(class|enum|interface|struct)\s+(\w+)(?:<[^>]*>)?\s*(?::\s*([^{]+?))?\s*(\{.*)?$/);
    if (decl && (depth === 0 || atMember || stack.length === 0 || depth <= (top?.depth ?? 0))) {
      const kind = (decl[1] === "enum" ? "enum" : "class") as "class" | "enum";
      const { summary } = cleanDoc(doc);
      const name = decl[2] ?? "";
      const allBases = (decl[3] ?? "").split(",").map((x) => x.trim().replace(/<.*$/, "").split(".").pop() ?? "").filter(Boolean);
      const baseRaw = (decl[3] ?? "").split(",")[0]?.trim() ?? "";
      const base = baseRaw && kind === "class" && !/^I[A-Z]/.test(baseRaw) ? baseRaw.replace(/<.*$/, "").split(".").pop() ?? null : null;
      const attrOf = (n: string) => attrs.map((a) => a.match(new RegExp(`^\\[${n}\\((.*)\\)\\]$`))?.[1]).find((x) => x !== undefined);
      const nameTok = attrOf("DxfName")?.replace(/^DxfFileToken\./, "") ?? null;
      const subTok = attrOf("DxfSubClass")?.replace(/^DxfSubclassMarker\./, "") ?? null;
      const t: CsType = {
        kind, name,
        outer: stack.filter((s) => s.t.kind === "class").map((s) => s.t.name).pop() ?? null,
        base,
        bases: allBases,
        isAbstract: /\babstract\b/.test(line.split(/class|enum/)[0] ?? ""),
        dxfNameToken: nameTok,
        dxfName: nameTok ? (tokens.file.get(nameTok) ?? (/^"/.test(nameTok) ? nameTok.replace(/"/g, "") : null)) : null,
        subclassToken: subTok,
        subclass: subTok ? (tokens.subclass.get(subTok) ?? null) : null,
        doc: summary,
        isFlags: attrs.some((a) => a === "[Flags]"),
        props: [], members: [], file, line: i + 1,
      };
      out.push(t);
      pending = t;
      doc = []; attrs = [];
      nextVal = 0; known.clear();
    } else if (atMember && top && top.t.kind === "class") {
      const pm = line.match(/^public\s+((?:(?:new|virtual|override|abstract|static|sealed)\s+)*)([\w<>\[\],.?\s]+?)\s+(\w+)\s*(\{.*|=>.*)?$/);
      const decl0 = line.split("=")[0] ?? "";
      const isProp = pm !== null && !(pm[1] ?? "").includes("static") && !/\bconst\b|\breadonly\b|\(/.test(decl0) && (pm[4] !== undefined || !line.endsWith(";"));
      if (pm && isProp) {
        const defM = line.match(/\}\s*=\s*(.+?);\s*$/);
        const parsed = attrs.map(parseAttr);
        top.t.props.push({
          name: pm[3] ?? "", type: (pm[2] ?? "").trim(), default: defM?.[1]?.trim() ?? null,
          doc: cleanDoc(doc).summary,
          code: parsed.find((a) => a?.kind === "value") ?? null,
          collection: parsed.find((a) => a?.kind === "collection") ?? null,
          line: i + 1,
        });
      }
      doc = []; attrs = [];
    } else if (atMember && top && top.t.kind === "enum") {
      const em = line.match(/^(\w+)\s*(?:=\s*([^,]+?))?\s*,?\s*(?:\/\/.*)?$/);
      if (em && !line.startsWith("{") && !line.startsWith("}")) {
        const name = em[1] ?? "";
        const v = em[2] !== undefined ? evalEnum(em[2], known) : nextVal;
        if (v !== null) { known.set(name, v); nextVal = v + 1; }
        top.t.members.push({ name, value: v, doc: cleanDoc(doc).summary });
      }
      doc = []; attrs = [];
    } else {
      doc = []; attrs = [];
    }
    // brace accounting (strings and comments are rare in the structures we read)
    const code = raw.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/, "");
    for (const ch of code) {
      if (ch === "{") {
        depth++;
        if (pending) { stack.push({ t: pending, depth }); pending = null; }
      } else if (ch === "}") {
        while (stack.length && stack[stack.length - 1]!.depth === depth) stack.pop();
        depth--;
      }
    }
  }
  return out;
}

export type Tokens = { file: Map<string, string>; subclass: Map<string, string> };

/** DxfFileToken.cs / DxfSubclassMarker.cs: `public const string X = "Y";` */
export function parseTokens(source: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of source.split(/\r?\n/)) {
    const r = l.match(/const\s+string\s+(\w+)\s*=\s*"([^"]*)"/);
    if (r) m.set(r[1] ?? "", r[2] ?? "");
  }
  return m;
}
