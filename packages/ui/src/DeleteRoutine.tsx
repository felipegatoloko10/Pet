import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  zonedParts,
  type Workspace,
  type Task,
  type Command,
} from "@pingo/core";

export function DeleteRoutine({
  w,
  task,
  seriesIds = [],
  act,
  onClose,
  onDeleted,
}: {
  w: Workspace;
  task?: Task;
  seriesIds?: string[];
  act: (c: Command) => Promise<void>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const roots = new Set(
    (w.taskSeries ?? [])
      .filter((s) => seriesIds.includes(s.id) || s.id === task?.seriesId)
      .map((s) => s.routineId ?? s.id),
  );
  const segments = (w.taskSeries ?? []).filter(
    (s) => !s.deleted && roots.has(s.routineId ?? s.id),
  );
  const [scope, setScope] = useState<"one" | "future" | "all">(
    task ? "one" : "all",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const from =
    task?.occurrenceDate ??
    task?.dueDate ??
    zonedParts(new Date(), w.preferences.timezone).date;
  const affected = w.tasks.filter(
    (t) =>
      !t.deleted &&
      (scope === "one"
        ? t.id === task?.id
        : segments.some((s) => s.id === t.seriesId) &&
          (scope === "all" || (t.occurrenceDate ?? t.dueDate ?? "") >= from)),
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await act(
        scope === "one" && task
          ? {
              type: "task.delete",
              id: task.id,
              expectedRevision: task.revision,
              confirmed: true,
            }
          : {
              type: "series.delete",
              targets: segments.map((s) => ({
                id: s.id,
                expectedRevision: s.revision,
              })),
              scope: scope === "all" ? "all" : "future",
              date: from,
              confirmed: true,
            },
      );
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="panel routine-delete"
      aria-label="Excluir tarefas"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <header>
        <h2>O que você quer excluir?</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Cancelar exclusão"
          onClick={onClose}
          disabled={busy}
        >
          ×
        </button>
      </header>
      <p>{task?.title ?? `${roots.size} rotina(s) selecionada(s)`}</p>
      <div className="deletion-choices">
        {task && (
          <button
            type="button"
            aria-pressed={scope === "one"}
            onClick={() => setScope("one")}
          >
            Somente esta tarefa<small>A repetição continua.</small>
          </button>
        )}
        {!!segments.length && (
          <>
            <button
              type="button"
              aria-pressed={scope === "future"}
              onClick={() => setScope("future")}
            >
              Esta e as próximas
              <small>
                Encerra a repetição a partir de{" "}
                {from.split("-").reverse().join("/")}.
              </small>
            </button>
            <button
              type="button"
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              Toda a rotina
              <small>Inclui tarefas passadas, atrasadas e concluídas.</small>
            </button>
          </>
        )}
      </div>
      <p role="status">
        Serão excluídas {affected.length} tarefa(s) já existente(s), seus
        horários e lembretes.
        {scope !== "one" &&
          " Novas ocorrências desse período não serão criadas."}
      </p>
      {affected.some((t) => t.completed) && (
        <p className="error">
          O histórico de {affected.filter((t) => t.completed).length}{" "}
          conclusão(ões) será removido. Os itens conquistados pelo Pingo serão
          mantidos.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <footer className="dialog-actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="button danger"
          disabled={busy}
          onClick={() => void remove()}
        >
          {busy ? "Excluindo…" : "Confirmar exclusão"}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}

export function RoutineManager({
  w,
  act,
}: {
  w: Workspace;
  act: (c: Command) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [deleting, setDeleting] = useState(false),
    [error, setError] = useState("");
  const series = (w.taskSeries ?? []).filter((s) => !s.deleted);
  return (
    <div className="routine-manager">
      <h3>Tarefas que se repetem</h3>
      {!series.length && <p>Crie uma tarefa e escolha Repetir para começar.</p>}
      {series.map((s) => (
        <div className="routine-series" key={s.id}>
          <label className="check">
            <input
              type="checkbox"
              aria-label={`Selecionar rotina ${s.template.title}`}
              checked={selected.includes(s.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, s.id]
                    : selected.filter((id) => id !== s.id),
                )
              }
            />
            <strong>{s.template.title}</strong>
          </label>
          <small>
            {s.start.split("-").reverse().join("/")} ·{" "}
            {s.end
              ? "Encerrada"
              : s.pauses.some((p) => !p.end)
                ? "Pausada"
                : "Ativa"}
          </small>
          {!s.end && (
            <button
              type="button"
              className="button"
              onClick={() =>
                void act({
                  type: "series.pause",
                  id: s.id,
                  expectedRevision: s.revision,
                  date: zonedParts(new Date(), s.timezone).date,
                  paused: !s.pauses.some((p) => !p.end),
                }).catch((e) => setError(e.message))
              }
            >
              {s.pauses.some((p) => !p.end) ? "Retomar" : "Pausar"}
            </button>
          )}
          <button
            type="button"
            className="button danger"
            onClick={() => {
              setSelected([s.id]);
              setDeleting(true);
            }}
          >
            Excluir rotina
          </button>
        </div>
      ))}
      {!!selected.length && (
        <button
          type="button"
          className="button danger"
          onClick={() => setDeleting(true)}
        >
          Excluir selecionadas ({selected.length})
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {deleting && (
        <DeleteRoutine
          w={w}
          seriesIds={selected}
          act={act}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}
