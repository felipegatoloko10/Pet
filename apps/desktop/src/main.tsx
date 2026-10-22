import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import Database from "@tauri-apps/plugin-sql";
import { PingoApp, Pet, Api, type Storage } from "@pingo/ui";
import {
  emptyWorkspace,
  isQuiet,
  petState,
  type Workspace,
  type Notice,
} from "@pingo/core";
import "@pingo/ui/styles.css";
import "./pet.css";
const base =
  import.meta.env.VITE_API_URL ?? "https://pingo-feh-team.vercel.app";
const api = new Api(base);
const platform = {
  api,
  storage: sqliteStorage,
  login: deviceLogin,
  logout: async () => {
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
async function deviceLogin() {
  const codeResponse = await fetch(`${base}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "pingo-desktop" }),
  });
  const code = await codeResponse.json();
  if (!codeResponse.ok)
    throw new Error("O servidor não iniciou a autorização.");
  await invoke("show_device_code", { code: code.user_code });
  const verify = new URL(code.verification_uri_complete);
  if (verify.origin !== new URL(base).origin)
    throw new Error("Página de autorização inválida.");
  await openUrl(verify.toString());
  let interval = Math.max(5, code.interval ?? 5);
  const expires = Date.now() + Math.min(code.expires_in, 600) * 1000;
  while (Date.now() < expires) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    const r = await fetch(`${base}/api/auth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: code.device_code,
        client_id: "pingo-desktop",
      }),
    });
    const data = await r.json();
    if (r.ok) {
      api.token = data.access_token;
      await invoke("save_session", { token: api.token });
      await emit("session-changed");
      return;
    }
    if (data.error === "slow_down") {
      interval += 5;
      continue;
    }
    if (data.error !== "authorization_pending")
      throw new Error("Autorização recusada ou expirada.");
  }
  throw new Error("O código expirou. Inicie o login novamente.");
}
function PetWindow() {
  const [w, setW] = useState<Workspace>(emptyWorkspace());
  const [bubble, setBubble] = useState("");
  const [state, setState] = useState<"idle" | "think" | "celebrate">("idle");
  useEffect(() => {
    let active = true;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sound: AudioContext | undefined;
    const deviceId =
      localStorage.getItem("pingo:device") ?? crypto.randomUUID();
    localStorage.setItem("pingo:device", deviceId);
    async function show(n: Notice, workspace: Workspace) {
      if (!active) return;
      setBubble(n.body);
      clearTimeout(timer);
      timer = setTimeout(() => setBubble(""), 18000);
      if (
        !n.silent &&
        !isQuiet(new Date(), workspace.preferences) &&
        workspace.preferences.voice &&
        "speechSynthesis" in window
      ) {
        const utterance = new SpeechSynthesisUtterance(n.body);
        utterance.lang = "pt-BR";
        speechSynthesis.speak(utterance);
      }
    }
    const tick = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        api.token = await invoke<string>("read_session");
        if (!api.token) {
          setBubble("Abra meu painel para entrar.");
          return;
        }
        const { workspace, user } = await api.request<{
          workspace: Workspace;
          user: { id: string };
        }>("workspace");
        const next = { ...emptyWorkspace(), ...workspace };
        const storage = await sqliteStorage(user.id);
        await storage.set("pet-cache", JSON.stringify(next));
        localStorage.setItem("pingo:pet-user", user.id);
        setW(next);
        for (const n of next.notices.filter((n) => !n.read && !n.deliveredBy)) {
          const r = await api.post<{ claimed: boolean }>(
            "notifications/claim",
            { id: n.id, deviceId },
          );
          if (r.claimed) await show(n, next);
        }
        const localId = (z: string) => `local-reminder:${z}`;
        for (const e of next.events.filter((e) => !e.deleted && !e.allDay)) {
          const delta = Date.parse(e.start) - Date.now();
          const id = localId(e.id + ":" + e.start);
          if (
            delta >= 0 &&
            delta <= next.preferences.reminderMinutes * 60000 &&
            !(await storage.get(id))
          ) {
            await storage.set(id, "1");
            await show(
              {
                id,
                title: e.title,
                body: `${e.title} começa em ${Math.round(delta / 60000)} minutos.`,
                read: false,
                createdAt: new Date().toISOString(),
                silent: isQuiet(new Date(), next.preferences),
              },
              next,
            );
          }
        }
      } catch {
        const userId = localStorage.getItem("pingo:pet-user");
        if (userId) {
          const storage = await sqliteStorage(userId);
          const cache = await storage.get("pet-cache");
          if (cache) {
            const cached = JSON.parse(cache) as Workspace;
            setW(cached);
            for (const e of cached.events.filter(
              (e) => !e.deleted && !e.allDay,
            )) {
              const delta = Date.parse(e.start) - Date.now();
              const id = `local-reminder:${e.id}:${e.start}`;
              if (
                delta >= 0 &&
                delta <= cached.preferences.reminderMinutes * 60000 &&
                !(await storage.get(id))
              ) {
                await storage.set(id, "1");
                await show(
                  {
                    id,
                    title: e.title,
                    body: `Lembrete offline: ${e.title} começa em ${Math.round(delta / 60000)} minutos.`,
                    read: false,
                    createdAt: new Date().toISOString(),
                    silent: isQuiet(new Date(), cached.preferences),
                  },
                  cached,
                );
              }
            }
          }
        }
      } finally {
        busy = false;
      }
    };
    void tick();
    const poll = setInterval(() => void tick(), 30000);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unlisten = listen("session-changed", () => void tick());
    return () => {
      active = false;
      clearInterval(poll);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      void unlisten.then((fn) => fn());
      sound?.close();
    };
  }, []);
  useEffect(() => {
    if (
      !w.preferences.snore ||
      isQuiet(new Date(), w.preferences) ||
      petState(new Date(), w.preferences) !== "sleep"
    )
      return;
    const timer = setInterval(() => {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(85, audio.currentTime);
      volume.gain.setValueAtTime(0.015, audio.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.65);
      oscillator.connect(volume);
      volume.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.7);
      oscillator.onended = () => void audio.close();
    }, 6000);
    return () => clearInterval(timer);
  }, [w.preferences]);
  return (
    <div
      className="desktop-pet"
      onContextMenu={(e) => {
        e.preventDefault();
        void invoke("open_panel");
      }}
    >
      <div
        className="pet-drag-handle"
        data-tauri-drag-region
        title="Arraste para mover"
      >
        ⠿
      </div>
      <Pet
        preferences={w.preferences}
        message={bubble}
        onClick={() => {
          setBubble("Um carinho muda o dia. ♡");
          setTimeout(() => setBubble(""), 6000);
        }}
      />
      <button className="open-panel" onClick={() => void invoke("open_panel")}>
        Meu dia <span>↗</span>
      </button>
    </div>
  );
}
async function main() {
  api.token = await invoke<string>("read_session").catch(() => undefined);
  const isPet = new URLSearchParams(location.search).has("pet");
  if (isPet) document.body.classList.add("pet-body-transparent");
  createRoot(document.getElementById("root")!).render(
    isPet ? <PetWindow /> : <PingoApp platform={platform} />,
  );
}
void main();
