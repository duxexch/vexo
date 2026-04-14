---
description: "Run a fast smoke audit for VEX friendship, private chat, challenge chat, challenge voice, admin chat management, notification sync, and responsive UI/UX quality across desktop web, mobile web, and APK/AAB chat surfaces."
name: "VEX Chat Friendship Smoke Audit"
argument-hint: "حدد النطاق: friends/private-chat/challenge-chat/voice/admin-chat/notifications وهل المطلوب audit فقط أم audit + fix recommendation."
agent: "VEX Chat Friendship Architect"
---
Run a fast but production-minded smoke audit for the provided VEX friendship or chat scope.

Use the user-provided argument as the exact audit scope baseline.

Requirements:
1. Default to audit mode only; do NOT edit code unless the user explicitly asks for fixes.
2. Map the impacted flow end-to-end before judging behavior:
   - client surface
   - hook or state layer
   - REST route
   - WebSocket handler
   - storage or schema dependency
   - notification or cleanup side effect
3. Validate domain invariants relevant to the chosen scope:
   - friendship state integrity
   - block or mute enforcement parity
   - unread and read-receipt consistency
   - clientMessageId ACK and retry behavior
   - challenge role and spectator rules
   - voice join and leave cleanup
   - admin validation and permission gating
   - responsive UI/UX behavior on desktop web, mobile web, and APK/AAB-style constraints when UI is touched
   - text wrapping, overflow, and layout stability under long translations and RTL or LTR content
4. Run the minimum useful checks:
   - Always run `npx tsc --noEmit`
   - If backend, websocket, admin route, or schema risk is involved, boot the server and verify `/` on port `3001`
   - If runtime simulation is not feasible, say so explicitly and provide the smallest exact manual verification steps
5. If UI is in scope, explicitly comment on:
   - desktop layout quality
   - mobile web behavior
   - APK/AAB mobile ergonomics
   - text fit across languages and translation expansion risk
6. Prioritize bugs and regressions over summaries. If no findings are found, state that clearly and list remaining blind spots.

Use these repository references when relevant:
- [Friends page](../../client/src/pages/friends.tsx)
- [Chat page](../../client/src/pages/chat.tsx)
- [Chat hook](../../client/src/hooks/use-chat.tsx)
- [Admin chat page](../../client/src/pages/admin/admin-chat.tsx)
- [Challenge game page](../../client/src/pages/challenge-game.tsx)
- [Challenge watch page](../../client/src/pages/challenge-watch.tsx)
- [Voice chat component](../../client/src/components/games/VoiceChat.tsx)
- [Social routes](../../server/routes/social/index.ts)
- [Chat messaging route](../../server/routes/chat/chat-messaging.ts)
- [Chat conversations route](../../server/routes/chat/chat-conversations.ts)
- [Chat websocket messaging](../../server/websocket/chat/messaging.ts)
- [Voice websocket handler](../../server/websocket/voice.ts)
- [Notifications websocket](../../server/websocket/notifications.ts)
- [Schema](../../shared/schema.ts)

Output format:
- Scope
- Flow Map
- Smoke Matrix
- Findings By Severity
- UI/UX And Localization Risks
- Fix Recommendations
- Validation Notes
- Residual Blind Spots