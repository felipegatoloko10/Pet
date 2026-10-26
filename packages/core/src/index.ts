import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import {
  reconcileTaskCalendars,
  taskScheduleKey,
  normalizeScheduleKey,
} from "./planning";
export * from "./planning";
export * from "./offline";
export * from "./reminders";
export * from "./import";
import { pingoImportInput, importPingoData } from "./import";

export function taskOrder(a: Task, b: Task) {
  return (a.position ?? 1e9) - (b.position ?? 1e9) || a.id.localeCompare(b.id);
}
export function normalizeWorkspace(w: Workspace): Workspace {
  w.calendars ??= [];
  w.boards ??= [];
  w.tasks ??= [];
  w.events ??= [];
  w.mail ??= [];
  w.notices ??= [];
  w.outbox ??= [];
  w.cursor ??= {};
  w.connection ??= { connected: false, scopes: [] };
  w.preferences = { ...defaultPreferences, ...w.preferences };
  w.petCare ??= initialPetCare();
  if (!w.conversations || (!w.conversations.length && w.conversation?.length))
    w.conversations = w.conversation?.length
      ? [
          {
            id: "legacy-conversation",
            title: "Conversa anterior",
            archived: false,
            messages: w.conversation,
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ]
      : [];
  w.notices = w.notices.filter((n) => !n.id.startsWith("mail:"));
  const positions = new Map<string, number>();
  for (const task of w.tasks) {
    const group = task.boardId + ":" + task.columnId;
    const next = positions.get(group) ?? 0;
    task.position ??= next;
    positions.set(group, Math.max(next, task.position + 1));
  }
  return w;
}
export function dayBounds(date: string, timezone: string) {
  const [y, m, d] = date.split("-").map(Number);
  return {
    start: new Date(new TZDate(y, m - 1, d, timezone).getTime()).toISOString(),
    end: new Date(
      new TZDate(y, m - 1, d + 1, timezone).getTime(),
    ).toISOString(),
  };
}
export function overlaps(a: CalendarEvent, b: CalendarEvent, timezone: string) {
  if (a.transparent || b.transparent) return false;
  const bounds = (e: CalendarEvent) =>
    e.allDay
      ? [dayBounds(e.start, timezone).start, dayBounds(e.end, timezone).start]
      : [e.start, e.end];
  const [as, ae] = bounds(a),
    [bs, be] = bounds(b);
  return Date.parse(as) < Date.parse(be) && Date.parse(bs) < Date.parse(ae);
}

export const syncStates = [
  "pending",
  "syncing",
  "synced",
  "error",
  "conflict",
] as const;
export type SyncState = (typeof syncStates)[number];
export type Column = {
  color?: string;
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
  timeMode?: "none" | "point" | "range";
  completedAt?: string | null;
  actualStartedAt?: string | null;
  calendarSuppressed?: boolean;
  calendarRemoved?: boolean;
  sourceMail?: { id: string; from: string; receivedAt: string };
  checkIn?: {
    key: string;
    endAnswered?: boolean;
    snoozeAt?: string;
    snoozePhase?: "before" | "start" | "end";
  };
  position?: number;
  labels?: { id: string; name: string; color: string }[];
  checklist?: { id: string; text: string; done: boolean }[];
  archivedAt?: string | null;
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
  transparent?: boolean;
  columnId?: string;
  position?: number;
  completedAt?: string | null;
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
  url?: string;
  isRead?: boolean;
};
export type Notice = {
  taskId?: string;
  phase?: "before" | "start" | "end" | "repeat" | "snooze";
  scheduleKey?: string;
  taskRevision?: number;
  snoozePhase?: string;
  expiresAt?: number;
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  deliveredBy?: string;
  silent?: boolean;
};
export type Preferences = {
  taskCheckIns?: boolean;
  routine?: RoutineDay[];
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
export type RoutineDay = {
  day: number;
  work: { start: string; end: string }[];
  personal: { start: string; end: string }[];
};
export type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  text: string;
  suggestions?: { approvalId: string; command: Command }[];
};
export type Conversation = {
  id: string;
  title: string;
  archived: boolean;
  messages: ChatMessage[];
  updatedAt: string;
  pendingMessage?: string;
  pendingAt?: string;
  responses?: Record<
    string,
    { text: string; suggestions: { approvalId: string; command: Command }[] }
  >;
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
  taskCheckIns: true,
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
  storageMode?: "pingo";
  migrationSettingsRestored?: boolean;
  petCare?: PetCare;
  conversations?: Conversation[];
  conversation?: {
    role: "user" | "assistant";
    text: string;
    suggestions?: { approvalId: string; command: Command }[];
  }[];
  revision: number;
  boards: Board[];
  tasks: Task[];
  events: CalendarEvent[];
  mail: Mail[];
  notices: Notice[];
  preferences: Preferences;
  outbox: SyncJob[];
  calendars: {
    id: string;
    title: string;
    readOnly?: boolean;
    holiday?: boolean;
    publicFallback?: boolean;
  }[];
  connection: {
    subject?: string;
    email?: string;
    connected: boolean;
    scopes: string[];
    lastSync?: string;
    error?: string;
  };
  cursor: {
    routineLastAt?: number;
    push?: Record<
      string,
      Record<string, { lease: string; until: number; sent?: boolean }>
    >;
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
  timeMode: z.enum(["none", "point", "range"]).optional(),
  sourceMail: z
    .object({
      id: z.string().max(200),
      from: z.string().max(1024),
      receivedAt: z.iso.datetime({ offset: true }),
    })
    .optional(),
  position: z.number().optional(),
  labels: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(40),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
      }),
    )
    .max(30)
    .optional(),
  checklist: z
    .array(
      z.object({ id, text: z.string().min(1).max(500), done: z.boolean() }),
    )
    .max(100)
    .optional(),
  archivedAt: datetime.nullable().optional(),
  id,
  boardId: id,
  columnId: id,
  title: z.string().trim().min(1).max(1024),
  notes: z.string().max(8192).default(""),
  dueDate: date.nullable().default(null),
  scheduledStart: datetime.nullable().default(null),
  scheduledEnd: datetime.nullable().default(null),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  sourceUrl: z
    .url()
    .refine((v) => {
      const u = new URL(v);
      return u.protocol === "https:" && u.hostname === "mail.google.com";
    }, "Use um link HTTPS do Gmail.")
    .optional(),
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
      Date.parse(v.end) <= Date.parse(v.start)
    )
      c.addIssue({
        code: "custom",
        message:
          "Intervalo inválido; eventos de dia inteiro usam data e fim exclusivo.",
      });
  });
const timeInput = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const routineInput = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      work: z
        .array(
          z
            .object({ start: timeInput, end: timeInput })
            .refine((x) => x.end > x.start),
        )
        .max(6),
      personal: z
        .array(
          z
            .object({ start: timeInput, end: timeInput })
            .refine((x) => x.end > x.start),
        )
        .max(6),
    }),
  )
  .max(7)
  .refine((days) => new Set(days.map((d) => d.day)).size === days.length);
export const preferenceInput = z.object({
  taskCheckIns: z.boolean().optional(),
  routine: routineInput.optional(),
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
    type: z.literal("workspace.import"),
    data: pingoImportInput(),
    confirmed: z.literal(true),
  }),
  z.object({
    type: z.literal("column.delete"),
    boardId: id,
    columnId: id,
    destinationId: id,
    expectedRevision: z.number().int(),
  }),
  z.object({
    type: z.literal("event.move"),
    id,
    columnId: id,
    beforeId: id.nullable(),
    expectedRevision: z.number().int(),
  }),
  z.object({
    type: z.literal("task.calendarDecision"),
    id,
    removeTask: z.boolean(),
    expectedRevision: z.number().int(),
    confirmed: z.literal(true),
  }),
  z.object({
    type: z.literal("task.checkIn"),
    id,
    action: z.enum(["start", "complete", "snooze", "pending", "waiting"]),
    actedAt: z.iso.datetime().optional(),
    phase: z.enum(["before", "start", "end", "repeat", "snooze"]),
    scheduleKey: z.string().max(200),
    expectedRevision: z.number().int(),
  }),
  z.object({
    type: z.literal("pet.care"),
    action: z.enum(["feed", "pet", "play", "nap", "wake"]),
  }),
  z.object({
    type: z.literal("column.update"),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    boardId: id,
    columnId: id,
    title: z.string().trim().min(1).max(100),
    index: z.number().int().min(0),
    expectedRevision: z.number().int(),
  }),
  z.object({
    type: z.literal("task.move"),
    id,
    columnId: id,
    beforeId: id.nullable(),
    expectedRevision: z.number().int(),
  }),
  z.object({
    type: z.literal("task.metadata"),
    id,
    expectedRevision: z.number().int(),
    metadata: taskInput.pick({
      labels: true,
      checklist: true,
      archivedAt: true,
    }),
  }),
  z.object({
    type: z.literal("routine.update"),
    routine: routineInput,
    confirmed: z.literal(true),
  }),
  z.object({
    type: z.literal("conversation.update"),
    id,
    title: z.string().trim().min(1).max(100),
    archived: z.boolean(),
  }),
  z.object({
    type: z.literal("board.create"),
    id,
    title: z.string().trim().min(1).max(200),
  }),
  z.object({
    type: z.literal("column.create"),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
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
    requireAvailable: z.boolean().optional(),
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
  const w = normalizeWorkspace(structuredClone(original));
  const c = commandSchema.parse(command);
  if (
    w.storageMode === "pingo" &&
    c.type === "event.upsert" &&
    c.event.attendees?.length
  )
    throw new DomainError(
      "invites",
      "O Pingo registra seus compromissos pessoais e não envia convites externos.",
      400,
    );
  const enqueue = (
    kind: "task" | "event",
    entityId: string,
    action: "upsert" | "delete",
  ) => {
    if (w.storageMode === "pingo") return;
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
      id: `${operationId}:${kind}:${entityId}`,
      kind,
      entityId,
      action,
      state: "pending",
      attempts: 0,
      nextAttemptAt: now,
    });
  };
  switch (c.type) {
    case "workspace.import": {
      if (w.storageMode !== "pingo")
        throw new DomainError("mode", "Atualize o Pingo antes de importar.");
      importPingoData(w, c.data);
      break;
    }
    case "task.calendarDecision": {
      const t = w.tasks.find((t) => t.id === c.id && !t.deleted);
      if (!t) throw new DomainError("missing", "Tarefa não encontrada.");
      checkRevision(t, c.expectedRevision);
      t.calendarRemoved = false;
      if (c.removeTask) {
        t.deleted = true;
        t.syncState = "pending";
        enqueue("task", t.id, "delete");
      }
      t.revision++;
      break;
    }
    case "task.checkIn": {
      const t = w.tasks.find((t) => t.id === c.id && !t.deleted);
      if (!t) throw new DomainError("missing", "Tarefa não encontrada.");
      if (t.completed) break;
      if (c.expectedRevision > t.revision) checkRevision(t, c.expectedRevision);
      if (taskScheduleKey(t) !== normalizeScheduleKey(c.scheduleKey))
        throw new DomainError(
          "conflict",
          "O horário desta tarefa mudou. Abra a tarefa para revisar.",
          409,
        );
      t.checkIn = {
        ...(t.checkIn &&
        normalizeScheduleKey(t.checkIn.key) === taskScheduleKey(t)
          ? t.checkIn
          : {}),
        key: taskScheduleKey(t),
      };
      const endPhase =
        ["end", "repeat"].includes(c.phase) ||
        (c.phase === "snooze" && t.checkIn.snoozePhase === "end");
      const actedAt =
        c.actedAt && Date.parse(c.actedAt) <= Date.parse(now) + 60000
          ? c.actedAt
          : now;
      if (endPhase) t.checkIn.endAnswered = true;
      if (c.action === "snooze") {
        t.checkIn.snoozeAt = new Date(
          Date.parse(actedAt) + (endPhase ? 15 : 10) * 60000,
        ).toISOString();
        t.checkIn.snoozePhase = endPhase ? "end" : "start";
      } else {
        delete t.checkIn.snoozeAt;
        const b = w.boards.find((b) => b.id === t.boardId)!;
        const kind =
          c.action === "complete"
            ? "done"
            : c.action === "pending"
              ? "todo"
              : c.action === "waiting"
                ? "waiting"
                : "active";
        const destination = b.columns.find((col) => col.kind === kind);
        if (!destination)
          throw new DomainError(
            "missing",
            "Essa etapa foi removida. Abra o Pingo para escolher outra etapa.",
          );
        t.columnId = destination!.id;
        t.completed = c.action === "complete";
        t.completedAt = t.completed ? actedAt : null;
        if (c.action === "start") t.actualStartedAt = actedAt;
        else if (!t.completed) t.actualStartedAt = null;
        if (t.completed) {
          t.syncState = "pending";
          enqueue("task", t.id, "upsert");
        }
      }
      t.revision++;
      break;
    }
    case "event.move": {
      const e = w.events.find((e) => e.id === c.id && !e.deleted);
      if (!e || e.taskId)
        throw new DomainError("missing", "Compromisso não encontrado.");
      checkRevision(e, c.expectedRevision);
      const b =
        w.boards.find((b) => b.id === w.preferences.defaultBoardId) ??
        w.boards[0];
      const col = b?.columns.find((col) => col.id === c.columnId);
      if (
        !col ||
        w.calendars.some((cal) => cal.id === e.calendarId && cal.holiday)
      )
        throw new DomainError("readonly", "Este lembrete é somente leitura.");
      e.columnId = col.id;
      e.completedAt = col.kind === "done" ? now : null;
      const list: { id: string; item: { position?: number } }[] = [
        ...w.events
          .filter(
            (x) =>
              !x.deleted && !x.taskId && x.columnId === col.id && x.id !== e.id,
          )
          .map((x) => ({ id: `event:${x.id}`, item: x })),
        ...w.tasks
          .filter(
            (x) =>
              !x.deleted &&
              !x.archivedAt &&
              x.boardId === b.id &&
              x.columnId === col.id,
          )
          .map((x) => ({ id: x.id, item: x })),
      ].sort((a, b) => (a.item.position ?? 1e9) - (b.item.position ?? 1e9));
      let index = c.beforeId
        ? list.findIndex((x) => x.id === c.beforeId)
        : list.length;
      if (index < 0)
        throw new DomainError(
          "conflict",
          "O destino mudou. Tente novamente.",
          409,
        );
      list.splice(index, 0, { id: `event:${e.id}`, item: e });
      list.forEach((x, i) => {
        x.item.position = i;
      });
      e.revision++;
      break;
    }
    case "column.delete": {
      const b = w.boards.find((b) => b.id === c.boardId);
      if (!b) throw new DomainError("missing", "Quadro não encontrado.");
      checkRevision(b, c.expectedRevision);
      const col = b.columns.find((x) => x.id === c.columnId),
        dest = b.columns.find((x) => x.id === c.destinationId);
      if (!col || ["todo", "active", "done"].includes(col.kind))
        throw new DomainError(
          "protected",
          "Esta coluna tem uma função essencial e não pode ser excluída.",
        );
      if (!dest || dest.id === col.id || dest.kind === "done")
        throw new DomainError(
          "destination",
          "Escolha outra coluna pendente para receber os cartões.",
        );
      for (const t of w.tasks.filter(
        (t) => t.boardId === b.id && t.columnId === col.id,
      )) {
        t.columnId = dest.id;
        t.revision++;
      }
      for (const e of w.events.filter((e) => e.columnId === col.id)) {
        e.columnId = dest.id;
        e.revision++;
      }
      b.columns = b.columns.filter((x) => x.id !== col.id);
      b.revision++;
      break;
    }
    case "pet.care": {
      const at = new Date(now);
      const care = advancePetCare(
        w.petCare ?? initialPetCare(at),
        w.preferences,
        at,
      );
      if (c.action === "feed") care.satiety = Math.min(100, care.satiety + 25);
      if (c.action === "pet") care.mood = Math.min(100, care.mood + 10);
      if (c.action === "play") {
        care.mood = Math.min(100, care.mood + 20);
        care.energy = Math.max(0, care.energy - 10);
      }
      if (c.action === "nap") {
        care.napUntil = new Date(+at + 1800000).toISOString();
        care.awakeUntil = undefined;
      }
      if (c.action === "wake") {
        care.napUntil = undefined;
        care.awakeUntil =
          petState(at, w.preferences) === "sleep"
            ? nextPetBoundary(
                at,
                w.preferences.wakeTime,
                w.preferences.timezone,
              ).toISOString()
            : undefined;
      }
      w.petCare = care;
      break;
    }
    case "conversation.update": {
      normalizeWorkspace(w);
      const old = w.conversations!.find((x) => x.id === c.id);
      if (old)
        Object.assign(old, {
          title: c.title,
          archived: c.archived,
          updatedAt: now,
        });
      else
        w.conversations!.push({
          id: c.id,
          title: c.title,
          archived: c.archived,
          messages: [],
          updatedAt: now,
        });
      break;
    }
    case "routine.update":
      w.preferences.routine = c.routine;
      break;
    case "column.update": {
      const b = w.boards.find((x) => x.id === c.boardId);
      if (!b) throw new DomainError("missing", "Quadro não encontrado.");
      checkRevision(b, c.expectedRevision);
      const col = b.columns.find((x) => x.id === c.columnId);
      if (!col) throw new DomainError("missing", "Coluna não encontrada.");
      col.title = c.title;
      if (c.color) col.color = c.color;
      b.columns = b.columns.filter((x) => x.id !== col.id);
      b.columns.splice(Math.min(c.index, b.columns.length), 0, col);
      b.revision++;
      break;
    }
    case "task.metadata": {
      const t = w.tasks.find((x) => x.id === c.id && !x.deleted);
      if (!t) throw new DomainError("missing", "Tarefa não encontrada.");
      checkRevision(t, c.expectedRevision);
      Object.assign(t, c.metadata);
      t.revision++;
      break;
    }
    case "task.move": {
      const t = w.tasks.find((x) => x.id === c.id && !x.deleted);
      if (!t) throw new DomainError("missing", "Tarefa não encontrada.");
      checkRevision(t, c.expectedRevision);
      const b = w.boards.find((x) => x.id === t.boardId)!,
        col = b.columns.find((x) => x.id === c.columnId);
      if (!col) throw new DomainError("missing", "Coluna não encontrada.");
      const entries: { id: string; item: { position?: number } }[] = [
        ...w.tasks
          .filter(
            (x) =>
              !x.deleted &&
              !x.archivedAt &&
              x.boardId === t.boardId &&
              x.columnId === col.id &&
              x.id !== t.id,
          )
          .map((x) => ({ id: x.id, item: x })),
        ...w.events
          .filter((x) => !x.deleted && !x.taskId && x.columnId === col.id)
          .map((x) => ({ id: `event:${x.id}`, item: x })),
      ].sort((a, b) => (a.item.position ?? 1e9) - (b.item.position ?? 1e9));
      const index = c.beforeId
        ? entries.findIndex((x) => x.id === c.beforeId)
        : entries.length;
      if (index < 0)
        throw new DomainError(
          "conflict",
          "O destino mudou. Tente novamente.",
          409,
        );
      const changed = t.completed !== (col.kind === "done");
      t.columnId = col.id;
      t.completed = col.kind === "done";
      if (changed) t.completedAt = t.completed ? now : null;
      if (col.kind === "active" && !t.actualStartedAt) t.actualStartedAt = now;
      if (t.scheduledEnd && Date.parse(t.scheduledEnd) <= Date.parse(now))
        t.checkIn = {
          ...t.checkIn,
          key: taskScheduleKey(t),
          endAnswered: true,
        };
      t.revision++;
      entries.splice(index, 0, { id: t.id, item: t });
      entries.forEach((x, i) => {
        x.item.position = i;
      });
      if (changed) {
        t.syncState = "pending";
        enqueue("task", t.id, "upsert");
      }
      break;
    }
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
      b.columns.push({
        id: c.id,
        title: c.title,
        kind: "custom",
        color: c.color,
      });
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
      if (
        old &&
        w.events.some(
          (e) =>
            e.taskId === old.id &&
            w.outbox.some(
              (j) => j.entityId === e.id && j.state === "uncertain",
            ),
        )
      )
        throw new DomainError(
          "uncertain",
          "Aguardando confirmação da agenda antes de alterar esta tarefa.",
          409,
        );
      if (
        !old &&
        w.preferences.defaultBoardId &&
        c.task.boardId !== w.preferences.defaultBoardId
      )
        throw new DomainError(
          "fixed_list",
          "O Pingo usa uma lista fixa de tarefas.",
        );
      checkRevision(old, c.expectedRevision);
      if (
        c.task.scheduledEnd &&
        (!c.task.scheduledStart ||
          Date.parse(c.task.scheduledEnd) <= Date.parse(c.task.scheduledStart))
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
        position:
          old?.position ??
          c.task.position ??
          Math.max(
            -1,
            ...w.tasks
              .filter((x) => x.columnId === col.id)
              .map((x) => x.position ?? 0),
          ) + 1,
        completed: col.kind === "done",
        revision: (old?.revision ?? 0) + 1,
        syncState: "pending",
        deleted: false,
        error: undefined,
      };
      if (!old || old.completed !== t.completed)
        t.completedAt = t.completed ? now : null;
      if (
        !old ||
        old.dueDate !== t.dueDate ||
        old.scheduledStart !== t.scheduledStart ||
        old.scheduledEnd !== t.scheduledEnd
      ) {
        t.calendarSuppressed = false;
        t.calendarRemoved = false;
        t.checkIn = undefined;
        t.actualStartedAt = null;
      } else if (
        old.columnId !== t.columnId &&
        t.scheduledEnd &&
        Date.parse(now) >= Date.parse(t.scheduledEnd)
      ) {
        t.checkIn = {
          ...t.checkIn,
          key: taskScheduleKey(t),
          endAnswered: true,
          snoozeAt: undefined,
        };
      }
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
      if (
        w.calendars.some((cal) => cal.id === c.event.calendarId && cal.readOnly)
      )
        throw new DomainError(
          "readonly",
          "Esta agenda é somente leitura.",
          403,
        );
      const old = w.events.find((e) => e.id === c.event.id);
      checkRevision(old, c.expectedRevision);
      if (
        c.requireAvailable &&
        w.events.some(
          (other) =>
            !other.deleted &&
            !other.recurrence &&
            other.id !== c.event.id &&
            overlaps(other, c.event as CalendarEvent, w.preferences.timezone),
        )
      )
        throw new DomainError(
          "busy_slot",
          "Esse horário ficou ocupado. Escolha outro horário.",
          409,
        );
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
      if (
        e.taskId &&
        w.events.some(
          (x) => x.taskId === e.taskId && x.id !== e.id && !x.deleted,
        )
      )
        throw new DomainError(
          "reserved",
          "Esta tarefa já tem um horário reservado. Edite o compromisso existente.",
        );
      w.events = w.events.filter((x) => x.id !== e.id).concat(e);
      if (e.taskId) {
        const t = w.tasks.find((t) => t.id === e.taskId)!;
        t.scheduledStart = e.allDay ? null : e.start;
        t.scheduledEnd = e.allDay ? null : e.end;
        t.dueDate = e.allDay
          ? e.start
          : zonedParts(new Date(e.start), w.preferences.timezone).date;
        t.timeMode = e.allDay ? "none" : "range";
        t.title = e.title.replace(/^✓\s*/, "");
        t.calendarSuppressed = false;
        t.calendarRemoved = false;
        t.checkIn = undefined;
        t.actualStartedAt = null;
        t.syncState = "pending";
        enqueue("task", t.id, "upsert");
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
      if (w.calendars.some((cal) => cal.id === e.calendarId && cal.readOnly))
        throw new DomainError(
          "readonly",
          "Esta agenda é somente leitura.",
          403,
        );
      e.deleted = true;
      e.revision++;
      e.syncState = "pending";
      if (e.taskId) {
        const t = w.tasks.find((t) => t.id === e.taskId);
        if (t) {
          t.scheduledStart = null;
          t.scheduledEnd = null;
          t.calendarSuppressed = true;
          t.revision++;
        }
      }
      enqueue("event", e.id, "delete");
      break;
    }
    case "preferences.update":
      w.preferences = {
        ...w.preferences,
        ...c.preferences,
        defaultBoardId:
          w.preferences.defaultBoardId || c.preferences.defaultBoardId,
      };
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
  if (
    [
      "task.upsert",
      "task.move",
      "task.delete",
      "task.checkIn",
      "task.calendarDecision",
      "event.upsert",
    ].includes(c.type)
  )
    reconcileTaskCalendars(w, enqueue, now);
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
    completed?: string;
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
    completedAt: done ? (g.completed ?? old?.completedAt ?? null) : null,
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
  const pending = w.tasks.filter(
    (t) => !t.deleted && !t.completed && !t.archivedAt,
  );
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
  | "wake"
  | "stretch"
  | "wave"
  | "dance"
  | "groom"
  | "curious"
  | "hop"
  | "peek"
  | "listen"
  | "roll"
  | "sit"
  | "surprised"
  | "spin";
export function petState(now: Date, p: Preferences, focused = false): PetState {
  const time = zonedParts(now, p.timezone).time;
  return inWindow(time, p.sleepStart, p.wakeTime)
    ? "sleep"
    : focused
      ? "focus"
      : "idle";
}
export type PetCare = {
  satiety: number;
  mood: number;
  energy: number;
  updatedAt: string;
  napUntil?: string;
  awakeUntil?: string;
};
export function initialPetCare(now = new Date()): PetCare {
  return { satiety: 80, mood: 80, energy: 80, updatedAt: now.toISOString() };
}
function nextPetBoundary(now: Date, time: string, timezone: string) {
  const local = TZDate.tz(timezone, now);
  const [h, m] = time.split(":").map(Number);
  let next = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    h,
    m,
    0,
    timezone,
  );
  if (+next <= +now)
    next = new TZDate(
      local.getFullYear(),
      local.getMonth(),
      local.getDate() + 1,
      h,
      m,
      0,
      timezone,
    );
  return new Date(+next);
}
export function petSleeping(care: PetCare, p: Preferences, now = new Date()) {
  if (care.awakeUntil && Date.parse(care.awakeUntil) > +now) return false;
  return (
    !!(care.napUntil && Date.parse(care.napUntil) > +now) ||
    petState(now, p) === "sleep"
  );
}
export function advancePetCare(
  saved: PetCare,
  p: Preferences,
  now = new Date(),
): PetCare {
  const care = { ...saved };
  let cursor = Date.parse(care.updatedAt);
  if (!Number.isFinite(cursor)) return initialPetCare(now);
  // Split on civil sleep/wake boundaries so DST and long absences need no running timer.
  while (cursor < +now) {
    const date = new Date(cursor);
    const next = Math.min(
      +now,
      +nextPetBoundary(date, p.sleepStart, p.timezone),
      +nextPetBoundary(date, p.wakeTime, p.timezone),
      ...[care.napUntil, care.awakeUntil]
        .map((x) => x && Date.parse(x))
        .filter((x): x is number => typeof x === "number" && x > cursor),
    );
    const hours = (next - cursor) / 3600000;
    if (petSleeping(care, p, date))
      care.energy = Math.min(100, care.energy + 10 * hours);
    else {
      care.satiety = Math.max(0, care.satiety - 3 * hours);
      care.mood = Math.max(0, care.mood - hours);
      care.energy = Math.max(0, care.energy - 4 * hours);
    }
    cursor = next;
  }
  care.updatedAt = new Date(Math.max(cursor, +now)).toISOString();
  return care;
}
export function sanitizeWorkspace(w: Workspace): Workspace {
  const { outbox: _, cursor: __, ...safe } = w;
  return { ...safe, outbox: [], cursor: {} };
}
