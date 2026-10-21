import { useRef, useState } from "react";
import { ApiError } from "./api/problem";
import { useProject } from "./api/hooks";
import { Canvas } from "./components/Canvas";
import { EntityForm, describeError } from "./components/EntityForm";
import { EntityList } from "./components/EntityList";
import { Measures } from "./components/Measures";
import { useKeyboardInset } from "./components/useKeyboardInset";
import { useSheetHeight } from "./components/useSheetHeight";
import { fa } from "./fa";
import { newId } from "./id";
import { draftFromGeometry, emptyDraft, type Kind } from "./model";

type Mode = { type: "create"; kind: Kind; clientId: string } | { type: "edit"; id: string };

const KINDS: Kind[] = ["point", "line", "surface"];

export function App() {
  useKeyboardInset();
  const project = useProject();
  const [mode, setMode] = useState<Mode | null>(null);

  const entities = project.data?.entities ?? [];
  const selected = mode?.type === "edit" ? entities.find((e) => e.id === mode.id) : undefined;
  const open = mode?.type === "create" || selected !== undefined;
  const panelRef = useRef<HTMLElement>(null);
  useSheetHeight(panelRef, open);
  const select = (id: string) => setMode({ type: "edit", id });
  const close = () => setMode(null);

  return (
    <div className="app">
      <header className="bar">
        <h1>
          {fa.appName} <small>{fa.tagline}</small>
        </h1>
        <div className="adds" role="group" aria-label={fa.add}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              data-add={k}
              onClick={() => setMode({ type: "create", kind: k, clientId: newId() })}
            >
              <span aria-hidden="true">+</span> {fa.kind[k]}
            </button>
          ))}
        </div>
      </header>

      {project.isError && (
        <div role="alert" className="banner">
          <span>{describeError(project.error instanceof ApiError ? project.error : new ApiError(0, "network"))}</span>
          <button type="button" onClick={() => void project.refetch()}>
            {fa.retry}
          </button>
        </div>
      )}

      <main className="workspace">
        <section className="list-pane" aria-label={fa.listTitle}>
          <h2>{fa.listTitle}</h2>
          {project.isPending ? (
            <p className="muted">{fa.loading}</p>
          ) : (
            <EntityList entities={entities} selectedId={selected?.id ?? null} onSelect={select} />
          )}
        </section>

        <section className="canvas-pane">
          <Canvas entities={entities} selectedId={selected?.id ?? null} onSelect={select} />
          {project.data && (
            <p className="unit-note">{fa.unitNote(project.data.project.unit)}</p>
          )}
        </section>

        <aside ref={panelRef} className={open ? "panel open" : "panel"} aria-label={fa.propertiesTitle}>
          {open && (
            <>
              <div className="panel-head">
                <h2>
                  {mode?.type === "create"
                    ? fa.newTitle(fa.kind[mode.kind])
                    : fa.kind[selected!.geometry.kind]}
                </h2>
                <button type="button" className="icon" onClick={close} aria-label={fa.close}>
                  ×
                </button>
              </div>
              {mode?.type === "create" ? (
                <EntityForm
                  key={mode.clientId}
                  draft={emptyDraft(mode.kind)}
                  clientId={mode.clientId}
                  onSaved={select}
                  onDeleted={close}
                />
              ) : (
                selected && (
                  <>
                    <EntityForm
                      key={`${selected.id}:${selected.updated_at}`}
                      draft={draftFromGeometry(selected.geometry)}
                      clientId={selected.id}
                      existingId={selected.id}
                      onSaved={select}
                      onDeleted={close}
                    />
                    <Measures entity={selected} />
                  </>
                )
              )}
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
