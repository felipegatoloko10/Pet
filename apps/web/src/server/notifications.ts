import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { addMinutes, addDays } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { dailySummary, isQuiet, zonedParts, type Workspace } from "@pingo/core";
import { db } from "./db";
import { subscriptions } from "./schema";
import { mutateWorkspace, readWorkspace } from "./workspace";
import { syncGoogle, calendarRange } from "./sync";
import { maybeProactive } from "./ai";
import { digest } from "./crypto";
export type Job = {
  id: string;
  userId: string;
  kind: "routine" | "reminder";
  dueAt: number;
  entityId?: string;
};
export function nextSummary(w: Workspace, now = new Date()) {
  return nextWallTime(w.preferences.summaryTime, w.preferences.timezone, now);
}
function nextWallTime(time: string, timezone: string, now: Date) {
  const [h, m] = time.split(":").map(Number);
  const local = TZDate.tz(timezone, now);
  let next = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    h,
    m,
    0,
    timezone,
  );
  if (+next <= +now) next = addDays(next, 1) as TZDate;
  return +next;
}
export function jobsFor(userId: string, w: Workspace): Job[] {
  const now = Date.now();
  return [
    {
      id: `routine:${userId}`,
      userId,
      kind: "routine",
      dueAt: isQuiet(new Date(now), w.preferences)
        ? Math.min(
            nextSummary(w),
            nextWallTime(
              w.preferences.quietEnd,
              w.preferences.timezone,
              new Date(now),
            ),
          )
        : Math.min(nextSummary(w), now + 15 * 60000),
    },
    ...w.events
      .filter(
        (e) =>
          !e.deleted && !e.allDay && !e.recurrence && Date.parse(e.start) > now,
      )
      .filter(
        (e) =>
          !w.notices.some(
            (n) => n.id === `reminder:${userId}:${e.id}:${e.start}`,
          ),
      )
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .slice(0, 900)
      .map((e) => ({
        id: `reminder:${userId}:${e.id}:${e.start}`,
        userId,
        kind: "reminder" as const,
        entityId: e.id,
        dueAt: Math.max(
          now,
          Date.parse(e.start) - w.preferences.reminderMinutes * 60000,
        ),
      })),
  ];
}
export async function indexJobs(userId: string, w: Workspace) {
  if (!process.env.SCHEDULER_URL) return;
  const response = await fetch(`${process.env.SCHEDULER_URL}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SCHEDULER_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, revision: w.revision, jobs: jobsFor(userId, w) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("O agendador não confirmou os trabalhos.");
}
export async function processJob(job: Job) {
  if (job.kind === "routine") {
    const prior = await readWorkspace(job.userId);
    if (!isQuiet(new Date(), prior.preferences)) {
      await syncGoogle(job.userId);
      // Recurring instances must be available even when nobody opens the calendar UI.
      try {
        await calendarRange(job.userId, new Date().toISOString(), new Date(Date.now() + 48 * 3600000).toISOString());
      } catch {
        await mutateWorkspace(job.userId, w => {
          w.connection.error = "Não consegui atualizar as ocorrências da agenda. Vou tentar novamente.";
          w.revision++;
        });
      }
    }
  }
  await mutateWorkspace(job.userId, (w) => {
    const now = new Date();
    const { date, time } = zonedParts(now, w.preferences.timezone);
    const event = w.events.find((e) => e.id === job.entityId && !e.deleted);
    const summaryId = `summary:${date}`;
    if (
      job.kind === "routine" &&
      time >= w.preferences.summaryTime &&
      !w.notices.some((n) => n.id === summaryId)
    )
      w.notices.unshift({
        id: summaryId,
        title: `Bom dia! Eu sou ${w.preferences.name}.`,
        body: dailySummary(w, now),
        createdAt: now.toISOString(),
        read: false,
        silent: isQuiet(now, w.preferences),
      });
    if (
      event &&
      job.kind === "reminder" &&
      job.id === `reminder:${job.userId}:${event.id}:${event.start}` &&
      !event.allDay && !event.recurrence &&
      Date.parse(event.start) - w.preferences.reminderMinutes * 60000 <= Date.now() &&
      Date.parse(event.start) > Date.now() &&
      !w.notices.some((n) => n.id === job.id)
    )
      w.notices.unshift({
        id: job.id,
        title: event.title,
        body: `Começa em ${Math.max(0, Math.round((Date.parse(event.start) - Date.now()) / 60000))} minutos.`,
        createdAt: now.toISOString(),
        read: false,
        silent: isQuiet(now, w.preferences),
      });
    w.notices = w.notices.slice(0, 200);
    w.revision++;
  });
  if (job.kind === "routine") await maybeProactive(job.userId);
  const w = await readWorkspace(job.userId);
  await sendPush(job.userId, w);
  await indexJobs(job.userId, w);
  return jobsFor(job.userId, w);
}
async function sendPush(userId: string, w: Workspace) {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) return;
  // Do not replay a backlog of old notices when cloud scheduling is first enabled.
  const candidates = w.notices.filter(n => !n.read && !n.deliveredBy && Date.parse(n.createdAt) >= Date.now() - 1800000);
  if (!candidates.length) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const subs = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  let retry = false;
  for (const notice of candidates) {
    for (const sub of subs) {
      if (w.cursor.push?.[notice.id]?.[sub.id]?.sent) continue;
      const lease = crypto.randomUUID();
      const claimed = await mutateWorkspace(userId, current => {
        const n = current.notices.find(n => n.id === notice.id);
        if (!n || n.read || n.deliveredBy) return null;
        const ledger = current.cursor.push ??= {};
        for (const id of Object.keys(ledger))
          if (!current.notices.some(n => n.id === id && Date.parse(n.createdAt) >= Date.now() - 1800000)) delete ledger[id];
        const deliveries = ledger[n.id] ??= {};
        const prior = deliveries[sub.id];
        if (prior?.sent || (prior && prior.until > Date.now())) return null;
        deliveries[sub.id] = { lease, until: Date.now() + 120000 };
        return { ...n, silent: n.silent || isQuiet(new Date(), current.preferences) };
      });
      if (!claimed) continue;
      try {
        await webpush.sendNotification(
          sub.data as webpush.PushSubscription,
          JSON.stringify(claimed),
          {
            TTL: 1800,
            timeout: 10000,
            topic: digest(notice.id).slice(0, 32),
          },
        );
        await mutateWorkspace(userId, current => {
          const delivery = current.cursor.push?.[notice.id]?.[sub.id];
          if (delivery?.lease === lease) delivery.sent = true;
        });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410)
          await db()
            .delete(subscriptions)
            .where(
              and(
                eq(subscriptions.id, sub.id),
                eq(subscriptions.userId, userId),
              ),
            );
        else retry = true;
        await mutateWorkspace(userId, current => {
          const deliveries = current.cursor.push?.[notice.id];
          if (deliveries?.[sub.id]?.lease === lease) delete deliveries[sub.id];
        });
      }
    }
  }
  if (retry) throw new Error("Não foi possível confirmar todas as entregas push.");
}
