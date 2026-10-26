import { offlineSummaries } from "./offline";
import { taskAlarms } from "./planning";
import type { Workspace } from "./index";
export type LocalReminder = {
  noticeId: string;
  eventId: string;
  title: string;
  startAt: number;
  dueAt: number;
  body?: string;
  expiresAt?: number;
  summary?: boolean;
  taskId?: string;
  phase?: string;
  snoozePhase?: string;
  scheduleKey?: string;
  taskRevision?: number;
};
export function deviceReminderPlan(
  w: Workspace,
  userId: string,
  now = Date.now(),
) {
  const reminders: LocalReminder[] = w.events
    .filter(
      (e) =>
        !e.deleted &&
        !e.allDay &&
        !e.recurrence &&
        !(e.taskId && w.preferences.taskCheckIns !== false) &&
        Date.parse(e.start) > now &&
        Date.parse(e.start) <= now + 7 * 86400000,
    )
    .map((e) => ({
      noticeId: `reminder:${userId}:${e.id}:${e.start}`,
      eventId: e.id,
      title: e.title,
      startAt: Date.parse(e.start),
      dueAt: Date.parse(e.start) - w.preferences.reminderMinutes * 60000,
    }));
  reminders.push(...offlineSummaries(w, userId, now));
  reminders.push(
    ...taskAlarms(w, userId, now).map((a) => ({
      noticeId: a.id,
      eventId:
        w.events.find((e) => e.taskId === a.taskId && !e.deleted)?.id ?? "",
      taskId: a.taskId,
      phase: a.phase,
      snoozePhase: a.snoozePhase,
      scheduleKey: a.scheduleKey,
      taskRevision: w.tasks.find((t) => t.id === a.taskId)?.revision,
      body: a.body,
      title: a.title,
      dueAt: a.dueAt,
      startAt: a.expiresAt,
      expiresAt: a.expiresAt,
    })),
  );
  return {
    userId,
    timezone: w.preferences.timezone,
    quietStart: w.preferences.quietStart,
    quietEnd: w.preferences.quietEnd,
    reminders: reminders.sort((a, b) => a.dueAt - b.dueAt).slice(0, 1000),
  };
}
