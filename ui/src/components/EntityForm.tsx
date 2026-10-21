import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/problem";
import { projectKey, useCreateEntity, useDeleteEntity, useUpdateGeometry } from "../api/hooks";
import { fa } from "../fa";
import {
  covers,
  draftToGeometry,
  fieldPaths,
  type Draft,
  type Violation,
} from "../model";
import { NumberField } from "./NumberField";

type Props = {
  draft: Draft;
  /** Create when `existingId` is absent. `clientId` makes a retried create harmless. */
  clientId: string;
  existingId?: string;
  expectedRevision?: number;
  onSaved: (id: string) => void;
  onDeleted: () => void;
};

export function EntityForm({ draft: initial, clientId, existingId, expectedRevision, onSaved, onDeleted }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(initial);
  const [local, setLocal] = useState<Record<string, true>>({});
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [confirming, setConfirming] = useState(false);

  const create = useCreateEntity();
  const update = useUpdateGeometry();
  const remove = useDeleteEntity();
  const busy = create.isPending || update.isPending || remove.isPending;

  const violations: Violation[] = problem?.violations ?? [];
  const leaves = new Set(fieldPaths(draft));
  const inline = new Map(violations.filter((v) => leaves.has(v.path)).map((v) => [v.path, v]));
  const group = violations.filter((v) => !leaves.has(v.path));
  const invalid = (path: string) => path in local || violations.some((v) => covers(v.path, path));
  const message = (path: string) =>
    path in local ? fa.invalidNumber : inline.has(path) ? fa.violations[inline.get(path)!.code] : undefined;

  const fail = (e: unknown) => {
    const err = e instanceof ApiError ? e : new ApiError(0, "network");
    if (err.code === "not_found") void qc.invalidateQueries({ queryKey: projectKey });
    setProblem(err);
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const r = draftToGeometry(draft);
    if (!r.ok) {
      setLocal(r.errors);
      setProblem(null);
      return;
    }
    setLocal({});
    setProblem(null);
    if (existingId) {
      update.mutate({ id: existingId, geometry: r.geometry, expectedRevision: expectedRevision ?? 0 }, { onSuccess: () => onSaved(existingId), onError: fail });
    } else {
      create.mutate({ id: clientId, geometry: r.geometry }, { onSuccess: (e) => onSaved(e.id), onError: fail });
    }
  };

  const edit = (patch: Partial<Record<string, string>>) => {
    setDraft((d) => ({ ...d, ...patch }) as Draft);
    setLocal({});
  };

  const field = (label: string, path: string, value: string, set: (v: string) => void) => (
    <NumberField
      key={path}
      label={label}
      path={path}
      value={value}
      onChange={set}
      invalid={invalid(path)}
      message={message(path)}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="entity-form">
      {draft.kind === "point" && (
        <div className="pair">
          {field(fa.coordinate.x, "x", draft.x, (v) => edit({ x: v }))}
          {field(fa.coordinate.y, "y", draft.y, (v) => edit({ y: v }))}
        </div>
      )}

      {draft.kind === "line" && (
        <>
          <fieldset className={invalid("a") ? "invalid" : undefined}>
            <legend>{fa.pointA}</legend>
            <div className="pair">
              {field(fa.coordinate.x, "a.x", draft.ax, (v) => edit({ ax: v }))}
              {field(fa.coordinate.y, "a.y", draft.ay, (v) => edit({ ay: v }))}
            </div>
          </fieldset>
          <fieldset className={invalid("b") ? "invalid" : undefined}>
            <legend>{fa.pointB}</legend>
            <div className="pair">
              {field(fa.coordinate.x, "b.x", draft.bx, (v) => edit({ bx: v }))}
              {field(fa.coordinate.y, "b.y", draft.by, (v) => edit({ by: v }))}
            </div>
          </fieldset>
        </>
      )}

      {draft.kind === "surface" && (
        <>
          {draft.vertices.map((v, i) => (
            <fieldset key={i} className={invalid(`vertices[${i}]`) ? "invalid" : undefined}>
              <legend>{fa.vertex(i + 1)}</legend>
              <div className="pair">
                {field(fa.coordinate.x, `vertices[${i}].x`, v.x, (t) => setVertex(i, { x: t }))}
                {field(fa.coordinate.y, `vertices[${i}].y`, v.y, (t) => setVertex(i, { y: t }))}
              </div>
              {draft.vertices.length > 1 && (
                <button type="button" className="link" onClick={() => dropVertex(i)}>
                  {fa.removeVertex}
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDraft((d) => (d.kind === "surface" ? { ...d, vertices: [...d.vertices, { x: "", y: "" }] } : d));
              setProblem(null);
            }}
          >
            {fa.addVertex}
          </button>
        </>
      )}

      {(group.length > 0 || (problem && violations.length === 0)) && (
        <div role="alert" className="alert">
          {group.map((v, i) => (
            <p key={i}>{fa.violations[v.code]}</p>
          ))}
          {violations.length === 0 && problem && <p>{describe(problem)}</p>}
        </div>
      )}

      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? fa.saving : existingId ? fa.save : fa.create}
        </button>
        {existingId &&
          (confirming ? (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => remove.mutate(existingId, { onSuccess: onDeleted, onError: fail })}
            >
              {fa.confirmRemove}
            </button>
          ) : (
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(true)}>
              {fa.remove}
            </button>
          ))}
      </div>
    </form>
  );

  function setVertex(i: number, patch: Partial<{ x: string; y: string }>) {
    setDraft((d) =>
      d.kind === "surface" ? { ...d, vertices: d.vertices.map((v, j) => (j === i ? { ...v, ...patch } : v)) } : d,
    );
    setLocal({});
  }
  function dropVertex(i: number) {
    setDraft((d) => (d.kind === "surface" ? { ...d, vertices: d.vertices.filter((_, j) => j !== i) } : d));
    setLocal({});
    setProblem(null);
  }
}

function describe(e: ApiError): string {
  switch (e.code) {
    case "network":
      return fa.errors.network;
    case "not_found":
      return fa.errors.not_found;
    case "id_in_use":
      return fa.errors.id_in_use;
    case "invalid_request":
      return fa.errors.invalid_request;
    case "not_measurable":
      return fa.errors.not_measurable;
    case "database_unavailable":
    case "project_not_seeded":
    case "internal_error":
      return fa.errors.server;
    default:
      return fa.errors.unknown;
  }
}

export { describe as describeError };
