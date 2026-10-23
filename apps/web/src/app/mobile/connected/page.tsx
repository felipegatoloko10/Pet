"use client";
import { useEffect } from "react";
const target = "app.pingo.mobile://workspace/callback?connected=1";
export default function Connected() {
  useEffect(() => {
    location.assign(target);
  }, []);
  return (
    <main className="welcome">
      <section
        className="panel"
        style={{ maxWidth: 460, margin: "15vh auto", padding: 28 }}
      >
        <h1>Google conectado</h1>
        <p>A autorização foi salva na sua conta Pingo.</p>
        <a className="button primary" href={target}>
          Voltar ao Pingo
        </a>
      </section>
    </main>
  );
}
