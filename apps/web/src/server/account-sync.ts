import {
  dayBounds,
  DomainError,
  type CalendarEvent,
  type Workspace,
} from "@pingo/core";
import { readWorkspace } from "./workspace";

/** Cloud sync transports Pingo data only. No external calendar or mailbox is consulted. */
export async function syncAccount(userId: string): Promise<Workspace> {
  return readWorkspace(userId);
}
export async function calendarRange(
  userId: string,
  start: string,
  end: string,
): Promise<CalendarEvent[]> {
  if (
    !Number.isFinite(Date.parse(start)) ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 370 * 86400000
  )
    throw new DomainError("range", "Escolha um período de até um ano.", 400);
  const w = await readWorkspace(userId);
  return w.events.filter((e) => {
    if (e.deleted || e.recurrence) return false;
    const from = e.allDay
      ? dayBounds(e.start, w.preferences.timezone).start
      : e.start;
    const to = e.allDay
      ? dayBounds(e.end, w.preferences.timezone).start
      : e.end;
    return (
      Date.parse(from) < Date.parse(end) && Date.parse(to) > Date.parse(start)
    );
  });
}
