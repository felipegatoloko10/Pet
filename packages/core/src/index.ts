import { z } from "zod";

export const syncStates = [
  "pending",
  "syncing",
  "synced",
  "error",
  "conflict",
] as const;
export type SyncState = (typeof syncStates)[number];
export type Column = {
  id: string;
  title: string;
  kind: "todo" | "active" | "waiting" | "done" | "custom";
};
export type Board = {
  id: string;
  title: string;
  columns: Column[];
  googleId?: string;
  revision: number;
};
export type Task = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  notes: string;
  dueDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  priority: "low" | "normal" | "high";
  completed: boolean;
  deleted?: boolean;
  revision: number;
  syncState: SyncState;
  googleId?: string;
  googleUpdated?: string;
  googleEtag?: string;
  sourceUrl?: string;
  importId?: string;
  error?: string;
};
export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  revision: number;
  syncState: SyncState;
  googleId?: string;
  googleEtag?: string;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: string;
  taskId?: string;
  deleted?: boolean;
  importId?: string;
  attendees?: string[];
  error?: string;
};
export type Mail = {
  id: string;
  from: string;
  subject: string;
  date: string;
  url: string;
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  deliveredBy?: string;
  silent?: boolean;
};
export type Preferences = {
  name: string;
  color: string;
  accent: string;
  timezone: string;
  summaryTime: string;
  reminderMinutes: number;
  quietStart: string;
  quietEnd: string;
  sleepStart: string;
  wakeTime: string;
  voice: boolean;
  snore: boolean;
  reducedMotion: boolean;
  defaultBoardId: string;
  defaultCalendarId: string;
  aiProvider: "openai" | "google" | "anthropic";
  aiModel: string;
  proactiveAI: boolean;
};
export const defaultPreferences: Preferences = {
  name: "Pingo",
  color: "#95d5bd",
  accent: "#f6c7cc",
  timezone: "America/Sao_Paulo",
  summaryTime: "08:00",
  reminderMinutes: 30,
  quietStart: "22:00",
  quietEnd: "08:00",
  sleepStart: "23:00",
  wakeTime: "08:00",
  voice: false,
  snore: false,
  reducedMotion: false,
  defaultBoardId: "",
  defaultCalendarId: "primary",
  aiProvider: "openai",
  aiModel: "",
  proactiveAI: false,
};
export type SyncJob = {
  id: string;
  kind: "task" | "event";
  entityId: string;
  action: "upsert" | "delete";
  state: "pending" | "uncertain" | "error";
  attempts: number;
  nextAttemptAt: string;
  error?: string;
  sentAt?: string;
};
export type Workspace = {
  revision: number;
  boards: Board[];
  tasks: Task[];
  events: CalendarEvent[];
  mail: Mail[];
  notices: Notice[];
  preferences: Preferences;
  outbox: SyncJob[];
  calendars: { id: string; title: string }[];
  connection: {
    connected: boolean;
    scopes: string[];
    lastSync?: string;
    error?: string;
  };
  cursor: {
    tasks?: Record<string, string>;
    calendar?: Record<string, string>;
    gmail?: string;
  };
  proactive: { date: string; count: number; lastAt?: string };
};
export function emptyWorkspace(
  timezone = defaultPreferences.timezone,
): Workspace {
  return {
    revision: 0,
    boards: [],
    tasks: [],
    events: [],
    mail: [],
    notices: [],
    preferences: { ...defaultPreferences, timezone },
    outbox: [],
    calendars: [],
    connection: { connected: false, scopes: [] },
    cursor: {},
    proactive: { date: "", count: 0 },
  };
}
export function newBoard(id: string, title: string, googleId?: string): Board {
  return {
    id,
    title,
    googleId,
    revision: 1,
    columns: [
      { id: `${id}:todo`, title: "A fazer", kind: "todo" },
      { id: `${id}:active`, title: "Em andamento", kind: "active" },
      { id: `${id}:waiting`, title: "Aguardando", kind: "waiting" },
      { id: `${id}:done`, title: "Concluído", kind: "done" },
    ],
  };
}
const id = z.string().min(1).max(200);
const date = z.iso.date();
const datetime = z.iso.datetime({ offset: true });
export const taskInput = z.object({
  id,
  boardId: id,
  columnId: id,
  title: z.string().trim().min(1).max(1024),
  notes: z.string().max(8192).default(""),
  dueDate: date.nullable().default(null),
  scheduledStart: datetime.nullable().default(null),
  scheduledEnd: datetime.nullable().default(null),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  sourceUrl: z.url().optional(),
  importId: id.optional(),
});
export const eventInput = z
  .object({
    id,
    title: z.string().trim().min(1).max(1024),
    start: z.string().max(100),
    end: z.string().max(100),
    allDay: z.boolean(),
    calendarId: id,
    taskId: id.optional(),
    recurrence: z.array(z.string().max(1000)).max(10).optional(),
    attendees: z.array(z.email()).max(30).optional(),
    importId: id.optional(),
  })
  .superRefine((v, c) => {
    const schema = v.allDay ? date : datetime;
    if (
      !schema.safeParse(v.start).success ||
      !schema.safeParse(v.end).success ||
      v.end <= v.start
    )
      c.addIssue({
        code: "custom",
        message:
          "Intervalo inválido; eventos de dia inteiro usam data e fim exclusivo.",
      });
  });
export const preferenceInput = z.object({
  name: z.string().trim().min(1).max(30),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  summaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reminderMinutes: z.number().int().min(0).max(1440),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  sleepStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  wakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  voice: z.boolean(),
  snore: z.boolean(),
  reducedMotion: z.boolean(),
  defaultBoardId: z.string(),
  defaultCalendarId: z.string(),
  aiProvider: z.enum(["openai", "google", "anthropic"]),
  aiModel: z.string().max(150),
  proactiveAI: z.boolean(),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("board.create"),
    id,
    title: z.string().trim().min(1).max(200),
  }),
  z.object({
    type: z.literal("column.create"),
    boardId: id,
    id,
    title: z.string().trim().min(1).max(100),
    expectedRevision: z.number().int(),
  }),
  z.object({
    type: z.literal("task.upsert"),
    task: taskInput,
    expectedRevision: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("task.delete"),
    id,
    expectedRevision: z.number().int(),
    confirmed: z.literal(true),
  }),
  z.object({
    type: z.literal("event.upsert"),
    event: eventInput,
    expectedRevision: z.number().int().min(0),
    confirmed: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("event.delete"),
    id,
    expectedRevision: z.number().int(),
    confirmed: z.literal(true),
  }),
  z.object({
    type: z.literal("preferences.update"),
    preferences: preferenceInput,
  }),
  z.object({ type: z.literal("notice.read"), id }),
  z.object({ type: z.literal("notice.ack"), id, deviceId: id }),
]);
export type Command = z.infer<typeof commandSchema>;
export const operationSchema = z.object({
  operationId: z.uuid(),
  command: commandSchema,
});
export type Operation = z.infer<typeof operationSchema>;
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function checkRevision(
  old: { revision: number } | undefined,
  expected: number,
) {
  if ((old?.revision ?? 0) !== expected)
    throw new DomainError(
      "conflict",
      "Este item mudou em outro dispositivo. Revise a versão atual antes de salvar.",
      409,
    );
}
export function applyCommand(
  original: Workspace,
  command: Command,
  operationId: string,
  now = new Date().toISOString(),
): Workspace {
  const w = structuredClone(original);
  const c = commandSchema.parse(command);
  const enqueue = (
    kind: "task" | "event",
    entityId: string,
    action: "upsert" | "delete",
  ) => {
    // Keep uncertain creates: replacing them would lose the reconciliation marker.
    if (
      w.outbox.some(
        (j) =>
          j.kind === kind && j.entityId === entityId && j.state === "uncertain",
      )
    )
      throw new DomainError(
        "uncertain",
        "Aguardando confirmação do Google antes de alterar este item.",
        409,
      );
    w.outbox = w.outbox.filter(
      (j) => !(j.kind === kind && j.entityId === entityId),
    );
    w.outbox.push({
      id: operationId,
      kind,
      entityId,
      action,
      state: "pending",
      attempts: 0,
      nextAttemptAt: now,
    });
  };
  switch (c.type) {
    case "board.create":
      if (w.boards.some((b) => b.id === c.id))
        throw new DomainError("exists", "Quadro já existe.");
      if (w.connection.connected)
        throw new DomainError(
          "google_list",
          "Importe uma lista do Google ou crie a lista no Google Tasks.",
        );
      w.boards.push(newBoard(c.id, c.title));
      break;
    case "column.create": {
      const b = w.boards.find((b) => b.id === c.boardId);
      if (!b) throw new DomainError("missing", "Quadro não encontrado.", 404);
      checkRevision(b, c.expectedRevision);
      if (b.columns.some((x) => x.id === c.id))
        throw new DomainError("exists", "Coluna já existe.");
      b.columns.push({ id: c.id, title: c.title, kind: "custom" });
      b.revision++;
      break;
    }
    case "task.upsert": {
      const b = w.boards.find((b) => b.id === c.task.boardId);
      const col = b?.columns.find((x) => x.id === c.task.columnId);
      if (!b || !col)
        throw new DomainError(
          "missing",
          "Quadro ou coluna não encontrado.",
          404,
        );
      const old = w.tasks.find((t) => t.id === c.task.id);
      checkRevision(old, c.expectedRevision);
      if (
        c.task.scheduledEnd &&
        (!c.task.scheduledStart || c.task.scheduledEnd <= c.task.scheduledStart)
      )
        throw new DomainError("time", "Horário reservado inválido.");
      if (
        c.task.importId &&
        w.tasks.some((t) => t.importId === c.task.importId)
      )
        break;
      const t: Task = {
        ...old,
        ...c.task,
        completed: col.kind === "done",
        revision: (old?.revision ?? 0) + 1,
        syncState: "pending",
        deleted: false,
        error: undefined,
      };
      if (old && old.boardId !== b.id)
        throw new DomainError(
          "move",
          "Não é possível mover entre listas nesta versão.",
        );
      w.tasks = w.tasks.filter((t) => t.id !== c.task.id).concat(t);
      enqueue("task", t.id, "upsert");
      break;
    }
    case "task.delete": {
      const t = w.tasks.find((t) => t.id === c.id);
      if (!t) throw new DomainError("missing", "Tarefa não encontrada.", 404);
      checkRevision(t, c.expectedRevision);
      t.deleted = true;
      t.revision++;
      t.syncState = "pending";
      enqueue("task", t.id, "delete");
      break;
    }
    case "event.upsert": {
      const old = w.events.find((e) => e.id === c.event.id);
      checkRevision(old, c.expectedRevision);
      if (c.event.attendees?.length && !c.confirmed)
        throw new DomainError("confirmation", "Confirme o envio de convites.");
      if (
        c.event.taskId &&
        !w.tasks.some((t) => t.id === c.event.taskId && !t.deleted)
      )
        throw new DomainError("missing", "Tarefa não encontrada.", 404);
      if (
        c.event.importId &&
        w.events.some((e) => e.importId === c.event.importId)
      )
        break;
      const e: CalendarEvent = {
        ...old,
        ...c.event,
        revision: (old?.revision ?? 0) + 1,
        syncState: "pending",
        deleted: false,
        error: undefined,
      };
      w.events = w.events.filter((x) => x.id !== e.id).concat(e);
      if (e.taskId) {
        const t = w.tasks.find((t) => t.id === e.taskId)!;
        t.scheduledStart = e.start;
        t.scheduledEnd = e.end;
        t.revision++;
      }
      enqueue("event", e.id, "upsert");
      break;
    }
    case "event.delete": {
      const e = w.events.find((e) => e.id === c.id);
      if (!e)
        throw new DomainError("missing", "Compromisso não encontrado.", 404);
      checkRevision(e, c.expectedRevision);
      e.deleted = true;
      e.revision++;
      e.syncState = "pending";
      enqueue("event", e.id, "delete");
      break;
    }
    case "preferences.update":
      w.preferences = c.preferences;
      break;
    case "notice.read": {
      const n = w.notices.find((n) => n.id === c.id);
      if (n) n.read = true;
      break;
    }
    case "notice.ack": {
      const n = w.notices.find((n) => n.id === c.id);
      if (n && !n.deliveredBy) n.deliveredBy = c.deviceId;
      break;
    }
  }
  w.revision++;
  return w;
}
export function mergeGoogleTask(
  w: Workspace,
  board: Board,
  g: {
    id: string;
    title?: string;
    notes?: string;
    due?: string;
    status?: string;
    deleted?: boolean;
    updated?: string;
    etag?: string;
  },
): void {
  const old = w.tasks.find(
    (t) => t.googleId === g.id && t.boardId === board.id,
  );
  if (old && w.outbox.some((j) => j.entityId === old.id)) {
    if (g.updated && old.googleUpdated && g.updated !== old.googleUpdated) {
      old.syncState = "conflict";
      old.error =
        "O Google e o Pingo mudaram este item. Revise antes de reenviar.";
    }
    return;
  }
  const done = g.status === "completed";
  const transition = !old || old.completed !== done;
  const col = transition
    ? board.columns.find((c) => c.kind === (done ? "done" : "todo"))!.id
    : old.columnId;
  const task: Task = {
    ...old,
    id: old?.id ?? crypto.randomUUID(),
    boardId: board.id,
    columnId: col,
    title: g.title ?? old?.title ?? "Sem título",
    notes: g.notes ?? "",
    dueDate: g.due?.slice(0, 10) ?? null,
    scheduledStart: old?.scheduledStart ?? null,
    scheduledEnd: old?.scheduledEnd ?? null,
    priority: old?.priority ?? "normal",
    completed: done,
    deleted: g.deleted,
    googleId: g.id,
    googleEtag: g.etag,
    googleUpdated: g.updated,
    revision: (old?.revision ?? 0) + 1,
    syncState: "synced",
    error: undefined,
  };
  if (old) Object.assign(old, task);
  else if (!g.deleted) w.tasks.push(task);
}
export function zonedParts(date: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string) => p.find((x) => x.type === key)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export function inWindow(time: string, start: string, end: string) {
  return start === end
    ? false
    : start < end
      ? time >= start && time < end
      : time >= start || time < end;
}
export function isQuiet(date: Date, p: Preferences) {
  return inWindow(zonedParts(date, p.timezone).time, p.quietStart, p.quietEnd);
}
export function dailySummary(w: Workspace, now = new Date()) {
  const today = zonedParts(now, w.preferences.timezone).date;
  const events = w.events.filter((e) =>
    eventOnDate(e, today, w.preferences.timezone),
  );
  const pending = w.tasks.filter((t) => !t.deleted && !t.completed);
  const overdue = pending.filter((t) => t.dueDate && t.dueDate < today);
  return `Você tem ${events.length} compromisso(s), ${pending.filter((t) => t.dueDate === today).length} tarefa(s) para hoje e ${overdue.length} atrasada(s). Vamos cuidar de uma coisa por vez?`;
}
export function eventOnDate(e: CalendarEvent, date: string, timezone: string) {
  if (e.deleted || e.recurrence) return false;
  if (e.allDay) return e.start <= date && e.end > date;
  return (
    zonedParts(new Date(e.start), timezone).date <= date &&
    zonedParts(new Date(Date.parse(e.end) - 1), timezone).date >= date
  );
}
export function localNotices(
  w: Workspace,
  userId: string,
  now = new Date(),
): Notice[] {
  const { date, time } = zonedParts(now, w.preferences.timezone);
  const result: Notice[] = [];
  if (time >= w.preferences.summaryTime)
    result.push({
      id: `summary:${date}`,
      title: "Seu dia com Pingo",
      body: dailySummary(w, now),
      read: false,
      createdAt: now.toISOString(),
      silent: isQuiet(now, w.preferences),
    });
  for (const e of w.events) {
    const delta = Date.parse(e.start) - +now;
    if (
      !e.deleted &&
      !e.allDay &&
      !e.recurrence &&
      delta >= 0 &&
      delta <= w.preferences.reminderMinutes * 60000
    )
      result.push({
        id: `reminder:${userId}:${e.id}:${e.start}`,
        title: e.title,
        body: `${e.title} começa em ${Math.round(delta / 60000)} minutos.`,
        read: false,
        createdAt: now.toISOString(),
        silent: isQuiet(now, w.preferences),
      });
  }
  return result;
}
export type PetState =
  | "idle"
  | "blink"
  | "look"
  | "walk"
  | "think"
  | "speak"
  | "focus"
  | "celebrate"
  | "affection"
  | "yawn"
  | "sleep"
  | "wake";
export function petState(now: Date, p: Preferences, focused = false): PetState {
  const time = zonedParts(now, p.timezone).time;
  return inWindow(time, p.sleepStart, p.wakeTime)
    ? "sleep"
    : focused
      ? "focus"
      : "idle";
}
export function sanitizeWorkspace(
  w: Workspace,
): Omit<Workspace, "outbox" | "cursor"> {
  const { outbox: _, cursor: __, ...safe } = w;
  return safe;
}
