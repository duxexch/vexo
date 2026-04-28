/**
 * Sam9 Engagement & Difficulty Engine
 * -----------------------------------
 * Pure-function module that takes a player's profile and the bot's base
 * difficulty and returns the *engagement plan* Sam9 should apply for
 * the next move (and the next match).
 *
 * Core philosophy ("businessman who keeps customers happy"):
 *   - Newbies should win ~55–65% of the time so they fall in love
 *     with the platform and come back.
 *   - Regulars should hover around 40–50% — enough wins to feel proud,
 *     enough losses to feel challenged.
 *   - Strong / expert players should still win ~35–45% so they don't
 *     decide Sam9 is unbeatable and quit.
 *   - When recent form crashes (player lost 4+ in a row), bias the
 *     mistake rate up so they get a "redemption" win.
 *   - When recent form is too dominant (won 4+ in a row), tighten Sam9's
 *     play so the challenge stays alive.
 *   - Output is consumed by:
 *       * `adaptive-ai.ts` for difficulty + mistake bias
 *       * `sam9-banter.ts` for banter mood
 */
import type { Sam9PlayerProfile } from "./sam9-player-profile";

export type Sam9Difficulty = "easy" | "medium" | "hard" | "expert";
export type Sam9BanterMood = "warm_welcome" | "respectful" | "playful" | "encouraging" | "professional";

export interface Sam9EngagementPlan {
    /** What difficulty Sam9 will actually play at — may differ from base. */
    effectiveDifficulty: Sam9Difficulty;
    /** Multiplier on the local scorer's mistakeRate (0.5 = halve, 2.0 = double). */
    mistakeBias: number;
    /** Multiplier on Sam9's "thinking" delay — higher feels more deliberate. */
    thinkTimeMultiplier: number;
    /** Banter persona Sam9 will use during the match. */
    banterMood: Sam9BanterMood;
    /**
     * If true, Sam9 may deliberately accept a slightly worse move when the
     * player is on a long losing streak to "let them have one" — the engine
     * never throws a clear win, just narrows the gap.
     */
    allowDeliberateLoss: boolean;
    /** Human-readable reasons for the chosen plan (admin/debug surface). */
    reasons: string[];
}

const DIFFICULTY_ORDER: Sam9Difficulty[] = ["easy", "medium", "hard", "expert"];

function shiftDifficulty(level: Sam9Difficulty, delta: number): Sam9Difficulty {
    const idx = DIFFICULTY_ORDER.indexOf(level);
    if (idx < 0) return level;
    const target = Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, idx + delta));
    return DIFFICULTY_ORDER[target];
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function targetWinRateFor(profile: Sam9PlayerProfile): number {
    if (profile.isNewbie) return 0.6;
    if (profile.skillTier === "casual") return 0.5;
    if (profile.skillTier === "regular") return 0.45;
    if (profile.skillTier === "strong") return 0.4;
    return 0.35; // expert
}

function recentStreak(form: ReadonlyArray<"win" | "loss" | "draw" | "abandon">): { kind: "win" | "loss" | "none"; length: number } {
    let kind: "win" | "loss" | "none" = "none";
    let length = 0;
    // Iterate from the newest (end) backwards.
    for (let i = form.length - 1; i >= 0; i -= 1) {
        const o = form[i];
        if (o === "draw" || o === "abandon") {
            // streak breaks on draws/abandons
            break;
        }
        if (kind === "none") {
            kind = o;
            length = 1;
            continue;
        }
        if (o === kind) {
            length += 1;
        } else {
            break;
        }
    }
    return { kind, length };
}

/**
 * Compute the engagement plan. Pure & synchronous.
 *
 * @param profile The player's latest profile. If null, returns the base
 *                difficulty unchanged with neutral knobs (guests / cold start).
 * @param baseDifficulty The difficulty the session was originally configured
 *                with (admin or matchmaking).
 */
export function computeEngagementPlan(
    profile: Sam9PlayerProfile | null,
    baseDifficulty: Sam9Difficulty,
): Sam9EngagementPlan {
    if (!profile) {
        return {
            effectiveDifficulty: baseDifficulty,
            mistakeBias: 1.0,
            thinkTimeMultiplier: 1.0,
            banterMood: "professional",
            allowDeliberateLoss: false,
            reasons: ["no_profile_cold_start"],
        };
    }

    const reasons: string[] = [
        `tier=${profile.skillTier}`,
        `vsSam9Played=${profile.vsSam9.played}`,
        `recentWinRate=${profile.vsSam9.recentWinRate.toFixed(2)}`,
        `engagement=${profile.engagementScore.toFixed(0)}`,
    ];

    const target = targetWinRateFor(profile);
    const observedRecent = profile.vsSam9.recentWinRate;
    const gap = observedRecent - target; // positive = winning too much, negative = losing too much

    // Start from base difficulty.
    let effectiveDifficulty: Sam9Difficulty = baseDifficulty;
    let mistakeBias = 1.0;
    let thinkTimeMultiplier = 1.0;
    let allowDeliberateLoss = false;

    // ── Long-term skill alignment ──────────────────────────────────────
    // If base difficulty is wildly off the player's tier, shift toward it
    // so we don't fight ourselves move-to-move.
    if (profile.isNewbie && (baseDifficulty === "hard" || baseDifficulty === "expert")) {
        effectiveDifficulty = "medium";
        reasons.push("downshift_for_newbie");
    } else if (profile.skillTier === "expert" && baseDifficulty === "easy") {
        effectiveDifficulty = "medium";
        reasons.push("upshift_for_expert");
    }

    // ── Recent form correction ─────────────────────────────────────────
    const streak = recentStreak(profile.vsSam9.recentForm);

    if (streak.kind === "loss" && streak.length >= 4) {
        // Player is hurting. Save the relationship.
        effectiveDifficulty = shiftDifficulty(effectiveDifficulty, -1);
        mistakeBias = 1.6;
        allowDeliberateLoss = true;
        reasons.push(`losing_streak_${streak.length}_engagement_save`);
    } else if (streak.kind === "loss" && streak.length === 3) {
        mistakeBias = 1.3;
        reasons.push("losing_streak_3_soft_recover");
    } else if (streak.kind === "win" && streak.length >= 4) {
        // Player is dominating. Tighten the screws so it stays exciting.
        effectiveDifficulty = shiftDifficulty(effectiveDifficulty, +1);
        mistakeBias = 0.6;
        reasons.push(`winning_streak_${streak.length}_tighten`);
    } else if (streak.kind === "win" && streak.length === 3) {
        mistakeBias = 0.8;
        reasons.push("winning_streak_3_slight_tighten");
    }

    // ── Win-rate gap correction (smoother than streak) ─────────────────
    // Apply a small multiplicative tweak on top of the streak rule.
    if (Math.abs(gap) > 0.15) {
        if (gap < 0) {
            // Player losing too much overall — extra mistake bias.
            mistakeBias *= 1.2;
            reasons.push("winrate_gap_below_target");
        } else {
            mistakeBias *= 0.85;
            reasons.push("winrate_gap_above_target");
        }
    }

    // Cap the bias so it never breaks the scorer.
    mistakeBias = clamp(mistakeBias, 0.4, 2.2);

    // ── Think-time variance: more deliberate vs strong players ────────
    if (profile.skillTier === "strong" || profile.skillTier === "expert") {
        thinkTimeMultiplier = 1.15;
    } else if (profile.isNewbie) {
        // Newbies appreciate a slightly slower pace too — feels more human.
        thinkTimeMultiplier = 1.08;
    }

    // ── Banter mood ───────────────────────────────────────────────────
    let banterMood: Sam9BanterMood = "professional";
    if (profile.isNewbie) banterMood = "warm_welcome";
    else if (streak.kind === "loss" && streak.length >= 3) banterMood = "encouraging";
    else if (profile.skillTier === "expert" || profile.skillTier === "strong") banterMood = "respectful";
    else if (profile.engagementScore >= 70) banterMood = "playful";

    return {
        effectiveDifficulty,
        mistakeBias,
        thinkTimeMultiplier,
        banterMood,
        allowDeliberateLoss,
        reasons,
    };
}
