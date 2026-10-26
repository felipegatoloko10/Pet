import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { Api } from "@pingo/ui/client";
import { Native } from "./native";
type Attempt = { verifier: string; state: string; expiresAt: number };
const random = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export function isAuthCallback(raw: string) {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "app.pingo.mobile:" &&
      u.hostname === "auth" &&
      u.pathname === "/callback"
    );
  } catch {
    return false;
  }
}
export class MobileAuth {
  private resolve?: () => void;
  private reject?: (e: Error) => void;
  private redeem?: Promise<void>;
  private active?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private api: Api,
    private changed: () => void,
  ) {}
  async restore() {
    this.api.token =
      (await Native.readSecure({ key: "session" })).value ?? undefined;
    await App.addListener("appUrlOpen", ({ url }) => {
      void this.receive(url).catch(() => {});
    });
    const launch = await App.getLaunchUrl();
    if (launch?.url) await this.receive(launch.url).catch(() => {});
  }
  login() {
    if (this.active) return this.active;
    this.active = new Promise<void>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      void (async () => {
        const verifier = random(),
          state = random();
        const hash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        );
        const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replaceAll("=", "");
        await Native.writeSecure({
          key: "login",
          value: JSON.stringify({
            verifier,
            state,
            expiresAt: Date.now() + 600000,
          } satisfies Attempt),
        });
        const result = await this.api.post<{ url: string }>(
          "mobile-auth/start",
          { challenge, state },
        );
        if (new URL(result.url).origin !== new URL(this.api.base).origin)
          throw new Error("Destino de login inválido.");
        this.timer = setTimeout(
          () =>
            reject(
              new Error(
                "O login expirou. Toque em Entrar para sincronizar para tentar novamente.",
              ),
            ),
          600000,
        );
        await Browser.open({ url: result.url });
      })().catch(reject);
    }).finally(() => {
      clearTimeout(this.timer);
      this.active = undefined;
      this.resolve = undefined;
      this.reject = undefined;
    });
    return this.active;
  }
  resumed() {
    if (!this.active) return;
    setTimeout(() => {
      if (this.active && !this.redeem)
        this.reject?.(
          new Error(
            "Login interrompido. Toque em Entrar para sincronizar para tentar novamente.",
          ),
        );
    }, 2000);
  }
  async receive(raw: string) {
    const u = new URL(raw);
    if (
      u.protocol === "app.pingo.mobile:" &&
      u.hostname === "workspace" &&
      u.pathname === "/callback"
    ) {
      this.changed();
      return;
    }
    if (!isAuthCallback(raw)) return;
    if (this.redeem) return this.redeem;
    this.redeem = (async () => {
      const saved = (await Native.readSecure({ key: "login" })).value;
      if (!saved) return; // Already consumed or unsolicited callback.
      const attempt = JSON.parse(saved) as Attempt;
      if (attempt.state !== u.searchParams.get("state"))
        throw new Error(
          "O retorno não corresponde ao login iniciado neste aparelho.",
        );
      if (attempt.expiresAt < Date.now())
        throw new Error("O login expirou. Inicie novamente.");
      if (u.searchParams.has("error"))
        throw new Error("Login cancelado. Você pode tentar novamente.");
      const result = await this.api.post<{ access_token: string }>(
        "mobile-auth/exchange",
        {
          id: u.searchParams.get("id"),
          state: attempt.state,
          code: u.searchParams.get("code"),
          verifier: attempt.verifier,
        },
      );
      await Native.writeSecure({ key: "session", value: result.access_token });
      await Native.writeSecure({ key: "login", value: null });
      this.api.token = result.access_token;
      this.resolve?.();
      this.changed();
    })()
      .catch((e) => {
        this.reject?.(e);
        throw e;
      })
      .finally(() => {
        this.redeem = undefined;
      });
    return this.redeem;
  }
}
