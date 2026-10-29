import { ItemArt } from "./PetItems";
import { useEffect, useRef, useState } from "react";
import { Heart, Apple, Moon, Sun, Sparkles, MessageCircle } from "lucide-react";
import {
  petItems,
  advancePetCare,
  initialPetCare,
  petSleeping,
  type Workspace,
  type Command,
  type PetState,
} from "@pingo/core";
import { Pet } from "./Pet";
import { StickerCluster } from "./Stickers";
export function PetRoom({
  w,
  act,
  onChat,
  soundEnabled,
  speak,
}: {
  w: Workspace;
  act: (c: Command) => Promise<void>;
  onChat: () => void;
  soundEnabled: boolean;
  speak?: (text: string) => () => void;
}) {
  const [tab, setTab] = useState<"care" | "wear" | "room">("care");
  const [now, setNow] = useState(() => new Date());
  const [activity, setActivity] = useState<PetState>();
  const [message, setMessage] = useState("Que bom ter você por aqui. ♡");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => {
      clearInterval(t);
      clearTimeout(timer.current);
    };
  }, []);
  const care = advancePetCare(
    w.petCare ?? initialPetCare(now),
    w.preferences,
    now,
  );
  const progression = w.companion;
  const count = progression?.rewarded.length ?? 0;
  const nextItem = petItems.find((item) => item.at > count);
  const previousCount = useRef(count);
  useEffect(() => {
    if (count > previousCount.current) {
      setActivity("celebrate");
      setMessage("Você cuidou do seu dia! +1 comidinha. ♡");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setActivity(undefined);
        setMessage("");
      }, 2400);
    }
    previousCount.current = count;
  }, [count]);
  const asleep = petSleeping(care, w.preferences, now);
  async function careFor(action: "feed" | "pet" | "play" | "nap" | "wake") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await act({ type: "pet.care", action });
      setNow(new Date());
      setMessage(
        {
          feed: "Um lanchinho e um sorriso. Obrigado!",
          pet: "Carinho recebido. ♡",
          play: "Um pouquinho de diversão faz bem!",
          nap: "Vou cochilar um pouquinho… zzz",
          wake: "Bom te ver! Vamos com calma?",
        }[action],
      );
      setActivity(
        {
          feed: "celebrate",
          pet: "affection",
          play: "hop",
          nap: "sleep",
          wake: "wake",
        }[action] as PetState,
      );
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setActivity(undefined);
        setMessage("");
      }, 4500);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não consegui guardar este cuidado.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="pet-room">
      <div className="pet-room-heading">
        <span className="pill">SEU PEQUENO COMPANHEIRO</span>
        <h2>Um momento com {w.preferences.name}</h2>
        <p>Cuide do seu dia. E receba um carinho no caminho.</p>
      </div>
      <div className="pet-journey">
        <span>♡ {count} tarefa(s) cuidada(s)</span>
        <strong>🍎 {progression?.food ?? 0} comidinha(s)</strong>
        {nextItem ? (
          <>
            <progress
              aria-label="Progresso da coleção"
              value={count}
              max={nextItem.at}
            />
            <small>
              Mais {nextItem.at - count} tarefa(s) para{" "}
              {nextItem.name.toLowerCase()}.
            </small>
          </>
        ) : (
          <small>Sua primeira coleção está completa! ♡</small>
        )}
      </div>
      <div className="pet-room-stage">
        <StickerCluster />
        {(progression?.decorations ?? []).map((id) => (
          <div key={id} className={`room-decoration decoration-${id}`}>
            <ItemArt id={id} />
          </div>
        ))}
        <Pet
          preferences={w.preferences}
          care={care}
          accessory={progression?.accessory}
          message={message}
          activity={
            activity ??
            (asleep
              ? "sleep"
              : care.energy < 25
                ? "yawn"
                : Math.min(care.mood, care.satiety) < 25
                  ? "sit"
                  : undefined)
          }
          soundEnabled={soundEnabled}
          speak={speak}
          onClick={() => void careFor("pet")}
        />
      </div>
      <div className="pet-room-tabs" role="group" aria-label="Espaços do Pingo">
        {(
          [
            ["care", "Cuidar"],
            ["wear", "Vestir"],
            ["room", "Meu cantinho"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "care" ? (
        <>
          <div className="pet-meters">
            {(
              [
                ["Saciedade", care.satiety, "peach"],
                ["Humor", care.mood, "pink"],
                ["Energia", care.energy, "mint"],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label} className={`pet-meter ${color}`}>
                <span>
                  {label}
                  <strong>{Math.round(value)}%</strong>
                </span>
                <progress aria-label={label} max={100} value={value} />
              </div>
            ))}
          </div>
          <div className="pet-care-actions">
            <button disabled={busy} onClick={() => void careFor("pet")}>
              <Heart />
              <span>Carinho</span>
            </button>
            <button
              disabled={busy || !progression?.food}
              onClick={() => void careFor("feed")}
            >
              <Apple />
              <span>Alimentar ({progression?.food ?? 0})</span>
            </button>
            <button disabled={busy} onClick={() => void careFor("play")}>
              <Sparkles />
              <span>Brincar</span>
            </button>
            <button
              disabled={busy}
              onClick={() => void careFor(asleep ? "wake" : "nap")}
            >
              {asleep ? <Sun /> : <Moon />}
              <span>{asleep ? "Acordar" : "Cochilar"}</span>
            </button>
          </div>
          <p className="pet-care-note">
            Cada tarefa concluída dá uma comidinha e melhora o humor. Alimentar
            recupera a saciedade; dormir recupera energia. Carinho e
            brincadeiras são momentos para vocês.
          </p>
          {!progression?.food && (
            <p role="status">Conclua uma tarefa para ganhar uma comidinha. ♡</p>
          )}
          {Math.min(care.satiety, care.mood) < 25 && (
            <p className="pet-care-note">
              Estou mais quietinho hoje. Vamos cuidar de uma tarefa e depois
              fazer um lanchinho?
            </p>
          )}
        </>
      ) : (
        <div className="pet-collection">
          {petItems
            .filter(
              (item) =>
                item.kind === (tab === "wear" ? "accessory" : "decoration"),
            )
            .map((item) => {
              const unlocked = count >= item.at;
              const equipped =
                item.kind === "accessory"
                  ? progression?.accessory === item.id
                  : progression?.decorations.includes(item.id as "cushion");
              return (
                <div
                  className={`collection-item ${unlocked ? "unlocked" : "locked"}`}
                  key={item.id}
                  style={{ background: item.color }}
                >
                  <ItemArt id={item.id} />
                  <strong>{item.name}</strong>
                  <small>
                    {unlocked
                      ? "Conquistado com carinho"
                      : `${count}/${item.at} tarefas concluídas`}
                  </small>
                  <button
                    type="button"
                    className="button"
                    disabled={!unlocked || busy}
                    aria-pressed={!!equipped}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await act({
                          type: "pet.equip",
                          item: item.id,
                          enabled: !equipped,
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {unlocked
                      ? equipped
                        ? "Retirar"
                        : "Usar"
                      : "A conquistar"}
                  </button>
                </div>
              );
            })}
        </div>
      )}
      <button className="button primary" onClick={onChat}>
        <MessageCircle size={18} /> Conversar com {w.preferences.name}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <small className="pet-care-note">
        Seu Pingo nunca morre nem perde os presentes conquistados. Cada retomada
        é um novo começo.
      </small>
    </section>
  );
}
