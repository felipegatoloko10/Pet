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
} from "@pingo/core";
type Props = {
  w: Workspace;
  today: string;
  act: (c: Command) => Promise<void>;
  onEdit: (t: Partial<Task>) => void;
};
export function Board({ w, today, act, onEdit }: Props) {
  const [selected, setSelected] = useState(w.preferences.defaultBoardId),
    [query, setQuery] = useState(""),
    [priority, setPriority] = useState(""),
    [label, setLabel] = useState(""),
    [due, setDue] = useState(""),
    [status, setStatus] = useState(""),
    [archive, setArchive] = useState(false),
    [active, setActive] = useState<string | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [error, setError] = useState("");
  const b = w.boards.find((b) => b.id === selected) ?? w.boards[0];
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
  const cards = w.tasks.filter((t) => !t.deleted && t.boardId === b?.id);
  const labels = [
    ...new Map(
      cards.flatMap((t) => t.labels ?? []).map((l) => [l.id, l]),
    ).values(),
  ];
  const visible = cards
    .filter(
      (t) =>
        !!t.archivedAt === archive &&
        (!query ||
          `${t.title} ${t.notes}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!priority || t.priority === priority) &&
        (!label || t.labels?.some((l) => l.id === label)) &&
        (!status || t.columnId === status) &&
        (!due ||
          (due === "today"
            ? t.dueDate === today
            : due === "late"
              ? !!t.dueDate && t.dueDate < today && !t.completed
              : !t.dueDate)),
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
    perform({
      type: "task.move",
      id: task.id,
      columnId: col.id,
      beforeId,
      expectedRevision: task.revision,
    });
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
        <label>
          Lista{" "}
          <select
            aria-label="Lista do quadro"
            value={b?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {w.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
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
        <select
          aria-label="Filtrar prazo"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        >
          <option value="">Todos os prazos</option>
          <option value="today">Hoje</option>
          <option value="late">Atrasadas</option>
          <option value="none">Sem prazo</option>
        </select>
        <select
          aria-label="Filtrar status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {b?.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button className="button small" onClick={() => setArchive(!archive)}>
          {archive ? "Voltar ao quadro" : "Arquivados"}
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
              {b.columns.map((col, index) => (
                <BoardColumn
                  key={col.id}
                  col={col}
                  count={visible.filter((t) => t.columnId === col.id).length}
                  archive={archive}
                  onAdd={() => onEdit({ boardId: b.id, columnId: col.id })}
                  onRename={() => {
                    const title = prompt("Nome da coluna", col.title);
                    if (title?.trim())
                      perform({
                        type: "column.update",
                        boardId: b.id,
                        columnId: col.id,
                        title,
                        index,
                        expectedRevision: b.revision,
                      });
                  }}
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
                          onEdit={() => onEdit(t)}
                          onDetails={() => setDetail(t.id)}
                          onMove={(columnId) =>
                            perform({
                              type: "task.move",
                              id: t.id,
                              columnId,
                              beforeId: null,
                              expectedRevision: t.revision,
                            })
                          }
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
                            perform({
                              type: "task.move",
                              id: t.id,
                              columnId: t.columnId,
                              beforeId:
                                direction < 0
                                  ? list[index - 1].id
                                  : (list[index + 2]?.id ?? null),
                              expectedRevision: t.revision,
                            });
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
          <button
            className="button"
            onClick={() => {
              const title = prompt("Nome do quadro local");
              if (title)
                perform({
                  type: "board.create",
                  id: crypto.randomUUID(),
                  title,
                });
            }}
          >
            Criar quadro local
          </button>
        </div>
      )}
      {b && (
        <button
          className="add-inline"
          onClick={() => {
            const title = prompt("Nome da nova coluna");
            if (title)
              perform({
                type: "column.create",
                id: crypto.randomUUID(),
                boardId: b.id,
                title,
                expectedRevision: b.revision,
              });
          }}
        >
          ＋ Adicionar coluna
        </button>
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
  task: t,
  columns,
  archive,
  onEdit,
  onDetails,
  onMove,
  onReorder,
}: {
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
        <small className="card-due">{t.dueDate ?? "Sem prazo"}</small>
        {!!t.checklist?.length && (
          <small>
            ☑ {t.checklist.filter((i) => i.done).length}/{t.checklist.length}
          </small>
        )}
        <small className={`sync-state state-${t.syncState}`}>
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
