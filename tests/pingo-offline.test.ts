import { afterEach, expect, it, vi } from "vitest";
import {
  localWorkspace,
  applyCommand,
  preparePingoWorkspace,
  pingoImportInput,
  taskAlarms,
  offlineSummaries,
  type Workspace,
} from "../packages/core/src/index";
import { Api, PingoClient, type Storage } from "../packages/ui/src/client";
import {
  packWorkspace,
  unpackWorkspace,
} from "../apps/web/src/server/workspace-codec";

function create(w: Workspace, title = "Dentista") {
  const b = w.boards[0];
  return applyCommand(
    w,
    {
      type: "task.upsert",
      expectedRevision: 0,
      task: {
        id: "local-task",
        title,
        boardId: b.id,
        columnId: b.columns[0].id,
        notes: "",
        priority: "normal",
        dueDate: "2026-10-27",
        scheduledStart: "2026-10-27T18:00:00Z",
        scheduledEnd: "2026-10-27T18:30:00Z",
      },
    },
    crypto.randomUUID(),
  );
}
function disk(): Storage {
  const values = new Map<string, string>();
  return {
    get: async (k) => values.get(k) ?? null,
    set: async (k, v) => {
      values.set(k, v);
    },
    clear: async () => {
      values.clear();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
it("cria quadro e agenda em instalação sem conta nem Google", () => {
  const w = localWorkspace();
  expect(w.boards[0].columns.map((c) => c.kind)).toEqual([
    "todo",
    "active",
    "waiting",
    "done",
  ]);
  expect(w.calendars).toContainEqual({
    id: "pingo-personal",
    title: "Minha agenda",
    readOnly: false,
  });
  expect(w.connection.connected).toBe(false);
});
it("tarefa e horário local geram lembretes sem trabalho externo", () => {
  const w = create(localWorkspace());
  expect(w.events).toHaveLength(1);
  expect(w.events[0].taskId).toBe(w.tasks[0].id);
  expect(w.outbox).toHaveLength(0);
  expect(
    taskAlarms(w, "local:personal", Date.parse("2026-10-27T15:00:00Z")).map(
      (a) => a.phase,
    ),
  ).toEqual(expect.arrayContaining(["before", "start", "end", "repeat"]));
});
it("reinicia o perfil local sem rede nem operações aguardando servidor", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const store = disk(),
    first = new PingoClient(new Api(), store, false, true);
  await first.init();
  first.workspace = create(first.workspace);
  await first.command({
    type: "task.move",
    id: "local-task",
    columnId: first.workspace.boards[0].columns[1].id,
    beforeId: null,
    expectedRevision: 1,
  });
  const second = new PingoClient(new Api(), store, false, true);
  await second.init();
  expect(second.workspace.tasks[0].columnId).toBe("pingo-personal:active");
  expect(second.pending).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
it("desconectar os dados preserva a cópia original e não pede exclusões no Google", () => {
  const source = create(localWorkspace());
  source.storageMode = undefined;
  source.tasks[0].googleId = "old-google-task";
  source.boards[0].googleId = "old-list";
  source.mail = [
    {
      id: "mail",
      from: "Alguém",
      subject: "Privado",
      date: "2026-10-26T12:00Z",
    },
  ];
  const copy = preparePingoWorkspace(source);
  expect(copy.tasks[0].googleId).toBeUndefined();
  expect(copy.mail).toEqual([]);
  expect(source.tasks[0].googleId).toBe("old-google-task");
  expect(source.mail).toHaveLength(1);
});
it("importação repetida não duplica tarefas ou seus horários e não sobrescreve uma edição", () => {
  const payload = pingoImportInput().parse(create(localWorkspace()));
  let w = applyCommand(
    localWorkspace(),
    { type: "workspace.import", data: payload, confirmed: true },
    crypto.randomUUID(),
  );
  w.tasks[0].title = "Editado depois da importação";
  w = applyCommand(
    w,
    { type: "workspace.import", data: payload, confirmed: true },
    crypto.randomUUID(),
  );
  expect(w.tasks).toHaveLength(1);
  expect(w.events).toHaveLength(1);
  expect(w.tasks[0].title).toBe("Editado depois da importação");
});
it("importação valida intervalos e não aceita comandos extras", () => {
  const w = create(localWorkspace());
  w.events[0].end = w.events[0].start;
  expect(pingoImportInput().safeParse(w).success).toBe(false);
});
it("compacta dados sem perder campos e lê o formato antigo", () => {
  const w = create(localWorkspace());
  w.tasks[0].notes = "Anotações de teste. ".repeat(300);
  const packed = packWorkspace(w);
  expect(JSON.stringify(packed).length).toBeLessThan(
    JSON.stringify(w).length / 2,
  );
  expect(unpackWorkspace(packed)).toEqual(w);
  expect(unpackWorkspace(w)).toEqual(w);
});
it("consulta sem mudanças preserva a cópia local e envia a conta esperada", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const fetcher = vi.fn(async (_url, init) => {
    expect(init.headers["X-Pingo-Account"]).toBe("alice");
    return Response.json({ unchanged: true });
  });
  vi.stubGlobal("fetch", fetcher);
  const c = new PingoClient(new Api("", undefined, "alice"), disk());
  c.workspace = create(localWorkspace());
  c.serverRevision = c.workspace.revision;
  await c.refresh();
  expect(c.workspace.tasks[0].title).toBe("Dentista");
  expect(fetcher.mock.calls[0][0]).toContain("revision=");
});

it("resumos locais cobrem sete dias no horário da conta sem IA", () => {
  const w = localWorkspace("America/Sao_Paulo");
  w.preferences.summaryTime = "08:00";
  const reminders = offlineSummaries(
    w,
    "local:personal",
    Date.parse("2026-10-26T12:00:00Z"),
  );
  expect(reminders).toHaveLength(7);
  expect(reminders[0].dueAt).toBe(Date.parse("2026-10-27T11:00:00Z"));
  expect(
    reminders.every((r) => r.summary && r.body.includes("tarefa(s)")),
  ).toBe(true);
});

it("primeira leitura remota não confunde uma revisão local zero com dados já recebidos", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const remote = create(localWorkspace());
  remote.revision = 0;
  const send = vi.fn(async (url) => {
    expect(String(url)).toBe("/api/v1/workspace");
    return Response.json({ workspace: remote });
  });
  vi.stubGlobal("fetch", send);
  const client = new PingoClient(new Api(), disk());
  await client.refresh();
  expect(client.workspace.tasks[0].title).toBe("Dentista");
});
it("cliente desativado preserva a fila e não envia novas operações após troca de conta", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  const client = new PingoClient(new Api("", "old-token", "alice"), disk());
  client.workspace = create(localWorkspace());
  client.dispose();
  await client.flush();
  await client.refresh();
  await expect(
    client.command({ type: "pet.care", action: "pet" }),
  ).rejects.toThrow("conta mudou");
  expect(send).not.toHaveBeenCalled();
});

it("importa aparência, cuidados e histórico sem reativar propostas antigas ou sobrescrever ajustes posteriores", () => {
  const source = create(localWorkspace());
  source.preferences.name = "Gotinha";
  source.conversations = [
    {
      id: "conversation",
      title: "Conversa anterior",
      archived: false,
      updatedAt: "2026-10-26T12:00:00Z",
      messages: [
        {
          role: "assistant",
          text: "Sugestão antiga",
          suggestions: [
            {
              approvalId: "old-account",
              command: { type: "pet.care", action: "pet" },
            },
          ],
        },
      ],
    },
  ];
  const payload = pingoImportInput().parse(source);
  let target = applyCommand(
    localWorkspace(),
    { type: "workspace.import", data: payload, confirmed: true },
    crypto.randomUUID(),
  );
  expect(target.preferences.name).toBe("Gotinha");
  expect(target.conversations?.[0].messages[0].suggestions).toBeUndefined();
  target.preferences.name = "Novo nome";
  target = applyCommand(
    target,
    { type: "workspace.import", data: payload, confirmed: true },
    crypto.randomUUID(),
  );
  expect(target.preferences.name).toBe("Novo nome");
  expect(target.conversations).toHaveLength(1);
});

it("preserva datas especiais como lembretes somente leitura, sem bloquear a disponibilidade", () => {
  const source = localWorkspace();
  source.calendars.push({
    id: "old-holiday",
    title: "Datas especiais",
    holiday: true,
    readOnly: true,
  });
  source.events.push({
    id: "holiday",
    title: "Natal",
    allDay: true,
    start: "2026-12-25",
    end: "2026-12-26",
    calendarId: "old-holiday",
    revision: 1,
    syncState: "synced",
  });
  const target = applyCommand(
    localWorkspace(),
    {
      type: "workspace.import",
      data: pingoImportInput().parse(source),
      confirmed: true,
    },
    crypto.randomUUID(),
  );
  const event = target.events.find((e) => e.id === "holiday")!;
  expect(event.transparent).toBe(true);
  expect(target.calendars.find((c) => c.id === event.calendarId)).toMatchObject(
    { holiday: true, readOnly: true },
  );
});
