"use client";
import { useEffect, useRef, useState } from "react";
export default function DesktopLogin() {
  const [status, setStatus] = useState("Conectando seu Pingo…"),
    [url, setUrl] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const params = new URLSearchParams(location.search),
          id = params.get("id"),
          state = params.get("state");
        if (!id || !state)
          throw new Error("Inicie o login pelo aplicativo Pingo.");
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
          if (!result.url) throw new Error("O Google não iniciou o login.");
          location.assign(result.url);
          return;
        }
        const r = await fetch("/api/v1/desktop-auth/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, state }),
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        setUrl(result.url);
        setStatus("Login concluído. Voltando ao Pingo…");
        location.assign(result.url);
      } catch (e) {
        setStatus((e as Error).message);
      }
    })();
  }, []);
  return (
    <main className="welcome">
      <div className="welcome-brand">pingo</div>
      <section
        className="panel"
        style={{ maxWidth: 500, margin: "10vh auto", padding: 32 }}
      >
        <h1>Seu Pingo no computador</h1>
        <p role="status">{status}</p>
        {url && (
          <a className="button primary" href={url}>
            Abrir Pingo
          </a>
        )}
        <p>Você pode fechar esta página após voltar ao aplicativo.</p>
      </section>
    </main>
  );
}
