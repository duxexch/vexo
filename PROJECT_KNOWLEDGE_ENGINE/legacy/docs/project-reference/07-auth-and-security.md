# 07 - Auth and Security Map

## Auth route composition

Auth registry: `server/routes/auth/index.ts`

Modules:

1. one-click registration/login
2. username registration/login
3. alternative login methods
4. session and refresh routes
5. 2FA setup and verification
6. password recovery flows
7. OTP flows

## Authentication middleware model

Main file: `server/routes/middleware.ts`

Token sources accepted by middleware:

- Authorization header (`Bearer <token>`)
- httpOnly cookie (`vex_token`)

User checks performed:

1. token verification
2. user existence and status checks
3. lockout checks
4. password-change invalidation
5. optional session fingerprint enforcement
6. role hydration from DB (do not trust token role alone)

## Fingerprint behavior

Session fingerprint enforcement is strict in production by default.

Current behavior summary:

- enforced when `NODE_ENV=production`
- can be forced with `ENFORCE_SESSION_FINGERPRINT=true`
- relaxed in local development to avoid false session invalidation when user-agent changes during testing

## Admin security path

Admin auth modules live under `server/admin-routes/*`.

Typical admin token transport:

- `x-admin-token` header for admin endpoints

Admin protection includes:

- role validation
- account status checks
- sensitive route protection and audit logging paths

## Rate limiting

Rate-limiters are configured in middleware/setup layers:

- auth limiter
- strict limiter
- API limiter
- attack protection limiter
- operation-specific limiters (OTP, password reset, sensitive actions)

## Additional security controls

- cookie parser + secure cookie options
- CORS controls by environment
- security headers and CSP in server bootstrap
- account lockout and failed login counters
- support for 2FA and backup codes

## Security triage checklist

1. Repeated 401 after login:
   - check frontend token source and auth headers
   - check fingerprint enforcement and environment
2. Admin 401/403:
   - validate admin token path and role status
3. brute-force concerns:
   - verify limiter coverage on target route
4. session not persisting:
   - inspect cookie options, host consistency, and token refresh path
