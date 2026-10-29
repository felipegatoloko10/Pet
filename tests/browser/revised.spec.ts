import { test, expect } from "./permission-fixture";
test("arraste com mouse move o cartão para uma coluna vazia", async ({
  page,
}) => {
  await demo(page);
  const card = page.locator(".task-card").first(),
    title = await card.locator("h3").innerText();
  const from = await card
      .getByRole("button", { name: `Arrastar ${title}`, exact: true })
      .boundingBox(),
    to = await page.locator(".kanban-column").nth(2).boundingBox();
  if (!from || !to) throw new Error("Cartão ou destino não visível");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 12,
    from.y + from.height / 2,
    { steps: 4 },
  );
  await expect(page.locator(".drag-preview")).toBeVisible();
  await page.mouse.move(to.x + to.width / 2, to.y + 130, { steps: 20 });
  await page.mouse.up();
  await expect(
    page.getByLabel(`Mover ${title}`, { exact: true }),
  ).toContainText("Aguardando");
});
async function demo(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
}
test("Kanban simplificado preserva checklist sem etiquetas ou arquivo", async ({
  page,
}) => {
  await demo(page);
  const card = page.locator(".task-card").first();
  const title = await card.locator("h3").innerText();
  await card
    .getByRole("button", { name: `Organizar ${title}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Organizar cartão" });
  await expect(dialog.getByLabel("Nome da etiqueta")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Arquivar", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByLabel("Novo item do checklist")
    .fill("Separar os documentos");
  await dialog
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await dialog.getByLabel("Separar os documentos", { exact: true }).check();
  await expect(
    dialog.getByLabel("Separar os documentos", { exact: true }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Fechar organização" }).click();
  await expect(page.getByLabel("Filtrar etiqueta")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Arquivados", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
  await page
    .getByRole("button", { name: `Organizar ${title}`, exact: true })
    .click();
  await expect(
    page.getByLabel("Separar os documentos", { exact: true }),
  ).toBeChecked();
});
test("calendário abre na semana e apresenta mês e doze meses do ano", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Semana", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mês", exact: true }).click();
  await expect(page.locator(".month-grid .month-cell")).toHaveCount(42);
  await page.getByRole("button", { name: "Ano", exact: true }).click();
  await expect(page.locator(".mini-month")).toHaveCount(12);
  await page.screenshot({
    path: ".verification/revised-year.png",
    fullPage: true,
  });
  await page
    .locator(".mini-month")
    .first()
    .getByRole("button", { name: "janeiro", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mês", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Meu dia", exact: true }).click();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Semana", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("conversas mantêm históricos separados e sobrevivem à recarga", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Conversa", exact: true }).click();
  await expect(
    page.getByText("Enviar o corpo de um e-mail nesta conversa"),
  ).toHaveCount(0);
  await page
    .getByLabel("Mensagem para Pingo")
    .fill("Quero organizar meu sábado");
  await page.getByRole("button", { name: "Enviar ↑", exact: true }).click();
  await expect(page.locator(".chat-turn.user")).toContainText(
    "organizar meu sábado",
  );
  await page
    .getByRole("button", { name: "Nova conversa", exact: false })
    .click();
  await page
    .getByLabel("Mensagem para Pingo")
    .fill("Preciso planejar o trabalho");
  await page.getByRole("button", { name: "Enviar ↑", exact: true }).click();
  await expect(page.locator(".chat-turn.user")).toContainText(
    "planejar o trabalho",
  );
  await expect(page.locator(".chat-transcript")).not.toContainText(
    "organizar meu sábado",
  );
  await page
    .getByRole("button", { name: "Quero organizar meu sábado", exact: true })
    .click();
  await expect(page.locator(".chat-transcript")).not.toContainText(
    "planejar o trabalho",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Explorar demonstração local" })
    .click();
  await page.getByRole("button", { name: "Conversa", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Quero organizar meu sábado",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: ".verification/revised-chat.png",
    fullPage: true,
  });
});
test("arraste por teclado reordena cartões sem abrir o editor", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await page
    .getByLabel("O que você quer fazer?")
    .fill("Outra tarefa para reordenar");
  await page
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  const column = page.locator(".kanban-column").first();
  await expect(column.locator("h3")).toHaveCount(2);
  const before = await column.locator("h3").allTextContents();
  await column
    .getByRole("button", { name: `Arrastar ${before[0]}`, exact: true })
    .focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(() => column.locator("h3").allTextContents())
    .not.toEqual(before);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
