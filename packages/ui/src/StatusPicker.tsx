import { useRef, useId } from "react";
import type { Column } from "@pingo/core";
export function StatusPicker({
  columns,
  value,
  onChange,
  label = "Etapa",
}: {
  columns: Column[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const selected = columns.find((c) => c.id === value);
  return (
    <span className="status-picker">
      <button
        type="button"
        className="status-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={(e) => {
          const el = dialog.current;
          if (!el) return;
          if (innerWidth > 760) {
            const r = e.currentTarget.getBoundingClientRect();
            el.style.margin = "0";
            el.style.left = `${Math.max(12, Math.min(r.left, innerWidth - 380))}px`;
            el.style.top = `${Math.max(12, Math.min(r.bottom + 8, innerHeight - 380))}px`;
            el.style.width = "360px";
          } else el.removeAttribute("style");
          el.showModal();
        }}
      >
        <i style={{ background: selected?.color }} />
        {selected?.title ?? "Escolher etapa"}
        <span aria-hidden="true">⌄</span>
      </button>
      <dialog
        ref={dialog}
        className="status-sheet"
        aria-labelledby={title}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <header>
          <h2 id={title}>Alterar etapa</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar etapas"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </header>
        <div className="status-options">
          {columns.map((c) => (
            <button
              type="button"
              key={c.id}
              aria-pressed={value === c.id}
              onClick={() => {
                onChange(c.id);
                dialog.current?.close();
              }}
            >
              <i style={{ background: c.color }} />
              {c.title}
              <span>{value === c.id ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      </dialog>
    </span>
  );
}
