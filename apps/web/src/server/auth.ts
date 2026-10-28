import { validPassword } from "@pingo/core";
import { createAuthMiddleware } from "better-auth/api";
import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, deviceAuthorization } from "better-auth/plugins";
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
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema,
      transaction: true,
    }),
    account: { encryptOAuthTokens: true },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          [
            "/sign-up/email",
            "/reset-password",
            "/change-password",
            "/password/sign-up",
          ].includes(ctx.path)
        ) {
          const password = ctx.body?.newPassword ?? ctx.body?.password;
          if (typeof password !== "string" || !validPassword(password))
            throw new APIError("BAD_REQUEST", {
              message:
                "Use no mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.",
            });
        }
        if (ctx.path === "/sign-up/email" && !ctx.body?.name)
          ctx.body = { ...ctx.body, name: "Pessoa" };
      }),
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
            const name = data.name.trim();
            if (!name || name.length > 100 || data.email.length > 254)
              throw new APIError("BAD_REQUEST", {
                message: "Informe seu nome e um e-mail válido.",
              });
            return { data: { ...data, name } };
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
