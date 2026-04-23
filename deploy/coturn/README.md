# coturn (TURN/STUN) for vixo.click

Self-hosted TURN relay used by the WebRTC voice/video call feature.
The service is wired into `docker-compose.prod.yml` as part of the default
stack but only starts producing traffic once the env vars below are set
and the config file has been rendered.

## Required env vars (in production `.env`)

| Variable | Purpose |
| --- | --- |
| `TURN_HOST` | Public hostname for clients (e.g. `turn.vixo.click`) |
| `TURN_REALM` | Realm string (defaults to `vixo.click`) |
| `TURN_STATIC_SECRET` | Long random string; **must match** server-side `TURN_STATIC_SECRET` |
| `TURN_EXTERNAL_IP` | Public IPv4 of the VPS (required when behind NAT) |

The same `TURN_HOST` / `TURN_STATIC_SECRET` (plus optional `TURN_PORT`,
`TURN_TLS_PORT`, `TURN_TTL_SECONDS`, `STUN_URLS`) are also passed to the
`app` container so `GET /api/rtc/ice-servers` issues matching ephemeral
credentials.

## Generate the secret

```bash
openssl rand -base64 48 | tr -d '\n='
```

Paste into `.env` as `TURN_STATIC_SECRET=…`.

## One-time VPS setup

1. **DNS**: add an `A` record `turn.vixo.click` → public VPS IPv4.
2. **Firewall** (Hostinger panel or `ufw`):
   ```bash
   ufw allow 3478/tcp
   ufw allow 3478/udp
   ufw allow 5349/tcp
   ufw allow 5349/udp
   ufw allow 49152:65535/udp
   ```
3. **Render the config** from the template:
   ```bash
   ./deploy/coturn/render-config.sh
   ```
4. **Validate** the rendered config (catches typos before deploy):
   ```bash
   docker run --rm -v "$(pwd)/deploy/coturn:/c" coturn/coturn:latest \
     turnserver -c /c/turnserver.conf -o
   ```
5. **Bring the service up**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d coturn app
   ```

## Verify

```bash
# Should return STUN servers + a TURN entry with username/credential
curl -b "vex_token=<jwt>" https://vixo.click/api/rtc/ice-servers | jq

# Confirm the daemon is listening
ss -lunp | grep turnserver | head
docker logs vex-coturn --tail 50
```

## End-to-end test (relay-forced)

To prove the relay path works, force ICE-relay-only on a test client by
running this in DevTools BEFORE starting a call:

```js
window.localStorage.setItem('debug_force_relay', '1');
```

Two browsers on different networks (one cellular, one office Wi-Fi) should
connect; the call HUD should show the **Relay** tier badge.

## Disable / scale-down

If you ever need to stop the relay (e.g. emergency cost reduction):

```bash
docker compose -f docker-compose.prod.yml stop coturn
```

The app keeps working — calls fall back to peer-to-peer where possible
and to text-only chat otherwise.

## How the credentials work

We use coturn's `use-auth-secret` (REST API) mode. The app server signs
`<unix-expiry>:<userId>` with `TURN_STATIC_SECRET` (HMAC-SHA1) and hands
the result to the browser via `/api/rtc/ice-servers`. coturn re-derives
the same HMAC at connect time and authorizes — no shared user database
needed. Credentials expire after `TURN_TTL_SECONDS` (default 1 hour).
