import { config } from "dotenv";
config({
  path: process.env.PINGO_ENV_FILE ?? "apps/web/.env.local",
  quiet: true,
});
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Pool } from "pg";
import { databaseConnection } from "../apps/web/src/server/database-connection";

const email = process.argv[2]?.trim().toLowerCase();
const recover = process.argv.includes("--recover");
if (
  !email ||
  !/^\S+@\S+\.\S+$/.test(email) ||
  !process.env.DATABASE_URL_UNPOOLED
)
  throw new Error(
    "Informe um e-mail já convidado e a configuração privada do Pingo.",
  );
const pool = new Pool(databaseConnection(process.env.DATABASE_URL_UNPOOLED));
try {
  const registered = await pool.query(
    "SELECT 1 FROM auth_user u JOIN auth_account a ON a.user_id=u.id WHERE lower(u.email)=$1 AND a.provider_id='credential'",
    [email],
  );
  if (registered.rowCount && !recover)
    throw new Error(
      "Essa conta já tem senha. Um convite de recuperação exige --recover.",
    );
  const code = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 7 * 86400000);
  const changed = await pool.query(
    "UPDATE invitations SET activation_hash=$2,activation_expires_at=$3,activation_used_at=NULL,activation_purpose=$4 WHERE email=$1",
    [
      email,
      createHash("sha256").update(code).digest("hex"),
      expires,
      recover ? "recover" : "register",
    ],
  );
  if (changed.rowCount !== 1)
    throw new Error("Autorize primeiro esse e-mail com npm run invite.");
  const url = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
  url.hash = new URLSearchParams({
    invite: code,
    email,
    action: recover ? "recover" : "register",
  }).toString();
  const folder = ".verification/supabase-private";
  await mkdir(folder, { recursive: true });
  const file = `${folder}/invitations.json`;
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(file, "utf8"));
  } catch {}
  existing[email] = {
    url: url.href,
    expiresAt: expires.toISOString(),
    purpose: recover ? "recover" : "register",
  };
  await writeFile(file, JSON.stringify(existing, null, 2));
  console.log(
    "Convite salvo no arquivo privado. Nenhum link, senha ou e-mail foi enviado.",
  );
} finally {
  await pool.end();
}
