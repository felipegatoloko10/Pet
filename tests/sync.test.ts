import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  emptyWorkspace,
  newBoard,
  applyCommand,
  type Workspace,
} from "../packages/core/src/index";
const memory = vi.hoisted(() => ({ workspace: null as Workspace | null }));
vi.mock("../apps/web/src/server/workspace", () => ({
  readWorkspace: async () => structuredClone(memory.workspace),
  mutateWorkspace: async (_user: string, fn: (w: Workspace) => unknown) =>
    fn(memory.workspace!),
  getCredential: async () => null,
  saveCredential: async () => {},
}));
vi.mock("../apps/web/src/server/google", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  googleToken: async () => "fake",
}));
import { syncGoogle, calendarRange } from "../apps/web/src/server/sync";
beforeEach(() => {
  const w = emptyWorkspace();
  w.boards = [newBoard("b", "Lista", "list")];
  w.connection = {
    connected: true,
    scopes: ["https://www.googleapis.com/auth/tasks"],
  };
  memory.workspace = applyCommand(
    w,
    {
      type: "task.upsert",
      task: {
        id: "local",
        boardId: "b",
        columnId: "b:todo",
        title: "Remédio",
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
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
});
afterEach(() => vi.unstubAllGlobals());
it("o alias primary e o ID real da agenda não duplicam o evento vinculado", async () => {
  let w = memory.workspace!;
  w.connection.scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ];
  w = applyCommand(
    w,
    {
      type: "task.upsert",
      task: { ...w.tasks[0], dueDate: "2026-10-23" },
      expectedRevision: 1,
    },
    crypto.randomUUID(),
  );
  const e = w.events[0];
  e.googleId = "same-google-event";
  e.googleEtag = "tag";
  e.syncState = "synced";
  w.events.push({ ...e, calendarId: "real-primary", revision: e.revision + 1 });
  w.outbox = [];
  memory.workspace = w;
  const transport = vi.fn(async (input: string, init?: RequestInit) => {
    if (input.includes("calendarList"))
      return Response.json({
        items: [
          {
            id: "real-primary",
            summary: "Principal",
            accessRole: "owner",
            primary: true,
          },
        ],
      });
    if (!input.includes("/calendars/real-primary/"))
      return Response.json({ items: [] });
    return Response.json({
      items: [
        {
          id: e.googleId,
          etag: "tag",
          summary: e.title,
          start: { date: e.start },
          end: { date: e.end },
          extendedProperties: {
            private: { pingoId: e.id, pingoTaskId: "local" },
          },
        },
      ],
    });
  });
  vi.stubGlobal("fetch", transport);
  await syncGoogle("alice");
  expect(memory.workspace!.preferences.defaultCalendarId).toBe("real-primary");
  expect(memory.workspace!.events).toHaveLength(1);
  expect(memory.workspace!.events[0].calendarId).toBe("real-primary");
  expect(transport.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it("tarefa com data confirma Tasks e Agenda antes de avisar e não duplica na repetição", async () => {
  let w = memory.workspace!;
  w.preferences.defaultBoardId = "b";
  w.connection.scopes.push("https://www.googleapis.com/auth/calendar.events");
  w = applyCommand(
    w,
    {
      type: "task.upsert",
      task: { ...w.tasks[0], dueDate: "2026-10-23" },
      expectedRevision: w.tasks[0].revision,
    },
    crypto.randomUUID(),
  );
  memory.workspace = w;
  let event: Record<string, unknown> | undefined,
    task: Record<string, unknown> | undefined,
    taskCreates = 0,
    eventCreates = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input),
        method = init?.method ?? "GET";
      if (method === "POST" && url.hostname === "tasks.googleapis.com") {
        taskCreates++;
        expect(memory.workspace!.notices).toHaveLength(0);
        task = {
          ...JSON.parse(init!.body as string),
          id: "gt",
          etag: "task1",
          updated: "2026-10-23T12:00:00Z",
        };
        return Response.json(task);
      }
      if (method === "POST" && url.pathname.includes("/calendars/")) {
        eventCreates++;
        expect(memory.workspace!.notices).toHaveLength(0);
        event = { ...JSON.parse(init!.body as string), etag: "event1" };
        return Response.json(event);
      }
      if (url.pathname.endsWith("/lists"))
        return Response.json({ items: [{ id: "list", title: "Lista" }] });
      if (url.hostname === "tasks.googleapis.com")
        return Response.json({ items: task ? [task] : [] });
      return Response.json({
        items: url.pathname.includes("/primary/") && event ? [event] : [],
      });
    }),
  );
  await syncGoogle("alice");
  expect(memory.workspace!.events).toHaveLength(1);
  expect(
    memory.workspace!.notices.filter((n) =>
      n.body.includes("Já confirmei e sincronizei"),
    ),
  ).toHaveLength(1);
  await syncGoogle("alice");
  expect(taskCreates).toBe(1);
  expect(eventCreates).toBe(1);
});
it("falha na Agenda preserva a confirmação parcial sem anunciar sincronização completa", async () => {
  let w = memory.workspace!;
  w.connection.scopes.push("https://www.googleapis.com/auth/calendar.events");
  w = applyCommand(
    w,
    {
      type: "task.upsert",
      task: { ...w.tasks[0], dueDate: "2026-10-23" },
      expectedRevision: w.tasks[0].revision,
    },
    crypto.randomUUID(),
  );
  memory.workspace = w;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST" && input.includes("tasks.googleapis.com"))
        return Response.json({
          id: "gt",
          etag: "t1",
          updated: "2026-10-23T12:00:00Z",
        });
      if (method === "POST") return new Response("", { status: 500 });
      return Response.json({ items: [] });
    }),
  );
  await syncGoogle("alice");
  expect(memory.workspace!.tasks[0].syncState).toBe("synced");
  expect(memory.workspace!.events[0].syncState).not.toBe("synced");
  expect(
    memory.workspace!.notices.some((n) =>
      n.body.includes("Já confirmei e sincronizei"),
    ),
  ).toBe(false);
  expect(
    memory.workspace!.outbox.some(
      (j) => j.kind === "event" && j.state === "uncertain",
    ),
  ).toBe(true);
});
it("Gmail pagina somente cabeçalhos do dia e atualiza lidos sem gerar avisos", async () => {
  memory.workspace!.outbox = [];
  memory.workspace!.connection.scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
  ];
  let read = false;
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      requests.push(input);
      const u = new URL(input);
      if (u.searchParams.get("format") === "metadata") {
        const id = u.pathname.split("/").at(-1);
        return Response.json({
          internalDate: String(
            id === "old" ? Date.now() - 3 * 86400000 : Date.now(),
          ),
          labelIds: read ? ["INBOX"] : ["INBOX", "UNREAD"],
          payload: {
            headers: [
              { name: "Subject", value: id },
              { name: "From", value: "Pessoa" },
            ],
          },
        });
      }
      return Response.json(
        u.searchParams.has("pageToken")
          ? { messages: [{ id: "second" }, { id: "old" }] }
          : { messages: [{ id: "first" }], nextPageToken: "page2" },
      );
    }),
  );
  await syncGoogle("alice");
  expect(memory.workspace!.mail).toHaveLength(2);
  expect(memory.workspace!.mail.every((m) => m.isRead === false)).toBe(true);
  expect(memory.workspace!.notices).toHaveLength(0);
  expect(requests.some((r) => r.includes("pageToken=page2"))).toBe(true);
  expect(
    requests.some(
      (r) => r.includes("format=full") || r.includes("labelIds=UNREAD"),
    ),
  ).toBe(false);
  read = true;
  await syncGoogle("alice");
  expect(memory.workspace!.mail.every((m) => m.isRead)).toBe(true);
});
it("consulta anual expande recorrências fora da janela inicial", async () => {
  memory.workspace!.outbox = [];
  memory.workspace!.calendars = [{ id: "primary", title: "Pessoal" }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        items: [
          {
            id: "future",
            recurringEventId: "series",
            summary: "Consulta futura",
            start: { date: "2027-12-31" },
            end: { date: "2028-01-01" },
            etag: "v1",
          },
        ],
      }),
    ),
  );
  const events = await calendarRange(
    "alice",
    "2027-01-01T03:00:00Z",
    "2028-01-01T03:00:00Z",
  );
  expect(events.some((e) => e.googleId === "future")).toBe(true);
});
it("falha de Tasks não bloqueia os cabeçalhos Gmail", async () => {
  memory.workspace!.outbox = [];
  memory.workspace!.connection.scopes.push(
    "https://www.googleapis.com/auth/gmail.readonly",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("tasks.googleapis.com"))
        return new Response(null, { status: 403 });
      if (input.includes("format=metadata"))
        return Response.json({
          internalDate: String(Date.now()),
          labelIds: ["INBOX", "UNREAD"],
          payload: {
            headers: [
              { name: "From", value: "Teste" },
              { name: "Subject", value: "Assunto" },
            ],
          },
        });
      return Response.json({ messages: [{ id: "message" }] });
    }),
  );
  await syncGoogle("alice");
  expect(memory.workspace!.mail[0].subject).toBe("Assunto");
  expect(memory.workspace!.connection.error).toContain("Tasks");
});
it("Calendar 410 refaz sincronização e preserva datas de dia inteiro", async () => {
  memory.workspace!.outbox = [];
  memory.workspace!.connection.scopes = [
    "https://www.googleapis.com/auth/calendar.events",
  ];
  memory.workspace!.cursor.calendar = { primary: "expired" };
  let resets = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input.includes("syncToken=expired")) {
        resets++;
        return new Response(null, { status: 410 });
      }
      if (input.includes("singleEvents=true"))
        return Response.json({ items: [] });
      return Response.json({
        items: [
          {
            id: "all-day",
            summary: "Viagem",
            start: { date: "2026-10-24" },
            end: { date: "2026-10-26" },
          },
        ],
        nextSyncToken: "fresh",
      });
    }),
  );
  await syncGoogle("alice");
  expect(resets).toBe(1);
  expect(memory.workspace!.cursor.calendar?.primary).toBe("fresh");
  expect(memory.workspace!.events[0]).toMatchObject({
    allDay: true,
    start: "2026-10-24",
    end: "2026-10-26",
  });
});
it("timeout depois de criar é reconciliado, sem segundo POST", async () => {
  let remote = false;
  let creates = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      if (init.method === "POST") {
        creates++;
        remote = true;
        throw new TypeError("network lost after commit");
      }
      if (input.includes("/users/@me/lists"))
        return Response.json({ items: [{ id: "list", title: "Lista" }] });
      return Response.json({
        items: remote
          ? [
              {
                id: "remote",
                title: "Remédio",
                notes: "[Pingo:local]",
                status: "needsAction",
                updated: "2026-10-22T12:00:00Z",
                etag: "remote-tag",
              },
            ]
          : [],
      });
    }),
  );
  await syncGoogle("alice");
  expect(creates).toBe(1);
  expect(memory.workspace!.outbox[0].state).toBe("uncertain");
  memory.workspace!.outbox[0].sentAt = new Date(
    Date.now() - 120000,
  ).toISOString();
  memory.workspace!.outbox[0].nextAttemptAt = new Date(
    Date.now() - 1,
  ).toISOString();
  await syncGoogle("alice");
  expect(creates).toBe(1);
  expect(memory.workspace!.outbox).toHaveLength(0);
  expect(memory.workspace!.tasks[0]).toMatchObject({
    googleId: "remote",
    syncState: "synced",
  });
});
it("nenhuma correspondência para criação incerta pede revisão", async () => {
  memory.workspace!.outbox[0].state = "uncertain";
  memory.workspace!.outbox[0].sentAt = new Date(
    Date.now() - 120000,
  ).toISOString();
  const transport = vi.fn(async (input: string, init: RequestInit = {}) =>
    Response.json({
      items: input.includes("/users/@me/lists")
        ? [{ id: "list", title: "Lista" }]
        : [],
    }),
  );
  vi.stubGlobal("fetch", transport);
  await syncGoogle("alice");
  expect(memory.workspace!.tasks[0].syncState).toBe("conflict");
  expect(
    transport.mock.calls.every((c) => c[1]?.method !== "POST"),
  ).toBeTruthy();
});
it("não declara sucesso sem confirmação do Google", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) =>
      init.method === "POST"
        ? new Response(null, { status: 403 })
        : Response.json({
            items: input.includes("/users/@me/lists")
              ? [{ id: "list", title: "Lista" }]
              : [],
          }),
    ),
  );
  await syncGoogle("alice");
  expect(memory.workspace!.tasks[0].syncState).toBe("error");
  expect(memory.workspace!.notices).toHaveLength(0);
});
