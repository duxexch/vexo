const DEFAULT_CANONICAL_ORIGIN = "https://vexo.click";
const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3001",
  "http://localhost:3000",
  "http://127.0.0.1:3001",
];

function readServerEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function trimTrailingSlashes(input: string): string {
  return input.replace(/\/+$/, "");
}

export function getCanonicalOrigin(): string {
  const fromEnv = readServerEnv("APP_PUBLIC_BASE_URL") ?? readServerEnv("APP_URL");
  if (fromEnv) {
    return trimTrailingSlashes(fromEnv);
  }
  return DEFAULT_CANONICAL_ORIGIN;
}

export function getCanonicalUrl(pathname: string = "/"): string {
  const origin = getCanonicalOrigin();
  if (!pathname || pathname === "/") {
    return `${origin}/`;
  }
  return `${origin}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function getAllowedOrigins(isProduction: boolean): string[] {
  if (isProduction) {
    const canonical = getCanonicalOrigin();
    const wwwVariant = canonical.replace(/^https?:\/\/(?!www\.)/, (m) => `${m}www.`);
    const extras = (readServerEnv("APP_EXTRA_ORIGINS") ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    return Array.from(new Set([canonical, wwwVariant, ...extras]));
  }
  return [...DEFAULT_DEV_ORIGINS];
}

export function getClientOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return getCanonicalOrigin();
}
