import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { env, isProduction } from "./env";

const { Pool } = pg;

const poolConfig: pg.PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  min: env.DB_POOL_MIN,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false,
  statement_timeout: 30000,
  query_timeout: 30000,
  ssl:
    isProduction && env.DB_SSL !== "false"
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined,
};

export const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("[agents-service][DB POOL ERROR]", err);
});

export const db = drizzle(pool, { schema });

export async function closePool(): Promise<void> {
  await pool.end();
}
