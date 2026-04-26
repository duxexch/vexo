/**
 * Deprecation gate for the legacy chat-history surfaces (Task #115).
 *
 * The HTTP route `GET /api/chat/:userId/messages` and the WebSocket
 * `chat_history` event were the original ways to backfill a DM
 * timeline. Every in-app surface now reads from
 * `GET /api/dm/:peerId/history` (Tasks #16 / #20 / #28), so the
 * legacy paths are mounted only when this env flag opts them in.
 *
 * Setting the env var to one of `"true" | "1" | "yes" | "on"`
 * (case-insensitive) keeps the legacy paths alive for a deprecation
 * window during which a stale mobile cache or pre-Task-#115 client
 * can still talk to a fresh server. Anything else (including unset)
 * leaves the legacy paths dormant — the HTTP route is not mounted at
 * all, and the WebSocket handler responds with an explicit
 * `legacy_chat_history_disabled` error so the caller knows to switch
 * to the realtime DM endpoint.
 */

const TRUTHY = new Set(["true", "1", "yes", "on"]);

export function isLegacyChatHistoryEnabled(): boolean {
  const raw = process.env.LEGACY_CHAT_HISTORY_ENABLED;
  if (typeof raw !== "string") return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}
