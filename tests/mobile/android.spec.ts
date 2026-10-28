import { test, expect } from "../browser/permission-fixture";
test.use({
  viewport: { width: 393, height: 851 },
  hasTouch: true,
  isMobile: true,
});
test.beforeEach(async ({ page }) => {
  await page.route("https://pingo-gilt.vercel.app/api/v1/**", (route) =>
    route.fulfill({
      status: route.request().url().endsWith("/health") ? 200 : 401,
      contentType: "application/json",
      body: route.request().url().endsWith("/health")
        ? JSON.stringify({ configured: true })
        : JSON.stringify({ error: "Entre no Pingo." }),
    }),
  );
  await page.goto(`http://127.0.0.1:${process.env.PINGO_MOBILE_TEST_PORT ?? "1430"}`);
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
});
test("Android navigation keeps Kanban first and care persists after restart", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".mobile-app")).toBeVisible();
  await expect(page.locator(".workspace > .home-board")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("button"),
  ).toHaveCount(5);
  await page.getByRole("button", { name: "Pingo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Um momento com Pingo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alimentar", exact: true }).click();
  await expect(
    page.getByRole("progressbar", { name: "Saciedade" }),
  ).toHaveAttribute("value", /100|99\./);
  await page.screenshot({
    path: ".verification/pingo-android-pet.png",
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
  await page.getByRole("button", { name: "Pingo", exact: true }).click();
  await expect(
    page.getByRole("progressbar", { name: "Saciedade" }),
  ).toHaveAttribute("value", /100|99\./);
  expect(errors).toEqual([]);
});
test("Android task editor, conversation and monthly calendar fit a phone", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page.getByLabel("O que você quer fazer?").fill("Uma tarefa no Android");
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Uma tarefa no Android/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".verification/pingo-android-day.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByRole("button", { name: "Mês", exact: true }).click();
  await expect(page.locator(".month-grid").first()).toBeVisible();
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  await page
    .getByLabel("Mensagem para Pingo")
    .fill("Vamos organizar meu sábado?");
  await page.getByRole("button", { name: /Enviar/ }).click();
  await expect(
    page
      .locator(".chat-transcript .chat-turn.user p")
      .filter({ hasText: "Vamos organizar meu sábado?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".verification/pingo-android-chat.png",
    fullPage: false,
  });
});
