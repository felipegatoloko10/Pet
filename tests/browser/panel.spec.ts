import { test, expect } from "@playwright/test";
import {
  emptyWorkspace,
  newBoard,
  applyCommand,
} from "../../packages/core/src/index";
test("demonstração permite editar, mover e persistir tarefas sem Google", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
  await expect(
    page.getByText("Demonstração local"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que você quer fazer?")
    .fill("Tarefa persistente do teste");
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Tarefa persistente do teste/ }),
  ).toBeVisible();

  await page
    .getByLabel("Mover Tarefa persistente do teste")
    .selectOption({ label: "Fazendo" });
  // Simulate restart after the app acknowledges that the local transaction committed.
  await expect(page.locator(".toast")).toHaveText(
    "Modificação salva na demonstração local.",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();

  await expect(
    page.getByLabel("Mover Tarefa persistente do teste"),
  ).toHaveValue("demo:active");
  await page.screenshot({
    path: ".verification/kanban-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("painel móvel e preferências do pet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
  await page.screenshot({
    path: ".verification/day-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Gotinha");
  await expect(page.getByLabel("Reduzir movimentos")).toHaveCount(0);
  await page.getByLabel("Ler balões em voz alta", { exact: true }).check();
  await page.getByRole("button", { name: "Salvar meu jeito" }).click();
  await expect(
    page.getByRole("button", { name: "Gotinha:", exact: false }).first(),
  ).toBeVisible();
});
test("API não entrega dados sem sessão", async ({ request }) => {
  const r = await request.get("/api/v1/workspace");
  expect(r.status()).toBe(401);
  const mutation = await request.post("/api/v1/operations", {
    data: { userId: "another" },
  });
  expect(mutation.status()).toBe(401);
});
test("aprovação da IA mostra ação compreensível e exige clique", async ({
  page,
}) => {
  let w = emptyWorkspace();
  w.revision = 1;
  w.boards = [newBoard("private-board-id", "Minha rotina")];
  let approved = false;
  const command = {
    type: "task.upsert" as const,
    task: {
      id: "private-task-id",
      boardId: "private-board-id",
      columnId: "private-board-id:todo",
      title: "Organizar os documentos",
      notes: "Separar por assunto",
      dueDate: "2030-01-20",
      scheduledStart: null,
      scheduledEnd: null,
      priority: "normal" as const,
    },
    expectedRevision: 0,
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {
      workspace: w,
      user: {
        id: "approval-fixture",
        name: "Teste",
        email: "test@example.invalid",
      },
    };
    if (path.endsWith("/health")) data = { configured: false };
    if (path.endsWith("/operations")) {
      const op = route.request().postDataJSON();
      w = applyCommand(w, op.command, op.operationId);
      data = { workspace: w };
    }
    if (path.endsWith("/chat")) {
      data = {
        text: "Podemos começar por esta tarefa.",
        suggestions: [
          { approvalId: "12345678-1234-4234-8234-123456789abc", command },
        ],
      };
      const input = route.request().postDataJSON();
      w.conversations!.find(
        (c) => c.id === input.conversationId,
      )!.messages.push({
        role: "assistant",
        text: "Podemos começar por esta tarefa.",
        suggestions: [
          { approvalId: "12345678-1234-4234-8234-123456789abc", command },
        ],
      });
    }
    if (path.endsWith("/approvals")) {
      approved = true;
      w = applyCommand(w, command, crypto.randomUUID());
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Conversa", exact: true }).click();
  await page
    .getByLabel("Mensagem para Pingo")
    .fill("Sugira como encaixar minhas tarefas");
  await page.getByRole("button", { name: "Enviar ↑", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Criar tarefa: Organizar os documentos",
    }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("private-board-id");
  await expect(page.locator("body")).not.toContainText("expectedRevision");
  expect(approved).toBe(false);
  await page.getByRole("button", { name: "Confirmar alteração" }).click();
  await expect.poll(() => approved).toBe(true);
});
test("fila offline e shell sobrevivem à recarga, depois sincronizam uma vez", async ({
  page,
  context,
}) => {
  let server = emptyWorkspace();
  server.revision = 1;
  server.boards = [newBoard("offline-board", "Lista offline")];
  server.preferences.defaultBoardId = "offline-board";
  const operations = new Set<string>();
  let online = true;
  await page.route("**/api/v1/**", async (route) => {
    if (!online) return route.abort("internetdisconnected");
    const path = new URL(route.request().url()).pathname;
    let response: unknown = {
      workspace: server,
      user: {
        id: "offline-fixture",
        name: "Teste",
        email: "fixture@example.invalid",
      },
    };
    if (path.endsWith("/health")) response = { configured: false };
    if (path.endsWith("/operations")) {
      const op = route.request().postDataJSON();
      if (!operations.has(op.operationId)) {
        server = applyCommand(server, op.command, op.operationId);
        operations.add(op.operationId);
      }
      response = { workspace: server };
    }
    await route.fulfill({ json: response });
  });
  await page.goto("/");
  await expect(page.getByText("Seu espaço pessoal")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByText("Seu espaço pessoal")).toBeVisible();
  online = false;
  await context.setOffline(true);
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page.getByLabel("O que você quer fazer?").fill("Criada sem internet");
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Criada sem internet/ }),
  ).toBeVisible();
  online = true;
  await context.setOffline(false);
  await expect.poll(() => operations.size).toBe(1);
  await expect(page.getByText("1 alteração(ões) pendente(s)")).toHaveCount(0);
});
