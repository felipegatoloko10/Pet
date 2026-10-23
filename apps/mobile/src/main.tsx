import { createRoot } from "react-dom/client";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Network } from "@capacitor/network";
import { PingoApp, type Platform } from "@pingo/ui";
import { Api, webStorage, type Storage } from "@pingo/ui/client";
import { type Workspace, taskAlarms } from "@pingo/core";
import { Native, native, type NoticeTarget, type Reminder } from "./native";
import { MobileAuth } from "./auth";
import "@pingo/ui/styles.css";
const base = import.meta.env.VITE_API_URL ?? "https://pingo-gilt.vercel.app";
const api = new Api(base);
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());
let back: (() => boolean) | undefined;
let noticeHandler: ((notice: NoticeTarget) => void) | undefined;
let pendingNotice: NoticeTarget | undefined;
let activeUser = "";
let remindersSignature = "";
let serial = Promise.resolve();
let rangeAt = 0;
let rangeLoading = false;
const auth = new MobileAuth(api, changed);
async function storage(userId: string): Promise<Storage> {
  if (!native) return webStorage(`mobile-preview:${userId}`);
  await Native.bindAccount({ userId });
  activeUser = userId;
  return {
    nativeFlush: async () => {
      const r = await Native.flushOperations({ userId });
      return r.snapshot ? JSON.parse(r.snapshot) : { pending: [] };
    },
    discardPending: async () => {
      await Native.discardOperations({ userId });
    },
    get: async (key) => (await Native.readCache({ userId, key })).value,
    set: async (key, value) => {
      await Native.writeCache({ userId, key, value });
    },
    clear: async () => {
      await Native.clearCache({ userId });
    },
  };
}
async function installationId() {
  const saved = (await Native.readSecure({ key: "installation" })).value;
  if (saved) return saved;
  const id = crypto.randomUUID();
  await Native.writeSecure({ key: "installation", value: id });
  return id;
}
async function registerToken(token: string) {
  await api.post("mobile/devices", {
    installationId: await installationId(),
    token,
    protocol: 2,
  });
}
function syncLocal(w: Workspace, userId: string) {
  if (!native || userId === "demo") return;
  const now = Date.now();
  if (
    api.token &&
    navigator.onLine &&
    !rangeLoading &&
    now - rangeAt > 15 * 60000
  ) {
    rangeLoading = true;
    void api
      .request(
        `calendar/range?start=${encodeURIComponent(new Date(now).toISOString())}&end=${encodeURIComponent(new Date(now + 7 * 86400000).toISOString())}`,
      )
      .then(() => {
        rangeAt = Date.now();
        changed();
      })
      .catch(() => {
        rangeAt = Date.now() - 14 * 60000;
      })
      .finally(() => {
        rangeLoading = false;
      });
  }
  const reminders: Reminder[] = w.events
    .filter(
      (e) =>
        !e.deleted &&
        !e.allDay &&
        !e.recurrence &&
        !(e.taskId && w.preferences.taskCheckIns !== false) &&
        Date.parse(e.start) > now &&
        Date.parse(e.start) <= now + 7 * 86400000,
    )
    .map((e) => ({
      noticeId: `reminder:${userId}:${e.id}:${e.start}`,
      eventId: e.id,
      title: e.title,
      startAt: Date.parse(e.start),
      dueAt: Math.max(
        now,
        Date.parse(e.start) - w.preferences.reminderMinutes * 60000,
      ),
    }));
  reminders.push(
    ...taskAlarms(w, userId, now).map((a) => ({
      noticeId: a.id,
      eventId:
        w.events.find((e) => e.taskId === a.taskId && !e.deleted)?.id ?? "",
      taskId: a.taskId,
      phase: a.phase,
      snoozePhase: a.snoozePhase,
      scheduleKey: a.scheduleKey,
      taskRevision: w.tasks.find((t) => t.id === a.taskId)?.revision,
      body: a.body,
      title: a.title,
      dueAt: Math.max(now, a.dueAt),
      startAt: a.expiresAt,
      expiresAt: a.expiresAt,
    })),
  );
  const payload = {
    userId,
    timezone: w.preferences.timezone,
    quietStart: w.preferences.quietStart,
    quietEnd: w.preferences.quietEnd,
    reminders,
  };
  // Ignore moving "now" for already-due reminders when comparing snapshots.
  const signature = JSON.stringify({
    ...payload,
    reminders: reminders.map((r) => ({
      ...r,
      dueAt: r.taskId
        ? (taskAlarms(w, userId, now).find((a) => a.id === r.noticeId)?.dueAt ??
          r.dueAt)
        : Math.max(0, r.startAt - w.preferences.reminderMinutes * 60000),
    })),
  });
  if (signature === remindersSignature) return;
  remindersSignature = signature;
  serial = serial
    .catch(() => {})
    .then(async () => {
      if (activeUser !== userId) return;
      await Native.syncReminders(payload);
    })
    .catch(() => {
      remindersSignature = "";
    });
}
const platform: Platform = {
  kind: "android",
  api,
  storage,
  onBack: (handler) => {
    back = handler;
    return () => {
      if (back === handler) back = undefined;
    };
  },
  onRemoteUpdate: (fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  onNotice: (handler) => {
    noticeHandler = handler;
    if (pendingNotice) {
      const n = pendingNotice;
      pendingNotice = undefined;
      queueMicrotask(() => handler(n));
    }
    return () => {
      if (noticeHandler === handler) noticeHandler = undefined;
    };
  },
  onWorkspace: syncLocal,
  login: () =>
    native
      ? auth.login()
      : Promise.reject(
          new Error(
            "Use o APK para entrar. Esta é uma prévia da interface Android.",
          ),
        ),
  openExternal: async (url) => {
    if (new URL(url).protocol !== "https:") throw new Error("Link inválido.");
    if (native) await Browser.open({ url });
    else window.open(url, "_blank", "noopener,noreferrer");
  },
  connectWorkspace: async () => {
    const result = await api.post<{ url: string }>("mobile/workspace");
    if (new URL(result.url).origin !== new URL(base).origin)
      throw new Error("Destino inválido.");
    await Browser.open({ url: result.url });
  },
  logout: async () => {
    if (native) {
      // Native cleanup enqueues durable server unregistration and rejects queued push payloads immediately.
      activeUser = "";
      remindersSignature = "";
      rangeAt = 0;
      await serial.catch(() => {});
      await Native.logout();
    }
    const token = api.token;
    api.token = undefined;
    if (token && navigator.onLine)
      await fetch(`${base}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
  },
  speak: native
    ? (text) => {
        void Native.speak({ text });
        return () => {
          void Native.stopSpeech();
        };
      }
    : undefined,
  notifications: native
    ? {
        enable: async () => {
          if (!api.token)
            throw new Error("Entre na conta antes de ativar os avisos.");
          const { token } = await Native.enableNotifications();
          await registerToken(token);
        },
        settings: async () => {
          await Native.settings();
        },
        privacy: async () => (await Native.getPrivacy()).hidden,
        setPrivacy: async (hidden) => {
          await Native.setPrivacy({ hidden });
        },
      }
    : undefined,
};
async function main() {
  if (native) {
    await auth.restore();
    await App.addListener("backButton", () => {
      if (!back?.()) void App.minimizeApp();
    });
    await App.addListener("appStateChange", ({ isActive }) => {
      document.documentElement.classList.toggle("native-paused", !isActive);
      if (!isActive) {
        void Native.stopSpeech();
        document.dispatchEvent(new Event("visibilitychange"));
      } else {
        auth.resumed();
        changed();
        void Native.getPushToken()
          .then(({ token }) => {
            if (token && api.token) return registerToken(token);
          })
          .catch(() => {});
      }
    });
    await Network.addListener("networkStatusChange", ({ connected }) => {
      window.dispatchEvent(new Event(connected ? "online" : "offline"));
    });
    await Native.addListener("noticeOpen", (value) => {
      if (noticeHandler) noticeHandler(value);
      else pendingNotice = value;
    });
    const initial = await Native.consumeNotice();
    if (initial.noticeId || initial.eventId) pendingNotice = initial;
  }
  createRoot(document.getElementById("root")!).render(
    <PingoApp platform={platform} />,
  );
}
void main().catch(() => {
  document.getElementById("root")!.textContent =
    "Não foi possível abrir seu Pingo. Feche e abra o aplicativo novamente.";
});
