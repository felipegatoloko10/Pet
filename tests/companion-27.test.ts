import { describe, expect, it } from "vitest";
import {
  applyCommand,
  localWorkspace,
  normalizeWorkspace,
  materializeSeries,
  repetitionSchema,
  importPingoData,
  pingoImportInput,
  advancePetCare,
  type Workspace,
  type Command,
} from "../packages/core/src/index";
const now = "2026-10-29T12:00:00Z";
function run(w: Workspace, c: Command, op = crypto.randomUUID()) {
  return applyCommand(w, c, op, now);
}
function create(repeat = false) {
  const w = localWorkspace("America/Sao_Paulo");
  w.petCare!.updatedAt = now;
  return run(
    w,
    {
      type: "task.upsert",
      expectedRevision: 0,
      ...(repeat
        ? { repetition: repetitionSchema.parse({ kind: "daily" }) }
        : {}),
      task: {
        id: "one",
        boardId: w.boards[0].id,
        columnId: w.boards[0].columns[0].id,
        title: "Piscina",
        notes: "",
        dueDate: "2026-10-29",
        scheduledStart: "2026-10-29T17:00:00Z",
        scheduledEnd: "2026-10-29T18:00:00Z",
        priority: "normal",
      },
    },
    "routine",
  );
}
function complete(w: Workspace, id = w.tasks[0].id) {
  return run(w, {
    type: "task.move",
    id,
    expectedRevision: w.tasks.find((t) => t.id === id)!.revision,
    columnId: w.boards[0].columns.find((c) => c.kind === "done")!.id,
    beforeId: null,
  });
}
describe("companhia e exclusão de rotinas 2.7", () => {
  it("premia uma vez, mesmo reabrindo, e oferece comida sem saldo negativo", () => {
    let w = complete(create());
    expect(w.companion!.food).toBe(3);
    expect(w.companion!.rewarded).toEqual(["one"]);
    w = run(w, {
      type: "task.move",
      id: "one",
      expectedRevision: w.tasks[0].revision,
      columnId: w.boards[0].columns[0].id,
      beforeId: null,
    });
    w = complete(w);
    expect(w.companion!.food).toBe(3);
    w = run(w, { type: "pet.care", action: "feed" }, "meal");
    w = run(w, { type: "pet.care", action: "feed" }, "meal");
    expect(w.companion!.food).toBe(2);
    w = run(w, { type: "pet.care", action: "feed" });
    w = run(w, { type: "pet.care", action: "feed" });
    expect(() => run(w, { type: "pet.care", action: "feed" })).toThrow(
      "comidinha",
    );
  });
  it("aceita conclusão pela notificação e bloqueia item ainda não conquistado", () => {
    let w = create();
    expect(() =>
      run(w, { type: "pet.equip", item: "bow", enabled: true }),
    ).toThrow("Continue");
    const t = w.tasks[0];
    // Use the same schedule identity as native reminders.
    return import("../packages/core/src/planning").then(
      ({ taskScheduleKey }) => {
        w = run(w, {
          type: "task.checkIn",
          id: t.id,
          expectedRevision: t.revision,
          action: "complete",
          phase: "end",
          scheduleKey: taskScheduleKey(t),
        });
        expect(w.companion!.rewarded).toHaveLength(1);
        w = run(w, { type: "pet.equip", item: "bow", enabled: true });
        expect(w.companion!.accessory).toBe("bow");
      },
    );
  });
  it("migração restaura arquivadas, protege histórico e não pune ausência anterior", () => {
    const w = create();
    delete w.companion;
    w.tasks[0].archivedAt = now;
    w.tasks[0].completed = true;
    w.petCare!.mood = 0;
    normalizeWorkspace(w, now);
    expect(w.tasks[0].archivedAt).toBeNull();
    expect(w.petCare!.mood).toBe(80);
    expect(w.companion!.baseline).toEqual(["one"]);
    const next = run(w, {
      type: "task.metadata",
      id: "one",
      expectedRevision: w.tasks[0].revision,
      metadata: { archivedAt: now },
    });
    expect(next.tasks[0].archivedAt).toBeNull();
    expect(next.companion!.rewarded).toHaveLength(0);
  });
  it("apaga todas inclusive concluídas, eventos e projeções futuras, conservando prêmios", () => {
    let w = complete(create(true));
    const series = w.taskSeries![0];
    w = run(w, {
      type: "series.delete",
      targets: [{ id: series.id, expectedRevision: series.revision }],
      scope: "all",
      confirmed: true,
    });
    expect(w.tasks.every((t) => t.deleted)).toBe(true);
    expect(w.events.every((e) => e.deleted)).toBe(true);
    materializeSeries(w, "2027-12-31");
    expect(w.tasks.every((t) => t.deleted)).toBe(true);
    expect(w.companion!.rewarded).toHaveLength(1);
    expect(() => complete(w)).toThrow("excluída");
  });
  it("exclui só uma ocorrência sem recriar e preserva as demais", () => {
    let w = create(true);
    const t = w.tasks[0];
    w = run(w, {
      type: "task.delete",
      id: t.id,
      expectedRevision: t.revision,
      confirmed: true,
    });
    materializeSeries(w, "2026-11-15");
    expect(w.tasks.filter((x) => x.id === t.id)).toHaveLength(1);
    expect(w.tasks[0].deleted).toBe(true);
    expect(w.tasks.filter((x) => !x.deleted).length).toBeGreaterThan(3);
  });
  it("exclusão a partir da data preserva passado e remove futuro concluído", () => {
    let w = create(true);
    w = complete(w, w.tasks[2].id);
    const series = w.taskSeries![0];
    w = run(w, {
      type: "series.delete",
      targets: [{ id: series.id, expectedRevision: series.revision }],
      scope: "future",
      date: "2026-10-30",
      confirmed: true,
    });
    expect(w.tasks.filter((t) => !t.deleted).map((t) => t.dueDate)).toEqual([
      "2026-10-29",
    ]);
  });
  it("edição de futuro mantém identidade e exclusão exige revisão de todos os segmentos", () => {
    let w = create(true);
    const t = w.tasks[1],
      old = w.taskSeries![0];
    w = run(
      w,
      {
        type: "task.upsert",
        task: t,
        expectedRevision: t.revision,
        scope: "future",
        expectedSeriesRevision: old.revision,
        repetition: repetitionSchema.parse({ kind: "weekly", weekdays: [1] }),
      },
      "segment",
    );
    expect(w.taskSeries![1].routineId).toBe(old.id);
    expect(() =>
      run(w, {
        type: "series.delete",
        targets: [{ id: old.id, expectedRevision: w.taskSeries![0].revision }],
        scope: "all",
        confirmed: true,
      }),
    ).toThrow("mudou");
    w = run(w, {
      type: "series.delete",
      targets: w.taskSeries!.map((s) => ({
        id: s.id,
        expectedRevision: s.revision,
      })),
      scope: "all",
      confirmed: true,
    });
    expect(w.tasks.every((t) => t.deleted)).toBe(true);
  });
  it("importar o mesmo backup não soma comida nem ressuscita rotina excluída", () => {
    const source = complete(create(true));
    const backup = pingoImportInput().parse(source);
    let target = localWorkspace();
    importPingoData(target, backup);
    const food = target.companion!.food;
    importPingoData(target, backup);
    expect(target.companion!.food).toBe(food);
    target = run(target, {
      type: "series.delete",
      targets: target.taskSeries!.map((s) => ({
        id: s.id,
        expectedRevision: s.revision,
      })),
      scope: "all",
      confirmed: true,
    });
    importPingoData(target, backup);
    materializeSeries(target, "2027-01-01");
    expect(target.tasks.every((t) => t.deleted)).toBe(true);
  });
  it("tempo reduz cuidados, carinho não repõe indicadores e descanso preserva comida", () => {
    let w = create();
    const care = advancePetCare(
      w.petCare!,
      w.preferences,
      new Date("2026-11-03T12:00:00Z"),
    );
    expect(care.satiety).toBe(0);
    w.petCare = care;
    const before = care.mood;
    w = applyCommand(
      w,
      { type: "pet.care", action: "pet" },
      "pet",
      "2026-11-03T12:00:00Z",
    );
    expect(w.petCare!.mood).toBe(before);
    expect(w.companion!.food).toBe(2);
  });
  it("editar a regra de uma ocorrência concluída não rende outra recompensa", () => {
    let w = complete(create(true));
    const t = w.tasks[0],
      s = w.taskSeries![0];
    w = run(
      w,
      {
        type: "task.upsert",
        task: t,
        expectedRevision: t.revision,
        scope: "future",
        expectedSeriesRevision: s.revision,
        repetition: s.rule,
      },
      "change",
    );
    expect(w.companion!.rewarded).toHaveLength(1);
  });
});

it("consome recibo Android offline uma vez sem nova operação de conclusão", () => {
  let w = create();
  w.tasks[0].completed = true;
  w.pendingPetRewards = [{ id: w.tasks[0].id, at: now }];
  normalizeWorkspace(w, now);
  expect(w.companion!.food).toBe(3);
  expect(w.pendingPetRewards).toBeUndefined();
  w.pendingPetRewards = [{ id: w.tasks[0].id, at: now }];
  normalizeWorkspace(w, now);
  expect(w.companion!.food).toBe(3);
});
