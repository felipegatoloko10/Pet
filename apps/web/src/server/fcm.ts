import { getVercelOidcToken } from "@vercel/oidc";
import type { Notice } from "@pingo/core";
import type { AndroidSubscription } from "./mobile";
let cached: { token: string; until: number } | undefined;
let pending: Promise<string> | undefined;
function account() {
  const a = JSON.parse(process.env.FIREBASE_FEDERATION_CONFIG ?? "{}");
  if (
    typeof a.project_id !== "string" ||
    !/^[a-z][a-z0-9-]{4,62}$/.test(a.project_id) ||
    typeof a.client_email !== "string" ||
    !a.client_email.endsWith(`@${a.project_id}.iam.gserviceaccount.com`) ||
    typeof a.audience !== "string" ||
    !/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/.test(
      a.audience,
    )
  )
    throw new Error("FCM não configurado.");
  return a as { project_id: string; client_email: string; audience: string };
}
async function accessToken() {
  if (cached && cached.until > Date.now()) return cached.token;
  if (pending) return pending;
  pending = (async () => {
    const a = account();
    // Obtain a fresh request-scoped Vercel assertion; only Google's short-lived access token is cached.
    const response = await fetch("https://sts.googleapis.com/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        audience: a.audience,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
        subject_token: await getVercelOidcToken(),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        "O Google não reconheceu a identidade do backend de notificações.",
      );
    const federation = await response.json();
    if (typeof federation.access_token !== "string")
      throw new Error("Resposta inválida do serviço de identidade.");
    const impersonate = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(a.client_email)}:generateAccessToken`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${federation.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: ["https://www.googleapis.com/auth/firebase.messaging"],
          lifetime: "3600s",
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!impersonate.ok)
      throw new Error(
        "A identidade do backend não recebeu permissão para enviar notificações.",
      );
    const data = await impersonate.json();
    if (
      typeof data.accessToken !== "string" ||
      !Number.isFinite(Date.parse(data.expireTime))
    )
      throw new Error("Resposta inválida do serviço de notificações.");
    cached = {
      token: data.accessToken,
      until:
        Math.min(Date.parse(data.expireTime), Date.now() + 3600000) - 120000,
    };
    return cached.token;
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
export async function sendAndroidPush(
  sub: AndroidSubscription,
  userId: string,
  notice: Notice,
  eventId?: string,
) {
  const a = account();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: sub.token,
          android: { priority: "high", ttl: "1800s" },
          data: {
            ...(notice.taskId
              ? {
                  taskId: notice.taskId,
                  phase: notice.phase ?? "",
                  snoozePhase: notice.snoozePhase ?? "",
                  scheduleKey: notice.scheduleKey ?? "",
                  taskRevision: String(notice.taskRevision ?? 0),
                }
              : {}),
            userId,
            noticeId: notice.id,
            title: notice.title,
            body:
              notice.id.startsWith("reminder:") || notice.taskId
                ? notice.body
                : notice.id.startsWith("summary:")
                  ? "Seu resumo do dia está pronto. Abra o Pingo para ver."
                  : "Abra o Pingo para ver este aviso.",
            silent: String(!!notice.silent),
            eventId: eventId ?? "",
            expiresAt: String(
              notice.expiresAt ?? Date.parse(notice.createdAt) + 1800000,
            ),
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (response.ok) return;
  if (response.status === 401) cached = undefined;
  const data = await response.json().catch(() => ({}));
  const invalid = data.error?.details?.some(
    (d: { errorCode?: string }) => d.errorCode === "UNREGISTERED",
  );
  const error = new Error(
    "O Android não confirmou o envio da notificação.",
  ) as Error & { statusCode: number };
  error.statusCode = invalid
    ? 410
    : response.status === 404
      ? 503
      : response.status;
  throw error;
}
