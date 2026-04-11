# Voice + Chat Production Playbook (High Quality)

This playbook defines a production-grade path for stable, high-quality voice and chat in VEX.

## Current Reality In This Repo

- Voice client currently uses WebRTC peer connection config from `/api/settings/public`.
- Voice signaling is handled through websocket events (`voice_join`, `voice_offer`, `voice_answer`, `voice_ice_candidate`).
- Current voice signaling path is intentionally limited to 2-player rooms.
- TURN/STUN for clients are served from env-backed public RTC settings.
- LiveKit + Coturn stack exists and can be deployed independently.

Key implementation references:

- `client/src/components/games/VoiceChat.tsx`
- `client/src/lib/rtc-config.ts`
- `server/websocket/voice.ts`
- `server/lib/public-rtc.ts`
- `server/admin-routes/admin-settings/app-settings.ts`
- `deploy/docker-compose.voice.yml`

## Production Target

### Voice

1. Use LiveKit SFU media plane for all challenge modes (2p + 4p + spectators when enabled).
2. Keep Coturn as fallback relay and for strict NAT environments.
3. Keep websocket only for app/game state, not media transport.

### Chat

1. Keep persistent DB-backed messages as source of truth.
2. Keep websocket for realtime fanout and typing indicators.
3. Add delivery/read reliability semantics for mobile reconnect scenarios.

## Quality SLOs

- Voice connection success (join to connected in <= 8s): >= 99.5%
- One-way audio failure rate: < 0.5%
- Reconnect success after transient drop (<= 15s): >= 99%
- Chat delivery latency p95: <= 400ms
- Chat message durability (accepted but lost): 0

## Immediate Hardening (Do Now)

1. Rotate leaked TURN credentials immediately.
2. Recreate voice stack using env from `.env` (avoid in-container manual edits).
3. Keep Linux UDP buffer tuning active on host and verify values.
4. Ensure cloud firewall + VPS firewall both allow required UDP/TCP ports.
5. Keep `PUBLIC_RTC_TURN_URLS`, `PUBLIC_RTC_TURN_USERNAME`, `PUBLIC_RTC_TURN_CREDENTIAL` populated in app env.

## Recommended Ports

- LiveKit: `7880/tcp`, `7881/tcp`, `7882/udp`
- Coturn: `3478/tcp`, `3478/udp`, `5349/tcp`, `49160-49200/udp`

## TURN Verification Checklist

1. Verify app is publishing RTC config:
   - `curl -s http://localhost:3001/api/settings/public`
   - Confirm TURN URLs + username + credential exist under `rtc.iceServers`.
2. Force relay test:
   - Set `PUBLIC_RTC_ICE_TRANSPORT_POLICY=relay` and restart app.
3. Confirm selected candidate pair in browser (`chrome://webrtc-internals`) is `relay`.
4. Confirm UDP traffic during active call:
   - `tcpdump -n -i any 'udp port 3478 or udp portrange 49160-49200'`

## Sysctl Baseline For Live Voice

Set on VPS host:

```
net.core.rmem_max=5000000
net.core.rmem_default=5000000
net.core.wmem_max=5000000
net.core.wmem_default=5000000
```

Validate:

```
sysctl net.core.rmem_max net.core.rmem_default net.core.wmem_max net.core.wmem_default
```

## Chat Reliability Upgrades

1. Add client-generated message id for idempotent retries.
2. Add explicit server ack envelope with `acceptedAt` and `messageId`.
3. Add resend-on-reconnect window for unacked outbound messages.
4. Add dead-letter/alerting for failed notification fanout.
5. Add rate-limit metrics by route and websocket message type.

## Observability Baseline

Collect and dashboard these metrics:

- Voice join attempts/success/failure by reason.
- ICE candidate type chosen (`host/srflx/relay`) distribution.
- Reconnect attempts and reconnect success.
- Packet loss / jitter / RTT (from WebRTC stats).
- Chat send errors, websocket drops, and pending queue depth.

## Security Baseline

1. Never keep static leaked TURN credentials after exposure.
2. Rotate TURN password on schedule and on every incident.
3. Keep production secrets only in server env manager, never in docs/chat logs.
4. Keep max websocket payload and message validation strict.

## Rollout Plan

### Phase 1 (1-2 days)

- Rotate TURN secrets and restart voice stack.
- Verify relay path and UDP telemetry.
- Keep existing voice client flow and validate quality.

### Phase 2 (3-7 days)

- Integrate LiveKit client SDK in app for SFU rooms.
- Preserve existing websocket for game events/chat.
- Gate rollout by feature flag per game type.

### Phase 3 (1-2 weeks)

- Enable dynamic quality adaptation and richer voice analytics.
- Add chat resend/idempotency flow for mobile instability.
- Add incident runbook and synthetic call probes.

## Incident Quick Actions

1. If users report one-way/no-audio:
   - Check `/api/settings/public` includes TURN.
   - Force relay and retest.
   - Inspect `webrtc-internals` candidate pair.
2. If calls degrade under load:
   - Confirm sysctl values.
   - Confirm UDP relay port range is open externally.
   - Review packet loss/jitter telemetry.
3. If chat delays/loss appear:
   - Check websocket connection churn.
   - Verify DB writes succeed for every accepted message.
   - Check fanout/notification errors.
