import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";
import { databaseConnection } from "./database-connection";
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error("Banco ainda não configurado.");
  if (!instance) {
    const pool = new Pool({
      ...databaseConnection(process.env.DATABASE_URL),
      max: 3,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
    });
    attachDatabasePool(pool);
    instance = drizzle(pool, { schema });
  }
  return instance;
}
