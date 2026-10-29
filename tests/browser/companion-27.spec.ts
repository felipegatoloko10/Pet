import { test, expect } from "./permission-fixture";

test("perfil recolhe ao tocar fora e ao pressionar Escape", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Usar neste aparelho" }).click();
  const trigger = page.getByLabel("Minha conta", { exact: true });
  await trigger.click();
  await expect(page.locator(".account-menu[open]")).toHaveCount(1);
  await page.getByRole("heading", { name: "Uma coisa de cada vez." }).click();
  await expect(page.locator(".account-menu[open]")).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".account-menu[open]")).toHaveCount(0);
});

test("concluir ganha comida, libera laço e conserva a coleção após reiniciar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Usar neste aparelho" }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que você quer fazer?")
    .fill("Cuidar da minha rotina");
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mover Cuidar da minha rotina", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Alterar etapa" })
    .getByRole("button", { name: "Feito", exact: true })
    .click();
  await expect(page.locator(".pet-day-glance")).toContainText("3 comidinha(s)");
  await page.getByRole("button", { name: "Pingo", exact: true }).click();
  await page.getByRole("button", { name: "Vestir", exact: true }).click();
  await page
    .locator(".collection-item")
    .filter({ hasText: "Laço de carinho" })
    .getByRole("button", { name: "Usar", exact: true })
    .click();
  await expect(
    page.locator(".collection-item").first().getByRole("button"),
  ).toHaveText("Retirar");
  await page.screenshot({
    path: ".verification/pingo-27-collection-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cuidar", exact: true }).click();
  await page.getByRole("button", { name: /^Alimentar/ }).click();
  await expect(
    page.getByRole("button", { name: "Alimentar (2)", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Pingo", exact: true }).click();
  await expect(page.locator(".pet-journey")).toContainText("2 comidinha(s)");
  await page.getByRole("button", { name: "Vestir", exact: true }).click();
  await expect(
    page.locator(".collection-item").first().getByRole("button"),
  ).toHaveText("Retirar");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("exclusão de rotina usa modal e não volta após reiniciar offline", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Usar neste aparelho" }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page.getByLabel("O que você quer fazer?").fill("Piscina repetida");
  await page
    .getByRole("button", { name: "Todos os dias", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await context.setOffline(true);
  await page
    .getByRole("heading", { name: "Piscina repetida", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Excluir tarefa", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Excluir tarefas" });
  await dialog.getByRole("button", { name: /^Toda a rotina/ }).click();
  await page.screenshot({
    path: ".verification/pingo-27-delete-390.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Confirmar exclusão", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Piscina repetida", exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Piscina repetida", exact: true }),
  ).toHaveCount(0);
});
