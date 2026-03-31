# VEX Platform — Server-Side Security & Code Audit Report

**Date:** 2025-01-XX  
**Scope:** All 27 server-side files as specified  
**Methodology:** Static code analysis — bugs, security, performance, error handling, validation, code quality

---

## Executive Summary

The VEX platform is a real-money gaming and P2P trading application built on Express.js + PostgreSQL with WebSocket-based real-time games. The codebase demonstrates competent use of database transactions with row-level locking for financial operations in many areas, but contains **critical security vulnerabilities and financial integrity bugs** that must be addressed before production deployment.

**Issue Breakdown:**
| Severity | Count |
|----------|-------|
| CRITICAL | 12 |
| HIGH     | 18 |
| MEDIUM   | 16 |
| LOW      | 12 |

---

## CRITICAL Issues

### C-01: Non-Atomic Balance Operations in Game Play Route (Race Condition / Double-Spend)

**File:** `server/routes.ts` ~L60-120  
**Description:** The `/api/play` route reads the user's balance, performs game logic, then writes the new balance back. This read-modify-write pattern without a transaction or row lock allows concurrent requests to read the same balance simultaneously, leading to double-spend exploits. An attacker can send multiple rapid play requests and extract more money than their actual balance.  
**Severity:** CRITICAL  
**Fix:** Wrap the entire balance-check → game-outcome → balance-update flow in a `db.transaction()` with `SELECT ... FOR UPDATE` row locking, the same pattern already used in `storage.ts` `updateUserBalanceWithCheck()`.

---

### C-02: `Math.random()` Used for Gambling Outcomes

**File:** `server/routes.ts` ~L70-90  
**Description:** The game play endpoint uses JavaScript's `Math.random()` to determine win/loss outcomes. `Math.random()` uses a PRNG (xoshiro128) that is **not cryptographically secure** and can be predicted if an attacker can observe enough outputs. For a real-money gambling platform, this is a regulatory and financial liability.  
**Severity:** CRITICAL  
**Fix:** Replace with `crypto.randomInt()` or `crypto.randomBytes()` for all gambling-related randomness. Consider a provably-fair system with server seeds and client seeds.

---

### C-03: Double-Charge Bug in `handleSendGift` (Game WebSocket)

**File:** `server/game-websocket.ts` ~L740-780  
**Description:** When a player sends a gift in a live game, the code:
1. Calls `storage.transferBalance(senderId, recipientId, giftAmount)` to transfer the gift value
2. Then separately calls `storage.updateUserBalanceWithCheck(senderId, platformFee, 'subtract')` to deduct a platform fee

However, the platform fee deduction is a **separate transaction** from the gift transfer. This means:
- The sender is charged `giftAmount + platformFee` total
- If the platform fee deduction fails (e.g., insufficient balance after gift), the gift has already been sent but the platform doesn't collect its fee
- There is no rollback mechanism connecting these two operations  
**Severity:** CRITICAL  
**Fix:** Combine both operations into a single database transaction. The total deduction from sender should be `giftAmount + platformFee` in one atomic operation, with the recipient receiving `giftAmount`.

---

### C-04: CSP Policy Allows `unsafe-inline` and `unsafe-eval`

**File:** `server/index.ts` ~L45-65  
**Description:** The Content Security Policy header includes `'unsafe-inline'` for styles and scripts, and `'unsafe-eval'` for scripts. This effectively **neutralizes XSS protection** provided by CSP, as any injected script will execute.  
**Severity:** CRITICAL  
**Fix:** Remove `'unsafe-eval'` entirely. Replace `'unsafe-inline'` with nonce-based or hash-based CSP for inline scripts. Use `style-src 'self'` with external stylesheets.

---

### C-05: Upload Endpoint Does Not Verify JWT Token

**File:** `server/index.ts` ~L85-130  
**Description:** The `/api/upload` endpoint checks for the presence of an `authorization` header but **never actually verifies the JWT token**. The code extracts the header and checks `if (!authHeader)` but does not call `jwt.verify()`. Any request with any `Authorization` header value bypasses this "check."  
Additionally, the uploaded file path is derived from the original filename without sanitization, enabling potential path traversal (`../../etc/passwd`).  
**Severity:** CRITICAL  
**Fix:** 
1. Use the existing `authMiddleware` on this endpoint
2. Sanitize filenames: strip path separators, use a UUID-based filename
3. Validate allowed file types and sizes server-side

---

### C-06: Withdrawal Creates Transaction But Does NOT Deduct Balance

**File:** `server/routes/transactions.ts` ~L55-85  
**Description:** The withdrawal endpoint creates a transaction record with `status: "pending"` and calculates `balanceAfter`, but **does not actually deduct the user's balance**. The balance is only deducted when an agent later processes the transaction via `/api/transactions/:id/process`. However, there is no lock or hold on the user's balance between creation and processing, meaning:
- A user can create multiple withdrawal requests totaling more than their balance
- The processing endpoint re-reads the current balance and deducts, which may succeed because no balance was reserved  
**Severity:** CRITICAL  
**Fix:** Either deduct (or escrow/hold) the balance immediately when the withdrawal request is created, or use an atomic check-and-deduct pattern during processing with `SELECT ... FOR UPDATE`.

---

### C-07: Transaction Processing Has Race Condition on Balance

**File:** `server/routes/transactions.ts` ~L87-125  
**Description:** The `/api/transactions/:id/process` endpoint reads the user's current balance, then updates it. This is a non-atomic read-modify-write. Multiple concurrent approvals for the same user can cause balance corruption. The code also doesn't verify that the transaction hasn't already been processed (no status check before update).  
**Severity:** CRITICAL  
**Fix:** Wrap in a DB transaction with row-level locking. Check `transaction.status === "pending"` within the lock. Use `storage.updateUserBalanceWithCheck()` instead of manual read-update.

---

### C-08: P2P Trading Routes Use In-Memory Mock Data in Production

**File:** `server/routes/p2p-trading.ts` ~L43-130  
**Description:** The P2P offers and trades routes maintain arrays (`mockP2POffers`, `userP2POffers`, `userP2PTrades`) in server memory. This means:
- All user-created offers are lost on server restart
- Mock offers with fake user IDs are served to real users
- The "my-trades" endpoint returns hardcoded demo trades when no real trades exist
- Multiple server instances would have inconsistent state  
**Severity:** CRITICAL  
**Fix:** Remove all mock data and in-memory arrays. Use the already-existing `storage.getP2POffer()`, `storage.createP2POffer()` database methods for all P2P offer operations.

---

### C-09: Admin Balance Adjustment Has No Atomic Guarantee

**File:** `server/admin-routes.ts` ~L490-535  
**Description:** The admin balance adjustment endpoint reads the user's balance, calculates the new balance, then writes it. This non-atomic pattern means concurrent adjustments or concurrent user transactions could cause balance corruption. Negative balance check is done on stale data.  
**Severity:** CRITICAL  
**Fix:** Use `storage.updateUserBalanceWithCheck()` inside a transaction, or use SQL arithmetic with check constraint.

---

### C-10: Password Reset Token Returned in API Response

**File:** `server/routes/auth.ts` ~L295-320  
**Description:** The forgot-password endpoint generates a reset token and **returns it directly in the JSON response**: `res.json({ success: true, token: resetToken })`. This defeats the purpose of password reset security — the token should only be sent to the user's verified email/phone, never exposed in the API response. Any attacker who can trigger a password reset can immediately use the token.  
**Severity:** CRITICAL  
**Fix:** Send the token via email/SMS only. Return only a success message to the API caller. Never expose security tokens in API responses.

---

### C-11: Challenge Withdrawal Refund Not Atomic

**File:** `server/routes/challenges.ts` ~L620-665  
**Description:** When a user withdraws a challenge, the code reads the user's balance, calculates the refund, and updates via `db.update()` without a transaction or row lock. The balance read and write are separate operations, creating a race condition where the refund could be applied twice or to a stale balance.  
**Severity:** CRITICAL  
**Fix:** Use `storage.updateUserBalance()` (which uses SQL arithmetic) or wrap in a transaction with `FOR UPDATE`.

---

### C-12: Word Filter Regex `lastIndex` Bug (Stateful RegExp)

**File:** `server/lib/word-filter.ts` ~L22-43  
**Description:** The `bannedPatterns` array contains RegExp objects with the `g` (global) flag. RegExp objects with `g` flag maintain `lastIndex` state between calls to `.test()`. This means the `filterMessage()` function will intermittently **miss banned words** on every other call because `lastIndex` is not reset between invocations. This allows profanity to pass through the filter unpredictably.  
**Severity:** CRITICAL (for content moderation integrity)  
**Fix:** Either:
1. Remove the `g` flag from patterns used with `.test()`, or
2. Reset `pattern.lastIndex = 0` before each `.test()` call, or
3. Create new RegExp instances for each check

---

## HIGH Issues

### H-01: Duplicate Route Registrations

**File:** `server/routes.ts` (multiple locations)  
**Description:** Several routes are registered twice with potentially different implementations:
- `/api/notifications` (GET) — registered around L630 and L680
- `/api/notifications/unread-count` (GET) — registered twice
- `/api/user/nickname` (POST) — registered twice
- `/api/user/check-nickname/:nickname` (GET) — registered twice

Express uses the first matching handler, so the second registration is dead code or, if different middleware is applied, creates unpredictable behavior.  
**Severity:** HIGH  
**Fix:** Remove duplicate registrations. Audit all routes for uniqueness.

---

### H-02: Dashboard Stats Loads ALL Records Into Memory

**File:** `server/routes.ts` ~L20-55 (dashboard/stats route)  
**Description:** The `/api/dashboard/stats` endpoint calls `storage.listUsers()`, `storage.listAgents()`, `storage.listAffiliates()`, `storage.listGames()`, `storage.listTransactions()`, and `storage.listComplaints()` — each returning ALL rows. These are then filtered in JavaScript. With growth, this will OOM the server.  
**Severity:** HIGH  
**Fix:** Use SQL `COUNT(*)` and `SUM()` aggregation queries instead of loading full datasets.

---

### H-03: Chat Conversations Loads ALL Messages Without DB Pagination

**File:** `server/routes.ts` ~L2500-2560  
**Description:** The chat conversations endpoint loads ALL messages for a user from the database (no LIMIT), then groups and processes them in JavaScript. With active users, this becomes a memory and performance bomb.  
**Severity:** HIGH  
**Fix:** Add `LIMIT` and use SQL-level grouping with subqueries to get latest messages per conversation.

---

### H-04: Admin Login Has No Rate Limiting

**File:** `server/admin-routes.ts` ~L20-60  
**Description:** The admin login endpoint `POST /api/admin/login` does not apply any rate limiter middleware. This allows unlimited brute-force attempts against admin credentials.  
**Severity:** HIGH  
**Fix:** Apply `sensitiveRateLimiter` or a dedicated admin login rate limiter (e.g., 5 attempts per 15 minutes per IP).

---

### H-05: DB Query on Every Authenticated Request (Ban Check)

**File:** `server/routes/middleware.ts` ~L20-50  
**Description:** `authMiddleware` performs a full `storage.getUser(decoded.id)` DB query on **every authenticated request** to check ban/suspend status. With 50 max pool connections and high traffic, this creates a significant bottleneck.  
**Severity:** HIGH  
**Fix:** Cache ban/suspend status in Redis or an in-memory cache with short TTL (e.g., 30 seconds). Alternatively, use a lightweight query that only selects `status` rather than the full user row.

---

### H-06: ID Verification Stores Full Base64 Images in User DB Row

**File:** `server/routes.ts` ~L3700-3760  
**Description:** The ID verification endpoint stores base64-encoded images (front, back, selfie) directly in the `users` table columns. A single verification can add 5-10MB+ of data to a user row, bloating the users table and degrading all queries that touch it.  
**Severity:** HIGH  
**Fix:** Store images as files on disk or object storage (S3). Save only the file path/URL in the database.

---

### H-07: WebSocket `broadcastNotification` Has N+1 DB Insert Pattern

**File:** `server/websocket.ts` ~L1350-1400  
**Description:** `broadcastNotification()` iterates over userId array and performs a separate `storage.createNotification()` DB insert for each recipient. For broadcasts to many users, this creates N sequential DB operations.  
**Severity:** HIGH  
**Fix:** Use a batch insert: `db.insert(notifications).values(notificationRows)` for all recipients in one query.

---

### H-08: `broadcastToRoomFiltered` Does N DB Queries Per Broadcast

**File:** `server/game-websocket.ts` ~L100-130  
**Description:** Every game room broadcast calls `storage.isUserBlockedOrMuted()` once for each recipient. A game room with 4 players and spectators means 3+ DB queries per move/chat message.  
**Severity:** HIGH  
**Fix:** Cache block/mute relationships for active game rooms, or batch-query all block statuses for a room's participants at once.

---

### H-09: No Input Validation on User PATCH (Admin)

**File:** `server/routes/users.ts` ~L28-40 and `server/admin-routes.ts` ~L435-460  
**Description:** The `PATCH /api/users/:id` and `PATCH /api/admin/users/:id` endpoints accept `req.body` directly without validation. An attacker with admin access (or any authenticated user on the non-admin route) can modify arbitrary fields including `balance`, `role`, `gamesWon`, `totalEarnings`, etc.  
**Severity:** HIGH  
**Fix:** Define an explicit allowlist of updatable fields using Zod schema. For regular users, only allow safe fields (nickname, avatar, etc.). For admin, explicitly enumerate allowed fields.

---

### H-10: `process.exit(1)` on `uncaughtException`

**File:** `server/index.ts` ~L320-335  
**Description:** The `uncaughtException` handler logs the error, then calls `process.exit(1)`. While exiting on uncaught exceptions is recommended, the code logs via `console.error` but doesn't flush logs or perform graceful shutdown (close DB connections, drain WebSocket connections, complete in-flight financial transactions).  
**Severity:** HIGH  
**Fix:** Implement graceful shutdown: close HTTP server, drain WS connections, close DB pool, then exit. Use a timeout to force-exit if graceful shutdown takes too long.

---

### H-11: Conflicting Rate Limiter Definitions

**File:** `server/routes.ts` ~L15-25 vs `server/routes/middleware.ts` ~L85-115  
**Description:** Rate limiters with the same purpose are defined in two different files with different values:
- `apiRateLimiter`: 200 req/min in routes.ts vs 300 req/min in middleware.ts
- `sensitiveRateLimiter`: different window/max settings
- `authRateLimiter`: defined in routes/auth.ts separately

Routes may use a different rate limiter than intended. Some routes use the local one, others import from middleware.  
**Severity:** HIGH  
**Fix:** Centralize all rate limiter definitions in `routes/middleware.ts` and import everywhere.

---

### H-12: Challenge Join Lock Uses In-Memory Set (Not Distributed)

**File:** `server/routes/challenges.ts` ~L10, ~L305-310  
**Description:** `challengeJoinLocks` is an in-memory `Set<string>` used to prevent concurrent joins. With multiple server instances, this lock is not shared, allowing race conditions. Also, if the server crashes while a lock is held, it's never released (though restart clears it).  
**Severity:** HIGH  
**Fix:** The DB transaction with `FOR UPDATE` already handles concurrency correctly. The in-memory lock is redundant but if kept must be distributed (Redis-based) for multi-instance deployments. Remove the in-memory lock and rely on the DB transaction alone.

---

### H-13: Account ID Generation Uses `Math.random()` With Collision Loop

**File:** `server/storage.ts` ~L1180-1190 and `server/routes/auth.ts` ~L430  
**Description:** Account IDs are generated using `Math.floor(100000000 + Math.random() * 900000000)` in a retry loop that queries the DB for uniqueness. This has several issues:
1. `Math.random()` may generate predictable/sequential IDs
2. The loop can theoretically run forever if unlucky
3. No maximum retry count  
**Severity:** HIGH  
**Fix:** Use `crypto.randomInt(100000000, 999999999)` for unpredictable IDs. Add a maximum retry count (e.g., 10). Consider using a DB sequence or UUID.

---

### H-14: Admin Theme Create Accepts Arbitrary Body

**File:** `server/admin-routes.ts` ~L300-305  
**Description:** `POST /api/admin/themes` directly inserts `req.body` into the database without validation: `db.insert(themes).values(req.body)`. This allows SQL injection via crafted property names if drizzle doesn't fully sanitize, and allows setting unintended fields.  
**Severity:** HIGH  
**Fix:** Validate input with a Zod schema that explicitly defines allowed theme properties.

---

### H-15: OTP Code Returned in Development Response

**File:** `server/routes/auth.ts` ~L460-465  
**Description:** In non-production environments, the OTP send endpoint returns the OTP code directly: `...(process.env.NODE_ENV !== "production" && { devOtp: otpCode })`. If `NODE_ENV` is accidentally unset or misconfigured in production, OTP codes will be leaked in API responses.  
**Severity:** HIGH  
**Fix:** Use an explicit development-only flag or remove this entirely. Never include secrets in API responses, even conditionally.

---

### H-16: `userConnections` Map Overwrites Previous WebSocket

**File:** `server/game-websocket.ts` ~L50-60  
**Description:** `userConnections.set(userId, ws)` overwrites any existing connection for the same user. If a user opens a second browser tab, their first connection silently stops receiving game updates, but they remain in the room's player list. This can cause game state desynchronization.  
**Severity:** HIGH  
**Fix:** Either reject the second connection, or maintain a Set of connections per user and broadcast to all of them.

---

### H-17: Deposit Transaction Records `balanceAfter` Before Approval

**File:** `server/routes/transactions.ts` ~L25-50  
**Description:** The deposit endpoint calculates and stores `balanceAfter` at request time, before the deposit is approved. If the user's balance changes between request and approval (from game play, other deposits, etc.), the recorded `balanceAfter` is wrong. This creates inaccurate audit trail.  
**Severity:** HIGH  
**Fix:** Calculate `balanceAfter` only when the transaction is actually processed/approved, not at creation time.

---

### H-18: Health Endpoints Expose Sensitive Server Info Without Auth

**File:** `server/routes/health.ts` ~L1-103  
**Description:** `/api/health/detailed` and `/api/health/full` are unauthenticated and expose:
- Exact Node.js version, OS platform, architecture
- CPU count, load average, memory usage
- DB pool statistics (idle, total, waiting connections)
- Circuit breaker failure counts and states

This information aids attackers in crafting targeted exploits.  
**Severity:** HIGH  
**Fix:** Require admin authentication for `/api/health/detailed` and `/api/health/full`. Keep only the basic `/api/health` endpoint public (for load balancer health checks).

---

## MEDIUM Issues

### M-01: Hardcoded Mock Data in P2P Profile Endpoint

**File:** `server/routes.ts` ~L1780-1820  
**Description:** The P2P profile endpoint returns hardcoded mock statistics regardless of the actual user.  
**Severity:** MEDIUM  
**Fix:** Query actual user statistics from the database.

---

### M-02: Free Rewards Endpoints Return Hardcoded Mock Data

**File:** `server/routes.ts` ~L1930-1960  
**Description:** Free rewards endpoints return static mock data, non-functional reward claiming.  
**Severity:** MEDIUM  
**Fix:** Implement actual reward tracking or remove the endpoints.

---

### M-03: No Input Validation on Register Endpoint

**File:** `server/routes/auth.ts` ~L50-100  
**Description:** The register endpoint accepts `username` and `password` without any validation — no minimum length, character requirements, or format checks. A user can register with an empty password or a 1-character username.  
**Severity:** MEDIUM  
**Fix:** Add Zod validation schema: minimum username length (3+), password strength requirements (6+ chars, complexity), email format validation.

---

### M-04: Password Hashing Inconsistency (Salt Rounds)

**File:** Multiple files  
**Description:** Different parts of the codebase use different bcrypt salt rounds:
- `server/routes/auth.ts` register/login: `bcrypt.hash(password, 10)`
- Admin bootstrap: `bcrypt.hash(devPassword, 12)`
- Admin reset: `bcrypt.hash(resetPassword, 12)`

Using 10 rounds for user passwords but 12 for admin is inconsistent and 10 rounds is increasingly considered insufficient.  
**Severity:** MEDIUM  
**Fix:** Standardize on 12 rounds minimum for all password hashing. Define salt rounds as a constant.

---

### M-05: Emoji/Message Purchase Has No DB Transaction

**File:** `server/routes.ts` ~L3050-3090  
**Description:** The gameplay emoji purchase endpoint deducts balance without wrapping in a transaction. Concurrent purchases can overdraft the account.  
**Severity:** MEDIUM  
**Fix:** Use `storage.updateUserBalanceWithCheck()` with proper transaction handling.

---

### M-06: `listTransactions` Returns All Transactions Without Pagination

**File:** `server/storage.ts` ~L1070-1090  
**Description:** `listTransactions()` returns all matching transactions without any LIMIT clause. For admin viewing all transactions, this could return millions of rows.  
**Severity:** MEDIUM  
**Fix:** Add pagination parameters (limit, offset) to the storage method and enforce reasonable defaults.

---

### M-07: `listUsers` Returns All Users Without Pagination

**File:** `server/storage.ts` ~L340-345  
**Description:** `listUsers()` returns all users ordered by creation date with no limit. Called by admin dashboard.  
**Severity:** MEDIUM  
**Fix:** Add pagination. The admin-routes.ts version of user listing already has limit/offset, but the storage method doesn't enforce it.

---

### M-08: Challenge Enrichment Has N+1 Query Pattern

**File:** `server/routes/challenges.ts` ~L85-120, ~L130-170  
**Description:** Available and public challenge endpoints use `Promise.all(dbChallenges.map(async (c) => { await storage.getUser(c.player1Id); }))` — one DB query per challenge per player. With many challenges, this is an N+1 query amplification.  
**Severity:** MEDIUM  
**Fix:** Batch-fetch all required users in a single query using `WHERE id IN (...)`, then map locally.

---

### M-09: Forgot Password Reveals User Existence

**File:** `server/routes/auth.ts` ~L280-295  
**Description:** The forgot-password endpoint returns `404 "User not found"` if email/phone doesn't exist. This allows user enumeration attacks.  
**Severity:** MEDIUM  
**Fix:** Always return `200 OK "If an account exists, a reset link has been sent"` regardless of whether the user exists.

---

### M-10: WebSocket Voice Signaling Forwards Data Without Validation

**File:** `server/websocket.ts` ~L750-850  
**Description:** WebRTC signaling messages (offer, answer, ice-candidate) are forwarded between users without content validation. Malicious SDP payloads could be used for SRTP injection or information leakage.  
**Severity:** MEDIUM  
**Fix:** Validate SDP structure and size. Strip unexpected fields. Set maximum payload size for signaling messages.

---

### M-11: Game Session Deletion Has No Active Session Check

**File:** `server/routes/games.ts` ~L75-85  
**Description:** The `DELETE /api/games/:id` endpoint deletes a game without checking if there are active sessions using it. This can break in-progress games.  
**Severity:** MEDIUM  
**Fix:** Check for active game sessions before allowing deletion. Return an error if sessions exist.

---

### M-12: `create-from-identifier` Auto-Registration Has Weak Account ID

**File:** `server/routes/auth.ts` ~L420-435  
**Description:** Auto-registration generates account IDs with `Math.random()` without verifying uniqueness against the database. The retry-loop pattern in `storage.generateUniqueAccountId()` is not used here.  
**Severity:** MEDIUM  
**Fix:** Use `storage.generateUniqueAccountId()` for consistent unique account ID generation.

---

### M-13: Multiple Async IIFEs in Route Registration

**File:** `server/routes.ts` ~L4200-4410  
**Description:** Route registration fires off multiple `(async () => { ... })()` IIFEs for seeding social platforms, themes, and feature flags. These run concurrently with no ordering guarantee and their errors are caught but only logged, not propagated. If seeding depends on other seeding, results are unpredictable.  
**Severity:** MEDIUM  
**Fix:** Await each seed operation sequentially, or use `Promise.all()` for independent seeds. Move seeding logic to a dedicated initialization function called before server starts accepting connections.

---

### M-14: Gift Send Endpoint Returns Success Without Actual Implementation

**File:** `server/routes/challenges.ts` ~L825-830  
**Description:** `POST /api/challenges/:id/gifts` accepts gift parameters but returns `{ success: true }` without actually doing anything — no balance deduction, no gift recording.  
**Severity:** MEDIUM  
**Fix:** Either implement the gift logic or return `501 Not Implemented`.

---

### M-15: P2P Dispute Resolution Doesn't Settle Funds

**File:** `server/admin-routes.ts` ~L1100-1150  
**Description:** When an admin resolves a P2P dispute, the trade status is set to "completed" and the dispute is marked resolved, but no funds are actually transferred to the winner. The dispute winner field is set, but there's no balance settlement logic.  
**Severity:** MEDIUM  
**Fix:** Add fund settlement logic when a dispute is resolved — release escrowed funds to the winner based on `winnerUserId`.

---

### M-16: Rate Limiter Uses Shared Map With No Distinction

**File:** `server/lib/rate-limiter.ts` ~L1-60  
**Description:** `chatRateLimiter` and `giftRateLimiter` both use the same `userRateLimits` Map and call the same `checkRateLimit()` function. Since keys are just `userId`, a chat rate limit and gift rate limit for the same user will share the same counter, causing false rate limiting across features.  
**Severity:** MEDIUM  
**Fix:** Prefix keys with the limiter name (e.g., `chat:${userId}`, `gift:${userId}`) or use separate Maps.

---

## LOW Issues

### L-01: Console Logging Mixed with Structured Logger

**File:** Multiple files  
**Description:** The codebase has a proper structured `logger` (lib/logger.ts) but many files still use `console.log`, `console.error`, and `console.warn` directly. This bypasses log level configuration, correlation IDs, and structured formatting.  
**Severity:** LOW  
**Fix:** Replace all `console.*` calls with appropriate `logger.*` methods.

---

### L-02: In-Memory State Lost on Restart (WebSocket Rooms)

**File:** `server/websocket.ts`, `server/game-websocket.ts`  
**Description:** WebSocket state (`clients`, `voiceRooms`, `challengeGameRooms`, `rooms`, `userConnections`) is stored in-memory Maps. Server restart or crash loses all state — active games, voice rooms, and matchmaking queues disappear silently.  
**Severity:** LOW (expected for WS connections, but game state should be recoverable)  
**Fix:** Persist game room state to the database. On reconnection, allow clients to rejoin rooms via session recovery.

---

### L-03: Error Messages Expose Internal Details

**File:** Most route handlers  
**Description:** Many error handlers return `error.message` directly to the client: `res.status(500).json({ error: error.message })`. In production, this can leak database schema details, file paths, and internal logic.  
**Severity:** LOW  
**Fix:** Return generic error messages in production. Log details server-side. The global error handler in index.ts already does this, but individual route errors bypass it.

---

### L-04: `deleteAgentPaymentMethod` Always Returns True

**File:** `server/storage.ts` ~L830  
**Description:** `deleteAgentPaymentMethod()` runs the delete query but always returns `true` regardless of whether any row was actually deleted.  
**Severity:** LOW  
**Fix:** Check `result.rowCount` and return `false` if no rows were deleted.

---

### L-05: Unused `query` Variable in `listTransactions`

**File:** `server/storage.ts` ~L1070-1090  
**Description:** `let query = db.select().from(transactions);` is declared but never used when conditions exist — the code creates a new query in both branches of the `if`.  
**Severity:** LOW  
**Fix:** Remove the unused variable or refactor to build on it.

---

### L-06: Cleanup Interval for Rate Limiter Map Uses 60s Threshold

**File:** `server/lib/rate-limiter.ts` ~L46-53  
**Description:** The cleanup `setInterval` runs every 60s and removes entries older than 60s. However, the default window is 3s. Entries for users who were rate-limited 4 seconds ago still exist for another 56 seconds, consuming memory unnecessarily.  
**Severity:** LOW  
**Fix:** Either reduce cleanup threshold to match the maximum window size, or use a proper LRU/TTL cache.

---

### L-07: Circuit Breaker Timeout Creates Leaked Promise

**File:** `server/lib/circuit-breaker.ts` ~L108-115  
**Description:** The `withTimeout` method creates a setTimeout that is never cleared if the main promise resolves first. This leaks timeouts and can cause unexpected side effects.  
**Severity:** LOW  
**Fix:** Clear the timeout when the promise resolves using `AbortController` or a manual cleanup.

---

### L-08: Spectator Routes Import Schema Dynamically Inside Handlers

**File:** `server/routes/challenges.ts` ~L810, ~L835, ~L870  
**Description:** Several challenge endpoints use dynamic `await import("@shared/schema")` inside route handlers instead of importing at the top of the file. This adds latency to each request and is unnecessary.  
**Severity:** LOW  
**Fix:** Move all imports to the top of the file.

---

### L-09: Health Endpoint Uses `process.memoryUsage()` vs `os.totalmem()`

**File:** `server/lib/health.ts` ~L130-140  
**Description:** The memory percentage compares `heapUsed + external` (Node.js process memory) against `os.totalmem()` (total system RAM). This produces misleadingly low numbers — a node process using 80% of its heap would show as <1% of system RAM.  
**Severity:** LOW  
**Fix:** Track both process-level and system-level memory separately. Use `heapUsed / heapTotal` for process health.

---

### L-10: `checkRateLimit` Lacks User Identifier Namespacing

**File:** `server/routes/auth.ts` uses IP-based express-rate-limit, but `server/lib/rate-limiter.ts` uses userId  
**Description:** The two rate limiting systems use different identifiers (IP vs userId) and are completely independent. A single user on different IPs bypasses the WS rate limiter, while multiple users behind NAT share the HTTP rate limiter.  
**Severity:** LOW  
**Fix:** Use a combined approach: rate limit by both IP and user ID where available.

---

### L-11: Admin Audit Log Action Type Overloaded

**File:** `server/admin-routes.ts` (throughout)  
**Description:** `logAdminAction` uses string action types like `"settings_update"`, `"user_update"`, etc. but the schema's action enum may not include all variants actually used. This creates inconsistencies in audit log queries.  
**Severity:** LOW  
**Fix:** Define a strict enum of admin actions and validate against it.

---

### L-12: Seed Data Fire-and-Forget Pattern

**File:** `server/routes.ts` ~L4200-4290  
**Description:** Database seeds (social platforms, themes, feature flags) run as fire-and-forget async IIFEs. If they fail, errors are caught and logged but the server continues with incomplete seed data. Subsequent code may assume seed data exists.  
**Severity:** LOW  
**Fix:** Run seeds as part of startup initialization with proper error handling. Fail fast if critical seeds fail.

---

## Architecture Recommendations

### 1. Monolithic routes.ts (4536 lines)
The main routes.ts file is a monolith containing game play, payments, profiles, leaderboards, matchmaking, chat, and more. It should be split into focused modules similar to how challenges, auth, and P2P are already separated.

### 2. Financial Operations Layer
Create a dedicated financial operations service that wraps ALL balance changes in proper transactions. No route handler should directly modify user balances — all changes should go through this service.

### 3. WebSocket State Persistence
Critical game state should be persisted to the database and recoverable on reconnect. The current in-memory-only approach means server crashes can lose games and stakes.

### 4. Consistent Validation
Adopt Zod schemas for ALL request bodies. Currently, validation is inconsistent — some endpoints validate, many don't.

### 5. Database Connection Pooling
With 50 max connections and the DB query on every authenticated request (ban check), connection exhaustion is likely under moderate load. Consider connection pooling with PgBouncer.

---

## Summary Priority Matrix

| Priority | Issues | Action Required |
|----------|--------|-----------------|
| **Immediate** | C-01, C-02, C-03, C-05, C-06, C-07, C-08, C-10 | Block deployment until fixed |
| **Before Production** | C-04, C-09, C-11, C-12, H-01 through H-18 | Fix before any production traffic |
| **Next Sprint** | M-01 through M-16 | Plan and schedule |
| **Backlog** | L-01 through L-12 | Address as resources permit |

---

*Report generated via static code analysis. Dynamic testing (penetration testing, load testing) is recommended to validate findings and uncover runtime-specific issues.*
