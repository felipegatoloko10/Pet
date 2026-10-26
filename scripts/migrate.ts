import { config } from "dotenv";
config({
  path: process.env.PINGO_ENV_FILE ?? "apps/web/.env.local",
  quiet: true,
});
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { databaseConnection } from "../apps/web/src/server/database-connection";
if (!process.env.DATABASE_URL_UNPOOLED) throw new Error("Informe DATABASE_URL_UNPOOLED no arquivo privado.");
const pool = new Pool(databaseConnection(process.env.DATABASE_URL_UNPOOLED));
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("Migrações aplicadas.");
} finally {
  await pool.end();
}
