import type { Express, Response } from "express";
import { chatCallSessions, systemConfig } from "@shared/schema";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, getErrorMessage, logAdminAction } from "./helpers";

const VOICE_CALL_PRICE_KEY = "chat_voice_call_price_per_minute";
const VIDEO_CALL_PRICE_KEY = "chat_video_call_price_per_minute";

function normalizePrice(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) {
    return null;
  }
  return Number(parsed.toFixed(2));
}

async function getConfigPrice(key: string, fallback: number): Promise<number> {
  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key)).limit(1);
  return Number(config?.value || fallback);
}

export function registerAdminChatCallRoutes(app: Express) {
  const getStatsPayload = async () => {
    const [voicePricePerMinute, videoPricePerMinute] = await Promise.all([
      getConfigPrice(VOICE_CALL_PRICE_KEY, 15),
      getConfigPrice(VIDEO_CALL_PRICE_KEY, 25),
    ]);

    const aggregates = await db.execute(sql`
      SELECT
        call_type,
        COALESCE(SUM(billed_minutes), 0)::int AS total_minutes,
        COALESCE(SUM(CAST(total_charged AS DECIMAL)), 0) AS total_revenue
      FROM chat_call_sessions
      WHERE status = 'ended'
      GROUP BY call_type
    `);

    const activeCallsResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM chat_call_sessions
      WHERE status = 'active'
    `);

    const latestSessions = await db.execute(sql`
      SELECT
        ccs.id,
        ccs.call_type,
        ccs.status,
        ccs.started_at,
        ccs.ended_at,
        ccs.billed_minutes,
        ccs.total_charged,
        caller.username AS caller_username,
        receiver.username AS receiver_username
      FROM chat_call_sessions ccs
      INNER JOIN users caller ON caller.id = ccs.caller_id
      INNER JOIN users receiver ON receiver.id = ccs.receiver_id
      ORDER BY ccs.started_at DESC
      LIMIT 30
    `);

    const rowByType = new Map<string, { total_minutes: number; total_revenue: string }>();
    for (const row of aggregates.rows as Array<{ call_type: string; total_minutes: number; total_revenue: string }>) {
      rowByType.set(row.call_type, row);
    }

    const voiceRow = rowByType.get("voice");
    const videoRow = rowByType.get("video");

    return {
      voicePricePerMinute,
      videoPricePerMinute,
      activeCalls: Number((activeCallsResult.rows[0] as Record<string, unknown>)?.count || 0),
      totals: {
        voiceMinutes: Number(voiceRow?.total_minutes || 0),
        videoMinutes: Number(videoRow?.total_minutes || 0),
        voiceRevenue: Number(voiceRow?.total_revenue || 0),
        videoRevenue: Number(videoRow?.total_revenue || 0),
        totalRevenue: Number(voiceRow?.total_revenue || 0) + Number(videoRow?.total_revenue || 0),
      },
      sessions: latestSessions.rows,
    };
  };

  app.get("/api/admin/chat-calls/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      res.json(await getStatsPayload());
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/chat/calls/stats", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      res.json(await getStatsPayload());
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  const updatePricing = async (req: AdminRequest, res: Response) => {
    try {
      const voicePrice = normalizePrice(req.body?.voicePricePerMinute);
      const videoPrice = normalizePrice(req.body?.videoPricePerMinute);

      const hasVoiceInput = req.body?.voicePricePerMinute !== undefined;
      const hasVideoInput = req.body?.videoPricePerMinute !== undefined;

      if (!hasVoiceInput && !hasVideoInput) {
        return res.status(400).json({ error: "Provide at least one price field" });
      }

      if ((hasVoiceInput && voicePrice === null) || (hasVideoInput && videoPrice === null)) {
        return res.status(400).json({ error: "Invalid price value" });
      }

      const updates: Array<{ key: string; value: number }> = [];
      if (hasVoiceInput && voicePrice !== null) {
        updates.push({ key: VOICE_CALL_PRICE_KEY, value: voicePrice });
      }
      if (hasVideoInput && videoPrice !== null) {
        updates.push({ key: VIDEO_CALL_PRICE_KEY, value: videoPrice });
      }

      for (const update of updates) {
        await db.insert(systemConfig).values({
          key: update.key,
          value: String(update.value),
          updatedBy: req.admin!.id,
        }).onConflictDoUpdate({
          target: systemConfig.key,
          set: {
            value: String(update.value),
            updatedBy: req.admin!.id,
            updatedAt: new Date(),
          },
        });
      }

      await logAdminAction(
        req.admin!.id,
        "update",
        "chat_call_pricing",
        "chat_call_pricing",
        {
          metadata: JSON.stringify({
            voicePricePerMinute: hasVoiceInput ? voicePrice : undefined,
            videoPricePerMinute: hasVideoInput ? videoPrice : undefined,
          }),
        },
        req,
      );

      const [currentVoice, currentVideo] = await Promise.all([
        getConfigPrice(VOICE_CALL_PRICE_KEY, 15),
        getConfigPrice(VIDEO_CALL_PRICE_KEY, 25),
      ]);

      res.json({
        success: true,
        voicePricePerMinute: currentVoice,
        videoPricePerMinute: currentVideo,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  app.put("/api/admin/chat-calls/pricing", adminAuthMiddleware, updatePricing);
  app.put("/api/admin/chat/calls/pricing", adminAuthMiddleware, updatePricing);
}
