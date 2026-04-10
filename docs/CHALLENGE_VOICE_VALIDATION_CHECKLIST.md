# Challenge Voice Validation Checklist

This checklist verifies the challenge voice flow with production-like network behavior.

For one-command Ubuntu production bootstrap, see `docs/VOICE_PRODUCTION_UBUNTU_72.61.187.119.md`.

## 1) Preconditions

- Configure runtime ICE from env (server -> `/api/settings/public`):
  - `PUBLIC_RTC_STUN_URLS`
  - `PUBLIC_RTC_TURN_URLS`
  - `PUBLIC_RTC_TURN_USERNAME`
  - `PUBLIC_RTC_TURN_CREDENTIAL`
  - `PUBLIC_RTC_ICE_TRANSPORT_POLICY`
- Bring up voice stack:
  - `docker compose -f deploy/docker-compose.voice.yml --env-file .env up -d`
- Confirm TURN and signaling ports are reachable from public internet:
  - `3478/udp`, `3478/tcp`, `5349/tcp`, `49160-49200/udp`

## 2) Baseline Functional Test (Two Real Devices)

- Device A and Device B join the same challenge as players.
- Enable voice from both sides.
- Expected results:
  - Connection state moves to connected within 3 to 6 seconds.
  - Both players hear each other clearly.
  - Mic toggle mutes local upstream only.
  - Speaker toggle affects local playback only.

## 3) Reconnect and Resilience

- While connected, disable network on Device B for 8 to 12 seconds, then restore.
- Expected results:
  - Device A sees reconnect state, then recovers automatically.
  - Audio recovers without refreshing the page.
- Close the challenge tab on Device B and reopen it.
- Expected results:
  - Device B re-authenticates and rejoins voice successfully.

## 4) NAT and Carrier Scenarios

- Test combinations:
  - Wi-Fi <-> Wi-Fi
  - Wi-Fi <-> 4G/5G
  - 4G/5G <-> 4G/5G
- Set `PUBLIC_RTC_ICE_TRANSPORT_POLICY=relay` for strict TURN routing test.
- Expected results:
  - Voice still connects under restrictive NAT.
  - Audio latency remains acceptable for challenge play.

## 5) Performance and Quality

- Keep a 10-minute session running during active gameplay.
- Monitor:
  - No audio drops longer than 2 seconds.
  - No one-way audio after reconnect.
  - CPU usage stable on mid-range Android devices.

## 6) Safety and Regression

- Verify spectators cannot join voice in challenge mode.
- Verify voice remains 1v1 only where server rules enforce two participants.
- Run type checks after changes:
  - `npx tsc --noEmit`

## 7) Operational Rollout

- Start with TURN enabled and monitor call success rate.
- If failure ratio exceeds target, temporarily force relay and inspect STUN/TURN reachability.
- Keep TURN credentials rotatable and avoid hardcoding credentials in client code.
