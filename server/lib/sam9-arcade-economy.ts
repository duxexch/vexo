/**
 * Sam9 Arcade Economy Engine
 * --------------------------
 * Decides how much VEX to pay back to a player after each arcade run.
 *
 * Design philosophy ("the businessman who keeps customers happy"):
 *   - Long-term: the player loses (house keeps ~12-20% edge). The
 *     platform cannot subsidise infinite play, so the *expected* RTP
 *     hovers around 80-88%.
 *   - Short-term: the player MUST keep enjoying themselves. Boredom
 *     and tilt are bigger threats than house edge. So we deliberately
 *     break flat probabilities to:
 *       * Award a "comeback" win after long losing streaks.
 *       * Inject a surprise jackpot occasionally.
 *       * Cool down a hot streak so the player doesn't snowball.
 *       * Refund near-misses when the player is almost broke (pity timer).
 *       * Front-load wins for brand-new players (first-3 honeymoon).
 *
 * Pure-function-friendly: state is collected at the route layer and
 * passed in. This module never reads the DB, so it's trivially
 * testable and admin-tunable.
 */

export const ARCADE_ENTRY_COST_VEX = 5;

export type ArcadeRewardRarity =
    | "miss"
    | "refund"
    | "small"
    | "medium"
    | "big"
    | "jackpot";

/** Reward bands. `multiplier` is applied to ARCADE_ENTRY_COST_VEX. */
const REWARD_BANDS: Record<ArcadeRewardRarity, { multiplier: number }> = {
    miss: { multiplier: 0 },     //  0 VEX out (full -5 net)
    refund: { multiplier: 1 },   //  5 VEX out (push)
    small: { multiplier: 1.6 },  //  8 VEX out (+3)
    medium: { multiplier: 3 },   // 15 VEX out (+10)
    big: { multiplier: 6 },      // 30 VEX out (+25)
    jackpot: { multiplier: 20 }, // 100 VEX out (+95)
};

/**
 * Baseline distribution targeted at ~84% RTP (16% house edge).
 *   miss 0.62, refund 0.18, small 0.12, medium 0.05, big 0.02, jackpot 0.01
 *   E[multiplier] = 0*0.62 + 1*0.18 + 1.6*0.12 + 3*0.05 + 6*0.02 + 20*0.01
 *                 = 0 + 0.18 + 0.192 + 0.15 + 0.12 + 0.20 = 0.842
 *   → 4.21 VEX paid out per 5 wagered ≈ 84.2% RTP.
 *
 * The honeymoon / pity / comeback distributions below are designed to
 * sit slightly above 100% RTP so triggered runs *feel* rewarding —
 * but they fire rarely, so blended long-run RTP stays near 84%.
 */
const BASE_DISTRIBUTION: Array<[ArcadeRewardRarity, number]> = [
    ["miss", 0.62],
    ["refund", 0.18],
    ["small", 0.12],
    ["medium", 0.05],
    ["big", 0.02],
    ["jackpot", 0.01],
];

/**
 * Explicit distributions for each psychology mode. Defined as full
 * tables (not multiplicative reweights) so EVs are auditable at a
 * glance. All weights MUST sum to 1.0.
 *
 * EVs and target RTPs:
 *   honeymoon  (E=1.15, ~115% RTP) — first 3 lifetime runs
 *   pity       (E=0.96, ~96% RTP)  — low-balance + 2+ losses
 *   comeback4  (E=0.99, ~99% RTP)  — 4-5 loss streak
 *   comeback6  (E=1.22, ~122% RTP) — 6+ loss streak (guaranteed-feel)
 *   cooldown   (E=0.52, ~52% RTP)  — hot streak / over-paying player
 */
type Dist = Array<[ArcadeRewardRarity, number]>;
const HONEYMOON_DIST: Dist = [
    ["miss", 0.40], ["refund", 0.30], ["small", 0.20], ["medium", 0.07], ["big", 0.02], ["jackpot", 0.01],
];
const PITY_DIST: Dist = [
    ["miss", 0.55], ["refund", 0.25], ["small", 0.11], ["medium", 0.05], ["big", 0.03], ["jackpot", 0.01],
];
const COMEBACK4_DIST: Dist = [
    ["miss", 0.55], ["refund", 0.22], ["small", 0.13], ["medium", 0.06], ["big", 0.03], ["jackpot", 0.01],
];
const COMEBACK6_DIST: Dist = [
    ["miss", 0.40], ["refund", 0.28], ["small", 0.20], ["medium", 0.08], ["big", 0.03], ["jackpot", 0.01],
];
const COOLDOWN_DIST: Dist = [
    ["miss", 0.75], ["refund", 0.13], ["small", 0.07], ["medium", 0.03], ["big", 0.015], ["jackpot", 0.005],
];

export interface PlayerArcadeState {
    /** Current balance in VEX (post entry-fee deduction is fine — same logic). */
    balance: number;
    /** Lifetime arcade runs across all 9 games. */
    totalRuns: number;
    /** Most recent runs (newest first), up to ~20. Used for streaks/RTP. */
    recentRuns: Array<{
        score: number;
        rewardVex: number;
        result: "win" | "loss" | "draw";
        createdAt: Date;
    }>;
    /** Total VEX wagered all-time (≈ totalRuns * ENTRY_COST). */
    lifetimeWagered: number;
    /** Total VEX won all-time. */
    lifetimeWon: number;
}

export interface RewardDecision {
    rewardVex: number;
    netVex: number;
    multiplier: number;
    rarity: ArcadeRewardRarity;
    psychologyMode:
        | "honeymoon"
        | "comeback"
        | "pity_refund"
        | "cooldown"
        | "jackpot_surprise"
        | "neutral";
    reason: string;
    /** Snapshot of the streak math used — useful for admin/debug logs. */
    debug: {
        lossStreak: number;
        winStreak: number;
        runsSinceLastWin: number;
        rollingRtp: number;
        weightedDistribution: Array<[ArcadeRewardRarity, number]>;
    };
}

/* -------------------------------------------------------------------------- */
/* Streak helpers                                                             */
/* -------------------------------------------------------------------------- */

function streakOf(
    runs: PlayerArcadeState["recentRuns"],
    predicate: (r: PlayerArcadeState["recentRuns"][number]) => boolean,
): number {
    let n = 0;
    for (const r of runs) {
        if (predicate(r)) n += 1;
        else break;
    }
    return n;
}

function rollingRtp(runs: PlayerArcadeState["recentRuns"]): number {
    if (runs.length === 0) return 1;
    const wagered = runs.length * ARCADE_ENTRY_COST_VEX;
    const won = runs.reduce((s, r) => s + (r.rewardVex || 0), 0);
    return won / Math.max(1, wagered);
}

/* -------------------------------------------------------------------------- */
/* Bias engine                                                                */
/* -------------------------------------------------------------------------- */

function pickRarity(
    distribution: Array<[ArcadeRewardRarity, number]>,
    rng: () => number,
): ArcadeRewardRarity {
    const r = rng();
    let acc = 0;
    for (const [rarity, weight] of distribution) {
        acc += weight;
        if (r <= acc) return rarity;
    }
    return distribution[distribution.length - 1]![0];
}

/** Test/admin helper: compute expected payout (in VEX) of a distribution. */
export function expectedPayoutVex(distribution: Array<[ArcadeRewardRarity, number]>): number {
    return distribution.reduce(
        (sum, [rarity, weight]) => sum + weight * REWARD_BANDS[rarity].multiplier * ARCADE_ENTRY_COST_VEX,
        0,
    );
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export interface DecideRewardOptions {
    /** Inject a custom RNG for deterministic tests. */
    rng?: () => number;
}

/**
 * The main decision function. Pure, deterministic given an RNG.
 *
 * @param state    Snapshot of the player's arcade history & balance.
 * @param score    Score reported by the game (used as a tiny soft-signal:
 *                 a score of 0 cannot win a jackpot — it'd feel rigged).
 * @param gameKey  Reserved for future per-game weighting.
 */
export function decideArcadeReward(
    state: PlayerArcadeState,
    score: number,
    gameKey: string,
    opts: DecideRewardOptions = {},
): RewardDecision {
    const rng = opts.rng ?? Math.random;
    void gameKey;

    // Streak definitions:
    //   - "win"  = the run profited the player (rewardVex > entry fee)
    //   - "loss" = the run failed to recover the entry fee (rewardVex < entry)
    //   - refunds (rewardVex === entry) are neutral and break BOTH streaks.
    const isWinRun = (r: { rewardVex: number }) => r.rewardVex > ARCADE_ENTRY_COST_VEX;
    const isLossRun = (r: { rewardVex: number }) => r.rewardVex < ARCADE_ENTRY_COST_VEX;
    const lossStreak = streakOf(state.recentRuns, isLossRun);
    const winStreak = streakOf(state.recentRuns, isWinRun);
    // "runs since last *winning* run" — refunds and misses alike count.
    const runsSinceLastWin = streakOf(state.recentRuns, (r) => !isWinRun(r));
    const rtp = rollingRtp(state.recentRuns);

    /* ---------- Rule 1: HONEYMOON for brand-new players ---------- */
    // First 3 lifetime runs: skew toward small wins so the player gets
    // hooked. EV ≈ 1.15 (115% RTP) — the platform pays a small acquisition
    // cost on these runs in exchange for retention.
    if (state.totalRuns < 3) {
        const dist = HONEYMOON_DIST;
        const rarity = pickRarity(dist, rng);
        return buildDecision({
            rarity,
            score,
            psychologyMode: "honeymoon",
            reason: `New-player honeymoon (run #${state.totalRuns + 1}).`,
            debug: { lossStreak, winStreak, runsSinceLastWin, rollingRtp: rtp, weightedDistribution: dist },
        });
    }

    /* ---------- Rule 2: PITY when nearly broke ---------- */
    // Balance below 2 entry fees + 2+ losses → soft pity (EV ≈ 0.96,
    // refund-leaning). Not a guaranteed win — that would be exploitable
    // (drain wallet → farm pity). Just enough to keep the player around.
    if (state.balance < ARCADE_ENTRY_COST_VEX * 2 && lossStreak >= 2) {
        const dist = PITY_DIST;
        const rarity = pickRarity(dist, rng);
        return buildDecision({
            rarity,
            score,
            psychologyMode: "pity_refund",
            reason: `Low balance (${state.balance.toFixed(2)} VEX) + ${lossStreak} losses — pity refund window.`,
            debug: { lossStreak, winStreak, runsSinceLastWin, rollingRtp: rtp, weightedDistribution: dist },
        });
    }

    /* ---------- Rule 3: COMEBACK after long losing streak ---------- */
    // 4-5 losses → EV ≈ 0.99 (slightly above neutral, refund-heavy).
    // 6+ losses → EV ≈ 1.22 ("comeback feel"). Note: misses are still
    // possible at all streak lengths to preserve variable-reward
    // psychology — guaranteed wins kill anticipation.
    if (lossStreak >= 6) {
        const dist = COMEBACK6_DIST;
        const rarity = pickRarity(dist, rng);
        return buildDecision({
            rarity,
            score,
            psychologyMode: "comeback",
            reason: `${lossStreak}-loss streak — strong comeback boost.`,
            debug: { lossStreak, winStreak, runsSinceLastWin, rollingRtp: rtp, weightedDistribution: dist },
        });
    }
    if (lossStreak >= 4) {
        const dist = COMEBACK4_DIST;
        const rarity = pickRarity(dist, rng);
        return buildDecision({
            rarity,
            score,
            psychologyMode: "comeback",
            reason: `${lossStreak}-loss streak — gentle comeback boost.`,
            debug: { lossStreak, winStreak, runsSinceLastWin, rollingRtp: rtp, weightedDistribution: dist },
        });
    }

    /* ---------- Rule 4: COOLDOWN after hot streaks ---------- */
    // 3+ wins in a row OR rolling RTP > 1.4 → tighten to EV ≈ 0.52.
    // Ensures the long-run RTP target holds even when the base curve
    // has been briefly generous to a streaky player.
    if (winStreak >= 3 || rtp > 1.4) {
        const dist = COOLDOWN_DIST;
        const rarity = pickRarity(dist, rng);
        return buildDecision({
            rarity,
            score,
            psychologyMode: "cooldown",
            reason: `Player hot (winStreak=${winStreak}, rtp=${rtp.toFixed(2)}) — tightening odds.`,
            debug: { lossStreak, winStreak, runsSinceLastWin, rollingRtp: rtp, weightedDistribution: dist },
        });
    }

    /* ---------- Rule 5: SURPRISE JACKPOT ---------- */
    // Once every ~80–120 runs, throw an unsolicited jackpot to make
    // the player tell their friends. Only fires if the player has
    // played enough to "earn" the surprise statistically.
    if (
        score > 0 &&
        state.totalRuns >= 25 &&
        runsSinceLastWin >= 8 &&
        rng() < 0.04
    ) {
        return buildDecision({
            rarity: "jackpot",
            score,
            psychologyMode: "jackpot_surprise",
            reason: `Surprise jackpot: ${runsSinceLastWin} runs since last win.`,
            debug: { lossStreak, winStreak, runsSinceLastWin, rollingRtp: rtp, weightedDistribution: BASE_DISTRIBUTION },
        });
    }

    /* ---------- Default: NEUTRAL house-edge distribution ---------- */
    // A score of 0 is auto-miss — refunding a player who didn't play
    // would be obvious manipulation and devalue real wins.
    if (score <= 0) {
        return buildDecision({
            rarity: "miss",
            score,
            psychologyMode: "neutral",
            reason: "Zero score — no payout.",
            debug: { lossStreak, winStreak, runsSinceLastWin, rollingRtp: rtp, weightedDistribution: BASE_DISTRIBUTION },
        });
    }
    const rarity = pickRarity(BASE_DISTRIBUTION, rng);
    return buildDecision({
        rarity,
        score,
        psychologyMode: "neutral",
        reason: "Neutral house-edge distribution.",
        debug: { lossStreak, winStreak, runsSinceLastWin, rollingRtp: rtp, weightedDistribution: BASE_DISTRIBUTION },
    });
}

function buildDecision(args: {
    rarity: ArcadeRewardRarity;
    score: number;
    psychologyMode: RewardDecision["psychologyMode"];
    reason: string;
    debug: RewardDecision["debug"];
}): RewardDecision {
    const { rarity, score, psychologyMode, reason, debug } = args;
    let band = REWARD_BANDS[rarity];

    // Defensive: a literal 0-score should never produce a payout — the
    // jackpot rule already guards this, but cover the edge case.
    if (score <= 0 && rarity !== "miss") {
        band = REWARD_BANDS["miss"];
    }

    const rewardVex = +(ARCADE_ENTRY_COST_VEX * band.multiplier).toFixed(2);
    const netVex = +(rewardVex - ARCADE_ENTRY_COST_VEX).toFixed(2);
    return {
        rewardVex,
        netVex,
        multiplier: band.multiplier,
        rarity: rewardVex === 0 ? "miss" : rarity,
        psychologyMode,
        reason,
        debug,
    };
}
