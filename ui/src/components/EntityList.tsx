import { fa } from "../fa";
import { formatNumber } from "../numbers";
import type { EntityView, Geometry } from "../model";

type Props = {
  entities: EntityView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function EntityList({ entities, selectedId, onSelect }: Props) {
  if (entities.length === 0) return <p className="muted">{fa.listEmpty}</p>;
  return (
    <ul className="entity-list">
      {entities.map((e, i) => (
        <li key={e.id}>
          <button
            type="button"
            aria-pressed={e.id === selectedId}
            data-entity={e.id}
            ref={(el) => {
              // On narrow screens the list scrolls sideways; keep the selection in sight.
              if (el && e.id === selectedId) el.scrollIntoView?.({ inline: "nearest", block: "nearest" });
            }}
            onClick={() => onSelect(e.id)}
          >
            <span className="kind">
              {fa.kind[e.geometry.kind]} {e.label ?? i + 1}
            </span>
            <bdi dir="ltr" className="num summary">{summary(e.geometry)}</bdi>
          </button>
        </li>
      ))}
    </ul>
  );
}

const p = (x: number, y: number) => `(${formatNumber(x)}, ${formatNumber(y)})`;

export function summary(g: Geometry): string {
  switch (g.kind) {
    case "point":
      return p(g.x, g.y);
    case "line":
      return `${p(g.a.x, g.a.y)} → ${p(g.b.x, g.b.y)}`;
    case "surface":
      return `${g.vertices.length} ${fa.vertexWord}`;
  }
}
