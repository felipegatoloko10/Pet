import { z } from "zod";
import {
  startDesktop,
  authorizeDesktop,
  exchangeDesktop,
  desktopStartInput,
  limitDesktop,
} from "../../../../server/desktop-auth";
import { and, eq } from "drizzle-orm";
import { cors } from "../../../../server/cors";
import {
  registerMobile,
  unregisterMobile,
  startWorkspace,
  authorizeWorkspace,
} from "../../../../server/mobile";
import { inspectConflict, resolveConflict } from "../../../../server/conflicts";
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
import { syncGoogle, calendarRange } from "../../../../server/sync";
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
        version: "2.4.0-beta.1",
        configured: !!(
          process.env.DATABASE_URL && process.env.GOOGLE_CLIENT_ID
        ),
        scheduler: !!process.env.SCHEDULER_URL,
        androidPush: !!process.env.FIREBASE_FEDERATION_CONFIG,
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
          kind: z.enum(["routine", "reminder", "checkin"]),
          dueAt: z.number(),
          entityId: z.string().optional(),
        })
        .parse(await body(r));
      await processJob(job);
      return Response.json({ indexed: true });
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
        await indexJobs(channel.userId, await syncGoogle(channel.userId));
      return new Response(null, { status: 204 });
    }
    if (
      [
        "desktop-auth/start",
        "desktop-auth/exchange",
        "mobile-auth/start",
        "mobile-auth/exchange",
      ].includes(path) &&
      r.method === "POST"
    )
      await limitDesktop(
        r.headers.get("x-vercel-forwarded-for") ??
          r.headers.get("x-forwarded-for") ??
          "local",
      );
    if (path === "desktop-auth/start" && r.method === "POST")
      return Response.json(
        await startDesktop(desktopStartInput.parse(await body(r))),
        { headers: { "Cache-Control": "no-store" } },
      );
    if (path === "desktop-auth/exchange" && r.method === "POST")
      return Response.json(await exchangeDesktop(await body(r)), {
        headers: { "Cache-Control": "no-store" },
      });
    if (path === "mobile-auth/start" && r.method === "POST")
      return Response.json(
        await startDesktop(desktopStartInput.parse(await body(r)), "mobile"),
        { headers: { "Cache-Control": "no-store" } },
      );
    if (path === "mobile-auth/exchange" && r.method === "POST")
      return Response.json(await exchangeDesktop(await body(r), "mobile"), {
        headers: { "Cache-Control": "no-store" },
      });
    const user = await requireUser(r);
    // Cookie mutations require the app's origin. Native bearer calls carry no ambient cookie authority.
    if (r.method !== "GET" && !r.headers.has("authorization")) {
      const origin = r.headers.get("origin");
      if (origin !== process.env.BETTER_AUTH_URL)
        throw new DomainError("origin", "Origem não autorizada.", 403);
    }
    if (path === "desktop-auth/authorize" && r.method === "POST") {
      const input = z
        .object({ id: z.uuid(), state: z.string() })
        .parse(await body(r));
      return Response.json(
        await authorizeDesktop(user.id, input.id, input.state),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (path === "mobile-auth/authorize" && r.method === "POST") {
      const input = z
        .object({ id: z.uuid(), state: z.string() })
        .parse(await body(r));
      return Response.json(
        await authorizeDesktop(user.id, input.id, input.state, "mobile"),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (path === "mobile/devices" && r.method === "POST")
      return Response.json(await registerMobile(user.id, await body(r)));
    if (path === "mobile/devices" && r.method === "DELETE")
      return Response.json(await unregisterMobile(user.id, await body(r)));
    if (path === "mobile/workspace" && r.method === "POST")
      return Response.json(await startWorkspace(user.id), {
        headers: { "Cache-Control": "no-store" },
      });
    if (path === "mobile/workspace/authorize" && r.method === "POST")
      return Response.json(await authorizeWorkspace(user.id, await body(r)), {
        headers: { "Cache-Control": "no-store" },
      });
    if (path === "workspace" && r.method === "GET")
      return Response.json({
        workspace: sanitizeWorkspace(await readWorkspace(user.id)),
        user: { id: user.id, name: user.name, email: user.email },
      });
    if (path === "conflicts" && r.method === "GET") {
      const input = z
        .object({ kind: z.enum(["task", "event"]), id: z.string() })
        .parse(Object.fromEntries(url.searchParams));
      return Response.json(
        await inspectConflict(user.id, input.kind, input.id),
      );
    }
    if (path === "conflicts" && r.method === "POST") {
      const input = z
        .object({
          kind: z.enum(["task", "event"]),
          id: z.string(),
          choice: z.enum(["google", "pingo"]),
          expectedRevision: z.number().int(),
          confirmed: z.literal(true),
        })
        .parse(await body(r));
      await resolveConflict(
        user.id,
        input.kind,
        input.id,
        input.choice,
        input.expectedRevision,
      );
      return Response.json({
        workspace: sanitizeWorkspace(await syncGoogle(user.id)),
      });
    }
    if (path === "operations" && r.method === "POST") {
      const op = operationSchema.parse(await body(r));
      let w = await runOperation(user.id, op);
      if (op.command.type !== "pet.care") w = await syncGoogle(user.id);
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
      const client = await finishGoogle(user.id, url);
      await indexJobs(user.id, await syncGoogle(user.id));
      return Response.redirect(
        `${process.env.BETTER_AUTH_URL}/${client === "mobile" ? "mobile/connected" : "?connected=1"}`,
      );
    }
    if (path === "google/disconnect" && r.method === "POST") {
      await disconnectGoogle(user.id);
      return Response.json({ ok: true });
    }
    if (path === "calendar/range" && r.method === "GET")
      return Response.json({
        events: await calendarRange(
          user.id,
          z.iso.datetime({ offset: true }).parse(url.searchParams.get("start")),
          z.iso.datetime({ offset: true }).parse(url.searchParams.get("end")),
        ),
      });
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
          conversationId: z.string().max(200).optional(),
          messageId: z.uuid().optional(),
        })
        .parse(await body(r));
      return Response.json(
        await chat(
          user.id,
          input.message,
          input.conversationId,
          input.messageId,
        ),
      );
    }
    if (path === "approvals" && r.method === "POST") {
      const { id, conversationId } = z
        .object({ id: z.uuid(), conversationId: z.string().optional() })
        .parse(await body(r));
      await approve(user.id, id, conversationId);
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
      const id = digest(input.endpoint);
      await db()
        .insert(subscriptions)
        .values({ id, userId: user.id, data: input })
        .onConflictDoUpdate({
          target: subscriptions.id,
          set: { data: input, userId: user.id },
        });
      return Response.json({ ok: true });
    }
    if (path === "push" && r.method === "DELETE") {
      const { endpoint } = z.object({ endpoint: z.url() }).parse(await body(r));
      await db()
        .delete(subscriptions)
        .where(
          and(
            eq(subscriptions.id, digest(endpoint)),
            eq(subscriptions.userId, user.id),
          ),
        );
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
