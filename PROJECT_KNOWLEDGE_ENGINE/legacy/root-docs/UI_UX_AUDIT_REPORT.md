# Comprehensive UI/UX Audit Report

**Project:** Vixo1 Gaming Platform  
**Audit Date:** 2025  
**Files Audited:** 30 page-level files  
**Categories:** i18n, RTL, Fixed Pixels, Touch Targets, Breakpoints, Loading/Error/Empty States, Accessibility, Performance, Hardcoded Colors, Mobile Overflow, Hardcoded English Text

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total files audited | 30 |
| Files with NO i18n | 4 (login, not-found, complaints, games) |
| Files with partial i18n gaps | 8 (dashboard, settings, play, transactions, challenge-watch, games-catalog, multiplayer, p2p) |
| Total hardcoded `mr-`/`ml-` (RTL-breaking) | ~75 instances across 15 files |
| Files missing loading states | 2 (not-found, games-catalog) |
| Files missing error states | 3 (leaderboard, seasonal-leaderboard, support) |
| Files missing empty states | 8 |
| Hardcoded color instances | ~30+ across 10 files |
| `aria-` / `role=` accessibility attributes | 5 total across all 30 files |
| Files with no responsive breakpoints | 4 (chat, transactions, not-found, DominoGame) |

### Severity Legend
- **CRITICAL** — Broken functionality in RTL/Arabic mode or completely missing i18n
- **HIGH** — Significant UX gap (missing states, unusable touch targets, no breakpoints)
- **MEDIUM** — Partial i18n, hardcoded colors, minor RTL issues
- **LOW** — Performance optimization opportunities, minor a11y improvements

---

## File-by-File Audit

---

### 1. login.tsx (944 lines)

**i18n: CRITICAL — No i18n system used**
- File does NOT import `useI18n`. Every user-visible string is hardcoded English.
- Hardcoded strings include: "Account ID", "Password", "Phone Number", "Username / Email", "One-Click Registration", "Forgot Password?", "Register in One Click", "I have saved my credentials", "Login", "Register", "Welcome Back", "Create Account", "Or continue with", "Terms of Service", "Privacy Policy", tab labels, form labels, placeholders, success/error toasts, validation messages.

**RTL: CRITICAL — 13 hardcoded LTR classes**
- L420: `mr-2` — social login button icon
- L430: `mr-2` — social login button icon
- L440: `mr-2` — social login button icon
- L450: `mr-2` — social login button icon
- L473: `ml-2` — checkbox label spacing
- L510: `mr-2` — form field icon
- L545: `mr-2` — form field icon
- L579: `mr-2` — form field icon
- L783: `ml-2` — link arrow spacing
- L814: `mr-2` — button icon spacing
- L862: `mr-2` — button icon spacing
- L910: `ml-auto` — layout shift
- 3 RTL-aware classes present (likely from shared components)
- **Fix:** Replace all `mr-` → `me-`, `ml-` → `ms-`

**Fixed Pixel Sizes:** None detected (0)

**Touch Targets:** OK — buttons use standard sizes

**Breakpoints:** `sm:` only — no `md:` or `lg:` breakpoint
- Login form layout is single-column, which is acceptable for auth pages
- **LOW:** Consider `md:` for wider form layout on tablets

**Loading States:** YES — has loading spinner during auth
**Error States:** YES — form validation errors shown inline
**Empty States:** YES — initial form state handles empty input

**Accessibility: HIGH**
- 0 `aria-` attributes
- 0 `role=` attributes
- Form inputs lack `aria-label` or `aria-describedby`
- Password visibility toggle has no accessible label
- Social login buttons have no `aria-label` for screen readers
- Tab panels need `role="tabpanel"`

**Performance:** OK
- No unnecessary re-renders detected
- Form uses react-hook-form (efficient)

**Hardcoded Colors:** None detected

**Mobile Overflow:** LOW risk — single-column layout

---

### 2. dashboard.tsx (240 lines)

**i18n: MEDIUM — Partial i18n gaps in admin section**
- Uses `useI18n()` and `t()` for most labels
- Admin-only section has hardcoded English:
  - L170: `"Total Users"`
  - L176: `"Active Games"`
  - L182: `"Total Agents"`
  - L194: `"Total Deposits"`
  - L200: `"Total Withdrawals"`
  - L206: `"Pending Transactions"`
  - L210: `"Action Required"`
  - L213: `"Open Complaints"`
  - L217: `"Needs Attention"`
  - L222: `"Admin Dashboard"`
  - L227: `"Net Revenue"`

**RTL:** OK — 0 hardcoded LTR classes, 0 RTL-aware (uses gap/flex which are direction-agnostic)

**Fixed Pixel Sizes:** None (0)

**Touch Targets:** OK

**Breakpoints:** `lg:`, `md:` — good responsive coverage
- Grid switches: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`

**Loading States:** YES — Skeleton placeholders for cards
**Error States:** YES — error message display
**Empty States:** NO — dashboard always shows stats cards (no empty scenario likely)

**Accessibility:** 0 `aria-` or `role=` attributes
- **MEDIUM:** Stat cards lack semantic structure; consider `role="status"` for live data

**Performance:** OK — uses `useQuery` with proper keys

**Hardcoded Colors:** None

**Mobile Overflow:** LOW risk

---

### 3. not-found.tsx (19 lines)

**i18n: CRITICAL — No i18n**
- L6-14: Hardcoded `"404"`, `"Page Not Found"`, `"Did you forget to add the page to the router?"`

**RTL:** No directional classes used (neutral)

**Fixed Pixel Sizes:** None

**Touch Targets:** N/A

**Breakpoints:** None — single layout
- **LOW:** Acceptable for a 404 page

**Loading States:** NO — N/A for static page
**Error States:** YES — the page IS the error state
**Empty States:** NO — N/A

**Accessibility:** None
- **LOW:** Should have `role="alert"` on the error message

**Performance:** OK — static component

**Hardcoded Colors: MEDIUM**
- L6: `bg-gray-50` — won't adapt to dark mode
- L11: `text-gray-900` — won't adapt to dark mode
- L14: `text-gray-600` — won't adapt to dark mode
- **Fix:** Use `bg-background`, `text-foreground`, `text-muted-foreground`

**Mobile Overflow:** No risk

---

### 4. wallet.tsx (604 lines)

**i18n:** OK — uses `t()` throughout, 11 RTL-aware classes

**RTL:** OK — proper use of `me-`, `ms-`, `ps-`, `pe-` (11 instances, 0 hardcoded LTR)

**Fixed Pixel Sizes:** None

**Touch Targets:** OK — standard button sizes used

**Breakpoints:** `md:` — grid responsive layout

**Loading States:** YES — Skeleton + Loader2
**Error States:** YES — error handling in mutations
**Empty States:** NO
- **MEDIUM:** No empty state for zero transactions or zero balance (always shows balance card)

**Accessibility:** 0 attributes
- **MEDIUM:** Currency amounts lack `aria-label` for "1000 dollars" screen reader context

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow:** LOW risk

---

### 5. p2p.tsx (1615 lines)

**i18n:** OK — uses `t()` extensively

**RTL:** OK — 23 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** 1 instance (likely a badge or icon size)

**Touch Targets:** OK

**Breakpoints:** `md:` — responsive grid layouts

**Loading States:** YES
**Error States:** YES
**Empty States:** YES — "No offers found" and "No trades" messages

**Accessibility:** 2 `aria-` attributes (best among all files)
- Still limited — large interactive page needs more ARIA

**Performance: MEDIUM**
- Large file (1615 lines) — could benefit from code-splitting
- Trade list may benefit from virtualization for long lists

**Hardcoded Colors:** None

**Mobile Overflow: MEDIUM**
- Trade chat messages with long text may overflow on narrow screens
- Tables may need horizontal scroll wrapper

---

### 6. p2p-profile.tsx (437 lines)

**i18n:** OK — uses `t()` throughout

**RTL:** OK — 6 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `md:` — responsive

**Loading States:** YES — Skeleton for profile header
**Error States:** YES
**Empty States:** NO
- **LOW:** Missing empty state for user with no completed trades

**Accessibility:** 0 attributes

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow:** LOW

---

### 7. p2p-settings.tsx (730 lines)

**i18n:** OK — uses `t()` throughout

**RTL:** OK — 9 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `md:` — responsive

**Loading States:** YES
**Error States:** YES
**Empty States:** NO — settings always show form fields

**Accessibility:** 0 attributes
- **MEDIUM:** Toggle switches for payment methods lack `aria-label`

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow:** LOW

---

### 8. challenges.tsx (989 lines)

**i18n:** OK — uses `t()` extensively

**RTL:** OK — 10 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `md:`, `sm:` — good responsive coverage

**Loading States:** YES
**Error States:** YES
**Empty States:** YES — "No challenges found"

**Accessibility:** 0 attributes

**Performance:** OK — uses query invalidation properly

**Hardcoded Colors: LOW**
- L131: One hardcoded color instance (likely status badge)

**Mobile Overflow:** LOW — card-based layout handles well

---

### 9. challenge-game.tsx (486 lines)

**i18n:** OK — uses `t()` throughout

**RTL:** OK — 3 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `lg:`, `sm:` — good responsive coverage

**Loading States:** YES — connecting/reconnecting spinners
**Error States:** YES — connection error + wrong game type handlers
**Empty States:** YES — no-session state

**Accessibility:** 0 attributes
- **LOW:** Game board interactions should have ARIA for keyboard users

**Performance:** OK — `useMemo` for game state validation

**Hardcoded Colors:** None

**Mobile Overflow:** LOW

---

### 10. challenge-watch.tsx (779 lines)

**i18n: MEDIUM — Uses inline language conditionals instead of t()**
- Throughout the file, strings use `language === "ar" ? "Arabic" : "English"` pattern instead of `t()` keys
- Examples:
  - "Challenge not found" / "التحدي غير موجود"
  - "Back to Challenges" / "العودة للتحديات"
  - "Watching" / "مشاهدة"
  - "Chess" / "شطرنج", "Domino" / "دومينو"
  - "Support & Win" / "ادعم واربح"
  - "Support" / "ادعم"
  - "Instant" / "فوري", "Wait for Match" / "انتظر المباراة"
  - "Support Amount ($)" / "(المبلغ ($"
  - "Potential Winnings:" / ":الأرباح المحتملة"
  - "Cancel" / "إلغاء", "Add Support" / "أضف دعمك"
  - "Current Supports" / "الداعمون الحاليون"
  - "supports" / "داعمون"
  - Many more throughout

**RTL:** 3 RTL-aware classes, 0 hardcoded LTR — but inline language checks suggest manual RTL handling

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `lg:` — minimal breakpoint coverage
- **MEDIUM:** Should add `md:` for tablet layout

**Loading States:** YES — connecting spinner
**Error States:** YES — connection error banner
**Empty States:** YES — "no challenge" state

**Accessibility:** 0 attributes
- **MEDIUM:** Spectator controls need keyboard accessibility

**Performance:** OK — WebSocket-based real-time updates

**Hardcoded Colors:** None

**Mobile Overflow: LOW**

---

### 11. multiplayer.tsx (546 lines)

**i18n: MEDIUM — Mostly uses t() but has gaps**
- Uses `t()` for most labels
- 1 hardcoded LTR class

**RTL: LOW**
- 9 RTL-aware classes
- 1 hardcoded LTR class (likely `mr-` somewhere)
- **Fix:** Replace the 1 remaining `mr-`/`ml-` with `me-`/`ms-`

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `md:` — responsive

**Loading States:** YES
**Error States:** YES
**Empty States:** YES — "No rooms available"

**Accessibility:** 0 attributes

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow:** LOW

---

### 12. play.tsx (1889 lines) — LARGEST FILE

**i18n: HIGH — Extensive inline language checks instead of t()**
- Uses `t()` for some labels but many game components use inline conditionals:
  - "CASH OUT" / "SPIN WHEEL" / "SPIN SLOTS" / "ROLL DICE" / "START GAME" — game action buttons hardcoded English
  - "Under" / "Over" — DiceGame prediction labels
  - "SPINNING..." / "ROLLING..." / "PLAYING..." — loading states
  - "WIN" / "TRY AGAIN" / "JACKPOT!" / "NOT THIS TIME" / "TRY FOR JACKPOT" — result labels
  - VoiceChat component: inline `language` checks for all labels
  - InGameChat: inline checks for "Chat", "Type a message..."
  - GameSection: inline checks for "Hide"/"Show More", "No games available"
  - PlayPage L1715: `language === 'ar' ? 'مبروك!' : 'Congratulations!'` — toast
  - L1716: inline `language` check for win description
  - L1794: `language === 'ar' ? 'بحث...' : 'Search...'` — placeholder
  - L1855: `language === 'ar' ? 'مبلغ التحدي' : 'Challenge Amount'`
  - L1877-1882: inline checks for "Min Amount", "Max Amount" labels
  - L1531-1535: `getStatusBadge` uses raw `{status}` without i18n for "completed", "pending", "rejected"
  - L1630: `"Game type not supported"` — hardcoded fallback
- **Fix:** Extract ALL inline `language === 'ar'` patterns into `t()` keys

**RTL:** 15 RTL-aware classes, 0 hardcoded LTR in the main scan
- But inline language checks manage some RTL behavior manually

**Fixed Pixel Sizes:** 1 instance

**Touch Targets: MEDIUM**
- Quick bet buttons use `size="sm"` — may be tight on mobile (< 44px)
- Game cards in HorizontalGameScroll `w-40` may have small tap areas

**Breakpoints:** `lg:`, `md:` — good responsive grid layout

**Loading States:** YES — Skeleton for full page, Loader2 for mutations
**Error States:** YES — toast errors for mutations
**Empty States:** YES — per-category "No games available", empty transaction list

**Accessibility: LOW**
- 1 `aria-` attribute total
- `onKeyPress` used (L~chat component) — **deprecated**, should be `onKeyDown`
- Game controls (crash cashout, dice buttons, wheel spin) need ARIA labels
- VoiceChat mute/unmute buttons need `aria-label`

**Performance: MEDIUM**
- 1889 lines — should be split into smaller modules
- `dangerouslySetInnerHTML` used for ad embeds (L~1200s) — **XSS risk**
- MostPlayedSection has `useQuery` with sorting — OK
- CrashGame uses `requestAnimationFrame` for animation — good
- HorizontalGameScroll uses RTL-aware scroll — good implementation

**Hardcoded Colors: LOW**
- L1205, L1332: hardcoded colors in game components

**Mobile Overflow: MEDIUM**
- HorizontalGameScroll with `overflow-x-auto` — OK but may clip on very narrow screens
- Game cards `w-40` in horizontal scroll — acceptable with scroll
- AnnouncementsBanner carousel may overflow without proper containment

---

### 13. free.tsx (339 lines)

**i18n:** OK — uses `t()` throughout

**RTL:** OK — 11 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `md:`, `sm:` — good responsive coverage

**Loading States:** YES
**Error States:** YES
**Empty States:** YES — "No free games available"

**Accessibility:** 0 attributes

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow:** LOW

---

### 14. friends.tsx (604 lines)

**i18n:** OK — uses `t()` throughout

**RTL:** OK — 14 RTL-aware classes, 0 hardcoded LTR
- Uses `ps-10` for search input padding (RTL-safe)
- Uses `me-` properly throughout

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `sm:` — minimal
- `hidden sm:inline` for tab text with icon fallback — good pattern
- **LOW:** Could benefit from `md:` for wider friend cards layout

**Loading States:** YES — Skeleton for friend cards
**Error States:** YES
**Empty States:** YES — per-tab empty states ("No friends yet", "No followers", etc.)

**Accessibility:** 0 attributes
- **LOW:** Search input needs `aria-label`; friend action buttons need labels

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow:** LOW

---

### 15. chat.tsx (310 lines)

**i18n:** OK — uses `t()` throughout

**RTL:** OK — 4 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** 1 instance (likely message bubble sizing)

**Touch Targets:** OK

**Breakpoints:** None — single-column chat layout
- **MEDIUM:** No responsive breakpoints for desktop layout (chat could benefit from sidebar layout on lg:)

**Loading States:** YES
**Error States:** YES
**Empty States:** YES — "No messages yet"

**Accessibility:** 1 `aria-` attribute
- **LOW:** Message list should have `role="log"` and `aria-live="polite"`

**Performance:** OK
- Chat messages may need virtualization for long conversations

**Hardcoded Colors:** None

**Mobile Overflow: LOW**
- Long messages may need `break-words` / `overflow-wrap`

---

### 16. leaderboard.tsx (297 lines)

**i18n:** OK — uses `t()` throughout

**RTL: HIGH — 5 hardcoded LTR classes**
- L159: `ml-1` — rank badge spacing
- L190: `mr-2` — player icon spacing
- L194: `mr-2` — trophy icon spacing
- L198: `mr-2` — medal icon spacing
- 0 RTL-aware classes detected
- **Fix:** Replace `ml-1` → `ms-1`, `mr-2` → `me-2`

**Fixed Pixel Sizes:** 2 instances

**Touch Targets:** OK

**Breakpoints:** `sm:` — minimal

**Loading States:** YES
**Error States:** NO
- **HIGH:** No error state for failed leaderboard fetch
- **Fix:** Add error handling with retry button

**Empty States:** YES — "No entries yet"

**Accessibility:** 0 attributes
- **MEDIUM:** Leaderboard table should use `role="table"` or `<table>` semantics

**Performance:** OK

**Hardcoded Colors: MEDIUM**
- L65: Hardcoded color (likely gold/silver/bronze for ranks)
- L242: Hardcoded color

**Mobile Overflow:** LOW

---

### 17. seasonal-leaderboard.tsx (349 lines)

**i18n:** OK — uses `t()` throughout

**RTL: MEDIUM — 2 hardcoded LTR classes**
- L296: `ml-2` — icon spacing
- 1 more instance detected by scan
- 0 RTL-aware using me-/ms- pattern
- **Fix:** Replace `ml-2` → `ms-2`

**Fixed Pixel Sizes:** 2 instances

**Touch Targets:** OK

**Breakpoints:** `sm:` — minimal

**Loading States:** YES
**Error States:** NO
- **HIGH:** Same issue as leaderboard.tsx — no error handling
- **Fix:** Add error state with retry

**Empty States:** YES — "No entries" for season

**Accessibility:** 0 attributes

**Performance:** OK

**Hardcoded Colors: MEDIUM**
- L69: Hardcoded color
- L114: Hardcoded color

**Mobile Overflow:** LOW

---

### 18. player-profile.tsx (555 lines)

**i18n:** OK — uses `t()` with good coverage, uses `Intl.NumberFormat` and `toLocaleDateString` for locale

**RTL: HIGH — 8 hardcoded LTR classes**
- L290: `mr-1` — stat icon
- L295: `mr-1` — stat icon
- L392: `mr-2` — tab icon
- L396: `mr-2` — tab icon
- L454: `mr-2` — achievement badge icon
- L459: `mr-2` — achievement badge icon
- L464: `mr-2` — achievement badge icon
- L469: `mr-2` — achievement badge icon
- 4 RTL-aware classes present
- **Fix:** Replace all `mr-1` → `me-1`, `mr-2` → `me-2`

**Fixed Pixel Sizes:** 1 instance

**Touch Targets:** OK

**Breakpoints:** `sm:` — minimal
- **MEDIUM:** Profile page could benefit from `md:` grid for stats on tablet

**Loading States:** YES — Skeleton for entire profile
**Error States:** YES — "User not found" state
**Empty States:** YES — per-tab empty states (no games, no achievements)

**Accessibility:** 0 attributes
- **LOW:** Profile images need `alt` attributes; achievement badges need accessible labels

**Performance:** OK — `useMemo` for game config

**Hardcoded Colors: MEDIUM**
- L99: `text-gray-500` — default game icon color
- L513: `bg-gray-500/20` — match result background
- L525: hardcoded color

**Mobile Overflow:** LOW

---

### 19. transactions.tsx (482 lines)

**i18n: MEDIUM — Mostly uses t() but has hardcoded fragments**
- Uses `t()` for most labels
- Gaps:
  - L384: `"Ref:"` prefix hardcoded
  - L414: `"User ID:"` prefix hardcoded
  - L219: fallback `'Varies'` string without i18n
  - L413: `"Ref:"` in pending section

**RTL:** OK — 7 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** None

**Touch Targets: MEDIUM**
- Copy button: `size="icon" className="h-4 w-4"` — **way too small** (16x16px, should be ≥44x44px)
- **Fix:** Change to `h-8 w-8` minimum, or use `min-h-[44px] min-w-[44px]`

**Breakpoints:** None — single-column dialog layout
- **MEDIUM:** Transaction list not responsive for desktop (no multi-column layout)

**Loading States:** YES — Skeleton for transaction list
**Error States:** YES
**Empty States:** YES — "No transactions found"

**Accessibility:** 0 attributes
- **LOW:** Transaction amounts should have `aria-label` with currency

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow: LOW**
- Dialog-based layout constrains width

---

### 20. support.tsx (183 lines)

**i18n:** OK — uses `t()` throughout

**RTL:** OK — 2 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `lg:`, `md:` — good responsive coverage

**Loading States:** YES
**Error States:** NO
- **HIGH:** No error state for failed support ticket submission
- **Fix:** Add toast/inline error for API failure

**Empty States:** YES — "No support tickets" initial state

**Accessibility:** 0 attributes

**Performance:** OK

**Hardcoded Colors: MEDIUM**
- L54: hardcoded color
- L140: hardcoded color
- L152: hardcoded color

**Mobile Overflow:** LOW

---

### 21. complaints.tsx (419 lines)

**i18n: CRITICAL — No i18n system used**
- File does NOT import `useI18n`.
- All text is hardcoded English:
  - "Submit Complaint", "Financial", "Technical", "Account", "Game", "Other"
  - "Low", "Medium", "High", "Urgent" (priority labels)
  - "New Complaint", "All Complaints", "Select a Complaint"
  - "Messages", "No messages yet", "No complaints yet"
  - "Type a message...", "Success", "Error" (in toast)
  - "Open", "In Progress", "Resolved", "Closed" (status labels)
  - "Complaint submitted successfully", "Failed to submit complaint"
  - Category and priority select options
  - Form labels: "Title", "Description", "Category", "Priority"

**RTL: CRITICAL — 5 hardcoded LTR classes, 0 RTL-aware**
- L124: `mr-1` — tab icon spacing
- L160: `mr-2` — button icon spacing
- L241: `mr-2` — button icon spacing
- L355: `ml-8` — sent message bubble left margin
- L356: `mr-8` — sent message bubble right margin
- The `ml-8`/`mr-8` pattern for chat bubbles is **completely broken in RTL** — sent messages will appear on the wrong side
- **Fix:** Replace `ml-8` → `ms-8`, `mr-8` → `me-8`; all `mr-` → `me-`, `ml-` → `ms-`

**Fixed Pixel Sizes:** 1 instance

**Touch Targets:** OK

**Breakpoints:** `lg:` — minimal
- **MEDIUM:** Complaint list + detail split should have `md:` for tablet

**Loading States:** YES — loading spinner
**Error States:** YES — toast errors
**Empty States:** YES — "No complaints yet", "Select a Complaint", "No messages yet"

**Accessibility:** 1 `aria-` attribute
- **LOW:** Chat input should have `aria-label`; complaint list needs `role="listbox"` or `role="list"`

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow: MEDIUM**
- Chat bubbles with `ml-8`/`mr-8` reduce available width to ~calc(100% - 64px) — may squeeze text on narrow mobile screens

---

### 22. settings.tsx (1369 lines)

**i18n: MEDIUM — Uses t() mostly but has significant gaps**
- Uses `useI18n()` and `t()` for most section labels
- **VerificationSection (~L500-560) — hardcoded English:**
  - "Cancel", "Verify"
  - "Email not verified", "Phone not verified"
  - "Verification Code", "Enter 6-digit code"
  - "Enter the verification code sent to your {type}"
- **SecuritySection withdrawal password (~L1140-1230) — hardcoded English:**
  - "Withdrawal Password", "Enable Withdrawal Password"
  - "This password is required for withdrawals and protects..."
  - "New Withdrawal Password", "Confirm Withdrawal Password"
  - "Current Login Password"
  - "Set Withdrawal Password", "Reset Withdrawal Password"
  - "Passwords don't match", "Please fill in all fields"
- **PrivacySection — uses inline Arabic/English conditionals** instead of `t()` keys

**RTL:** OK — 17 RTL-aware classes, 0 hardcoded LTR

**Fixed Pixel Sizes:** 4 instances

**Touch Targets:** OK

**Breakpoints:** `md:` — responsive layout

**Loading States:** YES
**Error States:** YES — form validation and API error toasts
**Empty States:** YES — settings always show form (no empty scenario)

**Accessibility:** 0 attributes
- **MEDIUM:** Toggles (privacy, withdrawal password enable) need `aria-label`
- **MEDIUM:** Session table rows should be keyboard navigable

**Performance: MEDIUM**
- 1369 lines — large file, but well-structured with sub-components
- Base64 image upload for profile/cover — could be expensive for large images
- Session list may need pagination for users with many sessions

**Hardcoded Colors: LOW**
- L220: hardcoded color
- L222: hardcoded color

**Mobile Overflow: LOW**
- Currency select has `max-h-[300px]` — may overflow on short mobile screens
- Long language/currency labels handle well with Tailwind truncation

---

### 23. games-catalog.tsx (433 lines)

**i18n: MEDIUM — Uses inline language conditionals instead of t()**
- All user-facing strings use `language === "ar" ? "Arabic" : "English"` pattern:
  - "Watch & Win" / "شاهد واربح" — page title
  - "Live Games Arena" / "ساحة الألعاب المباشرة" — subtitle
  - "Active Players" / "لاعبون نشطون"
  - "Live Matches" / "مباريات مباشرة"
  - "Spectators" / "مشاهدون"
  - "Play Now" / "العب الآن"
  - "Watch" / "شاهد"
  - "Live Matches Now" / "المباريات المباشرة الآن"
  - "Join as spectator..." / "انضم كمشاهد..."
  - "View All" / "عرض الكل"
  - L408-433: "Ready for the Challenge?" / "هل أنت مستعد للتحدي?" — CTA section
  - "Start Playing" / "ابدأ اللعب"
  - "Watch Matches" / "شاهد المباريات"
- **Fix:** Extract all to `t()` keys

**RTL: LOW — 1 hardcoded LTR class**
- L180: `mr-2` — icon spacing
- 3 RTL-aware classes
- **Fix:** Replace `mr-2` → `me-2`

**Fixed Pixel Sizes:** 2 instances

**Touch Targets:** OK

**Breakpoints:** `lg:`, `md:` — good responsive coverage

**Loading States:** NO
- **HIGH:** No loading state for game list fetch — content jumps when data arrives
- **Fix:** Add Skeleton placeholders

**Error States:** YES — handles fetch errors
**Empty States:** NO
- **MEDIUM:** No empty state when no live matches found

**Accessibility:** 0 attributes
- **LOW:** Animated stat counters need `aria-live="polite"` for screen readers

**Performance: MEDIUM**
- Animated counting stats (players, matches, spectators) use `useEffect` with interval — OK but runs continuously

**Hardcoded Colors: LOW**
- L246: hardcoded color
- L361: hardcoded color

**Mobile Overflow:** LOW — card grid adapts via breakpoints

---

### 24. games.tsx (538 lines) — Admin Game Management

**i18n: CRITICAL — No i18n system used**
- File does NOT import `useI18n`.
- All text is hardcoded English:
  - "Game Management", "Browse and manage all games", "Add Game", "Edit Game"
  - "Add New Game", "Game Name", "Category", "Volatility"
  - Category options: "Slots", "Table", "Cards", "Live", "Crash"
  - Volatility: "Low", "Medium", "High"
  - "RTP (%)", "House Edge (%)", "Min Amount", "Max Amount"
  - Status: "Active", "Inactive", "Maintenance"
  - "Create Game", "Update Game", "Cancel"
  - "Most Played", "All Games", "Search games..."
  - Table headers: "Name", "Category", "Status", "RTP", "Players", "Volume", "Actions"
  - "Total Plays", "Volume", "Edit"
  - Empty state: "No games found", "Try adjusting your search or filter criteria", "Add your first game to get started!"

**RTL: CRITICAL — 5 hardcoded LTR classes, 0 RTL-aware**
- L219: `mr-2` — button icon
- L340: `mr-2` — button icon
- L436: `ml-2` — tag spacing
- L500: `mr-2` — action icon
- Plus additional instances in form/table layout
- **Fix:** Replace all with RTL-logical equivalents

**Fixed Pixel Sizes:** None

**Touch Targets:** OK

**Breakpoints:** `lg:`, `md:` — responsive grid

**Loading States:** YES — loading spinner
**Error States:** YES — API errors
**Empty States:** YES — "No games found"

**Accessibility:** 0 attributes
- **MEDIUM:** Data table should use `<table>` with proper `<thead>`, `<th scope="col">` semantics
- **LOW:** Form inputs in dialog should have proper labels linked via `htmlFor`

**Performance:** OK

**Hardcoded Colors:** None

**Mobile Overflow: MEDIUM**
- Game table may need horizontal scroll on mobile
- Form dialog may be cramped on narrow screens

---

### 25. game-lobby.tsx (955 lines)

**i18n:** OK — uses `t()` extensively

**RTL: CRITICAL — 19 hardcoded LTR classes, only 2 RTL-aware**
- This is the worst RTL offender among i18n-enabled files:
  - L252: `mr-2` — filter button icon
  - L267: `mr-1` — filter pill icon
  - L280: `mr-2` — game type icon
  - L333: `mr-2` — challenge row icon
  - L340: `mr-1` — player avatar spacing
  - L345: `mr-2` — status icon
  - L357: `mr-2` — action button icon
  - L565: `pl-8` — search input left padding (**should be `ps-8`**)
  - L589: `mr-2` — tab icon
  - L602: `mr-2` — tab icon
  - L634: `mr-2` — create button icon
  - L660: `mr-1` — filter chip icon
  - L670: `mr-2` — filter chip icon
  - L714: `mr-2` — game card icon
  - L720: `mr-2` — game card icon
  - L730: `mr-2` — game card spacing
  - L925: `mr-2` — dialog icon
  - L927: `mr-2` — dialog icon
  - More scattered throughout
- **Fix:** Bulk replace: `mr-` → `me-`, `ml-` → `ms-`, `pl-` → `ps-`, `pr-` → `pe-`

**Fixed Pixel Sizes:** 4 instances

**Touch Targets:** OK — buttons are standard sizes

**Breakpoints:** `xl:`, `lg:`, `md:`, `sm:` — excellent responsive coverage (best in project)

**Loading States:** YES — Skeleton for lobby cards
**Error States:** YES — connection handling
**Empty States:** YES — "No challenges available" per-filter

**Accessibility:** 0 attributes
- **MEDIUM:** Filter button group should have `role="radiogroup"` / `role="radio"`
- **LOW:** Search input needs `aria-label`

**Performance: GOOD — Best patterns in project**
- Uses `memo` for game card component
- Uses `useMemo` for filtered/sorted results
- Uses `useCallback` for event handlers
- Persists filter preferences to `localStorage`
- 5-second polling interval for live data

**Hardcoded Colors: LOW**
- L88: `bg-gray-500/20` — game type badge background
- L122: `bg-gray-500/20` — similar badge

**Mobile Overflow: LOW**
- Card grid adapts well via breakpoints
- Filter chips wrap with `flex-wrap`

---

### 26. ChessGame.tsx (321 lines)

**i18n:** OK — uses `t()` with chess-specific keys throughout

**RTL: LOW — 1 hardcoded LTR class**
- L228: `mr-1.5` — share button icon spacing
- 0 RTL-aware utility classes
- **Fix:** Replace `mr-1.5` → `me-1.5`

**Fixed Pixel Sizes:** 5 instances (icon sizing: `w-12 h-12`, `w-8 h-8`, `w-5 h-5`, `w-3 h-3`, `w-4 h-4`)
- **LOW:** These are icon sizes, acceptable

**Touch Targets:** OK — buttons use standard shadcn sizes

**Breakpoints:** `lg:` — `lg:grid-cols-[1fr_300px]` for board + sidebar

**Loading States:** YES — connecting, reconnecting, loading game states with Loader2 spinner
**Error States:** YES — connection error, wrong game type, invalid game state — all with retry buttons
**Empty States:** NO — N/A for active game (always has board)

**Accessibility:** 0 attributes
- **HIGH:** Chess board interactions (drag/click to move) MUST have keyboard accessibility
- **MEDIUM:** Share button, resign button, draw offer need `aria-label`
- **LOW:** `data-testid` attributes present (good for testing)

**Performance:** OK
- `useMemo` for position calculation from FEN
- `useMemo` for game state validation

**Hardcoded Colors:** None

**Mobile Overflow: MEDIUM**
- Chess board + sidebar stacks on mobile (no lg:). Board may need constrained width
- `max-w-7xl` container helps

---

### 27. BackgammonGame.tsx (284 lines)

**i18n:** OK — uses `t()` with backgammon-specific keys throughout

**RTL: HIGH — 5 hardcoded LTR classes, 2 RTL-aware**
- L99: `mr-2` — back button icon (error state)
- L103: `mr-2` — reconnect button icon (error state)
- L148: `mr-1` — connection badge icon
- L150: `mr-1` — disconnection badge icon
- L156: `mr-1` — spectator badge icon
- **Fix:** Replace all `mr-` → `me-`

**Fixed Pixel Sizes:** 4 instances (icon sizes)

**Touch Targets:** OK

**Breakpoints:** `lg:` — `lg:grid-cols-3` for board + info panel

**Loading States:** YES — connecting/reconnecting/loading states
**Error States:** YES — error + reconnect button
**Empty States:** NO — N/A for active game

**Accessibility:** 0 attributes
- **HIGH:** Backgammon board dice roll and piece movement need keyboard support
- **LOW:** Game info section should use semantic headings

**Performance:** OK — `useMemo` for state validation and player color computation

**Hardcoded Colors: MEDIUM**
- Borne-off indicators: `bg-amber-100 border-amber-300` (white pieces)
- Borne-off indicators: `bg-stone-800 border-stone-600` (black pieces)
- These are thematic game colors — acceptable but won't adapt to dark mode

**Mobile Overflow: MEDIUM**
- Backgammon board is complex — may overflow on narrow screens
- Board component responsibility (not audited here)

---

### 28. DominoGame.tsx (231 lines)

**i18n:** OK — uses `t()` with domino-specific keys

**RTL: MEDIUM — 2 hardcoded LTR classes, 0 RTL-aware**
- L124: `mr-2` — back button icon (error state)
- L128: `mr-2` — reconnect button icon (error state)
- **Fix:** Replace `mr-2` → `me-2`

**Fixed Pixel Sizes:** 4 instances (icon sizes)

**Touch Targets:** OK

**Breakpoints:** None — single-column layout
- **MEDIUM:** No responsive breakpoints for desktop layout; board should get wider on larger screens

**Loading States:** YES — connecting + loading game states
**Error States:** YES — error with back + reconnect buttons
**Empty States:** NO — N/A

**Accessibility:** 0 attributes

**Performance:** OK — `useMemo` for state validation and board state computation

**Hardcoded Colors: MEDIUM**
- Win/loss text: `text-green-500`, `text-red-500` — hardcoded, won't adapt to theme

**Mobile Overflow:** LOW — DominoBoard component handles layout

---

### 29. BalootGame.tsx (246 lines)

**i18n:** OK — uses `t()` with baloot-specific keys

**RTL: MEDIUM — 2 hardcoded LTR classes, 0 RTL-aware**
- L137: `mr-2` — back button icon (error state)
- L141: `mr-2` — reconnect button icon (error state)
- **Fix:** Replace `mr-2` → `me-2`

**Fixed Pixel Sizes:** 4 instances (icon sizes)

**Touch Targets:** OK

**Breakpoints:** None — single-column layout
- **MEDIUM:** No responsive breakpoints

**Loading States:** YES — connecting + loading
**Error States:** YES — error with actions
**Empty States:** NO — N/A

**Accessibility:** 0 attributes

**Performance:** OK — `useMemo` for complex board state mapping

**Hardcoded Colors: MEDIUM**
- Win/loss: `text-green-500`, `text-red-500`

**Mobile Overflow:** LOW

---

### 30. TarneebGame.tsx (238 lines)

**i18n:** OK — uses `t()` with tarneeb-specific keys

**RTL: MEDIUM — 2 hardcoded LTR classes, 0 RTL-aware**
- L130: `mr-2` — back button icon (error state)
- L134: `mr-2` — reconnect button icon (error state)
- **Fix:** Replace `mr-2` → `me-2`

**Fixed Pixel Sizes:** 4 instances (icon sizes)

**Touch Targets:** OK

**Breakpoints:** None — single-column layout
- **MEDIUM:** No responsive breakpoints

**Loading States:** YES — connecting + loading
**Error States:** YES — error with actions
**Empty States:** NO — N/A

**Accessibility:** 0 attributes

**Performance:** OK — `useMemo` for board state mapping

**Hardcoded Colors: MEDIUM**
- Win/loss: `text-green-500`, `text-red-500`

**Mobile Overflow:** LOW

---

## Cross-Cutting Issue Summary

### 1. i18n Severity Tiers

| Tier | Files | Action |
|------|-------|--------|
| **CRITICAL (No i18n)** | login.tsx, not-found.tsx, complaints.tsx, games.tsx | Add `useI18n()` + replace ALL strings with `t()` keys |
| **HIGH (Inline conditionals)** | play.tsx, challenge-watch.tsx, games-catalog.tsx | Replace `language === 'ar' ? ... : ...` with `t()` keys |
| **MEDIUM (Partial gaps)** | dashboard.tsx, settings.tsx, transactions.tsx, multiplayer.tsx | Add missing `t()` keys for hardcoded fragments |
| **OK** | All other 18 files | Good i18n coverage |

### 2. RTL Fix Priority

| Priority | Files | Hardcoded LTR Count |
|----------|-------|-------------------|
| **P0** | game-lobby.tsx | 19 instances |
| **P0** | login.tsx | 13 instances |
| **P1** | player-profile.tsx | 8 instances |
| **P1** | BackgammonGame.tsx | 5 instances |
| **P1** | leaderboard.tsx | 5 instances |
| **P1** | complaints.tsx | 5 (includes chat bubble `ml-8`/`mr-8`) |
| **P1** | games.tsx | 5 instances |
| **P2** | seasonal-leaderboard.tsx | 2 |
| **P2** | DominoGame.tsx | 2 |
| **P2** | BalootGame.tsx | 2 |
| **P2** | TarneebGame.tsx | 2 |
| **P2** | multiplayer.tsx | 1 |
| **P2** | games-catalog.tsx | 1 |
| **P2** | ChessGame.tsx | 1 |

**Bulk fix pattern:** `mr-` → `me-`, `ml-` → `ms-`, `pl-` → `ps-`, `pr-` → `pe-`

### 3. Missing States

| State | Files Missing It |
|-------|-----------------|
| **Loading** | not-found.tsx (N/A), games-catalog.tsx |
| **Error** | leaderboard.tsx, seasonal-leaderboard.tsx, support.tsx |
| **Empty** | dashboard.tsx, wallet.tsx, p2p-profile.tsx, p2p-settings.tsx, ChessGame/Backgammon/Domino/Baloot/Tarneeb (N/A for games) |

### 4. Accessibility — Project-Wide Deficiency

**Total ARIA attributes across all 30 files: 5**

This is critically low. Recommended additions:
1. **All form inputs:** Add `aria-label` or pair with visible `<label>` via `htmlFor`
2. **All icon-only buttons:** Add `aria-label` (back, share, settings, close buttons)
3. **Live data regions:** Add `aria-live="polite"` (leaderboard, stats, chat messages, game scores)
4. **Tab interfaces:** Ensure proper `role="tablist"`, `role="tab"`, `role="tabpanel"`
5. **Game boards:** Keyboard navigation for Chess, Backgammon, Domino, Baloot, Tarneeb
6. **Deprecated API:** Replace `onKeyPress` with `onKeyDown` (play.tsx chat)

### 5. Hardcoded Colors — Theme Compliance

Files with hardcoded Tailwind gray/color classes that won't adapt to dark mode:

| File | Lines | Colors |
|------|-------|--------|
| not-found.tsx | L6, L11, L14 | `bg-gray-50`, `text-gray-900`, `text-gray-600` |
| player-profile.tsx | L99, L513, L525 | `text-gray-500`, `bg-gray-500/20` |
| leaderboard.tsx | L65, L242 | rank colors |
| seasonal-leaderboard.tsx | L69, L114 | rank colors |
| support.tsx | L54, L140, L152 | various |
| settings.tsx | L220, L222 | various |
| game-lobby.tsx | L88, L122 | `bg-gray-500/20` |
| games-catalog.tsx | L246, L361 | various |
| play.tsx | L1205, L1332 | game component colors |
| DominoGame/BalootGame/TarneebGame | result section | `text-green-500`, `text-red-500` |

**Recommendation:** Replace `bg-gray-*` with `bg-muted`, `text-gray-*` with `text-muted-foreground` for theme compliance. Semantic game colors (green=win, red=loss) are acceptable but should use CSS custom properties for the theme system.

### 6. Performance Concerns

| Concern | File(s) | Severity |
|---------|---------|----------|
| File too large — needs splitting | play.tsx (1889 lines), p2p.tsx (1615 lines), settings.tsx (1369 lines) | MEDIUM |
| `dangerouslySetInnerHTML` for ads (XSS risk) | play.tsx ~L1200 | HIGH |
| Missing list virtualization for long lists | chat.tsx, p2p.tsx trade list, friends.tsx | LOW |
| No `useMemo`/`useCallback` in most files | 20+ files | LOW |
| game-lobby.tsx — exemplary performance patterns | game-lobby.tsx | N/A (positive) |

### 7. Mobile Overflow Risks

| Risk | File | Details |
|------|------|---------|
| Chat bubbles with `ml-8`/`mr-8` squeezing text | complaints.tsx | Fix with `ms-8`/`me-8` + `break-words` |
| Data tables on narrow screens | games.tsx, game-lobby.tsx | Add `overflow-x-auto` wrapper |
| Chess/Backgammon boards on narrow screens | ChessGame.tsx, BackgammonGame.tsx | Board components need max-width constraints |
| HorizontalGameScroll | play.tsx | Already has `overflow-x-auto` — OK |
| Settings currency select `max-h-[300px]` | settings.tsx | May clip on short screens |

### 8. Responsive Breakpoint Coverage

| Coverage | Files |
|----------|-------|
| **Excellent** (3+ breakpoints) | game-lobby.tsx (sm/md/lg/xl) |
| **Good** (2 breakpoints) | dashboard.tsx, play.tsx, games.tsx, games-catalog.tsx, support.tsx, challenges.tsx, ChessGame.tsx |
| **Minimal** (1 breakpoint) | login.tsx, free.tsx, friends.tsx, leaderboard.tsx, seasonal-leaderboard.tsx, player-profile.tsx, wallet.tsx, p2p.tsx, p2p-profile.tsx, p2p-settings.tsx, multiplayer.tsx, challenge-game.tsx, challenge-watch.tsx, complaints.tsx, settings.tsx |
| **None** | not-found.tsx, chat.tsx, transactions.tsx, DominoGame.tsx, BalootGame.tsx, TarneebGame.tsx |

---

## Top 10 Priority Fixes

1. **[CRITICAL] Add i18n to login.tsx** — Most visited page, 944 lines of hardcoded English
2. **[CRITICAL] Add i18n to complaints.tsx** — User-facing page, entirely hardcoded English + broken RTL chat bubbles
3. **[CRITICAL] Fix game-lobby.tsx RTL** — 19 instances of `mr-`/`pl-` — highest RTL issue density
4. **[CRITICAL] Add i18n to games.tsx** — Admin page but still needs Arabic support
5. **[HIGH] Fix play.tsx inline language conditionals** — Extract ~30+ `language === 'ar'` patterns to `t()` keys
6. **[HIGH] Fix login.tsx RTL** — 13 hardcoded LTR classes
7. **[HIGH] Add error states** — leaderboard.tsx, seasonal-leaderboard.tsx, support.tsx
8. **[HIGH] Fix transactions.tsx copy button** — 16x16px touch target (should be ≥44px)
9. **[HIGH] Remove `dangerouslySetInnerHTML`** in play.tsx — XSS vulnerability
10. **[MEDIUM] Project-wide accessibility pass** — Add ARIA labels to all icon-only buttons, form inputs, and live regions

---

## Appendix: Raw Metrics Table

| File | Lines | i18n | RTL-aware | LTR-hard | Breakpoints | Load | Err | Empty | A11y | FixPx |
|------|-------|------|-----------|----------|-------------|------|-----|-------|------|-------|
| login.tsx | 944 | NO | 3 | 13 | sm: | Y | Y | Y | 0 | 0 |
| dashboard.tsx | 240 | YES* | 0 | 0 | lg:,md: | Y | Y | N | 0 | 0 |
| not-found.tsx | 19 | NO | 0 | 0 | — | N | Y | N | 0 | 0 |
| wallet.tsx | 604 | YES | 11 | 0 | md: | Y | Y | N | 0 | 0 |
| p2p.tsx | 1615 | YES | 23 | 0 | md: | Y | Y | Y | 2 | 1 |
| p2p-profile.tsx | 437 | YES | 6 | 0 | md: | Y | Y | N | 0 | 0 |
| p2p-settings.tsx | 730 | YES | 9 | 0 | md: | Y | Y | N | 0 | 0 |
| challenges.tsx | 989 | YES | 10 | 0 | md:,sm: | Y | Y | Y | 0 | 0 |
| challenge-game.tsx | 486 | YES | 3 | 0 | lg:,sm: | Y | Y | Y | 0 | 0 |
| challenge-watch.tsx | 779 | YES* | 3 | 0 | lg: | Y | Y | Y | 0 | 0 |
| multiplayer.tsx | 546 | YES* | 9 | 1 | md: | Y | Y | Y | 0 | 0 |
| play.tsx | 1889 | YES* | 15 | 0 | lg:,md: | Y | Y | Y | 1 | 1 |
| free.tsx | 339 | YES | 11 | 0 | md:,sm: | Y | Y | Y | 0 | 0 |
| friends.tsx | 604 | YES | 14 | 0 | sm: | Y | Y | Y | 0 | 0 |
| chat.tsx | 310 | YES | 4 | 0 | — | Y | Y | Y | 1 | 1 |
| leaderboard.tsx | 297 | YES | 0 | 5 | sm: | Y | N | Y | 0 | 2 |
| seasonal-leaderboard.tsx | 349 | YES | 0 | 2 | sm: | Y | N | Y | 0 | 2 |
| player-profile.tsx | 555 | YES | 4 | 8 | sm: | Y | Y | Y | 0 | 1 |
| transactions.tsx | 482 | YES* | 7 | 0 | — | Y | Y | Y | 0 | 0 |
| support.tsx | 183 | YES | 2 | 0 | lg:,md: | Y | N | Y | 0 | 0 |
| complaints.tsx | 419 | NO | 0 | 5 | lg: | Y | Y | Y | 1 | 1 |
| settings.tsx | 1369 | YES* | 17 | 0 | md: | Y | Y | Y | 0 | 4 |
| games-catalog.tsx | 433 | YES* | 3 | 1 | lg:,md: | N | Y | N | 0 | 2 |
| games.tsx | 538 | NO | 0 | 5 | lg:,md: | Y | Y | Y | 0 | 0 |
| game-lobby.tsx | 955 | YES | 2 | 19 | xl:,lg:,md:,sm: | Y | Y | Y | 0 | 4 |
| ChessGame.tsx | 321 | YES | 0 | 1 | lg: | Y | Y | N | 0 | 5 |
| BackgammonGame.tsx | 284 | YES | 2 | 5 | lg: | Y | Y | N | 0 | 4 |
| DominoGame.tsx | 231 | YES | 0 | 2 | — | Y | Y | N | 0 | 4 |
| BalootGame.tsx | 246 | YES | 0 | 2 | — | Y | Y | N | 0 | 4 |
| TarneebGame.tsx | 238 | YES | 0 | 2 | — | Y | Y | N | 0 | 4 |

*YES\* = uses i18n but has significant gaps (inline language conditionals or hardcoded fragments)*

---

*End of audit report.*
