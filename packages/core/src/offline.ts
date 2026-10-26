import {
  emptyWorkspace,
  newBoard,
  normalizeWorkspace,
  dailySummary,
  zonedParts,
  type Workspace,
} from "./index";
import { reconcileTaskCalendars, nextDay, zonedDateTime } from "./planning";

/** Detach imported data without touching the original Google account or its resources. */
export function preparePingoWorkspace(value: Workspace): Workspace {
  const w = normalizeWorkspace(structuredClone(value));
  w.storageMode = "pingo";
  w.connection = { connected: false, scopes: [] };
  w.mail = [];
  w.outbox = [];
  if (!w.boards.length) w.boards = [newBoard("pingo-personal", "Meu quadro")];
  w.preferences.defaultBoardId ||= w.boards[0].id;
  if (!w.calendars.some((c) => c.id === "pingo-personal"))
    w.calendars.push({
      id: "pingo-personal",
      title: "Minha agenda",
      readOnly: false,
    });
  w.preferences.defaultCalendarId = "pingo-personal";
  if (w.preferences.aiProvider === "google") {
    w.preferences.aiProvider = "openai";
    w.preferences.aiModel = "";
    w.preferences.proactiveAI = false;
  }
  for (const board of w.boards) delete board.googleId;
  for (const task of w.tasks) {
    delete task.googleId;
    delete task.googleEtag;
    delete task.sourceUrl;
    delete task.sourceMail;
    delete task.error;
    if (task.syncState === "conflict" || task.syncState === "error")
      task.syncState = "pending";
  }
  for (const event of w.events) {
    delete event.googleId;
    delete event.googleEtag;
    delete event.error;
    if (!w.calendars.some((c) => c.id === event.calendarId && c.holiday))
      event.calendarId = "pingo-personal";
    if (event.syncState === "conflict" || event.syncState === "error")
      event.syncState = "pending";
  }
  reconcileTaskCalendars(w, () => {});
  return w;
}
export function localWorkspace(timezone?: string) {
  return preparePingoWorkspace(emptyWorkspace(timezone));
}
/** Called only after a durable local-only commit or a successful server transaction. */
export function acknowledgePingoWorkspace(w: Workspace) {
  for (const item of [...w.tasks, ...w.events])
    if (item.syncState !== "conflict") item.syncState = "synced";
  w.outbox = [];
  return w;
}

/** Basic summaries need no AI or network. Refresh the known seven-day horizon on each sync. */
export function offlineSummaries(
  w: Workspace,
  userId: string,
  now = Date.now(),
) {
  const result = [];
  let date = zonedParts(new Date(now), w.preferences.timezone).date;
  for (let i = 0; i < 8; i++, date = nextDay(date)) {
    const dueAt = Date.parse(
      zonedDateTime(date, w.preferences.summaryTime, w.preferences.timezone),
    );
    if (dueAt <= now || dueAt > now + 7 * 86400000) continue;
    result.push({
      noticeId: `summary:${date}`,
      eventId: "",
      title: `Seu dia com ${w.preferences.name}`,
      body: dailySummary(w, new Date(dueAt)),
      dueAt,
      startAt: dueAt + 6 * 3600000,
      expiresAt: dueAt + 6 * 3600000,
      summary: true,
    });
  }
  return result;
}
