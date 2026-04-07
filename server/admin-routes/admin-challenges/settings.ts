import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { gameplaySettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

const SAM9_SOLO_MODE_KEY = "sam9_solo_mode";
const SAM9_SOLO_FIXED_FEE_KEY = "sam9_solo_fixed_fee";

type Sam9SoloMode = "competitive" | "friendly_fixed_fee";

function normalizeSam9SoloMode(value: unknown): Sam9SoloMode {
  return value === "friendly_fixed_fee" ? "friendly_fixed_fee" : "competitive";
}

function normalizeSam9FixedFee(value: unknown): string {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("SAM9 fixed fee must be a non-negative number");
  }
  return parsed.toFixed(2);
}

export function registerChallengeSettingsRoutes(app: Express) {

  app.get("/api/admin/challenge-settings/sam9-solo", adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
    try {
      const [modeRow] = await db.select().from(gameplaySettings).where(eq(gameplaySettings.key, SAM9_SOLO_MODE_KEY)).limit(1);
      const [fixedFeeRow] = await db.select().from(gameplaySettings).where(eq(gameplaySettings.key, SAM9_SOLO_FIXED_FEE_KEY)).limit(1);

      const mode = normalizeSam9SoloMode(modeRow?.value);
      const fixedFee = normalizeSam9FixedFee(fixedFeeRow?.value ?? "0");

      res.json({
        mode,
        fixedFee,
        updatedAt: fixedFeeRow?.updatedAt || modeRow?.updatedAt || null,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/challenge-settings/sam9-solo", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const mode = normalizeSam9SoloMode(req.body?.mode);
      const fixedFee = normalizeSam9FixedFee(req.body?.fixedFee ?? "0");

      const [existingModeRow] = await db.select().from(gameplaySettings).where(eq(gameplaySettings.key, SAM9_SOLO_MODE_KEY)).limit(1);
      const [existingFeeRow] = await db.select().from(gameplaySettings).where(eq(gameplaySettings.key, SAM9_SOLO_FIXED_FEE_KEY)).limit(1);

      if (existingModeRow) {
        await db.update(gameplaySettings)
          .set({
            value: mode,
            updatedBy: req.admin!.id,
            updatedAt: new Date(),
          })
          .where(eq(gameplaySettings.key, SAM9_SOLO_MODE_KEY));
      } else {
        await db.insert(gameplaySettings).values({
          key: SAM9_SOLO_MODE_KEY,
          value: mode,
          description: "SAM9 solo mode: competitive or friendly_fixed_fee",
          descriptionAr: "نمط اللعب الفردي مع SAM9: تنافسي أو ودي برسوم ثابتة",
          updatedBy: req.admin!.id,
        });
      }

      if (existingFeeRow) {
        await db.update(gameplaySettings)
          .set({
            value: fixedFee,
            updatedBy: req.admin!.id,
            updatedAt: new Date(),
          })
          .where(eq(gameplaySettings.key, SAM9_SOLO_FIXED_FEE_KEY));
      } else {
        await db.insert(gameplaySettings).values({
          key: SAM9_SOLO_FIXED_FEE_KEY,
          value: fixedFee,
          description: "SAM9 solo fixed fee charged at challenge creation when mode=friendly_fixed_fee",
          descriptionAr: "رسوم SAM9 الثابتة التي تخصم عند إنشاء التحدي في الوضع الودي",
          updatedBy: req.admin!.id,
        });
      }

      await logAdminAction(req.admin!.id, "settings_change", "sam9_solo_mode", "sam9_solo", {
        previousValue: JSON.stringify({
          mode: normalizeSam9SoloMode(existingModeRow?.value),
          fixedFee: existingFeeRow?.value || "0",
        }),
        newValue: JSON.stringify({ mode, fixedFee }),
        reason: "Updated SAM9 solo challenge mode",
      }, req);

      res.json({ success: true, mode, fixedFee });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message.includes("non-negative number")) {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/admin/challenge-settings", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const settingsList = await storage.getChallengeSettingsList();
      res.json(settingsList);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/admin/challenge-settings/:gameType", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const settings = await storage.getChallengeSettings(req.params.gameType);
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.put("/api/admin/challenge-settings/:gameType", adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
    try {
      const { gameType } = req.params;
      const data = req.body;

      const VALID_GAME_TYPES = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot', 'languageduel'];
      if (!VALID_GAME_TYPES.includes(gameType)) {
        return res.status(400).json({ error: `Invalid game type. Must be one of: ${VALID_GAME_TYPES.join(', ')}` });
      }

      const ALLOWED_FIELDS = [
        'isEnabled', 'commissionPercent', 'allowSurrender', 'surrenderWinnerPercent',
        'surrenderLoserRefundPercent', 'withdrawPenaltyPercent', 'turnTimeoutSeconds',
        'reconnectGraceSeconds', 'challengeExpiryMinutes', 'minStake', 'maxStake',
        'allowDraw', 'maxSpectators', 'allowSpectators', 'minMovesBeforeSurrender',
        'maxConcurrentChallenges'
      ];
      const sanitizedData: Record<string, any> = {};
      for (const key of ALLOWED_FIELDS) {
        if (data[key] !== undefined) sanitizedData[key] = data[key];
      }

      if (sanitizedData.commissionPercent !== undefined) {
        const cp = parseFloat(sanitizedData.commissionPercent);
        if (isNaN(cp) || !isFinite(cp) || cp < 0 || cp > 50) {
          return res.status(400).json({ error: "Commission must be between 0% and 50%" });
        }
      }

      if (sanitizedData.surrenderWinnerPercent !== undefined || sanitizedData.surrenderLoserRefundPercent !== undefined) {
        const winnerPct = parseFloat(sanitizedData.surrenderWinnerPercent ?? '70');
        const loserPct = parseFloat(sanitizedData.surrenderLoserRefundPercent ?? '30');
        if (isNaN(winnerPct) || isNaN(loserPct) || !isFinite(winnerPct) || !isFinite(loserPct)) {
          return res.status(400).json({ error: "Surrender percentages must be valid numbers" });
        }
        if (winnerPct + loserPct > 100) {
          return res.status(400).json({ error: "Winner % + Loser % cannot exceed 100%" });
        }
        if (winnerPct < 0 || loserPct < 0) {
          return res.status(400).json({ error: "Percentages cannot be negative" });
        }
      }

      if (sanitizedData.withdrawPenaltyPercent !== undefined) {
        const wp = parseFloat(sanitizedData.withdrawPenaltyPercent);
        if (isNaN(wp) || !isFinite(wp) || wp < 0 || wp > 100) {
          return res.status(400).json({ error: "Withdraw penalty must be between 0% and 100%" });
        }
      }

      if (sanitizedData.minStake !== undefined) {
        const min = parseFloat(sanitizedData.minStake);
        if (isNaN(min) || !isFinite(min) || min < 0) {
          return res.status(400).json({ error: "Min stake must be a valid non-negative number" });
        }
      }
      if (sanitizedData.maxStake !== undefined) {
        const max = parseFloat(sanitizedData.maxStake);
        if (isNaN(max) || !isFinite(max) || max < 0) {
          return res.status(400).json({ error: "Max stake must be a valid non-negative number" });
        }
      }
      const existingSettings = await storage.getChallengeSettings(gameType);
      const finalMin = sanitizedData.minStake !== undefined ? parseFloat(sanitizedData.minStake) : parseFloat(existingSettings.minStake);
      const finalMax = sanitizedData.maxStake !== undefined ? parseFloat(sanitizedData.maxStake) : parseFloat(existingSettings.maxStake);
      if (finalMax > 0 && finalMin > finalMax) {
        return res.status(400).json({ error: "Min stake cannot exceed max stake" });
      }

      if (sanitizedData.turnTimeoutSeconds !== undefined) {
        const v = parseInt(sanitizedData.turnTimeoutSeconds);
        if (isNaN(v) || v < 10 || v > 3600) {
          return res.status(400).json({ error: "Turn timeout must be between 10 and 3600 seconds" });
        }
        sanitizedData.turnTimeoutSeconds = v;
      }
      if (sanitizedData.reconnectGraceSeconds !== undefined) {
        const v = parseInt(sanitizedData.reconnectGraceSeconds);
        if (isNaN(v) || v < 10 || v > 600) {
          return res.status(400).json({ error: "Reconnect grace must be between 10 and 600 seconds" });
        }
        sanitizedData.reconnectGraceSeconds = v;
      }
      if (sanitizedData.challengeExpiryMinutes !== undefined) {
        const v = parseInt(sanitizedData.challengeExpiryMinutes);
        if (isNaN(v) || v < 1 || v > 1440) {
          return res.status(400).json({ error: "Challenge expiry must be between 1 and 1440 minutes" });
        }
        sanitizedData.challengeExpiryMinutes = v;
      }
      if (sanitizedData.maxSpectators !== undefined) {
        const v = parseInt(sanitizedData.maxSpectators);
        if (isNaN(v) || v < 0 || v > 10000) {
          return res.status(400).json({ error: "Max spectators must be between 0 and 10000" });
        }
        sanitizedData.maxSpectators = v;
      }
      if (sanitizedData.maxConcurrentChallenges !== undefined) {
        const v = parseInt(sanitizedData.maxConcurrentChallenges);
        if (isNaN(v) || v < 1 || v > 50) {
          return res.status(400).json({ error: "Max concurrent challenges must be between 1 and 50" });
        }
        sanitizedData.maxConcurrentChallenges = v;
      }
      if (sanitizedData.minMovesBeforeSurrender !== undefined) {
        const v = parseInt(sanitizedData.minMovesBeforeSurrender);
        if (isNaN(v) || v < 0 || v > 100) {
          return res.status(400).json({ error: "Min moves before surrender must be between 0 and 100" });
        }
        sanitizedData.minMovesBeforeSurrender = v;
      }

      const updated = await storage.upsertChallengeSettings(gameType, sanitizedData);

      await logAdminAction(req.admin!.id, "settings_change", "challenge_settings", gameType, {
        previousValue: JSON.stringify(existingSettings),
        newValue: JSON.stringify(updated),
        reason: `Updated challenge settings for ${gameType}`,
      }, req);

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
