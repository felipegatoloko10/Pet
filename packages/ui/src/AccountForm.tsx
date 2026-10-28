import { passwordRules, validPassword } from "@pingo/core";
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
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (signup && (!validPassword(password) || password !== confirmation)) {
      setError("Confira os requisitos e confirme a mesma senha.");
      return;
    }
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
                  name: "Pessoa",
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
          type={visible ? "text" : "password"}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={signup ? 8 : undefined}
          maxLength={128}
          autoComplete={signup ? "new-password" : "current-password"}
          aria-describedby={signup ? "account-password-help" : undefined}
        />
      </label>
      <button
        className="text-link"
        type="button"
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Ocultar senhas" : "Mostrar senhas"}
      </button>
      {signup && (
        <>
          <ul
            id="account-password-help"
            className="password-rules"
            aria-live="polite"
          >
            {passwordRules(password).map((rule) => (
              <li key={rule.label} className={rule.valid ? "valid" : "invalid"}>
                {rule.valid ? "✓" : "○"} {rule.label}
              </li>
            ))}
          </ul>
          <label>
            Confirmar senha
            <input
              name="confirmation"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              maxLength={128}
            />
          </label>
          {confirmation && (
            <small
              className={password === confirmation ? "valid" : "invalid"}
              role="status"
            >
              {password === confirmation
                ? "✓ As senhas coincidem"
                : "As senhas ainda não coincidem"}
            </small>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary"
        disabled={
          busy ||
          (signup && (!validPassword(password) || password !== confirmation))
        }
      >
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
