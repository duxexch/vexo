export type Sam9SoloMode = "competitive" | "friendly_fixed_fee";

export interface Sam9SoloSettings {
    mode: Sam9SoloMode;
    fixedFee: number;
}

export interface Sam9OpponentContract {
    botUserId: string;
    botUsername: string;
    minBankroll: number;
    supportedChallengeGameTypes: readonly string[];
    soloModeSettingKey: string;
    soloFixedFeeSettingKey: string;
}

export interface Sam9ArcadeContract {
    entryCostVex: number;
    supportedGameKeys: readonly string[];
}

export const SAM9_OPPONENT_CONTRACT: Sam9OpponentContract = {
    botUserId: "bot-sam9",
    botUsername: "bot_sam9_challenge_ai",
    minBankroll: 1_000_000,
    supportedChallengeGameTypes: ["domino", "backgammon", "tarneeb", "baloot"],
    soloModeSettingKey: "sam9_solo_mode",
    soloFixedFeeSettingKey: "sam9_solo_fixed_fee",
};

export const SAM9_ARCADE_CONTRACT: Sam9ArcadeContract = {
    entryCostVex: 5,
    supportedGameKeys: [
        "snake",
        "stack_tower",
        "aim_trainer",
        "pong",
        "air_hockey",
        "typing_duel",
        "bomb_pass",
        "quiz_rush",
        "dice_battle",
    ],
};

export const SAM9_GAME_TYPES = new Set(SAM9_OPPONENT_CONTRACT.supportedChallengeGameTypes);

export function normalizeSam9SoloMode(value: unknown): Sam9SoloMode {
    return value === "friendly_fixed_fee" ? "friendly_fixed_fee" : "competitive";
}

export function normalizeSam9FixedFee(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return Number(parsed.toFixed(2));
}

export function isSam9ChallengeGameType(gameType: string): boolean {
    return SAM9_GAME_TYPES.has(gameType);
}

export function getSam9SoloSettingsFromRows(modeValue: unknown, fixedFeeValue: unknown): Sam9SoloSettings {
    return {
        mode: normalizeSam9SoloMode(modeValue),
        fixedFee: normalizeSam9FixedFee(fixedFeeValue),
    };
}
