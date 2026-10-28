import { config } from "dotenv";
config({
  path:
    process.env.PINGO_ENV_FILE ?? ".verification/supabase-private/backend.env",
  quiet: true,
});
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { databaseConnection } from "../apps/web/src/server/database-connection";

const base = process.env.PINGO_TEST_URL ?? "http://127.0.0.1:3215";
const connection = process.env.DATABASE_URL_UNPOOLED ?? "";
if (
  !new URL(connection).username.endsWith(".nrxowlahoaldjjltdorz") ||
  !base.startsWith("http://127.0.0.1:") ||
  process.env.PINGO_VERIFY_SYNTHETIC !== "yes"
)
  throw new Error(
    "Use somente o projeto Pingo autorizado, um servidor local e PINGO_VERIFY_SYNTHETIC=yes.",
  );
const pool = new Pool({ ...databaseConnection(connection), max: 1 });
const suffix = randomUUID();
const emails = ["alice", "bob", "expired"].map(
  (n) => `${n}-${suffix}@verification.pingo.invalid`,
);
const codes = emails.map(() => randomBytes(32).toString("base64url"));
const password = randomBytes(24).toString("base64url") + "Aa1!";
const tickets: string[] = [];
const subnet = randomBytes(1)[0];
let checks = 0,
  ip = `10.60.${subnet}.1`;
const check = (condition: unknown) => {
  assert.ok(condition);
  checks++;
};
async function request(
  path: string,
  body?: unknown,
  cookie = "",
  headers: Record<string, string> = {},
) {
  return fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const cookies = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
const registration = (index: number, extra = {}) => ({
  email: emails[index],
  name: "Verificação temporária",
  password,
  inviteCode: codes[index],
  ...extra,
});
try {
  for (let i = 0; i < emails.length; i++)
    await pool.query(
      "INSERT INTO invitations(email,activation_hash,activation_expires_at) VALUES($1,$2,$3)",
      [
        emails[i],
        createHash("sha256").update(codes[i]).digest("hex"),
        new Date(Date.now() + (i === 2 ? -60000 : 600000)),
      ],
    );
  check(
    (
      await request("/api/auth/sign-up/email", {
        email: emails[0],
        name: "Verificação temporária",
        password: "curta",
      })
    ).status === 400,
  );
  check(
    (await request("/api/auth/password/sign-up", registration(2))).status ===
      403,
  );
  check(
    (
      await request(
        "/api/auth/password/sign-up",
        registration(0, { inviteCode: codes[1] }),
      )
    ).status === 403,
  );
  const a = await request("/api/auth/sign-up/email", registration(0));
  check(a.ok);
  const cookieA = cookies(a);
  check(cookieA.includes("session_token="));
  check(a.headers.getSetCookie().some((v) => /HttpOnly/i.test(v)));
  const userA = (await a.json()).user;
  ip = `10.60.${subnet}.2`;
  check(
    (await request("/api/auth/sign-up/email", registration(0))).status === 422,
  );
  await pool.query("DELETE FROM invitations WHERE email=$1", [emails[1]]);
  const b = await request(
    "/api/auth/sign-up/email",
    registration(1, { password: "Aa1!abcd" }),
  );
  check(b.ok);
  const cookieB = cookies(b);
  const userB = (await b.json()).user;
  check(userA.id !== userB.id);
  check(
    (
      await request("/api/v1/workspace", undefined, cookieA, {
        "X-Pingo-Account": userB.id,
      })
    ).status === 403,
  );
  const workspaceA = (
    await (await request("/api/v1/workspace", undefined, cookieA)).json()
  ).workspace;
  check(workspaceA.boards.length === 1);
  check(workspaceA.storageMode === "pingo");
  check(
    workspaceA.tasks.length === 0 &&
      workspaceA.events.length === 0 &&
      workspaceA.conversations.length === 0,
  );
  const board = workspaceA.boards[0];
  const operation = {
    operationId: randomUUID(),
    command: {
      type: "task.upsert",
      expectedRevision: 0,
      task: {
        id: `task-${suffix}`,
        boardId: board.id,
        columnId: board.columns[0].id,
        title: "Somente Alice",
        notes: "fixture",
        priority: "normal",
        dueDate: "2026-10-27",
        scheduledStart: "2026-10-27T18:00:00Z",
        scheduledEnd: "2026-10-27T18:30:00Z",
      },
    },
  };
  const saved = await request("/api/v1/operations", operation, cookieA);
  check(saved.ok);
  const w = (await saved.json()).workspace;
  check(w.tasks.length === 1 && w.events.length === 1 && w.outbox.length === 0);
  check((await request("/api/v1/operations", operation, cookieA)).ok);
  check(
    (await (await request("/api/v1/workspace", undefined, cookieA)).json())
      .workspace.tasks.length === 1,
  );
  check(
    (
      await request(
        "/api/v1/operations",
        {
          ...operation,
          command: {
            ...operation.command,
            task: { ...operation.command.task, title: "Outro comando" },
          },
        },
        cookieA,
      )
    ).status === 409,
  );
  check(
    (await (await request("/api/v1/workspace", undefined, cookieB)).json())
      .workspace.tasks.length === 0,
  );
  check(
    (
      await (
        await request(
          `/api/v1/workspace?revision=${w.revision}`,
          undefined,
          cookieA,
        )
      ).json()
    ).unchanged === true,
  );
  const mobile = await request("/api/v1/mobile/snapshot", undefined, cookieA);
  check(mobile.ok);
  const mobileData = await mobile.json();
  check(
    mobileData.plan.userId === userA.id &&
      mobileData.workspace.tasks.length === 1,
  );
  check(
    mobileData.plan.reminders.some((r: { summary?: boolean }) => r.summary),
  );
  const unchangedMobile = await request(
    `/api/v1/mobile/snapshot?revision=${w.revision}&day=${mobileData.day}`,
    undefined,
    cookieA,
  );
  check((await unchangedMobile.json()).unchanged === true);
  const packed = await pool.query(
    "SELECT data->>'format' AS format FROM workspaces WHERE user_id=$1",
    [userA.id],
  );
  check(packed.rows[0].format === "pingo-gzip-v1");
  check((await request("/api/v1/google/connect", {}, cookieA)).status === 410);
  check(
    [400, 404].includes(
      (
        await request("/api/auth/sign-in/social", {
          provider: "google",
          callbackURL: base,
        })
      ).status,
    ),
  );
  const verifier = randomBytes(40).toString("base64url"),
    state = randomBytes(32).toString("base64url");
  const start = await request("/api/v1/mobile-auth/start", {
    state,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  check(start.ok);
  const attempt = await start.json();
  const attemptId = new URL(attempt.url).searchParams.get("id")!;
  tickets.push(attemptId);
  const authorized = await request(
    "/api/v1/mobile-auth/authorize",
    { id: attemptId, state },
    cookieA,
  );
  check(authorized.ok);
  const callback = new URL((await authorized.json()).url);
  check(!callback.searchParams.has("access_token"));
  const exchange = {
    id: attemptId,
    state,
    verifier,
    code: callback.searchParams.get("code"),
  };
  const exchanged = await request("/api/v1/mobile-auth/exchange", exchange);
  check(exchanged.ok);
  check(!(await request("/api/v1/mobile-auth/exchange", exchange)).ok);
  const repeatId = randomUUID();
  const repeatOp = {
    operationId: repeatId,
    command: {
      ...operation.command,
      task: {
        ...operation.command.task,
        id: randomUUID(),
        title: "Rotina temporária",
        dueDate: new Date().toISOString().slice(0, 10),
        scheduledStart: null,
        scheduledEnd: null,
      },
      repetition: {
        kind: "daily",
        weekdays: [1],
        monthDays: [1],
        lastDay: false,
        interval: 1,
        until: null,
        count: 3,
      },
    },
  };
  const repeatSaved = await request("/api/v1/operations", repeatOp, cookieA);
  check(repeatSaved.ok);
  const repeatWorkspace = (await repeatSaved.json()).workspace;
  check(
    repeatWorkspace.taskSeries.length === 1 &&
      repeatWorkspace.tasks.filter(
        (t: { seriesId?: string }) => t.seriesId === repeatId,
      ).length === 3,
  );
  check((await request("/api/v1/operations", repeatOp, cookieA)).ok);
  const anotherRead = (
    await (await request("/api/v1/workspace", undefined, cookieA)).json()
  ).workspace;
  check(
    anotherRead.tasks.length === repeatWorkspace.tasks.length &&
      anotherRead.events.length === repeatWorkspace.events.length,
  );
  check(
    (await (await request("/api/v1/workspace", undefined, cookieB)).json())
      .workspace.taskSeries?.length !== 1,
  );
  const repeatTask = anotherRead.tasks.find(
    (t: { seriesId?: string }) => t.seriesId === repeatId,
  );
  const move = {
    operationId: randomUUID(),
    command: {
      type: "task.move",
      id: repeatTask.id,
      columnId: board.columns.find((c: { kind: string }) => c.kind === "done")
        .id,
      beforeId: null,
      expectedRevision: repeatTask.revision,
    },
  };
  const moved = await request("/api/v1/operations", move, cookieA);
  check(moved.ok);
  check(
    (await moved.json()).workspace.tasks.filter(
      (t: { seriesId?: string; completed: boolean }) =>
        t.seriesId === repeatId && t.completed,
    ).length === 1,
  );
  ip = `10.60.${subnet}.3`;
  const recovery = randomBytes(32).toString("base64url"),
    nextPassword = randomBytes(24).toString("base64url") + "Aa1!";
  await pool.query(
    "UPDATE invitations SET activation_hash=$2,activation_used_at=NULL,activation_purpose='recover' WHERE email=$1",
    [emails[0], createHash("sha256").update(recovery).digest("hex")],
  );
  check(
    (
      await request(
        "/api/auth/password/sign-up",
        registration(0, { inviteCode: recovery }),
      )
    ).status === 403,
  );
  const recovered = await request(
    "/api/auth/password/sign-up",
    registration(0, {
      inviteCode: recovery,
      purpose: "recover",
      password: nextPassword,
    }),
  );
  check(recovered.ok);
  check(
    (await request("/api/v1/workspace", undefined, cookieA)).status === 401,
  );
  check(
    (await request("/api/auth/sign-in/email", { email: emails[0], password }))
      .status === 401,
  );
  check(
    (
      await request("/api/auth/sign-in/email", {
        email: emails[0],
        password: nextPassword,
      })
    ).ok,
  );
  for (const role of ["anon", "authenticated"]) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${role}`);
      let denied = false;
      try {
        await c.query("SELECT user_id FROM workspaces LIMIT 1");
      } catch (e) {
        denied = (e as { code?: string }).code === "42501";
      }
      check(denied);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  }
  console.log(
    `${checks} verificações reais passaram: cadastro sem convite, senha, recuperação protegida, isolamento, repetição segura, sincronização compactada, PKCE e bloqueio dos papéis públicos.`,
  );
} finally {
  if (tickets.length)
    await pool.query("DELETE FROM auth_verification WHERE id=ANY($1::text[])", [
      tickets,
    ]);
  await pool.query("DELETE FROM auth_user WHERE email=ANY($1::text[])", [
    emails,
  ]);
  await pool.query("DELETE FROM invitations WHERE email=ANY($1::text[])", [
    emails,
  ]);
  await pool.end();
}
