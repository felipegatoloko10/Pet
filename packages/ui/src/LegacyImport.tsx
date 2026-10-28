import { useState } from "react";
import type { Workspace, Command } from "@pingo/core";
export function LegacyImport({
  w,
  act,
}: {
  w: Workspace;
  act: (c: Command) => Promise<void>;
}) {
  const [data, setData] = useState<{
      tasks: Record<string, unknown>[];
      events: Record<string, unknown>[];
      fingerprint: string;
    } | null>(null),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>Importar arquivo da versão antiga</summary>
      <p>
        Escolha o state.json antigo. Não importamos senhas nem autorizações
        externas.
      </p>
      <input
        type="file"
        accept=".json,application/json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 5000000)
              throw new Error("Use um arquivo de até 5 MB.");
            const text = await file.text(),
              raw = JSON.parse(text);
            const tasks =
                raw.Todos ?? raw.todos ?? raw.tasks ?? raw.Tasks ?? [],
              events =
                raw.Events ??
                raw.events ??
                raw.appointments ??
                raw.Appointments ??
                raw.calendarEvents ??
                raw.CalendarEvents ??
                [];
            if (!Array.isArray(tasks) || !Array.isArray(events))
              throw new Error("Arquivo não reconhecido.");
            const hash = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(text),
            );
            setData({
              tasks,
              events,
              fingerprint: Array.from(new Uint8Array(hash))
                .map((v) => v.toString(16).padStart(2, "0"))
                .join(""),
            });
            setStatus("");
          } catch (e) {
            setStatus((e as Error).message);
          }
        }}
      />
      {data && (
        <>
          <p>
            {data.tasks.length} tarefas e {data.events.length} compromissos. Os
            dados atuais serão preservados.
          </p>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await importLegacy(data, w, w.preferences.defaultBoardId, act);
                setData(null);
                setStatus("Importação concluída.");
              } catch (e) {
                setStatus((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar importação
          </button>
        </>
      )}
      {status && <p role="status">{status}</p>}
    </details>
  );
}
async function importLegacy(
  data: {
    tasks: Record<string, unknown>[];
    events: Record<string, unknown>[];
    fingerprint: string;
  },
  w: Workspace,
  boardId: string,
  act: (c: Command) => Promise<void>,
) {
  const b = w.boards.find((b) => b.id === boardId)!;
  for (const [i, t] of data.tasks.entries()) {
    const source = String(t.id ?? t.Id ?? data.fingerprint + ":" + i);
    const importId = `legacy:wpf:task:${source}`;
    if (w.tasks.some((t) => t.importId === importId)) continue;
    const done = Boolean(
      t.Done ??
      t.done ??
      t.isCompleted ??
      t.IsCompleted ??
      t.completed ??
      false,
    );
    await act({
      type: "task.upsert",
      expectedRevision: 0,
      task: {
        id: crypto.randomUUID(),
        boardId: b.id,
        columnId: b.columns.find((c) => c.kind === (done ? "done" : "todo"))!
          .id,
        title: String(t.title ?? t.Title ?? "Tarefa importada"),
        notes: String(t.notes ?? t.Notes ?? ""),
        dueDate:
          typeof (t.Due ?? t.due ?? t.dueDate ?? t.DueDate) === "string"
            ? String(t.Due ?? t.due ?? t.dueDate ?? t.DueDate).slice(0, 10)
            : null,
        scheduledStart: null,
        scheduledEnd: null,
        priority: "normal",
        importId,
      },
    });
  }
  for (const [i, e] of data.events.entries()) {
    const importId = `legacy:wpf:event:${String(e.id ?? e.Id ?? data.fingerprint + ":" + i)}`;
    if (w.events.some((e) => e.importId === importId)) continue;
    const start = String(
      e.start ?? e.Start ?? e.startTime ?? e.StartTime ?? "",
    );
    const end = String(e.end ?? e.End ?? e.endTime ?? e.EndTime ?? "");
    if (!start || !end) continue;
    await act({
      type: "event.upsert",
      expectedRevision: 0,
      confirmed: false,
      event: {
        id: crypto.randomUUID(),
        title: String(e.title ?? e.Title ?? "Compromisso importado"),
        start:
          (e.AllDay ?? e.allDay)
            ? start.slice(0, 10)
            : new Date(start).toISOString(),
        end:
          (e.AllDay ?? e.allDay)
            ? end.slice(0, 10)
            : new Date(end).toISOString(),
        allDay: Boolean(e.AllDay ?? e.allDay),
        calendarId: w.preferences.defaultCalendarId,
        importId,
      },
    });
  }
}
