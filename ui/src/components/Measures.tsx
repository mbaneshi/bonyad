import { ApiError } from "../api/problem";
import { useMeasure } from "../api/hooks";
import { fa } from "../fa";
import { formatNumber } from "../numbers";
import type { EntityView } from "../model";
import { describeError } from "./EntityForm";

export function Measures({ entity }: { entity: EntityView }) {
  const measurable = entity.geometry.kind !== "point";
  const q = useMeasure(entity.id, entity.updated_at, measurable);
  if (!measurable) return null;

  const row = (label: string, value: number, unit: string) => (
    <div className="measure-row">
      <dt>{label}</dt>
      <dd>
        <bdi dir="ltr" className="num">
          {formatNumber(value)} {unit}
        </bdi>
      </dd>
    </div>
  );

  return (
    <section aria-label={fa.measuresTitle} className="measures">
      <h3>{fa.measuresTitle}</h3>
      {q.isPending && <p className="muted">{fa.loading}</p>}
      {q.isError && <p className="muted">{describeError(q.error instanceof ApiError ? q.error : new ApiError(0, "network"))}</p>}
      {q.data && (
        <dl>
          {q.data.kind === "line" && row(fa.length, q.data.length, q.data.unit)}
          {q.data.kind === "surface" && (
            <>
              {row(fa.area, q.data.area, q.data.area_unit)}
              {row(fa.perimeter, q.data.perimeter, q.data.unit)}
            </>
          )}
        </dl>
      )}
    </section>
  );
}
