import type { Geometry } from "./model";
import { fitView } from "./view";

const size = { width: 400, height: 300 };

describe("fitView", () => {
  it("flips Y so engineering up is screen up", () => {
    const v = fitView([{ kind: "line", a: { x: 0, y: 0 }, b: { x: 4, y: 3 } }], size);
    expect(v.toScreen({ x: 0, y: 3 }).y).toBeLessThan(v.toScreen({ x: 0, y: 0 }).y);
    expect(v.toScreen({ x: 4, y: 0 }).x).toBeGreaterThan(v.toScreen({ x: 0, y: 0 }).x);
  });

  it("uses one scale on both axes and keeps everything inside the viewport", () => {
    const g: Geometry = { kind: "surface", vertices: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 3 }] };
    const v = fitView([g], size);
    const a = v.toScreen({ x: 0, y: 0 });
    const b = v.toScreen({ x: 1, y: 1 });
    expect(b.x - a.x).toBeCloseTo(v.scale);
    expect(a.y - b.y).toBeCloseTo(v.scale);
    for (const p of g.vertices) {
      const s = v.toScreen(p);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(size.width);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(size.height);
    }
  });

  it("does not zoom without bound onto a single point", () => {
    const v = fitView([{ kind: "point", x: 1, y: 1 }], size);
    expect(v.scale).toBeLessThan(200);
    expect(Number.isFinite(v.origin.x)).toBe(true);
  });

  it("has a sane view for an empty project", () => {
    const v = fitView([], size);
    expect(v.scale).toBeGreaterThan(0);
  });
});
