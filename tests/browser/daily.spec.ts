import { test, expect, type Page } from "@playwright/test";
import {
  emptyWorkspace,
  newBoard,
  applyCommand,
  zonedParts,
  zonedDateTime,
  nextDay,
  dayBounds,
  type Workspace,
} from "../../packages/core/src/index";
async function fixture(page: Page) {
  let w = emptyWorkspace("America/Sao_Paulo");
  w.boards = [newBoard("b", "Minha lista")];
  w.preferences.defaultBoardId = "b";
  const today = zonedParts(new Date(), w.preferences.timezone).date,
    tomorrow = nextDay(today),
    y = new Date(today + "T12:00Z");
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  for (const [id, due] of [
    ["Hoje", today],
    ["Atrasada", yesterday],
    ["Futura", tomorrow],
    ["Sem data", null],
  ] as const) {
    w = applyCommand(
      w,
      {
        type: "task.upsert",
        expectedRevision: 0,
        task: {
          id,
          boardId: "b",
          columnId: "b:todo",
          title: id,
          notes: "",
          dueDate: due,
          scheduledStart: null,
          scheduledEnd: null,
          priority: "normal",
        },
      },
      crypto.randomUUID(),
    );
  }
  w.outbox = [];
  w.calendars = [
    { id: "holiday", title: "Feriados", holiday: true, readOnly: true },
  ];
  w.events.push(
    {
      id: "appointment",
      calendarId: "primary",
      title: "Compromisso de teste",
      start: dayBounds(today, w.preferences.timezone).start,
      end: dayBounds(tomorrow, w.preferences.timezone).start,
      allDay: false,
      revision: 1,
      syncState: "synced",
    },
    {
      id: "holiday",
      calendarId: "holiday",
      title: "Dia especial de teste",
      start: today,
      end: tomorrow,
      allDay: true,
      revision: 1,
      syncState: "synced",
    },
  );
  w.mail = [
    {
      id: "mail",
      subject: "Documento para revisar",
      from: "Pessoa de teste",
      date: new Date().toISOString(),
      isRead: false,
    },
  ];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/operations")) {
      const op = route.request().postDataJSON();
      w = applyCommand(w, op.command, op.operationId);
    }
    await route.fulfill({
      json: url.pathname.endsWith("/health")
        ? { configured: true }
        : url.pathname.includes("calendar/range")
          ? { events: w.events }
          : {
              workspace: w,
              user: {
                id: "fixture",
                name: "Pessoa",
                email: "test@example.invalid",
              },
            },
    });
  });
  await page.goto("/");
  await expect(page.locator(".home-board")).toBeVisible();
  return () => w;
}
test("quadro reúne o dia, atrasadas e feriado sem duplicar vínculos", async ({
  page,
}) => {
  await fixture(page);
  const board = page.locator(".home-board");
  await expect(
    board.getByRole("heading", { name: "Hoje", exact: true }),
  ).toHaveCount(1);
  await expect(
    board.getByRole("heading", { name: "Futura", exact: true }),
  ).toHaveCount(0);
  await expect(
    board.getByRole("heading", { name: "Sem data", exact: true }),
  ).toBeVisible();
  await expect(board.locator(".overdue-badge")).toContainText("Atrasada");
  await expect(
    board.getByRole("heading", { name: "Compromisso de teste", exact: true }),
  ).toBeVisible();
  await expect(board.locator(".day-holidays")).toContainText(
    "Hoje é Dia especial de teste",
  );
  await expect(board.getByLabel("Lista do quadro")).toHaveCount(0);
  await expect(board.getByLabel("Filtrar prazo")).toHaveCount(0);
  await expect(
    board.getByRole("button", { name: "Organizar datas", exact: true }),
  ).toHaveCount(0);
  await expect(
    board.getByRole("heading", { name: "Sem data", exact: true }),
  ).toBeVisible();
});
test("coluna tem 24 cores, persiste escolha e exclui sem apagar cartões", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "Adicionar coluna" }).click();
  let dialog = page.getByRole("dialog", { name: "Nova coluna", exact: true });
  await dialog.getByLabel("Nome da coluna").fill("Pessoal");
  await expect(dialog.getByRole("button", { name: /Cor pastel/ })).toHaveCount(
    24,
  );
  await dialog
    .getByRole("button", { name: "Cor pastel 10", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Criar coluna", exact: true })
    .click();
  const col = page.locator(".kanban-column").filter({
    has: page.getByRole("button", { name: "Pessoal", exact: true }),
  });
  await expect(col).toHaveCSS("background-color", "rgb(199, 232, 231)");
  await page
    .getByLabel("Mover Hoje", { exact: true })
    .selectOption({ label: "Pessoal" });
  await page
    .getByRole("button", { name: "Editar coluna Pessoal", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Editar coluna", exact: true });
  page.once("dialog", (d) => d.accept());
  await dialog
    .getByRole("button", { name: "Excluir coluna", exact: true })
    .click();
  await expect(page.getByLabel("Mover Hoje", { exact: true })).toHaveValue(
    "b:todo",
  );
  expect(state().tasks.find((t) => t.id === "Hoje")!.deleted).not.toBe(true);
  await page.screenshot({
    path: ".verification/v24-board.png",
    fullPage: true,
  });
});
test("e-mail abre tarefa para revisão e horário único reserva 30 minutos", async ({
  page,
}) => {
  const state = await fixture(page);
  await expect(page.locator(".mail-help")).toContainText(
    "não podem ser abertas",
  );
  await page
    .getByRole("button", {
      name: "Criar tarefa do e-mail Documento para revisar",
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Uma nova tarefa" });
  await expect(dialog.getByLabel("O que você quer fazer?")).toHaveValue(
    "Documento para revisar",
  );
  expect(state().tasks.some((t) => t.title === "Documento para revisar")).toBe(
    false,
  );
  await dialog.getByLabel("Tipo de horário").selectOption("point");
  await dialog.getByLabel("Começa às").fill("15:00");
  await dialog
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const task = state().tasks.find((t) => t.title === "Documento para revisar")!;
  expect(task.scheduledStart).toBe(
    zonedDateTime(task.dueDate!, "15:00", state().preferences.timezone),
  );
  expect(task.sourceMail?.id).toBe("mail");
  expect(
    Date.parse(task.scheduledEnd!) - Date.parse(task.scheduledStart!),
  ).toBe(1800000);
  expect(state().events.filter((e) => e.taskId === task.id)).toHaveLength(1);
});

test("salvar fecha o formulário antes de uma resposta lenta da rede", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.route("**/api/v1/operations", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const op = route.request().postDataJSON();
    Object.assign(state(), applyCommand(state(), op.command, op.operationId));
    await route.fulfill({ json: { workspace: state() } });
  });
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Uma nova tarefa" });
  await dialog.getByLabel("O que você quer fazer?").fill("Salvar sem travar");
  await dialog
    .getByRole("button", { name: "Salvar tarefa", exact: true })
    .click();
  await expect(dialog).not.toBeVisible({ timeout: 800 });
  await expect(
    page.getByRole("heading", { name: "Salvar sem travar", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => state().tasks.some((t) => t.title === "Salvar sem travar"))
    .toBe(true);
});

test("dia inteiro usa o último dia inclusivo e salva o fim exclusivo internamente", async ({
  page,
}) => {
  const state = await fixture(page),
    today = zonedParts(new Date(), state().preferences.timezone).date;
  await page
    .getByRole("button", { name: /^Compromisso de teste Compromisso/ })
    .click();
  const dialog = page.getByRole("dialog", { name: "Seu compromisso" });
  await dialog.getByLabel("Início", { exact: true }).fill(today + "T09:00");
  await dialog.getByLabel("Fim", { exact: true }).fill(today + "T10:00");
  await dialog.getByLabel("Dia inteiro", { exact: true }).check();
  await expect(dialog.getByLabel("Último dia", { exact: true })).toHaveValue(
    today,
  );
  await dialog
    .getByRole("button", { name: "Salvar compromisso", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() => state().events.find((e) => e.id === "appointment")?.allDay)
    .toBe(true);
  expect(state().events.find((e) => e.id === "appointment")!.end).toBe(
    nextDay(today),
  );
});

test("rolar dentro de um formulário não move o fundo no celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await fixture(page);
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await expect(page.locator("body")).toHaveCSS("position", "fixed");
  const top = await page
    .locator("body")
    .evaluate((el) => (el as HTMLElement).style.top);
  await page.getByLabel("Detalhes", { exact: true }).hover();
  await page.mouse.wheel(0, 650);
  expect(
    await page.locator("body").evaluate((el) => (el as HTMLElement).style.top),
  ).toBe(top);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
});
