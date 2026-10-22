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
    expect(jobsFor("alice", w)[0].dueAt).toBe(
      Date.parse("2026-10-23T11:16:00Z"),
    );
  } finally {
    vi.useRealTimers();
  }
});
