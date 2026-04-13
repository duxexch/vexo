import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { logger } from "./lib/logger";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Production-ready pool configuration optimized for Hostinger VPS
const isProduction = process.env.NODE_ENV === "production";

// VPS-optimized pool settings:
// - 20 max connections: balanced for 2-4 core VPS with 4GB RAM (~200MB for pool)
// - Use DB_POOL_MAX env var to override if needed
// - Each connection uses ~10MB RAM
const poolConfig: pg.PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Connection pool settings — 20 is plenty for most VPS setups
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),
  min: parseInt(process.env.DB_POOL_MIN || "2", 10),  // Keep 2 warm connections
  idleTimeoutMillis: 30000,      // Close idle connections after 30s
  connectionTimeoutMillis: 5000, // Faster timeout for better UX (5s)
  allowExitOnIdle: false,        // Keep pool alive
  // Statement timeout to prevent long-running queries
  statement_timeout: 30000,      // 30s max query time
  query_timeout: 30000,          // 30s max query time
  // SSL configuration for production (disabled for Docker internal networking)
  ssl: isProduction && process.env.DB_SSL !== "false" ? {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
  } : undefined,
};

export const pool = new Pool(poolConfig);

// Handle pool errors gracefully
pool.on("error", (err) => {
  logger.error("[DB POOL ERROR]", err);
  // Don't exit - let the pool recover
});

pool.on("connect", () => {
  if (!isProduction) {
    logger.debug("[DB] New client connected to pool");
  }
});

export const db = drizzle(pool, { schema });

// Graceful shutdown helper
export async function closePool(): Promise<void> {
  logger.info("[DB] Closing connection pool...");
  await pool.end();
  logger.info("[DB] Connection pool closed");
}
