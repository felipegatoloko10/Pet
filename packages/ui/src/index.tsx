"use client";
import { NotificationPermission } from "./NotificationPermission";
import { RepeatPicker } from "./RepeatPicker";
import type { Repetition } from "@pingo/core";
import { SettingsPage } from "./Settings";
import { StatusPicker } from "./StatusPicker";
import {
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Sun,
  Columns3,
  CalendarDays,
  MessageCircle,
  Settings,
  Plus,
  ArrowUpRight,
  Check,
  Clock,
  Bell,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Mail,
  Search,
  MoreHorizontal,
  LogOut,
  CloudOff,
  Heart,
  Sparkles,
  Download,
  Trash2,
  X,
  MoveRight,
} from "lucide-react";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TZDate } from "@date-fns/tz";
import {
  defaultPreferences,
  dailySummary,
  zonedParts,
  type Workspace,
  type Task,
  type CalendarEvent,
  type Preferences,
  type Command,
  newBoard,
  pingoImportInput,
  emptyWorkspace,
  eventOnDate,
  zonedDateTime,
  nextDay,
} from "@pingo/core";
import { PingoMark } from "./PingoMark";
import { StickerCluster } from "./Stickers";
import { useModalScrollLock } from "./modal-scroll";
import {
  Api,
  ApiError,
  errorMessage,
  PingoClient,
  webStorage,
  type User,
  type Storage,
} from "./client";
import { Pet } from "./Pet";
import { PetRoom } from "./PetRoom";
import { Board } from "./Board";
const Calendar = lazy(() =>
  import("./Calendar").then((m) => ({ default: m.Calendar })),
);
const Chat = lazy(() => import("./Chat").then((m) => ({ default: m.Chat })));
import { Routine } from "./Routine";
import { demoWorkspace } from "./demo";
import {
  AccountForm,
  activationFromLocation,
  type Activation,
} from "./AccountForm";
export { Pet, PingoClient, Api };
export type { Storage };
export type Platform = {
  kind?: "web" | "desktop" | "android";
  notifications?: {
    status?: () => Promise<string>;
    enable: () => Promise<void>;
    settings: () => Promise<void>;
    permissionSettings?: () => Promise<void>;
    privacy: () => Promise<boolean>;
    setPrivacy: (hidden: boolean) => Promise<void>;
  };
  connectWorkspace?: () => Promise<void>;
  speak?: (text: string) => () => void;
  onBack?: (handler: () => boolean) => () => void;
  onNotice?: (
    handler: (value: {
      eventId?: string;
      noticeId?: string;
      taskId?: string;
    }) => void,
  ) => () => void;
  api?: Api;
  login?: () => Promise<void>;
  logout?: () => Promise<void>;
  storage?: (userId: string) => Promise<Storage>;
  openExternal?: (url: string) => Promise<void>;
  onWorkspace?: (w: Workspace, userId: string) => void;
  onOpenConversation?: (handler: (id: string) => void) => () => void;
  onRemoteUpdate?: (handler: () => void) => () => void;
};
const nav = [
  { id: "day", label: "Meu dia", icon: Sun },
  { id: "calendar", label: "Agenda", icon: CalendarDays },
  { id: "pet", label: "Pingo", icon: Heart },
  { id: "chat", label: "Conversa", icon: MessageCircle },
  { id: "settings", label: "Ajustes", icon: Settings },
] as const;
type Screen = (typeof nav)[number]["id"];
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function download(name: string, value: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function PingoApp({ platform = {} }: { platform?: Platform }) {
  useModalScrollLock();
  const apiRef = useRef(platform.api ?? new Api());
  const api = apiRef.current;
  const soundEnabled = platform.kind === "android" || !platform.api;
  const [client, setClient] = useState<PingoClient>();
  const [user, setUser] = useState<User>();
  const [boot, setBoot] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [activation, setActivation] = useState<Activation>();
  const chosenProfile = useRef(false);
  const [, render] = useState(0);
  const [screen, setScreen] = useState<Screen>("day");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);
  const [requestedConversation, setRequestedConversation] = useState<{
    id: string;
    requestId: number;
  }>();
  const [taskEditor, setTaskEditor] = useState<Partial<Task> | null>(null);
  const [eventEditor, setEventEditor] = useState<Partial<CalendarEvent> | null>(
    null,
  );
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(
    () =>
      platform.onBack?.(() => {
        const sheet = document.querySelector<HTMLDialogElement>(
          ".status-sheet[open]",
        );
        if (sheet) {
          sheet.close();
          return true;
        }
        if (taskEditor) {
          setTaskEditor(null);
          return true;
        }
        if (eventEditor) {
          setEventEditor(null);
          return true;
        }
        if (noticesOpen) {
          setNoticesOpen(false);
          return true;
        }
        const dialog =
          document.querySelector<HTMLDialogElement>("dialog[open]");
        if (dialog) {
          dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
          return true;
        }
        if (screen !== "day") {
          setScreen("day");
          return true;
        }
        return false;
      }),
    [platform.onBack, taskEditor, eventEditor, noticesOpen, screen],
  );
  useEffect(() => {
    if (!client) return;
    let active = true;
    const unsubscribe = platform.onNotice?.(
      async ({ eventId, noticeId, taskId }) => {
        if (!active) return;
        if (platform.kind === "android") {
          setTaskEditor(null);
          setEventEditor(null);
          setScreen("day");
        } else if (taskId) {
          let t = client.workspace.tasks.find(
            (t) => t.id === taskId && !t.deleted,
          );
          if (!t && navigator.onLine) {
            await client.refresh();
            if (!active) return;
            t = client.workspace.tasks.find(
              (t) => t.id === taskId && !t.deleted,
            );
          }
          if (t) setTaskEditor(t);
          else setScreen("day");
        } else if (eventId) {
          const event = client?.workspace.events.find(
            (e) => e.id === eventId && !e.deleted,
          );
          if (event) setEventEditor(event);
          else setScreen("calendar");
        } else setScreen("day");
        if (
          noticeId &&
          client?.workspace.notices.some((n) => n.id === noticeId)
        )
          void client.command({ type: "notice.read", id: noticeId });
        if (client) void client.refresh();
      },
    );
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [platform.onNotice, client]);
  async function attach(u: User, demo = false) {
    chosenProfile.current = true;
    api.accountId = u.id;
    const storage = await (platform.storage ?? webStorage)(
      demo ? "demo" : u.id,
    );
    client?.dispose();
    const next = new PingoClient(
      new Api(api.base, api.token, u.id),
      storage,
      demo,
      u.id.startsWith("local:"),
    );
    if (demo && !(await storage.get("workspace")))
      await storage.set("workspace", JSON.stringify(demoWorkspace()));
    localStorage.setItem("pingo:user", JSON.stringify(u));
    await next.init();
    setUser(u);
    setClient(next);
    if (!demo && next.workspace.revision === 0)
      await next.command({
        type: "preferences.update",
        preferences: {
          ...next.workspace.preferences,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
  }
  useEffect(() => {
    let active = true;
    const invite = activationFromLocation();
    if (invite) {
      setActivation(invite);
      setAccountOpen(true);
      history.replaceState(null, "", location.pathname + location.search);
    }
    const page = new URLSearchParams(location.search).get("page");
    if (page === "boards") setScreen("day");
    if (nav.some((n) => n.id === page)) setScreen(page as Screen);
    if (!platform.api && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    api
      .request<{ configured: boolean }>("health")
      .then((r) => {
        if (active) setConfigured(r.configured);
      })
      .catch(() => {});
    const savedProfile = localStorage.getItem("pingo:user");
    if (savedProfile) {
      const cachedUser = JSON.parse(savedProfile) as User;
      if (cachedUser.id !== "demo") {
        void attach(cachedUser).finally(() => {
          if (active) setBoot(false);
        });
        return () => {
          active = false;
        };
      }
    }
    setBoot(false);
    api.accountId = undefined;
    api
      .request<{ user: User }>("workspace")
      .then((r) => {
        if (active && !chosenProfile.current) return attach(r.user);
      })
      .catch(async (e) => {
        if (!(e instanceof ApiError && e.status === 401)) {
          const saved = localStorage.getItem("pingo:user");
          if (saved && active) {
            const u = JSON.parse(saved);
            if (u.id !== "demo") await attach(u);
          }
        }
      })
      .finally(() => {
        if (active) setBoot(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!client) return;
    if (user && user.id !== "demo")
      platform.onWorkspace?.(client.workspace, user.id);
    return client.subscribe(() => {
      render((n) => n + 1);
      if (user && user.id !== "demo")
        platform.onWorkspace?.(client.workspace, user.id);
    });
  }, [client, user]);
  useEffect(
    () =>
      platform.onOpenConversation?.((id) => {
        setRequestedConversation((previous) => ({
          id,
          requestId: (previous?.requestId ?? 0) + 1,
        }));
        setScreen("chat");
        if (client) void client.refresh();
      }),
    [client, platform.onOpenConversation],
  );
  useEffect(
    () =>
      platform.onRemoteUpdate?.(() => {
        if (client) void client.refresh();
      }),
    [client, platform.onRemoteUpdate],
  );
  useEffect(() => {
    if (!client) return;
    const onNetwork = () => {
      client.online = navigator.onLine;
      client.emit();
      if (navigator.onLine) void client.refresh();
    };
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    const timer = setInterval(() => {
      if (!document.hidden) void client.sync();
    }, 60000);
    const show = () => {
      if (!document.hidden) void client.refresh();
    };
    document.addEventListener("visibilitychange", show);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      document.removeEventListener("visibilitychange", show);
    };
  }, [client]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  const w = client?.workspace;
  const prefs = w?.preferences ?? defaultPreferences;
  async function act(command: Command) {
    if (!client) return;
    setError("");
    try {
      await client.command(command);
      setToast(
        client.localOnly
          ? "Salvei neste aparelho."
          : client.demo
            ? "Modificação salva na demonstração local."
            : client.pending.length
              ? navigator.onLine
                ? "Alteração salva no aparelho. Sincronizando…"
                : "Guardei aqui. Vou sincronizar quando houver conexão."
              : "Alteração salva.",
      );
    } catch (e) {
      if (!document.querySelector("dialog[open]")) setError(errorMessage(e));
      throw e;
    }
  }
  async function completeSignIn() {
    api.accountId = undefined;
    const result = await api.request<{ user: User }>("workspace");
    await attach(result.user);
    setAccountOpen(false);
    setActivation(undefined);
  }
  async function login() {
    setLoginBusy(true);
    setError("");
    try {
      if (platform.login) {
        await platform.login();
        await completeSignIn();
      } else {
        setAccountOpen(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao entrar.");
    } finally {
      setLoginBusy(false);
    }
  }
  async function logout() {
    if (
      client?.pending.length &&
      !confirm(
        "Há alterações ainda não sincronizadas. Suas alterações ficarão guardadas neste aparelho. Deseja sair mesmo assim?",
      )
    )
      return;
    client?.dispose();
    setRequestedConversation(undefined);
    if (!platform.api && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        if (!client?.demo)
          await api
            .request("push", {
              method: "DELETE",
              body: JSON.stringify({ endpoint: subscription.endpoint }),
            })
            .catch(() => {});
        await subscription.unsubscribe();
      }
      const notices = await registration?.getNotifications();
      notices?.forEach((n) => n.close());
    }
    // Keep the account cache and pending work recoverable when signing out.
    // Authentication removal is separate from explicitly deleting local data.
    localStorage.removeItem("pingo:user");
    if (platform.logout) await platform.logout();
    else if (!client?.demo)
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    setClient(undefined);
    setUser(undefined);
  }
  if (boot)
    return (
      <div className="loading">
        <Pet preferences={prefs} />
        <p>Acordando o Pingo…</p>
      </div>
    );
  if (!client || !w || !user)
    return (
      <main className="welcome">
        <div className="welcome-brand">
          <span className="logo-dot pingo-face">
            <PingoMark />
          </span>{" "}
          pingo <small>BETA</small>
        </div>
        <div className="welcome-content">
          <div>
            <div className="eyebrow">
              <Sparkles size={15} /> Um companheiro para o seu dia
            </div>
            <h1>
              Menos correria.
              <br />
              Mais <em>respiro.</em>
            </h1>
            <p>
              Seu dia, suas tarefas e um pequeno amigo que ajuda você a cuidar
              de tudo. Um passo de cada vez.
            </p>
            <button
              className="button primary"
              onClick={() => void login()}
              disabled={loginBusy || !configured}
            >
              {loginBusy
                ? "Aguardando autorização…"
                : "Entrar para sincronizar"}
              <ArrowUpRight size={18} />
            </button>
            <button
              className="button text-button"
              onClick={() =>
                void attach({ id: "local:personal", name: "Você", email: "" })
              }
            >
              Usar neste aparelho <MoveRight size={17} />
            </button>
            <button
              className="button text-button"
              onClick={() =>
                void attach({ id: "demo", name: "Você", email: "" }, true)
              }
            >
              Explorar demonstração local
            </button>
            <small>
              {configured
                ? "Beta gratuito · seu espaço é só seu"
                : "Você já pode usar sem internet e sem conta."}
            </small>
            {accountOpen && (
              <Dialog
                title="Sua conta Pingo"
                onClose={() => setAccountOpen(false)}
              >
                <AccountForm
                  activation={activation}
                  onSignedIn={completeSignIn}
                />
              </Dialog>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </div>
          <div className="welcome-pet">
            <StickerCluster />
            <Pet
              soundEnabled={soundEnabled}
              speak={platform.speak}
              preferences={prefs}
              message="Oi! Vamos deixar seu dia mais leve?"
            />
            <span className="pet-caption">
              pequeno no tamanho, presente na rotina.
            </span>
          </div>
        </div>
        <footer>Feito para sua vida real. Com espaço para pausar.</footer>
      </main>
    );
  const today = zonedParts(new Date(), prefs.timezone).date;
  const tasks = w.tasks.filter((t) => !t.deleted && !t.archivedAt);
  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const visibleError = error || client.error;
  const openExternal = async (url: string) => {
    if (platform.openExternal) await platform.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <div
      className={`app-shell ${platform.kind === "android" ? "mobile-app" : ""}`}
    >
      <NotificationPermission platform={platform} client={client} />
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("day");
          }}
        >
          <span className="logo-dot pingo-face">
            <PingoMark />
          </span>
          <span>
            pingo<small>SEU PEQUENO ASSISTENTE</small>
          </span>
        </a>
        <div className="space-label">
          MEU ESPAÇO <span>BETA</span>
        </div>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-label={
                platform.kind === "android" && n.id === "chat"
                  ? "Conversas"
                  : n.label
              }
              title={n.label}
              className={screen === n.id ? "nav-item selected" : "nav-item"}
              aria-current={screen === n.id ? "page" : undefined}
              onClick={() => {
                setToast("");
                setScreen(n.id);
              }}
            >
              <n.icon size={19} />
              <span>
                {platform.kind === "android" && n.id === "chat"
                  ? "Conversas"
                  : n.label}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <span>✦</span>
            <p>
              Você não precisa resolver
              <br />
              tudo de uma vez.
            </p>
          </div>
          <details className="account-menu sidebar-account">
            <summary
              className="account"
              aria-label="Menu da conta na barra lateral"
            >
              <span className="avatar-letter">{user.name[0]}</span>
              <span>
                {user.name.split(" ")[0]}
                <small>
                  {client.localOnly
                    ? "Neste aparelho"
                    : client.demo
                      ? "Demonstração local"
                      : "Espaço individual"}
                </small>
              </span>
              <LogOut size={16} />
            </summary>
            <div className="account-popover">
              <small>
                {client.localOnly ? "Somente neste aparelho" : user.email}
              </small>
              {client.localOnly && (
                <button className="button primary" onClick={() => void login()}>
                  Entrar ou criar conta
                </button>
              )}
              <button className="button" onClick={() => void logout()}>
                Sair
              </button>
            </div>
          </details>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            <span className="topbar-mark">
              <PingoMark />
            </span>
            {client.demo
              ? "Demonstração local"
              : client.online
                ? "Seu espaço pessoal"
                : "Modo offline"}
          </span>
          <div>
            <button
              className={`icon-button ${client.syncing ? "spinning" : ""}`}
              onClick={() => void client.sync()}
              aria-label="Sincronizar"
              title="Sincronizar"
            >
              <RefreshCw size={18} />
            </button>
            <button
              className="icon-button notification-button"
              onClick={() => {
                setNoticesOpen(true);
                const ids = w.notices.filter((n) => !n.read).map((n) => n.id);
                if (ids.length)
                  void act({ type: "notice.readMany", ids }).catch(() => {});
              }}
              aria-label="Abrir notificações"
            >
              <Bell size={19} />
              {w.notices.some((n) => !n.read) && <i />}
            </button>
            <details className="account-menu">
              <summary className="top-avatar" aria-label="Minha conta">
                {(user.name === "Pessoa"
                  ? user.email
                  : user.name)?.[0]?.toUpperCase() ?? "P"}
              </summary>
              <div className="account-popover">
                <small>
                  {client.localOnly ? "Somente neste aparelho" : user.email}
                </small>
                {client.localOnly && (
                  <button
                    className="button primary"
                    onClick={() => void login()}
                  >
                    Entrar ou criar conta
                  </button>
                )}
                <button className="button" onClick={() => void logout()}>
                  Sair
                </button>
              </div>
            </details>
            <span className="top-account-name">{user.name.split(" ")[0]}</span>
          </div>
        </header>
        <main className="workspace">
          {client.demo && (
            <div className="demo-banner">
              Você está explorando dados de exemplo, salvos apenas neste
              dispositivo.{" "}
              <button onClick={() => void logout()}>
                Sair da demonstração
              </button>
            </div>
          )}
          {visibleError && (
            <div className="error-banner" role="alert">
              {visibleError}
              <button
                className="icon-button"
                onClick={() => {
                  setError("");
                  client.error = "";
                  client.emit();
                }}
                aria-label="Fechar aviso"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {client.pending.some((p) => p.error) && (
            <div className="conflict-banner">
              <strong>Uma alteração precisa da sua revisão.</strong>
              <p>Exporte suas mudanças antes de buscar a versão do servidor.</p>
              <button
                className="button"
                onClick={() =>
                  void client
                    .exportPending()
                    .then((s) => download("pingo-alteracoes-pendentes.json", s))
                }
              >
                Exportar minhas alterações
              </button>
              <button
                className="button"
                onClick={() => {
                  if (
                    confirm(
                      "Descartar as alterações locais pendentes e usar a versão do servidor?",
                    )
                  )
                    void client.discardConflict();
                }}
              >
                Usar versão do servidor
              </button>
            </div>
          )}
          {screen === "day" && (
            <>
              <Board
                localOnly={client.localOnly}
                w={w}
                today={today}
                act={act}
                onEdit={setTaskEditor}
                onEventEdit={setEventEditor}
              />
              {tasks
                .filter((t) => t.calendarRemoved)
                .map((t) => (
                  <section className="panel" key={t.id}>
                    <h3>O horário de “{t.title}” foi removido da agenda.</h3>
                    <p>A tarefa foi preservada. Deseja excluí-la também?</p>
                    <button
                      className="button"
                      onClick={() =>
                        void act({
                          type: "task.calendarDecision",
                          id: t.id,
                          removeTask: false,
                          expectedRevision: t.revision,
                          confirmed: true,
                        })
                      }
                    >
                      Manter tarefa
                    </button>
                    <button
                      className="button danger"
                      onClick={() => {
                        if (confirm("Excluir também esta tarefa do Pingo?"))
                          void act({
                            type: "task.calendarDecision",
                            id: t.id,
                            removeTask: true,
                            expectedRevision: t.revision,
                            confirmed: true,
                          });
                      }}
                    >
                      Excluir tarefa
                    </button>
                  </section>
                ))}
              <section className="day-hero">
                <div>
                  <span className="pill">
                    <Sparkles size={13} /> UM OLHAR PARA HOJE
                  </span>
                  <h2>
                    Vamos organizar
                    <br />o que importa?
                  </h2>
                  <p>{dailySummary(w)}</p>
                  <button
                    className="hero-link"
                    onClick={() => setScreen("chat")}
                  >
                    Planejar meu dia com {prefs.name} <ArrowUpRight size={17} />
                  </button>
                </div>
                <Pet
                  soundEnabled={soundEnabled}
                  speak={platform.speak}
                  preferences={prefs}
                  care={w.petCare}
                  message={
                    pending.length
                      ? "Estou aqui para ajudar. ♡"
                      : "Tudo no seu ritmo. ♡"
                  }
                  focus={focus}
                  activity={
                    client.syncing ? "think" : toast ? "celebrate" : undefined
                  }
                />
                <div className="hero-decor">✦</div>
              </section>
              <div className="stats">
                <div>
                  <span className="stat-icon mint">
                    <Check size={19} />
                  </span>
                  <div>
                    <strong>
                      {pending.filter((t) => t.dueDate === today).length}
                    </strong>
                    <span>Tarefas para hoje</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon peach">
                    <Clock size={19} />
                  </span>
                  <div>
                    <strong>
                      {
                        w.events.filter(
                          (e) =>
                            !e.deleted &&
                            eventOnDate(e, today, prefs.timezone) &&
                            !e.recurrence,
                        ).length
                      }
                    </strong>
                    <span>Compromissos</span>
                  </div>
                </div>
                <div>
                  <span className="stat-icon lilac">
                    <Heart size={19} />
                  </span>
                  <div>
                    <strong>{completed.length}</strong>
                    <span>Pequenas conquistas</span>
                  </div>
                </div>
              </div>
              <div className="day-grid">
                <section className="panel agenda-card">
                  <div className="section-heading">
                    <h2>Na sua agenda</h2>
                    <button
                      className="text-link"
                      onClick={() => setScreen("calendar")}
                    >
                      Ver tudo <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {w.events
                    .filter(
                      (e) =>
                        !e.deleted &&
                        !e.recurrence &&
                        eventOnDate(e, today, prefs.timezone),
                    )
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .slice(0, 4)
                    .map((e) => (
                      <button
                        className="agenda-item"
                        key={e.id}
                        onClick={() => setEventEditor(e)}
                      >
                        <time>
                          {e.allDay ? "Dia todo" : formatTime(e.start, prefs)}
                        </time>
                        <i />
                        <div>
                          <strong>{e.title}</strong>
                          <small>
                            {e.allDay
                              ? "Reserve um respiro"
                              : `${formatTime(e.start, prefs)} – ${formatTime(e.end, prefs)}`}
                          </small>
                        </div>
                      </button>
                    ))}
                  {!w.events.some(
                    (e) => !e.deleted && eventOnDate(e, today, prefs.timezone),
                  ) && (
                    <Empty
                      title="Um pouco de espaço livre"
                      text="Nenhum compromisso para hoje."
                    />
                  )}
                  <button
                    className="add-inline"
                    onClick={() => setEventEditor({})}
                  >
                    <Plus size={16} /> Novo compromisso
                  </button>
                </section>
              </div>
              <div className="day-grid">
                <section className="pause-card">
                  <span>UM CUIDADO PEQUENO</span>
                  <h3>
                    Concentre-se em uma coisa.
                    <br />O resto pode esperar.
                  </h3>
                  <button className="button" onClick={() => setFocus(!focus)}>
                    {focus ? "Encerrar foco" : "Começar um momento de foco"}{" "}
                    <Heart size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {screen === "calendar" && (
            <Suspense fallback={<p role="status">Abrindo sua agenda…</p>}>
              <Calendar
                w={w}
                client={client}
                onEdit={setEventEditor}
                onTaskEdit={setTaskEditor}
              />
            </Suspense>
          )}
          {screen === "pet" && (
            <PetRoom
              w={w}
              act={act}
              onChat={() => setScreen("chat")}
              soundEnabled={soundEnabled}
              speak={platform.speak}
            />
          )}
          {screen === "chat" && (
            <Suspense fallback={<p role="status">Abrindo suas conversas…</p>}>
              <Chat
                client={client}
                requestedConversation={requestedConversation}
                onUpdate={() => void client.refresh()}
                preview={(command) => (
                  <SuggestionPreview command={command} workspace={w} />
                )}
              />
            </Suspense>
          )}
          {screen === "settings" && (
            <SettingsPage
              platform={platform}
              w={w}
              client={client}
              act={act}
              openExternal={openExternal}
              onConnect={() => void login()}
              onToast={setToast}
            />
          )}
          <footer className="workspace-footer">
            <span>Um passo de cada vez, com {prefs.name}.</span>
            <span>
              {client.pending.length
                ? `${client.pending.length} alteração(ões) pendente(s)`
                : w.connection.lastSync
                  ? `Sincronizado às ${formatTime(w.connection.lastSync, prefs)}`
                  : "Seu ritmo, seu espaço."}
            </span>
          </footer>
        </main>
      </div>
      {accountOpen && (
        <Dialog title="Sua conta Pingo" onClose={() => setAccountOpen(false)}>
          <AccountForm activation={activation} onSignedIn={completeSignIn} />
        </Dialog>
      )}
      {taskEditor && (
        <TaskEditor
          initial={taskEditor}
          w={w}
          act={act}
          onClose={() => setTaskEditor(null)}
          onSchedule={(t) => {
            setTaskEditor(null);
            setEventEditor(
              w.events.find((e) => e.taskId === t.id && !e.deleted) ?? {
                title: t.title,
                taskId: t.id,
              },
            );
          }}
        />
      )}
      {eventEditor && (
        <EventEditor
          initial={eventEditor}
          w={w}
          act={act}
          onClose={() => setEventEditor(null)}
        />
      )}
      {noticesOpen && (
        <Dialog title="Seus avisos" onClose={() => setNoticesOpen(false)}>
          <div className="notice-list">
            {w.notices.map((n) => (
              <button
                key={n.id}
                className={`notice ${n.read ? "read" : ""}`}
                onClick={() =>
                  void act({ type: "notice.read", id: n.id }).catch(() => {})
                }
              >
                <Bell size={18} />
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>
                    {format(new Date(n.createdAt), "dd/MM · HH:mm")}
                  </small>
                </div>
              </button>
            ))}
            {!w.notices.length && (
              <Empty
                title="Tudo tranquilo"
                text="Seus lembretes e confirmações aparecerão aqui."
              />
            )}
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span>✦</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
const formatTime = (date: string, p: Preferences) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: p.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
const eventDay = (e: CalendarEvent, p: Preferences) =>
  e.allDay ? e.start : zonedParts(new Date(e.start), p.timezone).date;
const stateLabel = {
  pending: "Pendente",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  error: "Erro",
  conflict: "Revisar conflito",
};
function TaskRow({
  task: t,
  w,
  today,
  onEdit,
  onComplete,
}: {
  task: Task;
  w: Workspace;
  today: string;
  onEdit: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="task-row">
      <button
        className="check-circle"
        aria-label={`Concluir ${t.title}`}
        onClick={onComplete}
      >
        {t.completed && <Check size={13} />}
      </button>
      <button className="task-title" onClick={onEdit}>
        <strong>{t.title}</strong>
        <span>
          {t.dueDate && (
            <>
              {" "}
              ·{" "}
              <span className={t.dueDate < today ? "overdue" : ""}>
                {t.dueDate === today
                  ? "Hoje"
                  : format(new Date(t.dueDate + "T12:00:00"), "dd MMM", {
                      locale: ptBR,
                    })}
              </span>
            </>
          )}
        </span>
      </button>
      <span className={`priority priority-${t.priority}`}>
        {t.priority === "high"
          ? "Prioridade"
          : t.priority === "low"
            ? "Com calma"
            : "No seu ritmo"}
      </span>
    </div>
  );
}
function TaskEditor({
  initial,
  w,
  act,
  onClose,
  onSchedule,
}: {
  initial: Partial<Task>;
  w: Workspace;
  act: (c: Command) => Promise<void>;
  onClose: () => void;
  onSchedule: (t: Task) => void;
}) {
  const series = w.taskSeries?.find((s) => s.id === initial.seriesId);
  const [repetition, setRepetition] = useState<Repetition | null>(
    series?.rule ?? null,
  );
  const [scope, setScope] = useState<"one" | "future">("one");
  const first =
    w.boards.find(
      (b) => b.id === (initial.boardId ?? w.preferences.defaultBoardId),
    ) ?? w.boards[0];
  const [t, setT] = useState({
    ...initial,
    id: initial.id ?? crypto.randomUUID(),
    title: initial.title ?? "",
    notes: initial.notes ?? "",
    boardId: first?.id ?? "",
    columnId: initial.columnId ?? first?.columns[0].id ?? "",
    dueDate:
      initial.dueDate ?? zonedParts(new Date(), w.preferences.timezone).date,
    scheduledStart: initial.scheduledStart ?? null,
    scheduledEnd: initial.scheduledEnd ?? null,
    priority: initial.priority ?? "normal",
  });
  const [busy, setBusy] = useState(false);
  const [timeMode, setTimeMode] = useState<"none" | "point" | "range">(
    initial.timeMode ?? (initial.scheduledStart ? "range" : "none"),
  );
  const clock = (s?: string | null) =>
    s
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: w.preferences.timezone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(s))
      : "09:00";
  const [startTime, setStartTime] = useState(clock(initial.scheduledStart)),
    [endTime, setEndTime] = useState(clock(initial.scheduledEnd)),
    [duration, setDuration] = useState(
      initial.scheduledStart && initial.scheduledEnd
        ? Math.max(
            1,
            Math.round(
              (Date.parse(initial.scheduledEnd) -
                Date.parse(initial.scheduledStart)) /
                60000,
            ),
          )
        : 30,
    ),
    [endDate, setEndDate] = useState(
      initial.scheduledEnd
        ? zonedParts(new Date(initial.scheduledEnd), w.preferences.timezone)
            .date
        : (initial.dueDate ??
            zonedParts(new Date(), w.preferences.timezone).date),
    );
  const [error, setError] = useState("");
  const board = w.boards.find((b) => b.id === t.boardId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await act({
        type: "task.upsert",
        ...(!series || scope === "future"
          ? { repetition, scope, expectedSeriesRevision: series?.revision }
          : {}),
        task: {
          ...t,
          timeMode,
          scheduledStart:
            timeMode === "none"
              ? null
              : zonedDateTime(t.dueDate!, startTime, w.preferences.timezone),
          scheduledEnd:
            timeMode === "none"
              ? null
              : timeMode === "point"
                ? new Date(
                    Date.parse(
                      zonedDateTime(
                        t.dueDate!,
                        startTime,
                        w.preferences.timezone,
                      ),
                    ) +
                      duration * 60000,
                  ).toISOString()
                : zonedDateTime(endDate, endTime, w.preferences.timezone),
        },
        expectedRevision: initial.revision ?? 0,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={initial.id ? "Cuidar desta tarefa" : "Uma nova tarefa"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="editor-form">
        <label>
          O que você quer fazer?
          <input
            autoFocus
            value={t.title}
            onChange={(e) => setT({ ...t, title: e.target.value })}
            required
            maxLength={1024}
            placeholder="Uma coisa de cada vez…"
          />
        </label>
        <label>
          Detalhes
          <textarea
            value={t.notes}
            onChange={(e) => setT({ ...t, notes: e.target.value })}
            maxLength={8192}
            rows={3}
          />
        </label>
        <div className="form-grid">
          <label>
            Etapa
            <StatusPicker
              columns={board?.columns ?? []}
              value={t.columnId}
              onChange={(columnId) => setT({ ...t, columnId })}
            />
          </label>
          <label>
            Dia da tarefa
            <input
              type="date"
              required
              value={t.dueDate ?? ""}
              onChange={(e) => {
                setT({ ...t, dueDate: e.target.value });
                setEndDate(e.target.value || "");
              }}
            />
          </label>
          <label>
            Prioridade
            <select
              value={t.priority}
              onChange={(e) =>
                setT({ ...t, priority: e.target.value as Task["priority"] })
              }
            >
              <option value="low">Com calma</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
            </select>
          </label>
        </div>
        {series && (
          <fieldset>
            <legend>Esta tarefa se repete</legend>
            <div className="repeat-options">
              <button
                type="button"
                className="button"
                aria-pressed={scope === "one"}
                onClick={() => setScope("one")}
              >
                Somente esta ocorrência
              </button>
              <button
                type="button"
                className="button"
                aria-pressed={scope === "future"}
                onClick={() => setScope("future")}
              >
                Esta e as próximas
              </button>
            </div>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                void act({
                  type: "series.pause",
                  id: series.id,
                  expectedRevision: series.revision,
                  date: zonedParts(new Date(), w.preferences.timezone).date,
                  paused: !series.pauses.some((p) => !p.end),
                })
                  .then(onClose)
                  .catch((e) => setError(e.message))
              }
            >
              {series.pauses.some((p) => !p.end)
                ? "Retomar repetição"
                : "Pausar repetição"}
            </button>
            <button
              type="button"
              className="text-link danger"
              onClick={() => {
                if (
                  confirm(
                    "Encerrar esta repetição a partir desta data? O histórico anterior será preservado.",
                  )
                )
                  void act({
                    type: "series.stop",
                    id: series.id,
                    expectedRevision: series.revision,
                    date: initial.occurrenceDate ?? t.dueDate!,
                  })
                    .then(onClose)
                    .catch((e) => setError(e.message));
              }}
            >
              Encerrar esta e as próximas
            </button>
          </fieldset>
        )}
        {(!series || scope === "future") && (
          <RepeatPicker value={repetition} onChange={setRepetition} />
        )}
        <fieldset>
          <legend>Horário e lembretes</legend>
          <label>
            Como quer organizar?
            <select
              aria-label="Tipo de horário"
              value={timeMode}
              onChange={(e) => setTimeMode(e.target.value as typeof timeMode)}
            >
              <option value="none">Sem horário · dia inteiro</option>
              <option value="point">Horário único</option>
              <option value="range">Início e fim</option>
            </select>
          </label>
          {timeMode !== "none" && (
            <div className="form-grid">
              <label>
                Começa às
                <input
                  required
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>
              {timeMode === "point" ? (
                <label>
                  Duração em minutos
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    required
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Dia do término
                    <input
                      type="date"
                      min={t.dueDate ?? undefined}
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Termina às
                    <input
                      required
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          )}
          <p>
            {timeMode === "none"
              ? "Aparece no resumo e na agenda, sem alerta por horário."
              : "Você receberá lembretes conforme suas preferências. O horário será reservado na sua agenda do Pingo."}
          </p>
        </fieldset>
        {initial.error && <p className="error">{initial.error}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-actions">
          {initial.id && (
            <>
              <button
                type="button"
                className="icon-button danger"
                aria-label="Excluir tarefa"
                onClick={() => {
                  if (
                    confirm(
                      "Excluir esta tarefa e seu horário na agenda do Pingo?",
                    )
                  )
                    void act({
                      type: "task.delete",
                      id: t.id,
                      expectedRevision: initial.revision!,
                      confirmed: true,
                    })
                      .then(onClose)
                      .catch((e) => setError(e.message));
                }}
              >
                <Trash2 size={18} />
              </button>
              <button
                type="button"
                className="button"
                onClick={() => onSchedule(initial as Task)}
              >
                <Clock size={15} /> Reservar horário
              </button>
            </>
          )}
          <button
            type="submit"
            className="button primary"
            disabled={busy || !board}
          >
            {busy ? "Salvando…" : "Salvar tarefa"}
          </button>
        </footer>
        {!board && <p>Crie seu quadro antes de adicionar tarefas.</p>}
      </form>
    </Dialog>
  );
}
function EventEditor({
  initial,
  w,
  act,
  onClose,
}: {
  initial: Partial<CalendarEvent>;
  w: Workspace;
  act: (c: Command) => Promise<void>;
  onClose: () => void;
}) {
  const toLocal = (value?: string) =>
    value?.length === 16
      ? value
      : value
        ? format(
            new TZDate(value, w.preferences.timezone),
            "yyyy-MM-dd'T'HH:mm",
          )
        : format(TZDate.tz(w.preferences.timezone), "yyyy-MM-dd'T'HH:mm");
  const fromLocal = (value: string) => {
    const parts = value.split(/[-T:]/).map(Number);
    const date = TZDate.tz(
      w.preferences.timezone,
      parts[0],
      parts[1] - 1,
      parts[2],
      parts[3],
      parts[4],
    );
    if (format(date, "yyyy-MM-dd'T'HH:mm") !== value)
      throw new Error(
        "Esse horário não existe no fuso escolhido por causa de uma mudança de horário.",
      );
    return date.toISOString();
  };
  const [e, setE] = useState({
    id: initial.id ?? crypto.randomUUID(),
    title: initial.title ?? "",
    start: initial.allDay ? initial.start! : toLocal(initial.start),
    end: initial.allDay
      ? initial.end!
      : toLocal(initial.end ?? new Date(Date.now() + 3600000).toISOString()),
    allDay: initial.allDay ?? false,
    calendarId: initial.calendarId ?? w.preferences.defaultCalendarId,
    taskId: initial.taskId,
    recurrence: initial.recurrence,
    attendees: initial.attendees,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const attendees: string[] = [];
    setBusy(true);
    try {
      if (e.allDay && e.end <= e.start)
        throw new Error(
          "Para um evento de dia inteiro, o fim precisa ser no dia seguinte ou depois.",
        );
      await act({
        type: "event.upsert",
        event: {
          ...e,
          start: e.allDay ? e.start : fromLocal(e.start),
          end: e.allDay ? e.end : fromLocal(e.end),
          attendees,
        },
        expectedRevision: initial.revision ?? 0,
        confirmed: attendees.length > 0,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (w.calendars.some((c) => c.id === initial.calendarId && c.readOnly))
    return (
      <Dialog
        title="Compromisso de uma agenda somente leitura"
        onClose={onClose}
      >
        <h3>{initial.title}</h3>
        <p>
          {initial.start} — {initial.end}
        </p>
        <p>
          Este item é informativo. Alterações não são permitidas nesta agenda.
        </p>
      </Dialog>
    );
  return (
    <Dialog
      title={initial.id ? "Seu compromisso" : "Um espaço na agenda"}
      onClose={onClose}
    >
      <form className="editor-form" onSubmit={submit}>
        <label>
          Título
          <input
            autoFocus
            required
            value={e.title}
            onChange={(v) => setE({ ...e, title: v.target.value })}
          />
        </label>
        <label>
          Calendário
          <select
            value={e.calendarId}
            onChange={(v) => setE({ ...e, calendarId: v.target.value })}
          >
            <option value="primary">Principal</option>
            {w.calendars
              .filter((c) => c.id !== "primary" && !c.readOnly)
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.title}
                </option>
              ))}
          </select>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={e.allDay}
            onChange={(v) =>
              setE({
                ...e,
                allDay: v.target.checked,
                start: v.target.checked
                  ? e.start.slice(0, 10)
                  : e.start + "T09:00",
                end: v.target.checked
                  ? e.end.slice(0, 10) <= e.start.slice(0, 10)
                    ? nextDay(e.start.slice(0, 10))
                    : e.end.slice(0, 10)
                  : e.start.slice(0, 10) + "T10:00",
              })
            }
          />{" "}
          Dia inteiro
        </label>
        <div className="form-grid">
          <label>
            Início
            <input
              required
              type={e.allDay ? "date" : "datetime-local"}
              value={e.start}
              onChange={(v) =>
                setE({
                  ...e,
                  start: v.target.value,
                  end:
                    e.allDay && e.end <= v.target.value
                      ? nextDay(v.target.value)
                      : e.end,
                })
              }
            />
          </label>
          <label>
            {e.allDay ? "Último dia" : "Fim"}
            <input
              required
              type={e.allDay ? "date" : "datetime-local"}
              min={e.start}
              value={
                e.allDay && e.end
                  ? new Date(Date.parse(e.end + "T12:00:00Z") - 86400000)
                      .toISOString()
                      .slice(0, 10)
                  : e.end
              }
              onChange={(v) =>
                setE({
                  ...e,
                  end:
                    e.allDay && v.target.value
                      ? nextDay(v.target.value)
                      : v.target.value,
                })
              }
            />
          </label>
        </div>
        {initial.recurringEventId && (
          <p className="muted">A edição vale para esta ocorrência.</p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-actions">
          {initial.id && (
            <button
              type="button"
              className="icon-button danger"
              aria-label="Excluir compromisso"
              onClick={() => {
                if (confirm("Excluir este compromisso da sua agenda?"))
                  void act({
                    type: "event.delete",
                    id: e.id,
                    expectedRevision: initial.revision!,
                    confirmed: true,
                  })
                    .then(onClose)
                    .catch((err) => setError(err.message));
              }}
            >
              <Trash2 size={18} />
            </button>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar compromisso"}
          </button>
        </footer>
        <small className="muted">
          Fuso deste compromisso: {w.preferences.timezone}.
        </small>
      </form>
    </Dialog>
  );
}
function SuggestionPreview({
  command: c,
  workspace: w,
}: {
  command: Command;
  workspace: Workspace;
}) {
  if (c.type === "routine.update")
    return (
      <div className="suggestion-preview">
        <h3>Salvar sua rotina semanal</h3>
        {c.routine.map((d) => (
          <p key={d.day}>
            {
              [
                "Domingo",
                "Segunda",
                "Terça",
                "Quarta",
                "Quinta",
                "Sexta",
                "Sábado",
              ][d.day]
            }
            : trabalho{" "}
            {d.work.map((x) => `${x.start}–${x.end}`).join(", ") ||
              "não informado"}
            ; pessoal{" "}
            {d.personal.map((x) => `${x.start}–${x.end}`).join(", ") ||
              "não informado"}
          </p>
        ))}
      </div>
    );
  if (c.type === "task.upsert") {
    const board = w.boards.find((b) => b.id === c.task.boardId);
    return (
      <div className="suggestion-preview">
        <h3>
          {c.expectedRevision ? "Atualizar tarefa" : "Criar tarefa"}:{" "}
          {c.task.title}
        </h3>
        <p>
          {board?.title} ·{" "}
          {board?.columns.find((col) => col.id === c.task.columnId)?.title}
        </p>
        {c.task.dueDate && (
          <p>
            Prazo:{" "}
            {format(new Date(c.task.dueDate + "T12:00:00"), "dd/MM/yyyy")}
          </p>
        )}
        {c.task.notes && <p>{c.task.notes}</p>}
      </div>
    );
  }
  if (c.type === "event.upsert")
    return (
      <div className="suggestion-preview">
        <h3>
          {c.expectedRevision ? "Atualizar compromisso" : "Reservar horário"}:{" "}
          {c.event.title}
        </h3>
        <p>
          {c.event.allDay
            ? `${c.event.start} até ${c.event.end} (fim exclusivo)`
            : `${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: w.preferences.timezone }).format(new Date(c.event.start))} – ${formatTime(c.event.end, w.preferences)}`}
        </p>
        {!!c.event.attendees?.length && (
          <p>Convites serão enviados para: {c.event.attendees.join(", ")}.</p>
        )}
      </div>
    );
  if (c.type === "task.delete" || c.type === "event.delete") {
    const item = (c.type === "task.delete" ? w.tasks : w.events).find(
      (i) => i.id === c.id,
    );
    return (
      <div className="suggestion-preview">
        <h3>
          Excluir {c.type === "task.delete" ? "tarefa" : "compromisso"}:{" "}
          {item?.title ?? "item selecionado"}
        </h3>
        <p>A exclusão será sincronizada entre seus dispositivos.</p>
      </div>
    );
  }
  return <p>Revise esta alteração antes de aprovar.</p>;
}
