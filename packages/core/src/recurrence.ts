import { z } from "zod";
import type { Workspace, Task } from "./index";
import { nextDay, zonedDateTime, localDay } from "./planning";
export const repetitionSchema = z
  .object({
    kind: z.enum(["daily", "weekly", "monthly", "interval"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([1]),
    monthDays: z.array(z.number().int().min(1).max(31)).max(31).default([1]),
    lastDay: z.boolean().default(false),
    interval: z.number().int().min(1).max(3650).default(1),
    until: z.iso.date().nullable().default(null),
    count: z.number().int().min(1).max(10000).nullable().default(null),
  })
  .refine(
    (r) => r.kind !== "weekly" || r.weekdays.length > 0,
    "Escolha pelo menos um dia da semana.",
  )
  .refine(
    (r) => r.kind !== "monthly" || r.monthDays.length > 0 || r.lastDay,
    "Escolha pelo menos um dia do mês.",
  );
export type Repetition = z.infer<typeof repetitionSchema>;
export type TaskSeries = {
  routineId?: string;
  deleted?: boolean;
  id: string;
  revision: number;
  start: string;
  end?: string;
  rule: Repetition;
  timezone: string;
  template: Task;
  exclusions?: string[];
  pauses: { start: string; end?: string }[];
};
const dateValue = (d: string) => Date.parse(d + "T12:00:00Z");
export function previousDay(d: string) {
  return new Date(dateValue(d) - 86400000).toISOString().slice(0, 10);
}
export function occurrenceDates(series: TaskSeries, through: string): string[] {
  if (series.deleted) return [];
  const r = series.rule,
    result: string[] = [];
  const end = [through, series.end, r.until]
    .filter((x): x is string => !!x)
    .sort()[0];
  let count = 0,
    scanned = 0;
  for (
    let day = series.start;
    day <= end && scanned < 366000;
    day = nextDay(day), scanned++
  ) {
    const d = new Date(dateValue(day)),
      n = d.getUTCDate(),
      last = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate();
    const matches =
      r.kind === "daily" ||
      (r.kind === "weekly" && r.weekdays.includes(d.getUTCDay())) ||
      (r.kind === "interval" &&
        Math.round((dateValue(day) - dateValue(series.start)) / 86400000) %
          r.interval ===
          0) ||
      (r.kind === "monthly" &&
        ((r.lastDay && n === last) ||
          r.monthDays.some((x) => Math.min(x, last) === n)));
    if (!matches) continue;
    if (series.exclusions?.includes(day)) continue;
    if (series.pauses.some((p) => day >= p.start && (!p.end || day <= p.end)))
      continue;
    if (r.count && ++count > r.count) break;
    result.push(day);
  }
  return result;
}
export function materializeSeries(
  w: Workspace,
  through?: string,
  now = new Date(),
  from?: string,
) {
  const horizon =
    through ??
    new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const ids = new Set(w.tasks.map((t) => t.id));
  for (const series of w.taskSeries ?? []) {
    for (const date of occurrenceDates(series, horizon)) {
      if (from && date < from) continue;
      const id = `${series.id}@${date}`;
      if (ids.has(id)) continue;
      const source = series.template;
      let scheduledStart: string | null = null,
        scheduledEnd: string | null = null;
      if (source.scheduledStart && source.scheduledEnd) {
        const clock = (v: string) =>
          new Intl.DateTimeFormat("en-GB", {
            timeZone: series.timezone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(new Date(v));
        try {
          scheduledStart = zonedDateTime(
            date,
            clock(source.scheduledStart),
            series.timezone,
          );
          const days = Math.round(
            (dateValue(localDay(source.scheduledEnd, series.timezone)) -
              dateValue(localDay(source.scheduledStart, series.timezone))) /
              86400000,
          );
          const endDate = new Date(dateValue(date) + days * 86400000)
            .toISOString()
            .slice(0, 10);
          scheduledEnd = zonedDateTime(
            endDate,
            clock(source.scheduledEnd),
            series.timezone,
          );
        } catch {
          // A daylight-saving gap moves this occurrence to the next valid local hour.
          const hour = Number(clock(source.scheduledStart).slice(0, 2));
          scheduledStart = zonedDateTime(
            date,
            `${String(Math.min(23, hour + 1)).padStart(2, "0")}:00`,
            series.timezone,
          );
          scheduledEnd = new Date(
            Date.parse(scheduledStart) +
              Date.parse(source.scheduledEnd) -
              Date.parse(source.scheduledStart),
          ).toISOString();
        }
      }
      const column = w.boards
        .find((b) => b.id === source.boardId)
        ?.columns.find((c) => c.kind === "todo");
      w.tasks.push({
        ...structuredClone(source),
        id,
        seriesId: series.id,
        occurrenceDate: date,
        dueDate: date,
        scheduledStart,
        scheduledEnd,
        columnId: column?.id ?? source.columnId,
        completed: false,
        completedAt: null,
        actualStartedAt: null,
        checkIn: undefined,
        checklist: source.checklist?.map((c) => ({ ...c, done: false })),
        revision: 0,
        syncState: "pending",
        deleted: false,
        archivedAt: null,
      });
      ids.add(id);
    }
  }
}
