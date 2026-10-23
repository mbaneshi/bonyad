import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseCs, parseTokens, type CsType } from "./csharp.ts";

export const WORK = process.env.HARVEST_DIR ??
  "/private/tmp/claude-501/-Users-bm-sub-biz-bonyad/ca387286-964b-4a80-a56f-c5077bafdfdd/scratchpad/harvest/dxf";
export const ACAD_ROOT = join(WORK, "ACadSharp/src/ACadSharp");

function walk(dir: string): string[] {
  const r: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) r.push(...walk(p));
    else if (p.endsWith(".cs")) r.push(p);
  }
  return r;
}

export function loadAcadSharp(): CsType[] {
  const tokens = {
    file: parseTokens(readFileSync(join(ACAD_ROOT, "DxfFileToken.cs"), "utf8")),
    subclass: parseTokens(readFileSync(join(ACAD_ROOT, "DxfSubclassMarker.cs"), "utf8")),
  };
  const all: CsType[] = [];
  for (const f of walk(ACAD_ROOT)) {
    if (/\/(IO|Header|Prototype1b)\//.test(f)) continue;
    all.push(...parseCs(readFileSync(f, "utf8"), f.slice(ACAD_ROOT.length + 1), tokens));
  }
  return mergePartials(all);
}

/** `partial` classes are declared in several files; merge them into one CsType. */
function mergePartials(all: CsType[]): CsType[] {
  const byKey = new Map<string, CsType>();
  const order: CsType[] = [];
  for (const t of all) {
    const k = `${t.kind}|${t.outer ?? ""}|${t.name}`;
    const m = byKey.get(k);
    if (!m) { byKey.set(k, t); order.push(t); continue; }
    m.props.push(...t.props);
    m.members.push(...t.members);
    for (const b of t.bases) if (!m.bases.includes(b)) m.bases.push(b);
    if (!m.base && t.base) { m.base = t.base; m.file = t.file; m.line = t.line; }
    if (!m.dxfName && t.dxfName) { m.dxfName = t.dxfName; m.dxfNameToken = t.dxfNameToken; m.file = t.file; m.line = t.line; }
    if (!m.subclass && t.subclass) { m.subclass = t.subclass; m.subclassToken = t.subclassToken; }
    if (!m.doc && t.doc) m.doc = t.doc;
    m.isAbstract = m.isAbstract || t.isAbstract;
    m.isFlags = m.isFlags || t.isFlags;
  }
  return order;
}
