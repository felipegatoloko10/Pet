import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { DomainError } from "@pingo/core";
import { db } from "./db";
import { verification } from "./schema";
import { auth } from "./auth";
import { digest, secretEqual } from "./crypto";
const secret = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
export type NativeClient = "desktop" | "mobile";
const identifier = (client: NativeClient) => `pingo-${client}`;
export const desktopStartInput = z.object({ state: secret, challenge: secret });
export async function limitDesktop(source: string) {
  const key =
    "desktop-rate:" + digest(source + ":" + Math.floor(Date.now() / 600000));
  const [counter] = await db()
    .insert(verification)
    .values({
      id: key,
      identifier: "pingo-desktop-rate",
      value: "1",
      expiresAt: new Date(Date.now() + 600000),
    })
    .onConflictDoUpdate({
      target: verification.id,
      set: { value: sql`((${verification.value})::int+1)::text` },
    })
    .returning();
  if (Number(counter.value) > 20)
    throw new DomainError(
      "rate",
      "Muitas tentativas de login. Aguarde alguns minutos.",
      429,
    );
  await db()
    .delete(verification)
    .where(
      and(
        eq(verification.identifier, "pingo-desktop-rate"),
        lt(verification.expiresAt, new Date()),
      ),
    );
}
export async function startDesktop(
  input: z.infer<typeof desktopStartInput>,
  client: NativeClient = "desktop",
) {
  await db()
    .delete(verification)
    .where(
      and(
        eq(verification.identifier, identifier(client)),
        lt(verification.expiresAt, new Date()),
      ),
    );
  const id = crypto.randomUUID();
  await db()
    .insert(verification)
    .values({
      id,
      identifier: identifier(client),
      value: JSON.stringify({ ...input, client }),
      expiresAt: new Date(Date.now() + 600000),
    });
  return {
    url: `${process.env.BETTER_AUTH_URL}/${client}/login?id=${id}&state=${input.state}`,
  };
}
export async function authorizeDesktop(
  userId: string,
  id: string,
  state: string,
  client: NativeClient = "desktop",
) {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(verification)
      .where(
        and(
          eq(verification.id, id),
          eq(verification.identifier, identifier(client)),
        ),
      )
      .for("update");
    if (!row || row.expiresAt < new Date())
      throw new DomainError(
        "expired",
        "Login expirado. Inicie novamente no Pingo.",
        409,
      );
    const value = JSON.parse(row.value);
    if (
      (value.client && value.client !== client) ||
      !secretEqual(value.state, state) ||
      value.codeHash
    )
      throw new DomainError(
        "state",
        "Tentativa inválida ou já autorizada.",
        409,
      );
    const code = randomBytes(32).toString("base64url");
    await tx
      .update(verification)
      .set({
        value: JSON.stringify({ ...value, userId, codeHash: digest(code) }),
        expiresAt: new Date(Date.now() + 60000),
      })
      .where(eq(verification.id, id));
    return {
      url: `${client === "mobile" ? "app.pingo.mobile" : "pingo"}://auth/callback?id=${id}&state=${state}&code=${code}`,
    };
  });
}
export async function exchangeDesktop(
  raw: unknown,
  client: NativeClient = "desktop",
) {
  const input = z
    .object({ id: z.uuid(), state: secret, code: secret, verifier: secret })
    .parse(raw);
  const userId = await db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(verification)
      .where(
        and(
          eq(verification.id, input.id),
          eq(verification.identifier, identifier(client)),
        ),
      )
      .for("update");
    if (!row || row.expiresAt < new Date())
      throw new DomainError("expired", "Login expirado ou já utilizado.", 409);
    const value = JSON.parse(row.value),
      challenge = createHash("sha256")
        .update(input.verifier)
        .digest("base64url");
    if (
      (value.client && value.client !== client) ||
      !value.userId ||
      !value.codeHash ||
      !secretEqual(value.state, input.state) ||
      !secretEqual(value.challenge, challenge) ||
      !secretEqual(value.codeHash, digest(input.code))
    )
      throw new DomainError("state", "Retorno de login inválido.", 403);
    await tx.delete(verification).where(eq(verification.id, input.id));
    return value.userId as string;
  });
  const context = await auth().$context;
  const session = await context.internalAdapter.createSession(userId);
  if (!session)
    throw new DomainError("session", "Não foi possível criar a sessão.", 500);
  return { access_token: session.token };
}
