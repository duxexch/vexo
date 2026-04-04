import type { Express, Response } from "express";
import crypto from "crypto";
import { asc, count } from "drizzle-orm";
import { giftCatalog } from "@shared/schema";
import { db } from "../db";
import { uploadFile } from "../lib/minio-client";
import {
    type AdminRequest,
    adminAuthMiddleware,
    getErrorMessage,
    logAdminAction,
} from "./helpers";

const ALLOWED_ICON_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

const MAX_ICON_SIZE_BYTES = 3 * 1024 * 1024;

function toPositiveNumber(value: unknown): number | null {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }
    return numeric;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.floor(numeric));
}

export function registerAdminGiftsRoutes(app: Express) {
    app.get("/api/admin/gifts", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const rows = await db
                .select()
                .from(giftCatalog)
                .orderBy(asc(giftCatalog.sortOrder), asc(giftCatalog.createdAt));
            return res.json(rows);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/gifts/upload-icon", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const { data, mimeType, fileName } = req.body ?? {};

            if (!data || !mimeType || !fileName) {
                return res.status(400).json({ error: "Missing required fields: data, mimeType, fileName" });
            }

            const normalizedMimeType = String(mimeType).trim().toLowerCase();
            if (!ALLOWED_ICON_MIME_TYPES.has(normalizedMimeType)) {
                return res.status(400).json({ error: "Unsupported icon type" });
            }

            const buffer = Buffer.from(String(data), "base64");
            if (!buffer.length) {
                return res.status(400).json({ error: "Invalid icon payload" });
            }

            if (buffer.length > MAX_ICON_SIZE_BYTES) {
                return res.status(400).json({ error: "Icon file is too large (max 3MB)" });
            }

            const extMap: Record<string, string> = {
                "image/jpeg": "jpg",
                "image/png": "png",
                "image/webp": "webp",
                "image/gif": "gif",
            };
            const extension = extMap[normalizedMimeType] || "png";
            const objectName = `gifts/icons/${Date.now()}-${crypto.randomUUID()}.${extension}`;
            const iconUrl = await uploadFile(objectName, buffer, normalizedMimeType);

            if (req.admin?.id) {
                await logAdminAction(req.admin.id, "settings_update", "gift_icon_upload", objectName, {
                    newValue: JSON.stringify({ iconUrl, fileName: String(fileName).slice(0, 255) }),
                }, req);
            }

            return res.json({ iconUrl });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/gifts", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const name = String(req.body?.name ?? "").trim();
            const nameAr = String(req.body?.nameAr ?? "").trim();
            const description = String(req.body?.description ?? "").trim();
            const descriptionAr = String(req.body?.descriptionAr ?? "").trim();
            const iconUrl = String(req.body?.iconUrl ?? "").trim();
            const category = String(req.body?.category ?? "general").trim() || "general";
            const animationType = String(req.body?.animationType ?? "float").trim() || "float";
            const isActive = req.body?.isActive !== false;

            if (!name) {
                return res.status(400).json({ error: "Gift name is required" });
            }

            const price = toPositiveNumber(req.body?.price);
            if (price === null) {
                return res.status(400).json({ error: "Valid positive price is required" });
            }

            const [stats] = await db.select({ total: count() }).from(giftCatalog);
            const defaultSort = Number(stats?.total || 0) + 1;
            const sortOrder = toNonNegativeInteger(req.body?.sortOrder, defaultSort);

            const computedCoinValue = Math.max(1, Math.round(price * 10));
            const coinValue = toNonNegativeInteger(req.body?.coinValue, computedCoinValue) || computedCoinValue;

            const [created] = await db
                .insert(giftCatalog)
                .values({
                    name,
                    nameAr: nameAr || null,
                    description: description || null,
                    descriptionAr: descriptionAr || null,
                    price: price.toFixed(2),
                    iconUrl: iconUrl || null,
                    category,
                    animationType,
                    coinValue,
                    isActive,
                    sortOrder,
                })
                .returning();

            if (req.admin?.id) {
                await logAdminAction(req.admin.id, "settings_update", "gift_catalog", created.id, {
                    newValue: JSON.stringify({
                        name: created.name,
                        price: created.price,
                        iconUrl: created.iconUrl,
                        isActive: created.isActive,
                    }),
                }, req);
            }

            return res.status(201).json(created);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
