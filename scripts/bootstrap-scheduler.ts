import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import { Pool } from "pg";
import { jobsFor } from "../apps/web/src/server/notifications";
import type { Workspace } from "../packages/core/src/index";
// Administrative indexing of existing invited accounts only; no Google/AI calls or DB writes.
const file = process.argv[2];
if (!file) throw new Error("Informe o arquivo privado com SCHEDULER_URL e SCHEDULER_SECRET.");
const scheduler = parse(await readFile(file));
const database = parse(await readFile(".neon-production.env"));
const connectionString = database.DATABASE_URL;
if (!connectionString || !new URL(connectionString).hostname.startsWith("ep-long-recipe-b44wq4p7"))
  throw new Error("A ferramenta requer o banco de produção exclusivo do Pingo.");
if (scheduler.SCHEDULER_URL !== "https://pingo-scheduler.pingo-feh-38dc10.workers.dev" || (scheduler.SCHEDULER_SECRET?.length ?? 0) < 32)
  throw new Error("Configuração do agendador Pingo inválida.");
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
try {
  const { rows } = await pool.query<{ user_id: string; data: Workspace }>(
    "SELECT w.user_id,w.data FROM workspaces w JOIN auth_user u ON u.id=w.user_id JOIN invitations i ON i.email=lower(u.email) ORDER BY w.user_id LIMIT 10",
  );
  for (const row of rows) {
    const response = await fetch(`${scheduler.SCHEDULER_URL}/jobs`, {
      method: "POST", headers: { Authorization: `Bearer ${scheduler.SCHEDULER_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: row.user_id, revision: row.data.revision, jobs: jobsFor(row.user_id, row.data) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`O índice não foi confirmado: HTTP ${response.status}.`);
  }
  console.log(`${rows.length} conta(s) convidada(s) indexada(s). Nenhum conteúdo ou segredo foi exibido.`);
} finally { await pool.end(); }
