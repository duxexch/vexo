# لوحة الأدمن في VEX — تقرير مرجعي شامل

هذا الملف هو المرجع الرسمي لفهم لوحة الأدمن بالكامل: البنية، المسارات، الأقسام، الاعتماديات بين الواجهة والسيرفر، ونقاط الخطر الشائعة.  
أي تعديل لاحق في لوحة الأدمن يجب أن يبدأ من هنا.

---

## 1) الهدف من لوحة الأدمن

لوحة الأدمن هي مركز التحكم التشغيلي للمنصة، وتغطي:

- إدارة المستخدمين
- الحركات المالية والمعاملات
- قسم الألعاب وإعداداتها
- التحديات والإعدادات المرتبطة بها
- P2P والنزاعات
- الدعم والمحادثات
- free-play / marketers / commissions
- الاستثمار والمالية
- إعدادات المنصة العامة
- الأدوات الأمنية والمراقبة
- SAM9 / AI / analytics / alerts

اللوحة ليست صفحة واحدة، بل مجموعة صفحات مترابطة تعتمد على:
- `client/src/private-routes.tsx`
- `client/src/pages/admin/admin-layout.tsx`
- `server/admin-routes/*`
- `server/routes/*`
- `shared/*`

---

## 2) نقطة الدخول الرئيسية

### الواجهة
- `client/src/private-routes.tsx`
  - يحتوي على `AdminRouter`
  - يربط كل مسارات `/admin/*` بصفحات الأدمن
  - يلف الصفحات داخل `AdminLayout`

### الهيكل العام
- `client/src/pages/admin/admin-layout.tsx`
  - Sidebar الأدمن
  - شريط علوي
  - `AdminAlertsDropdown`
  - `LanguageSwitcher`
  - `ThemeToggle`
  - التحقق من جلسة الأدمن عبر:
    - `GET /api/admin/alerts/count`

### منطق الوصول
- إذا كان المسار يبدأ بـ `/admin`
- يتم فتح `AdminRouter`
- إذا لم يوجد `adminToken`
- يتم عرض صفحة تسجيل الدخول للأدمن

---

## 3) خريطة المسارات الأساسية

### صفحات الأدمن في الواجهة
موجودة في:
- `client/src/pages/admin/`

أهم الصفحات:
- `admin-dashboard.tsx`
- `admin-users.tsx`
- `admin-transactions.tsx`
- `admin-sections.tsx`
- `admin-game-sections.tsx`
- `admin-challenges.tsx`
- `admin-challenge-settings.tsx`
- `admin-p2p.tsx`
- `admin-disputes.tsx`
- `admin-support.tsx`
- `admin-chat.tsx`
- `admin-free-play.tsx`
- `admin-marketers.tsx`
- `admin-finance.tsx`
- `admin-investments.tsx`
- `admin-gifts.tsx`
- `admin-agents.tsx`
- `admin-tournaments.tsx`
- `admin-audit-logs.tsx`
- `admin-analytics.tsx`
- `admin-anti-cheat.tsx`
- `admin-payment-security.tsx`
- `admin-id-verification.tsx`
- `admin-app-settings.tsx`
- `admin-currency.tsx`
- `admin-seo.tsx`
- `admin-social-platforms.tsx`
- `admin-languages.tsx`
- `admin-badges.tsx`
- `admin-notifications.tsx`
- `admin-payment-methods.tsx`
- `admin-integrations.tsx`
- `admin-sam9.tsx`
- `admin-themes.tsx`
- `admin-external-games.tsx`
- `admin-advertisements.tsx`

### المسارات المربوطة في `private-routes.tsx`
أمثلة:
- `/admin/dashboard`
- `/admin/users`
- `/admin/transactions`
- `/admin/sections`
- `/admin/anti-cheat`
- `/admin/analytics`
- `/admin/disputes`
- `/admin/tournaments`
- `/admin/free-play`
- `/admin/marketers`
- `/admin/gifts`
- `/admin/agents`
- `/admin/p2p`
- `/admin/currency`
- `/admin/support`
- `/admin/app-settings`
- `/admin/languages`
- `/admin/badges`
- `/admin/notifications`
- `/admin/games`
- `/admin/game-sections`
- `/admin/id-verification`
- `/admin/seo`
- `/admin/payment-methods`
- `/admin/integrations`
- `/admin/social-platforms`
- `/admin/support-settings`
- `/admin/challenge-settings`
- `/admin/finance`
- `/admin/investments`
- `/admin/payment-security`
- `/admin/chat-management`
- `/admin/sam9`
- `/admin/audit-logs`

---

## 4) راوترات السيرفر الخاصة بالأدمن

### نقطة التجميع
- `server/admin-routes/index.ts`

هذا الملف يجمع كل الـ modules:
- `admin-login`
- `admin-password`
- `admin-dashboard`
- `admin-users`
- `admin-settings`
- `admin-support`
- `admin-p2p`
- `admin-content`
- `admin-games`
- `admin-alerts`
- `admin-currency`
- `admin-tournaments`
- `admin-challenges`
- `chat-media`
- `chat-auto-delete`
- `chat-pin`
- `chat-calls`
- `admin-ai-agent`
- `admin-payment-security`
- `admin-gifts`
- `admin-transactions`
- `admin-realtime`
- `admin-agents`

### أهم المجموعات
#### Dashboard
- `server/admin-routes/admin-dashboard.ts`
  - `/api/admin/stats`
  - `/api/admin/search`
  - `/api/admin/analytics`
  - `/api/admin/audit-logs`

#### Alerts
- `server/admin-routes/admin-alerts.ts`
  - `/api/admin/alerts`
  - `/api/admin/alerts/count`
  - `/api/admin/alerts/unread-by-section`
  - `/api/admin/alerts/unread-entities`
  - `/api/admin/alerts/read-by-entity`
  - `/api/admin/alerts/read-all`

#### Chat / Support
- `server/admin-routes/admin-content/chat-management.ts`
  - `/api/admin/chat/stats`
  - `/api/admin/chat-settings`
  - `/api/admin/chat/banned-words`
- `server/admin-routes/admin-support/chat-tickets.ts`
  - `/api/admin/support-chat/tickets`
  - `/api/admin/support-chat/tickets/:ticketId/messages`
  - `/api/admin/support-chat/tickets/:ticketId/reply`
  - `/api/admin/support-chat/tickets/:ticketId/close`
  - `/api/admin/support-chat/tickets/:ticketId/reopen`
  - `/api/admin/support-chat/stats`
- `server/admin-routes/admin-support/auto-replies.ts`
  - `/api/admin/support-chat/auto-replies`
- `server/admin-routes/admin-support/media-settings.ts`
  - `/api/admin/support-chat/media-settings`

#### AI / SAM9
- `server/admin-routes/admin-ai-agent.ts`
  - `/api/admin/ai-agent/health`
  - `/api/admin/ai-agent/report`
  - `/api/admin/ai-agent/capabilities`
  - `/api/admin/ai-agent/runtime`
  - `/api/admin/ai-agent/data-summary`
  - `/api/admin/ai-agent/data-query`
  - `/api/admin/ai-agent/self-tune`
  - `/api/admin/ai-agent/chat`
  - `/api/admin/ai-agent/engagement`
  - `/api/admin/ai-agent/project-snapshot`

#### Payment Security
- `server/admin-routes/admin-payment-security.ts`
  - `/api/admin/payment-security/config`
  - `/api/admin/payment-security/blocked-ips`
  - `/api/admin/payment-security/overview`
  - `/api/admin/payment-security/ip/:ip/details`
  - `/api/admin/payment-security/ip-usage`

#### Free-play / Marketers
- `server/admin-routes/admin-currency/free-play-config.ts`
  - `/api/admin/free-play/settings`
  - `/api/admin/free-play/stats`
- `server/admin-routes/admin-currency/free-play-activity.ts`
  - `/api/admin/free-play/activity`
  - `/api/admin/free-play/top-referrers`
- `server/admin-routes/admin-currency/free-play-insights.ts`
  - `/api/admin/free-play/leaderboard`
  - `/api/admin/free-play/referrals/:userId/details`
  - `/api/admin/free-play/referrals/:userId/commission`
  - `/api/admin/free-play/ads/campaigns`
  - `/api/admin/free-play/ads/analytics`
  - `/api/admin/free-play/ads/upload-asset`
- `server/admin-routes/admin-currency/marketer-program.ts`
  - `/api/admin/free-play/marketers`
  - `/api/admin/free-play/marketers/overview`
  - `/api/admin/free-play/marketers/:userId/details`
  - `/api/admin/free-play/marketers/:userId/badge`
  - `/api/admin/free-play/marketers/:userId/config`
  - `/api/admin/free-play/marketers/sync`
  - `/api/admin/free-play/marketers/scheduler/run`
  - `/api/admin/free-play/marketers/scheduler/runs`

#### Investments
- `server/routes/investments.ts`
  - `/api/admin/invest/stocks`
  - `/api/admin/invest/orders`
  - `/api/admin/invest/payment-methods`
  - بالإضافة إلى public invest APIs:
    - `/api/invest/stocks`
    - `/api/invest/payment-methods`
    - `/api/invest/orders`

---

## 5) شرح الأقسام من منظور عملي

## 5.1 Dashboard
الصفحة:
- `client/src/pages/admin/admin-dashboard.tsx`

تعرض:
- إجمالي المستخدمين
- النشاط اليومي
- balance aggregate
- open complaints
- pending disputes
- بحث إداري عام
- quick links

تعتمد على:
- `/api/admin/stats`
- `/api/platform/stats`
- `/api/admin/recent-activity`  
- `/api/admin/search`

ملاحظة:
- إذا تعذر endpoint من هذه الـ APIs، تظهر نتائج ناقصة أو cards فارغة.

---

## 5.2 Users
الصفحة:
- `admin-users.tsx`

المهمة:
- إدارة المستخدمين
- عرض تفاصيل مالية
- wallet controls
- ban / suspend / unban
- multi-currency / reward / p2p-ban

تعتمد على:
- `/api/admin/users`
- `/api/admin/users/:id/financial-overview`
- `/api/admin/users/:id/currency-wallets`
- endpoints إدارية إضافية داخل users module

---

## 5.3 Transactions
الصفحة:
- `admin-transactions.tsx`

المهمة:
- مراجعة وتحليل المعاملات
- processing / reversal
- filter / search
- unread alerts per section

تعتمد على:
- `/api/admin/transactions`
- `/api/admin/transactions/:id/process`
- `/api/admin/alerts/unread-by-section`

---

## 5.4 Games / Unified Games
الصفحة:
- `admin-unified-games.tsx`

المهمة:
- عرض الألعاب جميعها في واجهة موحدة
- دمج ألعاب `multiplayer_games` مع ألعاب `games`
- إدارة status
- تغيير display locations
- رفع الأيقونات والخلفيات
- حذف أو إزالة من قسم

تعتمد على:
- `/api/admin/multiplayer-games`
- `/api/admin/games`
- `/api/game-sections`
- `/api/upload`

### نقطة مهمة
هذه الصفحة حساسة جدًا للتوافق بين:
- `shared/arcade-games.ts`
- `shared/schema`
- endpoints الخاصة بالألعاب
- الـ websocket invalidation

---

## 5.5 Game Sections
الصفحة:
- `admin-game-sections.tsx`

المهمة:
- تعريف أقسام الألعاب
- إدارة sections metadata
- initialize section catalog

تعتمد على:
- `/api/admin/game-sections`
- `/api/game-sections`

---

## 5.6 Challenges
الصفحة:
- `admin-challenges.tsx`

المهمة:
- عرض وإدارة التحديات
- cancel
- filtering
- status
- game types

تعتمد على:
- `/api/admin/challenges`
- `/api/admin/challenges/:challengeId/cancel`
- `/api/admin/challenge-stats`

### الملاحظة المهمة
ملف الإنشاء:
- `server/routes/challenges/create.ts`

كان فيه اعتماد على دالة SAM9 مفقودة وتم ربطه الآن بالعقد المشترك:
- `shared/sam9-contract.ts`

---

## 5.7 Challenge Settings
الصفحة:
- `admin-challenge-settings.tsx`

المهمة:
- ضبط إعدادات كل game type
- SAM9 solo settings
- enable/disable
- min/max stake
- turn timeout
- max concurrent challenges

تعتمد على:
- `/api/admin/challenge-settings`
- `/api/admin/challenge-settings/:gameType`
- `/api/admin/challenge-settings/sam9-solo`

---

## 5.8 P2P / Disputes
### P2P
الصفحة:
- `admin-p2p.tsx`

### Disputes
الصفحة:
- `admin-disputes.tsx`

تعتمد على:
- `/api/admin/p2p/...`
- `/api/admin/p2p/disputes`
- details / evidence / resolve / escalate / close

### ملاحظة بنيوية
الملفات الفعلية منظمة داخل:
- `server/routes/p2p-disputes/`
  - `listing.ts`
  - `create.ts`
  - `details.ts`
  - `messages-evidence.ts`
  - `respond.ts`
  - `resolve.ts`

---

## 5.9 Support / Chat
### Support Contacts
الصفحة:
- `admin-support.tsx`

تعتمد على:
- `/api/admin/support/contacts`

### Chat Management
الصفحة:
- `admin-chat.tsx`

تعتمد على:
- `/api/admin/chat/stats`
- `/api/admin/chat-settings`
- `/api/admin/chat/banned-words`
- `/api/admin/chat/calls/stats`
- `/api/admin/chat/media/stats`
- `/api/admin/chat/auto-delete/stats`
- `/api/admin/chat/pin/reset`
- `/api/admin/support-chat/...`
- `/api/admin/ai-agent/...`

### ملاحظة
هذه الصفحة privacy-sensitive:
- لا تسمح بقراءة private E2EE messages
- تركز على counts / support chat / admin tools / feature controls

---

## 5.10 Finance / Investments
### Finance
الصفحة:
- `admin-finance.tsx`

تعرض:
- ملخص موحّد للاستثمار
- مؤشرات المسوقين
- recent orders
- top marketer
- pending / approved / total commissions

تعتمد على:
- `/api/admin/invest/stocks`
- `/api/admin/invest/payment-methods`
- `/api/admin/invest/orders`
- `/api/admin/free-play/marketers`
- `/api/admin/free-play/marketers/overview`

### Investments
الصفحة:
- `admin-investments.tsx`

هي لوحة إدارة استثمار فعلية:
- create/edit/delete stocks
- payment methods
- review orders

تعتمد على:
- `/api/admin/invest/stocks`
- `/api/admin/invest/payment-methods`
- `/api/admin/invest/orders`

### التوجيه المعتمد الآن
- `/admin/finance` = عرض مالي موحّد
- `/admin/investments` = إدارة الاستثمار التفصيلية

---

## 5.11 Free Play / Marketers
### Free Play
الصفحة:
- `admin-free-play.tsx`

تعتمد على:
- `/api/admin/free-play/settings`
- `/api/admin/free-play/stats`
- `/api/admin/free-play/activity`
- `/api/admin/free-play/top-referrers`
- `/api/admin/free-play/leaderboard`
- `/api/admin/free-play/referrals/:userId/details`
- `/api/admin/free-play/ads/campaigns`
- `/api/admin/free-play/ads/analytics`

### Marketers
الصفحة:
- `admin-marketers.tsx`

تعتمد على:
- `/api/admin/free-play/marketers`
- `/api/admin/free-play/marketers/overview`
- `/api/admin/free-play/marketers/:userId/details`
- `/api/admin/free-play/marketers/:userId/config`
- `/api/admin/free-play/marketers/:userId/badge`
- `/api/admin/free-play/marketers/scheduler/run`
- `/api/admin/free-play/marketers/scheduler/runs`

### في السيرفر
المصدر الأساسي:
- `server/admin-routes/admin-currency/*`

---

## 5.12 Currency / Project Currency
الصفحة:
- `admin-currency.tsx`

تربط عادة إلى:
- project currency settings
- currency ledger
- wallet / conversions / admin adjustments

المسارات موجودة في:
- `server/routes/payments/*`
- `server/routes/transaction-user.ts`
- `server/routes/transaction-agent.ts`
- project-currency related modules

---

## 5.13 Payment Security
الصفحة:
- `admin-payment-security.tsx`

تعتمد على:
- `/api/admin/payment-security/config`
- `/api/admin/payment-security/blocked-ips`
- `/api/admin/payment-security/overview`
- `/api/admin/payment-security/ip/:ip/details`
- `/api/admin/payment-security/ip-usage`

---

## 5.14 AI / SAM9 / Analytics
### AI Agent
الصفحة:
- `admin-chat.tsx` (جزء AI)
- وأيضًا أقسام سمعة/ذكاء في الأدمن

تستخدم:
- `/api/admin/ai-agent/*`

### Analytics
الصفحة:
- `admin-analytics.tsx`

تعتمد على:
- `/api/admin/analytics`

### Alerts
- `/api/admin/alerts/count`
- `/api/admin/alerts/unread-by-section`
- `/api/admin/alerts/read-by-entity`

---

## 6) أهم العقد المشتركة التي يجب احترامها

### SAM9 contract
- `shared/sam9-contract.ts`

يحتوي على:
- `SAM9_OPPONENT_CONTRACT`
- `Sam9SoloSettings`
- `normalizeSam9SoloMode`
- `normalizeSam9FixedFee`
- `isSam9ChallengeGameType`
- `getSam9SoloSettingsFromRows`

### الاستثمار
- `shared/investments.ts`

### الألعاب
- `shared/arcade-games.ts`

### الأحداث اللحظية
- `shared/socketio-events.ts`

### Schema / Types
- `@shared/schema`

---

## 7) مشاكل شائعة عند العمل على لوحة الأدمن

### 7.1 مسار ظاهر في الواجهة لكنه غير واضح للمستخدم
مثال:
- صفحة المالية كانت تشير للاستثمار من داخلها فقط
- تم توضيح الوصول بإضافة قسم واضح في الـ sidebar

### 7.2 endpoint موجود في صفحة ولكن غير مسجل في السيرفر
الحل:
- ابحث في `server/admin-routes/index.ts`
- ثم راجع الموديول الحقيقي المسؤول
- ثم تأكد من `private-routes.tsx`

### 7.3 تكرار تعريف دالة مشتركة
مثال:
- `normalizeSam9FixedFee`
- يجب أن يكون المصدر واحدًا فقط
- الأفضل من `shared/sam9-contract.ts`

### 7.4 اختلاف أسماء المسارات بين الواجهة والسيرفر
مثال:
- صفحة تتوقع `/api/admin/support-chat/...`
- بينما السيرفر يسجل `/api/admin/support/...`
- لازم التوحيد أو إضافة aliases إن لزم

### 7.5 عدم اتساق alerts deep links
أي alert يجب أن يوجه إلى:
- نفس صفحة الأدمن المقصودة
- ويكون section key متوافقًا مع sidebar counts

---

## 8) خارطة الصيانة المقترحة

### قبل تعديل أي صفحة أدمن:
1. اقرأ الصفحة
2. اقرأ endpoint(s) المرتبطة بها
3. راجع `private-routes.tsx`
4. راجع `server/admin-routes/index.ts`
5. تأكد من المفاتيح المستخدمة في alerts
6. شغّل `tsc --noEmit`
7. اختبر المسار فعليًا

### قبل إضافة قسم جديد:
1. أضف صفحة في `client/src/pages/admin`
2. اربط route في `private-routes.tsx`
3. أضف item في `admin-layout.tsx`
4. أنشئ endpoints في `server/admin-routes/*`
5. حدّث `alerts` أو `sidebar counts` إذا لزم
6. وثّق القسم هنا

---

## 9) ملخص حالة لوحة الأدمن الآن

### واضح ومربوط:
- Dashboard
- Users
- Transactions
- Games
- Game Sections
- Challenges
- Challenge Settings
- P2P / Disputes
- Support / Chat
- Free Play / Marketers
- Finance / Investments
- Payment Security
- AI / SAM9
- Alerts
- Analytics
- Audit logs

### النقاط التي يجب مراقبتها دائمًا:
- توافق المسارات
- استدعاءات endpoints
- عقود shared
- alerts deep-linking
- صلاحيات الأدمن

---

## 10) ملاحظة نهائية

أي مطور يشتغل على لوحة الأدمن يجب أن يعتبر هذا الملف نقطة البدء قبل أي تعديل.  
إذا تغيّر endpoint أو page أو naming convention، لازم يتم تحديث هذا التقرير مباشرة.
