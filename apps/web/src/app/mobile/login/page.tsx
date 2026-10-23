"use client";
import { useEffect, useRef, useState } from "react";
export default function MobileLogin() {
  const [status, setStatus] = useState("Entrando no seu Pingo…");
  const [returnUrl, setReturnUrl] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const params = new URLSearchParams(location.search);
      const id = params.get("id"),
        state = params.get("state"),
        ticket = params.get("ticket");
      if ((!id || !state) && !ticket)
        throw new Error("Comece esta etapa pelo aplicativo Pingo.");
      const session = await fetch("/api/auth/get-session").then((r) =>
        r.json(),
      );
      if (!session?.user) {
        const result = await fetch("/api/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            callbackURL: location.href,
          }),
        }).then((r) => r.json());
        if (
          !result.url ||
          new URL(result.url).origin !== "https://accounts.google.com"
        )
          throw new Error("O Google não iniciou o login.");
        location.assign(result.url);
        return;
      }
      const response = await fetch(
        ticket
          ? "/api/v1/mobile/workspace/authorize"
          : "/api/v1/mobile-auth/authorize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ticket ? { ticket } : { id, state }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Não foi possível autorizar o aplicativo.",
        );
      const u = new URL(result.url);
      if (ticket && u.origin === "https://accounts.google.com") {
        location.assign(result.url);
        return;
      }
      if (
        u.protocol !== "app.pingo.mobile:" ||
        u.hostname !== "auth" ||
        u.pathname !== "/callback"
      )
        throw new Error("Retorno inválido.");
      setReturnUrl(result.url);
      setStatus("Tudo certo! Voltando ao Pingo no seu celular…");
      location.assign(result.url);
    })().catch((e) => setStatus(e.message));
  }, []);
  return (
    <main className="welcome">
      <section
        className="panel"
        style={{ maxWidth: 460, margin: "15vh auto", padding: 28 }}
      >
        <div className="welcome-brand">pingo</div>
        <h1>Seu companheiro no celular</h1>
        <p role="status">{status}</p>
        {returnUrl && (
          <a className="button primary" href={returnUrl}>
            Voltar ao Pingo
          </a>
        )}
        <p>Você pode fechar esta página após voltar ao aplicativo.</p>
      </section>
    </main>
  );
}
