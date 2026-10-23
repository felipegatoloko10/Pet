import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Api, type Storage } from "@pingo/ui";
import {
  emptyWorkspace,
  localNotices,
  isQuiet,
  type Workspace,
  type Notice,
  type PetState,
} from "@pingo/core";
export function useDesktopPet(
  api: Api,
  storageFor: (id: string) => Promise<Storage>,
) {
  const [workspace, setWorkspace] = useState(emptyWorkspace());
  const [bubble, setBubble] = useState("");
  const [activity, setActivity] = useState<PetState>("idle");
  useEffect(() => {
    let live = true,
      busy = false,
      lastRemote = 0;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let cached: Workspace | undefined;
    let cachedUser = "";
    const deviceId =
      localStorage.getItem("pingo:device") ?? crypto.randomUUID();
    localStorage.setItem("pingo:device", deviceId);
    async function show(n: Notice, w: Workspace) {
      if (!live) return;
      setBubble(n.body);
      setActivity(n.id.startsWith("sync:") ? "celebrate" : "speak");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        setBubble("");
        setActivity("idle");
      }, 15000);
    }
    async function display(w: Workspace, userId: string, online: boolean) {
      cached = w;
      cachedUser = userId;
      setWorkspace(w);
      const storage = await storageFor(userId);
      await storage.set("pet-cache", JSON.stringify(w));
      localStorage.setItem("pingo:pet-user", userId);
      const candidates = [
        ...w.notices.filter((n) => !n.read),
        ...localNotices(w, userId),
      ].filter(
        (n, index, all) => all.findIndex((x) => x.id === n.id) === index,
      );
      for (const n of candidates) {
        if (await storage.get(n.id)) continue;
        if (n.deliveredBy) {
          await storage.set(n.id, "1");
          continue;
        }
        const serverNotice = w.notices.some((x) => x.id === n.id);
        if (serverNotice && online) {
          try {
            const claim = await api.post<{ claimed: boolean }>(
              "notifications/claim",
              { id: n.id, deviceId },
            );
            if (!claim.claimed) {
              await storage.set(n.id, "1");
              continue;
            }
          } catch {
            continue;
          }
        }
        await storage.set(n.id, "1");
        await show(n, w);
        break;
      }
    }
    async function tick(force = false) {
      if (busy) return;
      busy = true;
      try {
        api.token = await invoke<string>("read_session");
        if (!api.token) {
          cached = undefined;
          cachedUser = "";
          setWorkspace(emptyWorkspace());
          setBubble("Abra meu painel para entrar.");
          return;
        }
        if (!cached) {
          const id = localStorage.getItem("pingo:pet-user");
          if (id) {
            const storage = await storageFor(id),
              raw = await storage.get("pet-cache");
            if (raw) {
              cached = JSON.parse(raw);
              cachedUser = id;
            }
          }
        }
        // The idle avatar reads SQLite every 30s; cloud polling is 15 min in the routine window.
        const quiet = cached && isQuiet(new Date(), cached.preferences);
        if (
          navigator.onLine &&
          (force ||
            !cached ||
            (!quiet && Date.now() - lastRemote >= 15 * 60000))
        ) {
          lastRemote = Date.now();
          const result = await api.request<{
            workspace: Workspace;
            user: { id: string };
          }>("workspace");
          await display(
            { ...emptyWorkspace(), ...result.workspace },
            result.user.id,
            true,
          );
        } else if (cached && cachedUser)
          await display(cached, cachedUser, false);
      } catch {
        if (cached && cachedUser) await display(cached, cachedUser, false);
      } finally {
        busy = false;
      }
    }
    void tick(true);
    const interval = setInterval(() => void tick(), 30000);
    const unsubSession = listen("session-changed", () => {
      cached = undefined;
      void tick(true);
    });
    const unsubWorkspace = listen<{ workspace: Workspace; userId: string }>(
      "workspace-updated",
      (event) => {
        if (!busy)
          void display(
            { ...emptyWorkspace(), ...event.payload.workspace },
            event.payload.userId,
            navigator.onLine,
          );
      },
    );
    const visibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      live = false;
      clearInterval(interval);
      clearTimeout(hideTimer);
      void unsubSession.then((fn) => fn());
      void unsubWorkspace.then((fn) => fn());
      document.removeEventListener("visibilitychange", visibility);
      speechSynthesis.cancel();
    };
  }, []);
  return { workspace, bubble, setBubble, activity };
}
