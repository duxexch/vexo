type GenericEntity = Record<string, unknown>;

const SENSITIVE_USER_FIELDS = [
  "password",
  "twoFactorSecret",
  "withdrawalPassword",
  "chatPinHash",
  "e2eeEncryptedPrivateKey",
] as const;

export function toSafeUser<T extends GenericEntity>(user: T): T {
  const safeUser = { ...user } as GenericEntity;
  for (const field of SENSITIVE_USER_FIELDS) {
    delete safeUser[field];
  }
  return safeUser as T;
}
