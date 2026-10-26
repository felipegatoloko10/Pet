import { useEffect, useState } from "react";
import {
  addDays,
  addMonths,
  addYears,
  format,
  startOfWeek,
  endOfMonth,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  dayBounds,
  eventOnDate,
  zonedParts,
  type CalendarEvent,
  type Workspace,
} from "@pingo/core";
import type { PingoClient } from "./client";
type View = "day" | "week" | "month" | "year";
const key = (d: Date) => format(d, "yyyy-MM-dd");
const civil = (date: string) => new Date(date + "T12:00:00");
export function Calendar({
  w,
  client,
  onEdit,
  onTaskEdit,
}: {
  w: Workspace;
  client: PingoClient;
  onEdit: (e: Partial<CalendarEvent>) => void;
  onTaskEdit?: (t: import("@pingo/core").Task) => void;
}) {
  const today = zonedParts(new Date(), w.preferences.timezone).date;
  const [date, setDate] = useState(today),
    [view, setView] = useState<View>("week"),
    [extra, setExtra] = useState<CalendarEvent[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const d = civil(date),
    start =
      view === "year"
        ? `${d.getFullYear()}-01-01`
        : view === "month"
          ? key(startOfWeek(startOfMonth(d), { weekStartsOn: 1 }))
          : view === "week"
            ? key(startOfWeek(d, { weekStartsOn: 1 }))
            : date;
  const end =
    view === "year"
      ? `${d.getFullYear() + 1}-01-01`
      : view === "month"
        ? key(addDays(startOfWeek(endOfMonth(d), { weekStartsOn: 1 }), 7))
        : key(addDays(civil(start), view === "week" ? 7 : 1));
  useEffect(() => {
    let live = true;
    const cacheKey = `calendar:${start}:${end}:${w.preferences.timezone}`;
    setError("");
    setLoading(true);
    void (async () => {
      try {
        const cached = await client.storage.get(cacheKey);
        if (live) setExtra(cached ? JSON.parse(cached) : []);
        if (client.demo || w.storageMode === "pingo") return;
        if (!navigator.onLine) {
          if (!cached)
            throw new Error(
              "Sem internet: este período ainda não foi carregado por completo.",
            );
          setError("Exibindo a última cópia deste período, sem internet.");
          return;
        }
        const from = dayBounds(start, w.preferences.timezone).start,
          to = dayBounds(end, w.preferences.timezone).start;
        const r = await client.api.request<{ events: CalendarEvent[] }>(
          `calendar/range?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`,
        );
        await client.storage.set(cacheKey, JSON.stringify(r.events));
        if (live) setExtra(r.events);
        if (live) await client.refresh();
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [client, start, end, w.preferences.timezone]);
  const merged = new Map(w.events.map((e) => [e.id, e]));
  for (const e of extra)
    if (!merged.has(e.id) || merged.get(e.id)!.revision < e.revision)
      merged.set(e.id, e);
  const holidayKeys = new Set<string>();
  const events = [...merged.values()].filter((e) => {
    if (e.deleted || e.recurrence) return false;
    if (!w.calendars.some((c) => c.id === e.calendarId && c.holiday))
      return true;
    const key = `${e.title.trim().toLocaleLowerCase("pt-BR")}:${e.allDay ? e.start : zonedParts(new Date(e.start), w.preferences.timezone).date}`;
    if (holidayKeys.has(key)) return false;
    holidayKeys.add(key);
    return true;
  });
  const onDay = (date: string) =>
    events
      .filter((e) => eventOnDate(e, date, w.preferences.timezone))
      .sort((a, b) => a.start.localeCompare(b.start));
  const openEvent = (e: CalendarEvent) => {
    const t = e.taskId && w.tasks.find((t) => t.id === e.taskId && !t.deleted);
    if (t && onTaskEdit) onTaskEdit(t);
    else onEdit(e);
  };
  const change = (direction: number) =>
    setDate(
      key(
        view === "year"
          ? addYears(d, direction)
          : view === "month"
            ? addMonths(d, direction)
            : addDays(d, direction * (view === "week" ? 7 : 1)),
      ),
    );
  const openDay = (date: string) => {
    setDate(date);
    setView("day");
  };
  function monthGrid(month: Date, mini = false) {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    return (
      <div className={mini ? "mini-month-grid" : "month-grid"}>
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label) => (
          <span key={label} className="weekday">
            {label}
          </span>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const day = addDays(first, i),
            dayKey = key(day),
            items = onDay(dayKey);
          return (
            <div
              key={dayKey}
              className={`month-cell ${day.getMonth() !== month.getMonth() ? "outside" : ""} ${dayKey === today ? "is-today" : ""}`}
            >
              <button
                className="day-number"
                aria-label={`Ver dia ${dayKey}${items.length ? `, ${items.length} compromissos` : ""}`}
                onClick={() => openDay(dayKey)}
              >
                {day.getDate()}
                {mini && !!items.length && <span className="busy-dot" />}
              </button>
              {!mini &&
                items.slice(0, 3).map((e) => (
                  <button
                    className="month-event"
                    key={e.id}
                    onClick={() => openEvent(e)}
                  >
                    {e.allDay
                      ? "Dia inteiro"
                      : new Intl.DateTimeFormat("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: w.preferences.timezone,
                        }).format(new Date(e.start))}{" "}
                    {e.title}
                  </button>
                ))}
              {!mini && items.length > 3 && (
                <button className="text-link" onClick={() => openDay(dayKey)}>
                  +{items.length - 3} compromissos
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TEMPO PARA O QUE IMPORTA</div>
          <h1>
            Abra espaço no <em>seu dia.</em>
          </h1>
        </div>
        <button className="button primary" onClick={() => onEdit({})}>
          ＋ Novo compromisso
        </button>
      </div>
      <div className="calendar-toolbar">
        <div>
          <button
            className="icon-button"
            aria-label="Período anterior"
            onClick={() => change(-1)}
          >
            ‹
          </button>
          <h2>
            {view === "year"
              ? d.getFullYear()
              : format(d, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <button
            className="icon-button"
            aria-label="Próximo período"
            onClick={() => change(1)}
          >
            ›
          </button>
          <button className="button small" onClick={() => setDate(today)}>
            Hoje
          </button>
        </div>
        <div className="segmented">
          {(
            [
              ["day", "Dia"],
              ["week", "Semana"],
              ["month", "Mês"],
              ["year", "Ano"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {loading && <p role="status">Carregando o período…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {view === "year" ? (
        <div className="year-grid">
          {Array.from({ length: 12 }, (_, m) => {
            const month = new Date(d.getFullYear(), m, 1, 12);
            return (
              <section className="panel mini-month" key={m}>
                <button
                  className="month-title"
                  onClick={() => {
                    setDate(key(month));
                    setView("month");
                  }}
                >
                  {format(month, "MMMM", { locale: ptBR })}
                </button>
                {monthGrid(month, true)}
              </section>
            );
          })}
        </div>
      ) : view === "month" ? (
        monthGrid(d)
      ) : (
        <div
          className={`calendar-grid ${view === "week" ? "weekly" : "daily"}`}
        >
          {Array.from({ length: view === "week" ? 7 : 1 }, (_, i) =>
            key(addDays(civil(start), i)),
          ).map((day) => (
            <section
              className={`calendar-day ${day === today ? "is-today" : ""}`}
              key={day}
            >
              <header>
                <span>{format(civil(day), "EEE", { locale: ptBR })}</span>
                <strong>{day.slice(8)}</strong>
              </header>
              {onDay(day).map((e) => (
                <button
                  className="calendar-event"
                  key={e.id}
                  onClick={() => openEvent(e)}
                >
                  <small>
                    {e.allDay
                      ? "Dia inteiro"
                      : new Intl.DateTimeFormat("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: w.preferences.timezone,
                        }).format(new Date(e.start))}
                  </small>
                  <strong>{e.title}</strong>
                  {e.recurringEventId && <small>↻ Recorrente</small>}
                  <small>{e.syncState}</small>
                </button>
              ))}
              <button
                className="calendar-add"
                aria-label={`Novo compromisso em ${day}`}
                onClick={() =>
                  onEdit({ start: day + "T09:00", end: day + "T10:00" })
                }
              >
                ＋
              </button>
            </section>
          ))}
        </div>
      )}
      <p className="muted calendar-note">
        Horários em {w.preferences.timezone}. Compromissos de dia inteiro
        permanecem nas suas datas.
      </p>
    </section>
  );
}
