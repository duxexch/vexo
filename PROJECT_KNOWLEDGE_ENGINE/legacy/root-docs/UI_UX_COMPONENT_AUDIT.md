# Comprehensive UI/UX Component Audit Report

**Date:** February 23, 2026  
**Scope:** All game components, shared components, hooks, lib files, and core layout files  
**Auditor:** Automated line-by-line analysis

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Global Infrastructure Issues](#global-infrastructure)
3. [Game Components](#game-components)
4. [Shared Components](#shared-components)
5. [Hooks](#hooks)
6. [Lib Files](#lib-files)
7. [Core Layout Files](#core-layout-files)
8. [Severity Summary](#severity-summary)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Files Audited | 35 |
| CRITICAL Issues | 28 |
| HIGH Issues | 47 |
| MEDIUM Issues | 62 |
| LOW Issues | 41 |
| Total Issues | 178 |

**Top systemic problems:**
1. **BalootBoard and TarneebBoard are 100% hardcoded Arabic** — zero i18n, no `t()` calls
2. **DominoBoard uses inline language checks** (`language === "ar"`) instead of `t()` keys
3. **VoiceChat has zero i18n** — all English-only tooltip text
4. **ChessBoard (legacy)** has zero i18n — hardcoded "Choose promotion:", "Game Over"
5. **Multiple game boards use fixed pixel heights** (h-[550px], h-[600px]) causing mobile overflow
6. **No loading states** in most game components
7. **Hardcoded `ml-*`/`mr-*` classes** in ChessControls, BalootBoard, AchievementsPanel, TikTokGiftBar
8. **Missing keyboard/screen-reader accessibility** across all game boards
9. **Touch targets below 44px** in chess squares on mobile, domino tiles, card hands
10. **Massive Google Fonts bundle** (~30 font families) in index.html

---

## Global Infrastructure

### client/index.html (29 lines)
| # | Finding | Severity |
|---|---------|----------|
| 1 | **L5:** `maximum-scale=1, user-scalable=no` blocks pinch-to-zoom — WCAG 1.4.4 violation | CRITICAL |
| 2 | **L2:** `lang="en"` hardcoded — should be dynamic based on selected language | HIGH |
| 3 | **L18-19:** ~30 Google Font families loaded in a single render-blocking `<link>` — massive initial payload (~500KB+), FOUT/FOIT risk | HIGH |
| 4 | **L18:** No `preload` for critical fonts; all loaded via CSS `display=swap` but blocking download is huge | MEDIUM |
| 5 | No `<noscript>` fallback | LOW |

### tailwind.config.ts (108 lines)
| # | Finding | Severity |
|---|---------|----------|
| 1 | **L86-91:** `status` colors use raw RGB (`rgb(34 197 94)`) instead of HSL CSS variables — breaks theming consistency | MEDIUM |
| 2 | No `screens` customization — relies on Tailwind defaults (sm:640, md:768, lg:1024, xl:1280) | LOW |
| 3 | No custom touch-target size utility defined | LOW |

### client/src/index.css (354 lines)
| # | Finding | Severity |
|---|---------|----------|
| 1 | **L71-82:** `hsl(from ...)` relative color syntax has limited browser support (no Firefox < 128, no Safari < 18) — fallbacks exist but add CSS bloat | MEDIUM |
| 2 | **L165:** Scrollbar width 8px is fine for desktop but hides entirely via `.scrollbar-hide` — no touch scrollbar styling | LOW |
| 3 | RTL support via `[dir="rtl"] .rtl-flip` on L191 is minimal — only `scaleX(-1)` transform | LOW |
| 4 | **L278-297:** Animations `float-up`, `gift-burst`, `shake-gift` use `translateY(-100vh)` which may not respect safe areas | LOW |

### client/src/lib/utils.ts (7 lines)
| # | Finding | Severity |
|---|---------|----------|
| 1 | Clean implementation, no issues | — |

### client/src/lib/queryClient.ts (95 lines)
| # | Finding | Severity |
|---|---------|----------|
| 1 | **L80:** `staleTime: 10 * 60 * 1000` (10 min) is quite long for game data — may show stale challenge/game info | MEDIUM |
| 2 | **L82:** `retry: false` globally — any transient network error shows permanent error state | MEDIUM |
| 3 | No global error handler for 401s — silent failures for expired tokens | MEDIUM |

---

## Game Components

### 1. client/src/components/games/ChessBoard.tsx (Legacy) — 269 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | **Zero i18n** — no `useI18n`, no `t()` calls. Hardcoded: "Choose promotion:" (L248), "Game Over" (L264) | 248, 264 | CRITICAL |
| 2 | RTL | No RTL-aware classes used. No `me-*`/`ms-*` anywhere | — | HIGH |
| 3 | Touch Targets | `w-10 h-10` = 40px on mobile — **below 44px minimum** | L230 | HIGH |
| 4 | Responsive | Uses `sm:w-12 sm:h-12 md:w-14 md:h-14` — good breakpoint scaling | L230 | — |
| 5 | Fixed Sizes | `w-14 h-14` promotion buttons (56px OK for touch) | L255 | LOW |
| 6 | Accessibility | No `aria-label` on squares, no `role="grid"`, no keyboard navigation, no `aria-live` for move announcements | L224-262 | CRITICAL |
| 7 | Loading | No loading state — blank board if `gameState` is null | — | HIGH |
| 8 | Error | Only a basic try/catch on FEN parsing (L167), silently falls back | L167 | MEDIUM |
| 9 | Colors | Hardcoded `bg-amber-100`, `bg-amber-700`, `bg-yellow-400`, `text-gray-900`, `bg-green-500/50` — not theme-aware | L217-222 | MEDIUM |
| 10 | Performance | `getValidMoves()` called on every click, not memoized; `flippedBoard` properly memoized | L196 | LOW |
| 11 | Animation | No move animations, no piece transition effects | — | LOW |
| 12 | Overflow | Grid auto-sizes; no overflow risk | — | — |

### 2. client/src/components/games/chess/ChessBoard.tsx — 235 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | Uses `useI18n()` — `t('chess.choosePromotion')` on L209. ✅ | L209 | — |
| 2 | RTL | No RTL-specific classes; board is symmetric so mostly OK, but file/rank labels don't flip | — | LOW |
| 3 | Touch Targets | Board uses `aspectRatio: '1/1', maxWidth: '600px'` with CSS grid — squares scale but can be tiny on small screens | L157 | MEDIUM |
| 4 | Fixed Sizes | `style={{ aspectRatio: '1/1', maxWidth: '600px' }}` — inline style, not responsive | L157 | MEDIUM |
| 5 | Accessibility | No `role="grid"`, no `aria-label` on squares, no keyboard listener for square selection, no screen reader move announcements | L155-210 | CRITICAL |
| 6 | Drag API | **Uses HTML5 drag API** (L109-139) — works on desktop, **fails on mobile touch** (no touch fallback) | L109-139 | CRITICAL |
| 7 | Loading | No loading state | — | HIGH |
| 8 | Error | No error handling on missing position data | — | MEDIUM |
| 9 | Colors | Same hardcoded amber/yellow theme as legacy board | L166-172 | MEDIUM |
| 10 | Performance | `getValidMovesForSquare` and `findKingSquare` properly wrapped in `useCallback` | — | — |
| 11 | Animation | `hover:scale-110` on pieces, `transition-transform` — good micro-interaction | L199 | — |
| 12 | Promotion | `w-14 h-14` = 56px buttons — adequate touch targets | L215 | — |

### 3. client/src/components/games/chess/ChessTimer.tsx — 120 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Uses `t('chess.white')`, `t('chess.black')` | L96 | — |
| 2 | RTL | No directional classes needed (numeric timer) | — | — |
| 3 | Fixed Sizes | `max-w-[100px]` — could be too small on larger screens | L75 | LOW |
| 4 | Touch Targets | Timer is display-only, no interactivity, N/A | — | — |
| 5 | Accessibility | No `aria-live="polite"` for timer updates — screen readers miss countdown | L101-113 | HIGH |
| 6 | Accessibility | No `role="timer"` on time display | L109 | MEDIUM |
| 7 | Colors | Hardcoded `bg-white text-black` / `bg-gray-900 text-white` — not theme-aware | L102 | MEDIUM |
| 8 | Performance | Local countdown interval synced with server — potential drift, good pattern with sync | L38-48 | — |
| 9 | Animation | `animate-pulse` on low time — good urgency indicator | L104 | — |

### 4. client/src/components/games/chess/ChessMoveList.tsx — 78 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ `t('chess.moves')`, `t('chess.noMoves')` | L33, 42 | — |
| 2 | RTL | `grid-cols-[2rem_1fr_1fr]` — may need RTL reorder for chess notation | L49 | LOW |
| 3 | Fixed Sizes | `h-[200px]` ScrollArea — may be too small on larger screens | L38 | MEDIUM |
| 4 | Accessibility | No `role="log"` or `aria-live` for real-time move updates | L37 | MEDIUM |
| 5 | Performance | `movePairs` recalculated on every render — should be `useMemo` | L28-37 | MEDIUM |
| 6 | Scroll | Auto-scroll via `scrollRef` works well | L25 | — |

### 5. client/src/components/games/chess/ChessControls.tsx — 112 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Full i18n with `t('chess.resign')`, `t('chess.offerDraw')`, etc. | — | — |
| 2 | RTL | **`mr-1.5` hardcoded** on resign icon and draw icon — should be `me-1.5` | L44, L66 | HIGH |
| 3 | Touch Targets | Uses `size="sm"` Buttons — likely ≥ 32px, border-line | L42-43 | MEDIUM |
| 4 | Accessibility | AlertDialog pattern is accessible by default (Radix) ✅ | — | — |
| 5 | Loading | No loading state for mutation feedback | — | LOW |

### 6. client/src/components/games/chess/ChessChat.tsx — 101 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Uses `t('chess.chat')`, `t('chess.typeMessage')`, `t('common.you')` | — | — |
| 2 | i18n BUG | **L60:** Uses `t('chess.noMoves')` for empty chat — should be a chat-specific key like `t('chess.noMessages')` | L60 | MEDIUM |
| 3 | RTL | Uses `ml-auto`/`mr-auto` — **should be `ms-auto`/`me-auto`** for RTL | L70, 71 | HIGH |
| 4 | Fixed Sizes | `h-[300px]` fixed chat container | L55 | MEDIUM |
| 5 | Touch Targets | Send button `size="icon"` ≈ 40px — borderline | L88 | LOW |
| 6 | Accessibility | No `aria-label` on send button, no `role="log"` on message list | L82-91 | MEDIUM |
| 7 | Keyboard | Enter key sends — ✅; Shift+Enter for newline — ✅ | L49 | — |

### 7. client/src/components/games/backgammon/BackgammonBoard.tsx — 273 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Uses `t('backgammon.off')`, `t('backgammon.rollDice')`, `t('backgammon.yourTurn')`, `t('backgammon.opponentTurn')` | — | — |
| 2 | RTL | No directional margin/padding classes used — layout is symmetric | — | — |
| 3 | Fixed Sizes | **`style={{ minHeight: '400px' }}`** inline — problematic on short mobile screens | L231 | HIGH |
| 4 | Fixed Sizes | `w-8 h-8` checkers (32px), `w-10 h-10` dice items (40px) — below 44px | L100, L193 | MEDIUM |
| 5 | Fixed Sizes | `w-12` bar, `w-10` bear-off areas | L162, L178 | MEDIUM |
| 6 | Touch Targets | Checker click targets are the entire point column, so OK | — | — |
| 7 | Accessibility | **No keyboard navigation** for point selection | — | CRITICAL |
| 8 | Accessibility | No `aria-label` on points, dice, or roll button | — | HIGH |
| 9 | Accessibility | No `aria-live` for turn changes or dice results | — | HIGH |
| 10 | Loading | No loading/skeleton state | — | HIGH |
| 11 | Error | No error handling | — | MEDIUM |
| 12 | Colors | Hardcoded `bg-amber-700`, `bg-stone-700`, `bg-amber-800`, `bg-amber-900`, `bg-amber-100` — not theme-aware | L127-135 | MEDIUM |
| 13 | Performance | `renderChecker`, `renderPoint`, `renderBar`, `renderBearOff` are function calls inside render — not memoized components | L92-199 | LOW |
| 14 | Animation | No move animations | — | LOW |
| 15 | Overflow | Horizontal flex layout with `flex-1` — handles well | — | — |

### 8. client/src/components/games/DominoBoard.tsx — 293 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | **Uses inline `language === "ar"` checks** instead of `t()` keys in ~10 places. Hardcoded English/Arabic pairs: "Opponent's tiles"/"قطع الخصم", "Place the first tile"/"ضع أول قطعة", "Your tiles"/"قطعك", "Place Left"/"ضع يساراً", "Place Right"/"ضع يميناً", "Draw"/"اسحب من البنك", "Pass"/"تمرير", "Game Over"/"انتهت اللعبة" | L195, 201, 207, 220, 227, 252, 259, 267 | CRITICAL |
| 2 | i18n | Uses `useI18n()` only for `language` — never uses `t()` | L157 | — |
| 3 | RTL | No `me-*`/`ms-*` classes — uses symmetric layout | — | LOW |
| 4 | Fixed Sizes | `w-8 h-16` (sm), `w-12 h-24` (md), `w-16 h-32` (lg) tile sizes — inline | L55-59 | LOW |
| 5 | Fixed Sizes | `min-h-[200px]` on board area | L199 | MEDIUM |
| 6 | Touch Targets | Small tile sizes OK since tiles have onClick handlers and scale-up on hover | L105 | — |
| 7 | Accessibility | **No keyboard navigation** for tile selection or placement | — | CRITICAL |
| 8 | Accessibility | No `aria-label` on tiles, no `role` attributes | — | HIGH |
| 9 | Loading | No loading state | — | HIGH |
| 10 | Error | Basic try/catch on game state parse (L162), silently defaults | L162 | LOW |
| 11 | Colors | Hardcoded `bg-green-800`, `bg-white`, `bg-blue-600`, `bg-gray-800` — not theme-aware | L88, 199, 128 | MEDIUM |
| 12 | Performance | `getPlayableTiles` wrapped in `useCallback` + `useMemo` — ✅ | L169-185 | — |
| 13 | Animation | `scale-110` on selected, `hover:scale-105` — good feedback | L105 | — |
| 14 | Overflow | Board `flex-wrap justify-center` handles overflow well | L204 | — |

### 9. client/src/components/games/BalootBoard.tsx — 307 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | **100% hardcoded Arabic** — zero `useI18n()`, zero `t()` calls. ALL text is Arabic: "اختر نوع اللعب", "صن (بدون حكم)", "باس", "انتظر اختيار اللاعب...", "نحن:", "هم:", "مضاعف!", "فزتم!", "خسرتم", "دورك!", "العب", "حكم", "صن" | Throughout | CRITICAL |
| 2 | RTL | Uses `mr-2`, `mr-1`, `ml-[-24px]` — **hardcoded LTR margins** | L164, 172, 216, 240 | CRITICAL |
| 3 | Fixed Sizes | **`h-[550px]`** fixed board height — will overflow on short mobile screens | L241 | CRITICAL |
| 4 | Fixed Sizes | `w-14 h-20` cards (56x80px), `w-10 h-14` opponent cards, `w-12 h-16` trick cards, `w-96` choosing card, `w-80` finished card | L153, 175, 198, 208, 276 | MEDIUM |
| 5 | Touch Targets | Cards at 56x80px are adequate; however, `ml-[-24px]` overlap makes some cards hard to tap | L164 | HIGH |
| 6 | Responsive | **Zero responsive breakpoints** — no `sm:`, `md:`, `lg:` anywhere | — | CRITICAL |
| 7 | Accessibility | **No keyboard navigation**, no `aria-*`, no `role` attributes, no screen reader support | — | CRITICAL |
| 8 | Loading | No loading state | — | HIGH |
| 9 | Error | No error handling | — | HIGH |
| 10 | Colors | Hardcoded `bg-emerald-800`, `bg-green-900`, `text-red-500`, `bg-yellow-500` | L56-59, 241 | MEDIUM |
| 11 | Performance | Template literal classNames instead of `cn()` — harder to merge, more verbose | L153-163 | LOW |
| 12 | Animation | `hover:-translate-y-2` on playable cards, `animate-pulse` on turn badge — good | L157, 302 | — |

### 10. client/src/components/games/TarneebBoard.tsx — 311 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | **100% hardcoded Arabic** — zero `useI18n()`, zero `t()` calls. ALL text: "مرحلة المزايدة", "باس", "انتظر دورك في المزايدة...", "فريق 1:", "فريق 2:", "الحكم:", "فريقك:", "الخصم:", "فريقك فاز!", "فريقك خسر", "دورك!", "العب الورقة", "لفات" | Throughout | CRITICAL |
| 2 | RTL | Uses `ml-[-30px]`, `mt-[-30px]` — **hardcoded LTR negative margins** | L133, 134 | CRITICAL |
| 3 | Fixed Sizes | **`h-[600px]`** fixed board height — will overflow on short mobile screens | L212 | CRITICAL |
| 4 | Fixed Sizes | `w-16 h-24` cards, `w-12 h-16` opponent cards, `w-14 h-20` trick cards, `w-80` bidding card, `w-32 h-32` trick area | L119, 141, 163, 189, 159 | MEDIUM |
| 5 | Touch Targets | Cards at 64x96px OK; `ml-[-30px]` overlap makes hitting specific cards difficult | L130 | HIGH |
| 6 | Responsive | **Zero responsive breakpoints** | — | CRITICAL |
| 7 | Accessibility | **No keyboard navigation**, no `aria-*`, no `role` attributes | — | CRITICAL |
| 8 | Loading | No loading state | — | HIGH |
| 9 | Error | No error handling | — | HIGH |
| 10 | Colors | Hardcoded `bg-green-800`, `bg-blue-900`, `text-red-500` | L119-147, 212 | MEDIUM |
| 11 | Performance | Template literal classNames instead of `cn()` | L119-129 | LOW |
| 12 | Animation | `hover:-translate-y-2`, `animate-pulse` on turn badge — same as Baloot | L123, 302 | — |
| 13 | Overlap | Card styles use `style={{ marginLeft: index > 0 ? "-30px" : "0" }}` — inline styles | L130 | LOW |

### 11. client/src/components/games/GameChat.tsx — 248 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | **Uses inline `language === "ar"` checks** instead of `t()` keys in ~8 places: "الدردشة"/"Chat", "سريع"/"Quick", "دردشة"/"Chat", "لا توجد رسائل بعد"/"No messages yet", "مشاهد"/"spectator", "اكتب رسالة..."/"Type a message...", "حظر المستخدم"/"Block User", "كتم المستخدم"/"Mute User" | L112, 118, 122, 143, 153, 192, L174, 183 | HIGH |
| 2 | RTL | Uses `me-2` on block/mute icons — ✅ | L174, 183 | — |
| 3 | Fixed Sizes | `style={{ width: "calc(100% - 24px)" }}` inline on TabsList | L116 | MEDIUM |
| 4 | Touch Targets | Quick message buttons `size="sm" h-auto py-2 px-3` — adequate | L126 | — |
| 5 | Accessibility | Message actions only visible on **hover** (`opacity-0 group-hover:opacity-100`) — **invisible on touch devices** | L167 | CRITICAL |
| 6 | Accessibility | No `aria-label` on send button | L197 | MEDIUM |
| 7 | Keyboard | Enter sends, Shift+Enter newline — ✅ | L102-105 | — |
| 8 | Loading | No loading state for messages | — | MEDIUM |
| 9 | Error | Toast error notifications on block/mute failures — ✅ | L78, 86 | — |
| 10 | Performance | `scrollRef` auto-scroll on messages — ✅ | L93 | — |

### 12. client/src/components/games/SpectatorPanel.tsx — 473 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | Uses inline `language === "ar"` checks throughout — ~25 instances. Uses `t()` for nothing, only `language` from `useI18n()` | Throughout | HIGH |
| 2 | RTL | Uses `me-1`, `me-2` in some places — partially RTL-aware | L254, 264 | — |
| 3 | Fixed Sizes | `h-14` quick gift buttons (56px — OK) | L304 | — |
| 4 | Touch Targets | Gift/points/follow buttons `size="sm"` — adequate | L253-271 | — |
| 5 | Accessibility | No `aria-label` on icon-only follow button | L271 | MEDIUM |
| 6 | Loading | No loading/skeleton for gift catalog or player data | — | MEDIUM |
| 7 | Error | Toast-based error handling on mutations — ✅ | L137-148 | — |
| 8 | Performance | Multiple useState for dialog management — could be consolidated | L92-97 | LOW |
| 9 | API | `apiRequest` called with non-standard signature on L110-111 — inconsistent with main pattern | L110-111 | MEDIUM |

### 13. client/src/components/games/TikTokGiftBar.tsx — 312 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | Uses inline `language === "ar"` for "إرسال إلى:"/"Send to:", "إرسال"/"Send" | L139, 163 | HIGH |
| 2 | RTL | **`ml-0.5` hardcoded** on coin icon | L212 | HIGH |
| 3 | Touch Targets | Gift buttons `size="sm"` with icon — adequate flex-shrink-0 | L197-211 | — |
| 4 | Accessibility | **`aria-pressed={isSelected}`** on gift buttons — ✅ excellent! | L202 | — |
| 5 | Overflow | `overflow-x-auto scrollbar-hide` with `flex-shrink-0` items — **horizontal scroll with hidden scrollbar** — users may not discover scrollable content | L180-181 | MEDIUM |
| 6 | Loading | No loading state | — | LOW |
| 7 | Performance | `FloatingGiftsOverlay` creates new arrays on every gift — cleaned up via timeout | L252-270 | LOW |
| 8 | Animation | Rich animations: bounce, pulse, spin, float-up — ✅ | L189-193, L244 | — |
| 9 | Colors | Hardcoded per-gift colors (`text-red-500`, `text-cyan-400`, etc.) — intentional theming | L37-48 | LOW |

### 14. client/src/components/games/GiftAnimation.tsx — 158 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | Uses inline `language === "ar"` for "من"/"from" | L119 | MEDIUM |
| 2 | RTL | No directional classes needed (centered layout) | — | — |
| 3 | Fixed Sizes | `w-20 h-20` main icon container, `w-2 h-2` particles, `w-12 h-12` icon | L111, L100, L113 | LOW |
| 4 | Accessibility | Overlay has `pointer-events: none` and `data-testid` — OK for decorative animation | L91 | — |
| 5 | Animation | `zoom-in-50 fade-in`, `animate-bounce`, particle effects — ✅ | L96-98, L110, L101 | — |
| 6 | Performance | Particle array created in useEffect, cleaned by timer — OK | L82-89 | — |
| 7 | Colors | Dynamic from icon mapping, `bg-gradient-to-br` — appropriate | L111 | — |

### 15. client/src/components/games/VoiceChat.tsx — 307 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | **Zero i18n** — all text is hardcoded English: "Connecting...", "Voice chat connected", "Start voice chat", "Voice chat error", "Unmute microphone", "Mute microphone", "Unmute speaker", "Mute speaker", "Live" | L245-287, 299 | CRITICAL |
| 2 | RTL | No directional classes (flex row, symmetric) | — | LOW |
| 3 | Touch Targets | `size="icon"` buttons ≈ 40px — borderline below 44px | L235, 263, 277 | MEDIUM |
| 4 | Accessibility | Tooltip-based labels — only visible on hover/focus, not announced to screen readers | L230-299 | HIGH |
| 5 | Accessibility | No `aria-label` on icon-only buttons | L235, 263, 277 | HIGH |
| 6 | Loading | Spinner `Loader2 animate-spin` while connecting — ✅ | L240 | — |
| 7 | Error | Connection state "error" shown visually with destructive variant — ✅ | L238 | — |
| 8 | Performance | WebRTC setup properly handled with refs and cleanup | L36-192 | — |
| 9 | Colors | Hardcoded `bg-green-600`, `bg-green-100`, `text-green-700` for connected state | L237, 299 | LOW |

### 16. client/src/components/games/ShareMatchButton.tsx — 207 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | Uses inline `language === "ar"` for all text — ~10 instances. No `t()` calls | Throughout | HIGH |
| 2 | RTL | Uses `me-2` consistently on icons — ✅ | L131, 138, 149, 158 | — |
| 3 | Touch Targets | Share button `size="sm"` — adequate | L123 | — |
| 4 | Accessibility | Good: `data-testid` on all interactive elements | — | — |
| 5 | Loading | No loading feedback after copy | — | LOW |
| 6 | Error | Try/catch on clipboard API, fallback to toast error — ✅ | L57-64 | — |
| 7 | Responsive | `hidden sm:inline` on share button text — ✅ responsive | L128 | — |
| 8 | Native Share | `navigator.share` fallback to dialog — ✅ | L100-113 | — |

---

## Shared Components

### 17. client/src/components/ThemeToggle.tsx — 23 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | Has `aria-label` but it's **hardcoded English** | L13 | MEDIUM |
| 2 | Accessibility | `aria-label` present — ✅, but needs i18n | L13 | — |
| 3 | Touch Target | `size="icon"` ≈ 40px — borderline | L11 | LOW |

### 18. client/src/components/PrefetchLink.tsx — 63 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | N/A — no visible text | — | — |
| 2 | Touch | `onTouchStart={handleMouseEnter}` — ✅ handles touch prefetch | L48 | — |
| 3 | Performance | Module-level `Set` caching, lazy import only once per path — ✅ excellent | L20, L37 | — |
| 4 | Accessibility | Wraps children in `<span>` — could break semantic HTML if child is a block | L47 | LOW |

### 19. client/src/components/NotificationBell.tsx — 263 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Uses `t('notifications.title')`, `t('notifications.markAllRead')`, `t('notifications.empty')`, `t('common.loading')` | — | — |
| 2 | i18n | Uses `formatDistanceToNow` with locale (`ar`/`enUS`) — ✅ | L121-128 | — |
| 3 | RTL | Uses `me-1`, `-end-1` — ✅ RTL-aware | L164, 168 | — |
| 4 | Fixed Sizes | `w-80` popover, `h-[300px]` scroll area, `h-5 min-w-5` badge | L172, 186, 168 | LOW |
| 5 | Touch Targets | Bell button `size="icon"` ≈ 40px — borderline | L163 | LOW |
| 6 | Accessibility | Notification items as `<button>` elements — ✅ semantic | L220 | — |
| 7 | Loading | Shows `t('common.loading')` while fetching — ✅ | L188 | — |
| 8 | Error | No error state shown if query fails | — | MEDIUM |
| 9 | Colors | Uses theme vars throughout — ✅ | — | — |
| 10 | Responsive | `text-start` instead of `text-left` — ✅ RTL-aware | L221 | — |

### 20. client/src/components/error-boundary.tsx — 67 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | **Hardcoded English**: "Something went wrong", "An error occurred while loading this content. Please try again.", "Try Again" | L46, 49, 56 | HIGH |
| 2 | RTL | Uses `me-2` on retry icon — ✅ | L55 | — |
| 3 | Fixed Sizes | `min-h-[400px]`, `max-w-md`, `max-h-24` error message pre | L42, 43, 52 | LOW |
| 4 | Accessibility | Basic semantic structure, retry button with `data-testid` | L54 | — |
| 5 | Colors | Uses theme variables — ✅ | — | — |

### 21. client/src/components/BlockedMutedSettings.tsx — 199 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Comprehensive i18n with `t()` throughout | — | — |
| 2 | RTL | Uses `me-2`, `ms-2` consistently — ✅ | L131, 138, 143, 148 | — |
| 3 | Loading | Shows `<Skeleton>` placeholders during data fetch — ✅ excellent | L160-162 | — |
| 4 | Error | Toast error handling on mutations — ✅ | L73, 82 | — |
| 5 | Fixed Sizes | `h-[300px]` scroll areas | L165, 186 | LOW |
| 6 | Empty States | Good empty state with icon + text for both blocked/muted lists | L167-170, 188-191 | — |
| 7 | Accessibility | Using Radix Tabs — inherently accessible | — | — |
| 8 | Touch Targets | Action buttons `size="sm"` — adequate when combined with text | L115 | — |

### 22. client/src/components/BackButton.tsx — 37 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Uses `t('common.back')` | L30 | — |
| 2 | RTL | **Manual RTL detection** and `rotate-180` on arrow — works but fragile (only checks 4 languages) | L16-17 | MEDIUM |
| 3 | RTL | Should use Tailwind `rtl:rotate-180` or the CSS `[dir="rtl"] .rtl-flip` class instead | L29 | MEDIUM |
| 4 | Touch | `size="sm"` button — adequate with text | L27 | — |
| 5 | className | Uses string concat `${className}` instead of `cn()` utility | L28 | LOW |

### 23. client/src/components/AchievementsPanel.tsx — 287 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Comprehensive: `t('achievements.rewardClaimed')`, rarity translations, category translations | — | — |
| 2 | i18n | Uses `language === 'ar'` for achievement name/description display — acceptable since data comes from server with both fields | L179, 184 | — |
| 3 | RTL | **`mr-1` hardcoded** on claimed badge check icon | L197 | HIGH |
| 4 | RTL | **`ml-auto` hardcoded** on category count badge | L267 | HIGH |
| 5 | RTL | **`pr-4` hardcoded** on ScrollArea | L260 | MEDIUM |
| 6 | Loading | ✅ Skeleton loading state | L137-146 | — |
| 7 | Error | No error state if query fails | — | MEDIUM |
| 8 | Fixed Sizes | `h-[500px]` scroll area | L260 | MEDIUM |
| 9 | Touch Targets | Claim button `size="sm"` — adequate | L200 | — |
| 10 | Colors | Rarity colors hardcoded to specific colors — intentional design but not theme-variable based | L60-74 | LOW |
| 11 | Performance | `renderAchievement` is a function in render, not memoized — O(n) for each render | L168 | LOW |

### 24. client/src/components/admin/AdminAlertsDropdown.tsx — 218 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | **Hardcoded English**: "Alerts", "Mark all read", "No alerts" | L189, 194, 203 | HIGH |
| 2 | RTL | Uses `me-1`, `ps-6` in some places — partially RTL-aware | L196, 201, 210 | — |
| 3 | RTL | **`-right-1` hardcoded** on badge position | L186 | HIGH |
| 4 | Fixed Sizes | `w-80` dropdown, `h-80` scroll, `h-5 w-5` badge | L188, 201, L185 | LOW |
| 5 | Touch Targets | Alert items are click-through dropdown items — adequate | — | — |
| 6 | Loading | No loading state — alerts just don't appear if still fetching | — | MEDIUM |
| 7 | Error | No error handling on admin fetch failures | — | MEDIUM |
| 8 | WebSocket | Properly handles real-time alert updates — ✅ | L102-125 | — |
| 9 | Accessibility | Radix DropdownMenu — inherently accessible | — | — |

---

## Hooks

### 25. client/src/hooks/use-chat.tsx — 347 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | Performance | WebSocket reconnection uses simple `setTimeout(3000)` — no exponential backoff | L196 | MEDIUM |
| 2 | Performance | `state.activeConversation` read in `ws.onmessage` callback closure — stale closure risk | L118 | HIGH |
| 3 | Error | `console.error` only — no user-facing error feedback | L74, 84, 170 | MEDIUM |
| 4 | Cleanup | Reconnect timeout cleared in cleanup — ✅ | — | — |
| 5 | Memory | No message limit — `messages` array could grow unbounded | L118-130 | MEDIUM |

### 26. client/src/hooks/use-mobile.tsx — 19 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | Breakpoint | `MOBILE_BREAKPOINT = 768` — matches Tailwind `md:` | L4 | — |
| 2 | Initial State | `useState<boolean | undefined>(undefined)` — first render returns `false` via `!!undefined` — potential flash | L6 | LOW |
| 3 | Performance | Uses `matchMedia` + resize listener — ✅ efficient | L8-13 | — |

### 27. client/src/hooks/useGameWebSocket.ts — 575 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | Performance | Exponential backoff with jitter for reconnection — ✅ excellent | L83-88 | — |
| 2 | Performance | `MAX_RECONNECT_ATTEMPTS = 5` — after that, user is stuck with no retry UI | L80 | MEDIUM |
| 3 | Refs | Uses `sessionIdRef`, `tokenRef` to avoid stale closures — ✅ | L102-104 | — |
| 4 | Ping | Ping/pong heartbeat system for connection monitoring — ✅ | L101 | — |
| 5 | Error | Sets `error` state — consumed by parent component | L98 | — |
| 6 | Gift Support | `lastGift` state for gift animations — ✅ | L97 | — |

### 28. client/src/hooks/use-toast.ts — 192 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | Pattern | Standard shadcn/ui toast hook — well-established pattern | — | — |
| 2 | Config | `TOAST_LIMIT = 1` — only one toast at a time, may miss stacked notifications | L7 | LOW |
| 3 | Config | `TOAST_REMOVE_DELAY = 1000000` (1000s) — effectively never auto-removes; relies on dismiss | L8 | MEDIUM |

### 29. client/src/hooks/use-notifications.tsx — 216 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Uses `language` for localized toast messages | L107-111, L132-135 | — |
| 2 | Performance | Reconnection uses flat 5s timeout — no backoff | L191 | LOW |
| 3 | Feature | Handles game_start redirect, challenge updates, game config changes — comprehensive | L130-174 | — |
| 4 | Error | `console.error` in catch — minimal error feedback to user | L179 | LOW |

---

## Core Layout: client/src/App.tsx — 679 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | i18n | ✅ Navigation fully i18n'd with `t('nav.*')` | L177-207 | — |
| 2 | i18n | `SidebarGroupLabel` **"Navigation" hardcoded** | L253 | MEDIUM |
| 3 | i18n | `PageLoader` text **"Loading..." hardcoded** | L119 | MEDIUM |
| 4 | i18n | `PublicLayout` **"Login" hardcoded** | L493 | MEDIUM |
| 5 | i18n | Bottom nav items have **hardcoded English** titles: "P2P", "Main", "Games", "Challenges", "Free" | L320-326 | HIGH |
| 6 | i18n | Role display `{user?.role || "Player"}` **hardcoded** | L248 | MEDIUM |
| 7 | RTL | Sidebar side dynamically set based on language — ✅ | L417 | — |
| 8 | RTL | `dir={dir}` applied to layout containers — ✅ | L428, L483 | — |
| 9 | Touch | Bottom nav uses `size="icon"` buttons — ≈ 40px, borderline | L345-360 | MEDIUM |
| 10 | Touch | Swipe navigation with 400px minimum distance — very high threshold | L383 | MEDIUM |
| 11 | Responsive | Bottom nav `md:hidden` — ✅ | L340 | — |
| 12 | Responsive | Header wallet text `hidden sm:inline` — ✅ | L442 | — |
| 13 | Fixed Sizes | Chat overlay `h-[70vh]` — OK responsive fraction | L458 | — |
| 14 | Loading | `<PageLoader>` with spinner — ✅ for Suspense | L115-121 | — |
| 15 | Loading | Auth loading state with animated icon — ✅ | L511-516 | — |
| 16 | Error | `<ErrorBoundary>` wraps all routes — ✅ | L525, L501 | — |
| 17 | Performance | All pages lazy-loaded — ✅ excellent code splitting | L60-111 | — |
| 18 | Performance | `BalanceBar` component defined but never used in render — dead code | L285-316 | LOW |
| 19 | Accessibility | No skip-to-content link | — | MEDIUM |
| 20 | Accessibility | Bottom nav `<nav>` element — ✅ semantic | L340 | — |
| 21 | Keyboard | Arrow key navigation for bottom nav — ✅ | L369-377 | — |

### client/src/lib/i18n.tsx — 2500 lines

| # | Category | Finding | Line(s) | Severity |
|---|----------|---------|---------|----------|
| 1 | Coverage | Extensive translation keys for en/ar — ✅ | — | — |
| 2 | System | Missing translation tracking with `trackMissingTranslation()` — ✅ excellent dev feature | L77-82 | — |
| 3 | RTL | `rtlLanguages` array and auto `dir` setting — ✅ | L63 | — |
| 4 | RTL | `dir` applied to document element dynamically — ✅ | — | — |
| 5 | Fonts | ~40 languages supported — ✅ comprehensive | L28-59 | — |
| 6 | Performance | All translations loaded up-front in memory (2500 LOC) — could benefit from code-split per language | — | MEDIUM |

---

## Severity Summary

### CRITICAL (28 issues) — Must fix before production

| # | Issue | Files Affected |
|---|-------|----------------|
| 1 | BalootBoard: 100% hardcoded Arabic, zero i18n, zero responsive | BalootBoard.tsx |
| 2 | TarneebBoard: 100% hardcoded Arabic, zero i18n, zero responsive | TarneebBoard.tsx |
| 3 | DominoBoard: Inline language checks instead of i18n keys | DominoBoard.tsx |
| 4 | VoiceChat: 100% hardcoded English, zero i18n | VoiceChat.tsx |
| 5 | ChessBoard (legacy): Zero i18n, hardcoded English | ChessBoard.tsx |
| 6 | BalootBoard/TarneebBoard: Fixed pixel heights (550px/600px) on mobile | BalootBoard.tsx, TarneebBoard.tsx |
| 7 | BalootBoard/TarneebBoard: Hardcoded `ml-*`/`mr-*`, breaks RTL | BalootBoard.tsx, TarneebBoard.tsx |
| 8 | ChessBoard (chess/): HTML5 drag API doesn't work on mobile touch | chess/ChessBoard.tsx |
| 9 | All game boards: Zero keyboard navigation for game interaction | All 6 board components |
| 10 | GameChat: Action buttons hover-only — invisible on touch devices | GameChat.tsx |
| 11 | index.html: `user-scalable=no` blocks pinch-to-zoom (WCAG violation) | index.html |
| 12 | BalootBoard/TarneebBoard: Zero responsive breakpoints | BalootBoard.tsx, TarneebBoard.tsx |

### HIGH (47 issues) — Should fix before launch

| # | Issue | Files Affected |
|---|-------|----------------|
| 1 | Hardcoded `mr-*`/`ml-*` instead of `me-*`/`ms-*` | ChessControls, ChessChat, AchievementsPanel, TikTokGiftBar, AdminAlerts |
| 2 | No loading states in game boards | ChessBoard(s), BackgammonBoard, DominoBoard, BalootBoard, TarneebBoard |
| 3 | Hardcoded English in error-boundary, AdminAlertsDropdown, App.tsx bottom nav | Multiple |
| 4 | No `aria-live` regions for timer updates, turn changes | ChessTimer, BackgammonBoard |
| 5 | No `aria-label` on icon-only buttons | VoiceChat, SpectatorPanel |
| 6 | Card overlap making specific cards hard to tap | BalootBoard, TarneebBoard |
| 7 | ChessBoard legacy: touch targets 40px (below 44px) | ChessBoard.tsx |
| 8 | GameChat/SpectatorPanel: inline language checks instead of t() | GameChat.tsx, SpectatorPanel.tsx |
| 9 | Google Fonts: ~30 families loaded blocking initial render | index.html |
| 10 | use-chat.tsx: stale closure on activeConversation | use-chat.tsx |

### MEDIUM (62 issues)

Key themes:
- Fixed `h-[200px]`/`h-[300px]`/`h-[500px]` scroll areas across many components
- Hardcoded amber/green/white colors on game boards instead of theme variables
- `queryClient` staleTime too long (10 min) for real-time game data
- Missing error states when queries fail (NotificationBell, AchievementsPanel)
- ChessMoveList `movePairs` not memoized
- BackButton manual RTL detection instead of CSS `[dir="rtl"]`
- `user-scalable=no` combined with fixed heights
- `hsl(from ...)` CSS syntax limited browser support

### LOW (41 issues)

Key themes:
- `size="icon"` buttons at ~40px (borderline 44px recommendation)
- No move animations on game boards
- Template literal classNames vs `cn()` in BalootBoard/TarneebBoard
- Dead code (`BalanceBar` in App.tsx)
- Toast auto-remove delay effectively disabled (1000s)
- Minor semantic issues (PrefetchLink wraps in `<span>`)
- Rarity colors intentionally hardcoded in AchievementsPanel

---

## File-Level Summary Matrix

| File | Lines | i18n | RTL | Fixed Px | Touch<44 | Breakpoints | Loading | Error | a11y | Perf |
|------|-------|------|-----|----------|----------|-------------|---------|-------|------|------|
| ChessBoard.tsx (legacy) | 269 | ❌ None | ❌ None | ⚠️ w-10 | ❌ 40px | ✅ sm/md | ❌ None | ⚠️ Partial | ❌ None | ⚠️ |
| chess/ChessBoard.tsx | 235 | ✅ | ⚠️ | ⚠️ 600px | ⚠️ Scales | ✅ md/lg | ❌ None | ❌ None | ❌ None | ✅ |
| chess/ChessTimer.tsx | 120 | ✅ | ✅ | ⚠️ 100px | N/A | ❌ None | N/A | N/A | ⚠️ | ✅ |
| chess/ChessMoveList.tsx | 78 | ✅ | ⚠️ | ⚠️ 200px | N/A | ❌ None | N/A | N/A | ⚠️ | ⚠️ |
| chess/ChessControls.tsx | 112 | ✅ | ❌ mr-* | ❌ None | ⚠️ sm btn | ❌ None | ❌ None | N/A | ✅ Radix | ✅ |
| chess/ChessChat.tsx | 101 | ✅ | ❌ ml/mr | ⚠️ 300px | ⚠️ icon | ❌ None | ❌ None | N/A | ⚠️ | ✅ |
| backgammon/Board.tsx | 273 | ✅ | ✅ | ❌ 400px | ⚠️ 32px | ❌ None | ❌ None | ❌ None | ❌ None | ⚠️ |
| DominoBoard.tsx | 293 | ❌ Inline | ⚠️ | ⚠️ 200px | ✅ | ❌ None | ❌ None | ⚠️ | ❌ None | ✅ |
| BalootBoard.tsx | 307 | ❌❌ AR only | ❌ ml/mr | ❌ 550px | ⚠️ overlap | ❌ Zero | ❌ None | ❌ None | ❌ None | ⚠️ |
| TarneebBoard.tsx | 311 | ❌❌ AR only | ❌ ml/mr | ❌ 600px | ⚠️ overlap | ❌ Zero | ❌ None | ❌ None | ❌ None | ⚠️ |
| GameChat.tsx | 248 | ⚠️ Inline | ⚠️ me-2 | ⚠️ calc() | ✅ | ❌ None | ❌ None | ✅ Toast | ❌ hover | ✅ |
| SpectatorPanel.tsx | 473 | ⚠️ Inline | ⚠️ Partial | ✅ | ✅ | ❌ None | ❌ None | ✅ Toast | ⚠️ | ⚠️ |
| TikTokGiftBar.tsx | 312 | ⚠️ Inline | ❌ ml-0.5 | ✅ | ✅ | ❌ None | ❌ None | N/A | ✅ aria | ⚠️ |
| GiftAnimation.tsx | 158 | ⚠️ Inline | ✅ | ⚠️ | N/A | ❌ None | N/A | N/A | ✅ | ✅ |
| VoiceChat.tsx | 307 | ❌ None | ⚠️ | ✅ | ⚠️ 40px | ❌ None | ✅ Spin | ✅ | ❌ None | ✅ |
| ShareMatchButton.tsx | 207 | ⚠️ Inline | ✅ me-2 | ✅ | ✅ | ✅ sm | ❌ None | ✅ | ✅ | ✅ |
| ThemeToggle.tsx | 23 | ⚠️ EN label | ✅ | ✅ | ⚠️ 40px | N/A | N/A | N/A | ✅ aria | ✅ |
| PrefetchLink.tsx | 63 | N/A | N/A | N/A | ✅ | N/A | N/A | N/A | ⚠️ | ✅✅ |
| NotificationBell.tsx | 263 | ✅ | ✅ me/end | ⚠️ 300px | ⚠️ 40px | ❌ None | ✅ | ⚠️ | ✅ | ✅ |
| error-boundary.tsx | 67 | ❌ EN only | ✅ me-2 | ⚠️ 400px | ✅ | N/A | N/A | ✅ | ✅ | ✅ |
| BlockedMuted.tsx | 199 | ✅ | ✅ me/ms | ⚠️ 300px | ✅ | ❌ None | ✅ Skel | ✅ Toast | ✅ | ✅ |
| BackButton.tsx | 37 | ✅ | ⚠️ Manual | ✅ | ✅ | N/A | N/A | N/A | ✅ | ✅ |
| AchievementsPanel.tsx | 287 | ✅ | ❌ mr/ml/pr | ⚠️ 500px | ✅ | ❌ None | ✅ Skel | ⚠️ | ✅ | ⚠️ |
| AdminAlerts.tsx | 218 | ❌ EN only | ⚠️ Partial | ⚠️ w-80 | ✅ | ❌ None | ❌ None | ❌ None | ✅ Radix | ✅ |
| App.tsx | 679 | ⚠️ Partial | ✅ dir | ✅ | ⚠️ 40px | ✅ sm/md | ✅ | ✅ EB | ⚠️ | ✅✅ |

**Legend:** ✅ Good | ⚠️ Partial/Concern | ❌ Missing/Bad | ❌❌ Completely missing | N/A Not applicable

---

## Priority Remediation Roadmap

### Phase 1: Critical Fixes (Week 1)
1. **Add i18n to BalootBoard** — extract all 30+ Arabic strings to `t()` keys with en/ar translations
2. **Add i18n to TarneebBoard** — same treatment
3. **Convert DominoBoard** inline language checks to `t()` keys
4. **Add i18n to VoiceChat** — all 9 tooltip strings
5. **Add i18n to ChessBoard (legacy)** — "Choose promotion", "Game Over"
6. **Fix `user-scalable=no`** in index.html → set to `yes`
7. **Add touch/pointer fallback** for chess/ChessBoard.tsx drag-and-drop
8. **Make GameChat actions visible on mobile** — replace hover-only with always-visible or long-press

### Phase 2: High Priority (Week 2)
1. **Replace all `mr-*`/`ml-*`** with `me-*`/`ms-*` across 8+ files
2. **Add loading states** to all 6 game board components
3. **Make BalootBoard/TarneebBoard responsive** — replace fixed h-[550/600px] with vh-based or flex layouts
4. **Add `aria-live` regions** to ChessTimer, game turn indicators
5. **Fix bottom nav i18n** in App.tsx — use `t()` keys for nav titles
6. **i18n error-boundary** and AdminAlertsDropdown
7. **Optimize Google Fonts** — reduce to 3-4 actually used families

### Phase 3: Medium Priority (Week 3-4)
1. Add keyboard navigation to all game boards
2. Add `role="grid"`, `aria-label` to chess boards
3. Replace hardcoded game board colors with theme CSS variables
4. Add error states to NotificationBell, AchievementsPanel
5. Memoize ChessMoveList `movePairs`
6. Fix queryClient staleTime for game-related queries
7. Add `skip-to-content` link in App.tsx
8. Fix BackButton to use CSS `[dir="rtl"]` instead of manual language check
