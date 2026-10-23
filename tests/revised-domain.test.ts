import { describe, it, expect } from "vitest";
import {
  emptyWorkspace,
  newBoard,
  applyCommand,
  normalizeWorkspace,
  dayBounds,
  taskOrder,
  routineInput,
  overlaps,
  type Command,
} from "../packages/core/src/index";
function fixture() {
  let w = emptyWorkspace();
  w.boards = [newBoard("b", "Lista")];
  for (const id of ["a", "b", "c"])
    w = applyCommand(
      w,
      {
        type: "task.upsert",
        task: {
          id,
          boardId: "b",
          columnId: "b:todo",
          title: id,
          notes: "",
          dueDate: null,
          scheduledStart: null,
          scheduledEnd: null,
          priority: "normal",
        },
        expectedRevision: 0,
      },
      crypto.randomUUID(),
    );
  w.outbox = [];
  w.tasks.forEach((t) => (t.syncState = "synced"));
  return w;
}
describe("organização própria do Pingo", () => {
  it("reordena sem alterar ou reenviar o conteúdo Google", () => {
    const w = fixture(),
      next = applyCommand(
        w,
        {
          type: "task.move",
          id: "c",
          columnId: "b:todo",
          beforeId: "a",
          expectedRevision: 1,
        },
        crypto.randomUUID(),
      );
    expect(
      next.tasks
        .slice()
        .sort(taskOrder)
        .map((t) => t.id),
    ).toEqual(["c", "a", "b"]);
    expect(next.outbox).toEqual([]);
    expect(next.tasks.find((t) => t.id === "c")?.syncState).toBe("synced");
  });
  it("concluir via arraste envia exatamente uma mudança ao Google", () => {
    const next = applyCommand(
      fixture(),
      {
        type: "task.move",
        id: "a",
        columnId: "b:done",
        beforeId: null,
        expectedRevision: 1,
      },
      crypto.randomUUID(),
    );
    expect(next.tasks[0].completed).toBe(true);
    expect(next.outbox).toHaveLength(1);
  });
  it("arquiva, restaura e mantém metadados quando cliente antigo edita", () => {
    let w = fixture();
    w = applyCommand(
      w,
      {
        type: "task.metadata",
        id: "a",
        expectedRevision: 1,
        metadata: {
          labels: [{ id: "x", name: "Casa", color: "#abcdef" }],
          checklist: [{ id: "i", text: "Separar", done: true }],
          archivedAt: new Date().toISOString(),
        },
      },
      crypto.randomUUID(),
    );
    expect(w.outbox).toHaveLength(0);
    const { labels, checklist, archivedAt, position, ...old } = w.tasks[0];
    w = applyCommand(
      w,
      {
        type: "task.upsert",
        task: { ...old, title: "Nome novo" },
        expectedRevision: 2,
      },
      crypto.randomUUID(),
    );
    expect(w.tasks.at(-1)?.labels).toEqual(labels);
    expect(w.tasks.at(-1)?.archivedAt).toBe(archivedAt);
  });
  it("preserva a função Concluído ao renomear e mover coluna", () => {
    const next = applyCommand(
      fixture(),
      {
        type: "column.update",
        boardId: "b",
        columnId: "b:done",
        title: "Feito!",
        index: 0,
        expectedRevision: 1,
      },
      crypto.randomUUID(),
    );
    expect(next.boards[0].columns[0]).toMatchObject({
      kind: "done",
      title: "Feito!",
    });
  });
  it("não aceita destino que saiu da coluna", () =>
    expect(() =>
      applyCommand(
        fixture(),
        {
          type: "task.move",
          id: "a",
          columnId: "b:active",
          beforeId: "b",
          expectedRevision: 1,
        },
        crypto.randomUUID(),
      ),
    ).toThrow("destino mudou"));
});
it("migra conversa antiga uma única vez sem perder mensagens", () => {
  const w = fixture();
  w.conversation = [{ role: "user", text: "Olá" }];
  normalizeWorkspace(w);
  normalizeWorkspace(w);
  expect(w.conversations).toHaveLength(1);
  expect(w.conversations![0].messages).toEqual(w.conversation);
});
it("mensagens de sessões permanecem separadas", () => {
  let w = fixture();
  for (const id of ["one", "two"])
    w = applyCommand(
      w,
      { type: "conversation.update", id, title: id, archived: false },
      crypto.randomUUID(),
    );
  w.conversations![0].messages.push({ role: "user", text: "Meu dentista" });
  expect(w.conversations![1].messages).toHaveLength(0);
});
it("preferências antigas não apagam a rotina nova", () => {
  let w = fixture();
  w.preferences.routine = [
    { day: 6, work: [], personal: [{ start: "14:00", end: "18:00" }] },
  ];
  const { routine, ...old } = w.preferences;
  w = applyCommand(
    w,
    { type: "preferences.update", preferences: old },
    crypto.randomUUID(),
  );
  expect(w.preferences.routine).toEqual(routine);
});
it("valida intervalos e dias repetidos da rotina", () => {
  expect(
    routineInput.safeParse([
      { day: 1, work: [{ start: "18:00", end: "09:00" }], personal: [] },
    ]).success,
  ).toBe(false);
  expect(
    routineInput.safeParse([
      { day: 1, work: [], personal: [] },
      { day: 1, work: [], personal: [] },
    ]).success,
  ).toBe(false);
});
it("dia local usa 23 ou 25 horas quando o fuso muda", () => {
  const spring = dayBounds("2026-03-08", "America/New_York"),
    fall = dayBounds("2026-11-01", "America/New_York");
  expect((Date.parse(spring.end) - Date.parse(spring.start)) / 3600000).toBe(
    23,
  );
  expect((Date.parse(fall.end) - Date.parse(fall.start)) / 3600000).toBe(25);
});
it("evento de dia inteiro tem fim exclusivo ao detectar conflito", () => {
  const base = {
    id: "a",
    title: "Dia",
    calendarId: "primary",
    revision: 1,
    syncState: "synced" as const,
  };
  expect(
    overlaps(
      { ...base, allDay: true, start: "2026-10-22", end: "2026-10-23" },
      {
        ...base,
        id: "b",
        allDay: false,
        start: "2026-10-23T00:00:00-03:00",
        end: "2026-10-23T01:00:00-03:00",
      },
      "America/Sao_Paulo",
    ),
  ).toBe(false);
});
