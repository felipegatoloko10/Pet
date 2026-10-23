import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  normalizeWorkspace,
  type ChatMessage,
  type Command,
} from "@pingo/core";
import type { PingoClient } from "./client";
export function Chat({
  client,
  onUpdate,
  preview,
}: {
  client: PingoClient;
  onUpdate: () => void;
  preview: (command: Command) => ReactNode;
}) {
  normalizeWorkspace(client.workspace);
  const conversations = client.workspace.conversations!;
  const [selected, setSelected] = useState(
      conversations.find((c) => !c.archived)?.id ?? "",
    ),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState(false),
    [showArchive, setShowArchive] = useState(false),
    [optimistic, setOptimistic] = useState<ChatMessage[]>([]),
    [retry, setRetry] = useState<{ id: string; text: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null),
    c = conversations.find((c) => c.id === selected),
    messages = [
      ...(c?.messages ?? []),
      ...optimistic.filter(
        (m) => !c?.messages.some((saved) => saved.id === m.id),
      ),
    ];
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, busy]);
  async function create() {
    const id = crypto.randomUUID();
    await client.command({
      type: "conversation.update",
      id,
      title: "Nova conversa",
      archived: false,
    });
    setSelected(id);
    setOptimistic([]);
    setRetry(null);
    setHistory(false);
  }
  async function send(text: string, id = crypto.randomUUID()) {
    if (!text.trim() || busy) return;
    setError("");
    setBusy(true);
    setDraft("");
    setOptimistic([{ id, role: "user", text }]);
    setRetry({ id, text });
    try {
      let conversationId = selected;
      if (!c) {
        conversationId = crypto.randomUUID();
        await client.command({
          type: "conversation.update",
          id: conversationId,
          title: text.slice(0, 65),
          archived: false,
        });
        setSelected(conversationId);
      } else if (c.title === "Nova conversa")
        await client.command({
          type: "conversation.update",
          id: c.id,
          title: text.slice(0, 65),
          archived: false,
        });
      if (client.demo) {
        const conversation = client.workspace.conversations!.find(
          (c) => c.id === conversationId,
        )!;
        conversation.messages.push(
          { id, role: "user", text },
          {
            role: "assistant",
            text: "Na sua conta, configure sua chave de IA em Ajustes para planejar horários comigo. Esta conversa de demonstração fica salva apenas neste dispositivo.",
          },
        );
        await client.persist();
        client.emit();
      } else {
        await client.flush();
        if (client.pending.length)
          throw new Error(
            "Conecte-se para sincronizar esta conversa antes de enviar.",
          );
        await client.api.post("chat", {
          message: text,
          conversationId,
          messageId: id,
        });
        await client.refresh();
      }
      setOptimistic([]);
      setRetry(null);
      onUpdate();
    } catch (e) {
      setOptimistic([]);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="chat-app">
      <aside className={`chat-history ${history ? "expanded" : ""}`}>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void create().catch((e) => setError(e.message))}
        >
          ＋ Nova conversa
        </button>
        <button
          className="text-link"
          onClick={() => setShowArchive(!showArchive)}
        >
          {showArchive ? "Conversas ativas" : "Arquivadas"}
        </button>
        {conversations
          .filter((c) => c.archived === showArchive)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((item) => (
            <div
              className={`history-row ${item.id === selected ? "selected" : ""}`}
              key={item.id}
            >
              <button
                disabled={busy}
                onClick={() => {
                  setSelected(item.id);
                  setOptimistic([]);
                  setRetry(null);
                  setHistory(false);
                }}
              >
                {item.title}
              </button>
              <button
                disabled={busy}
                aria-label={`Renomear ${item.title}`}
                onClick={() => {
                  const title = prompt("Nome da conversa", item.title);
                  if (title)
                    void client
                      .command({
                        type: "conversation.update",
                        id: item.id,
                        title,
                        archived: item.archived,
                      })
                      .catch((e) => setError(e.message));
                }}
              >
                ✎
              </button>
              <button
                disabled={busy}
                aria-label={`${item.archived ? "Restaurar" : "Arquivar"} ${item.title}`}
                onClick={() =>
                  void client
                    .command({
                      type: "conversation.update",
                      id: item.id,
                      title: item.title,
                      archived: !item.archived,
                    })
                    .catch((e) => setError(e.message))
                }
              >
                {item.archived ? "↩" : "⊟"}
              </button>
            </div>
          ))}
      </aside>
      <div className="chat-main">
        <header>
          <button
            className="button small history-toggle"
            onClick={() => setHistory(!history)}
          >
            ☰ Conversas
          </button>
          <div>
            <h1>{c?.title ?? "Converse com Pingo"}</h1>
            <small>Agenda, ideias e um pouco mais de calma.</small>
          </div>
        </header>
        <div className="chat-transcript" aria-live="polite">
          {!messages.length && (
            <div className="chat-empty">
              <span>✦</span>
              <h2>Vamos encontrar espaço no seu dia?</h2>
              <p>
                Conte sua rotina, peça sugestões ou combine um horário comigo.
              </p>
              <button
                className="button"
                onClick={() =>
                  setDraft(
                    "Quero marcar um dentista. Pode me ajudar a encontrar um horário?",
                  )
                }
              >
                Encontrar um horário
              </button>
            </div>
          )}
          {messages.map((message, i) => (
            <article
              className={`chat-turn ${message.role}`}
              key={message.id ?? i}
            >
              <strong>
                {message.role === "user"
                  ? "Você"
                  : client.workspace.preferences.name}
              </strong>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ a: ({ children }) => <span>{children}</span> }}
              >
                {message.text}
              </ReactMarkdown>
              {message.suggestions?.map((s) => (
                <div className="suggestion-card" key={s.approvalId}>
                  {preview(s.command)}
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        setBusy(true);
                        await client.api.post("approvals", {
                          id: s.approvalId,
                          conversationId: selected,
                        });
                        await client.refresh();
                        onUpdate();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Confirmar alteração
                  </button>
                </div>
              ))}
            </article>
          ))}
          {busy && (
            <div role="status" className="chat-thinking">
              ✦ Pingo está pensando…
            </div>
          )}
          <div ref={bottom} />
        </div>
        <div className="chat-composer">
          {error && (
            <p role="alert" className="error">
              {error}{" "}
              {retry && (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => void send(retry.text, retry.id)}
                >
                  Tentar novamente
                </button>
              )}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              aria-label="Mensagem para Pingo"
              placeholder="Converse com Pingo…"
              value={draft}
              disabled={busy || c?.archived}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={2}
            />
            <button
              className="button primary"
              disabled={busy || !draft.trim() || c?.archived}
            >
              Enviar ↑
            </button>
          </form>
          <small>
            {c?.archived
              ? "Restaure esta conversa para continuar."
              : "Enter envia · Shift + Enter cria uma linha. Exclusões e convites exigem confirmação."}
          </small>
        </div>
      </div>
    </section>
  );
}
