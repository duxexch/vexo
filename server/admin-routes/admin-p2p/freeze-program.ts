import type { Express, Response } from "express";
import {
  countryPaymentMethods,
  p2pFreezeProgramConfigs,
  p2pFreezeProgramMethods,
  p2pFreezeRequests,
  users,
} from "@shared/schema";
import { db } from "../../db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage, logAdminAction } from "../helpers";
import { normalizeCurrencyCode } from "../../lib/p2p-currency-controls";

const updateFreezeConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  benefitRatePercent: z.number().min(0).max(100).optional(),
  baseReductionPercent: z.number().min(0).max(100).optional(),
  maxReductionPercent: z.number().min(0).max(100).optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().nullable().optional(),
  allowedPaymentMethodIds: z.array(z.string().min(1)).max(200).optional(),
});

const freezeDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  approvedAmount: z.number().positive().optional(),
  rejectionReason: z.string().trim().max(500).optional(),
  adminNote: z.string().trim().max(1000).optional(),
});

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeMethodIds(ids: string[] | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
}

export function registerP2pFreezeProgramAdminRoutes(app: Express) {
  app.get("/api/admin/p2p/freeze-program", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [configs, paymentMethods, mappings] = await Promise.all([
        db
          .select()
          .from(p2pFreezeProgramConfigs),
        db
          .select({
            id: countryPaymentMethods.id,
            countryCode: countryPaymentMethods.countryCode,
            name: countryPaymentMethods.name,
            type: countryPaymentMethods.type,
            minAmount: countryPaymentMethods.minAmount,
            maxAmount: countryPaymentMethods.maxAmount,
            isActive: countryPaymentMethods.isActive,
            isAvailable: countryPaymentMethods.isAvailable,
          })
          .from(countryPaymentMethods)
          .where(and(eq(countryPaymentMethods.isActive, true), eq(countryPaymentMethods.isAvailable, true))),
        db
          .select({
            configId: p2pFreezeProgramMethods.configId,
            countryPaymentMethodId: p2pFreezeProgramMethods.countryPaymentMethodId,
            methodName: countryPaymentMethods.name,
            countryCode: countryPaymentMethods.countryCode,
            methodType: countryPaymentMethods.type,
          })
          .from(p2pFreezeProgramMethods)
          .innerJoin(countryPaymentMethods, eq(p2pFreezeProgramMethods.countryPaymentMethodId, countryPaymentMethods.id)),
      ]);

      const methodMap = new Map<string, Array<typeof mappings[number]>>();
      for (const mapping of mappings) {
        const existing = methodMap.get(mapping.configId) || [];
        existing.push(mapping);
        methodMap.set(mapping.configId, existing);
      }

      res.json({
        configs: configs.map((config) => ({
          ...config,
          methods: methodMap.get(config.id) || [],
        })),
        paymentMethods,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/p2p/freeze-program/configs/:currencyCode", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const parsed = updateFreezeConfigSchema.parse(req.body || {});
      const normalizedCurrency = normalizeCurrencyCode(req.params.currencyCode);

      if (!normalizedCurrency) {
        return res.status(400).json({ error: "Invalid currency code" });
      }

      const [existingConfig] = await db
        .select()
        .from(p2pFreezeProgramConfigs)
        .where(eq(p2pFreezeProgramConfigs.currencyCode, normalizedCurrency))
        .limit(1);

      const nextMinAmount = parsed.minAmount ?? toNumber(existingConfig?.minAmount, 10);
      const nextMaxAmount = parsed.maxAmount === null
        ? null
        : parsed.maxAmount ?? (existingConfig?.maxAmount ? toNumber(existingConfig.maxAmount, 0) : null);

      if (nextMaxAmount !== null && nextMaxAmount < nextMinAmount) {
        return res.status(400).json({ error: "maxAmount must be greater than or equal to minAmount" });
      }

      const [upsertedConfig] = await db
        .insert(p2pFreezeProgramConfigs)
        .values({
          currencyCode: normalizedCurrency,
          isEnabled: parsed.isEnabled ?? false,
          benefitRatePercent: (parsed.benefitRatePercent ?? 0).toFixed(3),
          baseReductionPercent: (parsed.baseReductionPercent ?? 50).toFixed(2),
          maxReductionPercent: (parsed.maxReductionPercent ?? 90).toFixed(2),
          minAmount: nextMinAmount.toFixed(8),
          maxAmount: nextMaxAmount === null ? null : nextMaxAmount.toFixed(8),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: p2pFreezeProgramConfigs.currencyCode,
          set: {
            isEnabled: parsed.isEnabled ?? existingConfig?.isEnabled ?? false,
            benefitRatePercent: (parsed.benefitRatePercent ?? toNumber(existingConfig?.benefitRatePercent, 0)).toFixed(3),
            baseReductionPercent: (parsed.baseReductionPercent ?? toNumber(existingConfig?.baseReductionPercent, 50)).toFixed(2),
            maxReductionPercent: (parsed.maxReductionPercent ?? toNumber(existingConfig?.maxReductionPercent, 90)).toFixed(2),
            minAmount: nextMinAmount.toFixed(8),
            maxAmount: nextMaxAmount === null ? null : nextMaxAmount.toFixed(8),
            updatedAt: new Date(),
          },
        })
        .returning();

      const allowedPaymentMethodIds = normalizeMethodIds(parsed.allowedPaymentMethodIds);
      if (parsed.allowedPaymentMethodIds !== undefined) {
        const validMethods = allowedPaymentMethodIds.length > 0
          ? await db
            .select({ id: countryPaymentMethods.id })
            .from(countryPaymentMethods)
            .where(and(
              inArray(countryPaymentMethods.id, allowedPaymentMethodIds),
              eq(countryPaymentMethods.isActive, true),
              eq(countryPaymentMethods.isAvailable, true),
            ))
          : [];

        const validMethodIds = validMethods.map((method) => method.id);

        await db
          .delete(p2pFreezeProgramMethods)
          .where(eq(p2pFreezeProgramMethods.configId, upsertedConfig.id));

        if (validMethodIds.length > 0) {
          await db.insert(p2pFreezeProgramMethods).values(
            validMethodIds.map((methodId) => ({
              configId: upsertedConfig.id,
              countryPaymentMethodId: methodId,
            })),
          );
        }
      }

      const mappings = await db
        .select({
          id: p2pFreezeProgramMethods.id,
          countryPaymentMethodId: p2pFreezeProgramMethods.countryPaymentMethodId,
          methodName: countryPaymentMethods.name,
          countryCode: countryPaymentMethods.countryCode,
          methodType: countryPaymentMethods.type,
        })
        .from(p2pFreezeProgramMethods)
        .innerJoin(countryPaymentMethods, eq(p2pFreezeProgramMethods.countryPaymentMethodId, countryPaymentMethods.id))
        .where(eq(p2pFreezeProgramMethods.configId, upsertedConfig.id));

      await logAdminAction(
        req.admin!.id,
        "settings_update",
        "p2p_freeze_program_config",
        upsertedConfig.id,
        {
          previousValue: existingConfig ? JSON.stringify(existingConfig) : undefined,
          newValue: JSON.stringify({ ...upsertedConfig, allowedPaymentMethodIds }),
        },
        req,
      );

      res.json({
        ...upsertedConfig,
        methods: mappings,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/p2p/freeze-program/requests", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "all";
      const baseQuery = db
        .select({
          id: p2pFreezeRequests.id,
          userId: p2pFreezeRequests.userId,
          username: users.username,
          currencyCode: p2pFreezeRequests.currencyCode,
          amount: p2pFreezeRequests.amount,
          approvedAmount: p2pFreezeRequests.approvedAmount,
          remainingAmount: p2pFreezeRequests.remainingAmount,
          benefitRatePercentSnapshot: p2pFreezeRequests.benefitRatePercentSnapshot,
          status: p2pFreezeRequests.status,
          countryPaymentMethodId: p2pFreezeRequests.countryPaymentMethodId,
          paymentMethodName: countryPaymentMethods.name,
          payerName: p2pFreezeRequests.payerName,
          paymentReference: p2pFreezeRequests.paymentReference,
          requestNote: p2pFreezeRequests.requestNote,
          adminNote: p2pFreezeRequests.adminNote,
          rejectionReason: p2pFreezeRequests.rejectionReason,
          approvedBy: p2pFreezeRequests.approvedBy,
          approvedAt: p2pFreezeRequests.approvedAt,
          rejectedAt: p2pFreezeRequests.rejectedAt,
          createdAt: p2pFreezeRequests.createdAt,
          updatedAt: p2pFreezeRequests.updatedAt,
        })
        .from(p2pFreezeRequests)
        .innerJoin(users, eq(p2pFreezeRequests.userId, users.id))
        .innerJoin(countryPaymentMethods, eq(p2pFreezeRequests.countryPaymentMethodId, countryPaymentMethods.id));

      const rows = status === "all"
        ? await baseQuery
          .orderBy(desc(p2pFreezeRequests.createdAt))
          .limit(200)
        : await baseQuery
          .where(eq(p2pFreezeRequests.status, status as "pending" | "approved" | "rejected" | "cancelled" | "exhausted"))
          .orderBy(desc(p2pFreezeRequests.createdAt))
          .limit(200);

      res.json(rows);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/p2p/freeze-program/requests/:id/decision", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const parsed = freezeDecisionSchema.parse(req.body || {});

      const [existingRequest] = await db
        .select()
        .from(p2pFreezeRequests)
        .where(eq(p2pFreezeRequests.id, req.params.id))
        .limit(1);

      if (!existingRequest) {
        return res.status(404).json({ error: "Freeze request not found" });
      }

      if (existingRequest.status !== "pending") {
        return res.status(400).json({ error: "Only pending requests can be reviewed" });
      }

      if (parsed.decision === "approve") {
        const requestedAmount = toNumber(existingRequest.amount, 0);
        const approvedAmount = parsed.approvedAmount !== undefined
          ? Math.min(parsed.approvedAmount, requestedAmount)
          : requestedAmount;

        if (approvedAmount <= 0) {
          return res.status(400).json({ error: "Approved amount must be greater than 0" });
        }

        const [updated] = await db
          .update(p2pFreezeRequests)
          .set({
            status: "approved",
            approvedAmount: approvedAmount.toFixed(8),
            remainingAmount: approvedAmount.toFixed(8),
            approvedBy: req.admin!.id,
            approvedAt: new Date(),
            adminNote: parsed.adminNote ?? existingRequest.adminNote,
            rejectionReason: null,
            rejectedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(p2pFreezeRequests.id, existingRequest.id))
          .returning();

        await logAdminAction(
          req.admin!.id,
          "settings_update",
          "p2p_freeze_request",
          existingRequest.id,
          {
            previousValue: JSON.stringify(existingRequest),
            newValue: JSON.stringify(updated),
            reason: "approve",
          },
          req,
        );

        return res.json(updated);
      }

      const rejectionReason = parsed.rejectionReason || "Rejected by admin review";
      const [updated] = await db
        .update(p2pFreezeRequests)
        .set({
          status: "rejected",
          rejectionReason,
          adminNote: parsed.adminNote ?? existingRequest.adminNote,
          rejectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(p2pFreezeRequests.id, existingRequest.id))
        .returning();

      await logAdminAction(
        req.admin!.id,
        "settings_update",
        "p2p_freeze_request",
        existingRequest.id,
        {
          previousValue: JSON.stringify(existingRequest),
          newValue: JSON.stringify(updated),
          reason: "reject",
        },
        req,
      );

      return res.json(updated);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
