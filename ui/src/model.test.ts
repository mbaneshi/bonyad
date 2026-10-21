import type { Geometry } from "./model";
import { covers, draftFromGeometry, draftToGeometry, emptyDraft } from "./model";

describe("drafts", () => {
  it("round-trips geometry through form text", () => {
    const g: Geometry = { kind: "surface", vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }] };
    const r = draftToGeometry(draftFromGeometry(g));
    expect(r).toEqual({ ok: true, geometry: g });
  });

  it("names every unreadable field by the API's own path", () => {
    const d = emptyDraft("line");
    if (d.kind !== "line") throw new Error("kind");
    const r = draftToGeometry({ ...d, ax: "0", ay: "0", bx: "x", by: "" });
    expect(r).toEqual({ ok: false, errors: { "b.x": true, "b.y": true } });
  });
});

describe("covers", () => {
  it("matches a field, its parent, but not a sibling or an empty path", () => {
    expect(covers("b.x", "b.x")).toBe(true);
    expect(covers("b", "b.x")).toBe(true);
    expect(covers("vertices[1]", "vertices[1].y")).toBe(true);
    expect(covers("vertices[1]", "vertices[10].y")).toBe(false);
    expect(covers("a", "b.x")).toBe(false);
    expect(covers("", "b.x")).toBe(false);
  });
});
