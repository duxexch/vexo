import type { Express, Response } from "express";
import {
    blockPaymentIpManually,
    listBlockedPaymentIps,
    listPaymentIpUsage,
    normalizeIpAddress,
    unblockPaymentIpManually,
} from "../lib/payment-security";
import { emitSystemAlert } from "../lib/admin-alerts";
import {
    type AdminRequest,
    adminAuthMiddleware,
    getErrorMessage,
    logAdminAction,
} from "./helpers";

export function registerAdminPaymentSecurityRoutes(app: Express) {
    app.get("/api/admin/payment-security/blocked-ips", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
            const activeOnly = req.query.activeOnly !== "false";
            const blockedIps = await listBlockedPaymentIps(limit, activeOnly);
            return res.json(blockedIps);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/payment-security/ip-usage", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
            const windowHours = Math.min(24 * 90, Math.max(1, Number(req.query.windowHours) || 24));
            const usage = await listPaymentIpUsage(limit, windowHours);
            return res.json(usage);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/payment-security/blocked-ips/block", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            if (!req.admin?.id) {
                return res.status(401).json({ error: "Admin authentication required" });
            }

            const ipAddress = normalizeIpAddress(typeof req.body?.ipAddress === "string" ? req.body.ipAddress : "");
            const reason = typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
                ? req.body.reason.trim().slice(0, 500)
                : "Manual payment security block";

            if (!ipAddress || ipAddress === "unknown") {
                return res.status(400).json({ error: "Valid ipAddress is required" });
            }

            const blocked = await blockPaymentIpManually(ipAddress, reason, req.admin.id);

            await logAdminAction(req.admin.id, "settings_update", "payment_ip_block", blocked.ipAddress, {
                reason,
                newValue: JSON.stringify({ ipAddress: blocked.ipAddress, isActive: true }),
            }, req);

            await emitSystemAlert({
                title: "Payment IP Blocked Manually",
                titleAr: "تم حظر IP يدويًا لعمليات الدفع",
                message: `Admin blocked IP ${blocked.ipAddress} for payment operations.`,
                messageAr: `قام المشرف بحظر العنوان ${blocked.ipAddress} لعمليات الدفع.`,
                severity: "warning",
                deepLink: "/admin/payment-security",
                entityType: "payment_ip_block",
                entityId: blocked.ipAddress,
            }).catch(() => { });

            return res.json(blocked);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.post("/api/admin/payment-security/blocked-ips/:ip/unblock", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            if (!req.admin?.id) {
                return res.status(401).json({ error: "Admin authentication required" });
            }

            const ipAddress = normalizeIpAddress(decodeURIComponent(req.params.ip || ""));
            if (!ipAddress || ipAddress === "unknown") {
                return res.status(400).json({ error: "Valid IP is required" });
            }

            const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : undefined;
            const unblocked = await unblockPaymentIpManually(ipAddress, req.admin.id, reason);
            if (!unblocked) {
                return res.status(404).json({ error: "IP is not currently blocked" });
            }

            await logAdminAction(req.admin.id, "settings_update", "payment_ip_block", ipAddress, {
                reason: reason || "Manual unblock",
                newValue: JSON.stringify({ ipAddress, isActive: false }),
            }, req);

            return res.json({ success: true, ipAddress });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });
}
