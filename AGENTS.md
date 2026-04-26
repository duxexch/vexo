# AGENTS.md — Cross-Agent Operating Rules for VEX

This file is the canonical entry point for any agent (Replit main agent,
planning agent, design agent, isolated task agent, code-review agent, or any
external/third-party agent) working in this repository. It deliberately
duplicates the parts of `replit.md` that ALL agents must follow regardless of
runtime, so a non-Replit agent can succeed without ever reading the rest of
`replit.md`.

When `replit.md` and this file disagree, `replit.md` wins — but please open
a follow-up to reconcile them.

---

## 1. Cross-Surface Rule (PERMANENT, Task #177)

> **Every feature, fix, redesign, or polish item in VEX must work — and look
> right — on the desktop browser, on Android (Capacitor WebView), on iOS
> (when present), AND across every supported screen size, before it can be
> considered done.**

This rule applies to:

- New features and refactors.
- Bug fixes (regression-fix and bug-fix tasks must be verified on every surface).
- Design changes (animations, gestures, transitions, spacing, colour, typography).
- Permission flows and any native plugin work.

### Supported screen-size buckets

| Bucket | Width range | Representative devices |
|---|---|---|
| `xxs` | ≤ 360 px | Old/budget Android phones |
| `xs`  | 361 – 414 px | Modern phones in portrait (iPhone 12-15, Pixel 6-8, S22-24) |
| `sm`  | 415 – 599 px | Phablets / phones in large-text mode |
| `md`  | 600 – 767 px | Small tablets, foldables half-open |
| `lg`+ | ≥ 768 px | Tablets, foldables open, desktop browser |

### Required surfaces for "done"

1. **Desktop browser** — Chrome/Edge/Firefox at ≥ 1280 px, plus a 360 px responsive-mode pass.
2. **Mobile web (Safari iOS + Chrome Android)** — at least one phone-bucket width.
3. **Capacitor Android (WebView)** — verified through the existing release-build pipeline. At minimum the touched screens are loaded once on a real Android device or emulator.
4. **iOS (Capacitor)** — verified when the change touches iOS-specific code paths (CallKit, push, deep links, status-bar/safe-area, haptics).

A Playwright smoke at one viewport does **not** satisfy the rule on its own.
Add a desktop check + a mobile check at minimum, and document any surface
that is intentionally out of scope (with reason) inside the task plan.

---

## 2. Performance & Smoothness Priority

The user has explicitly requested that **performance and smoothness
(animations, gestures, transitions, time-to-interactive, frame stability)
take priority over net-new features**. When proposing or executing work:

- Prefer "make this smoother" over "add another panel".
- For any new UI, justify the animation/transition budget (target 60 fps on
  a 4-year-old mid-range Android — Pixel 4a / Galaxy A52 class).
- Keep splash → first-paint → first-interactive under control. If a change
  pushes any of those past the existing budget, flag it in the task plan.

---

## 3. Secrets — never in the repo, ever

- All passwords, tokens, API keys, OAuth secrets, signing-keystore passwords,
  and TURN credentials live in **Replit Secrets** (or the deployment's secret
  manager), **never** in any tracked file — including `.env.example`,
  attached pastes under `attached_assets/`, README snippets, or comments.
- `.env.example` is for **placeholders + key names only**. Use
  `__REDACTED_USE_REPLIT_SECRETS__` (or similar) when documenting that a key
  exists.
- If you discover a secret committed in plain text: stop, redact the
  working-tree copy, document the leak in `.local/mobile-audit.md` (or a
  fresh audit doc), and propose a follow-up task for rotation + history
  scrub. **Never run `git filter-repo`, `git filter-branch`, or any history
  rewrite autonomously** — destructive git ops require explicit user approval
  and a dedicated task.

---

## 4. Android release-signing canon

See `replit.md` § "Android Release Signing" for the full spec. The short
version every agent must know:

- Required env vars: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`.
- **Gradle is the source of truth.** `android/app/build.gradle` reads the
  four env vars directly via `System.getenv("ANDROID_…")` inside its
  `signingConfigs.release` block. The canonical snippet to paste lives at
  `docs/mobile/android-signing-gradle-snippet.md`.
- Passwords are **never** written to any file — not `signing.properties`,
  not `gradle.properties`, not `capacitor.config.ts`, not a gradle command
  line. The build script (`scripts/mobile-android-build.mjs`) only
  validates env + the snippet's presence, then forwards env to gradle.
- Keystore alias is `vex_release_official`. SHA-1 fingerprint is
  `7F:8D:A0:CB:12:42:1A:7F:90:6D:43:2E:6C:C2:96:1A:DD:AE:C8:B8`. If a build
  is signed with anything else, the resulting APK/AAB will be rejected by
  Play Store updates and overlay-install on user devices.

---

## 5. Communication & language

- The user prefers Arabic for chat. Internal artifacts (code, docs, audits,
  task plans) stay in English unless the user asks otherwise — that keeps
  diffs and grep-ability consistent across the repo.
- Never name internal tools or skill names in user-facing messages.

---

## 6. Where to find more context

- `replit.md` — full project overview, architecture, quality gates, mobile
  verification index, signing canon.
- `.local/mobile-audit.md` — Task #177 audit of every native/web parity gap
  and performance risk; propose follow-ups against this list rather than
  re-discovering the same gaps.
- `docs/` — playbooks (CALL_PERMISSIONS_PLAYBOOK, CHAT_BUBBLES_PLAYBOOK, …)
  and per-feature device-test checklists under `docs/device-tests/`.
- `.local/tasks/` — every project task plan and the open task list. Always
  scan this before proposing new work to avoid overlap.
