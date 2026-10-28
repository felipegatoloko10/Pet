import { openDB } from "idb";
import {
  applyCommand,
  preparePingoWorkspace,
  acknowledgePingoWorkspace,
  normalizeWorkspace,
  emptyWorkspace,
  type Workspace,
  type Operation,
  type Command,
} from "@pingo/core";
export type User = { id: string; name: string; email: string };
export function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  )
    return error.issues
      .map((i: { message?: string }) => i.message)
      .filter(Boolean)
      .join(" ");
  return error instanceof Error
    ? error.message
    : "Não consegui salvar. Confira os dados e tente novamente.";
}
export type Storage = {
  nativeFlush?: () => Promise<{ workspace?: Workspace; pending: Pending[] }>;
  discardPending?: () => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  clear: () => Promise<void>;
};
export async function webStorage(userId: string): Promise<Storage> {
  const db = await openDB(`pingo-v2:${userId}`, 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  });
  return {
    get: async (key) => (await db.get("state", key)) ?? null,
    set: async (key, value) => {
      await db.put("state", value, key);
    },
    clear: async () => {
      await db.clear("state");
    },
  };
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class Api {
  constructor(
    public base = "",
    public token?: string,
    public accountId?: string,
  ) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.base}/api/v1/${path}`, {
      ...options,
      credentials: this.token ? "omit" : "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(this.accountId && !this.accountId.startsWith("local:")
          ? { "X-Pingo-Account": this.accountId }
          : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      signal: AbortSignal.timeout(65000),
    });
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(response.status, data.error ?? "Falha de conexão.");
    return data;
  }
  post<T>(path: string, value: unknown = {}) {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(value),
    });
  }
}
export type Pending = { operation: Operation; error?: string };
export class PingoClient {
  workspace: Workspace = emptyWorkspace();
  pending: Pending[] = [];
  serverRevision?: number;
  error = "";
  syncing = false;
  online = typeof navigator === "undefined" ? true : navigator.onLine;
  listeners = new Set<() => void>();
  private active = true;
  private running = false;
  private generation = 0;
  private flushAgain = false;
  private flushWaiters: (() => void)[] = [];
  constructor(
    public api: Api,
    public storage: Storage,
    public demo = false,
    public localOnly = false,
  ) {}
  dispose() {
    this.active = false;
    this.generation++;
    this.listeners.clear();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  emit() {
    this.listeners.forEach((fn) => fn());
  }
  async persist() {
    // A single IndexedDB/SQLite write commits the optimistic view and queue together.
    await this.storage.set(
      "snapshot",
      JSON.stringify({
        workspace: this.workspace,
        pending: this.pending,
        serverRevision: this.serverRevision,
      }),
    );
  }
  async init() {
    const snapshot = await this.storage.get("snapshot");
    if (snapshot) {
      const saved = JSON.parse(snapshot);
      this.workspace = normalizeWorkspace({
        ...emptyWorkspace(),
        ...saved.workspace,
      });
      this.pending = Array.isArray(saved.pending) ? saved.pending : [];
      this.serverRevision = Number.isInteger(saved.serverRevision)
        ? saved.serverRevision
        : undefined;
      this.emit();
      if (!this.demo) this.workspace = preparePingoWorkspace(this.workspace);
      void this.refresh();
      return;
    }
    const cached = await this.storage.get("workspace");
    const queue = await this.storage.get("pending");
    if (cached)
      this.workspace = normalizeWorkspace({
        ...emptyWorkspace(),
        ...JSON.parse(cached),
      });
    if (queue) this.pending = JSON.parse(queue);
    if (!this.demo) this.workspace = preparePingoWorkspace(this.workspace);
    this.emit();
    await this.refresh();
  }
  async refresh() {
    if (!this.active) return;
    if (this.workspace.storageMode === "pingo") {
      this.workspace = preparePingoWorkspace(this.workspace);
      await this.persist();
      this.emit();
    }
    if (this.demo || this.localOnly) {
      this.emit();
      return;
    }
    this.online = navigator.onLine;
    if (!this.online) {
      this.emit();
      return;
    }
    if (this.running) return;
    try {
      await this.flush();
      if (this.pending.length || this.running) return;
      const generation = this.generation;
      const r = await this.api.request<{
        workspace?: Workspace;
        unchanged?: boolean;
      }>(
        this.serverRevision === undefined
          ? "workspace"
          : `workspace?revision=${this.serverRevision}`,
      );
      if (r.unchanged || !r.workspace) {
        this.error = "";
        this.emit();
        return;
      }
      if (generation !== this.generation) return;
      this.workspace = normalizeWorkspace({
        ...emptyWorkspace(),
        ...r.workspace,
      });
      this.serverRevision = this.workspace.revision;
      this.error = "";
      await this.persist();
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Sem conexão.";
    }
    this.emit();
  }
  async command(command: Command) {
    if (!this.active)
      throw new Error(
        "Sua conta mudou. Abra novamente o item antes de salvar.",
      );
    const operation = { operationId: crypto.randomUUID(), command };
    this.workspace = applyCommand(
      this.workspace,
      command,
      operation.operationId,
    );
    if (!this.localOnly) this.pending.push({ operation });
    else acknowledgePingoWorkspace(this.workspace);
    this.generation++;
    await this.persist();
    this.emit();
    if (this.demo || this.localOnly) {
      if (this.localOnly) acknowledgePingoWorkspace(this.workspace);
      this.pending = [];
      this.workspace.outbox = [];
      await this.persist();
      this.emit();
    } else void this.flush();
  }
  async flush() {
    if (this.running) {
      await new Promise<void>((resolve) => this.flushWaiters.push(resolve));
      return;
    }
    if (!this.active || this.demo || this.localOnly || !navigator.onLine)
      return;
    this.running = true;
    this.syncing = true;
    this.emit();
    try {
      if (this.storage.nativeFlush) {
        const generation = this.generation;
        const result = await this.storage.nativeFlush();
        if (generation !== this.generation) {
          this.flushAgain = true;
          return;
        }
        this.pending = result.pending;
        if (result.workspace) {
          this.workspace = normalizeWorkspace(result.workspace);
          this.serverRevision = this.workspace.revision;
        }
        this.error =
          this.pending.find((p) => p.error)?.error ??
          (this.pending.length ? "Alterações guardadas para sincronizar." : "");
        return;
      }
      while (this.active && this.pending.length && !this.pending[0].error) {
        const entry = this.pending[0];
        try {
          const result = await this.api.post<{ workspace: Workspace }>(
            "operations",
            entry.operation,
          );
          this.pending.shift();
          this.serverRevision = result.workspace.revision;
          let next = { ...emptyWorkspace(), ...result.workspace };
          for (const p of this.pending) {
            try {
              next = applyCommand(
                next,
                p.operation.command,
                p.operation.operationId,
              );
            } catch {
              p.error =
                "O item mudou durante a sincronização. Revise a versão do servidor.";
            }
          }
          this.workspace = next;
          await this.persist();
        } catch (e) {
          if (
            e instanceof ApiError &&
            [400, 403, 404, 409].includes(e.status)
          ) {
            entry.error = e.message;
            this.error = e.message;
            await this.persist();
          }
          throw e;
        }
      }
    } catch (e) {
      this.error =
        e instanceof Error ? e.message : "Alteração guardada para sincronizar.";
    } finally {
      this.running = false;
      this.syncing = false;
      if (this.flushAgain) {
        this.flushAgain = false;
        await this.flush();
      }
      this.flushWaiters.splice(0).forEach((resolve) => resolve());
      this.emit();
    }
  }
  async sync() {
    await this.refresh();
  }
  async discardConflict() {
    await this.storage.discardPending?.();
    this.pending = [];
    await this.persist();
    await this.refresh();
  }
  async exportPending() {
    return JSON.stringify(
      { pending: this.pending, workspace: this.workspace },
      null,
      2,
    );
  }
}
