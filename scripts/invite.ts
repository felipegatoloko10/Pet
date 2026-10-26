import { config } from "dotenv";
config({
  path: process.env.PINGO_ENV_FILE ?? "apps/web/.env.local",
  quiet: true,
});
import { Pool } from "pg";
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^\S+@\S+\.\S+$/.test(email))
  throw new Error("Uso: npm run invite -- pessoa@gmail.com");
import { databaseConnection } from "../apps/web/src/server/database-connection";
if (!process.env.DATABASE_URL_UNPOOLED) throw new Error("Configure o banco privado antes de autorizar convites.");
const pool = new Pool(databaseConnection(process.env.DATABASE_URL_UNPOOLED));
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('pingo-invite-limit'))");
  const { rows } = await c.query(
    "SELECT count(*)::int AS count FROM invitations",
  );
  const exists = await c.query("SELECT email FROM invitations WHERE email=$1", [
    email,
  ]);
  if (rows[0].count >= 10 && !exists.rowCount)
    throw new Error("Limite de 10 convites atingido.");
  await c.query(
    "INSERT INTO invitations(email) VALUES($1) ON CONFLICT DO NOTHING",
    [email],
  );
  await c.query("COMMIT");
  console.log("Convite autorizado. Nenhum e-mail foi enviado.");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
