/**
 * Sam9 Banter Dispatcher
 * ----------------------
 * Bridges the pure banter picker (`sam9-banter.ts`) with:
 *   1. The live game WebSocket room broadcast (so peers see the line
 *      in-chat instantly).
 *   2. The `game_chat_messages` history table (so the line shows up on
 *      page reload via the existing chat REST endpoint).
 *
 * Usage from `ai-turns.ts`:
 *   - `dispatchOpeningBanter(...)` once per AI session before the first move.
 *   - `dispatchMidGameBanter(...)` after each chosen AI move (cadence-gated).
 *   - `dispatchEndOfMatchBanter(...)` when the game ends (cap-bypassing).
 */
import { storage } from "../storage";
import { broadcastToRoom } from "../game-websocket/utils";
import type { GameRoom } from "../game-websocket/types";
import { logger } from "./logger";
import {
    chooseBanterLine,
    resetBanterCounter,
    shouldEmitBanterByCadence,
    type Sam9BanterTrigger,
} from "./sam9-banter";
import type { Sam9BanterMood } from "./sam9-engagement";

interface DispatchArgs {
    room: GameRoom;
    sessionId: string;
    /** Sam9's bot user id — sender of the chat message. */
    botUserId: string;
    /** Display username for the bot in the chat bubble. */
    botUsername: string;
    /** The single human opponent we're tailoring banter to. */
    humanUserId: string;
    trigger: Sam9BanterTrigger;
    mood: Sam9BanterMood;
}

async function emit(args: DispatchArgs, bypassCap: boolean): Promise<void> {
    const choice = await chooseBanterLine({
        sessionId: args.sessionId,
        humanUserId: args.humanUserId,
        trigger: args.trigger,
        mood: args.mood,
        bypassCap,
    });
    if (!choice) return;

    const ts = Date.now();

    // Persist to chat history so reload still shows the bot's line.
    try {
        await storage.addGameChatMessage({
            sessionId: args.sessionId,
            userId: args.botUserId,
            message: choice.text,
            messageType: "text",
            isFromSpectator: false,
        });
    } catch (error) {
        logger.warn?.(`[sam9-banter-dispatcher] history persist failed: ${(error as Error).message}`);
    }

    // Broadcast to every player + spectator in the room (no block-list
    // checks for the bot — Sam9 is system-grade content).
    try {
        broadcastToRoom(args.room, {
            type: "chat_message",
            payload: {
                userId: args.botUserId,
                username: args.botUsername,
                message: choice.text,
                isSpectator: false,
                timestamp: ts,
                wasFiltered: false,
                isBot: true,
            },
        });
    } catch (error) {
        logger.warn?.(`[sam9-banter-dispatcher] room broadcast failed: ${(error as Error).message}`);
    }
}

export async function dispatchOpeningBanter(args: DispatchArgs): Promise<void> {
    await emit({ ...args, trigger: "opening" }, /* bypassCap */ false);
}

export async function dispatchMidGameBanter(args: DispatchArgs): Promise<void> {
    if (!shouldEmitBanterByCadence(args.sessionId, args.humanUserId)) return;
    await emit(args, /* bypassCap */ false);
}

export async function dispatchEndOfMatchBanter(
    args: DispatchArgs & { trigger: "on_player_win" | "on_player_loss" | "on_draw" },
): Promise<void> {
    await emit(args, /* bypassCap */ true);
    resetBanterCounter(args.sessionId, args.humanUserId);
}
