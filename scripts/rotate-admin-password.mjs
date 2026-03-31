#!/usr/bin/env node

import bcrypt from "bcryptjs";
import { Pool } from "pg";

function parseArgs(argv) {
  const args = {
    databaseUrl: process.env.DATABASE_URL || "",
    username: "admin",
    password: "",
    rounds: 12,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const [key, value] = argv[i].split("=");
    if (!value) continue;

    if (key === "--database-url") args.databaseUrl = value;
    if (key === "--username") args.username = value;
    if (key === "--password") args.password = value;
    if (key === "--rounds") args.rounds = Number.parseInt(value, 10) || args.rounds;
  }

  return args;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    return "Password is required. Pass --password=...";
  }

  if (password.length < 12) {
    return "Password must be at least 12 characters.";
  }

  return null;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.databaseUrl) {
    console.error("[rotate-admin-password] DATABASE_URL is required. Pass --database-url=... or set env DATABASE_URL.");
    process.exit(1);
  }

  const passwordError = validatePassword(options.password);
  if (passwordError) {
    console.error(`[rotate-admin-password] ${passwordError}`);
    process.exit(1);
  }

  const newPassword = options.password;
  const pool = new Pool({ connectionString: options.databaseUrl });

  try {
    const existing = await pool.query(
      "SELECT id, username, role FROM users WHERE username = $1 AND role = 'admin' LIMIT 1",
      [options.username],
    );

    if (existing.rowCount === 0) {
      console.error(`[rotate-admin-password] Admin user \"${options.username}\" not found.`);
      process.exit(1);
    }

    const hash = await bcrypt.hash(newPassword, options.rounds);

    const update = await pool.query(
      "UPDATE users SET password = $1, failed_login_attempts = 0, locked_until = NULL WHERE username = $2 AND role = 'admin'",
      [hash, options.username],
    );

    if (update.rowCount !== 1) {
      console.error("[rotate-admin-password] Password rotation did not update exactly one row.");
      process.exit(1);
    }

    console.log("[rotate-admin-password] Password rotated successfully.");
    console.log(JSON.stringify({
      username: options.username,
      passwordUpdated: true,
      rounds: options.rounds,
      rotatedAt: new Date().toISOString(),
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[rotate-admin-password] Unexpected failure:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
