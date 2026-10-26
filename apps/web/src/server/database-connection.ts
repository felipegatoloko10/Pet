import type { PoolConfig } from "pg";

export function databaseConnection(
  connectionString: string,
  ca = process.env.DATABASE_SSL_CA,
): PoolConfig {
  if (!ca) return { connectionString };
  const url = new URL(connectionString);
  // pg's URL parser otherwise replaces the explicit CA configuration.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  return { connectionString: url.href, ssl: { ca, rejectUnauthorized: true } };
}
