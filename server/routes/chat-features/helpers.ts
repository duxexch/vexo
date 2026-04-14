import type { Request, Response, NextFunction } from "express";
import { db } from "../../db";
import { systemConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Middleware type for auth */
export type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => void;

/** Get a system config value with fallback */
export async function getConfigValue(key: string, defaultValue: string): Promise<string> {
  try {
    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
    return config?.value || defaultValue;
  } catch {
    return defaultValue;
  }
}

/** Get a numeric system config value with fallback */
export async function getConfigNumber(key: string, defaultValue: number): Promise<number> {
  const val = await getConfigValue(key, String(defaultValue));
  return parseInt(val) || defaultValue;
}

/** Get a decimal system config value with fallback */
export async function getConfigDecimal(key: string, defaultValue: number): Promise<number> {
  const val = await getConfigValue(key, String(defaultValue));
  const parsed = Number.parseFloat(val);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/** Rate limiter map and check function */
const rateLimits = new Map<string, { count: number; resetAt: number }>();

// Cleanup expired rate limit entries every 2 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now > entry.resetAt) {
      rateLimits.delete(key);
    }
  }
}, 120_000);

export function checkRateLimit(key: string, maxCount: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxCount) return false;
  entry.count++;
  return true;
}

export function normalizeMimeType(value: string): string {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

/** Validate file magic bytes match declared MIME type */
export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;

  const normalizedMimeType = normalizeMimeType(mimeType);

  const checks: Record<string, (b: Buffer) => boolean> = {
    'image/jpeg': (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
    'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,
    'image/gif': (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
    'image/webp': (b) => b.length > 11 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
    'video/mp4': (b) => b.length > 7 && (
      (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) ||
      (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x00)
    ),
    'video/webm': (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
    'audio/webm': (b) => b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
    'audio/ogg': (b) => b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53,
    'audio/mp4': (b) => b.length > 7 && (
      (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) ||
      (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x00)
    ),
  };

  const checker = checks[normalizedMimeType];
  return checker ? checker(buffer) : false;
}
