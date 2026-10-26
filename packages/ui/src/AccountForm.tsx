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
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        signup
          ? activation
            ? "/api/auth/password/sign-up"
            : "/api/auth/sign-up/email"
          : "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: String(form.get("email") ?? "")
              .trim()
              .toLowerCase(),
            password: form.get("password"),
            ...(signup
              ? {
                  name: form.get("name"),
                  ...(activation
                    ? {
                        inviteCode: activation.code,
                        purpose: activation.purpose,
                      }
                    : {}),
                }
              : {}),
          }),
        },
      );
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          data.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
            ? "Já existe uma conta com este e-mail. Use Entrar."
            : data.code === "INVALID_EMAIL_OR_PASSWORD"
              ? "E-mail ou senha incorretos."
              : (data.message ?? "Não foi possível entrar agora."),
        );
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
      <label>
        Senha
        <input
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete={signup ? "new-password" : "current-password"}
          aria-describedby={signup ? "account-password-help" : undefined}
        />
      </label>
      {signup && (
        <small id="account-password-help">Use pelo menos 10 caracteres.</small>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
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
        }}
      >
        {signup ? "Já tenho uma conta" : "Não tem conta? Criar conta"}
      </button>
      <small>
        A internet é necessária para criar a conta, entrar e sincronizar; suas
        tarefas continuam disponíveis offline.
      </small>
    </form>
  );
}
