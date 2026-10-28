import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { createRoot } from "react-dom/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import Database from "@tauri-apps/plugin-sql";
import { Api, type Storage } from "@pingo/ui/client";
import type { Workspace } from "@pingo/core";
import "./pet.css";
const base = import.meta.env.VITE_API_URL ?? "https://pingo-gilt.vercel.app";
const api = new Api(base);
const isPet = new URLSearchParams(location.search).has("pet");
if (isPet) {
  document.documentElement.classList.add("pet-surface");
  document.body.classList.add("pet-body-transparent");
}
const platform = {
  kind: "desktop" as const,
  notifications: {
    status: async () => ((await isPermissionGranted()) ? "granted" : "default"),
    enable: async () => {
      await requestPermission();
    },
    settings: async () => {
      await openUrl("ms-settings:notifications");
    },
    privacy: async () =>
      localStorage.getItem("pingo:notification-hidden") === "true",
    setPrivacy: async (hidden: boolean) => {
      localStorage.setItem("pingo:notification-hidden", String(hidden));
    },
  },
  api,
  onOpenConversation: (handler: (id: string) => void) => {
    const stop = listen<{ id: string }>("open-conversation", (event) =>
      handler(event.payload.id),
    );
    return () => {
      void stop.then((fn) => fn());
    };
  },
  onRemoteUpdate: (handler: () => void) => {
    const stop = listen("pet-workspace-changed", handler);
    return () => {
      void stop.then((fn) => fn());
    };
  },
  onWorkspace: (workspace: Workspace, userId: string) => {
    void emit("workspace-updated", { workspace, userId });
  },
  storage: sqliteStorage,
  login: deviceLogin,
  logout: async () => {
    try {
      await fetch(`${base}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api.token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      /* Offline logout still removes the local credential. */
    }
    api.token = undefined;
    await invoke("save_session", { token: "" });
    await emit("session-changed");
  },
  openExternal: async (url: string) => {
    if (new URL(url).protocol !== "https:")
      throw new Error("Link externo inválido.");
    await openUrl(url);
  },
};
let database: Promise<Database> | undefined;
async function sqliteStorage(userId: string): Promise<Storage> {
  database ??= Database.load("sqlite:pingo.db");
  const db = await database;
  await db.execute(
    "CREATE TABLE IF NOT EXISTS cache(user_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(user_id,key))",
  );
  return {
    get: async (key) => {
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM cache WHERE user_id=$1 AND key=$2",
        [userId, key],
      );
      return rows[0]?.value ?? null;
    },
    set: async (key, value) => {
      await db.execute(
        "INSERT INTO cache(user_id,key,value) VALUES($1,$2,$3) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value",
        [userId, key, value],
      );
    },
    clear: async () => {
      await db.execute("DELETE FROM cache WHERE user_id=$1", [userId]);
    },
  };
}
let loginInProgress: Promise<void> | undefined;
function deviceLogin(): Promise<void> {
  if (loginInProgress) return loginInProgress;
  loginInProgress = browserLogin().finally(() => {
    loginInProgress = undefined;
  });
  return loginInProgress;
}
async function browserLogin() {
  const random = () => {
    const b = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...b))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  };
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
  let stop: (() => void) | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      void (async () => {
        let redeem = false;
        stop = await onOpenUrl((urls) => {
          for (const raw of urls) {
            void (async () => {
              try {
                const u = new URL(raw);
                if (
                  u.protocol !== "pingo:" ||
                  u.hostname !== "auth" ||
                  u.pathname !== "/callback" ||
                  u.searchParams.get("state") !== state ||
                  redeem
                )
                  return;
                redeem = true;
                const r = await fetch(`${base}/api/v1/desktop-auth/exchange`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: u.searchParams.get("id"),
                    code: u.searchParams.get("code"),
                    state,
                    verifier,
                  }),
                });
                const d = await r.json();
                if (!r.ok)
                  throw new Error(
                    d.error ?? "Não foi possível concluir o login.",
                  );
                api.token = d.access_token;
                await invoke("save_session", { token: api.token });
                await emit("session-changed");
                await invoke("open_panel");
                resolve();
              } catch (e) {
                reject(e);
              }
            })();
          }
        });
        const r = await fetch(`${base}/api/v1/desktop-auth/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, challenge }),
        });
        const d = await r.json();
        if (!r.ok)
          throw new Error(d.error ?? "Não foi possível iniciar o login.");
        if (new URL(d.url).origin !== new URL(base).origin)
          throw new Error("Destino de login inválido.");
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "O login expirou. Clique em Entrar para sincronizar para tentar novamente.",
              ),
            ),
          600000,
        );
        await openUrl(d.url);
      })().catch(reject);
    });
  } finally {
    stop?.();
    clearTimeout(timer);
  }
}
async function main() {
  if (isPet) {
    await import("@pingo/ui/avatar.css");
    const { NativeCompanion, PreviewCompanion } =
      await import("./NativeCompanion");
    if (!isTauri()) {
      createRoot(document.getElementById("root")!).render(<PreviewCompanion />);
      return;
    }
    api.token = await invoke<string>("read_session").catch(() => undefined);
    createRoot(document.getElementById("root")!).render(
      <NativeCompanion api={api} storageFor={sqliteStorage} />,
    );
    return;
  }
  await import("@pingo/ui/styles.css");
  const { PingoApp } = await import("@pingo/ui");
  api.token = await invoke<string>("read_session").catch(() => undefined);
  createRoot(document.getElementById("root")!).render(
    <PingoApp platform={platform} />,
  );
}
void main();
