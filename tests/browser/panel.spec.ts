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
    page.getByText("Demonstração · sem conexão Google"),
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
  await page.getByRole("button", { name: "Quadros", exact: true }).click();
  await page
    .getByLabel("Mover Tarefa persistente do teste")
    .selectOption({ label: "Em andamento" });
  await page.reload();
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
  await page.getByRole("button", { name: "Quadros", exact: true }).click();
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
  await page.getByLabel("Reduzir movimentos").check();
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
