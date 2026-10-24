import { afterEach, expect, it, vi } from "vitest";
import {
  applyCommand,
  emptyWorkspace,
  newBoard,
  normalizeWorkspace,
  sanitizeWorkspace,
  reconcileTaskCalendars,
  taskScheduleKey,
  type Workspace,
} from "../packages/core/src/index";
import { Api, PingoClient, type Storage } from "../packages/ui/src/client";

function task(id = "t") {
  return {
    id,
    boardId: "b",
    columnId: "b:todo",
    title: id,
    notes: "",
    dueDate: "2026-10-23",
    scheduledStart: "2026-10-23T21:00:00.000Z",
    scheduledEnd: "2026-10-23T21:30:00.000Z",
    priority: "normal" as const,
  };
}
function seed() {
  const w = emptyWorkspace();
  w.boards = [newBoard("b", "Rotina")];
  w.preferences.defaultBoardId = "b";
  return applyCommand(
    w,
    { type: "task.upsert", task: task(), expectedRevision: 0 },
    crypto.randomUUID(),
  );
}
afterEach(() => vi.unstubAllGlobals());
it("normaliza cópias Android antigas sem outbox e permite editar novamente", () => {
  const w = seed();
  const { outbox, cursor, ...safe } = w;
  const restored = normalizeWorkspace(safe as Workspace);
  const changed = applyCommand(
    restored,
    {
      type: "task.upsert",
      task: { ...task(), title: "Comer pão" },
      expectedRevision: 1,
    },
    crypto.randomUUID(),
  );
  expect(changed.tasks[0].title).toBe("Comer pão");
  expect(sanitizeWorkspace(w)).toMatchObject({ outbox: [], cursor: {} });
});
it("horários equivalentes UTC e Brasília não recriam a reserva", () => {
  const w = seed();
  w.outbox = [];
  w.events[0].start = "2026-10-23T18:00:00-03:00";
  w.events[0].end = "2026-10-23T18:30:00-03:00";
  const enqueue = vi.fn();
  reconcileTaskCalendars(w, enqueue);
  expect(enqueue).not.toHaveBeenCalled();
});
it("concluir pela notificação preserva edições recentes quando o horário é o mesmo", () => {
  const w = seed();
  w.tasks[0].revision = 4;
  w.tasks[0].title = "Título atualizado";
  const done = applyCommand(
    w,
    {
      type: "task.checkIn",
      id: "t",
      expectedRevision: 1,
      action: "complete",
      phase: "start",
      scheduleKey: "2026-10-23T18:00:00-03:00|2026-10-23T18:30:00-03:00",
    },
    crypto.randomUUID(),
  );
  expect(done.tasks[0]).toMatchObject({
    completed: true,
    title: "Título atualizado",
    columnId: "b:done",
  });
  expect(taskScheduleKey(done.tasks[0])).toContain("21:00:00.000Z");
  expect(() =>
    applyCommand(
      w,
      {
        type: "task.checkIn",
        id: "t",
        expectedRevision: 1,
        action: "complete",
        phase: "end",
        scheduleKey: "horário antigo",
      },
      crypto.randomUUID(),
    ),
  ).toThrow("horário");
});
it.each([
  ["pending", "b:todo"],
  ["waiting", "b:waiting"],
  ["start", "b:active"],
] as const)("ação direta %s muda somente o status", (action, columnId) => {
  const w = seed(),
    key = taskScheduleKey(w.tasks[0]);
  const next = applyCommand(
    w,
    {
      type: "task.checkIn",
      id: "t",
      expectedRevision: 1,
      action,
      phase: "start",
      scheduleKey: key,
    },
    crypto.randomUUID(),
  );
  expect(next.tasks[0].columnId).toBe(columnId);
  expect(taskScheduleKey(next.tasks[0])).toBe(key);
});
it("salvar retorna após persistir, sem esperar a rede", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const memory = new Map<string, string>();
  let release!: (v: any) => void;
  const disk: Storage = {
    get: async (k) => memory.get(k) ?? null,
    set: async (k, v) => {
      memory.set(k, v);
    },
    clear: async () => memory.clear(),
    nativeFlush: () =>
      new Promise((r) => {
        release = r;
      }),
  };
  const client = new PingoClient(new Api(), disk);
  client.workspace = emptyWorkspace();
  client.workspace.boards = [newBoard("b", "Rotina")];
  await client.command({
    type: "task.upsert",
    task: task(),
    expectedRevision: 0,
  });
  expect(memory.has("snapshot")).toBe(true);
  expect(client.workspace.tasks[0].title).toBe("t");
  expect(client.pending).toHaveLength(1);
  let drained = false;
  const wait = client.flush().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  release({ workspace: sanitizeWorkspace(client.workspace), pending: [] });
  await wait;
  await vi.waitFor(() => expect(client.pending).toHaveLength(0));
});
it("resposta nativa atrasada não apaga uma segunda alteração local", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  let release!: (v: any) => void;
  let calls = 0;
  const memory = new Map<string, string>();
  const disk: Storage = {
    get: async (k) => memory.get(k) ?? null,
    set: async (k, v) => {
      memory.set(k, v);
    },
    clear: async () => memory.clear(),
    nativeFlush: async () => {
      calls++;
      if (calls === 1)
        return new Promise((r) => {
          release = r;
        });
      return { ...JSON.parse(memory.get("snapshot")!), pending: [] };
    },
  };
  const client = new PingoClient(new Api(), disk);
  client.workspace = emptyWorkspace();
  client.workspace.boards = [newBoard("b", "Rotina")];
  await client.command({
    type: "task.upsert",
    task: task("a"),
    expectedRevision: 0,
  });
  const prior = structuredClone(client.workspace);
  await client.command({
    type: "task.upsert",
    task: task("b"),
    expectedRevision: 0,
  });
  release({ workspace: prior, pending: [] });
  await vi.waitFor(() => expect(calls).toBe(2));
  await vi.waitFor(() => expect(client.pending).toHaveLength(0));
  expect(client.workspace.tasks.map((t) => t.id)).toEqual(["a", "b"]);
});
