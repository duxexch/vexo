import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { authMiddleware, type AuthRequest } from "./middleware";
import { adminAuthMiddleware, type AdminRequest, logAdminAction, getErrorMessage } from "../admin-routes/helpers";
import {
    investmentOrders,
    investmentPaymentMethods,
    investmentStocks,
    type InsertInvestmentOrder,
    type InsertInvestmentPaymentMethod,
    type InsertInvestmentStock,
    type InvestmentOrder,
    type InvestmentPaymentMethod,
    type InvestmentStock,
} from "@shared/investments";
import { users } from "@shared/schema";

function toNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeText(value: unknown, maxLength: number): string {
    return String(value ?? "").trim().slice(0, maxLength);
}

async function ensureDefaultInvestments(): Promise<void> {
    const existingStocks = await db.select({ id: investmentStocks.id }).from(investmentStocks).limit(1);
    if (existingStocks.length === 0) {
        const defaults: InsertInvestmentStock[] = [
            {
                symbol: "VIXO",
                nameEn: "VIXO Holdings",
                nameAr: "فكسو هولدنجز",
                descriptionEn: "Core company equity with platform growth exposure.",
                descriptionAr: "أسهم الشركة الأساسية مع نمو المنصة.",
                pricePerShare: "25.00",
                totalShares: 1000000,
                availableShares: 750000,
                minPurchaseShares: 10,
                maxPurchaseShares: 100000,
                isActive: true,
                isFeatured: true,
                sortOrder: 1,
                colorClass: "bg-sky-500/20 text-sky-500",
                accentColor: "#0ea5e9",
            },
            {
                symbol: "VXGROW",
                nameEn: "VEX Growth Fund",
                nameAr: "صندوق النمو",
                descriptionEn: "Expansion-focused equity tranche for strategic investors.",
                descriptionAr: "شريحة استثمارية موجهة للتوسع والاستثمار الاستراتيجي.",
                pricePerShare: "12.50",
                totalShares: 500000,
                availableShares: 320000,
                minPurchaseShares: 20,
                maxPurchaseShares: 50000,
                isActive: true,
                isFeatured: false,
                sortOrder: 2,
                colorClass: "bg-emerald-500/20 text-emerald-500",
                accentColor: "#10b981",
            },
            {
                symbol: "VXTECH",
                nameEn: "VEX Technology Reserve",
                nameAr: "احتياطي التقنية",
                descriptionEn: "Technology and product development allocation.",
                descriptionAr: "مخصص للتقنية وتطوير المنتج.",
                pricePerShare: "18.00",
                totalShares: 250000,
                availableShares: 180000,
                minPurchaseShares: 5,
                maxPurchaseShares: 25000,
                isActive: true,
                isFeatured: false,
                sortOrder: 3,
                colorClass: "bg-amber-500/20 text-amber-500",
                accentColor: "#f59e0b",
            },
        ];

        await db.insert(investmentStocks).values(defaults);
    }

    const existingPaymentMethods = await db.select({ id: investmentPaymentMethods.id }).from(investmentPaymentMethods).limit(1);
    if (existingPaymentMethods.length === 0) {
        const defaults: InsertInvestmentPaymentMethod[] = [
            {
                title: "Manual Bank Transfer",
                titleAr: "تحويل بنكي يدوي",
                type: "bank_transfer",
                accountName: "VIXO Investments",
                accountNumber: "IBAN-XXXX-XXXX-XXXX",
                details: "Send transfer proof to admin for approval.",
                instructions: "Transfer the exact amount and keep the receipt.",
                currency: "USD",
                isActive: true,
                sortOrder: 1,
            },
            {
                title: "Mobile Wallet",
                titleAr: "محفظة هاتف",
                type: "e_wallet",
                accountName: "VIXO Wallet",
                accountNumber: "01000000000",
                details: "Instant review available during business hours.",
                instructions: "Include your username in the reference note.",
                currency: "USD",
                isActive: true,
                sortOrder: 2,
            },
        ];

        await db.insert(investmentPaymentMethods).values(defaults);
    }
}

function serializeStock(stock: InvestmentStock) {
    return {
        ...stock,
        totalShares: Number(stock.totalShares || 0),
        availableShares: Number(stock.availableShares || 0),
        minPurchaseShares: Number(stock.minPurchaseShares || 0),
        maxPurchaseShares: Number(stock.maxPurchaseShares || 0),
        pricePerShare: String(stock.pricePerShare || "0"),
        pricePerShareNumber: toNumber(stock.pricePerShare),
    };
}

function serializePaymentMethod(method: InvestmentPaymentMethod) {
    return {
        ...method,
        currency: String(method.currency || "USD"),
    };
}

function serializeOrder(order: InvestmentOrder) {
    return {
        ...order,
        shares: Number(order.shares || 0),
        pricePerShare: String(order.pricePerShare || "0"),
        totalAmount: String(order.totalAmount || "0"),
    };
}

export function registerInvestmentRoutes(app: Express): void {
    void ensureDefaultInvestments().catch(() => { });

    app.get("/api/invest/stocks", async (_req: Request, res: Response) => {
        try {
            const rows = await db.select().from(investmentStocks).where(eq(investmentStocks.isActive, true)).orderBy(investmentStocks.sortOrder);
            res.json({ stocks: rows.map(serializeStock) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/invest/payment-methods", async (_req: Request, res: Response) => {
        try {
            const rows = await db.select().from(investmentPaymentMethods).where(eq(investmentPaymentMethods.isActive, true)).orderBy(investmentPaymentMethods.sortOrder);
            res.json({ paymentMethods: rows.map(serializePaymentMethod) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/invest/orders", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const orders = await db
                .select({
                    order: investmentOrders,
                    stock: investmentStocks,
                    paymentMethod: investmentPaymentMethods,
                    investor: users.username,
                })
                .from(investmentOrders)
                .leftJoin(investmentStocks, eq(investmentOrders.stockId, investmentStocks.id))
                .leftJoin(investmentPaymentMethods, eq(investmentOrders.paymentMethodId, investmentPaymentMethods.id))
                .leftJoin(users, eq(investmentOrders.userId, users.id))
                .where(eq(investmentOrders.userId, req.user!.id))
                .orderBy(desc(investmentOrders.createdAt));

            res.json({
                orders: orders.map((row) => ({
                    ...serializeOrder(row.order),
                    stock: row.stock ? serializeStock(row.stock) : null,
                    paymentMethod: row.paymentMethod ? serializePaymentMethod(row.paymentMethod) : null,
                    investorUsername: row.investor || req.user!.username,
                })),
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/invest/orders", authMiddleware, async (req: AuthRequest, res: Response) => {
        try {
            const stockId = normalizeText(req.body?.stockId, 64);
            const paymentMethodId = normalizeText(req.body?.paymentMethodId, 64);
            const shares = clampInteger(req.body?.shares, 1, 1_000_000, 0);
            const investorName = normalizeText(req.body?.investorName, 120);
            const investorPhone = normalizeText(req.body?.investorPhone, 40);
            const investorEmail = normalizeText(req.body?.investorEmail, 120);
            const referenceNote = normalizeText(req.body?.referenceNote, 500);
            const receiptUrl = normalizeText(req.body?.receiptUrl, 500);

            if (!stockId) return res.status(400).json({ error: "stockId is required" });
            if (shares <= 0) return res.status(400).json({ error: "shares must be greater than zero" });

            const stockRows = await db.select().from(investmentStocks).where(eq(investmentStocks.id, stockId)).limit(1);
            const stock = stockRows[0];
            if (!stock || !stock.isActive) {
                return res.status(404).json({ error: "Investment stock not found" });
            }

            const paymentRows = paymentMethodId
                ? await db.select().from(investmentPaymentMethods).where(eq(investmentPaymentMethods.id, paymentMethodId)).limit(1)
                : [];
            const paymentMethod = paymentRows[0];
            if (paymentMethodId && !paymentMethod) {
                return res.status(404).json({ error: "Payment method not found" });
            }

            const minShares = Number(stock.minPurchaseShares || 1);
            const maxShares = Number(stock.maxPurchaseShares || 1_000);
            if (shares < minShares || shares > maxShares) {
                return res.status(400).json({ error: `shares must be between ${minShares} and ${maxShares}` });
            }

            if (shares > Number(stock.availableShares || 0)) {
                return res.status(409).json({ error: "Not enough shares available" });
            }

            const pricePerShare = toNumber(stock.pricePerShare);
            const totalAmount = Number((pricePerShare * shares).toFixed(2));

            const [order] = await db.insert(investmentOrders).values({
                userId: req.user!.id,
                stockId: stock.id,
                paymentMethodId: paymentMethod?.id,
                shares,
                pricePerShare: pricePerShare.toFixed(2),
                totalAmount: totalAmount.toFixed(2),
                status: "pending",
                investorName: investorName || req.user!.username,
                investorPhone: investorPhone || null,
                investorEmail: investorEmail || null,
                referenceNote: referenceNote || null,
                receiptUrl: receiptUrl || null,
            } as InsertInvestmentOrder).returning();

            await db.update(investmentStocks)
                .set({
                    availableShares: sql`GREATEST(0, ${investmentStocks.availableShares} - ${shares})`,
                    updatedAt: new Date(),
                })
                .where(eq(investmentStocks.id, stock.id));

            res.status(201).json({
                order: serializeOrder(order),
                totalAmount: totalAmount.toFixed(2),
                stock: serializeStock(stock),
                paymentMethod: paymentMethod ? serializePaymentMethod(paymentMethod) : null,
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/invest/stocks", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const rows = await db.select().from(investmentStocks).orderBy(investmentStocks.sortOrder);
            res.json({ stocks: rows.map(serializeStock) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/invest/stocks", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const body = req.body ?? {};
            const symbol = normalizeText(body.symbol, 32).toUpperCase();
            const nameEn = normalizeText(body.nameEn, 120);
            const nameAr = normalizeText(body.nameAr, 120);
            if (!symbol || !nameEn || !nameAr) {
                return res.status(400).json({ error: "symbol, nameEn and nameAr are required" });
            }

            const [created] = await db.insert(investmentStocks).values({
                symbol,
                nameEn,
                nameAr,
                descriptionEn: normalizeText(body.descriptionEn, 500) || null,
                descriptionAr: normalizeText(body.descriptionAr, 500) || null,
                pricePerShare: Number(body.pricePerShare || 0).toFixed(2),
                totalShares: clampInteger(body.totalShares, 0, 1_000_000_000, 0),
                availableShares: clampInteger(body.availableShares, 0, 1_000_000_000, 0),
                minPurchaseShares: clampInteger(body.minPurchaseShares, 1, 1_000_000, 1),
                maxPurchaseShares: clampInteger(body.maxPurchaseShares, 1, 1_000_000, 1000),
                isActive: body.isActive !== false,
                isFeatured: body.isFeatured === true,
                sortOrder: clampInteger(body.sortOrder, 0, 10000, 0),
                colorClass: normalizeText(body.colorClass, 100) || "bg-sky-500/20 text-sky-500",
                accentColor: normalizeText(body.accentColor, 32) || "#0ea5e9",
            }).returning();

            await logAdminAction(
                req.admin!.id,
                "game_update",
                "investment_stock",
                created.id,
                {
                    newValue: JSON.stringify(created),
                    metadata: JSON.stringify({ originalAction: "investment_stock_create" }),
                },
                req,
            );

            res.status(201).json({ stock: serializeStock(created) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.patch("/api/admin/invest/stocks/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const existingRows = await db.select().from(investmentStocks).where(eq(investmentStocks.id, req.params.id)).limit(1);
            const existing = existingRows[0];
            if (!existing) return res.status(404).json({ error: "Stock not found" });

            const body = req.body ?? {};
            const updates: Partial<InsertInvestmentStock> = {};
            if (body.symbol !== undefined) updates.symbol = normalizeText(body.symbol, 32).toUpperCase();
            if (body.nameEn !== undefined) updates.nameEn = normalizeText(body.nameEn, 120);
            if (body.nameAr !== undefined) updates.nameAr = normalizeText(body.nameAr, 120);
            if (body.descriptionEn !== undefined) updates.descriptionEn = normalizeText(body.descriptionEn, 500);
            if (body.descriptionAr !== undefined) updates.descriptionAr = normalizeText(body.descriptionAr, 500);
            if (body.pricePerShare !== undefined) updates.pricePerShare = Number(body.pricePerShare || 0).toFixed(2);
            if (body.totalShares !== undefined) updates.totalShares = clampInteger(body.totalShares, 0, 1_000_000_000, Number(existing.totalShares));
            if (body.availableShares !== undefined) updates.availableShares = clampInteger(body.availableShares, 0, 1_000_000_000, Number(existing.availableShares));
            if (body.minPurchaseShares !== undefined) updates.minPurchaseShares = clampInteger(body.minPurchaseShares, 1, 1_000_000, Number(existing.minPurchaseShares));
            if (body.maxPurchaseShares !== undefined) updates.maxPurchaseShares = clampInteger(body.maxPurchaseShares, 1, 1_000_000, Number(existing.maxPurchaseShares));
            if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
            if (body.isFeatured !== undefined) updates.isFeatured = Boolean(body.isFeatured);
            if (body.sortOrder !== undefined) updates.sortOrder = clampInteger(body.sortOrder, 0, 10000, Number(existing.sortOrder));
            if (body.colorClass !== undefined) updates.colorClass = normalizeText(body.colorClass, 100);
            if (body.accentColor !== undefined) updates.accentColor = normalizeText(body.accentColor, 32);

            const [updated] = await db.update(investmentStocks)
                .set({ ...updates, updatedAt: new Date() })
                .where(eq(investmentStocks.id, req.params.id))
                .returning();

            await logAdminAction(
                req.admin!.id,
                "game_update",
                "investment_stock",
                updated.id,
                {
                    previousValue: JSON.stringify(existing),
                    newValue: JSON.stringify(updated),
                    metadata: JSON.stringify({ originalAction: "investment_stock_update" }),
                },
                req,
            );

            res.json({ stock: serializeStock(updated) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.delete("/api/admin/invest/stocks/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const [deleted] = await db.delete(investmentStocks).where(eq(investmentStocks.id, req.params.id)).returning();
            if (!deleted) return res.status(404).json({ error: "Stock not found" });
            await logAdminAction(
                req.admin!.id,
                "game_update",
                "investment_stock",
                deleted.id,
                {
                    previousValue: JSON.stringify(deleted),
                    metadata: JSON.stringify({ originalAction: "investment_stock_delete" }),
                },
                req,
            );
            res.json({ success: true });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/invest/orders", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const status = typeof req.query.status === "string" ? req.query.status : undefined;
            const conditions = [];
            if (status) conditions.push(eq(investmentOrders.status, status as never));

            const rows = await db.select({
                order: investmentOrders,
                stock: investmentStocks,
                user: users,
                paymentMethod: investmentPaymentMethods,
            })
                .from(investmentOrders)
                .leftJoin(investmentStocks, eq(investmentOrders.stockId, investmentStocks.id))
                .leftJoin(users, eq(investmentOrders.userId, users.id))
                .leftJoin(investmentPaymentMethods, eq(investmentOrders.paymentMethodId, investmentPaymentMethods.id))
                .where(conditions.length > 0 ? and(...conditions) : undefined)
                .orderBy(desc(investmentOrders.createdAt));

            res.json({
                orders: rows.map((row) => ({
                    ...serializeOrder(row.order),
                    stock: row.stock ? serializeStock(row.stock) : null,
                    user: row.user ? { id: row.user.id, username: row.user.username, email: row.user.email } : null,
                    paymentMethod: row.paymentMethod ? serializePaymentMethod(row.paymentMethod) : null,
                })),
            });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.patch("/api/admin/invest/orders/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const body = req.body ?? {};
            const status = normalizeText(body.status, 20);
            const adminNote = normalizeText(body.adminNote, 1000);
            const orderRows = await db.select().from(investmentOrders).where(eq(investmentOrders.id, req.params.id)).limit(1);
            const existing = orderRows[0];
            if (!existing) return res.status(404).json({ error: "Order not found" });

            const updates: Partial<InsertInvestmentOrder> = {};
            if (status) updates.status = status as never;
            if (adminNote) updates.adminNote = adminNote;
            updates.reviewedBy = req.admin!.id;
            updates.reviewedAt = new Date();

            if (status === "cancelled" && Number(existing.status !== "cancelled")) {
                const [stock] = await db.select().from(investmentStocks).where(eq(investmentStocks.id, existing.stockId)).limit(1);
                if (stock) {
                    await db.update(investmentStocks)
                        .set({
                            availableShares: sql`${investmentStocks.availableShares} + ${existing.shares}`,
                            updatedAt: new Date(),
                        })
                        .where(eq(investmentStocks.id, stock.id));
                }
            }

            const [updated] = await db.update(investmentOrders)
                .set({ ...updates, updatedAt: new Date() })
                .where(eq(investmentOrders.id, req.params.id))
                .returning();

            res.json({ order: serializeOrder(updated) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/invest/payment-methods", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const rows = await db.select().from(investmentPaymentMethods).orderBy(investmentPaymentMethods.sortOrder);
            res.json({ paymentMethods: rows.map(serializePaymentMethod) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/invest/payment-methods", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const body = req.body ?? {};
            const title = normalizeText(body.title, 120);
            if (!title) return res.status(400).json({ error: "title is required" });

            const [created] = await db.insert(investmentPaymentMethods).values({
                title,
                titleAr: normalizeText(body.titleAr, 120) || null,
                type: normalizeText(body.type, 30) as never,
                accountName: normalizeText(body.accountName, 120) || null,
                accountNumber: normalizeText(body.accountNumber, 120) || null,
                details: normalizeText(body.details, 500) || null,
                instructions: normalizeText(body.instructions, 1000) || null,
                currency: normalizeText(body.currency, 10) || "USD",
                isActive: body.isActive !== false,
                sortOrder: clampInteger(body.sortOrder, 0, 10000, 0),
            } satisfies InsertInvestmentPaymentMethod).returning();

            res.status(201).json({ paymentMethod: serializePaymentMethod(created) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.patch("/api/admin/invest/payment-methods/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const [existing] = await db.select().from(investmentPaymentMethods).where(eq(investmentPaymentMethods.id, req.params.id)).limit(1);
            if (!existing) return res.status(404).json({ error: "Payment method not found" });

            const body = req.body ?? {};
            const updates: Partial<InsertInvestmentPaymentMethod> = {};
            if (body.title !== undefined) updates.title = normalizeText(body.title, 120);
            if (body.titleAr !== undefined) updates.titleAr = normalizeText(body.titleAr, 120);
            if (body.type !== undefined) updates.type = normalizeText(body.type, 30) as never;
            if (body.accountName !== undefined) updates.accountName = normalizeText(body.accountName, 120);
            if (body.accountNumber !== undefined) updates.accountNumber = normalizeText(body.accountNumber, 120);
            if (body.details !== undefined) updates.details = normalizeText(body.details, 500);
            if (body.instructions !== undefined) updates.instructions = normalizeText(body.instructions, 1000);
            if (body.currency !== undefined) updates.currency = normalizeText(body.currency, 10).toUpperCase();
            if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
            if (body.sortOrder !== undefined) updates.sortOrder = clampInteger(body.sortOrder, 0, 10000, Number(existing.sortOrder));

            const [updated] = await db.update(investmentPaymentMethods)
                .set(updates)
                .where(eq(investmentPaymentMethods.id, req.params.id))
                .returning();

            res.json({ paymentMethod: serializePaymentMethod(updated) });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.delete("/api/admin/invest/payment-methods/:id", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const [deleted] = await db.delete(investmentPaymentMethods).where(eq(investmentPaymentMethods.id, req.params.id)).returning();
            if (!deleted) return res.status(404).json({ error: "Payment method not found" });
            res.json({ success: true });
        } catch (error: unknown) {
            res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
