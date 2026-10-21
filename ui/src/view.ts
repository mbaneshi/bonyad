import type { Geometry, Point2 } from "./model";

export type Size = { width: number; height: number };

export type View = {
  /** Project metres to screen pixels, Y flipped so engineering "up" is screen up. */
  toScreen: (p: Point2) => { x: number; y: number };
  /** Pixels per metre. */
  scale: number;
  origin: { x: number; y: number };
};

export function pointsOf(g: Geometry): Point2[] {
  switch (g.kind) {
    case "point":
      return [g];
    case "line":
      return [g.a, g.b];
    case "surface":
      return g.vertices;
  }
}

/**
 * Fit the model (and the origin, so the axes always have a place) into the viewport.
 * Every coordinate is mapped with one uniform scale; no axis is stretched.
 */
export function fitView(geometries: Geometry[], size: Size, pad = 56): View {
  const pts = geometries.flatMap(pointsOf).concat({ x: 0, y: 0 });
  let minX = Math.min(...pts.map((p) => p.x));
  let maxX = Math.max(...pts.map((p) => p.x));
  let minY = Math.min(...pts.map((p) => p.y));
  let maxY = Math.max(...pts.map((p) => p.y));
  const MIN_SPAN = 2; // a lone point near the origin should not zoom to infinity
  if (maxX - minX < MIN_SPAN) [minX, maxX] = [minX - MIN_SPAN / 2, maxX + MIN_SPAN / 2];
  if (maxY - minY < MIN_SPAN) [minY, maxY] = [minY - MIN_SPAN / 2, maxY + MIN_SPAN / 2];

  const w = Math.max(size.width - 2 * pad, 1);
  const h = Math.max(size.height - 2 * pad, 1);
  const scale = Math.min(w / (maxX - minX), h / (maxY - minY));
  const offX = (size.width - scale * (maxX - minX)) / 2;
  const offY = (size.height - scale * (maxY - minY)) / 2;
  const toScreen = (p: Point2) => ({
    x: offX + (p.x - minX) * scale,
    y: offY + (maxY - p.y) * scale,
  });
  return { toScreen, scale, origin: toScreen({ x: 0, y: 0 }) };
}
