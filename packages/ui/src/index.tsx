"use client";
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
  emptyWorkspace,
  eventOnDate,
} from "@pingo/core";
import {
  Api,
  ApiError,
  PingoClient,
  webStorage,
  type User,
  type Storage,
} from "./client";
import { Pet } from "./Pet";
import { Board } from "./Board";
const Calendar = lazy(() =>
  import("./Calendar").then((m) => ({ default: m.Calendar })),
);
const Chat = lazy(() => import("./Chat").then((m) => ({ default: m.Chat })));
import { Routine } from "./Routine";
import { demoWorkspace } from "./demo";
export { Pet, PingoClient, Api };
export type { Storage };
type Platform = {
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
  const apiRef = useRef(platform.api ?? new Api());
  const api = apiRef.current;
  const [client, setClient] = useState<PingoClient>();
  const [user, setUser] = useState<User>();
  const [boot, setBoot] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [, render] = useState(0);
  const [screen, setScreen] = useState<Screen>("day");
  const [requestedConversation, setRequestedConversation] = useState<{
    id: string;
    requestId: number;
  }>();
  const [taskEditor, setTaskEditor] = useState<Partial<Task> | null>(null);
  const [eventEditor, setEventEditor] = useState<Partial<CalendarEvent> | null>(
    null,
  );
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [conflict, setConflict] = useState<{
    kind: "task" | "event";
    id: string;
  } | null>(null);
  const [focus, setFocus] = useState(false);
  const [toast, setToast] = useState("");
  async function attach(u: User, demo = false) {
    const storage = await (platform.storage ?? webStorage)(
      demo ? "demo" : u.id,
    );
    const next = new PingoClient(api, storage, demo);
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
    api
      .request<{ user: User }>("workspace")
      .then((r) => {
        if (active) return attach(r.user);
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
  useEffect(
    () =>
      client?.subscribe(() => {
        render((n) => n + 1);
        if (user && user.id !== "demo")
          platform.onWorkspace?.(client.workspace, user.id);
      }),
    [client, user],
  );
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
    try {
      await client.command(command);
      setToast(
        client.demo
          ? "Modificação salva na demonstração local."
          : client.pending.length
            ? "Guardei aqui. Vou sincronizar quando houver conexão."
            : "Alteração salva.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      throw e;
    }
  }
  async function login() {
    setLoginBusy(true);
    setError("");
    try {
      if (platform.login) {
        await platform.login();
        const result = await api.request<{ user: User }>("workspace");
        await attach(result.user);
      } else {
        const r = await fetch("/api/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            callbackURL: window.location.origin,
          }),
        });
        const data = await r.json();
        if (!r.ok || !data.url)
          throw new Error(data.message ?? "Login ainda não configurado.");
        window.location.assign(data.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao entrar.");
    } finally {
      setLoginBusy(false);
    }
  }
  async function logout() {
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
    await client?.storage.clear();
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
          <span className="logo-dot">p</span> pingo <small>BETA</small>
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
              {loginBusy ? "Aguardando autorização…" : "Entrar com Google"}
              <ArrowUpRight size={18} />
            </button>
            <button
              className="button text-button"
              onClick={() =>
                void attach({ id: "demo", name: "Você", email: "" }, true)
              }
            >
              Explorar demonstração local <MoveRight size={17} />
            </button>
            <small>
              {configured
                ? "Beta gratuito por convite · seu espaço é só seu"
                : "O login aguarda a configuração OAuth pelo administrador."}
            </small>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </div>
          <div className="welcome-pet">
            <Pet
              soundEnabled={!platform.api}
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
  const googleConflicts = [
    ...w.tasks
      .filter((t) => t.syncState === "conflict")
      .map((t) => ({ kind: "task" as const, id: t.id })),
    ...w.events
      .filter((e) => e.syncState === "conflict")
      .map((e) => ({ kind: "event" as const, id: e.id })),
  ];
  const openExternal = async (url: string) => {
    if (platform.openExternal) await platform.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("day");
          }}
        >
          <span className="logo-dot">p</span>
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
              aria-label={n.label}
              title={n.label}
              className={screen === n.id ? "nav-item selected" : "nav-item"}
              onClick={() => {
                setToast("");
                setScreen(n.id);
              }}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
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
          <button
            className="account"
            onClick={() => void logout()}
            title="Sair"
          >
            <span className="avatar-letter">{user.name[0]}</span>
            <span>
              {user.name.split(" ")[0]}
              <small>
                {client.demo ? "Demonstração local" : "Espaço individual"}
              </small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            <span className="online-dot" />
            {client.demo
              ? "Demonstração · sem conexão Google"
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
              onClick={() => setNoticesOpen(true)}
              aria-label="Abrir notificações"
            >
              <Bell size={19} />
              {w.notices.some((n) => !n.read) && <i />}
            </button>
            <span className="top-avatar">{user.name[0]}</span>
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
          {googleConflicts.length > 0 && (
            <div className="conflict-banner">
              <strong>
                {googleConflicts.length} item(ns) precisam de revisão com o
                Google.
              </strong>
              <button
                className="button"
                onClick={() => setConflict(googleConflicts[0])}
              >
                Comparar versões
              </button>
            </div>
          )}
          {screen === "day" && (
            <>
              <Board w={w} today={today} act={act} onEdit={setTaskEditor} />
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
                  soundEnabled={!platform.api}
                  preferences={prefs}
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
                <section className="panel mail-panel">
                  <div className="section-heading">
                    <h2>E-mails de hoje</h2>
                    <span>
                      {
                        w.mail.filter(
                          (m) =>
                            zonedParts(new Date(m.date), prefs.timezone)
                              .date === today,
                        ).length
                      }{" "}
                      recebidos
                    </span>
                  </div>
                  <div className="daily-mail-list">
                    {w.mail
                      .filter(
                        (m) =>
                          zonedParts(new Date(m.date), prefs.timezone).date ===
                          today,
                      )
                      .map((m) => (
                        <div
                          className={`mail-item ${m.isRead ? "read" : "unread"}`}
                          key={m.id}
                        >
                          <span className="mail-avatar">{m.from[0]}</span>
                          <div>
                            <strong>{m.from}</strong>
                            <p>{m.subject}</p>
                            <small>
                              {formatTime(m.date, prefs)} ·{" "}
                              {m.isRead ? "Lido" : "Não lido"}
                            </small>
                          </div>
                        </div>
                      ))}
                  </div>
                  {!w.mail.some(
                    (m) =>
                      zonedParts(new Date(m.date), prefs.timezone).date ===
                      today,
                  ) && <p>Nenhum e-mail recebido hoje na caixa de entrada.</p>}
                </section>
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
              <Calendar w={w} client={client} onEdit={setEventEditor} />
            </Suspense>
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
              w={w}
              client={client}
              act={act}
              openExternal={openExternal}
              onToast={setToast}
            />
          )}
          <footer className="workspace-footer">
            <span>Um passo de cada vez, com {prefs.name}.</span>
            <span>
              {client.pending.length
                ? `${client.pending.length} alteração(ões) pendente(s)`
                : w.connection.lastSync
                  ? `Google atualizado às ${formatTime(w.connection.lastSync, prefs)}`
                  : "Seu ritmo, seu espaço."}
            </span>
          </footer>
        </main>
      </div>
      {conflict && (
        <ConflictDialog
          client={client}
          item={conflict}
          onClose={() => setConflict(null)}
        />
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
function ConflictDialog({
  client,
  item,
  onClose,
}: {
  client: PingoClient;
  item: { kind: "task" | "event"; id: string };
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    local: Task | CalendarEvent;
    remote: Record<string, unknown> | null;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void client.api
      .request<{
        local: Task | CalendarEvent;
        remote: Record<string, unknown> | null;
      }>(`conflicts?kind=${item.kind}&id=${encodeURIComponent(item.id)}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [item.id, item.kind, client]);
  async function choose(choice: "google" | "pingo") {
    if (!data) return;
    if (
      !confirm(
        choice === "google"
          ? "Usar a versão Google e descartar a alteração pendente do Pingo? Se não houver item no Google, a cópia local será removida."
          : "Você revisou o Google e quer enviar a versão do Pingo? Se a criação anterior não foi confirmada, confira no Google antes de reenviar.",
      )
    )
      return;
    setBusy(true);
    try {
      await client.api.post("conflicts", {
        ...item,
        choice,
        expectedRevision: data.local.revision,
        confirmed: true,
      });
      await client.refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Vamos revisar com cuidado" onClose={onClose}>
      {data ? (
        <div className="editor-form">
          <div className="form-grid">
            <section>
              <h3>No Pingo</h3>
              <p>{data.local.title}</p>
              <small>
                {"notes" in data.local ? data.local.notes : data.local.start}
              </small>
            </section>
            <section>
              <h3>No Google</h3>
              <p>
                {String(
                  data.remote?.title ??
                    data.remote?.summary ??
                    "Nenhuma correspondência encontrada",
                )}
              </p>
              <small>
                {String(data.remote?.notes ?? data.remote?.status ?? "")}
              </small>
            </section>
          </div>
          <p className="muted">
            Sua escolha será aplicada somente a este item. Nenhuma versão será
            substituída sem esta confirmação.
          </p>
          <button
            disabled={busy}
            className="button"
            onClick={() => void choose("google")}
          >
            Usar versão Google
          </button>
          <button
            disabled={busy}
            className="button primary"
            onClick={() => void choose("pingo")}
          >
            Revisei no Google. Enviar versão Pingo
          </button>
        </div>
      ) : (
        <p>Consultando o Google…</p>
      )}
      {error && <p className="error">{error}</p>}
    </Dialog>
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
          {w.boards.find((b) => b.id === t.boardId)?.title}
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
    dueDate: initial.dueDate ?? null,
    scheduledStart: initial.scheduledStart ?? null,
    scheduledEnd: initial.scheduledEnd ?? null,
    priority: initial.priority ?? "normal",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const board = w.boards.find((b) => b.id === t.boardId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await act({
        type: "task.upsert",
        task: t,
        expectedRevision: initial.revision ?? 0,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
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
            Quadro
            <select
              disabled={!!initial.id}
              value={t.boardId}
              onChange={(e) => {
                const b = w.boards.find((b) => b.id === e.target.value)!;
                setT({ ...t, boardId: b.id, columnId: b.columns[0].id });
              }}
            >
              {w.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Etapa
            <select
              value={t.columnId}
              onChange={(e) => setT({ ...t, columnId: e.target.value })}
            >
              {board?.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prazo
            <input
              type="date"
              value={t.dueDate ?? ""}
              onChange={(e) => setT({ ...t, dueDate: e.target.value || null })}
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
                      "Excluir esta tarefa? Se conectada, ela também será excluída no Google Tasks.",
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
        {!board && (
          <p>
            Conecte o Google ou crie um quadro em Quadros antes de adicionar
            tarefas.
          </p>
        )}
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
  const [invites, setInvites] = useState(initial.attendees?.join(", ") ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const attendees = invites
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      attendees.length &&
      !confirm(
        "Salvar este compromisso e enviar convites aos participantes pelo Google Agenda?",
      )
    )
      return;
    setBusy(true);
    try {
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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
              .filter((c) => c.id !== "primary")
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
                end: v.target.checked ? e.end.slice(0, 10) : e.end + "T10:00",
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
              onChange={(v) => setE({ ...e, start: v.target.value })}
            />
          </label>
          <label>
            Fim {e.allDay ? "(data exclusiva)" : ""}
            <input
              required
              type={e.allDay ? "date" : "datetime-local"}
              value={e.end}
              onChange={(v) => setE({ ...e, end: v.target.value })}
            />
          </label>
        </div>
        <label>
          Participantes (e-mails separados por vírgula)
          <input
            value={invites}
            onChange={(v) => setInvites(v.target.value)}
            placeholder="Opcional; o envio exige confirmação"
          />
        </label>
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
                if (
                  confirm("Excluir este compromisso também no Google Agenda?")
                )
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
        <p>A exclusão também será enviada ao Google.</p>
      </div>
    );
  }
  return <p>Revise esta alteração antes de aprovar.</p>;
}
function SettingsPage({
  w,
  client,
  act,
  openExternal,
  onToast,
}: {
  w: Workspace;
  client: PingoClient;
  act: (c: Command) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onToast: (s: string) => void;
}) {
  const [p, setP] = useState(w.preferences);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState("");
  const [migration, setMigration] = useState<{
    tasks: Record<string, unknown>[];
    events: Record<string, unknown>[];
    fingerprint: string;
  } | null>(null);
  const [destination, setDestination] = useState(p.defaultBoardId);
  const [migrationCalendar, setMigrationCalendar] = useState(
    p.defaultCalendarId,
  );
  async function run(fn: () => Promise<void>) {
    try {
      await fn();
      setStatus("Tudo certo.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  async function push() {
    if (client.demo)
      throw new Error("Entre na sua conta para ativar notificações.");
    const registration = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      throw new Error("A permissão de notificações não foi concedida.");
    const response = await fetch("/push-key");
    const { key } = await response.json();
    if (!key) throw new Error("Push ainda não configurado pelo administrador.");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    await client.api.post("push", subscription.toJSON());
    onToast("Notificações ativadas neste dispositivo.");
  }
  async function preview(file: File) {
    if (file.size > 5000000) throw new Error("Arquivo maior que 5 MB.");
    const text = await file.text();
    const data = JSON.parse(text);
    const tasks = data.Todos ?? data.todos ?? data.tasks ?? data.Tasks ?? [];
    const events =
      data.Events ??
      data.events ??
      data.appointments ??
      data.Appointments ??
      data.calendarEvents ??
      data.CalendarEvents ??
      [];
    if (!Array.isArray(tasks) || !Array.isArray(events))
      throw new Error("Formato de legado não reconhecido.");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    setMigration({
      tasks,
      events,
      fingerprint: Array.from(new Uint8Array(hash))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join(""),
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DO SEU JEITO</div>
          <h1>
            Um Pingo com a <em>sua cara.</em>
          </h1>
          <p>Pequenos ajustes para uma companhia que combina com você.</p>
        </div>
      </div>
      <div className="settings-layout">
        <form
          className="panel editor-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => act({ type: "preferences.update", preferences: p }));
          }}
        >
          <h2>Seu companheiro</h2>
          <div className="pet-settings">
            <Pet preferences={p} />
            <div>
              <label>
                Nome
                <input
                  value={p.name}
                  maxLength={30}
                  onChange={(e) => setP({ ...p, name: e.target.value })}
                  required
                />
              </label>
              <div className="form-grid">
                <label>
                  Cor do Pingo
                  <input
                    type="color"
                    value={p.color}
                    onChange={(e) => setP({ ...p, color: e.target.value })}
                  />
                </label>
                <label>
                  Detalhes
                  <input
                    type="color"
                    value={p.accent}
                    onChange={(e) => setP({ ...p, accent: e.target.value })}
                  />
                </label>
              </div>
            </div>
          </div>
          <h2>Seu ritmo</h2>
          <div className="form-grid">
            <label>
              Resumo da manhã
              <input
                type="time"
                value={p.summaryTime}
                onChange={(e) => setP({ ...p, summaryTime: e.target.value })}
              />
            </label>
            <label>
              Lembrar com antecedência
              <select
                value={p.reminderMinutes}
                onChange={(e) =>
                  setP({ ...p, reminderMinutes: Number(e.target.value) })
                }
              >
                {[0, 5, 10, 15, 30, 60].map((n) => (
                  <option value={n} key={n}>
                    {n} minutos
                  </option>
                ))}
              </select>
            </label>
            <label>
              Silêncio a partir de
              <input
                type="time"
                value={p.quietStart}
                onChange={(e) => setP({ ...p, quietStart: e.target.value })}
              />
            </label>
            <label>
              Fim do silêncio
              <input
                type="time"
                value={p.quietEnd}
                onChange={(e) => setP({ ...p, quietEnd: e.target.value })}
              />
            </label>
            <label>
              Hora de dormir
              <input
                type="time"
                value={p.sleepStart}
                onChange={(e) => setP({ ...p, sleepStart: e.target.value })}
              />
            </label>
            <label>
              Hora de acordar
              <input
                type="time"
                value={p.wakeTime}
                onChange={(e) => setP({ ...p, wakeTime: e.target.value })}
              />
            </label>
          </div>
          <label>
            Fuso horário
            <input
              value={p.timezone}
              onChange={(e) => setP({ ...p, timezone: e.target.value })}
              list="timezones"
            />
            <datalist id="timezones">
              {[
                "America/Sao_Paulo",
                "America/Manaus",
                "America/Recife",
                "Europe/Lisbon",
                "UTC",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </datalist>
          </label>
          <label>
            Lista padrão
            <select
              value={p.defaultBoardId}
              onChange={(e) => setP({ ...p, defaultBoardId: e.target.value })}
            >
              <option value="">Escolha uma lista</option>
              {w.boards.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Calendário padrão
            <select
              value={p.defaultCalendarId}
              onChange={(e) =>
                setP({ ...p, defaultCalendarId: e.target.value })
              }
            >
              <option value="primary">Principal</option>
              {w.calendars.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={p.voice}
              onChange={(e) => setP({ ...p, voice: e.target.checked })}
            />{" "}
            Ler balões em voz alta
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={p.snore}
              onChange={(e) => setP({ ...p, snore: e.target.checked })}
            />{" "}
            Ronquinho ao dormir
          </label>
          <Routine
            value={p.routine ?? []}
            onChange={(routine) => setP({ ...p, routine })}
          />
          <button className="button primary" type="submit">
            Salvar meu jeito
          </button>
        </form>
        <div className="settings-secondary">
          <section className="panel connection-panel">
            <span className="connection-icon">G</span>
            <h2>Seu Google, por perto</h2>
            <p>
              Listas do Tasks, compromissos e avisos do Gmail no mesmo lugar.
            </p>
            <span
              className={`connection-status ${w.connection.connected ? "connected" : ""}`}
            >
              {w.connection.connected
                ? "Conta conectada"
                : "Ainda não conectado"}
            </span>
            {w.connection.error && (
              <p className="error">{w.connection.error}</p>
            )}
            <button
              className="button"
              disabled={client.demo}
              onClick={() =>
                void run(async () => {
                  const r = await client.api.post<{ url: string }>(
                    "google/connect",
                  );
                  await openExternal(r.url);
                })
              }
            >
              {w.connection.connected
                ? "Revisar permissões"
                : "Conectar Google Workspace"}
              <ArrowUpRight size={16} />
            </button>
            {w.connection.connected && (
              <button
                className="text-link danger"
                onClick={() => {
                  if (
                    confirm(
                      "Desconectar o Workspace? Seus dados no Google serão preservados.",
                    )
                  )
                    void run(async () => {
                      await client.api.post("google/disconnect");
                      await client.refresh();
                    });
                }}
              >
                Desconectar
              </button>
            )}
            <small>
              Entrar no Pingo e autorizar o Workspace são etapas separadas.
            </small>
          </section>
          <section className="panel editor-form">
            <h2>Uma ajudinha da IA</h2>
            <p>Escolha seu provedor. O consumo usa os créditos da sua chave.</p>
            <label>
              Provedor
              <select
                value={p.aiProvider}
                onChange={(e) =>
                  setP({
                    ...p,
                    aiProvider: e.target.value as Preferences["aiProvider"],
                  })
                }
              >
                <option value="openai">OpenAI</option>
                <option value="google">Google Gemini</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </label>
            <label>
              Modelo
              <input
                placeholder="ID do modelo disponível na sua conta"
                value={p.aiModel}
                onChange={(e) => setP({ ...p, aiModel: e.target.value })}
              />
            </label>
            <label>
              Chave de API
              <input
                type="password"
                autoComplete="new-password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Cole sua chave aqui"
              />
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={p.proactiveAI}
                onChange={(e) => setP({ ...p, proactiveAI: e.target.checked })}
              />{" "}
              Sugestões proativas (até 2 por dia)
            </label>
            <button
              className="button"
              disabled={client.demo || !key}
              onClick={() =>
                void run(async () => {
                  await act({ type: "preferences.update", preferences: p });
                  await client.api.post("ai/key", {
                    provider: p.aiProvider,
                    key,
                  });
                  setKey("");
                  onToast("Chave protegida e salva no servidor.");
                })
              }
            >
              Proteger e salvar chave
            </button>
            <button
              className="text-link danger"
              disabled={client.demo}
              onClick={() =>
                void run(async () => {
                  await client.api.request("ai/key", {
                    method: "DELETE",
                    body: JSON.stringify({ provider: p.aiProvider }),
                  });
                  onToast("Chave removida.");
                })
              }
            >
              Remover chave deste provedor
            </button>
          </section>
          <section className="panel editor-form">
            <h2>Não perder o momento</h2>
            <p>
              Receba avisos neste navegador mesmo com o painel fechado. A
              entrega depende da conexão e do dispositivo.
            </p>
            <button
              className="button"
              onClick={() =>
                client.api.base
                  ? void openExternal(`${client.api.base}/?page=settings`)
                  : void run(push)
              }
            >
              <Bell size={16} /> Ativar notificações
            </button>
          </section>
          <section className="panel editor-form">
            <h2>Trazer minha rotina antiga</h2>
            <p>
              Selecione o state.json do Pingo anterior. Vamos mostrar uma
              prévia; o arquivo original e os tokens serão preservados.
            </p>
            <label>
              Arquivo de dados
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void run(() => preview(file));
                }}
              />
            </label>
            {migration && (
              <>
                <p>
                  {migration.tasks.length} tarefas · {migration.events.length}{" "}
                  compromissos
                </p>
                <ul>
                  {migration.tasks.slice(0, 5).map((t, i) => (
                    <li key={i}>
                      {String(t.title ?? t.Title ?? "Sem título")}
                    </li>
                  ))}
                  {migration.events.slice(0, 5).map((e, i) => (
                    <li key={`event-${i}`}>
                      {String(e.title ?? e.Title ?? "Compromisso")} ·{" "}
                      {String(e.start ?? e.Start ?? "")}
                    </li>
                  ))}
                </ul>
                <label>
                  Quadro de destino
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    {w.boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Calendário de destino
                  <select
                    value={migrationCalendar}
                    onChange={(e) => setMigrationCalendar(e.target.value)}
                  >
                    <option value="primary">Principal</option>
                    {w.calendars.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button"
                  disabled={!destination}
                  onClick={() =>
                    void run(async () => {
                      await importLegacy(
                        migration,
                        {
                          ...w,
                          preferences: {
                            ...w.preferences,
                            defaultCalendarId: migrationCalendar,
                          },
                        },
                        destination,
                        act,
                      );
                      setMigration(null);
                      onToast(
                        "Importação concluída. A sincronização pode continuar em segundo plano.",
                      );
                    })
                  }
                >
                  Confirmar importação
                </button>
              </>
            )}
          </section>
          <section className="panel">
            <h2>Seu espaço é seu</h2>
            <button
              className="button"
              onClick={() =>
                download("pingo-exportacao.json", JSON.stringify(w, null, 2))
              }
            >
              <Download size={15} /> Exportar meus dados
            </button>
          </section>
        </div>
      </div>
      {status && (
        <p className="settings-status" role="status">
          {status}
        </p>
      )}
    </>
  );
}
async function importLegacy(
  data: {
    tasks: Record<string, unknown>[];
    events: Record<string, unknown>[];
    fingerprint: string;
  },
  w: Workspace,
  boardId: string,
  act: (c: Command) => Promise<void>,
) {
  const b = w.boards.find((b) => b.id === boardId)!;
  for (const [i, t] of data.tasks.entries()) {
    const source = String(t.id ?? t.Id ?? data.fingerprint + ":" + i);
    const importId = `legacy:wpf:task:${source}`;
    if (w.tasks.some((t) => t.importId === importId)) continue;
    const done = Boolean(
      t.Done ??
      t.done ??
      t.isCompleted ??
      t.IsCompleted ??
      t.completed ??
      false,
    );
    await act({
      type: "task.upsert",
      expectedRevision: 0,
      task: {
        id: crypto.randomUUID(),
        boardId: b.id,
        columnId: b.columns.find((c) => c.kind === (done ? "done" : "todo"))!
          .id,
        title: String(t.title ?? t.Title ?? "Tarefa importada"),
        notes: String(t.notes ?? t.Notes ?? ""),
        dueDate:
          typeof (t.Due ?? t.due ?? t.dueDate ?? t.DueDate) === "string"
            ? String(t.Due ?? t.due ?? t.dueDate ?? t.DueDate).slice(0, 10)
            : null,
        scheduledStart: null,
        scheduledEnd: null,
        priority: "normal",
        importId,
      },
    });
  }
  for (const [i, e] of data.events.entries()) {
    const importId = `legacy:wpf:event:${String(e.id ?? e.Id ?? data.fingerprint + ":" + i)}`;
    if (w.events.some((e) => e.importId === importId)) continue;
    const start = String(
      e.start ?? e.Start ?? e.startTime ?? e.StartTime ?? "",
    );
    const end = String(e.end ?? e.End ?? e.endTime ?? e.EndTime ?? "");
    if (!start || !end) continue;
    await act({
      type: "event.upsert",
      expectedRevision: 0,
      confirmed: false,
      event: {
        id: crypto.randomUUID(),
        title: String(e.title ?? e.Title ?? "Compromisso importado"),
        start:
          (e.AllDay ?? e.allDay)
            ? start.slice(0, 10)
            : new Date(start).toISOString(),
        end:
          (e.AllDay ?? e.allDay)
            ? end.slice(0, 10)
            : new Date(end).toISOString(),
        allDay: Boolean(e.AllDay ?? e.allDay),
        calendarId: w.preferences.defaultCalendarId,
        importId,
      },
    });
  }
}
