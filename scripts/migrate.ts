import { config } from "dotenv";
config({
  path: process.env.PINGO_ENV_FILE ?? "apps/web/.env.local",
  quiet: true,
});
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("Migrações aplicadas.");
} finally {
  await pool.end();
}
