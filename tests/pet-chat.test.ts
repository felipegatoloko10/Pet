import { afterEach, expect, test, vi } from "vitest";
import { Api } from "../packages/ui/src/client";
import { emptyWorkspace } from "@pingo/core";
import { PetChat, PendingPetMessageError } from "../apps/desktop/src/pet-chat";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const users = new Map<string, Map<string, string>>();
  return {
    users,
    get: async (id: string) => {
      const values = users.get(id) ?? new Map<string, string>();
      users.set(id, values);
      return {
        get: async (key: string) => values.get(key) ?? null,
        set: async (key: string, value: string) => {
          values.set(key, value);
        },
        clear: async () => {
          values.clear();
        },
      };
    },
  };
}
test("avatar reuses the message ID after an uncertain response without touching the panel queue", async () => {
  const api = new Api("https://pingo.invalid", "alice"),
    data = storage(),
    calls: any[] = [];
  const committed = new Set<string>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("workspace"))
        return Response.json({
          user: { id: "alice" },
          workspace: emptyWorkspace(),
        });
      const message = JSON.parse(init.body as string);
      calls.push(message);
      committed.add(message.messageId);
      if (calls.length === 1)
        throw new TypeError("Connection lost after the server committed");
      return Response.json({ text: "Salvei o compromisso no Pingo." });
    }),
  );
  const chat = new PetChat(api, data.get);
  await expect(chat.send("Marque meu compromisso")).rejects.toThrow();
  await expect(chat.send("Marque meu compromisso")).resolves.toMatchObject({
    text: "Salvei o compromisso no Pingo.",
  });
  expect(calls).toHaveLength(2);
  expect(committed.size).toBe(1);
  expect(calls[0]).toEqual(calls[1]);
  expect(data.users.get("alice")!.has("snapshot")).toBe(false);
  expect(data.users.get("alice")!.get("pet:pending-message")).toBe("");
});
test("a different message cannot silently replace an uncertain request", async () => {
  const api = new Api("https://pingo.invalid", "alice"),
    data = storage();
  let posts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("workspace"))
        return Response.json({
          user: { id: "alice" },
          workspace: emptyWorkspace(),
        });
      posts++;
      throw new TypeError("Offline");
    }),
  );
  const chat = new PetChat(api, data.get);
  await expect(chat.send("Primeiro pedido")).rejects.toThrow();
  await expect(chat.send("Outro pedido")).rejects.toBeInstanceOf(
    PendingPetMessageError,
  );
  expect(posts).toBe(1);
});
test("changing accounts during identity lookup prevents sending with the new identity", async () => {
  const api = new Api("https://pingo.invalid", "alice"),
    data = storage();
  const network = vi.fn(async () => {
    api.token = "bob";
    return Response.json({
      user: { id: "alice" },
      workspace: emptyWorkspace(),
    });
  });
  vi.stubGlobal("fetch", network);
  await expect(new PetChat(api, data.get).send("Meu pedido")).rejects.toThrow(
    "sessão mudou",
  );
  expect(network).toHaveBeenCalledTimes(1);
  expect(data.users.size).toBe(0);
});
test("avatar leaves confirmation proposals pending and does not expose another account's conversation", async () => {
  const api = new Api("https://pingo.invalid", "alice"),
    data = storage(),
    paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      paths.push(url);
      if (url.endsWith("workspace"))
        return Response.json({
          user: { id: "alice" },
          workspace: emptyWorkspace(),
        });
      return Response.json({
        text: "Revise antes de excluir.",
        suggestions: [
          {
            approvalId: crypto.randomUUID(),
            command: {
              type: "task.delete",
              id: "task-one",
              expectedRevision: 1,
            },
          },
        ],
      });
    }),
  );
  const chat = new PetChat(api, data.get);
  const reply = await chat.send("Exclua esta tarefa");
  expect(reply.suggestions).toHaveLength(1);
  expect(paths.some((path) => path.endsWith("approvals"))).toBe(false);
  expect(chat.currentConversation()).toBeTruthy();
  api.token = "bob";
  expect(chat.currentConversation()).toBeUndefined();
});
