import { timingSafeEqual } from "node:crypto";
type Job = {
  id: string;
  userId: string;
  kind: "routine" | "reminder";
  entityId?: string;
  dueAt: number;
};
async function authorized(r: Request, secret: string) {
  if (!secret || secret.length < 32) return false;
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
function valid(job: Job | null) {
  return (
    !!job &&
    typeof job.id === "string" &&
    job.id.length < 400 &&
    typeof job.userId === "string" &&
    ["routine", "reminder"].includes(job.kind) &&
    Number.isSafeInteger(job.dueAt)
  );
}
async function boundedBody(request: Request) {
  const max = 1000000;
  if (Number(request.headers.get("content-length") ?? 0) > max) throw new Error("size");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("json");
  const decoder = new TextDecoder();
  let size = 0, text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error("size"); }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health")
      return Response.json({ service: "pingo-scheduler", protocol: 2, configured: !!env.DB && (env.SCHEDULER_SECRET?.length ?? 0) >= 32 });
    if (!(await authorized(request, env.SCHEDULER_SECRET)))
      return new Response(null, { status: 401 });
    if (request.method === "GET" && path === "/status") {
      const [queue, lastRun] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS pending,COALESCE(SUM(due_at<=?),0) AS due,MIN(due_at) AS next_due_at FROM jobs").bind(Date.now()).first(),
        env.DB.prepare("SELECT last_run_at,claimed,completed,retried FROM dispatcher_state WHERE id=1").first(),
      ]);
      return Response.json({ queue, lastRun });
    }
    if (request.method !== "POST" || new URL(request.url).pathname !== "/jobs")
      return new Response(null, { status: 404 });
    let input: { userId: string; revision: number; jobs: Job[] };
    try { input = await boundedBody(request); }
    catch (error) { return new Response(null, { status: error instanceof Error && error.message === "size" ? 413 : 400 }); }
    if (
      !input || typeof input.userId !== "string" || !input.userId || input.userId.length > 200 ||
      !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      !Array.isArray(input.jobs) ||
      input.jobs.length > 1000 ||
      !input.jobs.every((j) => valid(j) && j.userId === input.userId) ||
      new Set(input.jobs.map(j => j.id)).size !== input.jobs.length
    )
      return new Response(null, { status: 400 });
    // Atomic replacement with revision guard: stale requests cannot restore old reminders.
    const generation = crypto.randomUUID();
    const applied = "EXISTS(SELECT 1 FROM job_indexes WHERE user_id=? AND generation=?)";
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO job_indexes(user_id,revision,generation) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,generation=excluded.generation WHERE excluded.revision>=job_indexes.revision").bind(input.userId, input.revision, generation),
      env.DB.prepare(`DELETE FROM jobs WHERE user_id=? AND ${applied}`).bind(input.userId, input.userId, generation),
      ...input.jobs.map((j) =>
        env.DB.prepare(
          `INSERT INTO jobs(id,user_id,kind,entity_id,due_at) SELECT ?,?,?,?,? WHERE ${applied}`,
        ).bind(j.id, j.userId, j.kind, j.entityId ?? null, j.dueAt, input.userId, generation),
      ),
    ]);
    return Response.json({ ok: true, applied: results[0].meta.changes > 0 });
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
  ) {
    const stats = await dispatch(env);
    await env.DB.prepare("INSERT INTO dispatcher_state(id,last_run_at,claimed,completed,retried) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_run_at=excluded.last_run_at,claimed=excluded.claimed,completed=excluded.completed,retried=excluded.retried")
      .bind(Date.now(), stats.claimed, stats.completed, stats.retried).run();
  },
} satisfies ExportedHandler<Env>;
export async function dispatch(env: Env) {
  const now = Date.now();
  const lease = now + 120000;
  const due = await env.DB.prepare(
    "UPDATE jobs SET lease_until=?,attempts=attempts+1 WHERE id IN (SELECT j.id FROM jobs j WHERE j.due_at<=? AND j.lease_until<=? AND NOT EXISTS(SELECT 1 FROM jobs active WHERE active.user_id=j.user_id AND active.lease_until>?) AND j.id=(SELECT first.id FROM jobs first WHERE first.user_id=j.user_id AND first.due_at<=? AND first.lease_until<=? ORDER BY first.due_at,first.id LIMIT 1) ORDER BY j.due_at LIMIT 3) RETURNING *",
  )
    .bind(lease, now, now, now, now, now)
    .all<{
      id: string;
      user_id: string;
      kind: "routine" | "reminder";
      entity_id: string | null;
      due_at: number;
    }>();
  const results = await Promise.all(due.results.map(async (row) => {
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
      if (!(await result.json() as { indexed?: boolean }).indexed) throw new Error("not_indexed");
      // Backend publishes its current index. Never merge an old execution's snapshot.
      await env.DB.prepare("DELETE FROM jobs WHERE id=? AND lease_until=?").bind(job.id, lease).run();
      return true;
    } catch {
      await env.DB.prepare("UPDATE jobs SET lease_until=? WHERE id=? AND lease_until=?")
        .bind(Date.now() + 300000, job.id, lease)
        .run();
      console.warn(JSON.stringify({ event: "job_retry", id: job.id }));
      return false;
    }
  }));
  return { claimed: results.length, completed: results.filter(Boolean).length, retried: results.filter(v => !v).length };
}
