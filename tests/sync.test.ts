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
import { syncGoogle } from "../apps/web/src/server/sync";
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
