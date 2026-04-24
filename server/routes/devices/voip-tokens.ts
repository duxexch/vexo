import type { Express, Response } from "express";
import { z } from "zod";
import { authMiddleware, type AuthRequest } from "../middleware";
import {
  registerDevicePushToken,
  deactivateDevicePushToken,
} from "../../storage/notifications";
import { logger } from "../../lib/logger";

const registerSchema = z.object({
  platform: z.enum(["ios", "android"]),
  // 'voip' = Apple PushKit token (iOS only). 'apns'  = standard APNs alert
  // token (iOS). 'fcm'  = Firebase Cloud Messaging token (Android).
  kind: z.enum(["voip", "apns", "fcm"]),
  // APNs tokens are 64-char hex; FCM tokens are ~163-char base64. Allow
  // a generous max so future formats don't require redeploying.
  token: z.string().min(20).max(4096),
  bundleId: z.string().min(1).max(255).optional(),
  appVersion: z.string().min(1).max(64).optional(),
});

const unregisterSchema = z.object({
  kind: z.enum(["voip", "apns", "fcm"]),
  token: z.string().min(20).max(4096),
});

function refuseInvalidPair(platform: "ios" | "android", kind: "voip" | "apns" | "fcm"): string | null {
  if (platform === "ios" && kind === "fcm") return "iOS devices cannot register FCM tokens";
  if (platform === "android" && (kind === "voip" || kind === "apns")) return "Android devices cannot register APNs/VoIP tokens";
  return null;
}

export function registerVoipTokenRoutes(app: Express): void {
  /**
   * Capacitor builds POST here on every app launch (and whenever PushKit
   * / FCM rotate the token) so the server can wake the device with a
   * VoIP push when an inbound call arrives.
   */
  app.post("/api/devices/voip-token", authMiddleware, async (req: AuthRequest, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid registration", details: parsed.error.flatten() });
    }
    const platformKindError = refuseInvalidPair(parsed.data.platform, parsed.data.kind);
    if (platformKindError) {
      return res.status(400).json({ error: platformKindError });
    }
    try {
      await registerDevicePushToken({
        userId: req.user!.id,
        platform: parsed.data.platform,
        kind: parsed.data.kind,
        token: parsed.data.token,
        bundleId: parsed.data.bundleId ?? null,
        appVersion: parsed.data.appVersion ?? null,
      });
      res.json({ success: true });
    } catch (err) {
      logger.warn("[voip-token] register failed", { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: "Failed to register device token" });
    }
  });

  /**
   * Called on logout / sign-out from the native app to stop waking the
   * old device once a different user signs in.
   */
  app.delete("/api/devices/voip-token", authMiddleware, async (req: AuthRequest, res: Response) => {
    const parsed = unregisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid unregistration", details: parsed.error.flatten() });
    }
    try {
      const removed = await deactivateDevicePushToken(parsed.data.token, parsed.data.kind);
      res.json({ success: true, removed });
    } catch (err) {
      logger.warn("[voip-token] unregister failed", { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: "Failed to deregister device token" });
    }
  });
}
