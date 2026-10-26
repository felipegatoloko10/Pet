"use client";
import { useEffect, useState } from "react";
import { AccountForm } from "@pingo/ui/AccountForm";
export default function NativeLogin() {
  const [needsLogin, setNeedsLogin] = useState(false);
  const [status, setStatus] = useState("Abrindo sua conta…");
  const [url, setUrl] = useState("");
  async function authorize() {
    try {
      const params = new URLSearchParams(location.search);
      const id = params.get("id"),
        state = params.get("state");
      if (!id || !state)
        throw new Error("Comece o login pelo aplicativo Pingo.");
      const session = await fetch("/api/auth/get-session").then((r) =>
        r.json(),
      );
      if (!session?.user) {
        setNeedsLogin(true);
        setStatus("");
        return;
      }
      const response = await fetch("/api/v1/desktop-auth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, state }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ?? "Não foi possível autorizar o aplicativo.",
        );
      const target = new URL(data.url);
      if (
        target.protocol !== "pingo:" ||
        target.hostname !== "auth" ||
        target.pathname !== "/callback"
      )
        throw new Error("Retorno inválido.");
      setNeedsLogin(false);
      setUrl(data.url);
      setStatus("Tudo certo! Voltando ao Pingo…");
      location.assign(data.url);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha de conexão.");
    }
  }
  useEffect(() => {
    void authorize();
  }, []);
  return (
    <main className="welcome">
      <section
        className="panel"
        style={{ maxWidth: 480, margin: "10vh auto", padding: 28 }}
      >
        <h1>Sua conta Pingo</h1>
        {needsLogin && <AccountForm onSignedIn={authorize} />}
        <p role="status">{status}</p>
        {url && (
          <a className="button primary" href={url}>
            Voltar ao aplicativo
          </a>
        )}
        <p>Você pode fechar esta página após voltar ao Pingo.</p>
      </section>
    </main>
  );
}
