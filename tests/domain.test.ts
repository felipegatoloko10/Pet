import { describe, it, expect } from "vitest";
import {
  applyCommand,
  emptyWorkspace,
  newBoard,
  mergeGoogleTask,
  defaultPreferences,
  isQuiet,
  petState,
  operationSchema,
  zonedParts,
} from "../packages/core/src/index";
const seed = () => {
  const w = emptyWorkspace();
  w.boards = [newBoard("b", "Minha lista", "gl")];
  return w;
};
const task = (w = seed()) => ({
  id: "t",
  boardId: "b",
  columnId: w.boards[0].columns[0].id,
  title: "Remédio",
  notes: "",
  dueDate: "2026-10-23",
  scheduledStart: null,
  scheduledEnd: null,
  priority: "normal" as const,
});
describe("operações isoladas e revisões", () => {
  it("não aceita referência a quadro de outra conta", () =>
    expect(() =>
      applyCommand(
        emptyWorkspace(),
        { type: "task.upsert", task: task(), expectedRevision: 0 },
        crypto.randomUUID(),
      ),
    ).toThrow("Quadro"));
  it("conflitos não sobrescrevem silenciosamente", () => {
    const w = applyCommand(
      seed(),
      { type: "task.upsert", task: task(), expectedRevision: 0 },
      "create",
    );
    expect(() =>
      applyCommand(
        w,
        {
          type: "task.upsert",
          task: { ...task(), title: "Outro" },
          expectedRevision: 0,
        },
        "edit",
      ),
    ).toThrow("outro dispositivo");
    expect(w.tasks[0].title).toBe("Remédio");
  });
  it("coluna e prazo não se confundem com horário reservado", () => {
    const w = applyCommand(
      seed(),
      {
        type: "task.upsert",
        task: {
          ...task(),
          columnId: "b:active",
          scheduledStart: "2026-10-23T09:00:00-03:00",
          scheduledEnd: "2026-10-23T10:00:00-03:00",
        },
        expectedRevision: 0,
      },
      "create",
    );
    expect(w.tasks[0]).toMatchObject({
      completed: false,
      dueDate: "2026-10-23",
      columnId: "b:active",
    });
    expect(w.tasks[0].scheduledStart).toContain("09:00");
  });
  it("importação repetida não cria nova tarefa", () => {
    let w = applyCommand(
      seed(),
      {
        type: "task.upsert",
        task: { ...task(), importId: "legacy:x" },
        expectedRevision: 0,
      },
      "1",
    );
    w = applyCommand(
      w,
      {
        type: "task.upsert",
        task: { ...task(), id: "different", importId: "legacy:x" },
        expectedRevision: 0,
      },
      "2",
    );
    expect(w.tasks).toHaveLength(1);
  });
  it("exclusão precisa de confirmação explícita", () =>
    expect(
      operationSchema.safeParse({
        operationId: crypto.randomUUID(),
        command: {
          type: "task.delete",
          id: "x",
          expectedRevision: 1,
          confirmed: false,
        },
      }).success,
    ).toBe(false));
  it("convites não passam sem confirmação", () =>
    expect(() =>
      applyCommand(
        seed(),
        {
          type: "event.upsert",
          event: {
            id: "e",
            title: "Reunião",
            start: "2026-10-23T12:00:00Z",
            end: "2026-10-23T13:00:00Z",
            allDay: false,
            calendarId: "primary",
            attendees: ["pessoa@example.com"],
          },
          expectedRevision: 0,
          confirmed: false,
        },
        "e",
      ),
    ).toThrow("convites"));
  it("criação incerta impede outra alteração no item", () => {
    const w = applyCommand(
      seed(),
      { type: "task.upsert", task: task(), expectedRevision: 0 },
      "1",
    );
    w.outbox[0].state = "uncertain";
    expect(() =>
      applyCommand(
        w,
        { type: "task.upsert", task: task(), expectedRevision: 1 },
        "2",
      ),
    ).toThrow("confirmação");
  });
});
describe("reconciliação Google", () => {
  it("concluir e reabrir externamente usa as colunas corretas", () => {
    const w = seed();
    const b = w.boards[0];
    mergeGoogleTask(w, b, {
      id: "g",
      title: "T",
      status: "needsAction",
      updated: "1",
    });
    w.tasks[0].columnId = "b:active";
    mergeGoogleTask(w, b, {
      id: "g",
      title: "Atualizada",
      status: "needsAction",
      updated: "2",
    });
    expect(w.tasks[0].columnId).toBe("b:active");
    mergeGoogleTask(w, b, { id: "g", status: "completed", updated: "3" });
    expect(w.tasks[0].columnId).toBe("b:done");
    mergeGoogleTask(w, b, { id: "g", status: "needsAction", updated: "4" });
    expect(w.tasks[0].columnId).toBe("b:todo");
  });
  it("mudança pendente local vira conflito sem perda", () => {
    const w = seed();
    mergeGoogleTask(w, w.boards[0], {
      id: "g",
      title: "Original",
      updated: "1",
    });
    const t = w.tasks[0];
    w.outbox.push({
      id: "o",
      kind: "task",
      entityId: t.id,
      action: "upsert",
      state: "pending",
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
    });
    mergeGoogleTask(w, w.boards[0], {
      id: "g",
      title: "Externa",
      updated: "2",
    });
    expect(t.title).toBe("Original");
    expect(t.syncState).toBe("conflict");
  });
  it("prazo vindo do Google permanece data, sem inventar hora", () => {
    const w = seed();
    mergeGoogleTask(w, w.boards[0], {
      id: "g",
      title: "T",
      due: "2026-10-23T00:00:00.000Z",
    });
    expect(w.tasks[0].dueDate).toBe("2026-10-23");
    expect(w.tasks[0].scheduledStart).toBeNull();
  });
});
describe("rotina e fuso", () => {
  it("silêncio atravessa meia-noite", () => {
    expect(isQuiet(new Date("2026-10-23T02:00:00Z"), defaultPreferences)).toBe(
      true,
    );
    expect(isQuiet(new Date("2026-10-23T14:00:00Z"), defaultPreferences)).toBe(
      false,
    );
  });
  it("sono e foco são decididos localmente", () => {
    expect(petState(new Date("2026-10-23T04:00:00Z"), defaultPreferences)).toBe(
      "sleep",
    );
    expect(
      petState(new Date("2026-10-23T15:00:00Z"), defaultPreferences, true),
    ).toBe("focus");
  });
  it("respeita troca de data e horário de verão", () => {
    expect(
      zonedParts(new Date("2026-11-01T05:30:00Z"), "America/New_York").time,
    ).toBe("01:30");
    expect(
      zonedParts(new Date("2026-11-01T06:30:00Z"), "America/New_York").time,
    ).toBe("01:30");
    expect(
      zonedParts(new Date("2026-10-23T01:00:00Z"), "America/Sao_Paulo").date,
    ).toBe("2026-10-22");
  });
});
