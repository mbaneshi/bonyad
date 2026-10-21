import type { components } from "./api/generated/schema";

export type Geometry = components["schemas"]["Geometry"];
export type Point2 = components["schemas"]["Point2"];
export type EntityView = components["schemas"]["EntityView"];
export type Violation = components["schemas"]["Violation"];
export type ViolationCode = components["schemas"]["ViolationCode"];
export type Kind = Geometry["kind"];

import { formatNumber, parseNumber } from "./numbers";

/** What the form holds: the user's text, never half-parsed numbers. */
export type Draft =
  | { kind: "point"; x: string; y: string }
  | { kind: "line"; ax: string; ay: string; bx: string; by: string }
  | { kind: "surface"; vertices: { x: string; y: string }[] };

export function emptyDraft(kind: Kind): Draft {
  switch (kind) {
    case "point":
      return { kind, x: "", y: "" };
    case "line":
      return { kind, ax: "", ay: "", bx: "", by: "" };
    case "surface":
      return { kind, vertices: [{ x: "", y: "" }, { x: "", y: "" }, { x: "", y: "" }] };
  }
}

export function draftFromGeometry(g: Geometry): Draft {
  const t = (n: number) => formatNumber(n);
  switch (g.kind) {
    case "point":
      return { kind: "point", x: t(g.x), y: t(g.y) };
    case "line":
      return { kind: "line", ax: t(g.a.x), ay: t(g.a.y), bx: t(g.b.x), by: t(g.b.y) };
    case "surface":
      return { kind: "surface", vertices: g.vertices.map((v) => ({ x: t(v.x), y: t(v.y) })) };
  }
}

export type DraftResult =
  | { ok: true; geometry: Geometry }
  | { ok: false; errors: Record<string, true> };

/** Parses every field; on failure names each bad field by the same path the API uses. */
export function draftToGeometry(d: Draft): DraftResult {
  const bad: Record<string, true> = {};
  const num = (text: string, path: string) => {
    const v = parseNumber(text);
    if (v === null) bad[path] = true;
    return v ?? 0;
  };
  let geometry: Geometry;
  switch (d.kind) {
    case "point":
      geometry = { kind: "point", x: num(d.x, "x"), y: num(d.y, "y") };
      break;
    case "line":
      geometry = {
        kind: "line",
        a: { x: num(d.ax, "a.x"), y: num(d.ay, "a.y") },
        b: { x: num(d.bx, "b.x"), y: num(d.by, "b.y") },
      };
      break;
    case "surface":
      geometry = {
        kind: "surface",
        vertices: d.vertices.map((v, i) => ({
          x: num(v.x, `vertices[${i}].x`),
          y: num(v.y, `vertices[${i}].y`),
        })),
      };
      break;
  }
  return Object.keys(bad).length > 0 ? { ok: false, errors: bad } : { ok: true, geometry };
}

/** Every coordinate field path a draft has, in display order. */
export function fieldPaths(d: Draft): string[] {
  switch (d.kind) {
    case "point":
      return ["x", "y"];
    case "line":
      return ["a.x", "a.y", "b.x", "b.y"];
    case "surface":
      return d.vertices.flatMap((_, i) => [`vertices[${i}].x`, `vertices[${i}].y`]);
  }
}

/** A violation points at a field when its path is that field or a prefix of it (`b` covers `b.x`). */
export function covers(violationPath: string, fieldPath: string): boolean {
  if (violationPath === "") return false;
  return (
    fieldPath === violationPath ||
    fieldPath.startsWith(`${violationPath}.`) ||
    fieldPath.startsWith(`${violationPath}[`)
  );
}
