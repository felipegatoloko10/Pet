import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { addMinutes, addDays } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { dailySummary, isQuiet, zonedParts, type Workspace } from "@pingo/core";
import { db } from "./db";
import { subscriptions } from "./schema";
import { mutateWorkspace, readWorkspace } from "./workspace";
import { syncGoogle } from "./sync";
import { maybeProactive } from "./ai";
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
    body: JSON.stringify({ userId, jobs: jobsFor(userId, w) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("O agendador não confirmou os trabalhos.");
}
export async function processJob(job: Job) {
  if (job.kind === "routine") {
    const prior = await readWorkspace(job.userId);
    const { time } = zonedParts(new Date(), prior.preferences.timezone);
    if (!isQuiet(new Date(), prior.preferences)) await syncGoogle(job.userId);
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
  return jobsFor(job.userId, w);
}
async function sendPush(userId: string, w: Workspace) {
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_PUBLIC_KEY) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const subs = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  for (const notice of w.notices.filter((n) => !n.read && !n.deliveredBy)) {
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          sub.data as webpush.PushSubscription,
          JSON.stringify(notice),
          {
            TTL: 1800,
            topic: Buffer.from(notice.id).toString("base64url").slice(0, 32),
          },
        );
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
      }
    }
  }
}
