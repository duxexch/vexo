import type { Express, Response } from "express";
import {
    blockPaymentIpManually,
    getPaymentIpSecurityMode,
    getPaymentIpDetails,
    getPaymentSecurityOverview,
    listBlockedPaymentIps,
    listPaymentIpUsage,
    normalizeIpAddress,
    setPaymentIpSecurityMode,
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
    app.get("/api/admin/payment-security/config", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
        try {
            const mode = await getPaymentIpSecurityMode();
            return res.json({
                mode,
                autoBlockEnabled: mode === "auto_block",
                notifyOnly: mode === "notify_only",
                allowManualBlock: true,
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.patch("/api/admin/payment-security/config", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            if (!req.admin?.id) {
                return res.status(401).json({ error: "Admin authentication required" });
            }

            const requestedMode = typeof req.body?.mode === "string" ? req.body.mode : "";
            if (requestedMode !== "auto_block" && requestedMode !== "notify_only") {
                return res.status(400).json({ error: "mode must be either auto_block or notify_only" });
            }

            const previousMode = await getPaymentIpSecurityMode();
            const updatedMode = await setPaymentIpSecurityMode(requestedMode, req.admin.id);

            await logAdminAction(req.admin.id, "settings_update", "payment_security_mode", "payment_security.ip_mode", {
                previousValue: previousMode,
                newValue: updatedMode,
            }, req);

            await emitSystemAlert({
                title: "Payment Security Mode Updated",
                titleAr: "تم تحديث وضع أمان الدفع",
                message: `Payment security mode changed to ${updatedMode}.`,
                messageAr: `تم تغيير وضع أمان الدفع إلى ${updatedMode === "auto_block" ? "الحظر التلقائي" : "تنبيه فقط"}.`,
                severity: "warning",
                deepLink: "/admin/payment-security",
                entityType: "payment_security_mode",
                entityId: "payment_security.ip_mode",
            }).catch(() => { });

            return res.json({
                mode: updatedMode,
                autoBlockEnabled: updatedMode === "auto_block",
                notifyOnly: updatedMode === "notify_only",
                allowManualBlock: true,
            });
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/payment-security/blocked-ips", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
            const activeOnly = req.query.activeOnly !== "false";
            const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

            const blockedIps = await listBlockedPaymentIps(limit, activeOnly);
            const filtered = q
                ? blockedIps.filter((row) => (
                    row.ipAddress.toLowerCase().includes(q)
                    || row.blockReason.toLowerCase().includes(q)
                ))
                : blockedIps;

            return res.json(filtered);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/payment-security/overview", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const windowHours = Math.min(24 * 90, Math.max(1, Number(req.query.windowHours) || 72));
            const overview = await getPaymentSecurityOverview(windowHours);
            return res.json(overview);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/payment-security/ip/:ip/details", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const windowHours = Math.min(24 * 90, Math.max(1, Number(req.query.windowHours) || 72));
            const recentLimit = Math.min(200, Math.max(10, Number(req.query.recentLimit) || 60));
            const ipAddress = normalizeIpAddress(decodeURIComponent(req.params.ip || ""));

            if (!ipAddress || ipAddress === "unknown") {
                return res.status(400).json({ error: "Valid IP is required" });
            }

            const details = await getPaymentIpDetails(ipAddress, windowHours, recentLimit);
            return res.json(details);
        } catch (error: unknown) {
            return res.status(500).json({ error: getErrorMessage(error) });
        }
    });

    app.get("/api/admin/payment-security/ip-usage", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
        try {
            const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
            const windowHours = Math.min(24 * 90, Math.max(1, Number(req.query.windowHours) || 24));
            const minRiskScore = Math.min(100, Math.max(0, Number(req.query.minRiskScore) || 0));
            const flaggedOnly = req.query.flaggedOnly === "true";
            const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

            const usage = await listPaymentIpUsage(limit, windowHours);

            const filtered = usage
                .filter((row) => row.riskScore >= minRiskScore)
                .filter((row) => !flaggedOnly || row.riskScore >= 35 || row.isBlocked)
                .filter((row) => !q || row.ipAddress.toLowerCase().includes(q));

            return res.json(filtered);
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
