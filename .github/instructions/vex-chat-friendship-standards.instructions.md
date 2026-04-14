---
description: "Use when editing VEX friendship, private chat, challenge chat, challenge voice chat, notification glue, or admin chat management. Enforces friend-request integrity, REST and WebSocket delivery parity, block or mute safety, chat PIN and auto-delete guardrails, admin setting validation, notification consistency, and responsive UI/UX quality for desktop web, mobile web, and APK/AAB chat surfaces with localization-safe text handling."
name: "VEX Chat Friendship Standards"
applyTo:
  - client/src/pages/friends.tsx
  - client/src/pages/chat.tsx
  - client/src/pages/challenge-game.tsx
  - client/src/pages/challenge-watch.tsx
  - client/src/pages/admin/admin-chat.tsx
  - client/src/hooks/use-chat.tsx
  - client/src/hooks/use-chat-pin.ts
  - client/src/hooks/use-chat-features.ts
  - client/src/hooks/use-notifications.tsx
  - client/src/components/chat-*.tsx
  - client/src/components/support-chat-widget.tsx
  - client/src/components/Notification*.tsx
  - client/src/components/VexNotificationPopup.tsx
  - client/src/components/games/GameChat.tsx
  - client/src/components/games/VoiceChat.tsx
  - client/src/components/games/chess/ChessChat.tsx
  - server/routes/social/**/*.ts
  - server/routes/chat/**/*.ts
  - server/routes/notifications.ts
  - server/websocket/chat/**/*.ts
  - server/websocket/voice.ts
  - server/websocket/notifications.ts
  - server/admin-routes/chat-*.ts
  - server/admin-routes/admin-support/**/*.ts
  - server/storage/social.ts
  - server/storage/notifications.ts
  - shared/schema.ts
---
# VEX Chat Friendship Standards

## Domain Invariants
- Treat friendship, private chat, challenge chat, voice signaling, admin chat controls, and notification delivery as one connected domain.
- Preserve parity between REST and WebSocket behavior; if one path blocks, rate-limits, or validates a message, the other path must not silently bypass it.
- Keep friendship state authoritative in server storage, not inferred from client-only badges or local mutation assumptions.
- Treat chat and friendship UI as production surfaces for desktop web, mobile web, and packaged Android shells, not desktop-only admin-style layouts.

## UI/UX And Responsive Design Rules
- Design touched chat and friendship surfaces to work cleanly on desktop web, phone-width web, and APK/AAB mobile containers.
- Validate narrow widths first: composer rows, conversation lists, dialogs, badges, feature chips, tabs, and pinned controls must not overflow or become untappable.
- Keep touch targets stable and usable in mobile layouts, especially for send, retry, react, pin, voice, accept, decline, and moderation actions.
- Respect safe-area and bottom-sheet realities for packaged mobile app experiences when editing overlays, drawers, composer bars, or voice controls.
- Avoid density choices that depend on hover, precise cursor placement, or wide screens only.

## Text Fitting And Localization Rules
- Build layouts to survive very short and very long strings, including languages with expansion beyond English and Arabic.
- Support both LTR and RTL alignment without clipping icons, badges, timestamps, or action rows.
- Prefer wrapping, line clamping, or adaptive stacking over text overlap or hidden controls.
- Do not hardcode user-facing strings in chat, friendship, support-ticket, or notification surfaces.
- When changing labels or helper text, ensure the design still works under global language coverage rather than only one or two locales.

## Friendship Integrity Rules
- Validate send, accept, decline, remove, follow, and block flows against both relationship direction and existing state.
- Never allow block-state gaps where friend requests or follows can succeed when either side is blocked.
- When editing friend or follower UI, keep online state, request state, and mutual-friend indicators derived from authoritative backend data.

## Private Chat Delivery Rules
- Preserve clientMessageId ACK and retry semantics when touching send logic, reconnect flow, or pending message state.
- Keep block, mute, chat-enabled, message-length, and sanitize checks enforced server-side before persistence.
- Do not change unread-count, read-receipt, or typing-indicator behavior without checking both live WebSocket updates and refresh-from-API behavior.
- If search or history payloads vary across paths, keep client handlers tolerant to known shape drift instead of assuming one exact key.

## Chat Feature Guardrails
- Keep chat PIN logic security-sensitive: hash-only persistence, failed-attempt tracking, and lockout behavior must remain intact.
- Disappearing messages and auto-delete must be driven by authoritative timestamps and cleanup logic, not client-only timers.
- Media permissions and auto-delete feature grants must remain permission-gated and validated server-side.

## Challenge Chat And Voice Rules
- Challenge chat must respect authoritative player versus spectator roles and room membership before send or receive logic.
- Do not weaken per-room cleanup, session binding, or post-game cleanup behavior for challenge chat history.
- Voice signaling changes must keep payload validation, rate limiting, join and leave cleanup, and explicit rejection behavior.
- Remember current production voice signaling is peer-oriented and limited; do not design multiplayer voice behavior as if SFU infrastructure already exists.

## Notifications And I18n
- Keep notification dispatch localized with both English and Arabic title or message fields where the system already expects them.
- Do not hardcode user-facing text in chat, friendship, support-ticket, or notification surfaces.
- Preserve deep links and unread invalidation behavior when changing notification triggers.
- Make notification cards, popups, and badges resilient to longer translations and mixed-direction text.

## Admin Chat Management Rules
- Canonical chat setting key is `chat_enabled`; legacy aliases must not be resolved through unordered fallback reads.
- Admin setting writes must validate values server-side, especially booleans and bounded numeric settings such as message length and rate limit.
- Admin tools must not expose UI actions that backend policy always rejects, especially in security-sensitive private-chat paths.
- Chat PIN resets, feature grants, and support-ticket actions should stay audit-friendly and explicit.

## Code Hygiene In Touched Areas
- Remove stale branches and duplicate enforcement only if the resulting path still preserves cross-channel parity.
- Prefer minimal deterministic fixes in shared hooks and websocket handlers because small drift here causes user-visible state bugs.
- Preserve mobile-friendly interaction behavior for chat overlays, composer areas, and voice controls.
- Preserve desktop readability without sacrificing mobile usability; do not fix one breakpoint by breaking another.

## Validation Baseline
- Always run `npx tsc --noEmit` after changes.
- If backend, websocket, admin routes, or schema changed: boot the server and verify the root route on port `3001`.
- If delivery semantics changed: validate send, ACK, unread, and reconnect behavior across both sender and receiver paths.
- If challenge voice changed: validate join, offer, answer, ICE, leave, and disconnect cleanup behavior.
- If UI changed: verify desktop and mobile layouts, text fit under translated content, and APK/AAB-style mobile constraints.
