import { test, expect } from "./permission-fixture";
import { localWorkspace, applyCommand } from "../../packages/core/src/index";
test("rotina local, menu pastel e ajustes no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Usar neste aparelho" }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page.getByLabel("O que você quer fazer?").fill("Beber água na rotina");
  await page
    .getByRole("button", { name: "Todos os dias", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mover Beber água na rotina", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Alterar etapa" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Fazendo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mover Beber água na rotina" }),
  ).toContainText("Fazendo");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mover Beber água na rotina" }),
  ).toContainText("Fazendo");
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await expect(page.locator(".settings-section")).toHaveCount(6);
  await page
    .locator(".settings-section > summary")
    .filter({ hasText: "Minha rotina" })
    .click();
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(page.locator(".routine-series")).toContainText("Pausada");
  await page.screenshot({
    path: ".verification/routines-settings-390.png",
    fullPage: true,
  });
  await page.getByLabel("Minha conta", { exact: true }).click();
  await expect(
    page
      .locator(".account-popover")
      .getByRole("button", { name: "Sair", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("abrir sininho marca avisos, guarda leitura e mantém avisos novos", async ({
  page,
}) => {
  let w = localWorkspace();
  w.notices = [
    { id: "n1", title: "Lembrete", body: "Uma tarefa", read: false },
  ] as any;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/operations")) {
      const op = route.request().postDataJSON();
      w = applyCommand(w, op.command, op.operationId);
    }
    await route.fulfill({
      json: path.endsWith("/health")
        ? { configured: true }
        : {
            workspace: w,
            user: {
              id: "notice-fixture",
              name: "Pessoa",
              email: "notice@example.invalid",
            },
          },
    });
  });
  await page.goto("/");
  await expect(page.locator(".notification-button i")).toHaveCount(1);
  await page.getByRole("button", { name: "Abrir notificações" }).click();
  await expect(page.locator(".notification-button i")).toHaveCount(0);
  await expect.poll(() => w.notices[0].read).toBe(true);
});
test("cadastro explica senha e bloqueia confirmação diferente", async ({
  page,
}) => {
  await page.route("**/api/v1/health", (r) =>
    r.fulfill({ json: { configured: true } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Entrar para sincronizar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Não tem conta? Criar conta" })
    .click();
  await expect(page.getByLabel("Seu nome", { exact: true })).toHaveCount(0);
  await page.getByLabel("Senha", { exact: true }).fill("Amanda@21");
  await expect(page.locator(".password-rules .valid")).toHaveCount(5);
  await page.getByLabel("Confirmar senha", { exact: true }).fill("diferente");
  await expect(
    page.getByRole("button", { name: "Criar minha conta", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Confirmar senha", { exact: true }).fill("Amanda@21");
  await expect(
    page.getByRole("button", { name: "Criar minha conta", exact: true }),
  ).toBeEnabled();
});
test("permissão pede de forma contextual e respeita Agora não", async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.goto("/");
  await page.getByRole("button", { name: "Usar neste aparelho" }).click();
  const permission = page.getByRole("dialog", {
    name: "Vamos lembrar você? ♡",
  });
  await expect(permission).toBeVisible();
  await permission.getByRole("button", { name: "Agora não" }).click();
  await page.reload();
  await expect(permission).not.toBeVisible();
});
