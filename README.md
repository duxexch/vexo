# VEX Platform

منصة VEX هي نظام متكامل للألعاب التنافسية والتواصل الاجتماعي والمعاملات المالية الرقمية، مبني بهيكلية Full-Stack حديثة وقابل للتشغيل على الويب والموبايل (Android عبر Capacitor).

هذا الملف يقدم توثيقًا عمليًا دقيقًا للمشروع نفسه: البنية، المكونات، التشغيل، الجودة، الأمان، النشر، والصيانة.

---

## 1) ملخص تنفيذي

### ما الذي يقدمه VEX؟

VEX يجمع بين عدة محاور في منتج واحد:

1. تجربة ألعاب تنافسية مباشرة مع تحديات ولعب ومشاهدة (Play/Watch).
2. تواصل اجتماعي حي: أصدقاء، دردشة، مؤشرات حضور، إشعارات.
3. إدارة رصيد وعملات متعددة مع قواعد حماية مالية واضحة.
4. سوق P2P داخلي مع إدارة نزاعات وسياسات إدارية.
5. لوحة تحكم إدارية شاملة للتحكم في كل أجزاء المنصة.
6. دعم i18n/RTL وتجربة mobile-first وتجهيز Android APK/AAB.

### الهدف التقني من المنصة

1. ضمان تدفق موحد بين واجهات الويب/الموبايل والخدمات الخلفية.
2. المحافظة على تكامل الحالة في الوقت الحقيقي عبر WebSocket + REST.
3. فرض سياسات أمان وحوكمة تشغيلية في المسارات الحساسة.
4. توفير مسار نشر وتشغيل موثوق للبيئات المحلية والإنتاجية.

---

## 2) خارطة الأقسام (Smart Product Map)

### A) قسم الألعاب والتحديات

الغرض:

1. إدارة دورة حياة التحدي: إنشاء، انضمام، لعب، إنهاء.
2. دعم عدة ألعاب مع واجهات Play وWatch.
3. مزامنة الدور/المؤقت/الحالة عبر القنوات الفورية.

القيمة:

1. تجربة تفاعلية منخفضة التأخير.
2. فصل واضح بين صلاحيات اللاعب والمشاهد.

### B) قسم الدردشة والعلاقات الاجتماعية

الغرض:

1. نظام أصدقاء وطلبات صداقة وحظر/كتم.
2. دردشة خاصة + دردشة التحدي + تكامل الإشعارات.
3. مزايا إدارة مثل PIN/Auto-delete/Media permissions.

القيمة:

1. ربط اجتماعي قوي داخل التجربة.
2. مرونة تشغيلية مع ضوابط أمان وخصوصية.

### C) قسم المحفظة والعملات

الغرض:

1. أرصدة متعددة، تحويلات، وسجل حركات.
2. ضبط سياسات العملات وقواعد التحويل.

القيمة:

1. اتساق مالي قابل للمراجعة.
2. حماية من الازدواجية/السباق في المعاملات.

### D) قسم سوق P2P والنزاعات

الغرض:

1. إدارة عروض/صفقات P2P.
2. دورة النزاع والحسم عبر أدوات إدارية.

القيمة:

1. مسار تداول داخلي آمن نسبيًا ومدار بسياسات.
2. شفافية أعلى في مراقبة النزاعات.

### E) قسم الإدارة (Admin)

الغرض:

1. تحكم مركزي في المستخدمين، المدفوعات، الألعاب، المحتوى، الحماية.
2. إعدادات تشغيل دقيقة: دردشة، تحديات، تنبيهات، تكاملات، أمن.

القيمة:

1. تقليل زمن الاستجابة التشغيلي.
2. قابلية توسيع ومراقبة موحدة.

### F) قسم الموبايل والتغليف

الغرض:

1. تشغيل المشروع كـ Web + Android باستخدام Capacitor.
2. فحوصات موبايل مخصصة لبعض التدفقات الحرجة.

القيمة:

1. قاعدة كود واحدة لتجارب متعددة.
2. انتقال أسرع من تطوير الويب إلى تطبيق فعلي.

---

## 3) المعمارية التقنية

### الواجهة الأمامية (Frontend)

1. React 18 + TypeScript + Vite.
2. TanStack Query لإدارة الجلب والكاش والتزامن.
3. Radix + shadcn/ui + Tailwind لبناء واجهات مرنة.
4. Wouter للتوجيه الخفيف.

### الخادم (Backend)

1. Express + TypeScript.
2. فصل routes إلى مجالات أعمال واضحة (auth, challenges, chat, payments, p2p, ...).
3. WebSocket (ws) للتحديثات الفورية والإشارات الحية.

### البيانات والتخزين

1. PostgreSQL عبر Drizzle ORM.
2. Redis (عند التفعيل) لتحسينات real-time وحالة الاتصال.
3. MinIO (عند التفعيل) لإدارة ملفات/وسائط.

### طبقات التشغيل

1. `client/` = طبقة العرض والتفاعل.
2. `server/` = API + WebSocket + سياسات الأعمال.
3. `shared/` = أنواع/مخططات مشتركة.
4. `scripts/` = فحوصات جودة/أمن/تشغيل.
5. `deploy/` و`docker/` = النشر والإنتاج.

---

## 4) بنية المشروع (Project Structure)

```text
vixo/
├─ client/                  # React app (pages, components, hooks, i18n)
├─ server/                  # Express routes, websocket, admin-routes, storage
├─ shared/                  # shared schema/types
├─ migrations/              # SQL and migration scripts
├─ scripts/                 # quality/security/smoke/ops scripts
├─ docs/                    # playbooks, audits, runbooks
├─ deploy/                  # deployment compose and infra notes
├─ docker/                  # docker-side configs
├─ android/                 # Capacitor Android project
├─ ai-service/              # AI service workspace (if enabled)
└─ README.md
```

---

## 5) المتطلبات الأساسية

1. Node.js 20+
2. npm 10+
3. PostgreSQL
4. (اختياري) Redis
5. (اختياري) Docker & Docker Compose

---

## 6) متغيرات البيئة

الحد الأدنى المطلوب للتشغيل المحلي:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME
DB_SSL=false
SESSION_SECRET=change_me
JWT_SIGNING_KEY=change_me
ADMIN_JWT_SECRET=change_me
NODE_ENV=development
PORT=3001
```

مهم:

1. استخدم `.env.example` كنقطة بداية.
2. لا ترفع أي أسرار إلى Git.
3. لكل بيئة (dev/staging/prod) ملف أسرار مستقل.

---

## 7) التشغيل المحلي (Local Development)

### الخطوات

```bash
npm install
npm run dev
```

افتراضيًا التطبيق يعمل على:

1. `http://localhost:3001`

### أوامر مهمة أثناء التطوير

```bash
npm run check:types
npm run i18n:audit
npm run quality:gate
```

---

## 8) البناء والتشغيل الإنتاجي

```bash
npm run build
npm run start
```

أمر فحص النوع (TypeScript) بدون إخراج:

```bash
npx tsc --noEmit
```

---

## 9) قواعد الجودة قبل أي Commit

وفق سياسة المشروع، أي تعديل يجب أن يمر بهذه البوابة:

1. فحص TypeScript:

```bash
npx tsc --noEmit
```

1. التأكد من إقلاع الخادم:

```bash
npx tsx server/index.ts
```

1. فحص health route:

```bash
curl -s -o NUL -w "%{http_code}" http://localhost:3001/
```

النتيجة المطلوبة: `200`.

---

## 10) شرح ذكي لأقسام الواجهة (Frontend Sections)

القسم التالي يشرح الغرض التشغيلي لكل مجموعة صفحات رئيسية:

1. Dashboard: صورة تشغيلية فورية لحالة المستخدم والنشاط.
2. Games Catalog + Challenge Play/Watch: مركز التجربة الأساسية للألعاب الحية.
3. Friends + Chat: الطبقة الاجتماعية والرسائل والتفاعل السريع.
4. Wallet + Transactions: إدارة الرصيد والتاريخ المالي.
5. P2P + Disputes: إدارة العرض/الصفقة/النزاع ضمن مسار منظم.
6. Notifications: ربط الأحداث المهمة بتجربة المستخدم لحظيًا.
7. Settings: إعدادات الخصوصية، اللغة، والثيم.
8. Support: قناة مساعدة وتشغيل للمستخدم النهائي.

مبدأ UX الأساسي:

1. Mobile-first.
2. دعم RTL/LTR.
3. تجنب أي اعتماد على hover فقط في الوظائف الحرجة.

---

## 11) شرح ذكي لأقسام الخادم (Backend Domains)

المجلد `server/routes` مقسم إلى نطاقات أعمال واضحة:

1. `auth/`: تسجيل الدخول والجلسات والهوية.
2. `users.ts` و`profile/`: بيانات المستخدم والملف الشخصي.
3. `challenges/` و`games.ts`: منطق التحديات والألعاب.
4. `chat/` و`chat-features/`: الرسائل، الميزات، القيود.
5. `social/`: الصداقات والمتابعة والحظر.
6. `payments/`: عمليات المدفوعات والتكاملات.
7. `p2p-trading/` و`p2p-disputes/`: دورة التجارة والنزاع.
8. `notifications.ts`: إدارة قنوات التنبيه.
9. `support-chat/`: مسارات الدعم الفني.
10. `health.ts`: فحوصات صحة الخدمة.

المجلد `server/admin-routes` يغطي تحكم الإدارة (أمن، مستخدمين، معاملات، ألعاب، إعدادات، دردشة، دعم، إلخ).

---

## 12) WebSocket وRealtime

Realtime هو قلب المنصة في:

1. تحديثات اللعب المباشر.
2. دردشة التحديات.
3. إشارات الصوت/الانضمام/المغادرة.
4. مزامنة حالة المشاهدين.

مبدأ مهم:

1. لا تعتمد على WebSocket فقط في السياسات؛ تحقق دائمًا من التكافؤ مع REST في المسارات الحساسة.

---

## 13) الترجمة وi18n

مشروع VEX يعتمد i18n بشكل أساسي:

1. لا يتم hardcode لنصوص الواجهة الجديدة.
2. أي نص جديد يجب أن يمر عبر مفاتيح ترجمة.
3. تدقيق الجودة اللغوية يتم عبر سكربتات i18n.

أوامر مفيدة:

```bash
npm run i18n:audit
npm run i18n:audit:strict
npm run i18n:sync
npm run i18n:quality
npm run i18n:gate
```

---

## 14) الأمان (Security)

المبادئ المطبقة:

1. JWT + session controls.
2. CSRF, rate limits, input validation.
3. فصل صلاحيات admin/user.
4. تنظيف دوري لمسارات أمنية حساسة.

أوامر أمن متاحة:

```bash
npm run security:audit
npm run security:smoke
npm run security:check
npm run security:csp
```

---

## 15) الموبايل (Android عبر Capacitor)

أوامر الموبايل الأساسية:

```bash
npm run mobile:sync
npm run mobile:android
npm run mobile:doctor
npm run mobile:android:assemble
npm run mobile:android:bundle
```

ملاحظات تشغيل:

1. افحص safe-area وسلوك اللمس قبل أي إصدار.
2. اختبر الشاشات الضيقة فعليًا، وليس فقط محاكي المتصفح.

---

## 16) النشر (Deployment)

خيارات النشر المتاحة في المشروع:

1. Docker Compose (يدوي/مؤتمت).
2. Reverse Proxy عبر Nginx/Traefik حسب بيئة التشغيل.
3. تشغيل مباشر Node.js أو PM2.

الملفات المرجعية:

1. `docker-compose.yml`
2. `docker-compose.prod.yml`
3. `deploy/`
4. `docker/nginx.conf`

---

## 17) لوحة الإدارة (Admin Surface)

واجهة الإدارة في VEX ليست صفحة واحدة؛ هي منظومة تشغيل كاملة تشمل:

1. إدارة المستخدمين والمعاملات.
2. إعدادات التحديات والألعاب.
3. إعدادات الدردشة والمحتوى.
4. إدارة العملات والمدفوعات والأمن.
5. دعم فني وتنبيهات وتدقيق.

مرجع سريع لراوتر الإدارة:

1. `client/src/App.tsx`
2. `server/admin-routes`

---

## 18) واجهات API (Domain-Oriented)

التوثيق العملي الأفضل يكون حسب المجال وليس حسب الترتيب الأبجدي:

1. Identity & Auth.
2. Social & Chat.
3. Challenges & Games.
4. Wallet & Payments.
5. P2P & Disputes.
6. Admin Operations.

للاستكشاف السريع:

1. `server/routes`
2. `server/routes/index.ts`

---

## 19) تشغيل/صيانة (Ops Cheat Sheet)

```bash
# تطوير
npm run dev

# فحص النوع
npm run check:types

# بناء
npm run build

# تشغيل إنتاجي
npm run start

# دَفع مخطط قاعدة البيانات
npm run db:push

# بوابات الجودة والأمن
npm run quality:gate
npm run security:check
```

---

## 20) معالجة المشاكل (Troubleshooting)

### A) الخادم لا يبدأ

1. راجع متغيرات البيئة الأساسية.
2. تأكد من PostgreSQL وRedis (إن كانت مفعلة).
3. نفّذ `npx tsc --noEmit` أولًا.

### B) مشاكل WebSocket/Realtime

1. تأكد من نفس origin/port في بيئة التطوير.
2. راقب السجلات في `server` و`logs/`.

### C) مشاكل الترجمة

1. نفذ `npm run i18n:audit`.
2. تحقق من جميع المفاتيح الجديدة قبل الدمج.

### D) مشاكل الموبايل

1. نفذ `npm run mobile:doctor`.
2. أعد `npm run mobile:sync` بعد أي تغيير على web assets.

---

## 21) الوثائق الداخلية المهمة

الملفات التالية مفيدة لفهم التشغيل المتقدم:

1. `docs/GAME_WATCH_UNIFIED_UX_PLAYBOOK.md`
2. `docs/CHALLENGE_PERMISSIONS_AUDIT_2026-03-30.md`
3. `docs/VOICE_CHAT_PRODUCTION_PLAYBOOK_2026-04-11.md`
4. `docs/I18N_GLOBAL_TRANSLATION_PIPELINE.md`
5. `docs/MOBILE_UI_PAGE_BY_PAGE_TRACKER.md`
6. `docs/SEO_MANAGEMENT_PRO_SETTINGS.md`

---

## 22) سياسة التعديل داخل هذا المشروع

أي تعديل مقبول يجب أن يلتزم بما يلي:

1. نظافة كود وعدم ترك بقايا branches/design قديم.
2. توافق web + mobile في نفس التغيير.
3. عدم كسر RTL/LTR.
4. تمرير بوابة التحقق قبل commit/push.

---

## 23) المساهمة (Contributing)

### تدفق مقترح

1. فرّع من `main`.
2. نفّذ التغيير بشكل محدد وواضح.
3. شغّل بوابة التحقق.
4. اكتب commit message واضح حسب المجال.
5. افتح PR مع شرح التأثير والمخاطر وخطة التحقق.

### معيار القبول

1. TypeScript نظيف.
2. الخادم يعمل.
3. فحص root يرجع `200`.
4. لا نصوص واجهة hardcoded خارج نظام i18n.

---

## 24) الترخيص

MIT (وفق إعداد `package.json`).

---

## 25) الدعم الداخلي

للدعم التشغيلي داخل الفريق:

1. اعتمد هذا README كنقطة البداية.
2. ثم انتقل إلى دليل المجال في `docs/` حسب نوع المشكلة.
3. لأي تغيير حساس (أمن/ماليات/Realtime)، استخدم smoke checks المناسبة قبل الدمج.
