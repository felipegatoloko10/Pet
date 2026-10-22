import { config } from "dotenv";
config({ path: "apps/web/.env.local", quiet: true });
import { Pool } from "pg";
import assert from "node:assert/strict";
import { emptyWorkspace, newBoard } from "../packages/core/src/index";
// This fixture can only run against the dedicated development branch.
if (!process.env.DATABASE_URL_UNPOOLED?.includes("ep-tiny-sound-b4yhrd2q"))
  throw new Error("A verificação requer a branch de desenvolvimento Pingo.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED }),
  base = process.env.PINGO_TEST_URL ?? "http://127.0.0.1:3210";
const alice = crypto.randomUUID(),
  bob = crypto.randomUUID(),
  tokenA = crypto.randomUUID(),
  tokenB = crypto.randomUUID();
let assertions = 0;
const check = (condition: unknown) => {
  assert.ok(condition);
  assertions++;
};
async function call(token: string, path: string, data?: unknown) {
  return fetch(`${base}/api/v1/${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
try {
  for (const [id, token] of [
    [alice, tokenA],
    [bob, tokenB],
  ]) {
    await pool.query(
      "INSERT INTO auth_user(id,name,email,email_verified) VALUES($1,$2,$3,true)",
      [id, "Teste Pingo", `${id}@example.invalid`],
    );
    await pool.query(
      "INSERT INTO auth_session(id,token,user_id,expires_at) VALUES($1,$2,$3,$4)",
      [crypto.randomUUID(), token, id, new Date(Date.now() + 600000)],
    );
    const w = emptyWorkspace();
    w.boards = [newBoard(`board-${id}`, "Quadro privado")];
    await pool.query("INSERT INTO workspaces(user_id,data) VALUES($1,$2)", [
      id,
      JSON.stringify(w),
    ]);
  }
  const { auth } = await import("../apps/web/src/server/auth");
  const localSession = await auth().api.getSession({
    headers: new Headers({ Authorization: `Bearer ${tokenA}` }),
  });
  check(localSession?.user.id === alice);
  const op = {
    operationId: crypto.randomUUID(),
    command: {
      type: "task.upsert",
      expectedRevision: 0,
      task: {
        id: "private-task",
        boardId: `board-${alice}`,
        columnId: `board-${alice}:todo`,
        title: "Privada",
        notes: "",
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        priority: "normal",
      },
    },
  };
  const first = await call(tokenA, "operations", op);
  if (first.status !== 200) {
    const data = await first.json();
    console.log({ status: first.status, error: data.error, code: data.code });
  }
  check(first.status === 200);
  check((await call(tokenA, "operations", op)).status === 200);
  const a = await (await call(tokenA, "workspace")).json();
  check(a.workspace.tasks.length === 1);
  const b = await (await call(tokenB, "workspace")).json();
  check(b.workspace.tasks.length === 0);
  check(b.user.id === bob);
  const push = {
    endpoint: "https://fcm.googleapis.com/fcm/send/pingo-test-fixture",
    keys: { p256dh: "fake-test-key", auth: "fake-auth" },
  };
  check((await call(tokenA, "push", push)).status === 200);
  check((await call(tokenB, "push", push)).status === 200);
  const owned = await pool.query(
    "SELECT user_id FROM push_subscriptions WHERE user_id=ANY($1::text[])",
    [[alice, bob]],
  );
  check(owned.rows.length === 1 && owned.rows[0].user_id === bob);
  const remove = await fetch(`${base}/api/v1/push`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint: push.endpoint }),
  });
  check(remove.status === 200);
  const remaining = await pool.query(
    "SELECT user_id FROM push_subscriptions WHERE user_id=$1",
    [bob],
  );
  check(remaining.rowCount === 1);
  check(!("outbox" in b.workspace));
  check(!("cursor" in b.workspace));
  check(
    (
      await call(tokenB, "operations", {
        ...op,
        operationId: crypto.randomUUID(),
      })
    ).status === 404,
  );
  check(
    (
      await call(tokenA, "operations", {
        ...op,
        command: {
          ...op.command,
          task: { ...op.command.task, title: "Outra" },
        },
      })
    ).status === 409,
  );
  check(
    (
      await call(tokenA, "operations", {
        operationId: crypto.randomUUID(),
        command: {
          ...op.command,
          task: { ...op.command.task, title: "Outra" },
        },
      })
    ).status === 409,
  );
  const approvalId = crypto.randomUUID();
  await pool.query(
    "INSERT INTO approvals(id,user_id,command,expires_at) VALUES($1,$2,$3,$4)",
    [
      approvalId,
      alice,
      JSON.stringify({
        type: "task.delete",
        id: "private-task",
        expectedRevision: 1,
        confirmed: true,
      }),
      new Date(Date.now() + 60000),
    ],
  );
  check((await call(tokenB, "approvals", { id: approvalId })).status === 409);
  check((await call(tokenA, "approvals", { id: approvalId })).status === 200);
  check((await call(tokenA, "approvals", { id: approvalId })).status === 409);
  check((await fetch(`${base}/api/v1/workspace`)).status === 401);
  const preflight = await fetch(`${base}/api/v1/workspace`, {
    method: "OPTIONS",
    headers: { Origin: "http://tauri.localhost" },
  });
  check(
    preflight.headers.get("Access-Control-Allow-Origin") ===
      "http://tauri.localhost",
  );
  console.log(
    `${assertions} verificações reais de API/Neon passaram: sessões, isolamento, idempotência, revisão e aprovação.`,
  );
} finally {
  await pool.query("DELETE FROM auth_user WHERE id=ANY($1::text[])", [
    [alice, bob],
  ]);
  await pool.end();
}
