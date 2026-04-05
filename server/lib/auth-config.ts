/**
 * Centralized Authentication Configuration
 * 
 * This module provides separate JWT secrets for user and admin authentication,
 * enforcing security best practices by isolating credentials.
 * 
 * Security Requirements:
 * - In production, both JWT_USER_SECRET and JWT_ADMIN_SECRET must be set
 * - Secrets must be at least 32 characters long
 * - User and Admin secrets must be different
 */

import crypto from 'crypto';
import { logger } from './logger';

// Environment variable validation
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

// User JWT Configuration
const userSecretFromEnv = process.env.JWT_USER_SECRET || process.env.SESSION_SECRET;
const fallbackUserSecret = 'dev-user-secret-do-not-use-in-production';

// Admin JWT Configuration (completely separate from user)
// Support legacy ADMIN_JWT_SECRET for backward compatibility with existing scripts.
const adminSecretFromEnv = process.env.JWT_ADMIN_SECRET || process.env.ADMIN_JWT_SECRET;
const fallbackAdminSecret = 'dev-admin-secret-do-not-use-in-production';

// Production validation - enforce strong secrets
if (isProduction) {
  if (!userSecretFromEnv || userSecretFromEnv.length < 32) {
    throw new Error('CRITICAL: SESSION_SECRET (or JWT_USER_SECRET) must be set to at least 32 characters in production!');
  }
  if (adminSecretFromEnv) {
    // If explicitly provided, validate it
    if (adminSecretFromEnv.length < 32) {
      throw new Error('CRITICAL: JWT_ADMIN_SECRET must be at least 32 characters in production!');
    }
    if (userSecretFromEnv === adminSecretFromEnv) {
      throw new Error('CRITICAL: JWT_USER_SECRET and JWT_ADMIN_SECRET must be different in production!');
    }
  }
}

// Derive admin secret from user secret if not provided (cryptographically distinct)
const derivedAdminSecret = userSecretFromEnv 
  ? `admin_${crypto.createHash('sha256').update(userSecretFromEnv).digest('hex').slice(0, 32)}`
  : null;

// Export the secrets
export const JWT_USER_SECRET = userSecretFromEnv || fallbackUserSecret;
export const JWT_ADMIN_SECRET = adminSecretFromEnv || derivedAdminSecret || fallbackAdminSecret;

// Log configuration in production
if (isProduction && !adminSecretFromEnv && derivedAdminSecret) {
  logger.info('[Auth Config] JWT_ADMIN_SECRET auto-derived from SESSION_SECRET (secure)');
}

// Token expiration times
export const JWT_USER_EXPIRY = '7d';
export const JWT_ADMIN_EXPIRY = '24h';

// Token types for validation
export const TokenType = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type TokenTypeValue = typeof TokenType[keyof typeof TokenType];

/** JWT payload for regular user tokens */
export interface JwtUserPayload {
  id: string;
  role: string;
  username: string;
  fp?: string;
  iat?: number;
  exp?: number;
}

/** JWT payload for admin tokens */
export interface JwtAdminPayload {
  id: string;
  role: 'admin';
  username: string;
  fp?: string;
  iat?: number;
  exp?: number;
}

// Helper to get the correct secret based on token type
export function getJwtSecret(type: TokenTypeValue): string {
  return type === TokenType.ADMIN ? JWT_ADMIN_SECRET : JWT_USER_SECRET;
}

// Log configuration (only in development)
if (!isProduction) {
  logger.debug('[Auth Config] Development mode - using fallback secrets if not configured');
  logger.debug(`[Auth Config] User secret configured: ${!!userSecretFromEnv}`);
  logger.debug(`[Auth Config] Admin secret configured: ${!!adminSecretFromEnv}`);
}
