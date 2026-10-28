import { test, expect } from "./permission-fixture";
import { localWorkspace } from "../../packages/core/src/index";

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

test("cadastro direto usa nome, e-mail e senha e começa vazio sem importar o espaço local", async ({
  page,
}) => {
  let registered = false;
  let registration: Record<string, unknown> | undefined;
  const workspace = localWorkspace();
  workspace.revision = 1;
  const user = {
    id: "signup-fixture",
    name: "Pessoa de teste",
    email: "signup@example.invalid",
  };
  await page.route("**/api/v1/**", async (route) => {
    if (route.request().url().endsWith("/health"))
      return route.fulfill({ json: { configured: true } });
    if (!registered)
      return route.fulfill({
        status: 401,
        json: { error: "Entre no Pingo para continuar." },
      });
    return route.fulfill({ json: { user, workspace } });
  });
  await page.route("**/api/auth/sign-up/email", async (route) => {
    registration = route.request().postDataJSON();
    registered = true;
    await route.fulfill({ json: { user } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Usar neste aparelho" }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que você quer fazer?")
    .fill("Dado antigo que não deve ser copiado");
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page
    .locator(".settings-section > summary")
    .filter({ hasText: "Conta e sincronização" })
    .click();
  await page
    .getByRole("button", { name: "Entrar ou criar conta", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Sua conta Pingo" });
  await dialog
    .getByRole("button", { name: "Não tem conta? Criar conta" })
    .click();

  await dialog.getByLabel("E-mail", { exact: true }).fill(user.email);
  await dialog
    .getByLabel("Senha", { exact: true })
    .fill("Senha-de-fixture-123");
  await dialog
    .getByLabel("Confirmar senha", { exact: true })
    .fill("Senha-de-fixture-123");
  await dialog
    .getByRole("button", { name: "Criar minha conta", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(registration).toEqual({
    name: "Pessoa",
    email: user.email,
    password: "Senha-de-fixture-123",
  });
  await page.getByRole("button", { name: "Meu dia", exact: true }).click();
  await expect(
    page.getByText("Dado antigo que não deve ser copiado"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nova tarefa", exact: true }),
  ).toBeVisible();
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
    .getByRole("button", { name: "Não tem conta? Criar conta" })
    .click();
  await expect(form.getByLabel("Seu nome", { exact: true })).toHaveCount(0);
  await expect(
    form.getByLabel("Confirmar senha", { exact: true }),
  ).toBeVisible();
  await expect(form.getByLabel(/Convite/)).toHaveCount(0);
  await expect(form.getByLabel("Senha", { exact: true })).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
});
