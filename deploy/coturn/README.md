# coturn (TURN/STUN) for vixo.click

Self-hosted TURN relay used by the WebRTC voice/video call feature.

## Required env vars

- `TURN_HOST` — public hostname for clients (e.g. `turn.vixo.click`)
- `TURN_REALM` — realm (usually `vixo.click`)
- `TURN_STATIC_SECRET` — long random string; must match the server-side
  `TURN_STATIC_SECRET` so ephemeral credentials validate
- `TURN_EXTERNAL_IP` — public IPv4 of the host (only if behind NAT)

## How to enable

1. DNS: point `turn.vixo.click` (A record) to the VPS public IP.
2. Open firewall: TCP+UDP `3478`, `5349`, and UDP `49152-65535`.
3. Add the same `TURN_*` env vars to the **app** container so it can issue
   credentials via `GET /api/rtc/ice-servers`.
4. Uncomment the `coturn` service in `docker-compose.prod.yml`.
5. Render the config:
   ```bash
   envsubst < deploy/coturn/turnserver.conf.template \
     > deploy/coturn/turnserver.conf
   ```
6. `docker compose -f docker-compose.prod.yml up -d coturn`

## Verify

```bash
# Should return STUN servers + a TURN entry with username/credential
curl -b "vex_token=<jwt>" https://vixo.click/api/rtc/ice-servers

# Validate the rendered config
docker run --rm -v "$(pwd)/deploy/coturn:/c" coturn/coturn:latest \
  turnserver -c /c/turnserver.conf -o
```

If `TURN_HOST` or `TURN_STATIC_SECRET` is unset on the app container, the
endpoint will still return public STUN servers, and clients will degrade to
the text-only fallback tier whenever P2P fails.
