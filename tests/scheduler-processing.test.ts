import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { emptyWorkspace, type Workspace } from "../packages/core/src/index";
const memory = vi.hoisted(() => ({ workspace: null as Workspace | null, subs: [] as { id: string; data: object }[] }));
vi.mock("../apps/web/src/server/workspace", () => ({
  readWorkspace: async () => structuredClone(memory.workspace),
  mutateWorkspace: async (_id: string, fn: (w: Workspace) => unknown) => fn(memory.workspace!),
}));
vi.mock("../apps/web/src/server/sync", () => ({ syncGoogle: vi.fn(), calendarRange: vi.fn(async () => []) }));
vi.mock("../apps/web/src/server/ai", () => ({ maybeProactive: vi.fn() }));
vi.mock("../apps/web/src/server/db", () => ({ db: () => ({ select: () => ({ from: () => ({ where: async () => memory.subs }) }) }) }));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => {}) } }));
import webpush from "web-push";
import { calendarRange } from "../apps/web/src/server/sync";
import { jobsFor, processJob, type Job } from "../apps/web/src/server/notifications";
const call = vi.fn(async () => Response.json({ ok: true }));
function job(): Job { return jobsFor("alice", memory.workspace!).find(j => j.kind === "reminder")!; }
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  memory.workspace = emptyWorkspace();
  memory.workspace.events = [{ id: "event", title: "Dentista", start: "2026-10-23T12:20:00Z", end: "2026-10-23T13:00:00Z", allDay: false, calendarId: "primary", revision: 1, syncState: "synced" }];
  memory.subs = [];
  vi.stubEnv("SCHEDULER_URL", "https://scheduler.example.invalid");
  vi.stubEnv("SCHEDULER_SECRET", "test-only-scheduler-key-not-a-real-secret");
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  vi.stubGlobal("fetch", call);
  call.mockClear();
  vi.mocked(webpush.sendNotification).mockClear();
  vi.mocked(calendarRange).mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("creates one reminder on retry and republishes the current revision", async () => {
  const input = job();
  await processJob(input); await processJob(input);
  expect(memory.workspace!.notices).toHaveLength(1);
  const payload = JSON.parse((call.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
  expect(payload.revision).toBe(memory.workspace!.revision);
  expect(payload.jobs.every((j: Job) => j.id !== input.id)).toBe(true);
});
it.each(["moved", "deleted", "earlier-reminder", "all-day"])("does not notify a stale %s event", async kind => {
  const input = job(), w = memory.workspace!;
  if (kind === "moved") w.events[0].start = "2026-10-24T12:20:00Z";
  if (kind === "deleted") w.events[0].deleted = true;
  if (kind === "earlier-reminder") w.preferences.reminderMinutes = 5;
  if (kind === "all-day") w.events[0].allDay = true;
  await processJob(input);
  expect(w.notices).toHaveLength(0);
});
it("does not resend an unread push when a job is retried", async () => {
  vi.stubEnv("VAPID_PRIVATE_KEY", "fake-private"); vi.stubEnv("VAPID_PUBLIC_KEY", "fake-public");
  memory.subs = [{ id: "browser-one", data: {} }];
  const input = job();
  await processJob(input); await processJob(input);
  expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  expect(memory.workspace!.cursor.push?.[input.id]?.["browser-one"].sent).toBe(true);
});
it("retries transient push failures without repeating successful deliveries", async () => {
  vi.stubEnv("VAPID_PRIVATE_KEY", "fake-private"); vi.stubEnv("VAPID_PUBLIC_KEY", "fake-public");
  memory.subs = [{ id: "browser-one", data: {} }];
  vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 503 });
  const input = job();
  await expect(processJob(input)).rejects.toThrow("entregas push");
  expect(call).not.toHaveBeenCalled();
  await processJob(input); await processJob(input);
  expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
});
it("loads recurring instances for the next 48 hours during background routine", async () => {
  await processJob(jobsFor("alice", memory.workspace!)[0]);
  expect(calendarRange).toHaveBeenCalledWith("alice", "2026-10-23T12:00:00.000Z", "2026-10-25T12:00:00.000Z");
});
