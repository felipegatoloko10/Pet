import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Api, type Storage } from "@pingo/ui/client";
import { defaultPreferences, type PetState } from "@pingo/core";
import { Companion } from "./Companion";
import { PetChat, PendingPetMessageError, type PetReply } from "./pet-chat";
import { useDesktopPet } from "./pet-service";
import { resizePet, setupPetWindow } from "./pet-window";

export function NativeCompanion({
  api,
  storageFor,
}: {
  api: Api;
  storageFor: (id: string) => Promise<Storage>;
}) {
  const service = useDesktopPet(api, storageFor);
  useEffect(() => {
    let closed = false,
      stop: (() => void) | undefined;
    void setupPetWindow()
      .then((fn) => {
        if (closed) fn();
        else stop = fn;
      })
      .catch(() => {});
    return () => {
      closed = true;
      stop?.();
    };
  }, []);
  return (
    <CompanionSession
      key={service.sessionVersion}
      api={api}
      storageFor={storageFor}
      service={service}
    />
  );
}
function CompanionSession({
  api,
  storageFor,
  service,
}: {
  api: Api;
  storageFor: (id: string) => Promise<Storage>;
  service: ReturnType<typeof useDesktopPet>;
}) {
  const [chat] = useState(() => new PetChat(api, storageFor));
  const [reply, setReply] = useState<PetReply>();
  const [busy, setBusy] = useState(false);
  const [retryText, setRetryText] = useState<string>();
  const alive = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  async function panel() {
    const id = chat.currentConversation();
    if (id) await emitTo("main", "open-conversation", { id });
    await invoke("open_panel");
  }
  async function send(text: string) {
    setBusy(true);
    setRetryText(undefined);
    clearTimeout(timer.current);
    setReply({ text: "Estou pensando…" });
    try {
      const token = await invoke<string>("read_session");
      if (!alive.current) return false;
      api.token = token;
      if (!navigator.onLine)
        throw new Error(
          "Preciso de internet para conversar. Sua mensagem continua na barra para tentar novamente.",
        );
      const result = await chat.send(text);
      if (!alive.current) return false;
      setReply(result);
      if (!result.suggestions?.length)
        timer.current = setTimeout(
          () => setReply(undefined),
          Math.min(60000, Math.max(14000, result.text.length * 55)),
        );
      // Chat writes enter the same persistent outbox. Flush it even with the panel minimized.
      const syncApi = new Api(api.base, token);
      void syncApi
        .post("sync")
        .catch(() => {})
        .finally(() => {
          if (alive.current && api.token === token) {
            void service.refresh();
            void emit("pet-workspace-changed").catch(() => {});
          }
        });
      return true;
    } catch (error) {
      if (alive.current) {
        setReply({
          text:
            error instanceof Error
              ? error.message
              : "Não consegui responder. Tente novamente.",
        });
        if (error instanceof PendingPetMessageError) setRetryText(error.text);
      }
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Companion
      preferences={service.workspace.preferences}
      message={reply?.text ?? service.bubble}
      activity={reply ? (busy ? "think" : "speak") : service.activity}
      busy={busy}
      review={!!reply?.suggestions?.length}
      retryText={retryText}
      soundEnabled
      onSend={send}
      onDismiss={() => {
        clearTimeout(timer.current);
        setReply(undefined);
        service.setBubble("");
      }}
      onPanel={() =>
        void panel().catch(() =>
          service.setBubble("Abra o painel pelo ícone do Pingo na bandeja."),
        )
      }
      onClose={() => void invoke("quit_pingo")}
      onResize={(factor) =>
        void resizePet(factor).catch(() =>
          service.setBubble(
            "Não consegui ajustar o tamanho. Tente arrastar pelo canto.",
          ),
        )
      }
      onResizeDrag={() =>
        void getCurrentWindow()
          .startResizeDragging("SouthEast")
          .catch(() => {})
      }
    />
  );
}

/** Vite/browser-only preview: no account, native session, Google or AI requests. */
export function PreviewCompanion() {
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false),
    [scale, setScale] = useState(1);
  const pose = new URLSearchParams(location.search).get("pose");
  const states = [
    "idle",
    "blink",
    "look",
    "walk",
    "think",
    "speak",
    "focus",
    "celebrate",
    "affection",
    "yawn",
    "sleep",
    "wake",
    "stretch",
    "wave",
    "dance",
    "groom",
    "curious",
    "hop",
    "peek",
    "listen",
    "roll",
    "sit",
    "surprised",
    "spin",
  ];
  return (
    <Companion
      preferences={{
        ...defaultPreferences,
        sleepStart: "00:00",
        wakeTime: "00:00",
      }}
      message={message}
      activity={states.includes(pose ?? "") ? (pose as PetState) : undefined}
      busy={busy}
      scale={scale}
      onSend={async () => {
        setBusy(true);
        await new Promise((resolve) => setTimeout(resolve, 180));
        setMessage(
          "Esta é a prévia local do Pingo. No aplicativo, nossas conversas usam sua conta e ficam no histórico do painel.",
        );
        setBusy(false);
        return true;
      }}
      onDismiss={() => setMessage(undefined)}
      onPanel={() =>
        setMessage(
          "No aplicativo instalado, este botão abre sua conversa e suas propostas no painel.",
        )
      }
      onClose={() =>
        setMessage(
          "No aplicativo instalado, este botão encerra o Pingo e todas as suas janelas.",
        )
      }
      onResize={(factor) =>
        setScale((value) => Math.max(0.65, Math.min(1.6, value * factor)))
      }
      onResizeDrag={() => {}}
    />
  );
}
