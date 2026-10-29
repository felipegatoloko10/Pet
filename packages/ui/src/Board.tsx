import { StatusPicker } from "./StatusPicker";
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
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Plus,
  Search,
} from "lucide-react";
import { Sticker, StickerCluster } from "./Stickers";
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
  localOnly?: boolean;
  w: Workspace;
  today: string;
  act: (c: Command) => Promise<void>;
  onEdit: (t: Partial<Task>) => void;
  onEventEdit?: (e: import("@pingo/core").CalendarEvent) => void;
};
const columnColor = (column: Column) =>
  column.color ??
  (
    {
      todo: "#FFC8DD",
      active: "#FFF3A8",
      waiting: "#C9B6FF",
      done: "#A8F0E0",
    } as Record<string, string>
  )[column.kind] ??
  "#B8E0FF";
export function Board({
  w,
  today,
  act,
  onEdit,
  onEventEdit,
  localOnly,
}: Props) {
  const [query, setQuery] = useState(""),
    [priority, setPriority] = useState(""),
    [active, setActive] = useState<string | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [error, setError] = useState("");
  const [columnEditor, setColumnEditor] = useState<Column | "new" | null>(null);
  const b =
    w.boards.find((b) => b.id === w.preferences.defaultBoardId) ?? w.boards[0];
  const kanban = useRef<HTMLDivElement>(null);
  const [visibleColumn, setVisibleColumn] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  function showColumn(id: string) {
    const container = kanban.current;
    const column =
      container &&
      [...container.querySelectorAll<HTMLElement>("[data-column-id]")].find(
        (element) => element.dataset.columnId === id,
      );
    if (!container || !column) return;
    container.scrollTo({
      left:
        container.scrollLeft +
        column.getBoundingClientRect().left -
        container.getBoundingClientRect().left,
      behavior: reduceMotion ? "instant" : "smooth",
    });
    setVisibleColumn(id);
  }
  function trackColumn() {
    const container = kanban.current;
    if (!container) return;
    const left = container.getBoundingClientRect().left;
    const closest = [
      ...container.querySelectorAll<HTMLElement>("[data-column-id]"),
    ].sort(
      (a, b) =>
        Math.abs(a.getBoundingClientRect().left - left) -
        Math.abs(b.getBoundingClientRect().left - left),
    )[0];
    if (closest?.dataset.columnId) setVisibleColumn(closest.dataset.columnId);
  }
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
  const archive = false;
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
        (!priority || t.priority === priority),
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
        <div className="board-heading-copy">
          <div className="board-date">
            <CalendarDays size={15} aria-hidden="true" />
            {new Intl.DateTimeFormat("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            }).format(new Date(today + "T12:00:00Z"))}
          </div>
          <h1>
            Uma coisa <em>de cada vez.</em>
          </h1>
          <p>Pequenos passos. Um dia com a sua cara.</p>
        </div>
        <StickerCluster className="board-heading-art" />
        <button
          className="button primary"
          aria-label="Nova tarefa"
          disabled={!b}
          onClick={() => onEdit({ boardId: b?.id })}
        >
          <Plus size={19} aria-hidden="true" /> Nova tarefa
        </button>
      </div>
      <div className="board-toolbar">
        <div className="board-search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Buscar tarefas"
            placeholder="Buscar título ou descrição"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar prioridade"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">Prioridade</option>
          <option value="high">Alta</option>
          <option value="normal">Normal</option>
          <option value="low">Baixa</option>
        </select>
      </div>
      {b && (
        <div
          className="board-shortcuts"
          role="group"
          aria-label="Ir para uma coluna"
        >
          {b.columns.map((column) => (
            <button
              key={column.id}
              aria-label={`Ver coluna ${column.title}`}
              aria-pressed={(visibleColumn || b.columns[0]?.id) === column.id}
              style={{ background: columnColor(column) }}
              onClick={() => showColumn(column.id)}
            >
              {column.title}
              <small>
                {visible.filter((t) => t.columnId === column.id).length}
              </small>
            </button>
          ))}
        </div>
      )}
      <div className="board-scroll-note">
        <span>Deslize para explorar o quadro</span>
        <ArrowRight size={15} aria-hidden="true" />
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
            <div
              ref={kanban}
              onScroll={trackColumn}
              className={`kanban ${active ? "is-dragging" : ""}`}
            >
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
                          localOnly={localOnly}
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
          <DragOverlay
            dropAnimation={
              reduceMotion
                ? null
                : { duration: 280, easing: "cubic-bezier(.22,1.25,.4,1)" }
            }
          >
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
          <p>Seu quadro está sendo preparado.</p>
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
    transition: { duration: 260, easing: "cubic-bezier(.22,1.2,.4,1)" },
  });
  return (
    <section
      data-column-id={col.id}
      ref={sortable.setNodeRef}
      style={{
        background: columnColor(col),
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
      {count === 0 && (
        <div className="column-empty">
          <Sticker
            shape={
              col.kind === "done"
                ? "star"
                : col.kind === "active"
                  ? "heart"
                  : col.kind === "waiting"
                    ? "bow"
                    : "cloud"
            }
          />
          <p>
            {archive
              ? "Nenhum cartão arquivado por aqui."
              : col.kind === "done"
                ? "Um lugar para suas pequenas conquistas."
                : col.kind === "active"
                  ? "Uma coisa de cada vez. Você consegue!"
                  : col.kind === "waiting"
                    ? "Tudo bem dar um tempinho."
                    : "Seu próximo pequeno passo começa aqui."}
          </p>
        </div>
      )}
    </section>
  );
}
function Card({
  localOnly,
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
  localOnly?: boolean;
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
    transition: { duration: 260, easing: "cubic-bezier(.22,1.2,.4,1)" },
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
        {t.seriesId && (
          <small className="repeat-badge">↻ Tarefa com repetição</small>
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
          {calendarState && !localOnly ? "Tarefa: " : ""}
          {
            {
              pending: "Pendente",
              synced: localOnly ? "Salvo neste aparelho" : "Sincronizado",
              error: "Erro",
              conflict: "Conflito",
              syncing: "Sincronizando",
            }[t.syncState]
          }
        </small>
        {calendarState && !localOnly && (
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
      <StatusPicker
        label={`Mover ${t.title}`}
        value={t.columnId}
        columns={columns}
        onChange={onMove}
      />
    </article>
  );
}
function CardDetails({
  task: t,
  act,
  onEdit,
  onClose,
}: {
  task: Task;
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
      </div>
    </dialog>
  );
}
