import { test, expect } from "@playwright/test";

test("quadro cabe no celular, atalhos alcançam colunas e a cor escolhida sobrevive ao reinício", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Usar neste aparelho" }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que você quer fazer?")
    .fill("Separar um tempinho para mim");
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".kanban-column").first()).toHaveCSS(
    "background-color",
    "rgb(255, 200, 221)",
  );
  await expect(page.locator(".kanban-column").nth(1)).toHaveCSS(
    "background-color",
    "rgb(255, 243, 168)",
  );
  await page
    .getByRole("button", { name: "Ver coluna Feito", exact: true })
    .click();
  await expect
    .poll(async () => {
      const board = await page.locator(".kanban").boundingBox();
      const column = await page
        .locator('[data-column-id="pingo-personal:done"]')
        .boundingBox();
      return Math.abs(board!.x - column!.x);
    })
    .toBeLessThan(35);
  await expect(
    page.getByRole("button", { name: "Ver coluna Feito", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Editar coluna Feito", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cor pastel 12", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator('[data-column-id="pingo-personal:done"]'),
  ).toHaveCSS("background-color", "rgb(184, 224, 255)");
  await page
    .getByRole("button", { name: "Ver coluna A fazer", exact: true })
    .click();
  await page.screenshot({
    path: ".verification/kawaii-board-360.png",
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const initialScroll = await page.evaluate(() => window.scrollY);
  await dialog.evaluate((el) => el.scrollTo({ top: 450 }));
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScroll);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await expect(
    dialog.getByRole("button", { name: "Salvar tarefa", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: ".verification/kawaii-editor-360.png" });
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByRole("button", { name: "Mês", exact: true }).click();
  await expect(page.locator(".month-summary").first()).toBeVisible();
  await page.locator(".month-summary").first().click();
  await expect(
    page.getByRole("button", { name: "Dia", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .locator(".calendar-event")
      .filter({ hasText: "Separar um tempinho para mim" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("superfícies de agenda, conversa e pet permanecem utilizáveis em tela pequena", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({ path: ".verification/kawaii-welcome-390.png" });
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
  await page.screenshot({ path: ".verification/kawaii-board-390.png" });
  for (const screen of [
    { label: "Agenda", screenshot: "calendar" },
    { label: "Pingo", screenshot: "pet" },
    { label: "Conversa", screenshot: "chat" },
    { label: "Ajustes", screenshot: "settings" },
  ]) {
    await page
      .getByRole("button", {
        name: screen.label === "Conversa" ? /^Conversas?$/ : screen.label,
        exact: true,
      })
      .click();
    if (screen.label === "Agenda") {
      await page.getByRole("button", { name: "Mês", exact: true }).click();
      await expect(page.locator(".month-grid")).toBeVisible();
    }
    if (screen.label === "Pingo")
      await expect(page.locator(".pet-care-actions")).toBeVisible();
    if (screen.label === "Conversa")
      await expect(page.locator(".chat-composer textarea")).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.verification/kawaii-${screen.screenshot}-390.png`,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Meu dia", exact: true }).click();
  await page.screenshot({ path: ".verification/kawaii-board-desktop.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
