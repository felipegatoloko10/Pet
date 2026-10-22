import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { cors } from "../../../../server/cors";
import { operationSchema, sanitizeWorkspace, DomainError } from "@pingo/core";
import { requireUser } from "../../../../server/auth";
import {
  readWorkspace,
  runOperation,
  saveCredential,
  mutateWorkspace,
} from "../../../../server/workspace";
import {
  beginGoogle,
  finishGoogle,
  disconnectGoogle,
  GoogleClient,
  googleToken,
} from "../../../../server/google";
import { syncGoogle, getMailBody } from "../../../../server/sync";
import { chat, approve } from "../../../../server/ai";
import {
  indexJobs,
  processJob,
  type Job,
} from "../../../../server/notifications";
import { secretEqual, digest } from "../../../../server/crypto";
import { db } from "../../../../server/db";
import {
  subscriptions,
  credentials,
  channels,
} from "../../../../server/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function body(r: Request) {
  if (Number(r.headers.get("content-length") ?? 0) > 1000000)
    throw new DomainError("size", "Requisição muito grande.", 413);
  const raw = await r.text();
  if (raw.length > 1000000)
    throw new DomainError("size", "Requisição muito grande.", 413);
  return JSON.parse(raw);
}
async function handler(r: Request) {
  try {
    const url = new URL(r.url);
    const path = url.pathname.replace("/api/v1/", "");
    if (path === "health")
      return Response.json({
        version: "2.0.0-beta.1",
        configured: !!(
          process.env.DATABASE_URL && process.env.GOOGLE_CLIENT_ID
        ),
        scheduler: !!process.env.SCHEDULER_URL,
      });
    if (path === "scheduler/run" && r.method === "POST") {
      if (
        !process.env.SCHEDULER_SECRET ||
        !secretEqual(
          r.headers.get("authorization") ?? "",
          `Bearer ${process.env.SCHEDULER_SECRET}`,
        )
      )
        return Response.json({ error: "Não autorizado" }, { status: 401 });
      const job = z
        .object({
          id: z.string(),
          userId: z.string(),
          kind: z.enum(["routine", "reminder"]),
          dueAt: z.number(),
          entityId: z.string().optional(),
        })
        .parse(await body(r));
      return Response.json({ jobs: await processJob(job) });
    }
    if (path === "google/calendar-hook" && r.method === "POST") {
      const id = r.headers.get("x-goog-channel-id") ?? "";
      const [channel] = await db()
        .select()
        .from(channels)
        .where(eq(channels.id, id));
      if (
        !channel ||
        channel.expiresAt < new Date() ||
        channel.resourceId !== r.headers.get("x-goog-resource-id") ||
        !secretEqual(
          channel.tokenHash,
          digest(r.headers.get("x-goog-channel-token") ?? ""),
        )
      )
        return new Response(null, { status: 403 });
      if (r.headers.get("x-goog-resource-state") !== "sync")
        await syncGoogle(channel.userId);
      return new Response(null, { status: 204 });
    }
    const user = await requireUser(r);
    // Cookie mutations require the app's origin. Native bearer calls carry no ambient cookie authority.
    if (r.method !== "GET" && !r.headers.has("authorization")) {
      const origin = r.headers.get("origin");
      if (origin !== process.env.BETTER_AUTH_URL)
        throw new DomainError("origin", "Origem não autorizada.", 403);
    }
    if (path === "workspace" && r.method === "GET")
      return Response.json({
        workspace: sanitizeWorkspace(await readWorkspace(user.id)),
        user: { id: user.id, name: user.name, email: user.email },
      });
    if (path === "operations" && r.method === "POST") {
      const op = operationSchema.parse(await body(r));
      let w = await runOperation(user.id, op);
      w = await syncGoogle(user.id);
      await indexJobs(user.id, w).catch(() => {});
      return Response.json({ workspace: sanitizeWorkspace(w) });
    }
    if (path === "sync" && r.method === "POST") {
      const w = await syncGoogle(user.id);
      await indexJobs(user.id, w).catch(() => {});
      return Response.json({ workspace: sanitizeWorkspace(w) });
    }
    if (path === "google/connect" && r.method === "POST")
      return Response.json({ url: await beginGoogle(user.id) });
    if (path === "google/callback" && r.method === "GET") {
      await finishGoogle(user.id, url);
      await syncGoogle(user.id);
      return Response.redirect(`${process.env.BETTER_AUTH_URL}/?connected=1`);
    }
    if (path === "google/disconnect" && r.method === "POST") {
      await disconnectGoogle(user.id);
      return Response.json({ ok: true });
    }
    if (path === "mail/body" && r.method === "POST") {
      const input = z
        .object({ id: z.string(), requested: z.literal(true) })
        .parse(await body(r));
      return Response.json({ body: await getMailBody(user.id, input.id) });
    }
    if (path === "ai/key" && r.method === "POST") {
      const input = z
        .object({
          provider: z.enum(["openai", "google", "anthropic"]),
          key: z.string().min(8).max(1000),
        })
        .parse(await body(r));
      await saveCredential(user.id, `ai:${input.provider}`, { key: input.key });
      return Response.json({ configured: true });
    }
    if (path === "ai/key" && r.method === "DELETE") {
      const input = z
        .object({ provider: z.enum(["openai", "google", "anthropic"]) })
        .parse(await body(r));
      await db()
        .delete(credentials)
        .where(
          and(
            eq(credentials.userId, user.id),
            eq(credentials.kind, `ai:${input.provider}`),
          ),
        );
      return Response.json({ ok: true });
    }
    if (path === "chat" && r.method === "POST") {
      const input = z
        .object({
          message: z.string().trim().min(1).max(6000),
          mailBodyId: z.string().optional(),
        })
        .parse(await body(r));
      return Response.json(
        await chat(user.id, input.message, input.mailBodyId),
      );
    }
    if (path === "approvals" && r.method === "POST") {
      const { id } = z.object({ id: z.uuid() }).parse(await body(r));
      await approve(user.id, id);
      return Response.json({
        workspace: sanitizeWorkspace(await syncGoogle(user.id)),
      });
    }
    if (path === "notifications/claim" && r.method === "POST") {
      const { id, deviceId } = z
        .object({ id: z.string(), deviceId: z.string() })
        .parse(await body(r));
      const claimed = await mutateWorkspace(user.id, (w) => {
        const n = w.notices.find((n) => n.id === id);
        if (!n || n.deliveredBy || n.read) return false;
        n.deliveredBy = deviceId;
        return true;
      });
      return Response.json({ claimed });
    }
    if (path === "push" && r.method === "POST") {
      const input = z
        .object({
          endpoint: z.url().refine((v) => new URL(v).protocol === "https:"),
          keys: z.object({
            p256dh: z.string().max(200),
            auth: z.string().max(100),
          }),
        })
        .parse(await body(r));
      const host = new URL(input.endpoint).hostname;
      if (
        ![
          "fcm.googleapis.com",
          "updates.push.services.mozilla.com",
          "web.push.apple.com",
          "wns2-*.notify.windows.com",
        ].some((h) =>
          h.startsWith("wns2-")
            ? host.endsWith(".notify.windows.com")
            : host === h,
        )
      )
        throw new DomainError("endpoint", "Serviço de push não autorizado.");
      const id = digest(`${user.id}:${input.endpoint}`);
      await db()
        .insert(subscriptions)
        .values({ id, userId: user.id, data: input })
        .onConflictDoUpdate({ target: subscriptions.id, set: { data: input } });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Rota não encontrada." }, { status: 404 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Confira os campos enviados.",
          details: error.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    if (error instanceof DomainError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403)
      return Response.json(
        {
          error:
            status === 401
              ? "Entre no Pingo para continuar."
              : "Acesso não autorizado.",
        },
        { status },
      );
    console.error("pingo_api_failure", {
      kind: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      {
        error: "Não foi possível concluir agora. Seus dados foram preservados.",
      },
      { status: 503 },
    );
  }
}
async function wrapped(r: Request) {
  return cors(r, await handler(r));
}
export const GET = wrapped;
export const POST = wrapped;
export const DELETE = wrapped;
export function OPTIONS(r: Request) {
  return cors(r, new Response(null, { status: 204 }));
}
