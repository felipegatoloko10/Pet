import { test, expect } from "@playwright/test";

test("instalação local cria tarefas sem login e abre agenda pela primeira vez offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Usar neste aparelho" }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que você quer fazer?")
    .fill("Cuidar da rotina offline");
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Cuidar da rotina offline/ }),
  ).toBeVisible();
  await expect(page.locator(".toast")).toContainText("Salvei neste aparelho");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Cuidar da rotina offline/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Semana", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Ano", exact: true }).click();
  await expect(page.locator(".mini-month")).toHaveCount(12);
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await page.screenshot({
    path: ".verification/pingo-offline-calendar.png",
    fullPage: true,
  });
});

test("login exibe senha e cadastro e não oferece autorização Google", async ({
  page,
}) => {
  await page.route("**/api/v1/health", (r) =>
    r.fulfill({ json: { configured: true } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Entrar para sincronizar", exact: true })
    .click();
  const form = page.getByRole("dialog", { name: "Sua conta Pingo" });
  await expect(form.getByLabel("E-mail", { exact: true })).toBeVisible();
  await expect(form.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await form
    .getByRole("button", { name: "Primeiro acesso? Criar conta" })
    .click();
  await expect(form.getByLabel("Seu nome", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
});
