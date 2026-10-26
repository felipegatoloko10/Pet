import { randomUUID } from "node:crypto";
import { APIError, type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { invitations, user, account, session } from "./schema";
import { digest, secretEqual } from "./crypto";

const enrollment = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(10).max(128),
  name: z.string().trim().min(1).max(100),
  inviteCode: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
  purpose: z.enum(["register", "recover"]).default("register"),
});
/** Closed enrollment proves possession of an admin-issued, email-bound invitation.
 * No Google, SMTP, or publicly claimable email identity is involved. */
export function passwordAuth() {
  return {
    id: "pingo-password",
    rateLimit: [
      {
        window: 60,
        max: 5,
        pathMatcher: (path) => path.startsWith("/password/"),
      },
    ],
    endpoints: {
      passwordSignUp: createAuthEndpoint(
        "/password/sign-up",
        { method: "POST", body: enrollment },
        async (ctx) => {
          const input = ctx.body;
          const hash = await ctx.context.password.hash(input.password);
          const owner = await db().transaction(async (tx) => {
            const [invite] = await tx
              .select()
              .from(invitations)
              .where(eq(invitations.email, input.email))
              .for("update");
            if (
              !invite?.activationHash ||
              invite.activationUsedAt ||
              !invite.activationExpiresAt ||
              invite.activationExpiresAt <= new Date() ||
              invite.activationPurpose !== input.purpose ||
              !secretEqual(invite.activationHash, digest(input.inviteCode))
            )
              throw new APIError("FORBIDDEN", {
                message:
                  "Convite inválido, usado ou expirado. Peça um novo convite ao administrador do Pingo.",
              });
            let [owner] = await tx
              .select()
              .from(user)
              .where(eq(user.email, input.email))
              .for("update");
            if (!owner)
              [owner] = await tx
                .insert(user)
                .values({
                  id: randomUUID(),
                  email: input.email,
                  name: input.name,
                  emailVerified: false,
                })
                .returning();
            const [credential] = await tx
              .select()
              .from(account)
              .where(
                and(
                  eq(account.userId, owner.id),
                  eq(account.providerId, "credential"),
                ),
              );
            if (credential && input.purpose !== "recover")
              throw new APIError("CONFLICT", {
                message:
                  "Sua conta já tem senha. Use Entrar; para recuperar o acesso, peça um convite de recuperação.",
              });
            if (credential) {
              await tx
                .update(account)
                .set({ password: hash, updatedAt: new Date() })
                .where(eq(account.id, credential.id));
              await tx.delete(session).where(eq(session.userId, owner.id));
            } else
              await tx
                .insert(account)
                .values({
                  id: randomUUID(),
                  accountId: owner.id,
                  providerId: "credential",
                  userId: owner.id,
                  password: hash,
                });
            await tx
              .update(invitations)
              .set({ activationUsedAt: new Date() })
              .where(eq(invitations.email, input.email));
            return owner;
          });
          const created = await ctx.context.internalAdapter.createSession(
            owner.id,
          );
          if (!created)
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message:
                "A senha foi salva. Entre novamente para abrir sua conta.",
            });
          await setSessionCookie(ctx, { session: created, user: owner });
          return ctx.json({
            user: { id: owner.id, name: owner.name, email: owner.email },
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
