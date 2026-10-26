"use client";
import { useEffect, useState } from "react";
import { AccountForm } from "@pingo/ui/AccountForm";
export default function Device() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [logged, setLogged] = useState(false);
  useEffect(() => {
    setCode(new URLSearchParams(location.search).get("user_code") ?? "");
    void fetch("/api/auth/get-session")
      .then((r) => r.json())
      .then((s) => setLogged(!!s?.user));
  }, []);
  async function approve(allow: boolean) {
    const claim = await fetch(
      `/api/auth/device?user_code=${encodeURIComponent(code)}`,
    );
    if (!claim.ok) {
      const error = await claim.json();
      setStatus(
        error.error_description ??
          "Não foi possível validar o computador. Inicie novamente no aplicativo.",
      );
      return;
    }
    const r = await fetch(`/api/auth/device/${allow ? "approve" : "deny"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCode: code }),
    });
    const result = await r.json();
    setStatus(
      r.ok
        ? allow
          ? "Computador autorizado. Você pode voltar ao Pingo."
          : "Autorização recusada."
        : (result.error_description ??
            result.message ??
            "Não foi possível autorizar. Inicie novamente no aplicativo."),
    );
  }
  return (
    <main className="welcome">
      <div className="welcome-brand">pingo</div>
      <div
        className="panel editor-form"
        style={{ maxWidth: 440, margin: "10vh auto" }}
      >
        <h1>Seu Pingo no PC</h1>
        <p>
          Autorize apenas se você iniciou o login no aplicativo Pingo deste
          computador.
        </p>
        <label>
          Código exibido no aplicativo
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        {logged ? (
          <>
            <button
              className="button primary"
              onClick={() => void approve(true)}
            >
              Autorizar meu computador
            </button>
            <button className="button" onClick={() => void approve(false)}>
              Recusar
            </button>
          </>
        ) : (
          <AccountForm onSignedIn={() => setLogged(true)} />
        )}
        <p role="status">{status}</p>
      </div>
    </main>
  );
}
