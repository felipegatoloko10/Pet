import { randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { DomainError } from "@pingo/core";
import { db } from "./db";
import { subscriptions, verification } from "./schema";
import { digest } from "./crypto";
import { beginGoogle } from "./google";
export const mobileDeviceInput = z.object({
  installationId: z.uuid(),
  token: z.string().min(20).max(4096),
  protocol: z.number().int().min(1).max(2).optional(),
});
export type AndroidSubscription = {
  transport: "fcm";
  installationId: string;
  token: string;
  protocol?: number;
};
export function androidSubscription(
  data: unknown,
): data is AndroidSubscription {
  return (
    !!data &&
    typeof data === "object" &&
    (data as AndroidSubscription).transport === "fcm"
  );
}
export async function registerMobile(userId: string, raw: unknown) {
  if (!process.env.FIREBASE_FEDERATION_CONFIG)
    throw new DomainError(
      "configuration",
      "As notificações Android na nuvem ainda não foram ativadas pelo administrador.",
      503,
    );
  const { installationId, token, protocol } = mobileDeviceInput.parse(raw);
  const id = digest(`android:${userId}:${installationId}`);
  const data: AndroidSubscription = {
    transport: "fcm",
    installationId,
    token,
    protocol: protocol ?? 1,
  };
  await db()
    .insert(subscriptions)
    .values({ id, userId, data })
    .onConflictDoUpdate({ target: subscriptions.id, set: { data } });
  return { ok: true };
}
export async function unregisterMobile(userId: string, raw: unknown) {
  const { installationId } = mobileDeviceInput
    .pick({ installationId: true })
    .parse(raw);
  await db()
    .delete(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.id, digest(`android:${userId}:${installationId}`)),
      ),
    );
  return { ok: true };
}
export async function startWorkspace(userId: string) {
  await db()
    .delete(verification)
    .where(
      and(
        eq(verification.identifier, "pingo-mobile-workspace"),
        lt(verification.expiresAt, new Date()),
      ),
    );
  const ticket = randomBytes(32).toString("base64url");
  await db()
    .insert(verification)
    .values({
      id: digest(ticket),
      identifier: "pingo-mobile-workspace",
      value: userId,
      expiresAt: new Date(Date.now() + 600000),
    });
  return {
    url: `${process.env.BETTER_AUTH_URL}/mobile/login?ticket=${ticket}`,
  };
}
export async function authorizeWorkspace(userId: string, raw: unknown) {
  const { ticket } = z
    .object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .parse(raw);
  const [row] = await db()
    .delete(verification)
    .where(
      and(
        eq(verification.id, digest(ticket)),
        eq(verification.identifier, "pingo-mobile-workspace"),
        eq(verification.value, userId),
      ),
    )
    .returning();
  if (!row)
    throw new DomainError(
      "identity",
      "Entre no navegador com a mesma conta Google usada no aplicativo e tente conectar novamente.",
      403,
    );
  if (row.expiresAt < new Date())
    throw new DomainError(
      "expired",
      "A conexão expirou. Inicie novamente pelo aplicativo.",
      409,
    );
  return { url: await beginGoogle(userId, "mobile") };
}
