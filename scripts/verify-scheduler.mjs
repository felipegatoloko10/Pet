// Real local Workers/D1 runtime; the backend is simulated. No Google, AI or cloud calls.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root = resolve(import.meta.dirname, ".."), cli = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const directory = resolve(root, ".verification", `scheduler-${crypto.randomUUID()}`);
await mkdir(directory, { recursive: true });
const config = resolve(root, "workers/scheduler/wrangler.jsonc"), state = resolve(directory, "state");
const secret = `local-test-${crypto.randomUUID()}-${crypto.randomUUID()}`;
let assertions = 0, calls = [], mode = "ack", nextRevision = 100;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
let url;
const backend = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/api/v1/scheduler/run");
    assert.equal(request.headers.authorization, `Bearer ${secret}`);
    let text = ""; for await (const chunk of request) text += chunk;
    const job = JSON.parse(text); calls.push(job);
    if (mode === "replace" || mode === "replace-fail")
      await index(job.userId, nextRevision++, [{ ...job, dueAt: Date.now() + 3600000 }]);
    const fail = mode === "fail" || mode === "replace-fail";
    response.writeHead(fail ? 503 : 200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(fail ? { error: "test_unavailable" } : { indexed: true, jobs: [] }));
  } catch { response.writeHead(500); response.end(); }
});
await new Promise(r => backend.listen(0, "127.0.0.1", r));
const probe = createServer();
await new Promise(r => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise(r => probe.close(r));
url = `http://127.0.0.1:${port}`;
const fixture = resolve(directory, ".env.fixture");
await writeFile(fixture, `SCHEDULER_SECRET=${secret}\nBACKEND_URL=http://127.0.0.1:${backend.address().port}\n`);
function run(args) {
  const child = spawn(process.execPath, [cli, ...args], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { logs = (logs + chunk).slice(-10000); });
  const exited = new Promise(r => child.once("close", code => r(code)));
  return { child, exited, logs: () => logs.replaceAll(secret, "[test-key]") };
}
async function request(path, data, authenticated = true) {
  return fetch(`${url}${path}`, { method: data === undefined ? "GET" : "POST", headers: { ...(authenticated ? { Authorization: `Bearer ${secret}` } : {}), "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
async function index(userId, revision, jobs) {
  const response = await request("/jobs", { userId, revision, jobs });
  assert.equal(response.status, 200); return response.json();
}
const job = (id, userId = "alice") => ({ id, userId, kind: "routine", dueAt: Date.now() - 1000 });
const status = async () => (await request("/status")).json();
async function tick() {
  const response = await fetch(`${url}/__scheduled?cron=*+*+*+*+*`);
  assert.equal(response.status, 200);
  // The dev handler returns once the scheduled event has finished.
  for (let i = 0; i < 20 && !(await status()).lastRun; i++) await delay(50);
}
let worker;
try {
  const migration = run(["d1", "migrations", "apply", "pingo-jobs", "--local", "--config", config, "--persist-to", state]);
  if (await migration.exited !== 0) throw new Error(migration.logs());
  worker = run(["dev", "--local", "--config", config, "--persist-to", state, "--env-file", fixture, "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0", "--test-scheduled", "--show-interactive-dev-session=false"]);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await request("/health", undefined, false)).ok; if (ready) break; } catch {}
    if (worker.child.exitCode !== null) break;
    await delay(200);
  }
  if (!ready) throw new Error(worker.logs());
  check((await request("/status", undefined, false)).status === 401, "status is private");
  check((await request("/jobs", { userId: "alice", revision: 1, jobs: [job("foreign", "bob")] })).status === 400, "account mismatch rejected");
  check((await request("/jobs", { userId: "alice", revision: 1, jobs: [job("same"), job("same")] })).status === 400, "duplicate ids rejected");
  check((await fetch(`${url}/jobs`, { method: "POST", headers: { Authorization: `Bearer ${secret}` }, body: "invalid" })).status === 400, "malformed JSON rejected");
  await index("alice", 2, [job("first"), job("second")]);
  check(!(await index("alice", 1, [])).applied, "old revision ignored");
  check((await status()).queue.pending === 2, "old index did not delete current jobs");
  await index("bob", 1, [job("bob-first", "bob")]);
  await tick();
  check(calls.length === 2 && new Set(calls.map(j => j.userId)).size === 2, "one concurrent job per account");
  check((await status()).queue.pending === 1, "acknowledged jobs removed");
  await index("alice", 3, [job("replace")]); mode = "replace";
  await tick();
  check((await status()).queue.pending === 1 && (await status()).queue.next_due_at > Date.now(), "old ack preserved replacement");
  const beforeEmpty = calls.length; await tick();
  check(calls.length === beforeEmpty, "empty minute did not call backend");
  await index("alice", nextRevision++, [job("failed")]); mode = "fail";
  await tick(); const afterFailure = calls.length; await tick();
  check(calls.length === afterFailure, "failed job respects retry lease");
  check((await status()).queue.pending === 1, "failed job remains persistent");
  await index("alice", nextRevision++, [job("replace-failed")]); mode = "replace-fail";
  await tick();
  check((await status()).queue.pending === 1 && (await status()).queue.next_due_at > Date.now(), "old failure did not postpone new index");
  mode = "ack"; await index("alice", nextRevision++, [job("finish")]); await tick();
  check((await status()).queue.pending === 0, "recovered job completed");
  check((await status()).lastRun.completed === 1, "cron heartbeat recorded");
  console.log(`${assertions} verificações passaram no runtime Workers/D1 local. Backend simulado; nenhuma chamada Google/IA.`);
} finally {
  if (worker) { worker.child.kill(); await Promise.race([worker.exited, delay(5000)]); }
  await new Promise(r => backend.close(r));
}
