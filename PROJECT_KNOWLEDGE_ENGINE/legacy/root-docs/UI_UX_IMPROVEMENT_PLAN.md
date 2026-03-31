# خطة تحسين UI/UX الشاملة — منصة VEX
### تاريخ الإنشاء: 23 فبراير 2026
### الحالة: ⏳ في انتظار التأكيد
### مبنية على: تحليل سطر-بسطر لـ 135 ملف TSX (178 مشكلة مكتشفة)

---

## 📊 تقرير التحليل العميق — الوضع الحالي

### الأرقام الحقيقية من فحص كامل الكود:

| المقياس | الرقم الحالي | الهدف | الخطورة |
|---------|-------------|-------|---------|
| كلاسات `mr-`/`ml-` المكسورة في RTL | **127** في 24 ملف | **0** | 🔴 حرج |
| ملفات بدون أي `useI18n` | **18** صفحة (4 رئيسية + 14 أدمن) | **0** | 🔴 حرج |
| نصوص إنجليزية مكتوبة يدوياً | **21** صفحة فيها نصوص hardcoded | **0** | 🔴 حرج |
| ألوان hardcoded تتجاوز نظام الثيم | **616** في 44 ملف | **< 20** (استثناءات فقط) | 🔴 حرج |
| خطوط Google محملة | **25** عائلة خط (فعلياً نستخدم **2** فقط) | **2-3** | 🔴 حرج |
| ملفات بدون breakpoints تجاوبية | **76** من 135 (**56%**) | **< 10%** | 🟠 عالي |
| نصوص أصغر من 12px | **7** مواقع (`text-[10px]`) | **0** | 🟠 عالي |
| ارتفاعات ثابتة في الألعاب | **5** (`h-[550px]`, `h-[600px]`...) | **0** | 🟠 عالي |
| أزرار أصغر من 44px (touch target) | **7** أزرار `size="icon"` | **0** | 🟠 عالي |
| `aria-*` attributes في كل المشروع | **25** فقط (19 في مكتبة UI) | **200+** | 🟡 متوسط |
| hover-only interactions (لا تعمل بالموبايل) | **1** حرجة (GameChat block/mute) | **0** | 🟡 متوسط |
| `dangerouslySetInnerHTML` (خطر XSS) | **2** ملفين (play.tsx, chart.tsx) | **0** أو مع sanitize | 🟡 متوسط |
| `user-scalable=no` في viewport | **يوجد** (يخالف WCAG 1.4.4) | **إزالة** | 🟡 متوسط |

---

### أخطر 5 مشاكل مكتشفة:

**1. صفحة تسجيل الدخول (login.tsx):**
100% إنجليزية، صفر `t()` calls، 10 كلاسات `mr-` مكسورة — هذه أول صفحة يراها كل مستخدم عربي

**2. BalootBoard + TarneebBoard:**
ارتفاعات ثابتة (550px/600px) تتجاوز شاشة أي موبايل، كل النصوص عربية hardcoded بدون i18n، مقاسات الكروت مختلفة بين اللعبتين (Baloot: `w-14 h-20` vs Tarneeb: `w-16 h-24`)

**3. 25 خط Google محملة في طلب واحد:**
حجم ~400KB+ render-blocking. Architects Daughter, DM Sans, Fira Code, Geist, Geist Mono, IBM Plex Mono, IBM Plex Sans, Inter, JetBrains Mono, Libre Baskerville, Lora, Merriweather, Montserrat, Open Sans, Outfit, Oxanium, Playfair Display, Plus Jakarta Sans, Poppins, Roboto, Roboto Mono, Source Code Pro, Source Serif 4, Space Grotesk, Space Mono — **فعلياً نستخدم Poppins فقط!**

**4. 616 كلاس لون hardcoded:**
`text-green-500`, `bg-red-500`, `text-gray-*` — لا تتغير مع Dark/Light mode وتكسر نظام الثيم

**5. chess/ChessBoard.tsx يستخدم HTML5 Drag API:**
لا يعمل على الموبايل إطلاقاً — **الشطرنج غير قابل للعب بالسحب على أي هاتف!**

---

### توزيع المشاكل حسب الخطورة:

```
CRITICAL (28 مشكلة):  ████████████████████████████
HIGH     (47 مشكلة):  ███████████████████████████████████████████████
MEDIUM   (62 مشكلة):  ██████████████████████████████████████████████████████████████
LOW      (41 مشكلة):  █████████████████████████████████████████
                       المجموع: 178 مشكلة
```

---

## 🏗️ خطة التحسين — 10 مراحل مفصلة

---

## المرحلة 0: إصلاحات طوارئ ⚡
> مشاكل تُحل بسطر واحد لكن تأثيرها ضخم — 20 دقيقة فقط

#### 0.1 — حذف 23 خطاً غير مستخدم من index.html
- **الملف**: `client/index.html` سطر 20
- **المشكلة**: طلب واحد يحمّل 25 عائلة خطوط (~400KB+) render-blocking. المستخدم يرى شاشة بيضاء حتى تتحمل
- **الحل**: الإبقاء على `Poppins` (الخط الرئيسي في `--font-sans`) + خط عربي مثل Cairo
- **الأثر المتوقع**: تسريع First Contentful Paint بـ 1-3 ثواني
- [ ] **مهمة**: حذف 23 عائلة خط غير مستخدمة من رابط Google Fonts
- [ ] **مهمة**: إضافة `font-display: swap` لمنع عدم ظهور النص أثناء التحميل
- [ ] **مهمة**: إضافة `<link rel="preload">` للخط الرئيسي Poppins

#### 0.2 — إزالة `user-scalable=no` من viewport
- **الملف**: `client/index.html` سطر 6
- **المشكلة**: يمنع المستخدم من تكبير النص — مخالفة WCAG 1.4.4 (resize text). أصحاب النظر الضعيف لا يستطيعون تكبير
- **الحل**: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`
- [ ] **مهمة**: إزالة `maximum-scale=1, user-scalable=no`
- [ ] **مهمة**: إضافة `viewport-fit=cover` لدعم iPhone notch/Dynamic Island

#### 0.3 — إصلاح `useIsMobile()` hydration flash
- **الملف**: `client/src/hooks/use-mobile.tsx` سطر 7
- **المشكلة**: القيمة الأولية `undefined` → يعرض desktop layout لإطار واحد ثم يقفز للموبايل (وميض مرئي)
- **الحل**:
```ts
const [isMobile, setIsMobile] = React.useState<boolean>(
  () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
)
```
- [ ] **مهمة**: تعديل initial state ليقرأ العرض فوراً
- [ ] **مهمة**: إزالة `!!isMobile` coercion (لم يعد `undefined`)

#### 0.4 — إصلاح swipe navigation المكسورة
- **الملف**: `client/src/App.tsx` سطر 371
- **المشكلة**: `minSwipeDistance = 400` — أكثر من عرض معظم الهواتف! لا أحد يستطيع عمل swipe بـ 400 بكسل
- **الحل**: تقليل إلى `75` (معيار مألوف في تطبيقات الموبايل)
- [ ] **مهمة**: تغيير `const minSwipeDistance = 400` → `const minSwipeDistance = 75`

---

## المرحلة 1: البنية التحتية للتصميم (Design Foundation)
> بناء الأساس الذي ستعتمد عليه كل المراحل التالية

#### 1.1 — إنشاء Design Tokens موحدة
- **إنشاء ملف**: `client/src/lib/design-tokens.ts`
- **المبرر**: حالياً كل مكون يستخدم أرقام مختلفة (BalootBoard: `h-[550px]`, TarneebBoard: `h-[600px]`, ChessChat: `h-[300px]`...) بدون نظام
- **المحتوى**:
```ts
export const BREAKPOINTS = {
  xs: 320,   // iPhone SE, أصغر شاشة مدعومة
  sm: 375,   // iPhone 12/13/14 standard
  md: 768,   // iPad portrait
  lg: 1024,  // iPad landscape / small laptops
  xl: 1440,  // Desktop monitors
} as const;

export const TOUCH = {
  minTarget: 44,   // WCAG 2.1 minimum touch target
  comfortable: 48,  // Apple HIG recommendation
  large: 56,        // للأزرار الرئيسية الكبيرة
} as const;

export const GAME_SIZES = {
  card: { w: 56, h: 80 },         // w-14 h-20 — كروت Baloot + Tarneeb موحدة
  cardSm: { w: 48, h: 68 },       // نسخة مصغرة للموبايل
  chessPiece: { min: 32, comfortable: 44 },
  checker: { min: 24, comfortable: 32 },
  dominoDot: { min: 8 },           // minimum dot diameter
} as const;

export const GAME_HEIGHTS = {
  maxBoard: 'min(600px, calc(100vh - 120px))',  // التكيف مع viewport
  maxPanel: 'min(300px, 40vh)',
} as const;
```
- [ ] **مهمة**: إنشاء الملف مع كل الثوابت
- [ ] **مهمة**: تصدير Types لكل token
- [ ] **مهمة**: استخدام في كل مكون لعبة (سيتم في المراحل اللاحقة)

#### 1.2 — إضافة CSS Custom Properties للألعاب
- **الملف**: `client/src/index.css`
- **المشكلة**: كل لعبة تستخدم ألوان hardcoded مختلفة (BackgammonBoard: `bg-orange-900`, DominoBoard: `bg-green-800`, BalootBoard: `bg-amber-900`...)
- **الحل**: إضافة CSS variables موحدة تتغير مع Dark/Light mode:
```css
:root {
  /* Game Board Colors */
  --game-board-bg: hsl(30 40% 25%);        /* خلفية لوح اللعب */
  --game-felt: hsl(142 40% 25%);           /* سطح طاولة اللعب */
  --game-card-bg: hsl(0 0% 100%);          /* خلفية الكرت */
  --game-card-text: hsl(0 0% 10%);         /* نص الكرت */
  --game-highlight: hsl(45 93% 58%);       /* تمييز الحركة */
  --game-valid-move: hsl(142 60% 50% / 0.4);  /* حركة صالحة */
  --game-last-move: hsl(45 93% 58% / 0.3);    /* آخر حركة */
  --game-danger: hsl(0 84% 60% / 0.4);        /* كش / خطر */
  --game-selected: hsl(199 89% 48% / 0.5);    /* قطعة محددة */

  /* Game Layout */
  --touch-target-min: 44px;
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --game-board-max-h: min(600px, calc(100vh - var(--safe-area-bottom) - 120px));
}
.dark {
  --game-board-bg: hsl(30 30% 15%);
  --game-felt: hsl(142 30% 15%);
  --game-card-bg: hsl(220 13% 18%);
  --game-card-text: hsl(45 20% 90%);
}
```
- [ ] **مهمة**: إضافة 15+ CSS variable للألعاب في `:root` و `.dark`
- [ ] **مهمة**: ربط كل لوحة لعبة بالـ variables (سيتم في المرحلة 5)
- [ ] **مهمة**: اختبار التوافق مع ThemeToggle

#### 1.3 — إضافة Tailwind Utilities للألوان الحرجة
- **الملف**: `tailwind.config.ts`
- **المشكلة**: لا يوجد `text-success` أو `bg-success` في التصميم — المطورون يستخدمون `text-green-500` مباشرة
- **الحل**: إضافة ألوان theme-aware:
```ts
colors: {
  success: {
    DEFAULT: "hsl(var(--success) / <alpha-value>)",
    foreground: "hsl(var(--success-foreground) / <alpha-value>)",
  },
  warning: {
    DEFAULT: "hsl(var(--warning) / <alpha-value>)",
    foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
  },
  info: {
    DEFAULT: "hsl(199 89% 48% / <alpha-value>)",
    foreground: "hsl(0 0% 100%)",
  },
}
```
- [ ] **مهمة**: إضافة `success`, `warning`, `info` في tailwind.config.ts
- [ ] **مهمة**: البدء باستبدال `text-green-*` → `text-success` في الملفات الأكثر استخداماً

#### 1.4 — تنظيف 616 لون Hardcoded (بشكل تدريجي)
- **المشكلة**: 616 كلاس لون مباشر يتجاوز نظام الثيم
- **خطة الاستبدال** (ستُنفذ تدريجياً مع كل مرحلة):

| اللون الحالي | البديل | عدد الحالات | الأولوية |
|-------------|--------|------------|---------|
| `text-green-500/600` | `text-success` | ~80 | 🔴 عالية |
| `text-red-500/600` | `text-destructive` | ~60 | 🔴 عالية |
| `bg-green-*` | `bg-success` أو `bg-chart-2` | ~40 | 🟠 متوسطة |
| `bg-red-*` | `bg-destructive` | ~30 | 🟠 متوسطة |
| `text-gray-*/400/500/900` | `text-muted-foreground` / `text-foreground` | ~150 | 🟡 تدريجية |
| `bg-gray-*/50/100/200` | `bg-muted` / `bg-secondary` | ~100 | 🟡 تدريجية |
| `text-yellow-*/amber-*` | `text-warning` / `text-primary` | ~40 | 🟡 تدريجية |
| `border-gray-*` | `border-border` | ~50 | 🟡 تدريجية |
| ألوان الألعاب (`bg-orange-900`...) | `var(--game-*)` CSS variables | ~66 | 🟠 مع المرحلة 5 |

- [ ] **مهمة**: استبدال ألوان success/destructive في الصفحات الرئيسية أولاً
- [ ] **مهمة**: استبدال ألوان gray في الصفحات الأكثر زيارة (dashboard, wallet, challenges)
- [ ] **مهمة**: استبدال ألوان الألعاب عند إصلاح كل لوحة

#### 1.5 — تحديث design_guidelines.md
- **المشكلة**: الملف يصف تصميم "1xBet green (#00c853)" لكن التطبيق الفعلي يستخدم "Binance gold (hsl 45 93% 58%)" مع خط Poppins
- [ ] **مهمة**: إعادة كتابة الملف ليطابق التصميم الفعلي
- [ ] **مهمة**: توثيق Color Palette (Primary gold, Success green, Destructive red, Muted gray)
- [ ] **مهمة**: توثيق Typography scale (Poppins weights)
- [ ] **مهمة**: توثيق Spacing system (4px base)
- [ ] **مهمة**: توثيق Component patterns (Card, Button, Input, Badge)

---

## المرحلة 2: الترجمة و RTL — أول انطباع المستخدم
> صفحة تسجيل الدخول يراها **كل** مستخدم. إذا كانت مكسورة بالعربي = تفقد المصداقية فوراً

#### 2.1 — ترجمة صفحة تسجيل الدخول (login.tsx) بالكامل — الأولوية #1
- **الحجم**: ~971 سطر، ~60+ نص hardcoded إنجليزي، 10 كلاسات `mr-`
- **التغييرات المطلوبة**:

| النص الحالي (إنجليزي) | المفتاح | الترجمة العربية |
|----------------------|---------|----------------|
| "Welcome Back" | `login.welcomeBack` | "مرحباً بعودتك" |
| "Create Account" | `login.createAccount` | "إنشاء حساب" |
| "Quick & Easy Login" | `login.quickLogin` | "تسجيل دخول سريع" |
| "Email Address" | `login.email` | "البريد الإلكتروني" |
| "Username" | `login.username` | "اسم المستخدم" |
| "Password" | `login.password` | "كلمة المرور" |
| "Confirm Password" | `login.confirmPassword` | "تأكيد كلمة المرور" |
| "Sign In" | `login.signIn` | "تسجيل الدخول" |
| "Continue with Google" | `login.google` | "المتابعة مع Google" |
| "Continue with Apple" | `login.apple` | "المتابعة مع Apple" |
| + ~50 نص آخر | ... | ... |

**إصلاحات RTL مطلوبة في login.tsx**:
- [ ] **مهمة**: استيراد `useI18n` واستخدام `t()` لكل نص
- [ ] **مهمة**: `mr-1`/`mr-2` → `me-1`/`me-2` (10 مواقع)
- [ ] **مهمة**: إضافة `dir={dir}` للعنصر الرئيسي
- [ ] **مهمة**: إضافة 60+ مفتاح ترجمة في ملفي en/ar
- [ ] **مهمة**: اختبار الصفحة بالعربي (RTL) والإنجليزي (LTR)

#### 2.2 — ترجمة الصفحات الرئيسية الأربع المتبقية (بدون i18n)
- **complaints.tsx** — 4 نصوص hardcoded:
  - [ ] "File a Complaint", "Subject", "Status", "Submitted"
- **games.tsx** — 12 نصاً:
  - [ ] أسماء الألعاب، أوصافها، أزرار "Play", "Practice"
- **not-found.tsx** — 2 نصين:
  - [ ] "404", "Page not found"
- **settings.tsx** — 7 نصوص:
  - [ ] "Theme", "Language", "Notifications", "Sound", etc.

#### 2.3 — إصلاح 127 كلاس RTL مكسور عبر المشروع
- **قائمة الملفات بالترتيب** (الأكثر مشاكل → الأقل):

| # | الملف | `mr-` | `ml-` | `pl-`/`pr-` | المجموع | الأولوية |
|---|-------|------|------|------------|---------|---------|
| 1 | game-lobby.tsx | 13 | 5 | 0 | **18** | 🔴 |
| 2 | login.tsx | 10 | 0 | 0 | **10** | 🔴 |
| 3 | admin-seo.tsx | 10 | 0 | 0 | **10** | 🟡 |
| 4 | admin-app-settings.tsx | 8 | 0 | 0 | **8** | 🟡 |
| 5 | admin-p2p.tsx | 7 | 1 | 1 | **9** | 🟡 |
| 6 | BalootBoard.tsx | 0 | 4 | 0 | **4** | 🔴 |
| 7 | TarneebBoard.tsx | 0 | 4 | 0 | **4** | 🔴 |
| 8 | TikTokGiftBar.tsx | 0 | 3 | 0 | **3** | 🟡 |
| 9 | admin-unified-games.tsx | 0 | 2 | 1 | **3** | 🟡 |
| 10 | admin-users.tsx | 0 | 1 | 1 | **2** | 🟡 |
| 11-24 | باقي الملفات (14 ملف) | 1-5 | 0-1 | 0-2 | 1-5 | 🟢 |

- [ ] **مهمة**: استبدال كل `mr-N` → `me-N` (107 موقع)
- [ ] **مهمة**: استبدال كل `ml-N` → `ms-N` (20 موقع)
- [ ] **مهمة**: استبدال `pl-`/`pr-` في كود التطبيق (12 موقع) — مكتبة UI تبقى كما هي
- [ ] **مهمة**: اختبار كل صفحة معدّلة بالعربي

#### 2.4 — ترجمة لوحات اللعبة (BalootBoard + TarneebBoard + VoiceChat)

**BalootBoard.tsx** — كل النصوص عربية hardcoded:

| النص الحالي | المفتاح | الترجمة الإنجليزية |
|------------|---------|-------------------|
| "اختر نوع اللعب" | `baloot.chooseType` | "Choose game type" |
| "صن" | `baloot.sun` | "Sun" |
| "حكم" | `baloot.hokm` | "Hokm" |
| "مشوار" | `baloot.round` | "Round" |
| "النتيجة" | `baloot.score` | "Score" |
| + 15 نص آخر | ... | ... |

- [ ] **مهمة**: إضافة `useI18n` + استبدال بـ `t('baloot.XXX')`
- [ ] **مهمة**: إضافة namespace `baloot.*` في ملفات الترجمة

**TarneebBoard.tsx** — نفس النمط:
- [ ] **مهمة**: إضافة `useI18n` + `t('tarneeb.XXX')` لـ "المزايدة", "بس", "الرابح"...

**VoiceChat.tsx** — 100% إنجليزية:
- [ ] **مهمة**: إضافة `useI18n` + ترجمة كل الأزرار والتسميات

#### 2.5 — ترجمة لوحة الأدمن (14 ملفاً بدون i18n)

| # | الملف | عدد النصوص | مثال |
|---|-------|-----------|------|
| 1 | admin-currency.tsx | **43** | "Currency Settings", "Exchange Rate"... |
| 2 | admin-p2p.tsx | **33** | "P2P Management", "Active Trades"... |
| 3 | admin-users.tsx | **13** | "Users", "Ban", "Verify"... |
| 4 | admin-payment-methods.tsx | **13** | "Payment Methods", "Add New"... |
| 5 | admin-analytics.tsx | **12** | "Analytics", "Revenue", "Users"... |
| 6 | admin-disputes.tsx | **10** | "Disputes", "Resolve", "Close"... |
| 7-14 | 8 ملفات أخرى | 3-7 | ... |

- [ ] **مهمة**: إنشاء namespace `admin.*` في ملفات الترجمة
- [ ] **مهمة**: إضافة `useI18n` لكل ملف + استبدال النصوص (إجمالي ~180 نص)

---

## المرحلة 3: إنشاء مكونات مشتركة (Shared Components)
> بناء "لبنات" قابلة لإعادة الاستخدام بدل تكرار نفس الكود 5-10 مرات

#### 3.1 — مكون `<GameLayout>` الموحد
- **المشكلة الحالية**: كل صفحة لعبة (ChessGame, BackgammonGame, DominoGame, TarneebGame, BalootGame) تبني layout بطريقة مختلفة تماماً — لا اتساق

**التصميم المقترح**:
```
Desktop (>768px):                    Mobile (<768px):
┌─────────────┬────────────┐        ┌──────────────────┐
│             │ Player 2   │        │  P2 ⏱ 03:45      │
│             ├────────────┤        ├──────────────────┤
│  Game Board │  Chat /    │        │                  │
│  (flexible) │  Moves /   │        │   Game Board     │
│             │  Spectator │        │   (100% width)   │
│             │  (tabs)    │        │                  │
│             ├────────────┤        ├──────────────────┤
│             │ Player 1   │        │  P1 ⏱ 05:12      │
└─────────────┴────────────┘        ├══════════════════┤
                                    │ [💬 Chat] [📋 Moves] [👁 Spec] │
                                    └──────────────────┘

Landscape Mobile:
┌──────────────┬──────────┐
│              │ [💬|📋|👁] │
│  Game Board  │  (tabs)   │
│              │           │
└──────────────┴──────────┘
```

- [ ] **مهمة**: إنشاء `client/src/components/games/GameLayout.tsx`
  - Props: `board`, `timer`, `chat`, `spectators`, `controls`, `moveList`
  - Auto-detect mobile/desktop/landscape
  - Connection status indicator (top bar)
  - Game result overlay
- [ ] **مهمة**: تطبيق على كل لعبة (5 ملفات game pages)

#### 3.2 — مكون `<BalanceDisplay>` + `useBalance()` hook
- **المشكلة**: نفس كود hide/show balance مكرر في 3 أماكن:
  1. `App.tsx:130-167` → `SidebarBalanceDisplay`
  2. `App.tsx:278-307` → `BalanceBar`
  3. `wallet.tsx` → balance display داخلي
- كلها تقرأ `localStorage('hideBalance')` بشكل مستقل — ممكن تتعارض!

- [ ] **مهمة**: إنشاء `client/src/hooks/useBalance.ts`:
```ts
// يزامن hide/show state عبر كل المكونات + localStorage
export function useBalance() {
  const [isHidden, setIsHidden] = useSyncExternalStore(...)
  const toggle = () => { ... }
  return { isHidden, toggle, formatted: isHidden ? '******' : `$${...}` }
}
```
- [ ] **مهمة**: إنشاء `client/src/components/BalanceDisplay.tsx`
- [ ] **مهمة**: استبدال 3 تكرارات بالمكون الجديد

#### 3.3 — مكونات Skeleton موحدة
- **المشكلة**: معظم الصفحات تعرض spinner `<Loader2>` بسيط أثناء التحميل — content layout shift عند الانتهاء
- [ ] **مهمة**: إنشاء `client/src/components/skeletons/`:

| المكون | الاستخدام | الشكل |
|--------|----------|-------|
| `GameCardSkeleton` | challenges, games, play | Card شكل + shimmer |
| `TableRowSkeleton` | P2P, transactions, admin tables | 5-7 columns + shimmer |
| `ProfileSkeleton` | player-profile, leaderboard | Avatar circle + text lines |
| `DashboardSkeleton` | dashboard | Stat cards grid + chart placeholder |
| `ChatSkeleton` | chat conversations | Avatar + message bubble lines |

- [ ] **مهمة**: تطبيقها على كل صفحة تستخدم `useQuery` (استبدال `isLoading ? <Spinner> : ...`)

#### 3.4 — مكون `<EmptyState>` موحد
- **المشكلة**: 8+ صفحات تظل فارغة بدون أي توضيح عندما لا تحتوي بيانات
- [ ] **مهمة**: إنشاء `client/src/components/EmptyState.tsx`:
```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```

**خريطة التطبيق**:

| الصفحة | الحالة | الرسالة | الإجراء |
|--------|--------|---------|--------|
| Challenges (My) | لا تحديات خاصة | "لم تنشئ تحديات بعد" | "أنشئ تحدياً" |
| Challenges (Available) | لا تحديات متاحة | "لا تحديات متاحة حالياً" | — |
| Friends | لا أصدقاء | "لم تضف أصدقاء بعد" | "ابحث عن أصدقاء" |
| Transactions | لا معاملات | "لا معاملات بعد" | "اشحن المحفظة" |
| Chat | لا محادثات | "لا محادثات" | "ابدأ محادثة" |
| Complaints | لا شكاوى | "لا شكاوى — رائع!" | — |
| P2P Offers | لا عروض | "لا عروض متاحة" | "أنشئ عرضاً" |
| Game Lobby | لا غرف | "لا غرف نشطة" | "أنشئ غرفة" |

- [ ] **مهمة**: تطبيق EmptyState على كل القوائم أعلاه

#### 3.5 — مكون `<QueryErrorState>` + Offline Banner
- **المشكلة**: 3+ صفحات بدون error handling مرئي — الخطأ يُبتلع بصمت
- [ ] **مهمة**: إنشاء `<QueryErrorState>`:
```tsx
<QueryErrorState error={error} onRetry={refetch} />
// يعرض: أيقونة خطأ + رسالة + زر "حاول مرة أخرى"
```
- [ ] **مهمة**: إنشاء `<OfflineBanner>` في App.tsx:
```tsx
// يراقب navigator.onLine + online/offline events
// يعرض banner أصفر: "لا يوجد اتصال بالإنترنت" + auto-retry عند العودة
```
- [ ] **مهمة**: لف كل `useQuery` بـ error handling مرئي

#### 3.6 — مكون `<ConfirmDialog>` موحد
- **المشكلة**: عمليات حساسة تتم بدون تأكيد (سحب رصيد, استسلام, حذف)
- [ ] **مهمة**: إنشاء `<ConfirmDialog>` يستخدم `AlertDialog` من shadcn:
```tsx
<ConfirmDialog
  open={showConfirm}
  title={t('confirm.withdraw')}
  description={t('confirm.withdrawDesc', { amount })}
  confirmLabel={t('common.confirm')}
  variant="destructive" // red button
  onConfirm={handleWithdraw}
  onCancel={() => setShowConfirm(false)}
/>
```
- [ ] **مهمة**: تطبيق على: سحب رصيد, استسلام في اللعبة, حذف طريقة دفع, حظر/كتم مستخدم, حذف عرض P2P

---

## المرحلة 4: تجاوب الصفحات الرئيسية
> كل صفحة يجب أن تعمل على شاشة 320px بدون horizontal scroll

#### 4.1 — تجاوب صفحة P2P (الأعلى أولوية)
- **المشكلة الحالية**:
  - جدول 7 أعمدة: Advertiser | Price | Amount | Limit | Payment | Rating | Action — يتجاوز عرض أي موبايل
  - Filter bar `grid-cols-4` يكسر على 320px
  - `WORLD_CURRENCIES` — 150+ عنصر inline في الملف

- [ ] **مهمة**: إنشاء `P2POfferCard.tsx` — بطاقة compact:
```
┌─────────────────────────┐
│ 👤 TraderName  ⭐ 4.85  │
│ BTC → USD               │
│ Price: $45,230.00       │
│ Limit: $100 - $5,000    │
│ [💳 Bank] [📱 Wallet]    │
│ ┌─────────────────────┐ │
│ │     شراء / Buy       │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```
- [ ] **مهمة**: `{isMobile ? <P2POfferCard> : <Table>}` — toggle بين card و table
- [ ] **مهمة**: Filter bar: `grid-cols-2 sm:grid-cols-4` مع select dropdown بدل chips على الموبايل
- [ ] **مهمة**: نقل `WORLD_CURRENCIES` (~6KB) إلى `client/src/lib/currencies.ts` + lazy import
- [ ] **مهمة**: إضافة pagination (20 offer/page) مع `keepPreviousData: true`
- [ ] **مهمة**: إضافة skeleton loading

#### 4.2 — تجاوب صفحة Challenges
- [ ] **مهمة**: إضافة pagination (10/page) للقوائم الثلاث (Active/Available/My)
- [ ] **مهمة**: إضافة filter chips مع `flex-wrap` على الموبايل
- [ ] **مهمة**: إضافة EmptyState لكل tab
- [ ] **مهمة**: إصلاح `size="icon"` button (سطر 672) — `h-6 w-6` → `h-10 w-10`
- [ ] **مهمة**: إضافة loading skeleton

#### 4.3 — تجاوب Game Lobby
- **18 كلاس RTL مكسور** — الأعلى في المشروع
- [ ] **مهمة**: استبدال 18 كلاس RTL (سيتم في المرحلة 2.3)
- [ ] **مهمة**: إضافة responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- [ ] **مهمة**: تحسين lobby cards: `min-w-0` لمنع overflow
- [ ] **مهمة**: إضافة EmptyState "لا غرف نشطة"

#### 4.4 — تجاوب Dashboard
- [ ] **مهمة**: responsive stat cards: `grid-cols-2 sm:grid-cols-2 lg:grid-cols-4` (2×2 على الموبايل)
- [ ] **مهمة**: إضافة error state لكل useQuery
- [ ] **مهمة**: إضافة قسم "آخر الألعاب" (5 مباريات)
- [ ] **مهمة**: إضافة "أصدقاء نشطين" (أونلاين)
- [ ] **مهمة**: استبدال `text-[12px]` بـ `text-xs`

#### 4.5 — تحسين Wallet
- [ ] **مهمة**: فصل `paymentMethod` state بين Deposit و Withdraw tabs (bug حالي)
- [ ] **مهمة**: استبدال balance display بمكون `<BalanceDisplay>` المشترك
- [ ] **مهمة**: إضافة preview فوري لتحويل العملات (debounced input, 300ms)
- [ ] **مهمة**: responsive layout: `flex-col sm:flex-row`

#### 4.6 — تحسين Transactions
- [ ] **مهمة**: إضافة pagination (20/page)
- [ ] **مهمة**: Mobile table: إخفاء أعمدة ثانوية (Date, Type) — عرض card list بدلاً
- [ ] **مهمة**: إضافة filter بالنوع والتاريخ
- [ ] **مهمة**: إضافة EmptyState

#### 4.7 — تحسين Friends
- [ ] **مهمة**: إضافة pagination/infinite scroll (20/page)
- [ ] **مهمة**: تحسين friend card على الموبايل (stack vertically)
- [ ] **مهمة**: إضافة EmptyState "لم تضف أصدقاء بعد"
- [ ] **مهمة**: إضافة search bar

#### 4.8 — تحسين Chat — 0 breakpoints حالياً!
- [ ] **مهمة**: Desktop: `flex-row` — قائمة يسار + رسائل يمين
- [ ] **مهمة**: Mobile: `flex-col` — full-screen list → tap → full-screen messages + back button
- [ ] **مهمة**: تكبير touch targets في header المحادثة
- [ ] **مهمة**: إضافة typing indicator

#### 4.9 — تحسين Support
- [ ] **مهمة**: إضافة form validation مرئية (inline errors)
- [ ] **مهمة**: إضافة loading state أثناء الإرسال
- [ ] **مهمة**: confirmation message بعد الإرسال الناجح

#### 4.10 — تحسين Settings
- [ ] **مهمة**: ترجمة 7 نصوص hardcoded
- [ ] **مهمة**: responsive layout لقسم الإعدادات

#### 4.11 — تحسين Leaderboard
- [ ] **مهمة**: استبدال `ml-*` (2 مواقع) بـ `ms-*`
- [ ] **مهمة**: إضافة pagination (25/page)
- [ ] **مهمة**: تحسين ranking table على الموبايل

---

## المرحلة 5: تجاوب ألواح الألعاب الخمسة
> اللعب على الموبايل يجب أن يكون مريحاً — هذه المرحلة الأكبر تأثيراً على تجربة المستخدم

#### 5.1 — إصلاح ChessBoard — الأعلى أولوية ⚡

##### 5.1.1 — دعم اللمس (Touch) — حرج!
- **المشكلة**: HTML5 Drag API (`onDragStart`, `onDragOver`, `onDrop`) **لا تعمل على الموبايل**. الشطرنج غير قابل للعب بالسحب!
- **ملفات المشكلة**: `client/src/components/games/chess/ChessBoard.tsx`
- **الحل**: استبدال بـ Pointer Events API (يعمل Desktop + Mobile + Tablet):

```ts
// ❌ الحالي — لا يعمل على الموبايل:
onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={handleDrop}

// ✅ الحل — يعمل على كل الأجهزة:
onPointerDown={handlePointerDown}
onPointerMove={handlePointerMove}
onPointerUp={handlePointerUp}
```

- [ ] **مهمة**: استبدال HTML5 Drag API بـ Pointer Events API
- [ ] **مهمة**: إضافة visual feedback أثناء السحب (القطعة تتبع الإصبع + ghost piece)
- [ ] **مهمة**: إبقاء click-to-select كبديل (الحالي يعمل)
- [ ] **مهمة**: إضافة highlight واضح للمربعات المسموحة عند اختيار قطعة

##### 5.1.2 — مقاسات متجاوبة
- **المشكلة**: اللوحة تعتمد على `aspect-square` لكن لا responsive constraints
- [ ] **مهمة**: حساب حجم اللوحة:
  - Mobile portrait: `width: min(100vw - 32px, 100vh - 200px)` — يترك مساحة للـ timer والنافبار
  - Mobile landscape: `width: min(50vw, 100vh - 100px)`
  - Desktop: `width: min(600px, 60vw)`
- [ ] **مهمة**: تكبير إحداثيات الأعمدة/الصفوف: `text-[10px]` → `text-xs` → `text-sm` (responsive)
- [ ] **مهمة**: التأكد من أن كل مربع ≥ 44px (touch target) على أصغر شاشة مدعومة

##### 5.1.3 — إصلاح المكونات الجانبية

| المكون | المشكلة | الحل |
|--------|---------|------|
| `ChessTimer.tsx` | `h-[300px]` ثابتة, 0 breakpoints | `h-auto min-h-[200px] md:h-[300px]` |
| `ChessMoveList.tsx` | `h-[200px]` ثابتة, 0 breakpoints | Mobile: `max-h-[100px]`, Desktop: `h-[200px]` |
| `ChessChat.tsx` | `h-[300px]` ثابتة, 0 breakpoints | استخدام `flex-1` بدل ارتفاع ثابت |
| `ChessControls.tsx` | 0 breakpoints | `flex-wrap` على الموبايل |

- [ ] **مهمة**: إصلاح كل مكون جانبي
- [ ] **مهمة**: دمج الكل في `<GameLayout>` المشترك

#### 5.2 — إصلاح BackgammonBoard
- **الملف**: `client/src/components/games/backgammon/BackgammonBoard.tsx`
- **المشاكل**: `w-8 h-8` ثابتة للقطع، `minHeight: 400px` ثابت، 0 breakpoints

- [ ] **مهمة**: قطع responsive: `w-8 h-8` → `w-[min(2rem,8vw)] h-[min(2rem,8vw)]`
- [ ] **مهمة**: لوحة responsive: `minHeight: 400px` → `aspect-ratio: 4/3` أو `min-h-[min(400px,60vh)]`
- [ ] **مهمة**: إضافة `max-w-[800px] mx-auto` لتوسيط اللوحة
- [ ] **مهمة**: تكبير touch targets لمنطقة وضع القطع (≥ 44px)
- [ ] **مهمة**: ربط الألوان بالـ CSS variables: `bg-orange-900` → `var(--game-board-bg)`

#### 5.3 — إصلاح BalootBoard
- **الملف**: `client/src/components/games/BalootBoard.tsx`

| المشكلة | السطر | الحل |
|---------|------|------|
| `h-[550px]` ثابت | 281 | `h-[var(--game-board-max-h)]` |
| Choosing overlay `w-96` (384px) | — | `w-full max-w-96 px-4` |
| 4× `ml-*` | — | `ms-*` |
| كل النصوص عربية hardcoded | — | i18n (المرحلة 2.4) |
| ألوان hardcoded (`bg-amber-900`) | — | `var(--game-board-bg)` |

- [ ] **مهمة**: تنفيذ كل الإصلاحات أعلاه
- [ ] **مهمة**: توحيد card size: `w-14 h-20` (56×80px)
- [ ] **مهمة**: إضافة responsive font sizes: `text-xs sm:text-sm`
- [ ] **مهمة**: دمج في `<GameLayout>`

#### 5.4 — إصلاح TarneebBoard
- **الملف**: `client/src/components/games/TarneebBoard.tsx`

| المشكلة | التفصيل | الحل |
|---------|---------|------|
| `h-[600px]` | **أسوأ من Baloot!** | `h-[var(--game-board-max-h)]` |
| Bidding overlay `w-80` | 320px = كامل عرض iPhone SE | `w-full max-w-80 px-4` |
| Card size `w-16 h-24` | **مختلف عن Baloot** `w-14 h-20` | توحيد: `w-14 h-20` |
| Bid buttons `size="sm"` | صغيرة جداً على الموبايل | `size="default"` |
| 4× `ml-*` | RTL مكسور | `ms-*` |
| كل النصوص عربية hardcoded | لا i18n | المرحلة 2.4 |

- [ ] **مهمة**: تنفيذ كل الإصلاحات أعلاه
- [ ] **مهمة**: دمج في `<GameLayout>`

#### 5.5 — إصلاح DominoBoard
- **الملف**: `client/src/components/games/DominoBoard.tsx`

- [ ] **مهمة**: زيادة نقاط الدومينو: `w-1.5 h-1.5` (6px) → `w-2 h-2` (8px) على board, `w-2.5 h-2.5` في اليد
- [ ] **مهمة**: إضافة `max-w-[100vw] overflow-x-auto` لمنطقة الـ board
- [ ] **مهمة**: responsive board wrapper
- [ ] **مهمة**: ربط الألوان بالـ CSS variables
- [ ] **مهمة**: دمج في `<GameLayout>`

#### 5.6 — إصلاح SpectatorPanel
- [ ] **مهمة**: `text-[10px]` → `text-xs` (12px minimum)
- [ ] **مهمة**: إضافة loading skeleton
- [ ] **مهمة**: responsive: `w-full md:w-72`
- [ ] **مهمة**: gift grid: `grid-cols-3 sm:grid-cols-4`

#### 5.7 — إصلاح GameChat
- **مشكلة حرجة**: أزرار Block/Mute تستخدم `group-hover:opacity-100` — **غير مرئية على الموبايل**

- [ ] **مهمة**: استبدال hover-dependent menu بزر ⋮ (ثلاث نقاط) دائم الظهور → dropdown
- [ ] **مهمة**: Avatar: `h-6 w-6` (24px) → `h-8 w-8` (32px)
- [ ] **مهمة**: Timestamps: `text-[10px]` → `text-xs`
- [ ] **مهمة**: Input area: `min-h-[44px]` touch target
- [ ] **مهمة**: إضافة max-height + scroll للرسائل الطويلة

---

## المرحلة 6: تحسين الأداء
> كل ثانية تأخير في التحميل = 7% خسارة تحويل (بحث Google)

#### 6.1 — تحسين تحميل الخطوط (بعد حذفها في المرحلة 0)
- [ ] **مهمة**: `<link rel="preload" as="font" crossorigin>` لـ Poppins 400/600/700
- [ ] **مهمة**: `font-display: swap` في CSS
- [ ] **مهمة**: قياس FCP قبل وبعد

#### 6.2 — Pagination لكل القوائم الطويلة

| الصفحة | القائمة | حجم/صفحة | ملاحظات |
|--------|---------|----------|---------|
| Challenges | 3 tabs (Active/Available/My) | 10 | + filter chips |
| P2P | Offers table | 20 | + sort/filter |
| Transactions | All transactions | 20 | + date range filter |
| Friends | Friend list | 20 | + search |
| Complaints | Complaint list | 10 | + status filter |
| Leaderboard | Player ranking | 25 | |
| Chat | Conversation list | 15 | |
| Admin Users | User table | 20 | |
| Admin P2P | P2P trades | 20 | |

- [ ] **مهمة**: إنشاء `usePagination()` hook مشترك
- [ ] **مهمة**: إضافة `keepPreviousData: true` لمنع وميض عند تقليب الصفحات
- [ ] **مهمة**: إضافة `staleTime: 30000` لتقليل refetches غير الضرورية
- [ ] **مهمة**: تطبيق على كل الصفحات أعلاه

#### 6.3 — تحسين Bundle Size
- [ ] **مهمة**: نقل `WORLD_CURRENCIES` (~6KB) إلى ملف مستقل + `React.lazy` import
- [ ] **مهمة**: التحقق من tree-shaking لـ lucide-react icons (~25 أيقونة مستوردة)
- [ ] **مهمة**: إضافة `loading="lazy"` لكل `<img>` tags (avatars, game images)

#### 6.4 — إصلاح خطر XSS
- **play.tsx**: يستخدم `dangerouslySetInnerHTML` بدون أي sanitization
- [ ] **مهمة**: استبدال بـ `DOMPurify.sanitize()` أو إزالة HTML rendering بالكامل
- [ ] **مهمة**: مراجعة chart.tsx (مكتبة UI — أقل خطورة لكن يجب التأكد)

#### 6.5 — تحسين WebSocket Connections
- **المشكلة**: multiplayer page يفتح WebSocket فوراً حتى بدون اختيار لعبة
- [ ] **مهمة**: Lazy connect: لا يتصل حتى يختار المستخدم لعبة/lobby
- [ ] **مهمة**: إضافة connection status bar في واجهة اللعبة (🟢 Connected / 🟡 Reconnecting / 🔴 Disconnected)
- [ ] **مهمة**: إضافة reconnection مع visual feedback

#### 6.6 — تحسين Loading States
- [ ] **مهمة**: استبدال `<PageLoader />` العام بـ page-specific skeletons (المرحلة 3.3)
- [ ] **مهمة**: إضافة `<Suspense>` boundaries أصغر (per-section بدل per-page)
- [ ] **مهمة**: إضافة progress indicator لتحميل ألعاب WebSocket

---

## المرحلة 7: الرسوم المتحركة والحركة
> حركات سلسة ترفع الإحساس بالاحترافية — الفرق بين "تطبيق" و "لعبة"

#### 7.1 — حركات الشطرنج
| الحركة | التقنية | المدة |
|--------|---------|------|
| انتقال القطعة | `CSS transition: transform 200ms ease-out` | 200ms |
| التقاط القطعة | `transform: scale(1.15)` + `box-shadow` | instant |
| آخر حركة | background flash ذهبي على from/to squares | 1s fade |
| كش | `border: 2px solid red` + اهتزاز (`@keyframes shake`) | 500ms |
| أكل قطعة | `scale(0) + opacity(0)` transition | 200ms |
| ترقية بيدق | قائمة اختيار (N/B/R/Q) + scale-in animation | 150ms |

- [ ] **مهمة**: تنفيذ كل الحركات أعلاه في `ChessBoard.tsx`
- [ ] **مهمة**: إضافة `@keyframes` في `index.css`

#### 7.2 — حركات الطاولة (Backgammon)
| الحركة | التقنية | المدة |
|--------|---------|------|
| حركة القطعة | `transition: top/left 300ms ease-out` | 300ms |
| رمي الزهر | `@keyframes dice-roll` (rotation + settle) | 600ms |
| Bearing off | slide off board + fade | 400ms |
| ضرب قطعة | القطعة تطير للـ bar مع bounce | 500ms |

- [ ] **مهمة**: تنفيذ في `BackgammonBoard.tsx`

#### 7.3 — حركات الكروت (Baloot + Tarneeb)
| الحركة | التقنية | المدة |
|--------|---------|------|
| رمي الكرت | `translateY(-100px) + transition` — from hand to center | 250ms |
| جمع الخدعة | 4 كروت slide to winner position | 400ms |
| توزيع الكروت | stagger animation (50ms delay بين كل كرت) | 800ms total |
| الكرت الأخير | glow / pulse effect | looping |

- [ ] **مهمة**: تنفيذ في `BalootBoard.tsx` و `TarneebBoard.tsx`

#### 7.4 — حركات الدومينو
| الحركة | التقنية | المدة |
|--------|---------|------|
| وضع القطعة | `scale(0) → scale(1)` + slide | 200ms |
| rotation | CSS rotation عند وضع عمودي/أفقي | 200ms |
| سحب قطعة جديدة | slide from deck to hand | 300ms |

- [ ] **مهمة**: تنفيذ في `DominoBoard.tsx`

#### 7.5 — حركات عامة (كل التطبيق)
- [ ] **مهمة**: Page transitions: fade-in 150ms (wrap `<Suspense>`)
- [ ] **مهمة**: List animations: stagger enter (30ms delay/item) — challenges, transactions, friends
- [ ] **مهمة**: Toast: slide-in من الأسفل على الموبايل
- [ ] **مهمة**: Modal/Sheet: spring animation (open/close)
- [ ] **مهمة**: إضافة `prefers-reduced-motion` respect:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## المرحلة 8: تحسين UX التفاعلي
> تفاصيل صغيرة تصنع الفرق بين "تطبيق عادي" و "منتج احترافي"

#### 8.1 — Bottom Navigation Enhancement
- **الحالة الحالية**: 5 أيقونات + chat بدون labels، لا badges، لا safe-area padding
- [ ] **مهمة**: إضافة label أسفل كل أيقونة: P2P, الرئيسية, الألعاب, التحديات, مجاني
- [ ] **مهمة**: إضافة badge أحمر لعدد الرسائل غير المقروءة
- [ ] **مهمة**: إضافة safe-area-bottom padding: `pb-[env(safe-area-inset-bottom)]`
- [ ] **مهمة**: إضافة active indicator (خط ذهبي أو dot أسفل الأيقونة المحددة)
- [ ] **مهمة**: ترجمة `"P2P"`, `"Main"`, `"Games"` إلخ — حالياً hardcoded English في BottomNavigation

#### 8.2 — Sidebar Enhancement
- [ ] **مهمة**: تكبير SidebarTrigger: `h-7 w-7` → `h-10 w-10` + padding (WCAG touch target)
- [ ] **مهمة**: ترجمة "Navigation" label → `t('nav.navigation')` (hardcoded English)
- [ ] **مهمة**: ترجمة "Player"/"Admin" → `t('roles...')` (hardcoded في header)
- [ ] **مهمة**: إضافة swipe-to-close gesture على الموبايل
- [ ] **مهمة**: إضافة notification count badges بجانب Chat, Challenges

#### 8.3 — Header Enhancement
- [ ] **مهمة**: إضافة balance display مصغر في header على الموبايل
- [ ] **مهمة**: تحسين ترتيب العناصر في RTL mode
- [ ] **مهمة**: إضافة `aria-label` لكل icon button في header

#### 8.4 — Social Login Buttons (login.tsx)
- **المشكلة**: أزرار "Continue with Google/Apple" موجودة لكن لا تعمل — يخلق توقع كاذب
- [ ] **مهمة (اختر واحد)**:
  - خيار 1: ربط Google OAuth + Apple Sign-In (الأفضل)
  - خيار 2: إضافة `disabled` + tooltip "قريباً" / "Coming Soon"
  - خيار 3: إزالتها مؤقتاً

---

## المرحلة 9: إمكانية الوصول (Accessibility)
> 25 `aria-*` attribute فقط في 135 ملف = شبه معدوم. WCAG 2.1 يتطلب مئات.

#### 9.1 — Semantic HTML & ARIA Labels
- [ ] **مهمة**: إضافة `aria-label` لكل 88 button من نوع `size="icon"`:
```tsx
<Button size="icon" aria-label={t('common.toggleBalance')}>
  <EyeOff className="h-4 w-4" />
</Button>
```
- [ ] **مهمة**: `role="alert"` → toast notifications, error messages
- [ ] **مهمة**: `role="status"` → connection status, loading indicators
- [ ] **مهمة**: `aria-live="polite"` → game timer, scores, chat messages
- [ ] **مهمة**: `aria-current="page"` → sidebar active item, bottom nav active

#### 9.2 — Keyboard Navigation للشطرنج
- [ ] **مهمة**: Arrow keys لتحريك التركيز بين المربعات
- [ ] **مهمة**: Enter/Space لاختيار/وضع القطعة
- [ ] **مهمة**: Tab لتبديل بين أقسام (لوحة → حركات → دردشة)
- [ ] **مهمة**: Escape لإلغاء الحركة

#### 9.3 — Color Contrast Audit
- [ ] **مهمة**: التحقق من كل نص: contrast ≥ 4.5:1 (WCAG AA)
- [ ] **مهمة**: خصوصاً `text-muted-foreground` على `bg-muted` في Dark mode
- [ ] **مهمة**: خصوصاً gold text (`text-primary`) على dark backgrounds

#### 9.4 — Focus Management
- [ ] **مهمة**: إضافة `focus-visible` ring واضح لكل عنصر تفاعلي
- [ ] **مهمة**: Modal/Sheet: نقل focus للأول → إعادة عند الإغلاق (focus trap)
- [ ] **مهمة**: Page navigation: نقل focus للـ `<h1>` عند تغيير الصفحة

#### 9.5 — Screen Reader Support
- [ ] **مهمة**: إضافة `<h1>` (heading) لكل صفحة
- [ ] **مهمة**: إضافة `sr-only` descriptions لعناصر الألعاب المرئية
- [ ] **مهمة**: الشطرنج: وصف كل مربع ("White King on E1")

---

## المرحلة 10: اللمسات النهائية (Polish)
> التفاصيل التي تجعل التطبيق يبدو مصقولاً ومتقناً

#### 10.1 — Splash Screen & Enhanced Loading
- [ ] **مهمة**: تصميم splash screen: شعار VEX + animation (fade-in + scale) — بدل spinner "Loading..."
- [ ] **مهمة**: إضافة progress indicator لتحميل اللعب (WebSocket: connecting → joined → game_state)
- [ ] **مهمة**: page-specific loading states بدل `<PageLoader />` العام

#### 10.2 — أيقونات ألعاب مخصصة (SVG)
- [ ] **مهمة**: إنشاء `client/src/components/icons/`:
  - `ChessIcon.tsx` — قطعة ملك مبسطة
  - `BackgammonIcon.tsx` — لوحة مصغرة + زهر
  - `DominoIcon.tsx` — قطعة 6-4
  - `TarneebIcon.tsx` — ورقة لعب ♠
  - `BalootIcon.tsx` — ورقة لعب ♦
- [ ] **مهمة**: استبدال أيقونات lucide العامة في sidebar, play page, games catalog

#### 10.3 — Onboarding للمستخدم الجديد
- [ ] **مهمة**: إنشاء `client/src/components/Onboarding.tsx` — جولة 4 خطوات:
  1. "مرحباً! اختر لغتك المفضلة" (AR/EN)
  2. "اشحن محفظتك للعب" → زر اشحن
  3. "جرب لعبة مجانية!" → زر العب
  4. "انضم لتحدي وتنافس!" → زر التحديات
- [ ] **مهمة**: حفظ `onboardingCompleted` في localStorage
- [ ] **مهمة**: عرض فقط للمستخدمين الجدد

#### 10.4 — PWA Enhancements
- [ ] **مهمة**: تحديث `manifest.json`:
  - `theme_color`: `#1a1d23` (matches dark mode)
  - `shortcuts`: [ألعاب, محفظة, تحديات]
  - `categories`: `["games", "entertainment"]`
  - `display_override`: `["window-controls-overlay", "standalone"]`
- [ ] **مهمة**: إضافة install prompt ذكي (يظهر بعد 3 زيارات، لا يزعج المستخدم عند الرفض)

#### 10.5 — Performance Audit النهائي
- [ ] **مهمة**: Lighthouse Mobile → هدف score ≥ 85
- [ ] **مهمة**: Core Web Vitals: LCP ≤ 2.5s, FID ≤ 100ms, CLS ≤ 0.1
- [ ] **مهمة**: Bundle analyzer → التخلص من dependencies > 50KB غير ضرورية
- [ ] **مهمة**: Network waterfall analysis → لا render-blocking resources

---

## 📋 ملخص ترتيب التنفيذ

| # | المرحلة | المهام | المدة التقديرية | التبعيات |
|---|---------|--------|---------------|---------|
| 🚨 | **م0**: طوارئ | 4 | **20 دقيقة** | — |
| 🔴 1 | **م1**: بنية التصميم | 12 | **3-4 ساعات** | م0 |
| 🔴 2 | **م2**: ترجمة + RTL | 17 | **5-7 ساعات** | م0 |
| 🔴 3 | **م3**: مكونات مشتركة | 10 | **3-4 ساعات** | م1 |
| 🟠 4 | **م5**: ألواح الألعاب | 24 | **7-9 ساعات** | م1, م3 |
| 🟠 5 | **م4**: تجاوب الصفحات | 20 | **6-8 ساعات** | م1, م3 |
| 🟡 6 | **م6**: الأداء | 13 | **3-5 ساعات** | م0 |
| 🟡 7 | **م8**: UX التفاعلي | 12 | **4-5 ساعات** | م3 |
| 🟢 8 | **م7**: رسوم متحركة | 18 | **5-7 ساعات** | م5 |
| 🟢 9 | **م9**: إمكانية الوصول | 12 | **3-4 ساعات** | م2 |
| 🔵 10 | **م10**: اللمسات | 9 | **3-4 ساعات** | الكل |

### **المجموع: ~151 مهمة × ~45-58 ساعة عمل**

### رسم بياني للتبعيات:
```
م0 (طوارئ — 20 دقيقة)
    ├── م1 (بنية التصميم)
    │       ├── م3 (مكونات مشتركة)
    │       │       ├── م5 (ألواح الألعاب) → م7 (رسوم متحركة)
    │       │       ├── م4 (تجاوب الصفحات)
    │       │       └── م8 (UX التفاعلي)
    │       └── ...
    ├── م2 (ترجمة + RTL) ← مستقلة، بالتوازي مع م1
    │       └── م9 (إمكانية الوصول)
    ├── م6 (الأداء) ← شبه مستقلة
    └── م10 (اللمسات) ← بعد كل شيء
```

---

## ⚠️ تذكير — P2P Mock Routes (للتنفيذ بعد UI/UX)

9 endpoints تحتاج تحويل من بيانات وهمية إلى DB حقيقي:

| # | Route | المطلوب |
|---|-------|---------|
| 1 | `GET /api/p2p/profile/:userId` | JOIN tables + حساب إحصائيات حقيقية |
| 2 | `PATCH /api/p2p/profile` | Storage method + UPDATE |
| 3 | `GET /api/p2p/settings` | جلب من `p2p_user_settings` |
| 4 | `PATCH /api/p2p/settings` | UPSERT في DB |
| 5 | `GET /api/p2p/badges` | حساب من إحصائيات حقيقية |
| 6 | `GET /api/p2p/payment-methods` | CRUD من DB |
| 7 | `POST /api/p2p/payment-methods` | INSERT + validation |
| 8 | `DELETE /api/p2p/payment-methods/:id` | DELETE حقيقي |
| 9 | `GET /api/challenges/:id/gifts` | ربط بجدول gifts |

---

## ✅ معايير القبول النهائية

### Responsive:
- [ ] 320px (iPhone SE): كل صفحة بدون horizontal scroll
- [ ] 375px (iPhone 12-16): كل لعبة قابلة للعب بالكامل
- [ ] 768px (iPad): تبديل سلس mobile ↔ desktop
- [ ] 1440px+ (Desktop): max-width مناسب، لا تمدد

### Internationalization:
- [ ] **0** نصوص hardcoded في أي صفحة
- [ ] **0** كلاسات `mr-`/`ml-` في كود التطبيق
- [ ] كل صفحة تعمل بالعربي (RTL) والإنجليزي (LTR)

### Performance:
- [ ] First Contentful Paint ≤ 1.5s
- [ ] Lighthouse Mobile ≥ 85
- [ ] **0** خطوط Google غير مستخدمة (من 25 → 2)
- [ ] كل قائمة طويلة لها pagination
- [ ] **0** خطر XSS (`dangerouslySetInnerHTML` مع sanitize أو بديل)

### Accessibility:
- [ ] كل `size="icon"` button له `aria-label`
- [ ] كل صفحة لها `<h1>`
- [ ] Contrast ≥ 4.5:1 لكل نص
- [ ] **0** نص أقل من 12px
- [ ] كل touch target ≥ 44px
- [ ] لا `user-scalable=no`
- [ ] `prefers-reduced-motion` respecting

### Gaming UX:
- [ ] الشطرنج قابل للعب بـ touch drag على الموبايل
- [ ] كل حركة لعب لها animation (لا teleportation)
- [ ] Baloot/Tarneeb لا تتجاوز viewport
- [ ] مقاسات الكروت موحدة Baloot = Tarneeb
- [ ] ألوان الألعاب تتغير مع Dark/Light mode

### States:
- [ ] كل query: loading skeleton + error state + empty state
- [ ] Offline detection + banner
- [ ] Confirmation dialog للعمليات الحساسة
- [ ] Connection status indicator في الألعاب
