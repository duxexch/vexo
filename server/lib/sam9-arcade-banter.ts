/**
 * Sam9 Arcade Banter
 * ------------------
 * Sam9 also reacts to results from the new HTML5 mini-games (snake,
 * stack_tower, aim_trainer, pong, air_hockey, typing_duel, bomb_pass,
 * quiz_rush, dice_battle).
 *
 * These games run inside an iframe and report a final score via the VEX
 * SDK — they don't go through the WebSocket game engine, so they don't
 * use the standard mid-game banter. Instead we expose a small one-shot
 * helper that the `/api/arcade/sessions` endpoint calls right after a
 * run finishes.
 *
 * Persona stays the same: calm, classy, never gloating, always inviting
 * the player back for another round.
 */
import { isArcadeGameKey, getArcadeGame } from "@shared/arcade-games";

export type ArcadeOutcome = "win" | "loss" | "draw";

export interface ArcadeBanterContext {
    gameKey: string;
    outcome: ArcadeOutcome;
    score: number;
    isPersonalBest: boolean;
    /** Total runs the player has completed in this game so far (incl. this one). */
    totalRuns?: number;
}

export interface ArcadeBanterLine {
    /** Stable key — for dedup if we ever wire this into sam9_banter_log. */
    key: string;
    /** Arabic-first banter text. */
    text: string;
    /** Sam9's mood for the result UI. */
    mood: "warm_welcome" | "respectful" | "playful" | "encouraging" | "professional";
}

const PERSONAL_BEST_LINES: ArcadeBanterLine[] = [
    { key: "arcade_pb_1", text: "رقم شخصي جديد! تستاهل الفخر، استمر بنفس الإيقاع.", mood: "encouraging" },
    { key: "arcade_pb_2", text: "كسرت رقمك القديم — هذا أداء بطل، تستاهل التحدي القادم.", mood: "respectful" },
    { key: "arcade_pb_3", text: "حركاتك تتحسن في كل جولة، أحترم تطورك.", mood: "professional" },
    { key: "arcade_pb_4", text: "رقم جديد كله جدارة، شرف لي أتابع تطورك.", mood: "warm_welcome" },
];

const FIRST_RUN_LINES: ArcadeBanterLine[] = [
    { key: "arcade_first_1", text: "أهلاً بك أول جولة، البداية دائماً ممتعة.", mood: "warm_welcome" },
    { key: "arcade_first_2", text: "أول محاولة وقدمت أداء محترم، الأرقام راح تكبر مع الوقت.", mood: "encouraging" },
];

const WIN_LINES: ArcadeBanterLine[] = [
    { key: "arcade_win_1", text: "جولة نظيفة، استمر بنفس التركيز.", mood: "respectful" },
    { key: "arcade_win_2", text: "أداء قوي، الأرقام في صالحك اليوم.", mood: "professional" },
    { key: "arcade_win_3", text: "قرارات سريعة وذكية، يلا نشوف الجولة الجاية.", mood: "playful" },
];

const LOSS_LINES: ArcadeBanterLine[] = [
    { key: "arcade_loss_1", text: "كنت قريب جداً، جرب مرة ثانية والنتيجة تفرق.", mood: "encouraging" },
    { key: "arcade_loss_2", text: "خسارة بكرامة لاعب محترم، الجولة الجاية لك إن شاء الله.", mood: "respectful" },
    { key: "arcade_loss_3", text: "كل لاعب كبير وقع وقام، أنا متأكد بترجع أقوى.", mood: "encouraging" },
    { key: "arcade_loss_4", text: "ركّز على الإيقاع، أنت أقرب للفوز مما تتوقع.", mood: "professional" },
];

const DRAW_LINES: ArcadeBanterLine[] = [
    { key: "arcade_draw_1", text: "جولة متوازنة، استمتعت بمتابعتك.", mood: "respectful" },
    { key: "arcade_draw_2", text: "نتيجة محترمة، نلتقي في الجولة الجاية.", mood: "warm_welcome" },
];

/**
 * Reward-aware banter pools. Sam9 reacts not only to win/loss but to
 * the *size* of the payout — jackpots get celebrated, pity refunds
 * get acknowledged with grace, and misses are softened so the player
 * doesn't tilt.
 */
const JACKPOT_LINES: ArcadeBanterLine[] = [
    { key: "arcade_jackpot_1", text: "جاكبوت! يوم استثنائي، استمتع بمكافأتك تستاهلها.", mood: "playful" },
    { key: "arcade_jackpot_2", text: "الحظ والمهارة اجتمعوا في جولة واحدة، تهانينا.", mood: "encouraging" },
    { key: "arcade_jackpot_3", text: "هذه الجائزة كبيرة، خبر سار للرصيد. شرف لي أكون شاهد.", mood: "respectful" },
];

const BIG_WIN_LINES: ArcadeBanterLine[] = [
    { key: "arcade_big_1", text: "جائزة محترمة، حركاتك أثبتت نفسها.", mood: "respectful" },
    { key: "arcade_big_2", text: "أداء يستحق المكافأة، استمر بنفس الأسلوب.", mood: "encouraging" },
    { key: "arcade_big_3", text: "الرصيد ارتفع وأنت تستحق، رمز الفائز.", mood: "professional" },
];

const MEDIUM_WIN_LINES: ArcadeBanterLine[] = [
    { key: "arcade_medium_1", text: "ربح طيب، الإيقاع في صالحك.", mood: "respectful" },
    { key: "arcade_medium_2", text: "مكافأة لطيفة، الجولة الجاية ممكن تكون أكبر.", mood: "encouraging" },
];

const SMALL_WIN_LINES: ArcadeBanterLine[] = [
    { key: "arcade_small_1", text: "ربح صغير لكنه بداية جيدة، الإيقاع يبني نفسه.", mood: "encouraging" },
    { key: "arcade_small_2", text: "نقاط فوق المراهنة، استمر.", mood: "playful" },
];

const REFUND_LINES: ArcadeBanterLine[] = [
    { key: "arcade_refund_1", text: "استرديت رهانك، خذها فرصة للمحاولة من جديد.", mood: "respectful" },
    { key: "arcade_refund_2", text: "تعادل عادل، الجولة الجاية تفرق.", mood: "encouraging" },
];

const PITY_LINES: ArcadeBanterLine[] = [
    { key: "arcade_pity_1", text: "حظك بيتغير، استرجاع للرهان وانطلاقة جديدة.", mood: "warm_welcome" },
    { key: "arcade_pity_2", text: "كل لاعب يستحق فرصة جديدة، خذها.", mood: "encouraging" },
];

const COMEBACK_LINES: ArcadeBanterLine[] = [
    { key: "arcade_comeback_1", text: "العودة بقوة، كنت أنتظر منك هذه الجولة.", mood: "encouraging" },
    { key: "arcade_comeback_2", text: "بعد كل الخسائر، مستحقها. المثابرة تكافأ.", mood: "respectful" },
];

const COOLDOWN_LINES: ArcadeBanterLine[] = [
    { key: "arcade_cool_1", text: "جولة هادية، الإيقاع المتزن أهم من السرعة.", mood: "professional" },
    { key: "arcade_cool_2", text: "ليس كل جولة فوز، لكن الانضباط يبقى.", mood: "respectful" },
];

const MISS_LINES: ArcadeBanterLine[] = [
    { key: "arcade_miss_1", text: "ما اشتغلت هذه المرة، الجولة الجاية فرصتك.", mood: "encouraging" },
    { key: "arcade_miss_2", text: "خسارة بكرامة، اللاعب الكبير يعرف يعود.", mood: "respectful" },
    { key: "arcade_miss_3", text: "حركة طيش بسيطة، بتحلها في الجولة الجاية.", mood: "playful" },
];

function pick<T>(pool: T[]): T {
    if (pool.length === 0) throw new Error("Sam9 arcade banter pool empty");
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Reward rarity emitted by `sam9-arcade-economy.ts`. Re-declared as a
 * string union here to avoid a circular import at build time.
 */
export type RewardRarityForBanter =
    | "miss"
    | "refund"
    | "small"
    | "medium"
    | "big"
    | "jackpot";
export type RewardPsychologyMode =
    | "honeymoon"
    | "comeback"
    | "pity_refund"
    | "cooldown"
    | "jackpot_surprise"
    | "neutral";

/**
 * Choose a banter line for a finished arcade run, taking the economic
 * outcome into account when available. The economic context (rarity +
 * psychology mode) wins over raw win/loss because what the player
 * actually feels is the size of the reward, not the technical "result"
 * field. Falls back to legacy win/loss/draw banter when reward info is
 * absent (e.g. older clients or future score-only modes).
 */
export function chooseArcadeBanter(ctx: ArcadeBanterContext & {
    rarity?: RewardRarityForBanter;
    psychologyMode?: RewardPsychologyMode;
}): ArcadeBanterLine {
    // 1. Prioritise reward-aware banter if the economy ran.
    if (ctx.rarity) {
        if (ctx.psychologyMode === "pity_refund") return pick(PITY_LINES);
        if (ctx.psychologyMode === "comeback" && ctx.rarity !== "miss") return pick(COMEBACK_LINES);
        if (ctx.psychologyMode === "cooldown") return pick(COOLDOWN_LINES);
        switch (ctx.rarity) {
            case "jackpot": return pick(JACKPOT_LINES);
            case "big": return pick(BIG_WIN_LINES);
            case "medium": return pick(MEDIUM_WIN_LINES);
            case "small": return pick(SMALL_WIN_LINES);
            case "refund": return pick(REFUND_LINES);
            case "miss": return pick(MISS_LINES);
        }
    }
    // 2. Fall back to PB / first-run / outcome banter.
    if (ctx.isPersonalBest && ctx.outcome !== "loss") {
        return pick(PERSONAL_BEST_LINES);
    }
    if (ctx.totalRuns !== undefined && ctx.totalRuns <= 1 && ctx.outcome !== "loss") {
        return pick(FIRST_RUN_LINES);
    }
    if (ctx.outcome === "win") return pick(WIN_LINES);
    if (ctx.outcome === "loss") return pick(LOSS_LINES);
    return pick(DRAW_LINES);
}

/**
 * Sam9 only "knows" arcade game keys that are registered in
 * `shared/arcade-games.ts`. This helper guards endpoints from accepting
 * arbitrary game types.
 */
export function sam9KnowsArcadeGame(gameKey: string): boolean {
    return isArcadeGameKey(gameKey);
}

/**
 * Human-readable game label for inclusion in match summaries / leaderboards
 * shown alongside Sam9's banter. Falls back to the raw key.
 */
export function arcadeGameLabel(gameKey: string, lang: "ar" | "en"): string {
    const meta = getArcadeGame(gameKey);
    if (!meta) return gameKey;
    return lang === "ar" ? meta.titleAr : meta.titleEn;
}
