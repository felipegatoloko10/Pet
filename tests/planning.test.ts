import { describe, it, expect } from "vitest";
import {
  applyCommand,
  emptyWorkspace,
  newBoard,
  taskOnDay,
  taskIsLate,
  taskAlarms,
  taskScheduleKey,
  mirrorId,
  mergeGoogleTask,
  zonedDateTime,
} from "../packages/core/src/index";
const at = "2026-10-23T12:00:00.000Z";
function seed(timed = true) {
  const w = emptyWorkspace();
  w.boards = [newBoard("b", "Rotina", "google-list")];
  w.preferences.defaultBoardId = "b";
  return applyCommand(
    w,
    {
      type: "task.upsert",
      expectedRevision: 0,
      task: {
        id: "t",
        boardId: "b",
        columnId: "b:todo",
        title: "Fazer bolo",
        notes: "",
        dueDate: "2026-10-23",
        scheduledStart: timed ? "2026-10-23T13:00:00.000Z" : null,
        scheduledEnd: timed ? "2026-10-23T13:30:00.000Z" : null,
        priority: "normal",
      },
    },
    "create",
    at,
  );
}
describe("quadro diário e agenda vinculada", () => {
  it("cria apenas um vínculo estável e reserva dia inteiro quando não há horário", () => {
    let w = seed(false);
    expect(w.events).toHaveLength(1);
    expect(w.events[0]).toMatchObject({
      id: mirrorId("t"),
      taskId: "t",
      allDay: true,
      start: "2026-10-23",
      end: "2026-10-24",
    });
    w = applyCommand(
      w,
      {
        type: "task.upsert",
        task: { ...w.tasks[0], title: "Bolo de cenoura" },
        expectedRevision: 1,
      },
      "edit",
      at,
    );
    expect(w.events).toHaveLength(1);
    expect(w.events[0].title).toBe("Bolo de cenoura");
    expect(new Set(w.outbox.map((j) => j.id)).size).toBe(w.outbox.length);
  });
  it("concluir uma tarefa atrasada mantém hoje e remove amanhã sem excluir histórico", () => {
    let w = seed();
    expect(taskOnDay(w.tasks[0], "2026-10-24", w.preferences.timezone)).toBe(
      true,
    );
    expect(
      taskIsLate(w.tasks[0], "2026-10-24", Date.parse("2026-10-24T12:00Z")),
    ).toBe(true);
    w = applyCommand(
      w,
      {
        type: "task.move",
        id: "t",
        columnId: "b:done",
        beforeId: null,
        expectedRevision: 1,
      },
      "finish",
      "2026-10-24T12:00:00Z",
    );
    expect(taskOnDay(w.tasks[0], "2026-10-24", w.preferences.timezone)).toBe(
      true,
    );
    expect(taskOnDay(w.tasks[0], "2026-10-25", w.preferences.timezone)).toBe(
      false,
    );
    expect(w.events[0].title).toBe("✓ Fazer bolo");
  });
  it("não atribui data silenciosamente a uma tarefa antiga", () => {
    const w = seed();
    w.tasks[0].dueDate = null;
    expect(taskOnDay(w.tasks[0], "2026-10-23", w.preferences.timezone)).toBe(
      false,
    );
  });
  it("mover compromisso não cria tarefa nem altera o evento Google", () => {
    let w = seed();
    w.events.push({
      id: "appointment",
      title: "Dentista",
      start: at,
      end: "2026-10-23T13:00:00Z",
      allDay: false,
      calendarId: "primary",
      revision: 1,
      syncState: "synced",
    });
    const count = w.outbox.length;
    w = applyCommand(
      w,
      {
        type: "event.move",
        id: "appointment",
        columnId: "b:done",
        beforeId: null,
        expectedRevision: 1,
      },
      "move",
      at,
    );
    expect(w.tasks).toHaveLength(1);
    expect(w.events.find((e) => e.id === "appointment")!.completedAt).toBe(at);
    expect(w.outbox).toHaveLength(count);
  });
  it("coluna excluída move os cartões sem excluir dados", () => {
    let w = seed();
    w = applyCommand(
      w,
      {
        type: "column.create",
        id: "custom",
        boardId: "b",
        title: "Depois",
        color: "#f9d8d8",
        expectedRevision: 1,
      },
      "col",
      at,
    );
    w = applyCommand(
      w,
      {
        type: "task.move",
        id: "t",
        columnId: "custom",
        beforeId: null,
        expectedRevision: 1,
      },
      "move",
      at,
    );
    w = applyCommand(
      w,
      {
        type: "column.delete",
        boardId: "b",
        columnId: "custom",
        destinationId: "b:todo",
        expectedRevision: 2,
      },
      "del",
      at,
    );
    expect(w.tasks[0].columnId).toBe("b:todo");
    expect(w.tasks[0].deleted).not.toBe(true);
    expect(w.boards[0].columns.some((c) => c.id === "custom")).toBe(false);
  });
  it("protege a coluna de andamento e agendas somente leitura", () => {
    let w = seed();
    expect(() =>
      applyCommand(
        w,
        {
          type: "column.delete",
          boardId: "b",
          columnId: "b:active",
          destinationId: "b:todo",
          expectedRevision: 1,
        },
        "x",
        at,
      ),
    ).toThrow("essencial");
    w.calendars = [
      { id: "holidays", title: "Feriados", readOnly: true, holiday: true },
    ];
    expect(() =>
      applyCommand(
        w,
        {
          type: "event.upsert",
          event: {
            id: "h",
            title: "Natal",
            calendarId: "holidays",
            start: "2026-12-25",
            end: "2026-12-26",
            allDay: true,
          },
          expectedRevision: 0,
          confirmed: false,
        },
        "x",
        at,
      ),
    ).toThrow("leitura");
  });
  it("preserva campos novos quando um cliente antigo edita título", () => {
    let w = seed();
    w.tasks[0].sourceMail = { id: "m", from: "Pessoa", receivedAt: at };
    const t = w.tasks[0];
    w = applyCommand(
      w,
      {
        type: "task.upsert",
        task: {
          id: t.id,
          boardId: t.boardId,
          columnId: t.columnId,
          title: "Novo título",
          notes: "",
          dueDate: t.dueDate,
          scheduledStart: t.scheduledStart,
          scheduledEnd: t.scheduledEnd,
          priority: t.priority,
        },
        expectedRevision: t.revision,
      },
      "legacy",
      at,
    );
    expect(w.tasks[0].sourceMail?.id).toBe("m");
  });
  it("Google Tasks preserva horário e fornece data real da conclusão", () => {
    const w = seed();
    w.tasks[0].googleId = "gt";
    w.outbox = [];
    mergeGoogleTask(w, w.boards[0], {
      id: "gt",
      title: "Bolo",
      due: "2026-10-24T00:00:00Z",
      status: "completed",
      completed: "2026-10-24T15:00:00Z",
    });
    expect(w.tasks[0].completedAt).toBe("2026-10-24T15:00:00Z");
    expect(w.tasks[0].scheduledStart).toBe("2026-10-23T13:00:00.000Z");
  });
});
describe("acompanhamento sem IA", () => {
  it("agenda quatro fases com identificadores estáveis, sem criar avisos para dia inteiro", () => {
    const w = seed();
    const alarms = taskAlarms(w, "alice", Date.parse(at));
    expect(alarms.map((a) => a.phase)).toEqual([
      "before",
      "start",
      "end",
      "repeat",
    ]);
    expect(new Set(alarms.map((a) => a.id)).size).toBe(4);
    expect(taskAlarms(seed(false), "alice", Date.parse(at))).toHaveLength(0);
  });
  it("Comecei mantém a agenda e cancela os pedidos de início", () => {
    let w = seed();
    const start = w.events[0].start;
    w = applyCommand(
      w,
      {
        type: "task.checkIn",
        id: "t",
        action: "start",
        phase: "start",
        scheduleKey: taskScheduleKey(w.tasks[0]),
        expectedRevision: 1,
      },
      "start",
      at,
    );
    expect(w.tasks[0].columnId).toBe("b:active");
    expect(w.tasks[0].actualStartedAt).toBe(at);
    expect(w.events[0].start).toBe(start);
    expect(taskAlarms(w, "alice", Date.parse(at)).map((a) => a.phase)).toEqual([
      "end",
      "repeat",
    ]);
  });
  it("adiar o fim cancela repetição automática e mantém um único adiamento", () => {
    let w = seed();
    w = applyCommand(
      w,
      {
        type: "task.checkIn",
        id: "t",
        action: "snooze",
        phase: "end",
        scheduleKey: taskScheduleKey(w.tasks[0]),
        expectedRevision: 1,
      },
      "snooze",
      "2026-10-23T13:30:00Z",
    );
    const alarms = taskAlarms(w, "alice", Date.parse("2026-10-23T13:31:00Z"));
    expect(alarms.map((a) => a.phase)).toEqual(["snooze"]);
    expect(alarms[0].dueAt).toBe(Date.parse("2026-10-23T13:45:00Z"));
    expect(alarms[0].snoozePhase).toBe("end");
  });
  it("conclusão cancela todos os avisos e não acontece pela passagem do tempo", () => {
    let w = seed();
    expect(
      taskAlarms(w, "alice", Date.parse("2026-10-23T15:00:00Z")),
    ).toHaveLength(0);
    expect(w.tasks[0].completed).toBe(false);
    w = applyCommand(
      w,
      {
        type: "task.checkIn",
        id: "t",
        action: "complete",
        phase: "end",
        scheduleKey: taskScheduleKey(w.tasks[0]),
        expectedRevision: 1,
      },
      "complete",
      at,
    );
    expect(taskAlarms(w, "alice", Date.parse(at))).toHaveLength(0);
  });
  it("rejeita retorno de uma notificação do horário anterior", () => {
    const w = seed();
    expect(() =>
      applyCommand(
        w,
        {
          type: "task.checkIn",
          id: "t",
          action: "complete",
          phase: "end",
          scheduleKey: "old",
          expectedRevision: 1,
        },
        "stale",
        at,
      ),
    ).toThrow("horário");
  });
  it("reagendar limpa o início anterior e gera apenas avisos do horário novo", () => {
    let w = seed();
    w = applyCommand(
      w,
      {
        type: "task.checkIn",
        id: "t",
        action: "start",
        phase: "start",
        scheduleKey: taskScheduleKey(w.tasks[0]),
        expectedRevision: 1,
      },
      "start",
      at,
    );
    w = applyCommand(
      w,
      {
        type: "task.upsert",
        task: {
          ...w.tasks[0],
          dueDate: "2026-10-24",
          scheduledStart: "2026-10-24T13:00:00.000Z",
          scheduledEnd: "2026-10-24T13:30:00.000Z",
        },
        expectedRevision: 2,
      },
      "reschedule",
      at,
    );
    expect(w.tasks[0].actualStartedAt).toBeNull();
    expect(taskAlarms(w, "alice", Date.parse(at)).map((a) => a.phase)).toEqual([
      "before",
      "start",
      "end",
      "repeat",
    ]);
  });
  it("adiamento offline conserva o instante escolhido sem gerar novo aviso ao sincronizar", () => {
    const w = applyCommand(
      seed(),
      {
        type: "task.checkIn",
        id: "t",
        action: "snooze",
        phase: "end",
        scheduleKey: taskScheduleKey(seed().tasks[0]),
        expectedRevision: 1,
        actedAt: "2026-10-23T13:30:00.000Z",
      },
      "offline-snooze",
      "2026-10-23T14:30:00.000Z",
    );
    expect(w.tasks[0].checkIn?.snoozeAt).toBe("2026-10-23T13:45:00.000Z");
    expect(
      taskAlarms(w, "alice", Date.parse("2026-10-23T14:30:00Z")),
    ).toHaveLength(0);
  });
  it("data local respeita fuso e horário de verão inexistente é rejeitado", () => {
    expect(zonedDateTime("2026-10-23", "09:00", "America/Sao_Paulo")).toBe(
      "2026-10-23T12:00:00.000Z",
    );
    expect(() =>
      zonedDateTime("2026-03-08", "02:30", "America/New_York"),
    ).toThrow("não existe");
  });
});
