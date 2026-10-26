import { useState, type FormEvent } from "react";
export type Activation = {
  email: string;
  code: string;
  purpose: "register" | "recover";
};
export function activationFromLocation(): Activation | undefined {
  if (typeof location === "undefined") return;
  const params = new URLSearchParams(location.hash.slice(1));
  const code = params.get("invite"),
    email = params.get("email");
  if (code && /^[A-Za-z0-9_-]{43}$/.test(code) && email)
    return {
      code,
      email,
      purpose: params.get("action") === "recover" ? "recover" : "register",
    };
}

export function AccountForm({
  onSignedIn,
  activation,
}: {
  onSignedIn: () => void | Promise<void>;
  activation?: Activation;
}) {
  const [signup, setSignup] = useState(!!activation);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await fetch(
        signup ? "/api/auth/password/sign-up" : "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
            ...(signup
              ? {
                  name: form.get("name"),
                  inviteCode: activation?.code ?? form.get("inviteCode"),
                  purpose: activation?.purpose ?? "register",
                }
              : {}),
          }),
        },
      );
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.message ?? "Não foi possível entrar agora.");
      await onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de conexão.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      {signup && (
        <label>
          Seu nome
          <input name="name" required maxLength={100} autoComplete="name" />
        </label>
      )}
      <label>
        E-mail
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          defaultValue={activation?.email}
          readOnly={!!activation}
        />
      </label>
      {signup && !activation && (
        <label>
          Convite de primeiro acesso
          <input
            name="inviteCode"
            required
            minLength={43}
            maxLength={43}
            autoComplete="off"
          />
          <small>
            Use o convite privado fornecido pelo administrador. Para recuperar
            uma senha, peça um convite de recuperação.
          </small>
        </label>
      )}
      <label>
        Senha
        <input
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete={signup ? "new-password" : "current-password"}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button className="button primary" disabled={busy}>
        {busy
          ? "Aguarde…"
          : signup
            ? activation?.purpose === "recover"
              ? "Salvar nova senha"
              : "Criar minha conta"
            : "Entrar"}
      </button>
      <button
        type="button"
        className="text-link"
        disabled={busy}
        onClick={() => {
          setSignup(!signup);
          setError("");
          setMessage("");
        }}
      >
        {signup ? "Já tenho uma conta" : "Primeiro acesso? Criar conta"}
      </button>
      <small>
        Conta por convite. A internet é necessária para entrar e sincronizar;
        suas tarefas continuam disponíveis offline.
      </small>
    </form>
  );
}
