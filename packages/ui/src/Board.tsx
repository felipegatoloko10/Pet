import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  taskOrder,
  type Task,
  type Workspace,
  type Command,
  type Column,
  taskOnDay,
  taskIsLate,
  eventOnDate,
  eventIsHoliday,
  localDay,
  pastelColors,
} from "@pingo/core";
type Props = {
  w: Workspace;
  today: string;
  act: (c: Command) => Promise<void>;
  onEdit: (t: Partial<Task>) => void;
  onEventEdit?: (e: import("@pingo/core").CalendarEvent) => void;
};
export function Board({ w, today, act, onEdit, onEventEdit }: Props) {
  const [query, setQuery] = useState(""),
    [priority, setPriority] = useState(""),
    [label, setLabel] = useState(""),
    [archive, setArchive] = useState(false),
    [active, setActive] = useState<string | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [error, setError] = useState("");
  const [columnEditor, setColumnEditor] = useState<Column | "new" | null>(null);
  const b =
    w.boards.find((b) => b.id === w.preferences.defaultBoardId) ?? w.boards[0];
  const perform = (c: Command) => {
    setError("");
    void act(c).catch((e) => setError(e.message));
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const tasks = w.tasks.filter((t) => !t.deleted && t.boardId === b?.id);
  const events = w.events.filter(
    (e) =>
      !e.deleted &&
      !e.recurrence &&
      !e.taskId &&
      !eventIsHoliday(w, e) &&
      eventOnDate(e, today, w.preferences.timezone),
  );
  const cards: Task[] = [
    ...tasks,
    ...events.map((e) => ({
      id: `event:${e.id}`,
      boardId: b?.id ?? "",
      columnId: b?.columns.some((c) => c.id === e.columnId)
        ? e.columnId!
        : (b?.columns[0]?.id ?? ""),
      title: e.title,
      notes: "Compromisso",
      dueDate: e.allDay ? e.start : localDay(e.start, w.preferences.timezone),
      scheduledStart: e.allDay ? null : e.start,
      scheduledEnd: e.allDay ? null : e.end,
      priority: "normal" as const,
      completed: !!e.completedAt,
      completedAt: e.completedAt,
      revision: e.revision,
      syncState: e.syncState,
      position: e.position,
    })),
  ];
  const edit = (t: Partial<Task>) => {
    if (t.id?.startsWith("event:")) {
      const e = events.find((e) => `event:${e.id}` === t.id);
      if (e) onEventEdit?.(e);
    } else onEdit(t);
  };
  const move = (t: Task, columnId: string, beforeId: string | null) =>
    perform(
      t.id.startsWith("event:")
        ? {
            type: "event.move",
            id: t.id.slice(6),
            columnId,
            beforeId,
            expectedRevision: t.revision,
          }
        : {
            type: "task.move",
            id: t.id,
            columnId,
            beforeId,
            expectedRevision: t.revision,
          },
    );
  const holidays = w.events
    .filter(
      (e) =>
        !e.deleted &&
        !e.recurrence &&
        eventIsHoliday(w, e) &&
        eventOnDate(e, today, w.preferences.timezone),
    )
    .filter(
      (e, i, all) =>
        all.findIndex(
          (x) =>
            x.title.toLocaleLowerCase() === e.title.toLocaleLowerCase() &&
            x.start === e.start,
        ) === i,
    );
  const labels = [
    ...new Map(
      cards.flatMap((t) => t.labels ?? []).map((l) => [l.id, l]),
    ).values(),
  ];
  const visible = cards
    .filter(
      (t) =>
        !!t.archivedAt === archive &&
        (archive ||
          t.id.startsWith("event:") ||
          (!t.dueDate && !t.completed) ||
          taskOnDay(t, today, w.preferences.timezone)) &&
        (!query ||
          `${t.title} ${t.notes}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!priority || t.priority === priority) &&
        (!label || t.labels?.some((l) => l.id === label)),
    )
    .sort(taskOrder);
  function drop(e: DragEndEvent) {
    setActive(null);
    if (!b || !e.over || e.active.id === e.over.id) return;
    if (e.active.data.current?.kind === "column") {
      const col = b.columns.find((c) => c.id === e.active.id);
      const index = b.columns.findIndex(
        (c) => c.id === (e.over!.data.current?.columnId ?? e.over!.id),
      );
      if (col && index >= 0)
        perform({
          type: "column.update",
          boardId: b.id,
          columnId: col.id,
          title: col.title,
          index,
          expectedRevision: b.revision,
        });
      return;
    }
    const task = cards.find((t) => t.id === e.active.id),
      over = cards.find((t) => t.id === e.over!.id);
    const col = b.columns.find((c) => c.id === (over?.columnId ?? e.over!.id));
    if (!task || !col) return;
    let beforeId = over?.id ?? null;
    if (
      over &&
      e.active.rect.current.translated &&
      ((task.columnId === over.columnId &&
        cards
          .filter((t) => t.columnId === col.id)
          .sort(taskOrder)
          .findIndex((t) => t.id === task.id) <
          cards
            .filter((t) => t.columnId === col.id)
            .sort(taskOrder)
            .findIndex((t) => t.id === over.id)) ||
        e.active.rect.current.translated.top >
          e.over.rect.top + e.over.rect.height / 2)
    ) {
      const list = cards
        .filter(
          (t) => !t.archivedAt && t.columnId === col.id && t.id !== task.id,
        )
        .sort(taskOrder);
      beforeId = list[list.findIndex((t) => t.id === over.id) + 1]?.id ?? null;
    }
    move(task, col.id, beforeId);
  }
  return (
    <section className="home-board" aria-label="Meu quadro de tarefas">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SEU DIA EM MOVIMENTO</div>
          <h1>
            Uma coisa <em>de cada vez.</em>
          </h1>
          <p>Organize agora. Abra espaço para o resto do dia.</p>
        </div>
        <button
          className="button primary"
          aria-label="Nova tarefa"
          disabled={!b}
          onClick={() => onEdit({ boardId: b?.id })}
        >
          ＋ Nova tarefa
        </button>
      </div>
      <div className="board-toolbar">
        <input
          aria-label="Buscar tarefas"
          placeholder="Buscar título ou descrição"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filtrar prioridade"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">Todas as prioridades</option>
          <option value="high">Alta</option>
          <option value="normal">Normal</option>
          <option value="low">Baixa</option>
        </select>
        <select
          aria-label="Filtrar etiqueta"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        >
          <option value="">Todas as etiquetas</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button
          className="button small"
          aria-label={archive ? "Voltar ao quadro" : "Arquivados"}
          title={archive ? "Voltar ao quadro" : "Arquivados"}
          aria-pressed={archive}
          onClick={() => {
            setArchive(!archive);
          }}
        >
          {archive ? "↩" : "▣"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {b ? (
        <DndContext
          sensors={sensors}
          collisionDetection={(args) =>
            closestCorners({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) =>
                  args.active.data.current?.kind === "column"
                    ? container.data.current?.kind === "column"
                    : container.data.current?.kind === "task" ||
                      !visible.some((t) => t.columnId === container.id),
              ),
            })
          }
          onDragStart={(e) => setActive(String(e.active.id))}
          onDragCancel={() => setActive(null)}
          onDragEnd={drop}
        >
          <SortableContext
            items={b.columns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="kanban">
              {!archive && !!holidays.length && (
                <section className="kanban-column day-holidays">
                  <header>
                    <strong>Lembretes do dia</strong>
                    <small>{holidays.length}</small>
                  </header>
                  {holidays.map((e) => (
                    <article className="task-card" key={e.id}>
                      <span className="priority">Data especial</span>
                      <h3>Hoje é {e.title}</h3>
                      <small>Um lembrete para o seu dia.</small>
                    </article>
                  ))}
                </section>
              )}
              {b.columns.map((col, index) => (
                <BoardColumn
                  key={col.id}
                  col={col}
                  count={visible.filter((t) => t.columnId === col.id).length}
                  archive={archive}
                  onAdd={() => onEdit({ boardId: b.id, columnId: col.id })}
                  onRename={() => setColumnEditor(col)}
                  onShift={(direction) => {
                    if (
                      index + direction < 0 ||
                      index + direction >= b.columns.length
                    )
                      return;
                    perform({
                      type: "column.update",
                      boardId: b.id,
                      columnId: col.id,
                      title: col.title,
                      index: index + direction,
                      expectedRevision: b.revision,
                    });
                  }}
                >
                  <SortableContext
                    items={visible
                      .filter((t) => t.columnId === col.id)
                      .map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {visible
                      .filter((t) => t.columnId === col.id)
                      .map((t) => (
                        <Card
                          key={t.id}
                          task={t}
                          columns={b.columns}
                          archive={archive}
                          today={today}
                          calendarState={
                            w.events.find(
                              (e) => e.taskId === t.id && !e.deleted,
                            )?.syncState
                          }
                          onEdit={() => edit(t)}
                          onDetails={() =>
                            t.id.startsWith("event:")
                              ? edit(t)
                              : setDetail(t.id)
                          }
                          onMove={(columnId) => move(t, columnId, null)}
                          onReorder={(direction) => {
                            const list = cards
                                .filter(
                                  (x) =>
                                    !x.archivedAt && x.columnId === t.columnId,
                                )
                                .sort(taskOrder),
                              index = list.findIndex((x) => x.id === t.id);
                            if (
                              index + direction < 0 ||
                              index + direction >= list.length
                            )
                              return;
                            move(
                              t,
                              t.columnId,
                              direction < 0
                                ? list[index - 1].id
                                : (list[index + 2]?.id ?? null),
                            );
                          }}
                        />
                      ))}
                  </SortableContext>
                </BoardColumn>
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {active && (
              <div className="task-card drag-preview">
                {cards.find((t) => t.id === active)?.title ??
                  b.columns.find((c) => c.id === active)?.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="panel">
          <p>Conecte suas listas Google em Ajustes para começar.</p>
        </div>
      )}
      {b && (
        <button className="add-inline" onClick={() => setColumnEditor("new")}>
          ＋ Adicionar coluna
        </button>
      )}
      {b && columnEditor && (
        <ColumnEditor
          key={typeof columnEditor === "string" ? "new" : columnEditor.id}
          board={b}
          column={columnEditor === "new" ? undefined : columnEditor}
          act={act}
          onClose={() => setColumnEditor(null)}
        />
      )}
      {detail && cards.find((t) => t.id === detail) && (
        <CardDetails
          key={detail}
          task={cards.find((t) => t.id === detail)!}
          existingLabels={labels}
          act={act}
          onEdit={onEdit}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}
function ColumnEditor({
  board,
  column,
  act,
  onClose,
}: {
  board: import("@pingo/core").Board;
  column?: Column;
  act: Props["act"];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [title, setTitle] = useState(column?.title ?? ""),
    [color, setColor] = useState(column?.color ?? pastelColors[0]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [destination, setDestination] = useState(
      board.columns.find((c) => c.kind === "todo")!.id,
    );
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const index = column
    ? board.columns.findIndex((c) => c.id === column.id)
    : board.columns.length;
  async function run(c: Command) {
    setBusy(true);
    try {
      await act(c);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-label={column ? "Editar coluna" : "Nova coluna"}
      onCancel={onClose}
    >
      <div className="editor-form column-editor">
        <header className="section-heading">
          <h2>{column ? "Editar coluna" : "Nova coluna"}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              column
                ? {
                    type: "column.update",
                    boardId: board.id,
                    columnId: column.id,
                    title,
                    color,
                    index,
                    expectedRevision: board.revision,
                  }
                : {
                    type: "column.create",
                    boardId: board.id,
                    id: crypto.randomUUID(),
                    title,
                    color,
                    expectedRevision: board.revision,
                  },
            );
          }}
        >
          <label>
            Nome da coluna
            <input
              autoFocus
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <fieldset>
            <legend>Cor da coluna</legend>
            <div className="pastel-palette">
              {pastelColors.map((c, i) => (
                <button
                  type="button"
                  key={c}
                  aria-label={`Cor pastel ${i + 1}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  style={{ background: c }}
                >
                  {color === c ? "✓" : ""}
                </button>
              ))}
            </div>
          </fieldset>
          <button className="button primary" disabled={busy}>
            {column ? "Salvar alterações" : "Criar coluna"}
          </button>
        </form>
        {column && (
          <>
            <div className="form-actions">
              <button
                className="button"
                disabled={busy || index === 0}
                onClick={() =>
                  void run({
                    type: "column.update",
                    boardId: board.id,
                    columnId: column.id,
                    title: column.title,
                    index: index - 1,
                    expectedRevision: board.revision,
                  })
                }
              >
                ← Mover
              </button>
              <button
                className="button"
                disabled={busy || index === board.columns.length - 1}
                onClick={() =>
                  void run({
                    type: "column.update",
                    boardId: board.id,
                    columnId: column.id,
                    title: column.title,
                    index: index + 1,
                    expectedRevision: board.revision,
                  })
                }
              >
                Mover →
              </button>
            </div>
            {["todo", "active", "done"].includes(column.kind) ? (
              <p>
                Esta coluna tem uma função essencial. Você pode mudar seu nome e
                sua cor.
              </p>
            ) : (
              <>
                <label>
                  Mover cartões para
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    {board.columns
                      .filter((c) => c.id !== column.id && c.kind !== "done")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Excluir esta coluna e mover seus cartões para a coluna escolhida? Nenhuma tarefa ou compromisso será excluído.",
                      )
                    )
                      void run({
                        type: "column.delete",
                        boardId: board.id,
                        columnId: column.id,
                        destinationId: destination,
                        expectedRevision: board.revision,
                      });
                  }}
                >
                  Excluir coluna
                </button>
              </>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
function BoardColumn({
  col,
  count,
  children,
  archive,
  onAdd,
  onRename,
  onShift,
}: {
  col: Column;
  count: number;
  children: React.ReactNode;
  archive: boolean;
  onAdd: () => void;
  onRename: () => void;
  onShift: (direction: number) => void;
}) {
  const sortable = useSortable({
    id: col.id,
    data: { kind: "column", columnId: col.id },
    disabled: archive,
  });
  return (
    <section
      ref={sortable.setNodeRef}
      style={{
        background:
          col.color ??
          pastelColors[
            ["todo", "active", "waiting", "done"].indexOf(col.kind) * 4
          ] ??
          pastelColors[8],
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={`kanban-column ${sortable.isOver ? "drop-target" : ""}`}
    >
      <header>
        <button
          className="drag-handle"
          aria-label={`Reordenar coluna ${col.title}`}
          {...sortable.attributes}
          {...sortable.listeners}
          title="Arraste ou use Alt + ←/→ para reordenar"
          onKeyDown={(e) => {
            if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
              e.preventDefault();
              onShift(e.key === "ArrowLeft" ? -1 : 1);
            } else sortable.listeners?.onKeyDown?.(e);
          }}
        >
          ⠿
        </button>
        <button className="column-title" onClick={onRename}>
          {col.title}
        </button>
        <small>{count}</small>
        <button
          className="icon-button"
          aria-label={`Editar coluna ${col.title}`}
          onClick={onRename}
        >
          •••
        </button>
        <button
          className="icon-button"
          aria-label={`Adicionar em ${col.title}`}
          onClick={onAdd}
        >
          ＋
        </button>
      </header>
      {children}
    </section>
  );
}
function Card({
  today,
  calendarState,
  task: t,
  columns,
  archive,
  onEdit,
  onDetails,
  onMove,
  onReorder,
}: {
  today: string;
  calendarState?: import("@pingo/core").SyncState;
  task: Task;
  columns: Column[];
  archive: boolean;
  onEdit: () => void;
  onDetails: () => void;
  onMove: (id: string) => void;
  onReorder: (direction: number) => void;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: t.id,
    data: { kind: "task", columnId: t.columnId },
    disabled: archive,
  });
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      className="task-card"
    >
      <div className="card-labels">
        {t.labels?.map((l) => (
          <span key={l.id} style={{ background: l.color }}>
            {l.name}
          </span>
        ))}
      </div>
      <div className="card-controls">
        <button
          className="drag-handle"
          aria-label={`Arrastar ${t.title}`}
          title="Arraste ou use Alt + ↑/↓ para reordenar"
          {...attributes}
          {...listeners}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              onReorder(e.key === "ArrowUp" ? -1 : 1);
            } else listeners?.onKeyDown?.(e);
          }}
        >
          ⠿
        </button>
        <span className={`priority priority-${t.priority}`}>
          {t.priority === "high"
            ? "Alta prioridade"
            : t.priority === "low"
              ? "Baixa prioridade"
              : "Rotina"}
        </span>
        <button
          className="text-link"
          onClick={onDetails}
          aria-label={`Organizar ${t.title}`}
        >
          •••
        </button>
      </div>
      <button className="card-main" onClick={onEdit}>
        <h3>{t.title}</h3>
        {t.notes && <p>{t.notes}</p>}
        {t.id.startsWith("event:") && (
          <span className="priority">Compromisso</span>
        )}
        {taskIsLate(t, today) && !t.id.startsWith("event:") && (
          <strong className="overdue-badge">Atrasada · {t.dueDate}</strong>
        )}
        <small className="card-due">
          {t.dueDate ?? "Sem data"}
          {t.scheduledStart
            ? ` · ${new Date(t.scheduledStart).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </small>
        {!!t.checklist?.length && (
          <small>
            ☑ {t.checklist.filter((i) => i.done).length}/{t.checklist.length}
          </small>
        )}
        <small className={`sync-state state-${t.syncState}`}>
          {calendarState ? "Tasks: " : ""}
          {
            {
              pending: "Pendente",
              synced: "Sincronizado",
              error: "Erro",
              conflict: "Conflito",
              syncing: "Sincronizando",
            }[t.syncState]
          }
        </small>
        {calendarState && (
          <small className={`sync-state state-${calendarState}`}>
            Agenda:{" "}
            {
              {
                pending: "Pendente",
                syncing: "Sincronizando",
                synced: "Sincronizada",
                error: "Erro",
                conflict: "Conflito",
              }[calendarState]
            }
          </small>
        )}
      </button>
      <select
        aria-label={`Mover ${t.title}`}
        value={t.columnId}
        onChange={(e) => onMove(e.target.value)}
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </article>
  );
}
function CardDetails({
  task: t,
  existingLabels,
  act,
  onEdit,
  onClose,
}: {
  task: Task;
  existingLabels: NonNullable<Task["labels"]>;
  act: (c: Command) => Promise<void>;
  onEdit: (t: Partial<Task>) => void;
  onClose: () => void;
}) {
  const [checks, setChecks] = useState(t.checklist ?? []);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => setChecks(t.checklist ?? []), [t.revision]);
  const [title, setTitle] = useState(t.title),
    [label, setLabel] = useState(""),
    [color, setColor] = useState("#b9dfcd"),
    [item, setItem] = useState(""),
    [error, setError] = useState("");
  const run = async (c: Command) => {
    try {
      await act(c);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const metadata = (
    m: Extract<Command, { type: "task.metadata" }>["metadata"],
  ) =>
    void run({
      type: "task.metadata",
      id: t.id,
      expectedRevision: t.revision,
      metadata: m,
    });
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-label="Organizar cartão"
      className="panel card-details"
    >
      <header>
        <h2>Organizar cartão</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar organização"
        >
          ×
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run({
            type: "task.upsert",
            task: { ...t, title },
            expectedRevision: t.revision,
          });
        }}
      >
        <label>
          Título rápido
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <button className="button">Salvar título</button>
      </form>
      <button
        className="text-link"
        onClick={() => {
          onClose();
          onEdit(t);
        }}
      >
        Editar descrição e prazo
      </button>
      <h3>Etiquetas</h3>
      <select
        aria-label="Adicionar etiqueta existente"
        value=""
        onChange={(e) => {
          const label = existingLabels.find((l) => l.id === e.target.value);
          if (label && !t.labels?.some((l) => l.id === label.id))
            metadata({ labels: [...(t.labels ?? []), label] });
        }}
      >
        <option value="">Escolher etiqueta existente</option>
        {existingLabels
          .filter((l) => !t.labels?.some((x) => x.id === l.id))
          .map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
      </select>
      <div className="card-labels">
        {t.labels?.map((l) => (
          <button
            key={l.id}
            style={{ background: l.color }}
            onClick={() =>
              metadata({ labels: t.labels?.filter((x) => x.id !== l.id) })
            }
            title="Remover etiqueta"
          >
            {l.name} ×
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          metadata({
            labels: [
              ...(t.labels ?? []),
              { id: crypto.randomUUID(), name: label, color },
            ],
          });
          setLabel("");
        }}
      >
        <input
          aria-label="Nome da etiqueta"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          maxLength={40}
        />
        <input
          aria-label="Cor da etiqueta"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <button className="button">Adicionar etiqueta</button>
      </form>
      <h3>Checklist</h3>
      {checks.map((i) => (
        <div className="checklist-item" key={i.id}>
          <label>
            <input
              type="checkbox"
              checked={i.done}
              onChange={(e) => {
                const next = checks.map((x) =>
                  x.id === i.id ? { ...x, done: e.target.checked } : x,
                );
                setChecks(next);
                metadata({ checklist: next });
              }}
            />
            {i.text}
          </label>
          <button
            aria-label={`Remover ${i.text}`}
            onClick={() =>
              metadata({
                checklist: t.checklist?.filter((x) => x.id !== i.id),
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          metadata({
            checklist: [
              ...(t.checklist ?? []),
              { id: crypto.randomUUID(), text: item, done: false },
            ],
          });
          setItem("");
        }}
      >
        <input
          aria-label="Novo item do checklist"
          value={item}
          onChange={(e) => setItem(e.target.value)}
          required
          maxLength={500}
        />
        <button className="button">Adicionar item</button>
      </form>
      <div className="dialog-actions">
        <button
          className="button"
          onClick={() => {
            void run({
              type: "task.upsert",
              task: {
                ...t,
                importId: undefined,
                id: crypto.randomUUID(),
                title: t.title + " (cópia)",
                position: Date.now(),
                archivedAt: null,
              },
              expectedRevision: 0,
            }).then(onClose);
          }}
        >
          Duplicar
        </button>
        <button
          className="button"
          onClick={() => {
            metadata({
              archivedAt: t.archivedAt ? null : new Date().toISOString(),
            });
            onClose();
          }}
        >
          {t.archivedAt ? "Restaurar" : "Arquivar"}
        </button>
      </div>
    </dialog>
  );
}
