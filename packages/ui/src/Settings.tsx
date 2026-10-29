import { RoutineManager } from "./DeleteRoutine";
import { LegacyImport } from "./LegacyImport";
import { useState, useEffect, type ReactNode } from "react";
import {
  pingoImportInput,
  type Workspace,
  type Preferences,
  type Command,
} from "@pingo/core";
import type { Platform } from "./index";
import type { PingoClient } from "./client";
import { Routine } from "./Routine";
import { Pet } from "./Pet";
function Section({
  title,
  hint,
  children,
  save,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  save?: () => Promise<void>;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="settings-section">
      <summary>
        <strong>{title}</strong>
        <small>{hint}</small>
      </summary>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!save) return;
          setBusy(true);
          try {
            await save();
            setStatus(
              "Salvo. Se estiver offline, sincronizaremos quando a conexão voltar.",
            );
          } catch (e) {
            setStatus((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
        {save && (
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar ajustes"}
          </button>
        )}
        {status && <p role="status">{status}</p>}
      </form>
    </details>
  );
}
export function SettingsPage({
  platform,
  w,
  client,
  act,
  onConnect,
}: {
  platform: Platform;
  w: Workspace;
  client: PingoClient;
  act: (c: Command) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onToast: (s: string) => void;
  onConnect: () => void;
}) {
  const [p, setP] = useState(w.preferences),
    [key, setKey] = useState(""),
    [status, setStatus] = useState("");
  const [hiddenDetails, setHiddenDetails] = useState(false);
  useEffect(() => {
    let live = true;
    void platform.notifications
      ?.privacy()
      .then((v) => {
        if (live) setHiddenDetails(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [platform.notifications]);
  const field = <K extends keyof Preferences>(k: K, v: Preferences[K]) =>
    setP((old) => ({ ...old, [k]: v }));
  const save = (keys: (keyof Preferences)[]) => async () => {
    const preferences = { ...client.workspace.preferences };
    for (const k of keys) Object.assign(preferences, { [k]: p[k] });
    await act({ type: "preferences.update", preferences });
  };
  const toggle = (
    k: "voice" | "snore" | "taskCheckIns" | "proactiveAI",
    label: string,
  ) => (
    <label className="toggle">
      <input
        type="checkbox"
        checked={!!p[k]}
        onChange={(e) => field(k, e.target.checked)}
      />
      {label}
    </label>
  );
  const clock = (
    k: "summaryTime" | "quietStart" | "quietEnd",
    label: string,
  ) => (
    <label>
      {label}
      <input
        type="time"
        required
        value={p[k]}
        onChange={(e) => field(k, e.target.value)}
      />
    </label>
  );
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setStatus("Tudo certo.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DO SEU JEITINHO</span>
          <h1>Ajustes para a sua rotina.</h1>
          <p>Abra uma caixinha para personalizar seu Pingo.</p>
        </div>
      </div>
      <div className="settings-organized">
        <Section
          title="♡ Meu Pingo"
          hint={`${p.name} · cores, voz e ronquinho`}
          save={save(["name", "color", "accent", "voice", "snore"])}
        >
          <div className="pet-settings">
            <Pet preferences={p} />
            <label>
              Nome do Pingo
              <input
                required
                maxLength={30}
                value={p.name}
                onChange={(e) => field("name", e.target.value)}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Cor
              <input
                type="color"
                value={p.color}
                onChange={(e) => field("color", e.target.value)}
              />
            </label>
            <label>
              Detalhes
              <input
                type="color"
                value={p.accent}
                onChange={(e) => field("accent", e.target.value)}
              />
            </label>
          </div>
          {toggle("voice", "Ler balões em voz alta")}
          {toggle("snore", "Ronquinho ao dormir")}
        </Section>
        <Section
          title="♧ Lembretes e sons"
          hint={`Resumo às ${p.summaryTime} · avisos ${p.reminderMinutes} min antes`}
          save={save([
            "summaryTime",
            "quietStart",
            "quietEnd",
            "reminderMinutes",
            "taskCheckIns",
          ])}
        >
          <p>Os lembretes dependem da permissão deste aparelho.</p>
          <button
            type="button"
            className="button"
            onClick={() =>
              window.dispatchEvent(new Event("pingo-notification-prompt"))
            }
          >
            Ativar ou conferir notificações
          </button>
          <label>
            Avisar quantos minutos antes?
            <input
              type="number"
              min={0}
              max={1440}
              required
              value={p.reminderMinutes}
              onChange={(e) => field("reminderMinutes", Number(e.target.value))}
            />
          </label>
          {clock("summaryTime", "Resumo do dia")}
          <div className="form-grid">
            {clock("quietStart", "Silêncio a partir de")}
            {clock("quietEnd", "Silêncio até")}
          </div>
          {toggle(
            "taskCheckIns",
            "Perguntar quando começar e concluir tarefas com horário",
          )}
          {platform.notifications && (
            <>
              <button
                type="button"
                className="button"
                onClick={() => void run(platform.notifications!.settings)}
              >
                Permissões do aparelho
              </button>
              {platform.kind === "android" && (
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={hiddenDetails}
                    onChange={(e) => {
                      const hidden = e.target.checked;
                      void run(async () => {
                        await platform.notifications!.setPrivacy(hidden);
                        setHiddenDetails(hidden);
                      });
                    }}
                  />
                  Ocultar detalhes na tela bloqueada
                </label>
              )}
            </>
          )}
        </Section>
        <Section
          title="☀ Minha rotina"
          hint="Trabalho, pausas e tempo para você"
          save={save(["routine", "timezone"])}
        >
          <label>
            Fuso horário
            <input
              required
              value={p.timezone}
              onChange={(e) => field("timezone", e.target.value)}
            />
          </label>
          <Routine
            value={p.routine ?? []}
            onChange={(v) => field("routine", v)}
          />
          <RoutineManager w={w} act={act} />
        </Section>
        <Section
          title="☁ Conta e sincronização"
          hint={
            client.localOnly
              ? "Somente neste aparelho"
              : "Seus dados nos seus dispositivos"
          }
        >
          <p>
            {client.localOnly
              ? "Você pode usar suas tarefas offline. Crie uma conta para sincronizar entre aparelhos."
              : `Sua conta sincroniza quando há internet. ${client.pending.length} alteração(ões) aguardando envio.`}
          </p>
          {client.localOnly ? (
            <button type="button" className="button" onClick={onConnect}>
              Entrar ou criar conta
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => void run(() => client.sync())}
            >
              Sincronizar agora
            </button>
          )}
          <p>Para sair da conta, toque no perfil no alto da tela.</p>
        </Section>
        <Section
          title="✦ Ajuda da IA — opcional"
          hint="O Pingo funciona sem configurar uma IA"
          save={save(["aiProvider", "aiModel", "proactiveAI"])}
        >
          <p>
            Uma IA pode ajudar na conversa. É opcional e pode consumir créditos
            do serviço escolhido.
          </p>
          <details>
            <summary>Configurar meu provedor</summary>
            <div className="editor-form">
              <label>
                Provedor
                <select
                  value={p.aiProvider}
                  onChange={(e) =>
                    field(
                      "aiProvider",
                      e.target.value as Preferences["aiProvider"],
                    )
                  }
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Claude</option>
                </select>
              </label>
              <label>
                Modelo
                <input
                  value={p.aiModel}
                  onChange={(e) => field("aiModel", e.target.value)}
                />
              </label>
              <label>
                Chave de API
                <input
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="button"
                disabled={!key || client.localOnly || client.demo}
                onClick={() =>
                  void run(async () => {
                    await save(["aiProvider", "aiModel"])();
                    await client.api.post("ai/key", {
                      provider: p.aiProvider,
                      key,
                    });
                    setKey("");
                  })
                }
              >
                Salvar chave protegida
              </button>
              <button
                type="button"
                className="text-link"
                disabled={client.localOnly || client.demo}
                onClick={() =>
                  void run(() =>
                    client.api.request("ai/key", {
                      method: "DELETE",
                      body: JSON.stringify({ provider: p.aiProvider }),
                    }),
                  )
                }
              >
                Remover chave
              </button>
            </div>
          </details>
          {toggle("proactiveAI", "Receber sugestões da IA (até duas por dia)")}
        </Section>
        <Section
          title="◇ Meus dados"
          hint="Guardar ou trazer uma cópia de segurança"
        >
          <button
            type="button"
            className="button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [JSON.stringify({ format: "pingo-backup-v1", workspace: w })],
                  { type: "application/json" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "pingo-meus-dados.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Exportar meus dados
          </button>
          <details>
            <summary>Importar uma cópia do Pingo</summary>
            <p>
              Seus dados atuais serão preservados. Confira a quantidade antes de
              confirmar.
            </p>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => {
                    if (file.size > 10000000)
                      throw new Error("Use uma cópia de até 10 MB.");
                    const raw = JSON.parse(await file.text());
                    const data = pingoImportInput().parse(raw.workspace ?? raw);
                    if (
                      confirm(
                        `Importar ${data.tasks.length} tarefas e ${data.events.length} compromissos?`,
                      )
                    )
                      await act({
                        type: "workspace.import",
                        data,
                        confirmed: true,
                      });
                  });
                e.target.value = "";
              }}
            />
          </details>
          <LegacyImport w={w} act={act} />
        </Section>
      </div>
      {status && (
        <p role="status" className="settings-status">
          {status}
        </p>
      )}
    </>
  );
}
