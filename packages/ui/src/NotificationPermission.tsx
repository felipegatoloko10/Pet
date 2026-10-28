import { useEffect, useRef, useState } from "react";
import type { Platform } from "./index";
import type { PingoClient } from "./client";
export function NotificationPermission({
  platform,
  client,
}: {
  platform: Platform;
  client: PingoClient;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [state, setState] = useState("default"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const key = "pingo:notification-consent:v1";
  async function check(manual = false) {
    try {
      const status = platform.notifications?.status
        ? await platform.notifications.status()
        : "Notification" in window
          ? Notification.permission
          : "unsupported";
      setState(status);
      let saved: { at?: number; never?: boolean } = {};
      try {
        saved = JSON.parse(localStorage.getItem(key) ?? "{}");
      } catch {}
      if (
        manual ||
        (status !== "granted" &&
          status !== "unsupported" &&
          !saved.never &&
          Date.now() - (saved.at ?? 0) > 7 * 86400000)
      )
        dialog.current?.showModal();
      if (status === "granted" && !manual) dialog.current?.close();
    } catch {
      /* Permission introspection must not block the app. */
    }
  }
  useEffect(() => {
    if (!client.demo) void check();
    const open = () => void check(true),
      resume = () => {
        if (document.visibilityState === "visible") void check();
      };
    window.addEventListener("pingo-notification-prompt", open);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("pingo-notification-prompt", open);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [platform, client]);
  function close(never = false) {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), never }));
    dialog.current?.close();
  }
  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      if (platform.notifications) {
        if (state === "denied")
          await (
            platform.notifications.permissionSettings ??
            platform.notifications.settings
          )();
        else await platform.notifications.enable();
      } else {
        if (state === "denied") {
          setMessage(
            "No menu do navegador, abra as permissões deste site e permita Notificações. Depois volte ao Pingo.",
          );
          return;
        }
        if (!("Notification" in window)) {
          setMessage(
            "Este navegador não oferece notificações. No iPhone, adicione o Pingo à Tela de Início e abra por lá.",
          );
          return;
        }
        const permission = await Notification.requestPermission();
        setState(permission);
        if (permission !== "granted") {
          setMessage("Você pode ativar mais tarde nos Ajustes.");
          return;
        }
        if (!client.localOnly && !client.demo) {
          const registration = await navigator.serviceWorker.register("/sw.js");
          const response = await fetch("/push-key");
          const { key: publicKey } = await response.json();
          if (!publicKey)
            throw new Error(
              "Os avisos em segundo plano ainda não estão disponíveis. Sua permissão foi salva.",
            );
          const subscription =
            (await registration.pushManager.getSubscription()) ??
            (await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: publicKey,
            }));
          await client.api.post("push", subscription.toJSON());
        }
      }
      await check(true);
      setMessage(
        "Confira a permissão e volte ao Pingo. Você pode fechar esta janela.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="permission-dialog"
      aria-labelledby="permission-title"
      onCancel={() => close()}
    >
      <h2 id="permission-title">Vamos lembrar você? ♡</h2>
      <p>
        Ative os avisos para receber seus lembretes e acompanhar as tarefas,
        mesmo sem estar olhando o Pingo.
      </p>
      <p>
        {state === "granted"
          ? "As notificações estão permitidas neste aparelho."
          : state === "denied"
            ? "As notificações estão bloqueadas. Vamos ajudar você a abrir as permissões."
            : "Você escolhe os horários e o silêncio nos Ajustes."}
      </p>
      {message && <p role="status">{message}</p>}
      <div className="editor-form">
        {(state !== "granted" ||
          (!platform.notifications && !client.localOnly)) && (
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void enable()}
          >
            {busy
              ? "Aguarde…"
              : state === "denied"
                ? "Abrir permissões"
                : state === "granted"
                  ? "Atualizar ativação"
                  : "Ativar notificações"}
          </button>
        )}
        <button type="button" className="button" onClick={() => close()}>
          {state === "granted" ? "Tudo certo" : "Agora não"}
        </button>
        {state !== "granted" && (
          <button
            type="button"
            className="text-link"
            onClick={() => close(true)}
          >
            Não lembrar novamente
          </button>
        )}
      </div>
    </dialog>
  );
}
