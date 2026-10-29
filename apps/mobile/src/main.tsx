import { createRoot } from "react-dom/client";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Network } from "@capacitor/network";
import { PingoApp, type Platform } from "@pingo/ui";
import { Api, webStorage, type Storage } from "@pingo/ui/client";
import { type Workspace, deviceReminderPlan } from "@pingo/core";
import { Native, native, type NoticeTarget } from "./native";
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
function syncLocal(w: Workspace, userId: string) {
  if (!native || userId === "demo") return;
  const payload = deviceReminderPlan(w, userId);
  const signature = JSON.stringify(payload);
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
  logout: async () => {
    if (native) {
      // Native cleanup enqueues durable server unregistration and rejects queued push payloads immediately.
      activeUser = "";
      remindersSignature = "";
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
        status: async () => (await Native.notificationStatus()).status,
        enable: async () => {
          await Native.enableNotifications();
        },
        permissionSettings: async () => {
          await Native.openNotificationSettings();
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
      const accountMenu = document.querySelector<HTMLDetailsElement>(
        "details.account-menu[open]",
      );
      if (accountMenu) {
        accountMenu.open = false;
        return;
      }
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
