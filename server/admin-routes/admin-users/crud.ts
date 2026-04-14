import type { Express, Response } from "express";
import { storage } from "../../storage";
import { users, transactions, projectCurrencyWallets, projectCurrencyLedger, notifications, type UserRole, type UserStatus, type TransactionType, type CurrencyLedgerType } from "@shared/schema";
import { sendNotification } from "../../websocket";
import { db } from "../../db";
import { eq, desc, and } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";
import { toSafeUser, toSafeUsers } from "../../lib/safe-user";
import { sanitizePlainText } from "../../lib/input-security";

const FIAT_CREDIT_TYPES = new Set<TransactionType>(["deposit", "win", "bonus", "refund", "gift_received", "game_refund"]);
const FIAT_DEBIT_TYPES = new Set<TransactionType>(["withdrawal", "stake", "gift_sent", "platform_fee", "commission"]);

const PROJECT_CREDIT_TYPES = new Set<CurrencyLedgerType>(["conversion", "game_win", "p2p_receive", "p2p_received", "p2p_refund", "bonus", "refund", "admin_adjustment"]);
const PROJECT_DEBIT_TYPES = new Set<CurrencyLedgerType>(["game_stake", "p2p_send", "p2p_escrow"]);

function parseNumeric(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toSignedFiatAmount(type: TransactionType, amount: number, balanceBefore: number, balanceAfter: number): number {
  if (FIAT_CREDIT_TYPES.has(type)) return Math.abs(amount);
  if (FIAT_DEBIT_TYPES.has(type)) return -Math.abs(amount);

  const inferredDelta = balanceAfter - balanceBefore;
  if (Math.abs(inferredDelta) > 0) return inferredDelta;
  return amount;
}

function toSignedProjectAmount(type: CurrencyLedgerType, amount: number, balanceBefore: number, balanceAfter: number): number {
  if (PROJECT_CREDIT_TYPES.has(type)) return Math.abs(amount);
  if (PROJECT_DEBIT_TYPES.has(type)) return -Math.abs(amount);

  const inferredDelta = balanceAfter - balanceBefore;
  if (Math.abs(inferredDelta) > 0) return inferredDelta;
  return amount;
}

function safeParsedNotificationMetadata(metadata: string | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== "string") return {};
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function extractReferenceFromMetadata(metadata: Record<string, unknown>): string | null {
  const candidateKeys = ["referenceId", "reference", "transactionReference", "publicReference", "ref"];
  for (const key of candidateKeys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeUserSectionLink(link: unknown, fallback: string): string {
  if (typeof link !== "string") return fallback;
  const trimmed = link.trim();
  if (!trimmed.startsWith("/")) return fallback;
  return trimmed;
}

export function registerUserCrudRoutes(app: Express) {

  // List users with optional role/status filtering
  app.get("/api/admin/users", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { role, status, limit = "50", offset = "0" } = req.query;

      let query = db.select().from(users);
      const conditions = [];

      if (role) conditions.push(eq(users.role, role as UserRole));
      if (status) conditions.push(eq(users.status, status as UserStatus));

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const result = await query
        .orderBy(desc(users.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));

      res.json(toSafeUsers(result));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get single user with recent transactions
  app.get("/api/admin/users/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const userTransactions = await db.select()
        .from(transactions)
        .where(eq(transactions.userId, req.params.id))
        .orderBy(desc(transactions.createdAt))
        .limit(20);

      res.json({
        user: toSafeUser(user),
        transactions: userTransactions
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // User full financial and notification overview (user-scoped search)
  app.get("/api/admin/users/:id/financial-overview", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;
      const searchQuery = sanitizePlainText(String(req.query.search || "").trim(), { maxLength: 200 }).toLowerCase();
      const limit = Math.min(500, Math.max(50, Number.parseInt(String(req.query.limit || "250"), 10) || 250));

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const [wallet, userTransactions, userProjectLedger, userFinancialNotifications] = await Promise.all([
        db.select().from(projectCurrencyWallets).where(eq(projectCurrencyWallets.userId, id)).limit(1),
        db.select().from(transactions).where(eq(transactions.userId, id)).orderBy(desc(transactions.createdAt)).limit(limit),
        db.select().from(projectCurrencyLedger).where(eq(projectCurrencyLedger.userId, id)).orderBy(desc(projectCurrencyLedger.createdAt)).limit(limit),
        db.select().from(notifications)
          .where(and(eq(notifications.userId, id), eq(notifications.type, "transaction")))
          .orderBy(desc(notifications.createdAt))
          .limit(limit),
      ]);

      const fiatTimeline = userTransactions.map((tx) => {
        const amount = parseNumeric(tx.amount);
        const balanceBefore = parseNumeric(tx.balanceBefore);
        const balanceAfter = parseNumeric(tx.balanceAfter);
        const signedAmount = toSignedFiatAmount(tx.type, amount, balanceBefore, balanceAfter);
        const reference = tx.publicReference || tx.referenceId || `TXN-${tx.id.slice(0, 8).toUpperCase()}`;

        return {
          id: `fiat_${tx.id}`,
          source: "fiat" as const,
          currencyCode: String(user.balanceCurrency || "USD").toUpperCase(),
          type: tx.type,
          status: tx.status,
          signedAmount,
          absoluteAmount: Math.abs(signedAmount),
          balanceBefore,
          balanceAfter,
          reference,
          description: tx.description || tx.adminNote || "",
          link: "/transactions",
          createdAt: tx.createdAt,
          searchText: [
            reference,
            tx.referenceId || "",
            tx.publicReference || "",
            tx.type,
            tx.status,
            tx.description || "",
            tx.adminNote || "",
          ].join(" ").toLowerCase(),
        };
      });

      const projectTimeline = userProjectLedger.map((entry) => {
        const amount = parseNumeric(entry.amount);
        const balanceBefore = parseNumeric(entry.balanceBefore);
        const balanceAfter = parseNumeric(entry.balanceAfter);
        const signedAmount = toSignedProjectAmount(entry.type, amount, balanceBefore, balanceAfter);
        const reference = entry.referenceId || `PCL-${entry.id.slice(0, 8).toUpperCase()}`;

        return {
          id: `project_${entry.id}`,
          source: "project" as const,
          currencyCode: "VEX",
          type: entry.type,
          status: "completed",
          signedAmount,
          absoluteAmount: Math.abs(signedAmount),
          balanceBefore,
          balanceAfter,
          reference,
          description: entry.description || entry.referenceType || "",
          link: entry.type.startsWith("p2p") ? "/p2p" : "/wallet",
          createdAt: entry.createdAt,
          searchText: [
            reference,
            entry.referenceType || "",
            entry.type,
            entry.description || "",
          ].join(" ").toLowerCase(),
        };
      });

      const financialTimeline = [...fiatTimeline, ...projectTimeline]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .filter((item) => (searchQuery ? item.searchText.includes(searchQuery) : true));

      const transactionNotifications = userFinancialNotifications
        .map((item) => {
          const metadata = safeParsedNotificationMetadata(item.metadata);
          const reference = extractReferenceFromMetadata(metadata) || `NTX-${item.id.slice(0, 8).toUpperCase()}`;

          return {
            id: item.id,
            title: item.title,
            titleAr: item.titleAr,
            message: item.message,
            messageAr: item.messageAr,
            link: normalizeUserSectionLink(item.link, "/transactions"),
            isRead: item.isRead,
            priority: item.priority,
            reference,
            metadata,
            createdAt: item.createdAt,
            searchText: [
              reference,
              item.title || "",
              item.message || "",
              String(item.priority || ""),
            ].join(" ").toLowerCase(),
          };
        })
        .filter((item) => (searchQuery ? item.searchText.includes(searchQuery) : true));

      const fiatCredits = fiatTimeline.reduce((sum, item) => sum + (item.signedAmount > 0 ? item.signedAmount : 0), 0);
      const fiatDebits = fiatTimeline.reduce((sum, item) => sum + (item.signedAmount < 0 ? Math.abs(item.signedAmount) : 0), 0);
      const projectCredits = projectTimeline.reduce((sum, item) => sum + (item.signedAmount > 0 ? item.signedAmount : 0), 0);
      const projectDebits = projectTimeline.reduce((sum, item) => sum + (item.signedAmount < 0 ? Math.abs(item.signedAmount) : 0), 0);

      const metrics = {
        fiatBalance: parseNumeric(user.balance),
        fiatCurrencyCode: String(user.balanceCurrency || "USD").toUpperCase(),
        projectBalance: parseNumeric(wallet[0]?.totalBalance || 0),
        fiatCredits,
        fiatDebits,
        projectCredits,
        projectDebits,
        fiatNet: fiatCredits - fiatDebits,
        projectNet: projectCredits - projectDebits,
      };

      const profileIndex = [
        { key: "id", label: "User ID", value: String(user.id || "") },
        { key: "username", label: "Username", value: String(user.username || "") },
        { key: "nickname", label: "Nickname", value: String(user.nickname || "") },
        { key: "firstName", label: "First Name", value: String(user.firstName || "") },
        { key: "lastName", label: "Last Name", value: String(user.lastName || "") },
        { key: "email", label: "Email", value: String(user.email || "") },
        { key: "phone", label: "Phone", value: String(user.phone || "") },
        { key: "role", label: "Role", value: String(user.role || "") },
        { key: "status", label: "Status", value: String(user.status || "") },
        { key: "vipLevel", label: "VIP Level", value: String(user.vipLevel ?? "") },
        { key: "gamesPlayed", label: "Games Played", value: String(user.gamesPlayed ?? "") },
        { key: "gamesWon", label: "Games Won", value: String(user.gamesWon ?? "") },
        { key: "fiatBalance", label: "Real Currency Balance", value: `${metrics.fiatBalance.toFixed(2)} ${metrics.fiatCurrencyCode}` },
        { key: "totalDeposited", label: "Total Deposited", value: parseNumeric(user.totalDeposited).toFixed(2) },
        { key: "totalWithdrawn", label: "Total Withdrawn", value: parseNumeric(user.totalWithdrawn).toFixed(2) },
        { key: "totalWagered", label: "Total Wagered", value: parseNumeric(user.totalWagered).toFixed(2) },
        { key: "totalWon", label: "Total Won", value: parseNumeric(user.totalWon).toFixed(2) },
        { key: "projectBalance", label: "Project Wallet Total", value: `${metrics.projectBalance.toFixed(2)} VEX` },
        { key: "projectPurchased", label: "Project Purchased Balance", value: `${parseNumeric(wallet[0]?.purchasedBalance).toFixed(2)} VEX` },
        { key: "projectEarned", label: "Project Earned Balance", value: `${parseNumeric(wallet[0]?.earnedBalance).toFixed(2)} VEX` },
        { key: "projectLocked", label: "Project Locked Balance", value: `${parseNumeric(wallet[0]?.lockedBalance).toFixed(2)} VEX` },
        { key: "fiatNet", label: "Real Currency Net", value: `${metrics.fiatNet.toFixed(2)} ${metrics.fiatCurrencyCode}` },
        { key: "projectNet", label: "Project Currency Net", value: `${metrics.projectNet.toFixed(2)} VEX` },
        { key: "createdAt", label: "Created At", value: user.createdAt ? new Date(user.createdAt).toISOString() : "" },
        { key: "lastLoginAt", label: "Last Login At", value: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : "" },
      ]
        .filter((item) => item.value.trim().length > 0)
        .map((item) => ({ ...item, searchText: `${item.label} ${item.value}`.toLowerCase() }))
        .filter((item) => (searchQuery ? item.searchText.includes(searchQuery) : true))
        .map(({ searchText, ...item }) => item);

      res.json({
        user: toSafeUser(user),
        projectWallet: wallet[0] || null,
        metrics,
        profileIndex,
        financialTimeline,
        transactionNotifications,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update user profile fields (whitelisted)
  app.patch("/api/admin/users/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Whitelist allowed fields — prevent balance/password/role manipulation
      const adminAllowedFields = ['status', 'firstName', 'lastName', 'email', 'phone', 'avatarUrl', 'country', 'language', 'nickname'];
      const sanitize = (v: unknown) => typeof v === 'string' ? sanitizePlainText(v, { maxLength: 255 }) : v;

      const updates: Record<string, any> = {};
      for (const key of adminAllowedFields) {
        if (req.body[key] !== undefined) {
          updates[key] = sanitize(req.body[key]);
        }
      }

      // Validate status enum if provided
      if (updates.status && !['active', 'suspended', 'banned', 'inactive'].includes(updates.status)) {
        return res.status(400).json({ error: "Invalid status value" });
      }

      if (updates.status === 'active') {
        updates.accountDeletedAt = null;
        updates.accountDeletionReason = null;
        updates.accountDisabledAt = null;
        updates.accountRestoredAt = new Date();
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const existing = await storage.getUser(id);
      if (!existing) {
        return res.status(404).json({ error: "User not found" });
      }

      const updated = await storage.updateUser(id, updates);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      await logAdminAction(req.admin!.id, "user_update", "user", id, {
        previousValue: JSON.stringify({ status: existing.status }),
        newValue: JSON.stringify(updates)
      }, req);

      // Notify user if status changed
      if (updates.status && updates.status !== existing.status) {
        const statusLabels: Record<string, { en: string; ar: string }> = {
          active: { en: 'Active', ar: 'نشط' },
          suspended: { en: 'Suspended', ar: 'موقوف' },
          banned: { en: 'Banned', ar: 'محظور' },
          inactive: { en: 'Inactive', ar: 'غير نشط' },
        };
        const label = statusLabels[updates.status] || { en: updates.status, ar: updates.status };
        await sendNotification(id, {
          type: 'security',
          priority: 'high',
          title: `Account Status Updated`,
          titleAr: `تحديث حالة الحساب`,
          message: `Your account status has been changed to: ${label.en}`,
          messageAr: `تم تغيير حالة حسابك إلى: ${label.ar}`,
          link: '/settings',
        }).catch(() => { });
      }

      res.json(toSafeUser(updated));
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
