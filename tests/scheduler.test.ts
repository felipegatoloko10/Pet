import { it, expect, vi } from "vitest";
import { jobsFor } from "../apps/web/src/server/notifications";
import { emptyWorkspace } from "../packages/core/src/index";
it("resumo antes do fim do silêncio não interrompe a rotina do restante do dia", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-23T10:15:00Z"));
    const w = emptyWorkspace();
    w.preferences.summaryTime = "07:00";
    expect(jobsFor("alice", w)[0].dueAt).toBe(
      Date.parse("2026-10-23T11:00:00Z"),
    );
    vi.setSystemTime(new Date("2026-10-23T11:01:00Z"));
    w.cursor.routineLastAt = Date.now();
    w.notices = [{ id: "summary:2026-10-23", title: "Resumo", body: "", createdAt: new Date().toISOString(), read: false }];
    expect(jobsFor("alice", w)[0].dueAt).toBe(
      Date.parse("2026-10-23T11:16:00Z"),
    );
  } finally {
    vi.useRealTimers();
  }
});
it("reindexing during active use cannot postpone the next background routine", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    const w = emptyWorkspace();
    w.cursor.routineLastAt = Date.now();
    w.notices = [{ id: "summary:2026-10-23", title: "Resumo", body: "", createdAt: new Date().toISOString(), read: false }];
    const first = jobsFor("alice", w)[0].dueAt;
    vi.setSystemTime(new Date("2026-10-23T12:10:00Z"));
    expect(jobsFor("alice", w)[0].dueAt).toBe(first);
    expect(first).toBe(Date.parse("2026-10-23T12:15:00Z"));
  } finally { vi.useRealTimers(); }
});
it("an unsent daily summary remains due after its configured time", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    const w = emptyWorkspace();
    w.cursor.routineLastAt = Date.now();
    expect(jobsFor("alice", w)[0].dueAt).toBeLessThanOrEqual(Date.now());
    vi.setSystemTime(new Date("2026-10-23T12:01:00Z"));
    expect(jobsFor("alice", w)[0].dueAt).toBeLessThanOrEqual(Date.now());
  } finally { vi.useRealTimers(); }
});
