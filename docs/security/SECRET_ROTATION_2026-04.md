# Secret Rotation & Git-History Scrub Playbook (Task #178)

**Date:** 2026-04-26
**Severity:** **C0 — STOP-THE-LINE.**
**Status:** Working-tree redaction complete; rotation + git-history scrub pending owner action.

> **Owner-only operations.** This playbook is *executable* only by the project owner / VPS administrator. The agent cannot rotate keystore passwords, cannot reach the LiveKit admin console, cannot SSH into the Hostinger VPS, cannot read/write Replit Secret values, and **must not** rewrite git history without explicit owner approval. Every step below is annotated `[OWNER]` or `[AGENT-DONE]` accordingly.

---

## 0. Why this playbook exists

Task #177's audit (`docs/mobile/PRO_AUDIT_2026-04.md` § C0-01) caught the original four leaks: Android keystore passwords + LiveKit + TURN. Task #178's deeper sweep found the blast zone is **much larger** — `.env.example` had **19 distinct production-grade secret literals** committed in plain text, plus a sister paste in `attached_assets/`. Every clone of the repo, every CI fork, every PR snapshot, and every `git fsck`-reachable object still holds the originals.

This playbook is the single source of truth for cleaning up.

---

## 1. Inventory — every leaked secret currently in git history

Per-secret rotation surfaces below. Literals are **not reproduced here** — refer to the matching commit in git history (use `git log --all -S '<env_var_name>='` to locate) and rotate each underlying value across every surface listed.

### 1A. Originally identified by Task #177 (4 items)

| Env var | Where it's used | Rotation surface(s) |
|---|---|---|
| `ANDROID_KEYSTORE_PASSWORD` | Signs Play-Store update builds | `keytool -storepasswd` against the release `.jks` |
| `ANDROID_KEY_PASSWORD` | Signs Play-Store update builds | `keytool -keypasswd` against the release `.jks` |
| `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` + `LIVEKIT_KEYS` | Audio/video server-side admin | LiveKit Cloud admin console → revoke + reissue |
| `TURN_PASSWORD` + `PUBLIC_RTC_TURN_CREDENTIAL` | coturn long-term credential | coturn config on Hostinger VPS |

### 1B. Discovered in Task #178's deeper sweep (15 items)

| Env var | Surface | Rotation procedure |
|---|---|---|
| `POSTGRES_PASSWORD` (also embedded in `DATABASE_URL`) | Production Postgres on Hostinger VPS | `ALTER USER vex_user WITH PASSWORD '<new>';` then update Replit Secrets + the production `.env` + restart `vex-app` and `vex-ai-agent` containers. |
| `REDIS_PASSWORD` (also embedded in `REDIS_URL`) | Production Redis on Hostinger VPS | Update `requirepass` in `redis.conf`, `docker compose restart vex-redis`, then update Replit Secrets + production `.env`. |
| `MINIO_ROOT_PASSWORD` + `MINIO_SECRET_KEY` (same value reused) | MinIO admin + S3-compat access | `mc admin user svcacct edit` (or rotate root + recreate access keys), update Replit Secrets, restart `vex-app`. |
| `SESSION_SECRET` | Express session cookies | Generate fresh 96-hex-char value; rotation **invalidates every active session** (acceptable). |
| `JWT_SIGNING_KEY` (= `JWT_USER_SECRET` alias) | User JWT issuance + verification | Fresh 96-hex value; **all logged-in users must re-auth** (acceptable). |
| `ADMIN_JWT_SECRET` (= `JWT_ADMIN_SECRET` alias) | Admin JWT | Fresh 96-hex value; admin sessions invalidated. |
| `SECRETS_ENCRYPTION_KEY` (two distinct values: line 67 was 128-hex, line 295 was 64-hex — likely drift) | Encrypts at-rest secrets in DB | **Read both candidate values from git history**, decide which one is actually used by the running container, do a key-rotation migration that re-encrypts every encrypted column with the new key, then drop the old key. **DO NOT** just swap the env var — that bricks every encrypted field. |
| `ADMIN_BOOTSTRAP_PASSWORD` | First-boot admin seed | New value in Replit Secrets; on next bootstrap, the seeded admin uses the new password. Existing admin records in DB are unaffected. |
| `AI_AGENT_SHARED_TOKEN` | App ↔ AI sidecar mutual auth | Fresh value; rotate on **both** `vex-app` and `vex-ai-agent` containers in lock-step (otherwise the sidecar will reject calls). |
| `AI_AGENT_PAYLOAD_SALT` | Hashes payloads sent to AI sidecar | Fresh value; old hashes in logs become uncorrelatable (acceptable for forward-only telemetry). |
| `AI_AGENT_PRIVACY_SALT` | Pseudonymises user IDs in AI telemetry | Fresh value; same caveat as above. |
| `VAPID_PRIVATE_KEY` (browser web-push) | Signs push payloads to browsers | `web-push generate-vapid-keys`; **public key changes too** → all subscribed browsers must re-subscribe (handle by versioning the SW + dropping old subscriptions in DB). |
| `WEB_PUSH_VAPID_PRIVATE_KEY` (server-side push) | Signs server-initiated push | Same as above — keep the **public** key in `WEB_PUSH_VAPID_PUBLIC_KEY` aligned. |
| `ADMIN_RESET_PASSWORD`, `SMTP_PASS`, `ADMIN_SMOKE_PASSWORD`, `SMOKE_PASSWORD` | Shared the same literal as `TURN_PASSWORD` (credential reuse — see audit § C0-01) | Already rotation-required by virtue of the TURN leak; rotate each independently this time so reuse never recurs. |

### 1C. Public values that are NOT secrets (do not rotate)

| Env var | Why it's safe in `.env.example` |
|---|---|
| `VITE_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PUBLIC_KEY` | VAPID **public** keys are designed to be shipped to every browser. No rotation needed unless you rotated the matching private key. |
| `ANDROID_KEYSTORE_PATH`, `ANDROID_KEY_ALIAS` | Path + alias only. Real protection is the password. |
| `LIVEKIT_URL`, `TURN_EXTERNAL_IP`, `TURN_REALM`, `PUBLIC_RTC_*_URLS`, `PUBLIC_RTC_TURN_USERNAME` | Server addresses + non-secret usernames. |

---

## 2. Working-tree state (this task — `[AGENT-DONE]`)

`.env.example` and `attached_assets/Pasted---1777211079902_1777211079903.txt` working-tree copies have been verified clean. **30** `__REDACTED_USE_REPLIT_SECRETS__` placeholders are now in `.env.example`. The `M12122099m!!!!` partial literal that briefly appeared in `docs/mobile/PRO_AUDIT_2026-04.md` § C0-01 has been replaced with an indirect reference to this playbook.

Verification (already passing as of this commit):

```bash
# Should print nothing — every assignment is a placeholder, public-key, or non-secret.
rg -nP "^[A-Z][A-Z0-9_]*\s*=\s*[A-Za-z0-9+/=!@#\$%^&*_-]{16,}\s*$" .env.example \
  | rg -v "REDACTED|=replace_with|=postgres://|@vex-|http:|https:|wss:|stun:|turn:|VITE_VAPID_PUBLIC_KEY|WEB_PUSH_VAPID_PUBLIC_KEY|ANDROID_KEY_ALIAS|ANDROID_KEYSTORE_PATH|LIVEKIT_URL|TURN_EXTERNAL_IP|TURN_REALM|PUBLIC_RTC"

# Should print nothing — the partial password literal is not in the working tree.
rg -l "M12122099"
```

---

## 3. Rotation order — `[OWNER]` to execute

**Sequence is deliberate.** Run top-to-bottom; never skip.

### Step 3.1 — Rotate Android keystore passwords (in place)

Keep the same `.jks` file (so the SHA-1/SHA-256 fingerprint that Play Store knows stays the same). Only the `-storepass` and `-keypass` change:

```bash
# Run from the host that has android/keystore/vex-release-official.jks.
KEYSTORE=android/keystore/vex-release-official.jks
ALIAS=vex_release_official

keytool -storepasswd -keystore "$KEYSTORE"
# Prompts: old store password, new store password (twice).

keytool -keypasswd -alias "$ALIAS" -keystore "$KEYSTORE"
# Prompts: store password (the NEW one), old key password, new key password (twice).
```

Verify the store still opens with the new passwords and that the cert fingerprints haven't changed:

```bash
keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" \
  | grep -E "SHA-?(1|256)|Valid"
```

Update **Replit Secrets** with the new values (overwrite, do NOT delete + re-add — keeps the audit trail simple):

- `ANDROID_KEYSTORE_PASSWORD` ← new store password
- `ANDROID_KEY_PASSWORD` ← new key password

Update your local shell environment (and any CI runner that signs builds) to match.

Smoke the build pipeline:

```bash
node scripts/mobile-android-build.mjs assembleRelease
# Must exit 0 and produce a signed .apk/.aab.
```

### Step 3.2 — Rotate LiveKit

In the **LiveKit Cloud admin console** (https://cloud.livekit.io):

1. Project → API Keys → revoke the leaked API key.
2. Create a new API key + secret pair.
3. Copy the new values into Replit Secrets:
   - `LIVEKIT_API_KEY` ← new key
   - `LIVEKIT_API_SECRET` ← new secret
   - `LIVEKIT_KEYS` ← `<new_key>: <new_secret>` (the colon-separated form some SDKs read)
4. Also update the production `.env` on the Hostinger VPS and `docker compose restart vex-app`.

Verification: a fresh call connects without auth errors in `vex-app` logs (`docker logs vex-app | grep -i livekit`).

### Step 3.3 — Rotate TURN (read carefully — TWO auth modes coexist)

The codebase supports **two** TURN auth flows. Production currently uses the first; the second is a legacy/fallback that is also wired and must be rotated too.

**Mode A — REST-API ephemeral credentials (current production path).** `server/lib/turn-credentials.ts` reads `TURN_STATIC_SECRET` and signs short-lived HMAC credentials per request. coturn matches with `use-auth-secret` + `static-auth-secret=<same value>` in `turnserver.conf`. **`docker-compose.prod.yml` exposes only `TURN_STATIC_SECRET` to the runtime** (lines 241, 396).

```bash
# On the Hostinger VPS:
NEW_TURN_SECRET=$(openssl rand -hex 32)

# 1. Update coturn config (path will be either /etc/coturn/turnserver.conf inside the
#    container, or a bind-mounted file from the host — verify first):
docker exec vex-coturn sh -c "sed -i 's/^static-auth-secret=.*/static-auth-secret=$NEW_TURN_SECRET/' /etc/coturn/turnserver.conf"

# 2. Update the .env on the host so the value survives a container recreate:
sed -i "s/^TURN_STATIC_SECRET=.*/TURN_STATIC_SECRET=$NEW_TURN_SECRET/" /opt/vex/.env

# 3. Restart coturn AND vex-app together (both must agree on the secret in lock-step
#    or every WebRTC call fails until they do):
docker compose -f docker-compose.prod.yml restart vex-coturn vex-app
```

Also update **Replit Secrets** in the workspace (`TURN_STATIC_SECRET` ← new value) so dev/CI agree.

**Mode B — Long-term static credential (legacy fallback path).** `scripts/vps-bootstrap.sh` (lines 320, 328, 336) writes `TURN_PASSWORD` into the host `.env` and mirrors it into `PUBLIC_RTC_TURN_CREDENTIAL`. `server/lib/public-rtc.ts:88` reads `PUBLIC_RTC_TURN_CREDENTIAL` and ships it to clients as a long-term credential. **This is the value that was leaked in `.env.example`.** Even if production has migrated to Mode A, this path is still wired — if it's left unrotated, anyone with the old leaked value can still authenticate against any coturn that accepts the static-user form.

```bash
# Decide first: is your coturn deployment configured with `user=vixo:<password>` (long-term)
# OR only `use-auth-secret` (REST-API)? If only the latter, Mode B's password is a no-op
# and you can simply blank both env vars. Verify with:
docker exec vex-coturn grep -E "^(user=|use-auth-secret)" /etc/coturn/turnserver.conf

# If `user=vixo:...` is present, rotate it:
NEW_TURN_PASS=$(openssl rand -hex 24)
docker exec vex-coturn sh -c "sed -i 's|^user=vixo:.*|user=vixo:$NEW_TURN_PASS|' /etc/coturn/turnserver.conf"

# Update the host .env (both keys — they're aliases of each other in the bootstrap script):
sed -i "s/^TURN_PASSWORD=.*/TURN_PASSWORD=$NEW_TURN_PASS/" /opt/vex/.env
sed -i "s/^PUBLIC_RTC_TURN_CREDENTIAL=.*/PUBLIC_RTC_TURN_CREDENTIAL=$NEW_TURN_PASS/" /opt/vex/.env

# Update Replit Secrets to match.
docker compose -f docker-compose.prod.yml restart vex-coturn vex-app
```

**Smoke** (after either rotation): join a 2-party voice room from two browsers; confirm `iceConnectionState === 'connected'` (not `failed`) in DevTools, and check `docker logs vex-coturn --tail 100` shows `session created` rather than `auth error`.

### Step 3.4 — Rotate the infrastructure-layer secrets discovered in this task

Each one in turn. After each rotation, restart the dependent containers and confirm the app boots cleanly before moving to the next.

| Order | Secret | Rotation command (one-liner) | Restart |
|---|---|---|---|
| a | `POSTGRES_PASSWORD` | `docker exec vex-db psql -U postgres -c "ALTER USER vex_user WITH PASSWORD '<new>';"` | `vex-app`, `vex-ai-agent` |
| b | `REDIS_PASSWORD` | edit `redis.conf` `requirepass <new>` | `vex-redis`, `vex-app`, `vex-ai-agent` |
| c | `MINIO_ROOT_PASSWORD` + `MINIO_SECRET_KEY` | `mc admin user password <alias> vex_minio_admin <new>` (or recreate access key) | `vex-minio`, `vex-app` |
| d | `AI_AGENT_SHARED_TOKEN` | generate fresh with `openssl rand -hex 32`, update **both** `vex-app` and `vex-ai-agent` Replit Secrets in lock-step | both, restart together |
| e | `AI_AGENT_PAYLOAD_SALT`, `AI_AGENT_PRIVACY_SALT` | `openssl rand -hex 32` each | `vex-ai-agent` |
| f | `SESSION_SECRET` | `openssl rand -hex 48` | `vex-app` (logs everyone out — accept it) |
| g | `JWT_SIGNING_KEY` (+ `JWT_USER_SECRET` alias) | `openssl rand -hex 48` | `vex-app` (forces re-auth) |
| h | `ADMIN_JWT_SECRET` (+ `JWT_ADMIN_SECRET` alias) | `openssl rand -hex 48` | `vex-app` (admin re-auth) |
| i | **`SECRETS_ENCRYPTION_KEY`** | **DO NOT swap blindly** — see § 3.5 below | special procedure |
| j | `ADMIN_BOOTSTRAP_PASSWORD` | `openssl rand -base64 24` | none — only used at first-boot |
| k | `WEB_PUSH_VAPID_PRIVATE_KEY` (+ matching `WEB_PUSH_VAPID_PUBLIC_KEY`) — see § 3.6 | `npx web-push generate-vapid-keys` once; rotate both halves of the pair together | `vex-app` + forced client re-subscription (see § 3.6) |
| k.bis | `VAPID_PRIVATE_KEY` (apparently unused at runtime — `rg "process\\.env\\.VAPID_PRIVATE_KEY" server/` returns no hits as of 2026-04) | Generate fresh anyway since the literal leaked, OR remove the dead env var from `.env.example` after confirming with `git log -p -S 'VAPID_PRIVATE_KEY'` that no live code path reads it. | none if truly unused |
| l | `ADMIN_RESET_PASSWORD`, `SMTP_PASS`, `ADMIN_SMOKE_PASSWORD`, `SMOKE_PASSWORD` | `openssl rand -base64 24` each — **distinct values per surface, no reuse** | none / SMTP / smoke runner |

### Step 3.6 — VAPID rotation: forced client re-subscription procedure

Rotating `WEB_PUSH_VAPID_PRIVATE_KEY` alone is not enough. Browsers cache push subscriptions tied to the **public** key (`applicationServerKey`); existing subscriptions in `vex-app`'s DB will silently reject every push signed with the new private key. Procedure:

1. Generate the new pair: `npx web-push generate-vapid-keys --json` → captures `{ publicKey, privateKey }`.
2. Update **both** Replit Secrets in lock-step: `WEB_PUSH_VAPID_PUBLIC_KEY` ← new public, `WEB_PUSH_VAPID_PRIVATE_KEY` ← new private. Mirror to production `.env`.
3. **Bump the service-worker version constant** (e.g. `CACHE_VERSION` in `client/public/sw.js` or wherever the SW lives) so every browser fetches a fresh SW on next load.
4. Add a one-shot client routine that runs on SW activation: `registration.pushManager.getSubscription().then(s => s && s.unsubscribe())` followed by a fresh `subscribe({ applicationServerKey: NEW_PUBLIC_KEY })`. Without this, the browser keeps the stale subscription forever.
5. **Truncate the DB-side subscription store** (or mark all rows `revoked_at = NOW()`) so old endpoints stop being targeted. Find the table with `rg "push_subscription|webPushSubscription" server/db/`.
6. `vex-app` restart, then a smoke push to a freshly-loaded browser.

### Step 3.5 — `SECRETS_ENCRYPTION_KEY` rotation (special — read carefully)

The `.env.example` previously held **two different** `SECRETS_ENCRYPTION_KEY` values (line 67 was 128-hex, line 295 was 64-hex). The deployed container reads exactly one of them. Procedure:

1. SSH into the VPS, `docker exec vex-app env | grep SECRETS_ENCRYPTION_KEY`. That's the one currently in use — call it `OLD`.
2. Generate `NEW` = `openssl rand -hex 32`.
3. Add a temporary `SECRETS_ENCRYPTION_KEY_PREVIOUS=$OLD` env var (the codebase needs to support this — verify with `rg "SECRETS_ENCRYPTION_KEY" server/`).
4. Set `SECRETS_ENCRYPTION_KEY=$NEW`.
5. Run the re-encryption migration (one-shot; if no migration script exists, write one that decrypts every encrypted column with `OLD` and re-encrypts with `NEW`).
6. Once verified, delete `SECRETS_ENCRYPTION_KEY_PREVIOUS`.

If no encrypted columns exist yet, the rotation is a simple swap. **Verify before assuming.**

---

## 4. Git-history scrub — `[OWNER]` with explicit approval

> **Destructive.** Rewrites every commit that touched `.env.example` or the attached paste. Forces every contributor to re-clone. **Get explicit owner approval before running.** The agent will not execute these commands autonomously.

### 4.1 — Decide the scope

Two options, in increasing aggressiveness:

| Option | What it does | When to pick |
|---|---|---|
| **A. Replace-text scrub** | `git filter-repo --replace-text leaked-literals.replacements` rewrites every blob, replacing each leaked literal with `***REMOVED***`. History stays linear, every other commit content is preserved. | **Recommended for VEX.** Minimal disruption, exact targeting. |
| **B. Path-removal scrub** | `git filter-repo --invert-paths --path .env.example --path attached_assets/Pasted---1777211079902_1777211079903.txt` removes the offending files entirely from history. | Only if you want the files to never have existed. Heavier impact on PR diffs that referenced them. |

Pick A unless there's a reason not to.

### 4.2 — Prerequisites

```bash
# Install git-filter-repo (Replit workspace doesn't ship it).
pip install --user git-filter-repo
# OR macOS:  brew install git-filter-repo
# OR Debian: apt install git-filter-repo
```

Make a **fresh mirror clone** — never run filter-repo against your working repo:

```bash
cd /tmp
git clone --mirror git@github.com:duxexch/vex.git vex-scrub.git
cd vex-scrub.git
```

### 4.3 — Build the literal-replacement file

We need **two files** generated from the same source extraction:

- `/tmp/leaked-literals.values` — one literal per line, no transformations. Used by `grep -F -f` for the §5 verification pass.
- `/tmp/leaked-literals.replacements` — one `<literal>==>***REMOVED***` per line. Used by `git filter-repo --replace-text`.

Keeping them separate fixes the silent-PASS bug where verification greps with `-F -f` against a file containing `==>` markers and finds nothing. **Neither file may be committed.**

```bash
# 1. Pull every leaked literal out of git history. Cover three shapes:
#    - bare assignments (`KEY=value`)
#    - quoted assignments (`KEY="value with spaces"` or single-quoted)
#    - URL-embedded credentials (`postgres://user:LEAKED_PASSWORD@host/db`,
#      `redis://:LEAKED_PASSWORD@host:6379/0`)
# Use a Python helper because awk/grep struggle with quote handling.

cat > /tmp/extract-leaks.py <<'PY'
import re, subprocess, sys
VARS = """POSTGRES_PASSWORD REDIS_PASSWORD MINIO_ROOT_PASSWORD MINIO_SECRET_KEY
SESSION_SECRET JWT_SIGNING_KEY ADMIN_JWT_SECRET SECRETS_ENCRYPTION_KEY
JWT_USER_SECRET JWT_ADMIN_SECRET ADMIN_BOOTSTRAP_PASSWORD
AI_AGENT_SHARED_TOKEN AI_AGENT_PAYLOAD_SALT AI_AGENT_PRIVACY_SALT
VAPID_PRIVATE_KEY WEB_PUSH_VAPID_PRIVATE_KEY
ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD
LIVEKIT_API_KEY LIVEKIT_API_SECRET LIVEKIT_KEYS
TURN_PASSWORD TURN_STATIC_SECRET PUBLIC_RTC_TURN_CREDENTIAL
ADMIN_RESET_PASSWORD SMTP_PASS ADMIN_SMOKE_PASSWORD SMOKE_PASSWORD
DATABASE_URL REDIS_URL""".split()
PLACEHOLDER_PREFIXES = ("__REDACTED", "replace_with", "your_", "changeme")

literals = set()
for var in VARS:
    # Get every blob in history that ever touched this assignment.
    out = subprocess.run(
        ["git", "log", "--all", "-p", "-S", f"{var}=", "--", ".env.example",
         "attached_assets/"],
        capture_output=True, text=True, check=True,
    ).stdout
    for line in out.splitlines():
        # Bare assignment.  Strip leading `+` from diff context.
        m = re.match(rf'^\+?\s*{re.escape(var)}=([^\s"\']*)\s*$', line)
        if m and m.group(1) and not m.group(1).startswith(PLACEHOLDER_PREFIXES):
            literals.add(m.group(1))
        # Quoted assignment.
        m = re.match(rf'^\+?\s*{re.escape(var)}=(?:"([^"]+)"|\'([^\']+)\')\s*$', line)
        if m:
            v = m.group(1) or m.group(2)
            if v and not v.startswith(PLACEHOLDER_PREFIXES):
                literals.add(v)
        # URL-embedded password (postgres://user:PASS@host or redis://:PASS@host).
        for m in re.finditer(r'(?:postgres(?:ql)?|redis|amqp|mongodb)://[^:\s]*:([^@\s"\']+)@', line):
            literals.add(m.group(1))

# Drop trivially short matches that are likely false positives.
literals = {l for l in literals if len(l) >= 8}
for l in sorted(literals, key=len, reverse=True):
    print(l)
PY

python3 /tmp/extract-leaks.py > /tmp/leaked-literals.values

# 2. Manual review pass — the values file is the most sensitive artifact in this entire
#    operation. Open it, scan for any false positives (e.g. example values that aren't
#    actually leaks), and delete those lines:
${EDITOR:-vi} /tmp/leaked-literals.values

# 3. Build the replacement file. Sort by length descending so longer matches win
#    (filter-repo applies replacements in file order; longer-first prevents partial overlap).
awk '{ print $0 "==>***REMOVED***" }' /tmp/leaked-literals.values > /tmp/leaked-literals.replacements

# 4. Sanity-check counts:
echo "literals to scrub: $(wc -l < /tmp/leaked-literals.values)"
echo "replacement rules: $(wc -l < /tmp/leaked-literals.replacements)"
```

### 4.4 — Run the scrub

```bash
cd /tmp/vex-scrub.git
git filter-repo --replace-text /tmp/leaked-literals.replacements --force
```

Verify nothing leaked through. **Use the `.values` file (raw literals), NOT the `.replacements` file** — grepping with `-F -f` against a file containing `==>***REMOVED***` markers will silently match nothing and report a false PASS:

```bash
git log --all -p | grep -F -f /tmp/leaked-literals.values | head -20
# Expected: empty output. If non-empty, the scrub missed something — fix and rerun before pushing.
```

### 4.5 — Force-push

**Coordinate first.** Any open PRs or local clones held by collaborators will be invalidated.

```bash
# After every collaborator has pushed their work and confirmed they're ready:
cd /tmp/vex-scrub.git
git push --force --all
git push --force --tags
```

### 4.6 — Post-scrub housekeeping

> **Order matters.** Run §5 verification **before** shredding the artifact files — §5 needs `/tmp/leaked-literals.values` to confirm the post-scrub clone is clean.

1. Notify collaborators they must `git fetch && git reset --hard origin/<branch>` (or re-clone).
2. Open a follow-up: ask GitHub support to invalidate cached views of the leaked SHAs (the GitHub UI shows old commit content for a while even after a forced push).
3. Check **all forks** of this repo on GitHub — `git filter-repo` does NOT propagate to forks. If any exist, contact the fork owners or use GitHub support to suspend them.
4. Audit dependabot / CI runs that may have cached the old secrets in build logs.
5. **Once §5 PASSes**, securely delete every artifact that holds the leaked literals:
   ```bash
   shred -u /tmp/leaked-literals.values /tmp/leaked-literals.replacements /tmp/extract-leaks.py
   rm -rf /tmp/vex-scrub.git
   ```

---

## 5. Final verification (post-rotation, post-scrub)

Run on a fresh clone:

```bash
git clone git@github.com:duxexch/vex.git vex-postscrub
cd vex-postscrub

# (a) Working tree clean.
rg -l "M12122099" && echo "FAIL" || echo "PASS"

# (b) History clean. Should print PASS.
if [ ! -s /tmp/leaked-literals.values ]; then
    echo "FAIL — /tmp/leaked-literals.values is missing or empty; cannot verify"
    exit 1
fi
HITS=$(git log --all -p | grep -F -f /tmp/leaked-literals.values | wc -l)
if [ "$HITS" -eq 0 ]; then echo "PASS (no historical hits)"; else echo "FAIL ($HITS hits remain)"; fi

# (c) App boots with new secrets (run the smoke).
docker compose up -d
docker compose exec vex-app curl -fsS http://localhost:3000/healthz
```

Update `replit.md` § "Android Release Signing" to record the new keystore-password rotation date. Mark this task complete only after all three checks pass.

---

## 6. What the agent did NOT do (and why)

| Action | Why agent skipped |
|---|---|
| Run `keytool -storepasswd` / `-keypasswd` | The `.jks` lives on the owner's machine, not in the Replit workspace (`android/` is gitignored). Even if it did, the agent has no access to the current passwords. |
| Rotate LiveKit | External admin console; no API path that doesn't require the owner's account. |
| Rotate TURN | Coturn lives on the Hostinger VPS; agent has no SSH access. |
| Rotate Postgres / Redis / MinIO | Production containers on the VPS; same access constraint. |
| Update Replit Secrets values | Agent can see existence of secrets but cannot read or write their values. |
| Run `git filter-repo` | (1) Tool not installed in the workspace by default. (2) Destructive history rewrite — explicit owner approval required per the project's standing rules in `replit.md` § "User Preferences" / `AGENTS.md` § 4. (3) Force-push needs coordination with anyone holding open branches. |

The agent's job ends at: working-tree clean, comprehensive playbook ready, owner-actionable steps documented. The owner drives every step in §§ 3–4.
