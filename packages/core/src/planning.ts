import { TZDate } from "@date-fns/tz";
import type { Workspace, Task, CalendarEvent, Notice } from "./index";

export const pastelColors = [
  "#f9d8d8",
  "#fbdccd",
  "#fbe4c9",
  "#f9ebc9",
  "#f4efcd",
  "#e8efcf",
  "#dceccb",
  "#cfe9d6",
  "#c8e8de",
  "#c7e8e7",
  "#cceaf1",
  "#cfe4f7",
  "#d4dff7",
  "#dddafa",
  "#e7d9f8",
  "#efdcf6",
  "#f4daf0",
  "#f9dbeb",
  "#f8e0e6",
  "#eddfd7",
  "#e7e2d8",
  "#dce6e1",
  "#dce3ed",
  "#e5dff0",
];
export function localDay(value: string, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function zonedDateTime(day: string, time: string, zone: string) {
  const [y, m, d] = day.split("-").map(Number),
    [h, min] = time.split(":").map(Number);
  const value = new TZDate(y, m - 1, d, h, min, 0, zone);
  if (
    value.getFullYear() !== y ||
    value.getMonth() !== m - 1 ||
    value.getDate() !== d ||
    value.getHours() !== h ||
    value.getMinutes() !== min
  )
    throw new Error(
      "Esse horário não existe no fuso escolhido. Selecione outro horário.",
    );
  return new Date(+value).toISOString();
}
export function nextDay(day: string) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function taskScheduleKey(t: Task) {
  return normalizeScheduleKey(
    `${t.scheduledStart ?? ""}|${t.scheduledEnd ?? ""}`,
  );
}
export function normalizeScheduleKey(key: string) {
  return key
    .split("|")
    .map((s) =>
      Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : s,
    )
    .join("|");
}
export function taskIsLate(t: Task, today: string, now = Date.now()) {
  return (
    !t.completed &&
    (!!t.scheduledEnd
      ? Date.parse(t.scheduledEnd) < now
      : !!t.dueDate && t.dueDate < today)
  );
}
export function taskOnDay(t: Task, today: string, zone: string) {
  if (t.deleted || t.archivedAt) return false;
  if (t.completed)
    return !!t.completedAt && localDay(t.completedAt, zone) === today;
  if (!t.dueDate) return false;
  if (t.dueDate <= today) return true;
  return (
    !!t.scheduledStart &&
    !!t.scheduledEnd &&
    localDay(t.scheduledStart, zone) <= today &&
    localDay(t.scheduledEnd, zone) >= today
  );
}
export function mirrorId(id: string) {
  let out = "";
  for (let salt = 0; salt < 4; salt++) {
    let h = 2166136261 ^ (salt * 0x9e3779b9);
    for (const c of `pingo-calendar:${id}`) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}
type Enqueue = (
  kind: "task" | "event",
  id: string,
  action: "upsert" | "delete",
) => void;
/** Stable linked events; transporting either resource never creates another logical task. */
export function reconcileTaskCalendars(
  w: Workspace,
  enqueue: Enqueue,
  now = new Date().toISOString(),
) {
  for (const t of w.tasks) {
    let e = w.events.find((e) => e.taskId === t.id && !e.deleted);
    if (
      e &&
      w.outbox.some((j) => j.entityId === e!.id && j.state === "uncertain")
    )
      continue;
    if (t.deleted) {
      if (e) {
        e.deleted = true;
        e.revision++;
        e.syncState = "pending";
        enqueue("event", e.id, "delete");
      }
      continue;
    }
    if (!t.dueDate || t.calendarSuppressed) continue;
    if (t.syncState === "conflict" || e?.syncState === "conflict") continue;
    const allDay = !t.scheduledStart;
    if (
      !allDay &&
      localDay(t.scheduledStart!, w.preferences.timezone) !== t.dueDate
    ) {
      const local = new Intl.DateTimeFormat("en-GB", {
        timeZone: w.preferences.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(t.scheduledStart!));
      const duration = Math.max(
        60000,
        Date.parse(t.scheduledEnd ?? "") - Date.parse(t.scheduledStart!) ||
          1800000,
      );
      t.scheduledStart = zonedDateTime(
        t.dueDate,
        local,
        w.preferences.timezone,
      );
      t.scheduledEnd = new Date(
        Date.parse(t.scheduledStart) + duration,
      ).toISOString();
      t.checkIn = undefined;
      t.actualStartedAt = null;
    }
    const start = allDay ? t.dueDate : t.scheduledStart!;
    const end = allDay
      ? nextDay(t.dueDate)
      : (t.scheduledEnd ?? new Date(Date.parse(start) + 1800000).toISOString());
    if (!allDay) t.scheduledEnd = end;
    const title = `${t.completed ? "✓ " : ""}${t.title}`;
    if (!e) {
      const prior = w.events.find((e) => e.id === mirrorId(t.id));
      if (prior?.deleted && prior.googleId) {
        t.calendarSuppressed = true;
        continue;
      }
      e = {
        id: mirrorId(t.id),
        taskId: t.id,
        title,
        start,
        end,
        allDay,
        calendarId: w.preferences.defaultCalendarId || "primary",
        revision: (prior?.revision ?? 0) + 1,
        syncState: "pending",
      };
      w.events = w.events.filter((x) => x.id !== e!.id).concat(e);
      enqueue("event", e.id, "upsert");
    } else if (
      e.title !== title ||
      (allDay
        ? e.start !== start
        : Date.parse(e.start) !== Date.parse(start)) ||
      (allDay ? e.end !== end : Date.parse(e.end) !== Date.parse(end)) ||
      e.allDay !== allDay
    ) {
      Object.assign(e, {
        title,
        start,
        end,
        allDay,
        revision: e.revision + 1,
        syncState: "pending",
      });
      enqueue("event", e.id, "upsert");
    }
  }
}
export function eventIsHoliday(w: Workspace, e: CalendarEvent) {
  return !!w.calendars.find((c) => c.id === e.calendarId)?.holiday;
}
export type CheckInPhase = "before" | "start" | "end" | "repeat" | "snooze";
export type TaskAlarm = {
  id: string;
  taskId: string;
  phase: CheckInPhase;
  snoozePhase?: string;
  scheduleKey: string;
  dueAt: number;
  expiresAt: number;
  title: string;
  body: string;
};
export function taskAlarms(
  w: Workspace,
  userId: string,
  now = Date.now(),
): TaskAlarm[] {
  if (w.preferences.taskCheckIns === false) return [];
  const result: TaskAlarm[] = [];
  for (const t of w.tasks) {
    if (
      t.deleted ||
      t.completed ||
      t.archivedAt ||
      !t.scheduledStart ||
      !t.scheduledEnd ||
      t.calendarSuppressed
    )
      continue;
    const start = Date.parse(t.scheduledStart),
      end = Date.parse(t.scheduledEnd),
      key = taskScheduleKey(t),
      check =
        t.checkIn && normalizeScheduleKey(t.checkIn.key) === key
          ? t.checkIn
          : undefined;
    if (start > now + 7 * 86400000 || end + 30 * 60000 < now) continue;
    const push = (
      phase: CheckInPhase,
      due: number,
      expiry: number,
      body: string,
    ) => {
      if (expiry <= now) return;
      const n = {
        id: `task:${userId}:${t.id}:${key}:${phase}${phase === "snooze" ? `:${check?.snoozeAt}` : ""}`,
        taskId: t.id,
        phase,
        snoozePhase: phase === "snooze" ? check?.snoozePhase : undefined,
        scheduleKey: key,
        dueAt: due,
        expiresAt: expiry,
        title: t.title,
        body,
      };
      if (!w.notices.some((x) => x.id === n.id)) result.push(n);
    };
    const started =
      !!t.actualStartedAt && Date.parse(t.actualStartedAt) >= start - 86400000;
    if (!started && !check?.snoozeAt) {
      push(
        "before",
        start - w.preferences.reminderMinutes * 60000,
        start,
        `“${t.title}” começa em breve.`,
      );
      push(
        "start",
        start,
        Math.min(end, start + 30 * 60000),
        `É hora de “${t.title}”. Vamos começar?`,
      );
    }
    if (!check?.endAnswered) {
      push("end", end, end + 10 * 60000, `Deu tempo de concluir “${t.title}”?`);
      push(
        "repeat",
        end + 10 * 60000,
        end + 30 * 60000,
        `Só passando uma vez: gostaria de concluir “${t.title}”?`,
      );
    }
    if (check?.snoozeAt)
      push(
        "snooze",
        Date.parse(check.snoozeAt),
        Date.parse(check.snoozeAt) + 15 * 60000,
        `Vamos retomar “${t.title}”?`,
      );
  }
  return result;
}
export function taskAlarmNotice(a: TaskAlarm, now = new Date()): Notice {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    taskId: a.taskId,
    phase: a.phase,
    snoozePhase: a.snoozePhase,
    scheduleKey: a.scheduleKey,
    expiresAt: a.expiresAt,
    createdAt: now.toISOString(),
    read: false,
  };
}
