import { storage } from "../storage";
import { users } from "@shared/schema";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

export function runAdminBootstrap(): void {
  (async () => {
    try {
      // Check if admin password reset is requested via environment variable
      const resetPassword = process.env.ADMIN_RESET_PASSWORD;
      const resetUsername = process.env.ADMIN_RESET_USERNAME || "admin";
      if (resetPassword && resetPassword.length >= 8) {
        const existingAdmin = await db.select().from(users)
          .where(and(eq(users.username, resetUsername), eq(users.role, "admin")))
          .limit(1);
        if (existingAdmin.length > 0) {
          const currentHash = existingAdmin[0].password;
          const alreadyApplied = currentHash ? await bcrypt.compare(resetPassword, currentHash) : false;

          if (alreadyApplied) {
            logger.warn('ADMIN_RESET_PASSWORD already applied — remove it from secrets');
          } else {
            const hashedPassword = await bcrypt.hash(resetPassword, 12);
            const resetEmail = process.env.ADMIN_RESET_EMAIL?.trim();
            const updatePayload: Partial<typeof users.$inferInsert> = { password: hashedPassword };

            if (resetEmail) {
              const emailOwner = await db
                .select({ id: users.id, username: users.username })
                .from(users)
                .where(eq(users.email, resetEmail))
                .limit(1);

              if (emailOwner.length === 0 || emailOwner[0].id === existingAdmin[0].id) {
                updatePayload.email = resetEmail;
              } else {
                logger.warn(`ADMIN_RESET_EMAIL ignored because it's already used by username: ${emailOwner[0].username}`);
              }
            }

            await db.update(users)
              .set(updatePayload)
              .where(and(eq(users.username, resetUsername), eq(users.role, "admin")));
            logger.security('Admin password reset via env var', {
              action: 'env_password_reset',
              userId: resetUsername,
              result: 'allowed',
              reason: 'Password updated. Remove ADMIN_RESET_PASSWORD from secrets NOW.',
            });
          }
        } else {
          const allAdmins = await db.select({ username: users.username }).from(users).where(eq(users.role, "admin"));
          if (allAdmins.length > 0) {
            logger.warn(`ADMIN_RESET_PASSWORD set but no admin found with username: ${resetUsername}`);
            logger.info(`Available admin usernames: ${allAdmins.map(a => a.username).join(', ')}. Set ADMIN_RESET_USERNAME accordingly.`);
          } else {
            const hashedPassword = await bcrypt.hash(resetPassword, 12);
            await storage.createUser({
              username: resetUsername,
              password: hashedPassword,
              email: process.env.ADMIN_RESET_EMAIL || "admin@vex.local",
              firstName: "Admin",
              lastName: "User",
              role: "admin",
              status: "active",
              accountId: "100000000",
              mustChangePassword: false,
            });
            logger.security('Admin user created via env var', {
              action: 'env_admin_create',
              userId: resetUsername,
              result: 'allowed',
              reason: 'New admin created. Remove ADMIN_RESET_PASSWORD from secrets NOW.',
            });
          }
        }
      }

      // Check if any admin exists
      const existingAdmins = await db.select().from(users).where(eq(users.role, "admin")).limit(1);

      if (existingAdmins.length === 0) {
        const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
        const isDevelopment = process.env.NODE_ENV !== "production";

        if (isDevelopment) {
          const devPassword = crypto.randomBytes(16).toString("hex");
          const hashedPassword = await bcrypt.hash(devPassword, 12);
          await storage.createUser({
            username: "admin",
            password: hashedPassword,
            email: "admin@vex.local",
            firstName: "Admin",
            lastName: "User",
            role: "admin",
            status: "active",
            accountId: "100000000",
            mustChangePassword: true,
          });
          logger.security('Development admin created', {
            action: 'dev_admin_create',
            userId: 'admin',
            result: 'allowed',
            reason: `Dev admin password: ${devPassword} — CHANGE IMMEDIATELY`,
          });
        } else if (bootstrapPassword && bootstrapPassword.length >= 16) {
          const hashedPassword = await bcrypt.hash(bootstrapPassword, 12);
          await storage.createUser({
            username: "admin",
            password: hashedPassword,
            email: process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@vex.local",
            firstName: "Admin",
            lastName: "User",
            role: "admin",
            status: "active",
            accountId: "100000000",
            mustChangePassword: true,
          });
          logger.info('Admin user bootstrapped from ADMIN_BOOTSTRAP_PASSWORD — unset the env var after login');
        } else {
          logger.warn('No admin user exists. Set ADMIN_BOOTSTRAP_PASSWORD (min 16 chars) and ADMIN_BOOTSTRAP_EMAIL, then restart.');
        }
      }
    } catch (error) {
      logger.error('Failed during admin bootstrap', error instanceof Error ? error : new Error(String(error)));
    }
  })();
}
