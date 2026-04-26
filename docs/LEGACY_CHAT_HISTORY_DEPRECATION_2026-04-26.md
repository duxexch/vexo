# Legacy chat-history surfaces gated behind `LEGACY_CHAT_HISTORY_ENABLED`

**Effective:** 2026-04-26 (Task #115)

## Summary

The two legacy DM-history readers — the HTTP route
`GET /api/chat/:userId/messages` and the WebSocket `chat_history` event —
are no longer mounted by default. They're kept available for one
deprecation window behind the new `LEGACY_CHAT_HISTORY_ENABLED` env
flag so a stale mobile cache or pre-Task-#115 client can still talk to
a fresh server while it picks up the update.

Every in-app surface now backfills DM timelines from the realtime DM
transport `GET /api/dm/:peerId/history` (Tasks #16 / #20 / #28). The
realtime endpoint is the canonical timeline reader: cursor-based
pagination via `before=`, definitive `hasMore`, soft-delete filters
always on, smaller text-only payload.

## Behaviour change

- **HTTP route `GET /api/chat/:userId/messages`** is mounted only when
  `LEGACY_CHAT_HISTORY_ENABLED` is one of `"true" | "1" | "yes" | "on"`
  (case-insensitive). When the flag is unset or false, callers receive
  the standard Express 404 for that path.
- **WebSocket event `chat_history`** is still recognised so the dispatch
  table doesn't change, but the handler now responds with a
  `chat_error` envelope carrying `code: "legacy_chat_history_disabled"`
  unless the same env flag is set. The error includes the requested
  `otherUserId` so a buggy client can correlate the failure.
- The Task #80 `?envelope=hasMore` opt-in on the HTTP route has been
  removed — the realtime endpoint always returns the
  `{ messages, hasMore }` envelope, so the dual-shape compromise is no
  longer necessary. (When the flag opts the legacy route back in, it
  now returns the plain array shape only.)

## Migration

Any remaining caller should use the realtime DM history endpoint:

```http
GET /api/dm/:peerId/history?limit=50
GET /api/dm/:peerId/history?limit=50&before=2026-04-26T12:34:56.000Z
```

Response envelope:

```json
{
  "messages": [
    { "id": "…", "senderId": "…", "receiverId": "…",
      "content": "…", "messageType": "text", "createdAt": "…" }
  ],
  "hasMore": true
}
```

Messages are returned in ascending chronological order
(oldest → newest) so they can be appended directly to a scroll buffer.
Use `before=<oldest createdAt>` for scroll-back pagination and trust
`hasMore` as the definitive end-of-history flag.

## Deprecation window

The flag-gated legacy paths are intended to live one release. Clients
that still need them should set `LEGACY_CHAT_HISTORY_ENABLED=true` on
their server during the upgrade window. The flag, the route, the
WebSocket handler, and the `server/storage/legacy-chat-history.ts`
helper will all be deleted in the follow-up cleanup once telemetry
shows no traffic on the legacy paths.
