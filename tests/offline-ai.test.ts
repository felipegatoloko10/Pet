import { it, expect, vi } from "vitest";
import { PingoClient, Api, type Storage } from "../packages/ui/src/client";
import { newBoard, emptyWorkspace } from "../packages/core/src/index";
import {
  makeModel,
  scopedTools,
  explicitMutation,
} from "../apps/web/src/server/ai";
function storage(): Storage {
  const data = new Map<string, string>();
  return {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    clear: async () => {
      data.clear();
    },
  };
}
it("a fila sobrevive ao reinício offline e repete o mesmo operationId", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const disk = storage();
  const first = new PingoClient(new Api(), disk);
  first.workspace.boards = [newBoard("b", "Lista")];
  await first.command({
    type: "task.upsert",
    task: {
      id: "t",
      boardId: "b",
      columnId: "b:todo",
      title: "Offline",
      notes: "",
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      priority: "normal",
    },
    expectedRevision: 0,
  });
  const id = first.pending[0].operation.operationId;
  const second = new PingoClient(new Api(), disk);
  await second.init();
  expect(second.workspace.tasks[0].title).toBe("Offline");
  expect(second.pending[0].operation.operationId).toBe(id);
  vi.unstubAllGlobals();
});
it.each(["openai", "google", "anthropic"] as const)(
  "mesmas ferramentas para %s",
  (provider) => {
    const model = makeModel(provider, "test-model", "fake-key");
    expect(model.modelId).toBe("test-model");
    const tools = scopedTools(
      "alice",
      "adicione uma tarefa",
      false,
      async () => ({}),
      async () => emptyWorkspace(),
    );
    expect(Object.keys(tools)).toEqual([
      "consultarDia",
      "salvarTarefa",
      "salvarCompromisso",
      "sugerirExclusao",
    ]);
  },
);
it("sugestões não são interpretadas como ordem direta", () => {
  expect(explicitMutation("Sugira como criar tarefas para mim")).toBe(false);
  expect(explicitMutation("Adicione comprar remédio para amanhã")).toBe(true);
});
it.each([true, false])(
  "corpo de e-mail limita escrita: %s",
  async (bodyIncluded) => {
    const execute = vi.fn(),
      suggest = vi.fn().mockResolvedValue({ approvalId: "pending" });
    const tools = scopedTools(
      "alice",
      "adicione uma tarefa",
      bodyIncluded,
      execute,
      async () => emptyWorkspace(),
      suggest,
    );
    await tools.salvarTarefa.execute!(
      {
        task: {
          id: "t",
          boardId: "b",
          columnId: "todo",
          title: "T",
          notes: "",
          dueDate: null,
          scheduledStart: null,
          scheduledEnd: null,
          priority: "normal",
        },
        expectedRevision: 0,
      },
      { toolCallId: "test", messages: [],context:{} },
    );
    expect(execute).toHaveBeenCalledTimes(bodyIncluded ? 0 : 1);
    expect(suggest).toHaveBeenCalledTimes(bodyIncluded ? 1 : 0);
  },
);
