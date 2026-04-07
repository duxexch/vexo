# Production Traefik Runtime Notes (2026-04-07)

## Snapshot Summary

- Host: `srv1118737.hstgr.cloud`
- Public IPv4: `72.61.187.119`
- Domain: `vixo.click`
- DNS status:
  - `A vixo.click -> 72.61.187.119`
  - `CNAME www.vixo.click -> vixo.click`
  - `A www.vixo.click -> 72.61.187.119`

## Observed Runtime State

- HTTP (`:80`) and HTTPS (`:443`) are listening via Traefik.
- External requests succeed:
  - `http://vixo.click` -> `308` redirect to HTTPS
  - `https://vixo.click` -> `200`
  - `https://www.vixo.click` -> `200`
- Active TLS cert for `vixo.click` is valid (`Let's Encrypt`, not expired).

## Important Operational Detail

Traefik is currently running from a separate compose project:

- Container: `traefik-mebu-traefik-1`
- Compose project label: `traefik-mebu`
- Working directory: `/docker/traefik-mebu`
- Network mode: `host`

Because of this, checks that hardcode `vex-traefik` or assume `/docker/vex/docker-compose.traefik.yml` can fail even when production is healthy.

## ACME Event Interpretation

An ACME challenge retrieval error was seen once in logs, but service behavior remained healthy and cert is valid.
Treat this as transient unless repeated frequently.

## Safe Read-Only Verification Commands

```bash
TRAEFIK_CTR=$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /traefik/ {print $1; exit}')
echo "$TRAEFIK_CTR"
docker inspect "$TRAEFIK_CTR" --format '{{json .NetworkSettings.Ports}}'
docker inspect "$TRAEFIK_CTR" --format '{{json .NetworkSettings.Networks}}'
docker logs --since 30m "$TRAEFIK_CTR" 2>&1 | egrep -i 'acme|certificate|error|warn'
echo | openssl s_client -servername vixo.click -connect vixo.click:443 2>/dev/null | openssl x509 -noout -issuer -subject -dates
docker inspect "$TRAEFIK_CTR" --format 'project={{ index .Config.Labels "com.docker.compose.project" }} workdir={{ index .Config.Labels "com.docker.compose.project.working_dir" }} files={{ index .Config.Labels "com.docker.compose.project.config_files" }}'
```

## Next-Step Rule

Do not run `docker compose up` for Traefik from a guessed path.
Always resolve current Traefik compose `workdir` and `config_files` from container labels first.
