import { useMemo, useRef, type KeyboardEvent } from "react";
import { fa } from "../fa";
import type { EntityView } from "../model";
import { fitView } from "../view";
import { useElementSize } from "./useElementSize";

type Props = {
  entities: EntityView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const HIT = 44; // the minimum comfortable touch target, in CSS px (the viewBox is 1:1 with px)

export function Canvas({ entities, selectedId, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const size = useElementSize(box);
  const view = useMemo(
    () => fitView(entities.map((e) => e.geometry), size),
    [entities, size],
  );
  const s = view.toScreen;

  const activate = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };
  const props = (e: EntityView, label: string) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    "aria-pressed": e.id === selectedId,
    "data-entity": e.id,
    "data-selected": e.id === selectedId || undefined,
    onClick: () => onSelect(e.id),
    onKeyDown: activate(e.id),
  });

  // Surfaces first so lines and points stay on top and remain tappable.
  const ordered = [...entities].sort(
    (a, b) => rank(a.geometry.kind) - rank(b.geometry.kind),
  );

  return (
    <div className="canvas" ref={box}>
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        width={size.width}
        height={size.height}
        role="group"
        aria-label={fa.canvasLabel}
      >
        <line className="axis" x1={0} x2={size.width} y1={view.origin.y} y2={view.origin.y} />
        <line className="axis" y1={0} y2={size.height} x1={view.origin.x} x2={view.origin.x} />
        {ordered.map((e) => {
          const g = e.geometry;
          const name = `${fa.kind[g.kind]}${e.label ? ` ${e.label}` : ""}`;
          if (g.kind === "surface") {
            const pts = g.vertices.map((v) => `${s(v).x},${s(v).y}`).join(" ");
            return (
              <g key={e.id} className="shape surface" {...props(e, name)}>
                <polygon points={pts} />
                {e.id === selectedId &&
                  g.vertices.map((v, i) => <circle key={i} className="handle" cx={s(v).x} cy={s(v).y} r={5} />)}
              </g>
            );
          }
          if (g.kind === "line") {
            const a = s(g.a);
            const b = s(g.b);
            return (
              <g key={e.id} className="shape line" {...props(e, name)}>
                <line className="hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={HIT} />
                <line className="stroke" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {e.id === selectedId && (
                  <>
                    <circle className="handle" cx={a.x} cy={a.y} r={5} />
                    <circle className="handle" cx={b.x} cy={b.y} r={5} />
                  </>
                )}
              </g>
            );
          }
          const p = s(g);
          return (
            <g key={e.id} className="shape point" {...props(e, name)}>
              <circle className="hit" cx={p.x} cy={p.y} r={HIT / 2} />
              <circle className="dot" cx={p.x} cy={p.y} r={6} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function rank(kind: EntityView["geometry"]["kind"]): number {
  return kind === "surface" ? 0 : kind === "line" ? 1 : 2;
}
