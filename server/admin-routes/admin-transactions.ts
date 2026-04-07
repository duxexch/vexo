import type { Express, Response } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { sendNotification } from "../websocket";
import {
  transactions,
  users,
  type TransactionStatus,
} from "@shared/schema";
import { sanitizeNullablePlainText } from "../lib/input-security";
import {
  type AdminRequest,
  adminAuthMiddleware,
  getErrorMessage,
  logAdminAction,
} from "./helpers";

type ProcessableStatus = "approved" | "completed" | "rejected";
type ArchiveTypeFilter = "all" | "deposit" | "withdrawal";
type ArchiveStatusFilter = "all" | "pending" | "completed" | "rejected";

type HttpError = Error & { statusCode?: number };

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

function parseApprovedAmount(rawAmount: unknown): number | undefined {
  if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === "") {
    return undefined;
  }

  const parsed = Number.parseFloat(String(rawAmount));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) {
    throw createHttpError(400, "Approved amount must be between 0.01 and 1,000,000");
  }

  return Number(parsed.toFixed(2));
}

function normalizeTypeFilter(rawValue: unknown): ArchiveTypeFilter {
  const normalized = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
  if (normalized === "deposit" || normalized === "withdrawal") {
    return normalized;
  }
  return "all";
}

function normalizeStatusFilter(rawValue: unknown): ArchiveStatusFilter {
  const normalized = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
  if (normalized === "pending" || normalized === "completed" || normalized === "rejected") {
    return normalized;
  }
  return "all";
}

function inferTypeFromSearch(searchLower: string): Exclude<ArchiveTypeFilter, "all"> | undefined {
  if (!searchLower) return undefined;

  const depositKeywords = ["deposit", "dep", "ايداع", "إيداع"];
  const withdrawalKeywords = ["withdraw", "withdrawal", "سحب"];

  if (depositKeywords.some((keyword) => searchLower.includes(keyword.toLowerCase()))) {
    return "deposit";
  }

  if (withdrawalKeywords.some((keyword) => searchLower.includes(keyword.toLowerCase()))) {
    return "withdrawal";
  }

  return undefined;
}

function inferStatusFromSearch(searchLower: string): Exclude<ArchiveStatusFilter, "all"> | undefined {
  if (!searchLower) return undefined;

  const pendingKeywords = ["pending", "wait", "waiting", "معلق", "قيد"];
  const completedKeywords = ["approved", "complete", "completed", "success", "مقبول", "تم", "موافق"];
  const rejectedKeywords = ["reject", "rejected", "declined", "مرفوض", "رفض"];

  if (pendingKeywords.some((keyword) => searchLower.includes(keyword.toLowerCase()))) {
    return "pending";
  }

  if (completedKeywords.some((keyword) => searchLower.includes(keyword.toLowerCase()))) {
    return "completed";
  }

  if (rejectedKeywords.some((keyword) => searchLower.includes(keyword.toLowerCase()))) {
    return "rejected";
  }

  return undefined;
}

function getStatusCondition(statusFilter: ArchiveStatusFilter): SQL | null {
  if (statusFilter === "pending") {
    return eq(transactions.status, "pending");
  }

  if (statusFilter === "rejected") {
    return eq(transactions.status, "rejected");
  }

  if (statusFilter === "completed") {
    return inArray(transactions.status, ["approved", "completed"] as const);
  }

  return null;
}

function buildSmartSearchCondition(search: string): SQL | null {
  if (!search) {
    return null;
  }

  const likeValue = `%${search}%`;
  return or(
    ilike(transactions.publicReference, likeValue),
    ilike(transactions.id, likeValue),
    ilike(transactions.referenceId, likeValue),
    ilike(transactions.description, likeValue),
    ilike(transactions.adminNote, likeValue),
    ilike(users.username, likeValue),
    ilike(users.nickname, likeValue),
    ilike(users.accountId, likeValue),
    sql`CAST(${transactions.amount} AS TEXT) ILIKE ${likeValue}`,
  ) ?? null;
}

export function registerAdminTransactionsRoutes(app: Express) {
  app.get("/api/admin/transactions", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const typeFilter = normalizeTypeFilter(req.query.type);
      const statusFilter = normalizeStatusFilter(req.query.status);
      const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
      const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize || "100"), 10) || 100));
      const rawSearch = typeof req.query.q === "string" ? req.query.q : "";
      const safeSearch = sanitizeNullablePlainText(rawSearch, 140)?.trim() || "";
      const safeSearchLower = safeSearch.toLowerCase();

      const inferredType = typeFilter === "all" ? inferTypeFromSearch(safeSearchLower) : undefined;
      const inferredStatus = statusFilter === "all" ? inferStatusFromSearch(safeSearchLower) : undefined;
      const effectiveTypeFilter: ArchiveTypeFilter = typeFilter === "all" ? (inferredType || "all") : typeFilter;
      const effectiveStatusFilter: ArchiveStatusFilter = statusFilter === "all" ? (inferredStatus || "all") : statusFilter;

      const scopedConditions: SQL[] = [
        inArray(transactions.type, ["deposit", "withdrawal"] as const),
      ];

      if (effectiveTypeFilter !== "all") {
        scopedConditions.push(eq(transactions.type, effectiveTypeFilter));
      }

      const searchCondition = buildSmartSearchCondition(safeSearch);
      if (searchCondition) {
        scopedConditions.push(searchCondition);
      }

      const rowConditions: SQL[] = [...scopedConditions];
      const statusCondition = getStatusCondition(effectiveStatusFilter);
      if (statusCondition) {
        rowConditions.push(statusCondition);
      }

      const whereClause = rowConditions.length > 0 ? and(...rowConditions) : undefined;
      const summaryWhereClause = scopedConditions.length > 0 ? and(...scopedConditions) : undefined;
      const offset = (page - 1) * pageSize;

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions)
        .innerJoin(users, eq(transactions.userId, users.id))
        .where(whereClause);

      const rows = await db
        .select({
          id: transactions.id,
          publicReference: transactions.publicReference,
          userId: transactions.userId,
          type: transactions.type,
          status: transactions.status,
          amount: transactions.amount,
          balanceBefore: transactions.balanceBefore,
          balanceAfter: transactions.balanceAfter,
          description: transactions.description,
          referenceId: transactions.referenceId,
          adminNote: transactions.adminNote,
          processedBy: transactions.processedBy,
          processedAt: transactions.processedAt,
          createdAt: transactions.createdAt,
          updatedAt: transactions.updatedAt,
          user: {
            id: users.id,
            username: users.username,
            nickname: users.nickname,
            accountId: users.accountId,
            balance: users.balance,
          },
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.userId, users.id))
        .where(whereClause)
        .orderBy(desc(transactions.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [summaryRow] = await db
        .select({
          pending: sql<number>`COUNT(*) FILTER (WHERE ${transactions.status} = 'pending')::int`,
          completed: sql<number>`COUNT(*) FILTER (WHERE ${transactions.status} IN ('approved', 'completed'))::int`,
          rejected: sql<number>`COUNT(*) FILTER (WHERE ${transactions.status} = 'rejected')::int`,
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.userId, users.id))
        .where(summaryWhereClause);

      res.json({
        data: rows,
        total: Number(countRow?.count || 0),
        page,
        pageSize,
        summary: {
          pending: Number(summaryRow?.pending || 0),
          completed: Number(summaryRow?.completed || 0),
          rejected: Number(summaryRow?.rejected || 0),
        },
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/transactions/pending", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const rawType = typeof req.query.type === "string" ? req.query.type.trim().toLowerCase() : "";
      if (rawType && rawType !== "deposit" && rawType !== "withdrawal") {
        return res.status(400).json({ error: "type must be one of: deposit, withdrawal" });
      }

      const conditions: SQL[] = [
        eq(transactions.status, "pending" as TransactionStatus),
        inArray(transactions.type, ["deposit", "withdrawal"] as const),
      ];

      if (rawType === "deposit" || rawType === "withdrawal") {
        conditions.push(eq(transactions.type, rawType));
      }

      const pendingTransactions = await db
        .select({
          id: transactions.id,
          publicReference: transactions.publicReference,
          userId: transactions.userId,
          type: transactions.type,
          status: transactions.status,
          amount: transactions.amount,
          balanceBefore: transactions.balanceBefore,
          balanceAfter: transactions.balanceAfter,
          description: transactions.description,
          referenceId: transactions.referenceId,
          adminNote: transactions.adminNote,
          createdAt: transactions.createdAt,
          updatedAt: transactions.updatedAt,
          user: {
            id: users.id,
            username: users.username,
            nickname: users.nickname,
            accountId: users.accountId,
            balance: users.balance,
          },
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.userId, users.id))
        .where(and(...conditions))
        .orderBy(asc(transactions.createdAt))
        .limit(300);

      res.json(pendingTransactions);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/transactions/:id/process", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      if (!req.admin?.id) {
        return res.status(401).json({ error: "Admin authentication required" });
      }

      const rawStatus = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "";
      const validStatuses: ProcessableStatus[] = ["approved", "completed", "rejected"];
      if (!validStatuses.includes(rawStatus as ProcessableStatus)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
      }

      const status = rawStatus as ProcessableStatus;
      const safeAdminNote = sanitizeNullablePlainText(req.body?.adminNote ?? req.body?.note, 500) || undefined;
      const approvedAmount = parseApprovedAmount(req.body?.approvedAmount);

      const processedResult = await db.transaction(async (tx) => {
        const [transaction] = await tx
          .select()
          .from(transactions)
          .where(eq(transactions.id, req.params.id))
          .for("update");

        if (!transaction) {
          throw createHttpError(404, "Transaction not found");
        }

        if (transaction.status !== "pending") {
          throw createHttpError(400, `Transaction already ${transaction.status}. Cannot reprocess.`);
        }

        if (transaction.type !== "deposit" && transaction.type !== "withdrawal") {
          throw createHttpError(400, "Only deposit and withdrawal transactions can be processed here");
        }

        const requestedAmount = Number.parseFloat(transaction.amount);
        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
          throw createHttpError(400, "Invalid transaction amount");
        }

        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, transaction.userId))
          .for("update");

        if (!user) {
          throw createHttpError(404, "User not found");
        }

        let userBalance = Number.parseFloat(user.balance);
        if (!Number.isFinite(userBalance)) {
          throw createHttpError(500, "User balance is invalid");
        }

        const shouldApprove = status === "approved" || status === "completed";
        const processedAmount = shouldApprove ? (approvedAmount ?? requestedAmount) : requestedAmount;

        if (shouldApprove) {
          if (transaction.type === "deposit") {
            const totalDeposited = Number.parseFloat(user.totalDeposited || "0");
            userBalance += processedAmount;

            await tx
              .update(users)
              .set({
                balance: userBalance.toFixed(2),
                totalDeposited: (totalDeposited + processedAmount).toFixed(2),
                updatedAt: new Date(),
              })
              .where(eq(users.id, transaction.userId));
          } else {
            const totalWithdrawn = Number.parseFloat(user.totalWithdrawn || "0");
            const delta = processedAmount - requestedAmount;

            if (delta > 0 && userBalance < delta) {
              throw createHttpError(400, "Insufficient user balance to increase withdrawal amount");
            }

            userBalance -= delta;

            await tx
              .update(users)
              .set({
                balance: userBalance.toFixed(2),
                totalWithdrawn: (totalWithdrawn + processedAmount).toFixed(2),
                updatedAt: new Date(),
              })
              .where(eq(users.id, transaction.userId));
          }
        } else if (status === "rejected" && transaction.type === "withdrawal") {
          userBalance += requestedAmount;

          await tx
            .update(users)
            .set({
              balance: userBalance.toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(users.id, transaction.userId));
        }

        const [updated] = await tx
          .update(transactions)
          .set({
            status: status as TransactionStatus,
            amount: shouldApprove ? processedAmount.toFixed(2) : transaction.amount,
            balanceAfter: userBalance.toFixed(2),
            adminNote: safeAdminNote,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, transaction.id))
          .returning();

        return {
          transaction: updated,
          type: transaction.type,
          userId: transaction.userId,
          processedAmount,
        };
      });

      const txType = processedResult.type === "deposit"
        ? { en: "Deposit", ar: "إيداع" }
        : { en: "Withdrawal", ar: "سحب" };

      if (status === "approved" || status === "completed") {
        await sendNotification(processedResult.userId, {
          type: "transaction",
          priority: "high",
          title: `${txType.en} Approved`,
          titleAr: `تمت الموافقة على ${txType.ar}`,
          message: `Your ${txType.en.toLowerCase()} of $${processedResult.processedAmount.toFixed(2)} has been approved successfully. Ref: ${processedResult.transaction.publicReference}`,
          messageAr: `تمت الموافقة على ${txType.ar} بقيمة $${processedResult.processedAmount.toFixed(2)} بنجاح. المرجع: ${processedResult.transaction.publicReference}`,
          link: "/transactions",
          metadata: JSON.stringify({
            transactionId: processedResult.transaction.id,
            reference: processedResult.transaction.publicReference,
            type: processedResult.type,
            amount: processedResult.transaction.amount,
          }),
        }).catch(() => { });
      } else {
        await sendNotification(processedResult.userId, {
          type: "transaction",
          priority: "high",
          title: `${txType.en} Rejected`,
          titleAr: `تم رفض ${txType.ar}`,
          message: `Your ${txType.en.toLowerCase()} of $${processedResult.processedAmount.toFixed(2)} has been rejected.${safeAdminNote ? ` Reason: ${safeAdminNote}` : ""} Ref: ${processedResult.transaction.publicReference}`,
          messageAr: `تم رفض ${txType.ar} بقيمة $${processedResult.processedAmount.toFixed(2)}.${safeAdminNote ? ` السبب: ${safeAdminNote}` : ""} المرجع: ${processedResult.transaction.publicReference}`,
          link: "/transactions",
          metadata: JSON.stringify({
            transactionId: processedResult.transaction.id,
            reference: processedResult.transaction.publicReference,
            type: processedResult.type,
            amount: processedResult.transaction.amount,
          }),
        }).catch(() => { });
      }

      await logAdminAction(
        req.admin.id,
        "settings_update",
        "transaction",
        processedResult.transaction.id,
        {
          previousValue: JSON.stringify({ status: "pending" }),
          newValue: JSON.stringify({
            status,
            amount: processedResult.transaction.amount,
            type: processedResult.type,
            publicReference: processedResult.transaction.publicReference,
          }),
          reason: safeAdminNote,
        },
        req,
      );

      res.json(processedResult.transaction);
    } catch (error: unknown) {
      const statusCode = (error as HttpError)?.statusCode;
      const safeStatusCode = statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 500;
      res.status(safeStatusCode).json({ error: getErrorMessage(error) });
    }
  });
}
