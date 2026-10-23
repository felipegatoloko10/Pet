import { dayBounds, zonedParts } from "@pingo/core";
import {
  newBoard,
  mergeGoogleTask,
  type Task,
  type CalendarEvent,
  type Workspace,
  type SyncJob,
} from "@pingo/core";
import { GoogleClient, GoogleError, googleToken } from "./google";
import { mutateWorkspace, readWorkspace } from "./workspace";
import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { channels } from "./schema";
import { digest } from "./crypto";
import { reconcileTaskCalendars, localDay } from "@pingo/core";
type GTask = {
  completed?: string;
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
  deleted?: boolean;
  updated?: string;
  etag?: string;
};
type GEvent = {
  transparency?: string;
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  status?: string;
  etag?: string;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: { pingoId?: string; pingoTaskId?: string } };
  attendees?: { email: string }[];
};
const tasksBase = "https://tasks.googleapis.com/tasks/v1";
const calendarBase = "https://www.googleapis.com/calendar/v3";
const taskUrl = (list: string, id?: string) =>
  `${tasksBase}/lists/${encodeURIComponent(list)}/tasks${id ? `/${encodeURIComponent(id)}` : ""}`;
const eventUrl = (cal: string, id?: string) =>
  `${calendarBase}/calendars/${encodeURIComponent(cal)}/events${id ? `/${encodeURIComponent(id)}` : ""}`;
const marker = (id: string) => `[Pingo:${id}]`;
function notice(w: Workspace, id: string, title: string, body: string) {
  if (!w.notices.some((n) => n.id === id))
    w.notices.unshift({
      id,
      title,
      body,
      createdAt: new Date().toISOString(),
      read: false,
    });
  w.notices = w.notices.slice(0, 200);
}
function syncLinkedTask(w: Workspace, e: CalendarEvent, prior?: CalendarEvent) {
  if (!e.taskId) return;
  const t = w.tasks.find((t) => t.id === e.taskId);
  if (!t) return;
  if (e.deleted) {
    if (!t.deleted) {
      t.calendarSuppressed = true;
      t.calendarRemoved = true;
      t.timeMode = "none";
      t.checkIn = undefined;
    }
  }
  if (!e.deleted && t.syncState === "conflict") return;
  const start = e.deleted ? null : e.start,
    end = e.deleted ? null : e.end;
  let title = e.title.replace(/^✓\s*/, "");
  let due = e.deleted
    ? t.dueDate
    : e.allDay
      ? e.start
      : localDay(e.start, w.preferences.timezone);
  if (prior && !e.deleted) {
    const beforeTitle = prior.title.replace(/^✓\s*/, ""),
      beforeDate = prior.allDay
        ? prior.start
        : localDay(prior.start, w.preferences.timezone);
    const conflict =
      (t.title !== beforeTitle && title !== beforeTitle && title !== t.title) ||
      (t.dueDate !== beforeDate && due !== beforeDate && due !== t.dueDate);
    if (conflict) {
      t.syncState = "conflict";
      e.syncState = "conflict";
      t.error = e.error =
        "A tarefa e o compromisso foram alterados no Google. Revise antes de sincronizar.";
      return;
    }
    if (title === beforeTitle && t.title !== beforeTitle) title = t.title;
    if (due === beforeDate && t.dueDate !== beforeDate) due = t.dueDate;
  }
  if (
    t.scheduledStart !== (e.allDay ? null : start) ||
    t.scheduledEnd !== (e.allDay ? null : end) ||
    t.title !== title ||
    t.dueDate !== due
  ) {
    t.scheduledStart = e.allDay ? null : start;
    t.scheduledEnd = e.allDay ? null : end;
    if (!e.deleted) {
      t.title = title;
      t.dueDate = due;
      t.timeMode = e.allDay ? "none" : (t.timeMode ?? "range");
    }
    t.checkIn = undefined;
    t.actualStartedAt = null;
    t.revision++;
    if (
      !e.deleted &&
      !w.outbox.some((j) => j.kind === "task" && j.entityId === t.id)
    ) {
      t.syncState = "pending";
      w.outbox.push({
        id: crypto.randomUUID(),
        kind: "task",
        entityId: t.id,
        action: "upsert",
        state: "pending",
        attempts: 0,
        nextAttemptAt: new Date().toISOString(),
      });
    }
  }
}
async function deliverJob(userId: string, client: GoogleClient, job: SyncJob) {
  const w = await readWorkspace(userId);
  const t = w.tasks.find((t) => t.id === job.entityId);
  const e = w.events.find((e) => e.id === job.entityId);
  const item = job.kind === "task" ? t : e;
  if (!item) return;
  const b = t && w.boards.find((b) => b.id === t.boardId);
  if (job.kind === "task" && !b?.googleId) return;
  let result: GTask | GEvent | undefined;
  try {
    if (job.state === "uncertain") {
      if (Date.now() - Date.parse(job.sentAt ?? "") < 60000) return;
      if (!item.googleId && job.action === "upsert") {
        const matches =
          job.kind === "task"
            ? (
                await client.pages<GTask>(
                  taskUrl(b!.googleId!) + "?showCompleted=true&showHidden=true",
                  "items",
                )
              ).filter((x) => x.notes?.includes(marker(item.id)))
            : await client.pages<GEvent>(
                eventUrl(e!.calendarId) +
                  `?privateExtendedProperty=${encodeURIComponent(`pingoId=${item.id}`)}`,
                "items",
              );
        if (matches.length !== 1) {
          await mutateWorkspace(userId, (current) => {
            const i = (
              job.kind === "task" ? current.tasks : current.events
            ).find((i) => i.id === job.entityId);
            const j = current.outbox.find((j) => j.id === job.id);
            if (i && j) {
              i.syncState = "conflict";
              i.error = matches.length
                ? "Mais de uma correspondência encontrada. Revise no Google."
                : "Criação sem confirmação. Confira no Google antes de recriar.";
              j.error = i.error;
            }
            current.revision++;
          });
          return;
        }
        result = matches[0];
      }
    }
    if (!result) {
      const endpoint =
        job.kind === "task"
          ? taskUrl(b!.googleId!, item.googleId)
          : eventUrl(
              e!.calendarId,
              item.googleId ?? item.id.replaceAll("-", ""),
            );
      if (job.action === "delete") {
        if (item.googleId) {
          try {
            await client.request(endpoint, {
              method: "DELETE",
              headers: item.googleEtag ? { "If-Match": item.googleEtag } : {},
            });
          } catch (err) {
            if (!(err instanceof GoogleError && err.status === 404)) throw err;
          }
        }
      } else if (job.kind === "task") {
        const data = {
          title: t!.title,
          notes: [t!.notes, marker(t!.id)].filter(Boolean).join("\n"),
          due: t!.dueDate ? `${t!.dueDate}T00:00:00.000Z` : null,
          status: t!.completed ? "completed" : "needsAction",
          completed: t!.completed ? new Date().toISOString() : null,
        };
        result = await client.request<GTask>(
          taskUrl(b!.googleId!, t!.googleId),
          {
            method: t!.googleId ? "PATCH" : "POST",
            body: JSON.stringify(data),
            headers: t!.googleEtag ? { "If-Match": t!.googleEtag } : {},
          },
        );
      } else {
        const data = {
          ...(!e!.googleId ? { id: e!.id.replaceAll("-", "") } : {}),
          summary: e!.title,
          start: e!.allDay
            ? { date: e!.start }
            : { dateTime: e!.start, timeZone: w.preferences.timezone },
          end: e!.allDay
            ? { date: e!.end }
            : { dateTime: e!.end, timeZone: w.preferences.timezone },
          recurrence: e!.recurrence,
          attendees: e!.attendees?.map((email) => ({ email })),
          extendedProperties: {
            private: {
              pingoId: e!.id,
              ...(e!.taskId ? { pingoTaskId: e!.taskId } : {}),
            },
          },
        };
        result = await client.request<GEvent>(
          `${eventUrl(e!.calendarId, e!.googleId)}?sendUpdates=${e!.attendees?.length ? "all" : "none"}`,
          {
            method: e!.googleId ? "PATCH" : "POST",
            body: JSON.stringify(data),
            headers: e!.googleEtag ? { "If-Match": e!.googleEtag } : {},
          },
        );
      }
    }
    await mutateWorkspace(userId, (current) => {
      const i = (job.kind === "task" ? current.tasks : current.events).find(
        (i) => i.id === job.entityId,
      );
      if (!i) return;
      if (result) {
        i.googleId = result.id;
        i.googleEtag = result.etag;
        if (job.kind === "task")
          (i as Task).googleUpdated = (result as GTask).updated;
      }
      i.syncState = "synced";
      i.error = undefined;
      // Provider acknowledgement changes transport metadata, not the user's revision.
      current.outbox = current.outbox.filter(
        (j) =>
          !(
            j.id === job.id &&
            j.kind === job.kind &&
            j.entityId === job.entityId
          ),
      );
      const task =
        job.kind === "task"
          ? current.tasks.find((t) => t.id === job.entityId)
          : current.tasks.find((t) => t.id === (i as CalendarEvent).taskId);
      const linked =
        task && current.events.find((e) => e.taskId === task.id && !e.deleted);
      if (
        task &&
        !task.deleted &&
        task.syncState === "synced" &&
        (!task.dueDate ||
          task.calendarSuppressed ||
          (linked?.syncState === "synced" &&
            linked.title === `${task.completed ? "✓ " : ""}${task.title}`)) &&
        !current.outbox.some(
          (j) => j.entityId === task.id || j.entityId === linked?.id,
        )
      ) {
        notice(
          current,
          `sync:task:${task.id}:${task.googleUpdated}:${linked?.googleEtag}`,
          "Tarefa sincronizada",
          `Já confirmei e sincronizei com o Google sua tarefa “${task.title}”.`,
        );
      } else if (!task || job.action === "delete")
        notice(
          current,
          `sync:${job.id}`,
          job.kind === "task" ? "Google Tasks atualizado" : "Agenda atualizada",
          job.action === "delete"
            ? "Exclusão confirmada pelo Google."
            : job.kind === "task"
              ? `Sua tarefa “${i.title}” está no Google Tasks. A agenda ainda está sendo sincronizada.`
              : `Confirmei “${i.title}” no Google Agenda.`,
        );
      current.revision++;
    });
  } catch (error) {
    await mutateWorkspace(userId, (current) => {
      const i = (job.kind === "task" ? current.tasks : current.events).find(
        (i) => i.id === job.entityId,
      );
      const j = current.outbox.find((j) => j.id === job.id);
      if (!i || !j) return;
      const status = error instanceof GoogleError ? error.status : 0;
      const uncertain =
        !item.googleId &&
        job.action === "upsert" &&
        (!status || status >= 500 || status === 409);
      i.syncState =
        status === 412 ? "conflict" : uncertain ? "pending" : "error";
      i.error =
        error instanceof GoogleError
          ? error.message
          : "Falha de rede. Aguardando reconciliação.";
      j.state = uncertain ? "uncertain" : "error";
      j.error = i.error;
      j.attempts++;
      j.nextAttemptAt = new Date(
        Date.now() +
          Math.max(60000, Math.min(3600000, 2 ** j.attempts * 30000)),
      ).toISOString();
      if (status === 401) current.connection.error = i.error;
      current.revision++;
    });
  }
}
async function pushOutbox(userId: string, client: GoogleClient) {
  for (let i = 0; i < 10; i++) {
    const job = await mutateWorkspace(userId, (w) => {
      const j = w.outbox.find(
        (j) =>
          Date.parse(j.nextAttemptAt) <= Date.now() &&
          (j.kind === "event" ||
            w.boards.some(
              (b) =>
                b.googleId &&
                b.id === w.tasks.find((t) => t.id === j.entityId)?.boardId,
            )) &&
          (!j.sentAt || Date.now() - Date.parse(j.sentAt) > 60000) &&
          !(
            (j.kind === "task" ? w.tasks : w.events).find(
              (x) => x.id === j.entityId,
            )?.syncState === "conflict"
          ),
      );
      if (!j) return null;
      const prior = structuredClone(j);
      j.state = "uncertain";
      j.sentAt = new Date().toISOString();
      const item = (j.kind === "task" ? w.tasks : w.events).find(
        (x) => x.id === j.entityId,
      );
      if (item) item.syncState = "syncing";
      return prior;
    });
    if (!job) break;
    await deliverJob(userId, client, job);
  }
}
export async function syncGoogle(userId: string) {
  const current = await readWorkspace(userId);
  if (!current.connection.connected) return current;
  try {
    const client = new GoogleClient(await googleToken(userId));
    const errors: string[] = [];
    const attempt = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        errors.push(
          `${label}: ${e instanceof GoogleError ? e.message : "Atualização temporariamente indisponível."}`,
        );
      }
    };
    await attempt("Envio", () => pushOutbox(userId, client));
    if (current.connection.scopes.some((s) => s.endsWith("/tasks")))
      await attempt("Tasks", async () => {
        const lists = await client.pages<{ id: string; title: string }>(
          `${tasksBase}/users/@me/lists?maxResults=100`,
          "items",
        );
        const fixed = current.boards.find(
          (b) => b.id === current.preferences.defaultBoardId,
        )?.googleId;
        for (const list of lists.filter((l, index) =>
          fixed ? l.id === fixed : index === 0,
        )) {
          const cursor = current.cursor.tasks?.[list.id];
          const since = new Date(Date.now() - 30000).toISOString();
          const items = await client.pages<GTask>(
            `${taskUrl(list.id)}?maxResults=100&showCompleted=true&showHidden=true&showDeleted=true${cursor ? `&updatedMin=${encodeURIComponent(cursor)}` : ""}`,
            "items",
          );
          await mutateWorkspace(userId, (w) => {
            let board = w.boards.find((b) => b.googleId === list.id);
            if (!board) {
              board = newBoard(crypto.randomUUID(), list.title, list.id);
              w.boards.push(board);
            } else board.title = list.title;
            if (!w.preferences.defaultBoardId)
              w.preferences.defaultBoardId = board.id;
            for (const g of items) {
              const localId = g.notes?.match(/\[Pingo:([^\]]+)\]/)?.[1];
              const creating = localId
                ? w.tasks.find(
                    (t) =>
                      t.id === localId && t.boardId === board.id && !t.googleId,
                  )
                : undefined;
              if (creating) {
                creating.googleId = g.id;
                creating.googleEtag = g.etag;
                creating.googleUpdated = g.updated;
              }
              const old = w.tasks.find(
                (t) => t.googleId === g.id && t.boardId === board.id,
              );
              if (old && g.updated && old.googleUpdated === g.updated) continue;
              mergeGoogleTask(w, board, {
                ...g,
                notes: g.notes?.replace(/\n?\[Pingo:[^\]]+\]/g, ""),
              });
            }
            w.cursor.tasks ??= {};
            w.cursor.tasks[list.id] = since;
            w.revision++;
          });
        }
      });
    if (current.connection.scopes.some((s) => s.endsWith("/calendar.events")))
      await attempt("Agenda", async () => {
        const calendars = current.connection.scopes.some((s) =>
          s.endsWith("/calendar.calendarlist.readonly"),
        )
          ? await client.pages<{
              id: string;
              summary: string;
              accessRole: string;
            }>(
              `${calendarBase}/users/me/calendarList?minAccessRole=reader`,
              "items",
            )
          : [{ id: "primary", summary: "Principal", accessRole: "owner" }];
        await mutateWorkspace(userId, (w) => {
          w.calendars = calendars.map((c) => ({
            id: c.id,
            title: c.summary,
            readOnly: ![
              "owner",
              "writer",
              "writerWithoutPrivateAccess",
            ].includes(c.accessRole),
            holiday: c.id.includes("holiday@"),
          }));
          if (!w.calendars.some((c) => c.holiday))
            w.calendars.push({
              id: "pt.brazilian#holiday@group.v.calendar.google.com",
              title: "Feriados no Brasil",
              readOnly: true,
              holiday: true,
              publicFallback: true,
            });
        });
        for (const cal of calendars) {
          await pullCalendar(userId, client, cal.id);
          await pullOccurrences(userId, client, cal.id);
          try {
            await ensureCalendarWatch(userId, client, cal.id);
          } catch {
            /* Read-only/public calendars remain available through periodic synchronization. */
          }
        }
        const fallback = (await readWorkspace(userId)).calendars.find(
          (c) => c.publicFallback,
        );
        if (fallback) await pullOccurrences(userId, client, fallback.id);
      });
    if (current.connection.scopes.some((s) => s.endsWith("/gmail.readonly")))
      await attempt("Gmail", async () => {
        const bounds = dayBounds(
          zonedParts(new Date(), current.preferences.timezone).date,
          current.preferences.timezone,
        );
        const ids = await client.pages<{ id: string }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=100&q=${encodeURIComponent(`after:${Math.floor(Date.parse(bounds.start) / 1000)} before:${Math.floor(Date.parse(bounds.end) / 1000)}`)}`,
          "messages",
        );
        const mail: Workspace["mail"] = [];
        for (let offset = 0; offset < ids.length; offset += 8) {
          const batch = await Promise.all(
            ids.slice(offset, offset + 8).map(async (m) => {
              const data = await client.request<{
                internalDate: string;
                labelIds?: string[];
                payload?: { headers?: { name: string; value: string }[] };
              }>(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=id,internalDate,labelIds,payload/headers`,
              );
              const h = (name: string) =>
                data.payload?.headers?.find(
                  (h) => h.name.toLowerCase() === name,
                )?.value ?? "";
              return {
                id: m.id,
                from: h("from"),
                subject: h("subject") || "(sem assunto)",
                date: new Date(Number(data.internalDate)).toISOString(),
                isRead: !data.labelIds?.includes("UNREAD"),
              };
            }),
          );
          mail.push(...batch);
        }
        await mutateWorkspace(userId, (w) => {
          w.mail = mail
            .filter((m) => m.date >= bounds.start && m.date < bounds.end)
            .sort((a, b) => b.date.localeCompare(a.date));
          w.notices = w.notices.filter((n) => !n.id.startsWith("mail:"));
          w.cursor.gmail = new Date().toISOString();
        });
      });
    await mutateWorkspace(userId, (w) => {
      reconcileTaskCalendars(w, (kind, entityId, action) => {
        if (
          w.outbox.some(
            (j) =>
              j.kind === kind &&
              j.entityId === entityId &&
              j.state === "uncertain",
          )
        )
          return;
        w.outbox = w.outbox.filter(
          (j) => !(j.kind === kind && j.entityId === entityId),
        );
        w.outbox.push({
          id: crypto.randomUUID(),
          kind,
          entityId,
          action,
          state: "pending",
          attempts: 0,
          nextAttemptAt: new Date().toISOString(),
        });
      });
      w.connection.lastSync = new Date().toISOString();
      w.connection.error = errors.length ? errors.join(" ") : undefined;
      w.revision++;
    });
    await attempt("Envio de vínculos", () => pushOutbox(userId, client));
  } catch (error) {
    await mutateWorkspace(userId, (w) => {
      w.connection.error =
        error instanceof GoogleError
          ? error.message
          : "Não consegui sincronizar agora. Seus dados foram preservados.";
      w.revision++;
    });
  }
  return readWorkspace(userId);
}
async function pullCalendar(
  userId: string,
  client: GoogleClient,
  calId: string,
  reset = false,
) {
  const w = await readWorkspace(userId);
  let page: string | undefined;
  const events: GEvent[] = [];
  let nextToken: string | undefined;
  const syncToken = reset ? undefined : w.cursor.calendar?.[calId];
  try {
    do {
      const params = new URLSearchParams({
        maxResults: "250",
        showDeleted: "true",
      });
      if (syncToken) params.set("syncToken", syncToken);
      if (page) params.set("pageToken", page);
      const data = await client.request<{
        items?: GEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      }>(`${eventUrl(calId)}?${params}`);
      events.push(...(data.items ?? []));
      if (events.length > 10000) throw new Error("Calendar quota");
      page = data.nextPageToken;
      nextToken = data.nextSyncToken;
    } while (page);
  } catch (err) {
    if (err instanceof GoogleError && err.status === 410 && !reset)
      return pullCalendar(userId, client, calId, true);
    throw err;
  }
  await mutateWorkspace(userId, (current) => {
    if (reset) {
      const found = new Set(events.map((e) => e.id));
      for (const e of current.events) {
        if (
          e.calendarId === calId &&
          e.syncState === "synced" &&
          !found.has(e.googleId ?? "")
        ) {
          e.deleted = true;
          e.revision++;
          syncLinkedTask(current, e);
        }
      }
    }
    for (const g of events) {
      const old = current.events.find(
        (e) => e.googleId === g.id && e.calendarId === calId,
      );
      if (old && current.outbox.some((j) => j.entityId === old.id)) {
        if (old.googleEtag !== g.etag) {
          old.syncState = "conflict";
          old.error = "Compromisso alterado no Google. Revise as mudanças.";
        }
        continue;
      }
      if (old && old.googleEtag === g.etag && !old.deleted) continue;
      if (g.status === "cancelled") {
        if (old) {
          old.deleted = true;
          old.revision++;
          syncLinkedTask(current, old);
        }
        continue;
      }
      if (!g.start || !g.end) continue;
      const e: CalendarEvent = {
        ...old,
        id:
          old?.id ??
          (g.recurringEventId
            ? undefined
            : g.extendedProperties?.private?.pingoId) ??
          crypto.randomUUID(),
        title: g.summary ?? "Sem título",
        start: g.start.dateTime ?? g.start.date!,
        end: g.end.dateTime ?? g.end.date!,
        allDay: !!g.start.date,
        calendarId: calId,
        googleId: g.id,
        googleEtag: g.etag,
        recurrence: g.recurrence,
        recurringEventId: g.recurringEventId,
        originalStartTime:
          g.originalStartTime?.dateTime ?? g.originalStartTime?.date,
        attendees: g.attendees?.map((a) => a.email),
        taskId: old?.taskId ?? g.extendedProperties?.private?.pingoTaskId,
        transparent:
          g.transparency === "transparent" ||
          current.calendars.some((c) => c.id === calId && c.holiday),
        revision: (old?.revision ?? 0) + 1,
        syncState: "synced",
        deleted: false,
      };
      const prior = old ? structuredClone(old) : undefined;
      if (old) Object.assign(old, e);
      else current.events.push(e);
      syncLinkedTask(current, e, prior);
      if (old && e.syncState === "conflict") Object.assign(old, e);
    }
    current.cursor.calendar ??= {};
    if (nextToken) current.cursor.calendar[calId] = nextToken;
    current.revision++;
  });
}
async function pullOccurrences(
  userId: string,
  client: GoogleClient,
  calendarId: string,
  start = new Date(Date.now() - 30 * 86400000).toISOString(),
  end = new Date(Date.now() + 90 * 86400000).toISOString(),
) {
  const expanded = await client.pages<GEvent>(
    `${eventUrl(calendarId)}?singleEvents=true&showDeleted=true&maxResults=250&timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}`,
    "items",
  );
  await mutateWorkspace(userId, (w) => {
    const seen = new Set(expanded.map((e) => e.id));
    for (const e of w.events) {
      if (
        e.calendarId === calendarId &&
        e.recurringEventId &&
        Date.parse(
          e.allDay ? dayBounds(e.start, w.preferences.timezone).start : e.start,
        ) >= Date.parse(start) &&
        Date.parse(
          e.allDay ? dayBounds(e.start, w.preferences.timezone).start : e.start,
        ) < Date.parse(end) &&
        !seen.has(e.googleId ?? "") &&
        !w.outbox.some((j) => j.entityId === e.id)
      ) {
        e.deleted = true;
        e.revision++;
      }
    }
    for (const g of expanded) {
      const old = w.events.find(
        (e) => e.calendarId === calendarId && e.googleId === g.id,
      );
      if (old && w.outbox.some((j) => j.entityId === old.id)) continue;
      if (g.status === "cancelled") {
        if (old) {
          old.deleted = true;
          old.revision++;
          syncLinkedTask(w, old);
        }
        continue;
      }
      if (!g.start || !g.end) continue;
      const item: CalendarEvent = {
        ...old,
        id: old?.id ?? crypto.randomUUID(),
        title: g.summary ?? "Sem título",
        start: g.start.dateTime ?? g.start.date!,
        end: g.end.dateTime ?? g.end.date!,
        allDay: !!g.start.date,
        calendarId,
        googleId: g.id,
        googleEtag: g.etag,
        recurringEventId: g.recurringEventId,
        originalStartTime:
          g.originalStartTime?.dateTime ?? g.originalStartTime?.date,
        attendees: g.attendees?.map((a) => a.email),
        taskId: old?.taskId ?? g.extendedProperties?.private?.pingoTaskId,
        transparent:
          g.transparency === "transparent" ||
          w.calendars.some((c) => c.id === calendarId && c.holiday),
        revision:
          old && old.googleEtag === g.etag
            ? old.revision
            : (old?.revision ?? 0) + 1,
        syncState: "synced",
        deleted: false,
      };
      const changed = !old || old.googleEtag !== g.etag;
      const prior = old ? structuredClone(old) : undefined;
      if (old) Object.assign(old, item);
      else w.events.push(item);
      if (changed) syncLinkedTask(w, item, prior);
      if (old && item.syncState === "conflict") Object.assign(old, item);
    }
    w.revision++;
  });
}
async function ensureCalendarWatch(
  userId: string,
  client: GoogleClient,
  calendarId: string,
) {
  const base = process.env.BETTER_AUTH_URL;
  if (!base?.startsWith("https://")) return;
  const existing = await db()
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.userId, userId),
        eq(channels.calendarId, calendarId),
        gt(channels.expiresAt, new Date(Date.now() + 12 * 3600000)),
      ),
    );
  if (existing.length) return;
  const id = crypto.randomUUID(),
    token = randomBytes(32).toString("base64url");
  const response = await client.request<{
    resourceId: string;
    expiration: string;
  }>(`${eventUrl(calendarId)}/watch`, {
    method: "POST",
    body: JSON.stringify({
      id,
      type: "web_hook",
      address: `${base}/api/v1/google/calendar-hook`,
      token,
      expiration: String(Date.now() + 48 * 3600000),
    }),
  });
  await db()
    .insert(channels)
    .values({
      id,
      userId,
      calendarId,
      resourceId: response.resourceId,
      tokenHash: digest(token),
      expiresAt: new Date(Number(response.expiration)),
    });
}

export async function calendarRange(
  userId: string,
  start: string,
  end: string,
) {
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 370 * 86400000
  )
    throw new Error("Período inválido (máximo 370 dias).");
  const w = await readWorkspace(userId);
  if (w.connection.connected) {
    const client = new GoogleClient(await googleToken(userId));
    for (const cal of w.calendars)
      await pullOccurrences(userId, client, cal.id, start, end);
  }
  return (await readWorkspace(userId)).events.filter(
    (e) =>
      !e.deleted &&
      !e.recurrence &&
      (e.allDay
        ? e.start < zonedParts(new Date(end), w.preferences.timezone).date &&
          e.end > zonedParts(new Date(start), w.preferences.timezone).date
        : Date.parse(e.start) < Date.parse(end) &&
          Date.parse(e.end) > Date.parse(start)),
  );
}
