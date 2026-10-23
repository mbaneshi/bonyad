export function snake(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

export function singular(s: string): string {
  if (/vertices$/.test(s)) return s.replace(/vertices$/, "vertex");
  if (/indices$/.test(s)) return s.replace(/indices$/, "index");
  if (/ies$/.test(s)) return s.replace(/ies$/, "y");
  if (/(ss|us)$/.test(s)) return s;
  if (/(ses|xes|ches|shes)$/.test(s)) return s.replace(/es$/, "");
  if (/s$/.test(s)) return s.slice(0, -1);
  return s;
}

/** DXF names like 3DFACE become face3d (same rule the pilot table acad.face3d follows). */
export function codeFromDxfName(dxf: string): string {
  const m = dxf.match(/^3D(.+)$/);
  const base = m ? `${m[1]}3D` : dxf;
  return snake(base.replace(/_/g, " ")).replace(/_/g, "_");
}

export function humanize(snakeName: string): string {
  const s = snakeName.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
