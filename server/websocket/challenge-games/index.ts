import type { AuthenticatedSocket } from "../shared";
import { handleJoinChallengeGame, handleLeaveChallengeGame } from "./join-leave";
import { handleGameMove } from "./moves";
import { handleRollDice, handleEndTurn } from "./backgammon";
import { handleChallengeChat, handleGiftToPlayer } from "./chat-gifts";
import { handleGameResign, handleOfferDraw, handleRespondDraw } from "./resign-draw";
import { validateChallengeGameMessage } from "./validation";

/**
 * Handle challenge game message types:
 * join_challenge_game, leave_challenge_game, game_move, roll_dice, end_turn,
 * challenge_chat, game_resign, offer_draw, respond_draw, gift_to_player
 */
export async function handleChallengeGames(ws: AuthenticatedSocket, data: unknown): Promise<void> {
  if (!ws.userId) return;

  const validation = validateChallengeGameMessage(data);
  if (!validation.ok) {
    ws.send(JSON.stringify({ type: "challenge_error", error: validation.error }));
    return;
  }

  const message = validation.data;

  switch (message.type) {
    case "join_challenge_game":
      return handleJoinChallengeGame(ws, message);
    case "leave_challenge_game":
      return handleLeaveChallengeGame(ws, message);
    case "game_move":
      return handleGameMove(ws, message);
    case "roll_dice":
      return handleRollDice(ws, message);
    case "end_turn":
      return handleEndTurn(ws, message);
    case "challenge_chat":
      return handleChallengeChat(ws, message);
    case "game_resign":
      return handleGameResign(ws, message);
    case "offer_draw":
      return handleOfferDraw(ws, message);
    case "respond_draw":
      return handleRespondDraw(ws, message);
    case "gift_to_player":
      return handleGiftToPlayer(ws, message);
    case "send_gift":
      return handleGiftToPlayer(ws, message);
    default:
      ws.send(JSON.stringify({ type: "challenge_error", error: "Unsupported message type" }));
      return;
  }
}
