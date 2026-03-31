import { users } from "@shared/schema";

/** Type for updateUser partial data — includes all user table columns */
export type UpdateUserData = Partial<typeof users.$inferInsert>;

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
