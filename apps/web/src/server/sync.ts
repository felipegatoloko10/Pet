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
type GTask = {
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
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  status?: string;
  etag?: string;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: { pingoId?: string } };
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
          extendedProperties: { private: { pingoId: e!.id } },
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
      current.outbox = current.outbox.filter((j) => j.id !== job.id);
      notice(
        current,
        `sync:${job.id}`,
        job.kind === "task" ? "Google Tasks atualizado" : "Agenda atualizada",
        job.action === "delete"
          ? "Exclusão confirmada pelo Google."
          : job.kind === "task"
            ? `Confirmei “${i.title}” no Google Tasks.`
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
    await pushOutbox(userId, client);
    if (current.connection.scopes.some((s) => s.endsWith("/tasks"))) {
      const lists = await client.pages<{ id: string; title: string }>(
        `${tasksBase}/users/@me/lists?maxResults=100`,
        "items",
      );
      for (const list of lists) {
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
    }
    if (current.connection.scopes.some((s) => s.endsWith("/calendar.events"))) {
      const calendars = await client.pages<{
        id: string;
        summary: string;
        accessRole: string;
      }>(`${calendarBase}/users/me/calendarList?minAccessRole=writer`, "items");
      await mutateWorkspace(userId, (w) => {
        w.calendars = calendars.map((c) => ({ id: c.id, title: c.summary }));
      });
      for (const cal of calendars) {
        await pullCalendar(userId, client, cal.id);
        await pullOccurrences(userId, client, cal.id);
        await ensureCalendarWatch(userId, client, cal.id);
      }
    }
    if (current.connection.scopes.some((s) => s.endsWith("/gmail.readonly"))) {
      const list = await client.request<{ messages?: { id: string }[] }>(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&labelIds=UNREAD&maxResults=15",
      );
      const mail = await Promise.all(
        (list.messages ?? []).map(async (m) => {
          const data = await client.request<{
            payload?: { headers?: { name: string; value: string }[] };
          }>(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          );
          const h = (name: string) =>
            data.payload?.headers?.find((h) => h.name.toLowerCase() === name)
              ?.value ?? "";
          return {
            id: m.id,
            from: h("from"),
            subject: h("subject") || "(sem assunto)",
            date: h("date"),
            url: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
          };
        }),
      );
      await mutateWorkspace(userId, (w) => {
        for (const m of mail)
          if (w.cursor.gmail && !w.mail.some((x) => x.id === m.id))
            notice(w, `mail:${m.id}`, "Novo e-mail", `${m.from}: ${m.subject}`);
        w.mail = mail;
        w.cursor.gmail = new Date().toISOString();
      });
    }
    await mutateWorkspace(userId, (w) => {
      w.connection.lastSync = new Date().toISOString();
      w.connection.error = undefined;
      w.revision++;
    });
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
    if (reset)
      current.events = current.events.filter(
        (e) => e.calendarId !== calId || e.syncState !== "synced",
      );
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
      if (old?.googleEtag === g.etag) continue;
      if (g.status === "cancelled") {
        if (old) {
          old.deleted = true;
          old.revision++;
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
        revision: (old?.revision ?? 0) + 1,
        syncState: "synced",
      };
      if (old) Object.assign(old, e);
      else current.events.push(e);
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
) {
  const start = new Date(Date.now() - 30 * 86400000).toISOString(),
    end = new Date(Date.now() + 90 * 86400000).toISOString();
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
        e.start >= start &&
        e.start < end &&
        !seen.has(e.googleId ?? "") &&
        !w.outbox.some((j) => j.entityId === e.id)
      ) {
        e.deleted = true;
        e.revision++;
      }
    }
    for (const g of expanded) {
      if (!g.recurringEventId) continue;
      const old = w.events.find(
        (e) => e.calendarId === calendarId && e.googleId === g.id,
      );
      if (old && w.outbox.some((j) => j.entityId === old.id)) continue;
      if (g.status === "cancelled") {
        if (old) old.deleted = true;
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
        revision:
          old && old.googleEtag === g.etag
            ? old.revision
            : (old?.revision ?? 0) + 1,
        syncState: "synced",
        deleted: false,
      };
      if (old) Object.assign(old, item);
      else w.events.push(item);
    }
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
export async function getMailBody(userId: string, id: string) {
  const w = await readWorkspace(userId);
  if (!w.mail.some((m) => m.id === id))
    throw new Error("Mensagem não encontrada nesta conta.");
  const client = new GoogleClient(await googleToken(userId));
  type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
  const data = await client.request<{ payload?: Part }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
  );
  function plain(p: Part): string {
    return p.mimeType === "text/plain" && p.body?.data
      ? Buffer.from(p.body.data, "base64url").toString("utf8")
      : (p.parts ?? []).map(plain).join("\n");
  }
  return plain(data.payload ?? {}).slice(0, 30000);
}
