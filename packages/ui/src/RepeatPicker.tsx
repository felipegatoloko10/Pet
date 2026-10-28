import type { Repetition } from "@pingo/core";
const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function RepeatPicker({
  value,
  onChange,
}: {
  value: Repetition | null;
  onChange: (r: Repetition | null) => void;
}) {
  const update = (p: Partial<Repetition>) => onChange({ ...value!, ...p });
  const toggle = (values: number[], n: number) =>
    values.includes(n)
      ? values.filter((x) => x !== n)
      : [...values, n].sort((a, b) => a - b);
  const summary = !value
    ? "Apenas nesta data"
    : value.kind === "daily"
      ? "Todos os dias"
      : value.kind === "weekly"
        ? `Toda semana: ${value.weekdays.map((d) => days[d]).join(", ")}`
        : value.kind === "monthly"
          ? `Todo mês: ${value.monthDays.join(", ")}${value.lastDay ? " · último dia" : ""}`
          : `A cada ${value.interval} dias, desde a data inicial`;
  return (
    <fieldset className="repeat-picker">
      <legend>Repetir</legend>
      <div className="repeat-options">
        {[
          ["none", "Não repetir"],
          ["daily", "Todos os dias"],
          ["weekly", "Dias da semana"],
          ["monthly", "Dias do mês"],
          ["interval", "A cada X dias"],
        ].map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className="button"
            aria-pressed={(value?.kind ?? "none") === kind}
            onClick={() =>
              onChange(
                kind === "none"
                  ? null
                  : {
                      weekdays: [1, 3, 5],
                      monthDays: [1],
                      lastDay: false,
                      interval: 2,
                      until: null,
                      count: null,
                      ...(value ?? {}),
                      ...{ kind: kind as Repetition["kind"] },
                    },
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
      {value?.kind === "weekly" && (
        <div className="day-options">
          {days.map((d, i) => (
            <button
              type="button"
              key={d}
              aria-pressed={value.weekdays.includes(i)}
              onClick={() => update({ weekdays: toggle(value.weekdays, i) })}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      {value?.kind === "monthly" && (
        <>
          <div className="day-options month-options">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={value.monthDays.includes(n)}
                onClick={() =>
                  update({ monthDays: toggle(value.monthDays, n) })
                }
              >
                {n}
              </button>
            ))}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={value.lastDay}
              onChange={(e) => update({ lastDay: e.target.checked })}
            />
            Último dia do mês
          </label>
          <small>
            Se o mês não tiver um dia escolhido, usamos o último dia.
          </small>
        </>
      )}
      {value?.kind === "interval" && (
        <label>
          A cada quantos dias?
          <input
            type="number"
            min={1}
            max={3650}
            required
            value={value.interval}
            onChange={(e) => update({ interval: Number(e.target.value) })}
          />
        </label>
      )}
      {value && (
        <>
          <div className="repeat-options">
            {["Nunca", "Em uma data", "Após X vezes"].map((label, i) => (
              <button
                type="button"
                className="button"
                key={label}
                aria-pressed={i === (value.until ? 1 : value.count ? 2 : 0)}
                onClick={() =>
                  update({
                    until:
                      i === 1 ? new Date().toISOString().slice(0, 10) : null,
                    count: i === 2 ? 10 : null,
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          {value.until && (
            <label>
              Termina em
              <input
                type="date"
                required
                value={value.until}
                onChange={(e) => update({ until: e.target.value })}
              />
            </label>
          )}
          {value.count && (
            <label>
              Quantidade de ocorrências
              <input
                type="number"
                min={1}
                max={10000}
                required
                value={value.count}
                onChange={(e) => update({ count: Number(e.target.value) })}
              />
            </label>
          )}
        </>
      )}
      <p role="status">↻ {summary}</p>
    </fieldset>
  );
}
