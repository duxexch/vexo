/**
 * Sam9 In-Game Banter ("Businessman" Persona)
 * --------------------------------------------
 * Calm, classy, never gloating. Sam9 is the kind of opponent who shakes
 * your hand whether you win or lose — keeps the customer wanting to come
 * back to the platform.
 *
 * Cadence rules (enforced by the call site):
 *   - At most 1 message per ~5 moves during a match.
 *   - Hard daily cap of ~4 in-game lines per session per player.
 *   - End-of-match line is exempt from cadence (always allowed).
 *   - Dedup by phraseKey via `sam9_banter_log`.
 *
 * All copy is Arabic-first and matches the user's communication preference.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { sam9BanterLog } from "@shared/schema";
import { logger } from "./logger";
import type { Sam9BanterMood } from "./sam9-engagement";

export type Sam9BanterTrigger =
    | "opening"
    | "good_player_move"
    | "good_own_move"
    | "losing"
    | "winning"
    | "on_player_win"
    | "on_player_loss"
    | "on_draw";

interface BanterPhrase {
    key: string;
    text: string;
    moods: Sam9BanterMood[];
}

const PHRASES: Record<Sam9BanterTrigger, BanterPhrase[]> = {
    opening: [
        { key: "open_warm_1", text: "أهلاً بك في الجولة، خلينا نلعب لعبة جميلة.", moods: ["warm_welcome", "playful"] },
        { key: "open_warm_2", text: "يلا نبدأ، الحظ والذكاء معاك إن شاء الله.", moods: ["warm_welcome"] },
        { key: "open_respect_1", text: "تشرفت بمواجهتك، يلا نشوف فنون اليوم.", moods: ["respectful", "professional"] },
        { key: "open_respect_2", text: "جولة جديدة، نية صافية وضربات نظيفة.", moods: ["respectful"] },
        { key: "open_playful_1", text: "متحمس للجولة، خلينا نشوف من يبتسم آخر اللعبة.", moods: ["playful"] },
        { key: "open_pro_1", text: "بسم الله نبدأ، نتمنى لك جولة موفقة.", moods: ["professional", "warm_welcome"] },
    ],
    good_player_move: [
        { key: "praise_player_1", text: "حركة ذكية، حسبتها صح.", moods: ["respectful", "playful", "professional"] },
        { key: "praise_player_2", text: "أحسنت، نقلة محترفة.", moods: ["respectful", "warm_welcome"] },
        { key: "praise_player_3", text: "تمام، خليتني أعيد حساباتي.", moods: ["playful", "respectful"] },
        { key: "praise_player_4", text: "شغل نظيف، استمر بنفس الإيقاع.", moods: ["encouraging", "warm_welcome"] },
        { key: "praise_player_5", text: "نقلة قوية، الجولة تشتعل.", moods: ["playful", "respectful"] },
    ],
    good_own_move: [
        // Never gloating — mention the move modestly, never insulting the player.
        { key: "own_humble_1", text: "هذي محسوبة بدقة، الحمد لله.", moods: ["professional", "respectful"] },
        { key: "own_humble_2", text: "لقيت الفرصة وأخذتها.", moods: ["playful", "professional"] },
        { key: "own_humble_3", text: "خطوة هادية، نشوف ردك.", moods: ["respectful", "professional"] },
        { key: "own_humble_4", text: "المركز يسمح، فلازم نستثمر.", moods: ["professional", "playful"] },
    ],
    losing: [
        { key: "losing_calm_1", text: "اللعب معاك ممتع، حتى لو الأرقام ليست في صالحي.", moods: ["respectful", "professional"] },
        { key: "losing_calm_2", text: "تتقدم بثبات، هذا أسلوب الأبطال.", moods: ["respectful", "encouraging"] },
        { key: "losing_calm_3", text: "أحترم خطتك، لازم أركّز أكثر.", moods: ["respectful", "professional"] },
    ],
    winning: [
        // Even when winning, businessman = humble, never trash-talk.
        { key: "winning_humble_1", text: "الجولة تسير معي اليوم، لكن الأمور تتغير بسرعة.", moods: ["professional", "respectful"] },
        { key: "winning_humble_2", text: "خط متقدم، بس الباب لسا مفتوح للجميع.", moods: ["playful", "professional"] },
        { key: "winning_humble_3", text: "نتقدم خطوة، ونسيب لك مجال للرد.", moods: ["respectful", "professional"] },
    ],
    // End-of-match — these are the most important lines for "engagement on loss".
    on_player_win: [
        { key: "p_win_1", text: "مبروك الفوز، أداء يستحق الاحترام. جولة ثانية؟", moods: ["respectful", "warm_welcome", "professional", "playful", "encouraging"] },
        { key: "p_win_2", text: "أحسنت، فزت بجدارة. أنا في انتظار التحدي القادم.", moods: ["respectful", "professional", "encouraging"] },
        { key: "p_win_3", text: "مبروك، ضربتك الأخيرة كانت قرار صح. متشرف باللعب معك.", moods: ["respectful", "warm_welcome", "playful"] },
        { key: "p_win_4", text: "تستاهل الفوز اليوم، أتمنى نلتقي قريب على الطاولة.", moods: ["warm_welcome", "professional", "encouraging"] },
    ],
    on_player_loss: [
        // Critical: dignified, never patronizing, hint at "you were close",
        // and always invite back.
        { key: "p_loss_1", text: "كنت قريب جداً من الفوز، الجولة الجاية لك إن شاء الله.", moods: ["encouraging", "warm_welcome", "professional"] },
        { key: "p_loss_2", text: "لعب نظيف منك، فرق بسيط جداً. شرف لي الجولة.", moods: ["respectful", "professional", "warm_welcome"] },
        { key: "p_loss_3", text: "خسارة بكرامة لاعب محترم. تستاهل تجرب مرة ثانية.", moods: ["respectful", "encouraging"] },
        { key: "p_loss_4", text: "اقتربت كثير، حركة أو اثنتين والنتيجة تنقلب. لك تحدي رد؟", moods: ["encouraging", "playful", "warm_welcome"] },
        { key: "p_loss_5", text: "أداء قوي رغم النتيجة. لا تيأس، الفوز قريب.", moods: ["encouraging", "respectful", "professional"] },
    ],
    on_draw: [
        { key: "draw_1", text: "تعادل عادل، استمتعت بالجولة. نكمل؟", moods: ["respectful", "warm_welcome", "professional", "playful"] },
        { key: "draw_2", text: "جولة متوازنة، شرف لي. نلتقي على الطاولة قريب.", moods: ["respectful", "warm_welcome", "professional"] },
    ],
};

function pickRandomPhrase(trigger: Sam9BanterTrigger, mood: Sam9BanterMood, recentlyUsedKeys: Set<string>): BanterPhrase | null {
    const pool = PHRASES[trigger] || [];
    if (pool.length === 0) return null;

    // Prefer phrases that match the mood AND haven't been used recently.
    const moodMatches = pool.filter((p) => p.moods.includes(mood) && !recentlyUsedKeys.has(p.key));
    if (moodMatches.length > 0) {
        return moodMatches[Math.floor(Math.random() * moodMatches.length)];
    }

    // Fallback: any phrase not recently used.
    const fresh = pool.filter((p) => !recentlyUsedKeys.has(p.key));
    if (fresh.length > 0) {
        return fresh[Math.floor(Math.random() * fresh.length)];
    }

    // Last-resort: any phrase (recents will rotate naturally as session ages).
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Read the recent banter keys for a session+player so we don't repeat
 * the same line. Returns the last 6 phrase keys.
 */
async function loadRecentlyUsedKeys(sessionId: string, humanUserId: string): Promise<Set<string>> {
    try {
        const rows = await db
            .select({ phraseKey: sam9BanterLog.phraseKey })
            .from(sam9BanterLog)
            .where(and(
                eq(sam9BanterLog.sessionId, sessionId),
                eq(sam9BanterLog.humanUserId, humanUserId),
            ))
            .orderBy(sql`${sam9BanterLog.emittedAt} DESC`)
            .limit(6);
        return new Set(rows.map((r) => r.phraseKey));
    } catch (error) {
        logger.warn?.(`[sam9-banter] load recents failed: ${(error as Error).message}`);
        return new Set();
    }
}

/**
 * Count messages already emitted for this (session, player) pair to
 * enforce the per-session cap.
 */
async function countSessionBanter(sessionId: string, humanUserId: string): Promise<number> {
    try {
        const [row] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(sam9BanterLog)
            .where(and(
                eq(sam9BanterLog.sessionId, sessionId),
                eq(sam9BanterLog.humanUserId, humanUserId),
            ));
        return Number(row?.count ?? 0);
    } catch {
        return 0;
    }
}

const PER_SESSION_HARD_CAP = 5;
// In-memory per-(session, user) move counter so we throttle to "at most 1
// banter every ~5 moves" without another DB hit per move.
const moveCounters = new Map<string, number>();

function counterKey(sessionId: string, humanUserId: string): string {
    return `${sessionId}::${humanUserId}`;
}

/**
 * Tick the per-session counter; returns whether this move is "eligible"
 * for a banter line based on the cadence rule.
 *
 * Mid-game banter triggers (good_player_move, good_own_move, winning,
 * losing) MUST go through this gate. End-of-match triggers
 * (on_player_win/loss/draw) bypass it.
 */
export function shouldEmitBanterByCadence(sessionId: string, humanUserId: string): boolean {
    const key = counterKey(sessionId, humanUserId);
    const next = (moveCounters.get(key) || 0) + 1;
    moveCounters.set(key, next);

    // First eligible move at index 4 (turn 5), then every 6 moves after.
    if (next === 5) return true;
    if (next > 5 && (next - 5) % 6 === 0) return true;
    return false;
}

/** Reset the cadence counter when a session ends. */
export function resetBanterCounter(sessionId: string, humanUserId: string): void {
    moveCounters.delete(counterKey(sessionId, humanUserId));
}

export interface BanterChoice {
    phraseKey: string;
    text: string;
    trigger: Sam9BanterTrigger;
}

export interface BanterChoiceParams {
    sessionId: string;
    humanUserId: string;
    trigger: Sam9BanterTrigger;
    mood: Sam9BanterMood;
    /** End-of-match triggers bypass the per-session cap; mid-game ones don't. */
    bypassCap?: boolean;
}

/**
 * Pick a banter line and persist the choice into `sam9_banter_log` for
 * dedup + audit. Returns `null` if the cap is reached or the pool is
 * empty (caller should silently skip).
 */
export async function chooseBanterLine(params: BanterChoiceParams): Promise<BanterChoice | null> {
    if (!params.bypassCap) {
        const used = await countSessionBanter(params.sessionId, params.humanUserId);
        if (used >= PER_SESSION_HARD_CAP) {
            return null;
        }
    }

    const recentKeys = await loadRecentlyUsedKeys(params.sessionId, params.humanUserId);
    const phrase = pickRandomPhrase(params.trigger, params.mood, recentKeys);
    if (!phrase) return null;

    try {
        await db.insert(sam9BanterLog).values({
            sessionId: params.sessionId,
            humanUserId: params.humanUserId,
            phraseKey: phrase.key,
            triggerContext: params.trigger,
            renderedText: phrase.text,
        });
    } catch (error) {
        logger.warn?.(`[sam9-banter] log insert failed: ${(error as Error).message}`);
    }

    return { phraseKey: phrase.key, text: phrase.text, trigger: params.trigger };
}
