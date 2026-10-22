import { randomBytes, createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { DomainError } from "@pingo/core";
import { db } from "./db";
import { oauthStates, credentials } from "./schema";
import {
  getCredential,
  saveCredential,
  mutateWorkspace,
  readWorkspace,
} from "./workspace";
export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];
type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
};
export class GoogleError extends Error {
  constructor(
    public status: number,
    public retryAfter = 60,
  ) {
    super(
      status === 401
        ? "A autorização Google expirou ou foi revogada. Reconecte sua conta."
        : status === 403
          ? "O Google não autorizou esta operação. Verifique as permissões."
          : status === 429
            ? "Limite temporário do Google. A sincronização tentará mais tarde."
            : `O Google não confirmou a operação (${status}).`,
    );
  }
}
const redirect = () => `${process.env.BETTER_AUTH_URL}/api/v1/google/callback`;
export async function beginGoogle(userId: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    throw new DomainError(
      "configuration",
      "O administrador ainda precisa registrar o OAuth Google.",
      503,
    );
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  await db().delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
  await db()
    .insert(oauthStates)
    .values({
      id: state,
      userId,
      verifier,
      expiresAt: new Date(Date.now() + 600000),
    });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirect(),
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
export async function finishGoogle(userId: string, url: URL) {
  const state = url.searchParams.get("state");
  if (!state || !url.searchParams.get("code"))
    throw new DomainError("oauth", "Autorização cancelada ou inválida.");
  const [row] = await db()
    .delete(oauthStates)
    .where(and(eq(oauthStates.id, state), eq(oauthStates.userId, userId)))
    .returning();
  if (!row || row.expiresAt < new Date())
    throw new DomainError(
      "oauth",
      "Autorização expirada. Tente conectar novamente.",
    );
  const token = await tokenRequest({
    code: url.searchParams.get("code")!,
    code_verifier: row.verifier,
    grant_type: "authorization_code",
    redirect_uri: redirect(),
  });
  const identity = await new GoogleClient(token.access_token).request<{
    sub: string;
    email: string;
    email_verified: boolean;
  }>("https://openidconnect.googleapis.com/v1/userinfo");
  if (!identity.email_verified)
    throw new DomainError(
      "identity",
      "Escolha uma conta Google com e-mail verificado.",
    );
  const prior = await readWorkspace(userId);
  if (prior.connection.subject && prior.connection.subject !== identity.sub)
    throw new DomainError(
      "identity",
      "Este espaço está vinculado a outra conta Google. Escolha a conta originalmente conectada para preservar a sincronização.",
      409,
    );
  await saveCredential(userId, "google", token);
  await mutateWorkspace(userId, (w) => {
    w.connection = {
      connected: true,
      scopes: (token.scope ?? "").split(" "),
      subject: identity.sub,
      email: identity.email,
    };
    w.cursor = {};
    w.revision++;
  });
}
async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new GoogleError(response.status === 400 ? 401 : response.status);
  const data = await response.json();
  return { ...data, expires_at: Date.now() + data.expires_in * 1000 };
}
export async function googleToken(userId: string) {
  let token = await getCredential<Tokens>(userId, "google");
  if (!token) throw new GoogleError(401);
  if (token.expires_at < Date.now() + 60000) {
    if (!token.refresh_token) throw new GoogleError(401);
    const fresh = await tokenRequest({
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    });
    token = {
      ...token,
      ...fresh,
      refresh_token: fresh.refresh_token ?? token.refresh_token,
      scope: fresh.scope ?? token.scope,
    };
    await saveCredential(userId, "google", token);
  }
  return token.access_token;
}
export class GoogleClient {
  constructor(
    private token: string,
    private transport: typeof fetch = fetch,
  ) {}
  async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.transport(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 204) return undefined as T;
    if (!response.ok)
      throw new GoogleError(
        response.status,
        Number(response.headers.get("Retry-After") ?? 60),
      );
    return response.json();
  }
  async pages<T>(url: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let token: string | undefined;
    do {
      const u = new URL(url);
      if (token) u.searchParams.set("pageToken", token);
      const result = await this.request<Record<string, unknown>>(u.toString());
      items.push(...((result[key] as T[]) ?? []));
      token = result.nextPageToken as string | undefined;
      if (items.length > 10000)
        throw new DomainError(
          "quota",
          "Importação excedeu o limite de 10 mil itens.",
          429,
        );
    } while (token);
    return items;
  }
}
export async function disconnectGoogle(userId: string) {
  const token = await getCredential<Tokens>(userId, "google");
  if (token) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        body: new URLSearchParams({
          token: token.refresh_token ?? token.access_token,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      /* Local revocation still removes credentials. */
    }
  }
  await db()
    .delete(credentials)
    .where(and(eq(credentials.userId, userId), eq(credentials.kind, "google")));
  await mutateWorkspace(userId, (w) => {
    w.connection = {
      connected: false,
      scopes: [],
      subject: w.connection.subject,
      email: w.connection.email,
    };
    w.revision++;
  });
}
