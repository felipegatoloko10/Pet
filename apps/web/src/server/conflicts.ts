import {
  DomainError,
  mergeGoogleTask,
  type Workspace,
  type Task,
  type CalendarEvent,
} from "@pingo/core";
import { readWorkspace, mutateWorkspace } from "./workspace";
import { GoogleClient, googleToken, GoogleError } from "./google";
type Remote = {
  id: string;
  title?: string;
  summary?: string;
  notes?: string;
  due?: string;
  status?: string;
  etag?: string;
  updated?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { email: string }[];
};
export async function inspectConflict(
  userId: string,
  kind: "task" | "event",
  id: string,
) {
  const w = await readWorkspace(userId);
  const local = (kind === "task" ? w.tasks : w.events).find((i) => i.id === id);
  if (!local) throw new DomainError("missing", "Item não encontrado.", 404);
  const client = new GoogleClient(await googleToken(userId));
  let remote: Remote | null = null;
  if (kind === "task") {
    const b = w.boards.find((b) => b.id === (local as Task).boardId);
    if (!b?.googleId)
      throw new DomainError("local", "Esta tarefa ainda é local.");
    const base = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(b.googleId)}/tasks`;
    if (local.googleId) {
      try {
        remote = await client.request(
          `${base}/${encodeURIComponent(local.googleId)}`,
        );
      } catch (e) {
        if (!(e instanceof GoogleError && e.status === 404)) throw e;
      }
    } else {
      const items = await client.pages<Remote>(
        base + "?showCompleted=true&showHidden=true",
        "items",
      );
      const matches = items.filter((t) =>
        t.notes?.includes(`[Pingo:${local.id}]`),
      );
      if (matches.length > 1)
        throw new DomainError(
          "ambiguous",
          "Mais de uma correspondência. Revise no Google antes de continuar.",
          409,
        );
      remote = matches[0] ?? null;
    }
  } else {
    const e = local as CalendarEvent;
    try {
      remote = await client.request(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(e.calendarId)}/events/${encodeURIComponent(e.googleId ?? e.id.replaceAll("-", ""))}`,
      );
    } catch (err) {
      if (!(err instanceof GoogleError && err.status === 404)) throw err;
    }
  }
  return { local, remote };
}
export async function resolveConflict(
  userId: string,
  kind: "task" | "event",
  id: string,
  choice: "google" | "pingo",
  expectedRevision: number,
) {
  const snapshot = await inspectConflict(userId, kind, id);
  await mutateWorkspace(userId, (w) => {
    const item = (kind === "task" ? w.tasks : w.events).find(
      (i) => i.id === id,
    )!;
    if (item.revision !== expectedRevision)
      throw new DomainError("conflict", "O item mudou. Revise novamente.", 409);
    const remote = snapshot.remote;
    if (choice === "google") {
      w.outbox = w.outbox.filter((j) => j.entityId !== id);
      if (!remote || remote.status === "cancelled") {
        item.deleted = true;
        item.syncState = "synced";
        item.error = undefined;
        item.revision++;
      } else if (kind === "task") {
        if (!item.googleId) item.googleId = remote.id;
        const board = w.boards.find((b) => b.id === (item as Task).boardId)!;
        mergeGoogleTask(w, board, {
          ...remote,
          notes: remote.notes?.replace(/\n?\[Pingo:[^\]]+\]/g, ""),
        });
      } else {
        const event = item as CalendarEvent;
        Object.assign(event, {
          googleId: remote.id,
          googleEtag: remote.etag,
          title: remote.summary ?? event.title,
          start: remote.start?.dateTime ?? remote.start?.date ?? event.start,
          end: remote.end?.dateTime ?? remote.end?.date ?? event.end,
          allDay: !!remote.start?.date,
          attendees: remote.attendees?.map((a) => a.email),
          syncState: "synced",
          error: undefined,
          deleted: false,
          revision: event.revision + 1,
        });
      }
    } else {
      const previous = w.outbox.find((j) => j.entityId === id);
      if (!remote && item.googleId)
        throw new DomainError(
          "deleted",
          "O item foi excluído no Google. Use a versão Google e crie um novo item se necessário.",
          409,
        );
      if (
        !remote &&
        previous?.sentAt &&
        Date.now() - Date.parse(previous.sentAt) < 60000
      )
        throw new DomainError(
          "wait",
          "Aguarde um minuto antes de reconciliar novamente.",
          409,
        );
      if (remote) {
        item.googleId = remote.id;
        item.googleEtag = remote.etag;
        if (kind === "task") (item as Task).googleUpdated = remote.updated;
      }
      item.syncState = "pending";
      item.error = undefined;
      item.revision++;
      w.outbox = w.outbox.filter((j) => j.entityId !== id);
      w.outbox.push({
        id: crypto.randomUUID(),
        kind,
        entityId: id,
        action: item.deleted ? "delete" : "upsert",
        state: "pending",
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
      });
    }
    w.revision++;
  });
}
