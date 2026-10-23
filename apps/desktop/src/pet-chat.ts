import { Api, type Storage } from "@pingo/ui/client";
import type { Command, Workspace } from "@pingo/core";

export type PetReply = {
  text: string;
  suggestions?: { approvalId: string; command: Command }[];
};
type PendingMessage = {
  text: string;
  messageId: string;
  conversationId: string;
};
export class PendingPetMessageError extends Error {
  constructor(public text: string) {
    super(
      "Uma mensagem anterior ainda não teve o envio confirmado. Reenvie essa mensagem antes de continuar.",
    );
  }
}
/** Independent keys avoid overwriting the panel's offline queue or optimistic workspace. */
export class PetChat {
  conversationId?: string;
  private session?: string;
  private running = false;
  constructor(
    private api: Api,
    private storageFor: (id: string) => Promise<Storage>,
  ) {}
  async send(text: string): Promise<PetReply> {
    if (this.running) throw new Error("Estou terminando a resposta anterior.");
    const token = this.api.token;
    if (!token)
      throw new Error("Entre com Google no painel para conversar comigo.");
    if (!text.trim() || text.trim().length > 6000)
      throw new Error("Escreva uma mensagem de até 6.000 caracteres.");
    this.running = true;
    try {
      // Keep all requests bound to the identity that started this message.
      const api = new Api(this.api.base, token);
      const { user, workspace } = await api.request<{
        user: { id: string };
        workspace: Workspace;
      }>("workspace");
      if (this.api.token !== token)
        throw new Error("Sua sessão mudou. Envie a mensagem novamente.");
      const storage = await this.storageFor(user.id);
      const saved = await storage.get("pet:conversation");
      const raw = await storage.get("pet:pending-message");
      const pending = raw ? (JSON.parse(raw) as PendingMessage) : undefined;
      if (pending && pending.text !== text.trim())
        throw new PendingPetMessageError(pending.text);
      const conversationId =
        pending?.conversationId ??
        (workspace.conversations?.some((c) => c.id === saved && !c.archived)
          ? saved!
          : crypto.randomUUID());
      const message = pending ?? {
        text: text.trim(),
        messageId: crypto.randomUUID(),
        conversationId,
      };
      this.conversationId = conversationId;
      this.session = token;
      await storage.set("pet:conversation", conversationId);
      await storage.set("pet:pending-message", JSON.stringify(message));
      if (this.api.token !== token)
        throw new Error("Sua sessão mudou. Envie a mensagem novamente.");
      const reply = await api.post<PetReply>("chat", {
        message: message.text,
        messageId: message.messageId,
        conversationId,
      });
      await storage.set("pet:pending-message", "");
      if (this.api.token !== token)
        throw new Error("Sua sessão mudou. Abra o painel para continuar.");
      return reply;
    } finally {
      this.running = false;
    }
  }
  currentConversation() {
    return this.session === this.api.token ? this.conversationId : undefined;
  }
}
