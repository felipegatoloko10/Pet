import { timingSafeEqual } from "node:crypto";
type Job = {
  id: string;
  userId: string;
  kind: "routine" | "reminder";
  entityId?: string;
  dueAt: number;
};
async function authorized(r: Request, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`Bearer ${secret}`),
  );
  const actual = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(r.headers.get("authorization") ?? ""),
  );
  return timingSafeEqual(new Uint8Array(expected), new Uint8Array(actual));
}
function valid(job: Job) {
  return (
    typeof job.id === "string" &&
    job.id.length < 400 &&
    typeof job.userId === "string" &&
    ["routine", "reminder"].includes(job.kind) &&
    Number.isFinite(job.dueAt)
  );
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await authorized(request, env.SCHEDULER_SECRET)))
      return new Response(null, { status: 401 });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/jobs")
      return new Response(null, { status: 404 });
    const raw = await request.text();
    if (raw.length > 200000) return new Response(null, { status: 413 });
    const input = JSON.parse(raw) as { userId: string; jobs: Job[] };
    if (
      !Array.isArray(input.jobs) ||
      input.jobs.length > 1000 ||
      !input.jobs.every((j) => valid(j) && j.userId === input.userId)
    )
      return new Response(null, { status: 400 });
    // Replace this user's index atomically. D1 contains IDs and times only.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM jobs WHERE user_id=?").bind(input.userId),
      ...input.jobs.map((j) =>
        env.DB.prepare(
          "INSERT INTO jobs(id,user_id,kind,entity_id,due_at) VALUES(?,?,?,?,?)",
        ).bind(j.id, j.userId, j.kind, j.entityId ?? null, j.dueAt),
      ),
    ]);
    return Response.json({ ok: true });
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(dispatch(env));
  },
} satisfies ExportedHandler<Env>;
export async function dispatch(env: Env) {
  const now = Date.now();
  const due = await env.DB.prepare(
    "UPDATE jobs SET lease_until=?,attempts=attempts+1 WHERE id IN (SELECT id FROM jobs WHERE due_at<=? AND lease_until<=? ORDER BY due_at LIMIT 10) RETURNING *",
  )
    .bind(now + 120000, now, now)
    .all<{
      id: string;
      user_id: string;
      kind: "routine" | "reminder";
      entity_id: string | null;
      due_at: number;
    }>();
  for (const row of due.results) {
    const job: Job = {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      entityId: row.entity_id ?? undefined,
      dueAt: row.due_at,
    };
    try {
      const result = await fetch(`${env.BACKEND_URL}/api/v1/scheduler/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SCHEDULER_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(job),
        signal: AbortSignal.timeout(55000),
      });
      if (!result.ok) throw new Error(`backend_${result.status}`);
      const payload = (await result.json()) as { jobs: Job[] };
      if (!payload.jobs.every((j) => valid(j) && j.userId === job.userId))
        throw new Error("invalid_jobs");
      await env.DB.batch([
        env.DB.prepare("DELETE FROM jobs WHERE id=?").bind(job.id),
        ...payload.jobs.map((j) =>
          env.DB.prepare(
            "INSERT INTO jobs(id,user_id,kind,entity_id,due_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET due_at=excluded.due_at,lease_until=0,attempts=0",
          ).bind(j.id, j.userId, j.kind, j.entityId ?? null, j.dueAt),
        ),
      ]);
    } catch {
      await env.DB.prepare("UPDATE jobs SET lease_until=? WHERE id=?")
        .bind(Date.now() + 300000, job.id)
        .run();
      console.log(JSON.stringify({ event: "job_retry", id: job.id }));
    }
  }
}
