import type { Express, Response } from "express";
import { storage } from "../../storage";
import { adminTokenMiddleware, AuthRequest } from "../middleware";
import { getErrorMessage } from "../helpers";

const SUPPORT_GAME_TYPE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

class SupportSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportSettingsValidationError";
  }
}

type SupportOddsMode = "automatic" | "manual";

type NormalizedSupportSettingsPayload = {
  gameType?: string;
  isEnabled: boolean;
  oddsMode: SupportOddsMode;
  defaultOddsPlayer1: string;
  defaultOddsPlayer2: string;
  minSupportAmount: string;
  maxSupportAmount: string;
  houseFeePercent: string;
  allowInstantMatch: boolean;
  instantMatchOdds: string;
  winRateWeight: string;
  experienceWeight: string;
  streakWeight: string;
};

function normalizeGameType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (!SUPPORT_GAME_TYPE_PATTERN.test(normalized)) {
    throw new SupportSettingsValidationError(
      "gameType must use lowercase letters, numbers, underscore, or hyphen",
    );
  }

  return normalized;
}

function parseBoolean(
  raw: unknown,
  field: string,
  fallback: boolean,
): boolean {
  if (raw === undefined || raw === null) {
    return fallback;
  }

  if (typeof raw === "boolean") {
    return raw;
  }

  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  throw new SupportSettingsValidationError(`${field} must be a boolean`);
}

function parseOddsMode(raw: unknown, fallback: SupportOddsMode): SupportOddsMode {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  if (raw === "automatic" || raw === "manual") {
    return raw;
  }

  throw new SupportSettingsValidationError("oddsMode must be automatic or manual");
}

function parseNumberField(
  raw: unknown,
  field: string,
  opts: { min: number; max: number; fallback: number },
): number {
  if (raw === undefined || raw === null || raw === "") {
    return opts.fallback;
  }

  const parsed = typeof raw === "number" ? raw : Number(String(raw));
  if (!Number.isFinite(parsed)) {
    throw new SupportSettingsValidationError(`${field} must be a valid number`);
  }

  if (parsed < opts.min || parsed > opts.max) {
    throw new SupportSettingsValidationError(
      `${field} must be between ${opts.min} and ${opts.max}`,
    );
  }

  return parsed;
}

function toFixedDecimal(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function parseSupportSettingsPayload(
  payload: unknown,
  opts: { requireGameType: boolean },
): NormalizedSupportSettingsPayload {
  const raw =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const gameType = normalizeGameType(raw.gameType);
  if (opts.requireGameType && !gameType) {
    throw new SupportSettingsValidationError("gameType is required");
  }

  const oddsMode = parseOddsMode(raw.oddsMode, "automatic");
  const isEnabled = parseBoolean(raw.isEnabled, "isEnabled", true);
  const allowInstantMatch = parseBoolean(
    raw.allowInstantMatch,
    "allowInstantMatch",
    true,
  );

  const minSupportAmount = parseNumberField(raw.minSupportAmount, "minSupportAmount", {
    min: 0.01,
    max: 1_000_000,
    fallback: 1,
  });
  const maxSupportAmount = parseNumberField(raw.maxSupportAmount, "maxSupportAmount", {
    min: 0.01,
    max: 1_000_000,
    fallback: 1000,
  });
  if (maxSupportAmount < minSupportAmount) {
    throw new SupportSettingsValidationError(
      "maxSupportAmount must be greater than or equal to minSupportAmount",
    );
  }

  const defaultOddsPlayer1 = parseNumberField(
    raw.defaultOddsPlayer1,
    "defaultOddsPlayer1",
    {
      min: 1.01,
      max: 100,
      fallback: 1.9,
    },
  );
  const defaultOddsPlayer2 = parseNumberField(
    raw.defaultOddsPlayer2,
    "defaultOddsPlayer2",
    {
      min: 1.01,
      max: 100,
      fallback: 1.9,
    },
  );
  const instantMatchOdds = parseNumberField(raw.instantMatchOdds, "instantMatchOdds", {
    min: 1.01,
    max: 100,
    fallback: 1.8,
  });

  const houseFeePercent = parseNumberField(raw.houseFeePercent, "houseFeePercent", {
    min: 0,
    max: 100,
    fallback: 5,
  });

  const winRateWeight = parseNumberField(raw.winRateWeight, "winRateWeight", {
    min: 0,
    max: 1,
    fallback: 0.6,
  });
  const experienceWeight = parseNumberField(
    raw.experienceWeight,
    "experienceWeight",
    {
      min: 0,
      max: 1,
      fallback: 0.25,
    },
  );
  const streakWeight = parseNumberField(raw.streakWeight, "streakWeight", {
    min: 0,
    max: 1,
    fallback: 0.15,
  });

  const weightsTotal = winRateWeight + experienceWeight + streakWeight;
  if (Math.abs(weightsTotal - 1) > 0.01) {
    throw new SupportSettingsValidationError(
      "winRateWeight + experienceWeight + streakWeight must equal 1.00",
    );
  }

  return {
    gameType,
    isEnabled,
    oddsMode,
    defaultOddsPlayer1: toFixedDecimal(defaultOddsPlayer1),
    defaultOddsPlayer2: toFixedDecimal(defaultOddsPlayer2),
    minSupportAmount: toFixedDecimal(minSupportAmount),
    maxSupportAmount: toFixedDecimal(maxSupportAmount),
    houseFeePercent: toFixedDecimal(houseFeePercent),
    allowInstantMatch,
    instantMatchOdds: toFixedDecimal(instantMatchOdds),
    winRateWeight: toFixedDecimal(winRateWeight),
    experienceWeight: toFixedDecimal(experienceWeight),
    streakWeight: toFixedDecimal(streakWeight),
  };
}

export function registerSpectatorAdminRoutes(app: Express): void {

  // Get all support settings
  app.get("/api/admin/support-settings", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getSupportSettingsList();
      res.json(settings);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get support settings by game type
  app.get("/api/admin/support-settings/:gameType", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const normalizedGameType = normalizeGameType(req.params.gameType);
      if (!normalizedGameType) {
        return res.status(400).json({ error: "gameType is required" });
      }

      const settings = await storage.findSupportSettings(normalizedGameType);
      if (!settings) {
        return res.status(404).json({ error: "Support settings not found for this game type" });
      }
      res.json(settings);
    } catch (error: unknown) {
      if (error instanceof SupportSettingsValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update support settings
  app.put("/api/admin/support-settings/:gameType", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const normalizedGameType = normalizeGameType(req.params.gameType);
      if (!normalizedGameType) {
        return res.status(400).json({ error: "gameType is required" });
      }

      const existing = await storage.findSupportSettings(normalizedGameType);
      if (!existing) {
        return res.status(404).json({ error: "Support settings not found for this game type" });
      }

      const mergedPayload = {
        ...existing,
        ...(req.body && typeof req.body === "object" ? req.body : {}),
        gameType: normalizedGameType,
      };

      const normalizedPayload = parseSupportSettingsPayload(mergedPayload, {
        requireGameType: false,
      });

      const settings = await storage.updateSupportSettings(normalizedGameType, {
        isEnabled: normalizedPayload.isEnabled,
        oddsMode: normalizedPayload.oddsMode,
        defaultOddsPlayer1: normalizedPayload.defaultOddsPlayer1,
        defaultOddsPlayer2: normalizedPayload.defaultOddsPlayer2,
        minSupportAmount: normalizedPayload.minSupportAmount,
        maxSupportAmount: normalizedPayload.maxSupportAmount,
        houseFeePercent: normalizedPayload.houseFeePercent,
        allowInstantMatch: normalizedPayload.allowInstantMatch,
        instantMatchOdds: normalizedPayload.instantMatchOdds,
        winRateWeight: normalizedPayload.winRateWeight,
        experienceWeight: normalizedPayload.experienceWeight,
        streakWeight: normalizedPayload.streakWeight,
      });

      res.json(settings);
    } catch (error: unknown) {
      if (error instanceof SupportSettingsValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Create support settings
  app.post("/api/admin/support-settings", adminTokenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const normalizedPayload = parseSupportSettingsPayload(req.body, {
        requireGameType: true,
      });

      const existing = await storage.findSupportSettings(normalizedPayload.gameType!);
      if (existing) {
        return res.status(400).json({ error: "Support settings already exist for this game type" });
      }

      const settings = await storage.createSupportSettings({
        gameType: normalizedPayload.gameType!,
        isEnabled: normalizedPayload.isEnabled,
        oddsMode: normalizedPayload.oddsMode,
        defaultOddsPlayer1: normalizedPayload.defaultOddsPlayer1,
        defaultOddsPlayer2: normalizedPayload.defaultOddsPlayer2,
        minSupportAmount: normalizedPayload.minSupportAmount,
        maxSupportAmount: normalizedPayload.maxSupportAmount,
        houseFeePercent: normalizedPayload.houseFeePercent,
        allowInstantMatch: normalizedPayload.allowInstantMatch,
        instantMatchOdds: normalizedPayload.instantMatchOdds,
        winRateWeight: normalizedPayload.winRateWeight,
        experienceWeight: normalizedPayload.experienceWeight,
        streakWeight: normalizedPayload.streakWeight,
      });

      res.status(201).json(settings);
    } catch (error: unknown) {
      if (error instanceof SupportSettingsValidationError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
}
