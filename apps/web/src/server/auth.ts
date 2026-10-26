import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./schema";
import { passwordAuth } from "./password-auth";
let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  return betterAuth({
    appName: "Pingo",
    logger: { disabled: true },
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    account: { encryptOAuthTokens: true },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    trustedOrigins: [
      process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      "tauri://localhost",
      "http://tauri.localhost",
      "https://localhost",
    ],
    plugins: [
      bearer(),
      passwordAuth(),
      deviceAuthorization({
        verificationUri: "/device",
        expiresIn: "10m",
        validateClient: (clientId) => clientId === "pingo-desktop",
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            const invite = await db()
              .select()
              .from(schema.invitations)
              .where(eq(schema.invitations.email, data.email.toLowerCase()));
            if (!invite.length)
              throw new APIError("FORBIDDEN", {
                message: "O beta do Pingo precisa de convite.",
              });
            return { data };
          },
        },
      },
    },
  });
}
export function auth() {
  return instance ?? (instance = createAuth());
}
export async function requireUser(request: Request) {
  if (
    !request.headers.has("authorization") &&
    !request.headers.get("cookie")?.includes("session_token=")
  )
    throw new APIError("UNAUTHORIZED", {
      message: "Entre no Pingo para continuar.",
    });
  const session = await auth().api.getSession({ headers: request.headers });
  if (!session)
    throw new APIError("UNAUTHORIZED", {
      message: "Entre no Pingo para continuar.",
    });
  const expected = request.headers.get("x-pingo-account");
  if (expected && expected !== session.user.id)
    throw new APIError("FORBIDDEN", {
      message:
        "Esta sessão pertence a outra conta. Entre novamente para sincronizar.",
    });
  return session.user;
}
