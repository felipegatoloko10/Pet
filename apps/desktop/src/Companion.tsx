import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Grip,
  Minus,
  Plus,
  Scaling,
  Sparkles,
  X,
  MessageCircle,
} from "lucide-react";
import { Pet } from "@pingo/ui/Pet";
import type { PetState, Preferences, PetCare } from "@pingo/core";

const playStates: PetState[] = [
  "wave",
  "dance",
  "stretch",
  "hop",
  "groom",
  "roll",
  "curious",
  "peek",
  "surprised",
  "spin",
  "sit",
  "celebrate",
];
export function Companion({
  preferences,
  care,
  accessory,
  message,
  activity,
  busy = false,
  review = false,
  retryText,
  onSend,
  onDismiss,
  onPanel,
  onClose,
  onResize,
  onResizeDrag,
  soundEnabled = false,
  scale = 1,
}: {
  preferences: Preferences;
  care?: PetCare;
  accessory?: string | null;
  message?: string;
  activity?: PetState;
  busy?: boolean;
  review?: boolean;
  retryText?: string;
  soundEnabled?: boolean;
  scale?: number;
  onSend: (text: string) => Promise<boolean>;
  onDismiss: () => void;
  onPanel: () => void;
  onClose: () => void;
  onResize: (factor: number) => void;
  onResizeDrag: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [playing, setPlaying] = useState<PetState>();
  const [affection, setAffection] = useState(false);
  const [listening, setListening] = useState(false);
  const [initial, setInitial] = useState(true);
  const playIndex = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sending = useRef(false),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const initialTimer = setTimeout(() => setInitial(false), 5000);
    return () => {
      clearTimeout(initialTimer);
      clearTimeout(timer.current);
    };
  }, []);
  const text = affection ? "Um carinho muda o dia. ♡" : message;
  function play() {
    setAffection(false);
    setPlaying(playStates[playIndex.current++ % playStates.length]);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(undefined), 5500);
  }
  async function send() {
    if (!draft.trim() || busy || sending.current) return;
    sending.current = true;
    try {
      if (await onSend(draft.trim())) setDraft("");
    } finally {
      sending.current = false;
      input.current?.focus();
    }
  }
  return (
    <main
      className={`desktop-pet ${initial ? "pet-intro" : ""}`}
      style={
        {
          "--companion-color": preferences.color,
          "--character-scale": scale,
        } as CSSProperties
      }
    >
      <div
        className="pet-toolbar"
        data-pet-interactive
        aria-label="Controles do Pingo"
      >
        <button
          type="button"
          className="pet-tool pet-drag-handle"
          data-tauri-drag-region
          aria-label="Arrastar Pingo"
          title="Arraste para mover"
        >
          <Grip size={15} style={{ pointerEvents: "none" }} />
        </button>
        <button
          type="button"
          className="pet-tool"
          aria-label="Diminuir Pingo"
          title="Diminuir"
          onClick={() => onResize(0.9)}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="pet-tool"
          aria-label="Aumentar Pingo"
          title="Aumentar"
          onClick={() => onResize(1.1)}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="pet-tool"
          aria-label="Brincar com Pingo"
          title="Brincar: muda a animação"
          onClick={play}
        >
          <Sparkles size={15} />
        </button>
        <button
          type="button"
          className="pet-tool"
          aria-label="Abrir conversa no painel"
          title="Ver conversa e meu dia"
          onClick={onPanel}
        >
          <ArrowUpRight size={16} />
        </button>
        <button
          type="button"
          className="pet-tool pet-close"
          aria-label="Sair do Pingo"
          title="Sair do Pingo"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <section className="companion-balloon-space" aria-label="Pingo falando">
        {text && (
          <div className="companion-balloon" data-pet-interactive>
            <div className="companion-balloon-header">
              <span>
                <i />
                {preferences.name}
              </span>
              <button
                type="button"
                aria-label="Fechar balão"
                onClick={() => {
                  setAffection(false);
                  onDismiss();
                }}
              >
                <X size={13} />
              </button>
            </div>
            <div className="companion-balloon-text" role="status">
              {text}
            </div>
            {retryText && (
              <button
                type="button"
                className="pet-review"
                onClick={() => {
                  setDraft(retryText);
                  input.current?.focus();
                }}
              >
                Recuperar mensagem pendente
              </button>
            )}
            {review && (
              <button type="button" className="pet-review" onClick={onPanel}>
                Revisar proposta no painel <ArrowUpRight size={13} />
              </button>
            )}
          </div>
        )}
      </section>
      <div className="companion-character">
        <Pet
          preferences={preferences}
          care={care}
          accessory={accessory}
          soundEnabled={soundEnabled}
          message={text}
          activity={
            busy
              ? "think"
              : affection
                ? "affection"
                : (playing ?? (listening && draft ? "listen" : activity))
          }
          onClick={() => {
            setPlaying(undefined);
            setAffection(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setAffection(false), 4000);
          }}
        />
      </div>
      <form
        className="pet-chat-bar"
        data-pet-interactive
        aria-label="Conversa com Pingo"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <MessageCircle size={16} className="pet-chat-icon" aria-hidden="true" />
        <textarea
          ref={input}
          aria-label="Mensagem para Pingo"
          placeholder={`Converse com ${preferences.name}…`}
          rows={1}
          maxLength={6000}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setListening(true)}
          onBlur={() => setListening(false)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="submit"
          aria-label="Enviar mensagem"
          title="Enviar · Enter"
          disabled={busy || !draft.trim()}
        >
          {busy ? (
            <span className="pet-busy-dots" aria-label="Pingo pensando">
              •••
            </span>
          ) : (
            <ArrowUp size={17} />
          )}
        </button>
      </form>
      <button
        type="button"
        className="pet-resize-grip"
        data-pet-interactive
        aria-label="Arrastar para redimensionar"
        title="Arraste para redimensionar, ou use + e −"
        onPointerDown={(e) => {
          if (e.button === 0) {
            e.preventDefault();
            onResizeDrag();
          }
        }}
      >
        <Scaling size={13} />
      </button>
    </main>
  );
}
