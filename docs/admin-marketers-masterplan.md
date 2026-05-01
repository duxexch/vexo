# Admin Marketers Master Plan

## الهدف
تحويل قسم **Admin Marketers** إلى لوحة تشغيل احترافية مستقلة، قابلة للتوسع عالميًا، وتغطي:
- إدارة شارة المسوق
- إعدادات CPA / RevShare
- قواعد الاستحقاق والتأهيل
- المجدول الدائم للعمولات
- سجل التشغيل والتدقيق
- مؤشرات الأداء والرقابة
- أدوات التحكم اليدوي الآمن

## تحليل الوضع الحالي

### الواجهة
القسم الحالي في `client/src/pages/admin/admin-marketers.tsx` يقدم:
- قائمة مسوقين
- تفاصيل مسوق واحد
- تعديل إعدادات CPA وRevShare
- منح/سحب الشارة
- تشغيل المجدول يدويًا
- سجل تشغيل المجدول

### الباكإند
المسارات الفعلية موجودة في:
- `server/admin-routes/admin-currency/marketer-program.ts`
- `server/lib/affiliate-commissions.ts`
- `server/lib/marketer-commission-scheduler.ts`

والمنظومة الحالية تدعم:
- إنشاء/تحديث affiliate record
- منح/سحب badge
- تحديث config
- تشغيل sync/release
- عرض scheduler runs
- حساب عمولات registration / revshare

## الفجوات الحالية
1. **نقص التجميع التشغيلي**
   - الواجهة موجودة لكنها ليست لوحة قيادة شاملة.
   - لا توجد طبقات واضحة لـ KPIs / Risk / Compliance / Operations.

2. **ضعف مركزية العقود**
   - الردود الحالية mixed بين `affiliate`, `summary`, `commissionStats`, `recentEvents`.
   - تحتاج normalization طبقي واضح وثابت.

3. **غياب نظام صلاحيات تشغيلي**
   - لا توجد مستويات تحكم مثل:
     - read-only
     - finance ops
     - supervisor
     - super admin
   - هذا مهم لبيئة عالمية.

4. **نقص أدوات المراقبة**
   - لا توجد:
     - health snapshot
     - anomaly detection
     - commission drift alerts
     - stale affiliate detection
     - scheduler latency tracking

5. **نقص audit ergonomics**
   - logging موجود، لكن يحتاج طبقة تشغيلية تعرض “ماذا حدث ولماذا ومتى وبواسطة من”.

6. **نقص UX على مستوى enterprise**
   - الصفحة تحتاج:
     - hero summary
     - KPI cards
     - risk indicators
     - tables محسنة
     - action drawer / modal workflow
     - bulk operations
     - filters more advanced

## الرؤية المستهدفة
لوحة واحدة موجهة لإدارة المسوقين عالميًا تشمل:
- نظرة عامة مالية
- متابعة الأداء حسب الدولة/العملة/البرنامج
- إدارة badge وeligibility وhold rules
- مراجعة manual overrides
- تشغيل المجدول بثقة مع idempotency
- تقارير تفصيلية قابلة للتصدير
- مراقبة المخاطر والتأخيرات والتكرار
- دعم التشغيل اليومي وفرق المراجعة المالية

---

# خطة التطوير الكبيرة

## المرحلة 1 — تثبيت العقود الأساسية
### Backend
- توحيد response shapes
- إضافة validation types واضحة
- توسيع endpoints الحالية بحيث ترجع metadata مفيد للتشغيل
- حماية أفضل للمدخلات
- فصل logic من route handlers إلى services/helpers

### Frontend
- تحويل الصفحة إلى layout غني
- فصل الأقسام إلى components صغيرة
- توحيد تنسيق الأرقام والتواريخ والحالات

### Deliverables
- `summary`
- `marketer list`
- `marketer detail`
- `scheduler runs`
- `actions`

---

## المرحلة 2 — بناء طبقة تشغيل احترافية
### KPIs
إضافة مؤشرات رئيسية مثل:
- إجمالي المسوقين
- approved / pending / revoked
- إجمالي العمولات
- pending commission
- withdrawable commission
- paid commission
- اليوم / الأسبوع / الشهر
- متوسط hold days
- top earners

### Risk & Health
- affiliates بدون نشاط
- affiliates approved لكن revshare disabled
- affiliates approved لكن CPA disabled
- commissions متأخرة أو stuck on hold
- repeated scheduler failures
- duplicate idempotency attempts
- anomalies في increases/decreases

### Action Center
- Grant badge
- Revoke badge
- Update config
- Run full sync
- Run release only
- Force resync
- Export data
- View audit trail

---

## المرحلة 3 — تصميم Enterprise UX
### Layout
- Hero header
- 3-4 KPI cards
- split view:
  - left: marketers list
  - right: detailed ops panel
- bottom: scheduler runs + audit trail

### Interactions
- search
- filter by status
- filter by badge state
- filter by CPA/RevShare state
- filter by date
- quick actions inline
- confirmation dialogs for destructive actions
- optimistic updates where safe

### Visual quality
- consistent spacing
- polished badges
- clear states
- empty states
- loading skeletons
- error banners
- mobile support without layout collapse

---

## المرحلة 4 — Backend hardening
### Needed improvements
1. **Service layer**
   - نقل logic من route file إلى service functions
   - جعل route layer thin

2. **Atomic operations**
   - badge grant/revoke
   - config update
   - scheduler run
   - snapshot updates
   - payout release

3. **Better observability**
   - run metadata
   - error classification
   - action trace
   - processing duration

4. **Safer idempotency**
   - bucketed keys
   - duplicate detection
   - explicit retry semantics

5. **Global readiness**
   - support thousands of affiliates
   - paginated listing
   - partial loading
   - efficient summary queries

---

## المرحلة 5 — الإدارة العالمية
### Worldwide operational features
- currency-aware summaries
- timezone aware reports
- country-based filtering
- commission grouping by region
- risk scoring
- multi-admin auditability
- SLA visibility on release delays
- scheduled export jobs
- role-based access for operations teams

### Finance controls
- manual release approvals
- hold release justification
- per-marketer overrides
- payout auditing
- revenue snapshots
- drift detection

---

# التنفيذ المقترح

## Backend files to evolve
- `server/admin-routes/admin-currency/marketer-program.ts`
- `server/lib/affiliate-commissions.ts`
- `server/lib/marketer-commission-scheduler.ts`
- `shared/schema.ts` if we need stronger typed contracts
- possibly split helpers into:
  - `server/lib/marketer-program-service.ts`
  - `server/lib/marketer-program-reports.ts`
  - `server/lib/marketer-program-validation.ts`

## Frontend files to evolve
- `client/src/pages/admin/admin-marketers.tsx`
- possibly add:
  - `client/src/components/admin/marketers/...`
  - `client/src/components/admin/common/...`

---

# Initial implementation plan

## Step A
Normalize backend responses and centralize helper logic.

## Step B
Expand admin marketers page into a true operations dashboard.

## Step C
Add richer KPIs and risk blocks.

## Step D
Improve scheduler runs UI and filtering.

## Step E
Add bulk operations and detailed marketer drawer/modal.

## Step F
Verify types, build, and runtime behavior.

---

# Success criteria
- قسم Admin Marketers يصبح لوحة تشغيل قوية واحترافية
- العمليات تكون آمنة وقابلة للتدقيق
- البيانات تكون واضحة وقابلة للإدارة عالميًا
- الواجهة تبدو enterprise-grade
- الباكإند يدعم التوسع والحوكمة وليس مجرد CRUD
