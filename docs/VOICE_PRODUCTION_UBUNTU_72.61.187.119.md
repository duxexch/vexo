# Voice Production Bootstrap (Ubuntu 25.10 / 72.61.187.119)

Use this to provision TURN + LiveKit for challenge voice with one command.

## One Final Command

Run on the Ubuntu server as root inside repo path `/opt/vixo`:

SERVER_IP=72.61.187.119 REPO_DIR=/opt/vixo bash deploy/voice/bootstrap-prod-voice.sh

## What This Command Does

1. Generates strong secrets for:

- LIVEKIT_KEYS
- TURN_PASSWORD

1. Writes/updates voice env in `.env`:

- TURN_EXTERNAL_IP
- TURN_REALM
- TURN_USERNAME
- TURN_PASSWORD
- PUBLIC_RTC_STUN_URLS
- PUBLIC_RTC_TURN_URLS
- PUBLIC_RTC_TURN_USERNAME
- PUBLIC_RTC_TURN_CREDENTIAL
- PUBLIC_RTC_ICE_TRANSPORT_POLICY

1. Opens firewall ports in this order:

- 22/tcp, 80/tcp, 443/tcp
- 3478/tcp, 3478/udp, 5349/tcp
- 7880/tcp, 7881/tcp, 7882/udp
- 49160-49200/udp

1. Starts voice services:

- livekit
- coturn

## Optional Tight Mode

To force TURN relay only for stricter NAT reliability:

SERVER_IP=72.61.187.119 REPO_DIR=/opt/vixo RTC_POLICY=relay bash deploy/voice/bootstrap-prod-voice.sh

## Post-Run Validation

- Check services:
  - docker ps | grep -E "vex-livekit|vex-coturn"
- Verify compose health:
  - docker compose -f deploy/docker-compose.voice.yml --env-file .env ps
- Verify app receives RTC config:
  - curl -s <http://localhost:3001/api/settings/public>

## Optional UDP Buffer Tuning (Linux VPS)

Use the Linux-only override file to avoid breaking non-Linux Docker hosts:

- Start with sysctl override:
  - docker compose -f deploy/docker-compose.voice.yml -f deploy/docker-compose.voice.linux-sysctl.yml --env-file .env up -d

Verify effective host values:

- cat /proc/sys/net/core/rmem_max
- cat /proc/sys/net/core/rmem_default
- cat /proc/sys/net/core/wmem_max
- cat /proc/sys/net/core/wmem_default

If your platform blocks container sysctls, apply them on the VPS host using `/etc/sysctl.d/*.conf` then run `sysctl --system`.
