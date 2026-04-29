function readNumberFromEnv(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

export const ADMIN_LOGIN_LOCKOUT = {
  get maxFailedAttempts(): number {
    return readNumberFromEnv("ADMIN_LOGIN_MAX_ATTEMPTS", 3);
  },
  get lockoutDurationMs(): number {
    const minutes = readNumberFromEnv("ADMIN_LOGIN_LOCKOUT_MINUTES", 30);
    return minutes * 60 * 1000;
  },
};

export const USER_LOGIN_LOCKOUT = {
  get maxFailedAttempts(): number {
    return readNumberFromEnv("USER_LOGIN_MAX_ATTEMPTS", 8);
  },
  get lockoutDurationMs(): number {
    const minutes = readNumberFromEnv("USER_LOGIN_LOCKOUT_MINUTES", 15);
    return minutes * 60 * 1000;
  },
};

export const RATE_LIMIT_FAIL_MODE: "open" | "closed" = (() => {
  const raw = (process.env.RATE_LIMIT_FAIL_MODE ?? "").trim().toLowerCase();
  if (raw === "open" || raw === "closed") return raw;
  return process.env.NODE_ENV === "production" ? "closed" : "open";
})();
