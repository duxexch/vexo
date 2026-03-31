/**
 * AES-256-GCM Encryption/Decryption for sensitive fields (OAuth secrets, tokens, etc.)
 * Phase 1: Social Platforms secrets encryption
 */
import crypto from "crypto";
import { logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16;
const ENCODING = "base64";

function getEncryptionKey(): Buffer {
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  if (!key) {
    // In dev mode without key, use a deterministic fallback (NOT secure for production)
    if (process.env.NODE_ENV !== "production") {
      return crypto.createHash("sha256").update("vex-dev-encryption-key-not-for-production").digest();
    }
    throw new Error("SECRETS_ENCRYPTION_KEY environment variable is required in production");
  }
  // Accept hex (64 chars) or base64 (44 chars) or raw string (hashed to 32 bytes)
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex");
  }
  // Hash any other string to get exactly 32 bytes
  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: base64 string containing IV + ciphertext + auth tag
 * Returns null if input is null/undefined/empty
 */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext || plaintext.trim() === "") return null;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  
  const tag = cipher.getAuthTag();
  
  // Format: iv (12) + tag (16) + ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);
  return `enc:${combined.toString(ENCODING)}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Accepts strings prefixed with "enc:" (encrypted) or returns plain strings as-is (migration support).
 * Returns null if input is null/undefined/empty
 */
export function decryptSecret(ciphertext: string | null | undefined): string | null {
  if (!ciphertext || ciphertext.trim() === "") return null;
  
  // If not encrypted (legacy plaintext), return as-is
  if (!ciphertext.startsWith("enc:")) {
    return ciphertext;
  }
  
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(ciphertext.slice(4), ENCODING);
    
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString("utf8");
  } catch (error) {
    logger.error('[Crypto] Failed to decrypt secret — returning null', new Error((error as Error).message));
    return null;
  }
}

/** List of social platform fields that contain secrets */
export const SECRET_FIELDS = [
  "clientSecret",
  "apiSecret",
  "botToken",
  "accessToken",
  "refreshToken",
] as const;

/** Fields that are sensitive but not full secrets (still mask in responses) */
export const SENSITIVE_FIELDS = [
  "clientId",
  "apiKey",
  ...SECRET_FIELDS,
] as const;

/**
 * Encrypt all secret fields in a social platform data object before saving to DB.
 */
export function encryptPlatformSecrets<T extends Record<string, unknown>>(data: T): T {
  const result: Record<string, unknown> = { ...data };
  for (const field of SECRET_FIELDS) {
    const val = result[field];
    if (val && typeof val === "string") {
      // Don't re-encrypt already encrypted values
      if (!val.startsWith("enc:")) {
        result[field] = encryptSecret(val);
      }
    }
  }
  return result as T;
}

/**
 * Decrypt all secret fields in a social platform object after reading from DB.
 */
export function decryptPlatformSecrets<T extends Record<string, unknown>>(data: T): T {
  const result: Record<string, unknown> = { ...data };
  for (const field of SECRET_FIELDS) {
    const val = result[field];
    if (val && typeof val === "string") {
      result[field] = decryptSecret(val);
    }
  }
  return result as T;
}

/**
 * Mask a secret value for API responses — show only "has value" or not.
 * Returns "••••••••" if value exists, null if not.
 */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value || value.trim() === "") return null;
  return "••••••••";
}

/**
 * Build a safe platform object for admin API responses — secrets are masked.
 * Adds `hasSecret` boolean flags for each secret field.
 */
export function maskPlatformSecrets<T extends Record<string, unknown>>(platform: T): T & Record<string, unknown> {
  const result: Record<string, unknown> = { ...platform };
  for (const field of SECRET_FIELDS) {
    const hasValue = !!(result[field] && String(result[field]).trim() !== "");
    result[`has_${field}`] = hasValue;
    result[field] = maskSecret(result[field] as string);
  }
  return result as T & Record<string, unknown>;
}

/**
 * Check if an update value is a mask placeholder (should be skipped, keeping existing value).
 */
export function isMaskedValue(value: unknown): boolean {
  return value === "••••••••" || value === "***" || value === "********";
}

/**
 * Filter out masked values from update data — prevents overwriting real secrets with mask.
 */
export function filterMaskedValues<T extends Record<string, unknown>>(data: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!isMaskedValue(value)) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
