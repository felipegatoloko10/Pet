import { and, eq } from "drizzle-orm";
import {
  emptyWorkspace,
  localWorkspace,
  preparePingoWorkspace,
  acknowledgePingoWorkspace,
  normalizeWorkspace,
  applyCommand,
  DomainError,
  type Workspace,
  type Operation,
} from "@pingo/core";
import { db } from "./db";
import { workspaces, operations, credentials } from "./schema";
import { digest, seal, unseal } from "./crypto";
export async function readWorkspace(userId: string) {
  const rows = await db()
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, userId));
  return acknowledgePingoWorkspace(
    preparePingoWorkspace(rows[0]?.data ?? localWorkspace()),
  );
}
export async function workspaceRevision(userId: string) {
  const [row] = await db()
    .select({ revision: workspaces.revision })
    .from(workspaces)
    .where(eq(workspaces.userId, userId));
  return row?.revision ?? -1;
}
export async function mutateWorkspace<T>(
  userId: string,
  fn: (w: Workspace) => Promise<T> | T,
) {
  return db().transaction(async (tx) => {
    await tx
      .insert(workspaces)
      .values({ userId, data: localWorkspace() })
      .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .for("update");
    row.data = preparePingoWorkspace(row.data);
    const before = row.data.revision;
    const result = await fn(row.data);
    row.data.revision = Math.max(row.data.revision, before + 1);
    await tx
      .update(workspaces)
      .set({
        data: row.data,
        revision: row.data.revision,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.userId, userId));
    return result;
  });
}
export async function runOperation(userId: string, operation: Operation) {
  return db().transaction((tx) => runOperationIn(tx, userId, operation));
}
type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
export async function runOperationIn(
  tx: Transaction,
  userId: string,
  operation: Operation,
) {
  await tx
    .insert(workspaces)
    .values({ userId, data: localWorkspace() })
    .onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, userId))
    .for("update");
  const hash = digest(JSON.stringify(operation.command));
  const [prior] = await tx
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.userId, userId),
        eq(operations.operationId, operation.operationId),
      ),
    );
  if (prior) {
    if (prior.digest !== hash)
      throw new DomainError(
        "idempotency",
        "Identificador já usado para outra alteração.",
        409,
      );
    return acknowledgePingoWorkspace(preparePingoWorkspace(row.data));
  }
  const next = acknowledgePingoWorkspace(
    applyCommand(
      preparePingoWorkspace(row.data),
      operation.command,
      operation.operationId,
    ),
  );
  if (next.tasks.length > 10000 || next.events.length > 10000)
    throw new DomainError("quota", "Limite do beta atingido.", 429);
  await tx
    .insert(operations)
    .values({ userId, operationId: operation.operationId, digest: hash });
  await tx
    .update(workspaces)
    .set({ data: next, revision: next.revision, updatedAt: new Date() })
    .where(eq(workspaces.userId, userId));
  return next;
}
export async function saveCredential(
  userId: string,
  kind: string,
  value: unknown,
) {
  await db()
    .insert(credentials)
    .values({ userId, kind, encrypted: seal(value, userId, kind) })
    .onConflictDoUpdate({
      target: [credentials.userId, credentials.kind],
      set: { encrypted: seal(value, userId, kind), updatedAt: new Date() },
    });
}
export async function getCredential<T>(
  userId: string,
  kind: string,
): Promise<T | null> {
  const [row] = await db()
    .select()
    .from(credentials)
    .where(and(eq(credentials.userId, userId), eq(credentials.kind, kind)));
  return row ? unseal<T>(row.encrypted, userId, kind) : null;
}
