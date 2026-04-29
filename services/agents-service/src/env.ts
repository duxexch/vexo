import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`[agents-service] missing required env: ${name}`);
  }
  return v;
}

export const env = {
  PORT: parseInt(process.env.PORT || "3002", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: required("DATABASE_URL"),
  /**
   * Shared secret used by the main server to sign internal proxy calls.
   * Must match `INTERNAL_SERVICE_TOKEN` on the main server.
   */
  INTERNAL_SERVICE_TOKEN: required("INTERNAL_SERVICE_TOKEN"),
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || "10", 10),
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || "1", 10),
  DB_SSL: process.env.DB_SSL,
} as const;

export const isProduction = env.NODE_ENV === "production";
