import { companionSchema } from "./companion";
import { repetitionSchema } from "./recurrence";
import { z } from "zod";
import {
  taskInput,
  eventInput,
  preferenceInput,
  type Workspace,
  type Task,
  type CalendarEvent,
} from "./index";
import { mirrorId, reconcileTaskCalendars } from "./planning";

const column = z.object({
  id: z.string().max(200),
  title: z.string().min(1).max(100),
  kind: z.enum(["todo", "active", "waiting", "done", "custom"]),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});
export function pingoImportInput() {
  return z.object({
    companion: companionSchema.optional(),
    taskSeries: z
      .array(
        z.object({
          id: z.string().max(200),
          routineId: z.string().max(200).optional(),
          deleted: z.boolean().optional(),
          revision: z.number().int(),
          start: z.iso.date(),
          end: z.iso.date().optional(),
          rule: repetitionSchema,
          timezone: preferenceInput.shape.timezone,
          template: taskInput.extend({
            completed: z.boolean(),
            revision: z.number().int(),
            syncState: z.enum([
              "pending",
              "syncing",
              "synced",
              "error",
              "conflict",
            ]),
          }),
          exclusions: z.array(z.iso.date()).optional(),
          pauses: z.array(
            z.object({ start: z.iso.date(), end: z.iso.date().optional() }),
          ),
        }),
      )
      .max(1000)
      .optional(),
    calendars: z
      .array(
        z.object({
          id: z.string().max(200),
          title: z.string().max(200),
          holiday: z.boolean().optional(),
          readOnly: z.boolean().optional(),
        }),
      )
      .max(100)
      .optional(),
    preferences: preferenceInput.optional(),
    petCare: z
      .object({
        satiety: z.number().min(0).max(100),
        mood: z.number().min(0).max(100),
        energy: z.number().min(0).max(100),
        updatedAt: z.iso.datetime({ offset: true }),
        napUntil: z.iso.datetime({ offset: true }).optional(),
        awakeUntil: z.iso.datetime({ offset: true }).optional(),
      })
      .optional(),
    conversations: z
      .array(
        z.object({
          id: z.string().max(200),
          title: z.string().min(1).max(100),
          archived: z.boolean(),
          updatedAt: z.iso.datetime({ offset: true }),
          messages: z
            .array(
              z.object({
                id: z.string().max(200).optional(),
                role: z.enum(["user", "assistant"]),
                text: z.string().max(100000),
              }),
            )
            .max(1000),
        }),
      )
      .max(100)
      .optional(),
    boards: z
      .array(
        z.object({
          id: z.string().max(200),
          title: z.string().max(200),
          columns: z.array(column).max(50),
        }),
      )
      .max(30),
    tasks: z
      .array(
        taskInput.extend({
          seriesId: z.string().max(200).optional(),
          occurrenceDate: z.iso.date().optional(),
          completed: z.boolean().default(false),
          completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
          deleted: z.boolean().optional(),
        }),
      )
      .max(1000),
    events: z
      .array(
        eventInput.extend({
          transparent: z.boolean().optional(),
          deleted: z.boolean().optional(),
          columnId: z.string().max(200).optional(),
          completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
        }),
      )
      .max(1000),
  });
}
export type PingoImport = z.infer<ReturnType<typeof pingoImportInput>>;

/** Additive, stable IDs: importing a backup twice never overwrites newer edits. */
export function importPingoData(w: Workspace, input: PingoImport) {
  const destination =
    w.boards.find((b) => b.id === w.preferences.defaultBoardId) ?? w.boards[0];
  if (!destination) throw new Error("Crie o quadro antes de importar.");
  const holidayCalendars = new Map<string, string>();
  for (const calendar of input.calendars ?? [])
    if (calendar.holiday) {
      const id = `pingo-holiday:${mirrorId(calendar.id)}`;
      if (!w.calendars.some((c) => c.id === id))
        w.calendars.push({
          id,
          title: calendar.title,
          holiday: true,
          readOnly: true,
        });
      holidayCalendars.set(calendar.id, id);
    }
  const restoreSettings = !w.migrationSettingsRestored;
  const columns = new Map<string, string>();
  for (const board of input.boards)
    for (const c of board.columns) {
      let target = destination.columns.find(
        (x) => c.kind !== "custom" && x.kind === c.kind,
      );
      const id = `import:${mirrorId(c.id)}`;
      target ??= destination.columns.find((x) => x.id === id);
      if (!target) {
        target = { ...c, id };
        destination.columns.push(target);
      }
      if (restoreSettings && c.kind !== "custom") {
        target.title = c.title;
        target.color = c.color;
      }
      columns.set(c.id, target.id);
    }
  for (const series of input.taskSeries ?? [])
    if (!w.taskSeries?.some((s) => s.id === series.id))
      (w.taskSeries ??= []).push({
        ...series,
        template: {
          ...series.template,
          boardId: destination.id,
          columnId:
            columns.get(series.template.columnId) ??
            destination.columns.find((c) => c.kind === "todo")!.id,
        },
      });
  for (const t of input.tasks.filter((t) => !t.deleted)) {
    // Existing Pingo IDs are preserved, so moving the same backup between devices is safe.
    if (w.tasks.some((x) => x.id === t.id)) continue;
    const copy: Task = {
      ...t,
      id: t.id,
      boardId: destination.id,
      columnId:
        columns.get(t.columnId) ??
        destination.columns.find(
          (c) => c.kind === (t.completed ? "done" : "todo"),
        )!.id,
      revision: 1,
      syncState: "pending",
    };
    w.tasks.push(copy);
    if (
      copy.completed &&
      w.companion &&
      !w.companion.baseline.includes(copy.id)
    )
      w.companion.baseline.push(copy.id);
  }
  for (const e of input.events.filter((e) => !e.deleted && !e.taskId)) {
    if (w.events.some((x) => x.id === e.id)) continue;
    const copy: CalendarEvent = {
      ...e,
      id: e.id,
      calendarId:
        holidayCalendars.get(e.calendarId) ?? w.preferences.defaultCalendarId,
      transparent: holidayCalendars.has(e.calendarId) ? true : e.transparent,
      columnId: e.columnId ? columns.get(e.columnId) : undefined,
      revision: 1,
      syncState: "pending",
    };
    // Invitations and external authorization are never imported or executed.
    delete copy.attendees;
    w.events.push(copy);
  }
  for (const conversation of input.conversations ?? [])
    if (!w.conversations?.some((c) => c.id === conversation.id))
      (w.conversations ??= []).push(conversation);
  if (restoreSettings && input.preferences) {
    w.preferences = {
      ...input.preferences,
      defaultBoardId: destination.id,
      defaultCalendarId: w.preferences.defaultCalendarId,
      proactiveAI: false,
    };
    if (w.preferences.aiProvider === "google") {
      w.preferences.aiProvider = "openai";
      w.preferences.aiModel = "";
    }
    if (input.petCare) w.petCare = input.petCare;
    // Restore once into a fresh account/device; never add balances to an existing game.
    if (
      input.companion &&
      w.companion &&
      !w.companion.rewarded.length &&
      !w.companion.careOperations.length
    )
      w.companion = {
        ...structuredClone(input.companion),
        baseline: [
          ...new Set([...w.companion.baseline, ...input.companion.baseline]),
        ],
      };
    w.migrationSettingsRestored = true;
  }
  destination.revision++;
  reconcileTaskCalendars(w, () => {});
}
