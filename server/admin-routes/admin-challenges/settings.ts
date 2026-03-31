import type { Express, Response } from "express";
import { storage } from "../../storage";
import { type AdminRequest, adminAuthMiddleware, logAdminAction, getErrorMessage } from "../helpers";

export function registerChallengeSettingsRoutes(app: Express) {

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

      const VALID_GAME_TYPES = ['chess', 'backgammon', 'domino', 'tarneeb', 'baloot'];
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
