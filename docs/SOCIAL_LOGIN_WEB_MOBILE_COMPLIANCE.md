# Social Login Web/Mobile Compliance Guide

This guide defines the production-safe OAuth setup for VEX so social login works reliably on both web and mobile while following provider policies.

## Current VEX Auth Endpoints

Use these callback paths exactly:

- Google: `https://vixo.click/api/auth/social/google/callback`
- Facebook: `https://vixo.click/api/auth/social/facebook/callback`
- Apple: `https://vixo.click/api/auth/social/apple/callback`
- X/Twitter: `https://vixo.click/api/auth/social/twitter/callback`
- Discord: `https://vixo.click/api/auth/social/discord/callback`
- GitHub: `https://vixo.click/api/auth/social/github/callback`
- LinkedIn: `https://vixo.click/api/auth/social/linkedin/callback`

## Security Baseline (All Providers)

- Always use HTTPS redirect URIs in production.
- Use exact redirect URI match (no wildcard callback paths).
- Enable PKCE where supported.
- Keep OAuth app credentials server-side only.
- Use minimum scopes required for login.
- Rotate client secrets regularly and after team/offboarding changes.
- Never pass JWT in callback URL; VEX uses one-time exchange code.
- Reject unsafe post-login redirect values (VEX now sanitizes these server-side).

## Web + Mobile Policy Alignment

- Web flow: popup or top-level redirect to provider auth page.
- Mobile flow: open provider auth in system browser (Custom Tabs / ASWebAuthenticationSession equivalent).
- Do not use embedded provider login forms inside a WebView for social sign-in.
- Return to app using verified App Links / Universal Links to `https://vixo.click/auth/callback?...`.
- Google on Android must use the native Google Sign-In SDK path (`sdk-only`) with backend token exchange.
- Do not silently downgrade Google Android auth from SDK to browser OAuth unless incident mitigation explicitly requires it.

VEX implementation notes:

- Native builds use Capacitor Browser for social OAuth launch.
- App URL callback is handled via Capacitor `appUrlOpen`.
- Google native flow uses SDK token exchange endpoint (`/api/auth/social/google/native/exchange`) and enforces audience validation.

Recommended production flags:

- `GOOGLE_ANDROID_LOGIN_MODE=sdk-only`
- `GOOGLE_ANDROID_ALLOW_WEB_CLIENT_FALLBACK=false`
- `OAUTH_STATE_BINDING_STRICT=true`
- `SOCIAL_OAUTH_DISABLED_PROVIDERS=` (optional kill-switch list)
- `SOCIAL_ACCOUNT_LINKING_POLICY=strict-verified-email` (recommended for higher assurance)

## Configuration Source Policy (Admin Panel vs .env)

Use this precedence to avoid conflicts:

1. Admin panel (`social_platforms` in DB) is the primary source of truth.
2. `.env` is fallback/bootstrap only.
3. If both are configured, Admin panel takes precedence.

Recommended operation model:

1. Configure provider credentials in Admin panel first.
2. Keep related `.env` variables empty for the same provider.
3. Use `.env` only when bootstrap/fallback is required.
4. Restart backend services after editing `.env`.

If you must use fallback variables in `.env`, add only the provider you need:

- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Facebook: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- X/Twitter: `TWITTER_API_KEY`, `TWITTER_API_SECRET`
- Telegram (OTP adapter): `TELEGRAM_BOT_TOKEN`

Conflict warning:

- Do not maintain different values for the same provider in both Admin and `.env`.
- This creates operational ambiguity during rotation and incident response.

## OTP Stability Policy

- Enable OTP only after all required adapter fields are configured.
- Keep OTP expiry between 60 and 600 seconds.
- Ensure OTP template is set and includes a verification code placeholder.
- Validate each enabled provider using runtime checks before production activation.

## Provider-Specific Setup Checklist

### Google

- Create OAuth client in Google Cloud Console.
- Configure OAuth consent screen and verified domain.
- Add exact redirect URI: `/api/auth/social/google/callback`.
- Keep scopes limited to `openid email profile` unless business need requires more.

### Facebook

- Create Meta app and add Facebook Login product.
- Add exact Valid OAuth Redirect URI: `/api/auth/social/facebook/callback`.
- Confirm app mode/review requirements before production rollout.

### Apple

- Configure Sign in with Apple using proper Service ID / Key / Team settings.
- Add exact Return URL: `/api/auth/social/apple/callback`.
- Ensure domain association for production domain is completed.
- Keep Apple client secret JWT lifecycle monitored (expiry and rotation).

### X (Twitter)

- Use OAuth 2.0 app settings with exact callback URL.
- Keep scopes minimal and aligned to data actually consumed.

### Discord

- Add exact redirect URI in Discord application settings.
- Keep only `identify`/`email` unless additional scope is justified.

### GitHub

- Configure exact Authorization callback URL in GitHub OAuth App.
- Avoid over-privileged scopes (use read-only identity scopes).

### LinkedIn

- Configure exact Authorized Redirect URLs.
- Verify approved products/scopes in LinkedIn developer app.

## Launch Validation (Must Pass)

- Web callback returns successful login for each enabled provider.
- Native Android callback returns to app and completes login.
- Native iOS callback returns to app and completes login.
- Invalid `state` is rejected.
- Invalid callback params are rejected.
- Invalid post-login redirect is ignored/sanitized.

## Operational Recommendation

Enable only providers that are fully configured and approved in their developer console.
Keep non-ready providers disabled from admin panel until validation passes.
