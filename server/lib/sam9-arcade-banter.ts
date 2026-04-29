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

function pick<T>(pool: T[]): T {
    if (pool.length === 0) throw new Error("Sam9 arcade banter pool empty");
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Choose a banter line for a finished arcade run. Always returns a
 * non-null line so the result UI has something to show.
 */
export function chooseArcadeBanter(ctx: ArcadeBanterContext): ArcadeBanterLine {
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
