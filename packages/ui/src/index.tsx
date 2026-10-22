"use client";
import {
  useState,
  useEffect,
  useRef,
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
import { demoWorkspace } from "./demo";
export { Pet, PingoClient, Api };
export type { Storage };
type Platform = {
  api?: Api;
  login?: () => Promise<void>;
  logout?: () => Promise<void>;
  storage?: (userId: string) => Promise<Storage>;
  openExternal?: (url: string) => Promise<void>;
};
const nav = [
  { id: "day", label: "Meu dia", icon: Sun },
  { id: "boards", label: "Quadros", icon: Columns3 },
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
  const [taskEditor, setTaskEditor] = useState<Partial<Task> | null>(null);
  const [eventEditor, setEventEditor] = useState<Partial<CalendarEvent> | null>(
    null,
  );
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [toast, setToast] = useState("");
  async function attach(u: User, demo = false) {
    const storage = await (platform.storage ?? webStorage)(
      demo ? "demo" : u.id,
    );
    const next = new PingoClient(api, storage, demo);
    if (demo && !(await storage.get("workspace")))
      await storage.set("workspace", JSON.stringify(demoWorkspace()));
    setUser(u);
    setClient(next);
    localStorage.setItem("pingo:user", JSON.stringify(u));
    await next.init();
  }
  useEffect(() => {
    let active = true;
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
  useEffect(() => client?.subscribe(() => render((n) => n + 1)), [client]);
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
  const tasks = w.tasks.filter((t) => !t.deleted);
  const pending = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const visibleError = error || client.error;
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
              className={screen === n.id ? "nav-item selected" : "nav-item"}
              onClick={() => setScreen(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "boards" && <small>{w.boards.length}</small>}
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
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {format(new Date(), "EEEE, d MMMM", { locale: ptBR })}
                  </div>
                  <h1>
                    Um bom dia começa
                    <br />
                    com um pouco de <em>calma.</em>
                  </h1>
                  <p>
                    Olá, {user.name.split(" ")[0]}. Vamos dar um passo de cada
                    vez.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setTaskEditor({})}
                >
                  <Plus size={17} /> Nova tarefa
                </button>
              </div>
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
                  preferences={prefs}
                  message={
                    pending.length
                      ? "Estou aqui para ajudar. ♡"
                      : "Tudo no seu ritmo. ♡"
                  }
                  focus={focus}
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
                            eventDay(e, prefs) === today &&
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
                <section className="panel">
                  <div className="section-heading">
                    <h2>
                      Seu próximo passo <span>{pending.length}</span>
                    </h2>
                    <button
                      className="text-link"
                      onClick={() => setScreen("boards")}
                    >
                      Ver quadro <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="task-list">
                    {[...pending]
                      .sort((a, b) =>
                        (a.dueDate ?? "9999").localeCompare(
                          b.dueDate ?? "9999",
                        ),
                      )
                      .slice(0, 5)
                      .map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          w={w}
                          today={today}
                          onEdit={() => setTaskEditor(t)}
                          onComplete={() => {
                            const b = w.boards.find((b) => b.id === t.boardId)!;
                            void act({
                              type: "task.upsert",
                              task: {
                                ...t,
                                columnId: b.columns.find(
                                  (c) => c.kind === "done",
                                )!.id,
                              },
                              expectedRevision: t.revision,
                            }).catch(() => {});
                          }}
                        />
                      ))}
                    {!pending.length && (
                      <Empty
                        title="Espaço para um novo começo"
                        text="Adicione uma tarefa ou conecte suas listas do Google."
                      />
                    )}
                  </div>
                  <button
                    className="add-inline"
                    onClick={() => setTaskEditor({})}
                  >
                    <Plus size={16} /> Adicionar uma tarefa
                  </button>
                </section>
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
                        eventDay(e, prefs) === today,
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
                    (e) => !e.deleted && eventDay(e, prefs) === today,
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
                    <h2>
                      <Mail size={17} /> Chegou na caixa de entrada
                    </h2>
                    <span className="muted">{w.mail.length} não lidos</span>
                  </div>
                  {w.mail.slice(0, 4).map((m) => (
                    <div className="mail-item" key={m.id}>
                      <span className="mail-avatar">{m.from[0]}</span>
                      <div>
                        <strong>{m.from}</strong>
                        <button
                          className="text-link"
                          onClick={() => void openExternal(m.url)}
                        >
                          {m.subject}
                        </button>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`Transformar ${m.subject} em tarefa`}
                        title="Transformar em tarefa"
                        onClick={() =>
                          setTaskEditor({
                            title: m.subject,
                            notes: `De: ${m.from}`,
                            sourceUrl: m.url,
                          })
                        }
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  ))}
                  {!w.mail.length && (
                    <p className="empty-inline">
                      Sem e-mails não lidos por aqui.
                    </p>
                  )}
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
          {screen === "boards" && (
            <Boards w={w} today={today} act={act} onEdit={setTaskEditor} />
          )}
          {screen === "calendar" && <Agenda w={w} onEdit={setEventEditor} />}
          {screen === "chat" && (
            <Conversation
              client={client}
              onUpdate={() => void client.refresh()}
            />
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
      {taskEditor && (
        <TaskEditor
          initial={taskEditor}
          w={w}
          act={act}
          onClose={() => setTaskEditor(null)}
          onSchedule={(t) => {
            setTaskEditor(null);
            setEventEditor({ title: t.title, taskId: t.id });
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
function Boards({
  w,
  today,
  act,
  onEdit,
}: {
  w: Workspace;
  today: string;
  act: (c: Command) => Promise<void>;
  onEdit: (t: Partial<Task>) => void;
}) {
  const [selected, setSelected] = useState(
    w.preferences.defaultBoardId || w.boards[0]?.id || "",
  );
  const [filter, setFilter] = useState("");
  const b = w.boards.find((b) => b.id === selected) ?? w.boards[0];
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">UM LUGAR PARA CADA COISA</div>
          <h1>
            Suas ideias em <em>movimento.</em>
          </h1>
          <p>Organize o caminho. Celebre cada cartão concluído.</p>
        </div>
        <button
          className="button primary"
          onClick={() => onEdit({ boardId: b?.id })}
          disabled={!b}
        >
          <Plus size={17} /> Nova tarefa
        </button>
      </div>
      <div className="board-toolbar">
        <div className="board-tabs">
          {w.boards.map((x) => (
            <button
              key={x.id}
              className={x.id === b?.id ? "active" : ""}
              onClick={() => setSelected(x.id)}
            >
              {x.title}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Buscar tarefas"
            placeholder="Encontrar uma tarefa"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
      </div>
      {b ? (
        <div className="kanban">
          {b.columns.map((col) => {
            const cards = w.tasks.filter(
              (t) =>
                !t.deleted &&
                t.boardId === b.id &&
                t.columnId === col.id &&
                t.title.toLowerCase().includes(filter.toLowerCase()),
            );
            return (
              <section
                className={`kanban-column col-${col.kind}`}
                key={col.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/pingo-task");
                  const t = w.tasks.find(
                    (t) => t.id === id && t.boardId === b.id,
                  );
                  if (t)
                    void act({
                      type: "task.upsert",
                      task: { ...t, columnId: col.id },
                      expectedRevision: t.revision,
                    }).catch(() => {});
                }}
              >
                <header>
                  <span className="column-dot" />
                  <h2>{col.title}</h2>
                  <small>{cards.length}</small>
                  <button
                    className="icon-button"
                    onClick={() => onEdit({ boardId: b.id, columnId: col.id })}
                    aria-label={`Adicionar em ${col.title}`}
                  >
                    <Plus size={16} />
                  </button>
                </header>
                {cards.map((t) => (
                  <article
                    key={t.id}
                    className="task-card"
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/pingo-task", t.id)
                    }
                  >
                    <button className="card-main" onClick={() => onEdit(t)}>
                      <span className={`priority priority-${t.priority}`}>
                        {t.priority === "high"
                          ? "Prioridade"
                          : t.priority === "low"
                            ? "Com calma"
                            : "Rotina"}
                      </span>
                      <h3>{t.title}</h3>
                      {t.notes && <p>{t.notes}</p>}
                      <footer>
                        {t.dueDate && (
                          <span className={t.dueDate < today ? "overdue" : ""}>
                            <CalendarDays size={13} />
                            {t.dueDate === today
                              ? "Hoje"
                              : format(
                                  new Date(t.dueDate + "T12:00:00"),
                                  "dd MMM",
                                  { locale: ptBR },
                                )}
                          </span>
                        )}
                        <span
                          className={`sync-state state-${t.syncState}`}
                          title={t.error}
                        >
                          {stateLabel[t.syncState]}
                        </span>
                      </footer>
                    </button>
                    <select
                      aria-label={`Mover ${t.title}`}
                      value={t.columnId}
                      onChange={(e) =>
                        void act({
                          type: "task.upsert",
                          task: { ...t, columnId: e.target.value },
                          expectedRevision: t.revision,
                        }).catch(() => {})
                      }
                    >
                      {b.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
                <button
                  className="add-inline"
                  onClick={() => onEdit({ boardId: b.id, columnId: col.id })}
                >
                  <Plus size={15} /> Adicionar tarefa
                </button>
              </section>
            );
          })}
          <div className="add-column">
            {adding ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({
                    type: "column.create",
                    boardId: b.id,
                    id: crypto.randomUUID(),
                    title,
                    expectedRevision: b.revision,
                  })
                    .then(() => {
                      setAdding(false);
                      setTitle("");
                    })
                    .catch(() => {});
                }}
              >
                <input
                  autoFocus
                  aria-label="Nome da coluna"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={100}
                />
                <button className="button" type="submit">
                  Criar coluna
                </button>
              </form>
            ) : (
              <button className="add-inline" onClick={() => setAdding(true)}>
                <Plus size={16} /> Nova coluna
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="panel">
          <Empty
            title="Seu quadro começa aqui"
            text="Conecte o Google para importar suas listas ou crie um quadro local."
          />
          <button
            className="button"
            onClick={() => {
              const title = prompt("Nome do quadro");
              if (title)
                void act({
                  type: "board.create",
                  id: crypto.randomUUID(),
                  title,
                }).catch(() => {});
            }}
          >
            <Plus size={16} /> Criar quadro local
          </button>
        </div>
      )}
    </>
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
        {initial.sourceUrl && (
          <a
            href={initial.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Abrir e-mail original <ArrowUpRight size={14} />
          </a>
        )}
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
function Agenda({
  w,
  onEdit,
}: {
  w: Workspace;
  onEdit: (e: Partial<CalendarEvent>) => void;
}) {
  const [day, setDay] = useState(new Date());
  const [weekly, setWeekly] = useState(true);
  const days = weekly
    ? Array.from({ length: 7 }, (_, i) =>
        addDays(startOfWeek(day, { weekStartsOn: 1 }), i),
      )
    : [day];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TEMPO PARA O QUE IMPORTA</div>
          <h1>
            Abra espaço no <em>seu dia.</em>
          </h1>
          <p>Sua agenda, com pausas incluídas.</p>
        </div>
        <button className="button primary" onClick={() => onEdit({})}>
          <Plus size={17} /> Novo compromisso
        </button>
      </div>
      <div className="calendar-toolbar">
        <div>
          <button
            className="icon-button"
            aria-label="Período anterior"
            onClick={() => setDay(addDays(day, weekly ? -7 : -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>{format(day, "MMMM yyyy", { locale: ptBR })}</h2>
          <button
            className="icon-button"
            aria-label="Próximo período"
            onClick={() => setDay(addDays(day, weekly ? 7 : 1))}
          >
            <ChevronRight size={18} />
          </button>
          <button className="button small" onClick={() => setDay(new Date())}>
            Hoje
          </button>
        </div>
        <div className="segmented">
          <button
            className={!weekly ? "active" : ""}
            onClick={() => setWeekly(false)}
          >
            Dia
          </button>
          <button
            className={weekly ? "active" : ""}
            onClick={() => setWeekly(true)}
          >
            Semana
          </button>
        </div>
      </div>
      <div className={`calendar-grid ${weekly ? "weekly" : "daily"}`}>
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          return (
            <section
              key={key}
              className={
                key === format(new Date(), "yyyy-MM-dd")
                  ? "calendar-day is-today"
                  : "calendar-day"
              }
            >
              <header>
                <span>{format(d, "EEE", { locale: ptBR })}</span>
                <strong>{format(d, "dd")}</strong>
              </header>
              {w.events
                .filter(
                  (e) =>
                    !e.deleted &&
                    !e.recurrence &&
                    eventDay(e, w.preferences) === key,
                )
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((e) => (
                  <button
                    className="calendar-event"
                    key={e.id}
                    onClick={() => onEdit(e)}
                  >
                    <small>
                      {e.allDay
                        ? "Dia inteiro"
                        : formatTime(e.start, w.preferences)}
                    </small>
                    <strong>{e.title}</strong>
                    {e.recurringEventId && <small>↻ Recorrente</small>}
                    <small>{stateLabel[e.syncState]}</small>
                  </button>
                ))}
              <button
                className="calendar-add"
                aria-label={`Novo compromisso em ${key}`}
                onClick={() =>
                  onEdit({ start: key + "T09:00", end: key + "T10:00" })
                }
              >
                <Plus size={16} />
              </button>
            </section>
          );
        })}
      </div>
      <p className="muted calendar-note">
        Horários em {w.preferences.timezone}. Um horário reservado para tarefa
        vira um compromisso na agenda.
      </p>
    </>
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
        ? format(new Date(value), "yyyy-MM-dd'T'HH:mm")
        : format(new Date(), "yyyy-MM-dd'T'HH:mm");
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
          start: e.allDay ? e.start : new Date(e.start).toISOString(),
          end: e.allDay ? e.end : new Date(e.end).toISOString(),
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
          O formulário usa o fuso do dispositivo:{" "}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}.
        </small>
      </form>
    </Dialog>
  );
}
function Conversation({
  client,
  onUpdate,
}: {
  client: PingoClient;
  onUpdate: () => void;
}) {
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<
    {
      role: string;
      text: string;
      suggestions?: { approvalId: string; command: Command }[];
    }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [mailId, setMailId] = useState("");
  async function send(value: string) {
    if (!value.trim()) return;
    setMessage("");
    setBusy(true);
    setItems((i) => [...i, { role: "user", text: value }]);
    try {
      if (client.demo) {
        setItems((i) => [
          ...i,
          {
            role: "pet",
            text: "Esta é uma demonstração local. Na sua conta, escolha um provedor e conecte sua chave em Ajustes para conversarmos.",
          },
        ]);
        return;
      }
      const result = await client.api.post<{
        text: string;
        suggestions: { approvalId: string; command: Command }[];
      }>("chat", { message: value, ...(mailId ? { mailBodyId: mailId } : {}) });
      setItems((i) => [...i, { role: "pet", ...result }]);
      onUpdate();
    } catch (e) {
      setItems((i) => [...i, { role: "pet", text: (e as Error).message }]);
    } finally {
      setBusy(false);
      setMailId("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">COMPANHIA PARA PENSAR MELHOR</div>
          <h1>
            Vamos <em>conversar?</em>
          </h1>
          <p>
            Um lugar para organizar as ideias e encontrar seu próximo passo.
          </p>
        </div>
      </div>
      <section className="conversation panel">
        <div className="chat-messages">
          {!items.length && (
            <div className="chat-welcome">
              <Pet preferences={client.workspace.preferences} />
              <h2>Oi! O que vamos cuidar hoje?</h2>
              <div className="prompt-chips">
                {[
                  "O que tenho hoje?",
                  "Sugira como encaixar minhas tarefas",
                  "Adicione comprar remédio para amanhã",
                ].map((p) => (
                  <button key={p} onClick={() => void send(p)}>
                    {p} <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {items.map((item, index) => (
            <div className={`chat-message ${item.role}`} key={index}>
              <span>
                {item.role === "user"
                  ? "Você"
                  : client.workspace.preferences.name}
              </span>
              <p>{item.text}</p>
              {item.suggestions?.map((s) => (
                <div className="suggestion" key={s.approvalId}>
                  <strong>Sugestão para sua aprovação</strong>
                  <pre>{JSON.stringify(s.command, null, 2)}</pre>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void client.api
                        .post("approvals", { id: s.approvalId })
                        .then(() => {
                          setItems((items) =>
                            items.map((x) => ({
                              ...x,
                              suggestions: x.suggestions?.filter(
                                (a) => a.approvalId !== s.approvalId,
                              ),
                            })),
                          );
                          onUpdate();
                        })
                        .catch((e) =>
                          setItems((i) => [
                            ...i,
                            { role: "pet", text: e.message },
                          ]),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    Aprovar esta alteração
                  </button>
                </div>
              ))}
            </div>
          ))}
          {busy && (
            <p className="thinking">
              Pingo está pensando <span>•••</span>
            </p>
          )}
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send(message);
          }}
        >
          {client.workspace.mail.length > 0 && (
            <label className="mail-consent">
              Enviar o corpo de um e-mail nesta conversa
              <select
                value={mailId}
                onChange={(e) => setMailId(e.target.value)}
              >
                <option value="">Nenhum e-mail</option>
                {client.workspace.mail.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.subject}
                  </option>
                ))}
              </select>
              <small>
                Ao selecionar, você autoriza enviar o corpo ao provedor de IA.
              </small>
            </label>
          )}
          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Peça uma mão ao Pingo…"
              aria-label="Mensagem para o Pingo"
              rows={2}
              maxLength={6000}
            />
            <button
              className="button primary"
              disabled={busy || !message.trim()}
              aria-label="Enviar mensagem"
            >
              <ArrowUpRight size={20} />
            </button>
          </div>
          <small>
            A IA pode errar. Exclusões, convites e sugestões precisam da sua
            aprovação.
          </small>
        </form>
      </section>
    </>
  );
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
    const tasks = data.tasks ?? data.Tasks ?? [];
    const events =
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
              checked={p.reducedMotion}
              onChange={(e) => setP({ ...p, reducedMotion: e.target.checked })}
            />{" "}
            Reduzir movimentos
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={p.voice}
              onChange={(e) => setP({ ...p, voice: e.target.checked })}
            />{" "}
            Ler balões em voz alta no PC
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={p.snore}
              onChange={(e) => setP({ ...p, snore: e.target.checked })}
            />{" "}
            Ronquinho ao dormir no PC
          </label>
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
            <button className="button" onClick={() => void run(push)}>
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
                <button
                  className="button"
                  disabled={!destination}
                  onClick={() =>
                    void run(async () => {
                      await importLegacy(migration, w, destination, act);
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
    const source = String(t.id ?? t.Id ?? i);
    const importId = `legacy:${data.fingerprint}:task:${source}`;
    if (w.tasks.some((t) => t.importId === importId)) continue;
    const done = Boolean(
      t.isCompleted ?? t.IsCompleted ?? t.completed ?? false,
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
          typeof (t.dueDate ?? t.DueDate) === "string"
            ? String(t.dueDate ?? t.DueDate).slice(0, 10)
            : null,
        scheduledStart: null,
        scheduledEnd: null,
        priority: "normal",
        importId,
      },
    });
  }
  for (const [i, e] of data.events.entries()) {
    const importId = `legacy:${data.fingerprint}:event:${String(e.id ?? e.Id ?? i)}`;
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
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        allDay: false,
        calendarId: w.preferences.defaultCalendarId,
        importId,
      },
    });
  }
}
