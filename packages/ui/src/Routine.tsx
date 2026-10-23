import type { RoutineDay } from "@pingo/core";
export function Routine({
  value,
  onChange,
}: {
  value: RoutineDay[];
  onChange: (days: RoutineDay[]) => void;
}) {
  const names = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ];
  function update(
    day: number,
    kind: "work" | "personal",
    index: number,
    field: "start" | "end",
    text: string,
  ) {
    const days = structuredClone(value),
      item = days.find((d) => d.day === day)!;
    item[kind][index][field] = text;
    onChange(days);
  }
  return (
    <section className="routine-editor">
      <h2>Trabalho e tempo pessoal</h2>
      <p>
        Horários não cadastrados são desconhecidos para o Pingo. Separe os
        blocos para incluir suas pausas.
      </p>
      {[1, 2, 3, 4, 5, 6, 0].map((day) => {
        const current = value.find((d) => d.day === day) ?? {
          day,
          work: [],
          personal: [],
        };
        return (
          <details key={day}>
            <summary>
              {names[day]} · {current.work.length} bloco(s) de trabalho ·{" "}
              {current.personal.length} pessoal(is)
            </summary>
            {(
              [
                ["work", "Trabalho"],
                ["personal", "Disponível para compromissos pessoais"],
              ] as const
            ).map(([kind, label]) => (
              <div key={kind}>
                <strong>{label}</strong>
                {current[kind].map((slot, index) => (
                  <div className="routine-slot" key={index}>
                    <input
                      aria-label={`${names[day]} ${label} início ${index + 1}`}
                      type="time"
                      required
                      value={slot.start}
                      onChange={(e) =>
                        update(day, kind, index, "start", e.target.value)
                      }
                    />
                    <span>até</span>
                    <input
                      aria-label={`${names[day]} ${label} fim ${index + 1}`}
                      type="time"
                      required
                      value={slot.end}
                      onChange={(e) =>
                        update(day, kind, index, "end", e.target.value)
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remover bloco ${names[day]} ${label} ${index + 1}`}
                      onClick={() =>
                        onChange([
                          ...value.filter((d) => d.day !== day),
                          {
                            ...current,
                            [kind]: current[kind].filter((_, i) => i !== index),
                          },
                        ])
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="text-link"
                  type="button"
                  disabled={current[kind].length >= 6}
                  onClick={() =>
                    onChange([
                      ...value.filter((d) => d.day !== day),
                      {
                        ...current,
                        [kind]: [
                          ...current[kind],
                          {
                            start: kind === "work" ? "09:00" : "18:00",
                            end: kind === "work" ? "12:00" : "20:00",
                          },
                        ],
                      },
                    ])
                  }
                >
                  ＋ Adicionar bloco
                </button>
              </div>
            ))}
          </details>
        );
      })}
    </section>
  );
}
