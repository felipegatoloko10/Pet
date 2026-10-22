import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useDesktopPet } from "./pet-service";
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
  onWorkspace: (workspace: Workspace, userId: string) => {
    void emit("workspace-updated", { workspace, userId });
  },
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
  const {
    workspace: w,
    bubble,
    setBubble,
    activity,
  } = useDesktopPet(api, sqliteStorage);
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
        activity={activity}
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
