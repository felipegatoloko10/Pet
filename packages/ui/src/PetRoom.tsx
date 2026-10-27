import { useEffect, useRef, useState } from "react";
import { Heart, Apple, Moon, Sun, Sparkles, MessageCircle } from "lucide-react";
import {
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
      <div className="pet-room-stage">
        <StickerCluster />
        <Pet
          preferences={w.preferences}
          care={care}
          message={message}
          activity={
            activity ??
            (asleep
              ? "sleep"
              : care.energy < 25
                ? "yawn"
                : care.mood < 25
                  ? "sit"
                  : undefined)
          }
          soundEnabled={soundEnabled}
          speak={speak}
          onClick={() => void careFor("pet")}
        />
      </div>
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
        <button disabled={busy} onClick={() => void careFor("feed")}>
          <Apple />
          <span>Alimentar</span>
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
      <button className="button primary" onClick={onChat}>
        <MessageCircle size={18} /> Conversar com {w.preferences.name}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <small className="pet-care-note">
        Tudo no seu ritmo. Os cuidados são opcionais e não afetam suas tarefas.
      </small>
    </section>
  );
}
