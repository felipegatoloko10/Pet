import { describe, it, expect } from "vitest";
import {
  localWorkspace,
  applyCommand,
  materializeSeries,
  occurrenceDates,
  repetitionSchema,
  validPassword,
  type TaskSeries,
  taskOnDay,
  deviceReminderPlan,
  pingoImportInput,
  importPingoData,
} from "../packages/core/src/index";
const now = "2026-10-26T10:00:00Z";
function create(kind: "daily" | "weekly" | "monthly" | "interval" = "weekly") {
  const w = localWorkspace("America/Sao_Paulo");
  return applyCommand(
    w,
    {
      type: "task.upsert",
      expectedRevision: 0,
      repetition: repetitionSchema.parse({
        kind,
        weekdays: [1, 3, 5],
        monthDays: [31],
        interval: 3,
      }),
      task: {
        id: "pool",
        boardId: w.boards[0].id,
        columnId: w.boards[0].columns[0].id,
        title: "Limpar a piscina",
        notes: "",
        dueDate: "2026-10-26",
        scheduledStart: "2026-10-26T17:00:00Z",
        scheduledEnd: "2026-10-26T18:00:00Z",
        priority: "normal",
      },
    },
    "series-pool",
    now,
  );
}
describe("rotinas independentes", () => {
  it("gera seg/qua/sex e preserva pendências sem duplicar ao reconciliar", () => {
    let w = create();
    expect(w.tasks.map((t) => t.dueDate)).toEqual([
      "2026-10-26",
      "2026-10-28",
      "2026-10-30",
      "2026-11-02",
    ]);
    materializeSeries(w, "2026-11-02");
    expect(w.tasks).toHaveLength(4);
    const t = w.tasks[0];
    w = applyCommand(
      w,
      {
        type: "task.move",
        id: t.id,
        columnId: w.boards[0].columns.find((c) => c.kind === "done")!.id,
        beforeId: null,
        expectedRevision: t.revision,
      },
      "complete",
      now,
    );
    expect(w.tasks[0].completed).toBe(true);
    expect(w.tasks[1].completed).toBe(false);
    expect(taskOnDay(w.tasks[1], "2026-10-30", w.preferences.timezone)).toBe(
      true,
    );
  });
  it("dia 31 cai no último dia e não duplica seleções equivalentes", () => {
    const s = create("monthly").taskSeries![0];
    s.start = "2028-01-01";
    s.rule.monthDays = [30, 31];
    expect(occurrenceDates(s, "2028-03-01")).toEqual([
      "2028-01-30",
      "2028-01-31",
      "2028-02-29",
    ]);
  });
  it("intervalos usam data inicial e limites de quantidade", () => {
    const s = create("interval").taskSeries![0];
    s.rule.count = 3;
    expect(occurrenceDates(s, "2026-12-31")).toEqual([
      "2026-10-26",
      "2026-10-29",
      "2026-11-01",
    ]);
  });
  it("pausar e retomar não gera dias da pausa", () => {
    let w = create();
    const s = w.taskSeries![0];
    w = applyCommand(
      w,
      {
        type: "series.pause",
        id: s.id,
        expectedRevision: s.revision,
        date: "2026-10-27",
        paused: true,
      },
      "pause",
      now,
    );
    expect(w.tasks).toHaveLength(1);
    w = applyCommand(
      w,
      {
        type: "series.pause",
        id: s.id,
        expectedRevision: w.taskSeries![0].revision,
        date: "2026-10-30",
        paused: false,
      },
      "resume",
      now,
    );
    expect(w.tasks.map((t) => t.dueDate)).toEqual([
      "2026-10-26",
      "2026-10-30",
      "2026-11-02",
    ]);
  });
  it("edição de uma ocorrência preserva a próxima e excluir não recria", () => {
    let w = create();
    const t = w.tasks[1];
    w = applyCommand(
      w,
      {
        type: "task.upsert",
        task: { ...t, title: "Piscina com ajuda" },
        expectedRevision: 0,
      },
      "edit",
      now,
    );
    expect(w.tasks.find((x) => x.id === t.id)?.title).toBe("Piscina com ajuda");
    expect(w.tasks.find((x) => x.dueDate === "2026-10-30")?.title).toBe(
      "Limpar a piscina",
    );
    w = applyCommand(
      w,
      { type: "task.delete", id: t.id, expectedRevision: 1, confirmed: true },
      "delete",
      now,
    );
    materializeSeries(w, "2026-11-02");
    expect(w.tasks.filter((x) => x.id === t.id)).toHaveLength(1);
    expect(w.tasks.find((x) => x.id === t.id)?.deleted).toBe(true);
  });
  it("backup mantém regras e identidades", () => {
    const w = create(),
      copy = localWorkspace();
    importPingoData(copy, pingoImportInput().parse(w));
    expect(copy.taskSeries).toHaveLength(1);
    expect(copy.tasks[0].seriesId).toBe("series-pool");
  });
  it("avisos têm identidades separadas e conclusão cancela a ocorrência", () => {
    let w = create();
    const before = deviceReminderPlan(w, "u", Date.parse(now));
    expect(before.reminders.some((r) => r.taskId === w.tasks[0].id)).toBe(true);
    const t = w.tasks[0];
    w = applyCommand(
      w,
      {
        type: "task.move",
        id: t.id,
        columnId: w.boards[0].columns.find((c) => c.kind === "done")!.id,
        beforeId: null,
        expectedRevision: t.revision,
      },
      "done",
      now,
    );
    expect(
      deviceReminderPlan(w, "u", Date.parse(now)).reminders.some(
        (r) => r.taskId === t.id,
      ),
    ).toBe(false);
  });
});
it("ler avisos em lote não marca um aviso posterior", () => {
  const w = localWorkspace();
  w.notices = [
    { id: "one", title: "A", body: "B", read: false },
    { id: "two", title: "C", body: "D", read: false },
  ] as any;
  const next = applyCommand(
    w,
    { type: "notice.readMany", ids: ["one"] },
    "read",
    now,
  );
  expect(next.notices.map((n) => n.read)).toEqual([true, false]);
});
it("política de senha", () => {
  expect(validPassword("Amanda@21")).toBe(true);
  for (const p of ["amanda@21", "AMANDA@21", "Amanda221", "Amanda@aa", "Aa@1"])
    expect(validPassword(p)).toBe(false);
});

it("edição das próximas preserva histórico, evita duplicação e detecta versão concorrente", () => {
  let w = create();
  const t = w.tasks[1],
    series = w.taskSeries![0];
  w = applyCommand(
    w,
    {
      type: "task.upsert",
      task: { ...t, title: "Piscina renovada" },
      expectedRevision: 0,
      repetition: series.rule,
      scope: "future",
      expectedSeriesRevision: series.revision,
    },
    "new-series",
    now,
  );
  expect(
    w.tasks.filter((x) => !x.deleted && x.dueDate === "2026-10-28"),
  ).toHaveLength(1);
  expect(w.tasks.find((x) => x.dueDate === "2026-10-26")?.title).toBe(
    "Limpar a piscina",
  );
  expect(w.tasks.find((x) => x.dueDate === "2026-10-30")?.title).toBe(
    "Piscina renovada",
  );
  expect(() =>
    applyCommand(
      w,
      {
        type: "series.pause",
        id: series.id,
        expectedRevision: 1,
        date: "2026-10-27",
        paused: true,
      },
      "stale",
      now,
    ),
  ).toThrow(/outro dispositivo/);
});
it("horário local sobrevive à mudança de horário de verão", () => {
  const w = create("daily"),
    s = w.taskSeries![0];
  s.timezone = "America/New_York";
  s.start = "2026-10-30";
  s.template.scheduledStart = "2026-10-30T18:00:00Z";
  s.template.scheduledEnd = "2026-10-30T19:00:00Z";
  w.tasks = [];
  w.events = [];
  materializeSeries(w, "2026-11-03");
  expect(w.tasks[0].scheduledStart).toBe("2026-10-30T18:00:00.000Z");
  expect(w.tasks.find((t) => t.dueDate === "2026-11-02")?.scheduledStart).toBe(
    "2026-11-02T19:00:00.000Z",
  );
});

it("editar as próximas a partir de uma concluída preserva sua conclusão", () => {
  let w = create();
  const original = w.tasks[0];
  w = applyCommand(
    w,
    {
      type: "task.move",
      id: original.id,
      columnId: w.boards[0].columns.find((c) => c.kind === "done")!.id,
      beforeId: null,
      expectedRevision: original.revision,
    },
    "done-selected",
    now,
  );
  const t = w.tasks.find((x) => x.id === original.id)!,
    series = w.taskSeries![0];
  w = applyCommand(
    w,
    {
      type: "task.upsert",
      task: { ...t, title: "Piscina atualizada" },
      expectedRevision: t.revision,
      repetition: series.rule,
      scope: "future",
      expectedSeriesRevision: series.revision,
    },
    "next-completed",
    now,
  );
  expect(w.tasks.find((x) => x.id === t.id)?.completed).toBe(true);
  expect(
    w.tasks.filter((x) => x.dueDate === t.dueDate && !x.deleted),
  ).toHaveLength(1);
  expect(w.tasks.find((x) => x.dueDate === "2026-10-28")?.completed).toBe(
    false,
  );
});
