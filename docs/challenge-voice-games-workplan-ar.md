# خطة عمل تنفيذية لخدمة التحديات والصوت والألعاب

## 1) الهدف
تحويل التقرير المعماري إلى خطة تنفيذ عملية لتثبيت خدمة التحديات والصوت والألعاب كمنصة real-time مستقرة وقابلة للتوسع.

## 2) نطاق العمل
يشمل:
- دورة حياة التحدي
- جلسات اللعب
- محركات الألعاب
- RTC / الصوت / الفيديو
- الحالة والـ snapshots
- المزامنة والـ ordering
- الحضور والمراقبة
- الحماية من الغش
- التوسّع الأفقي
- التحليلات والتشغيل

---

## 3) أولويات التنفيذ

### المرحلة 1 — تثبيت الأساس المعماري
1. فرض ordering & idempotency على كل move.
2. تثبيت strict authority enforcement على السيرفر لكل حركة.
3. التحقق من deterministic behavior لكل engine.
4. تعريف وتثبيت Move Contract Definition لكل لعبة:
   - input schema
   - validation rules
   - side effects
   - expected output
5. إضافة session snapshots بعد تثبيت الترتيب.
6. إضافة sessionId وcorrelationId لكل حدث.
7. توحيد مسار الأحداث:
   - create challenge
   - join
   - create session
   - initialize engine
   - broadcast state
   - close session
8. إضافة periodic snapshot persistence للجلسات.

### المرحلة 2 — ضبط الـ Realtime وRTC
1. تثبيت قناة RTC منفصلة عن قناة اللعبة.
2. فصل presence channel الخفيف عن full game WS.
3. إضافة rate limiting على presence updates.
4. إضافة coalescing / debounce على presence updates.
5. توحيد handling لرسائل:
   - invite
   - answer
   - sdp
   - ice
   - end
6. تحسين reconnect flow للصوت فقط دون كسر session.
7. توضيح loading states في الواجهة:
   - waiting for opponent
   - reconnecting
   - syncing state

### المرحلة 3 — استقرار محركات الألعاب
1. مراجعة كل engine لضمان determinism.
2. توثيق replayability على أساس initial state + move sequence.
3. إضافة audit trail للـ moves والنتائج.
4. توثيق move validation وturn order لكل لعبة.
5. تثبيت team model للألعاب الفريقية:
   - Domino
   - Tarneeb
   - Baloot

### المرحلة 4 — الحماية والجودة
1. تطبيق idempotency على الحركات.
2. رفض out-of-order وduplicate moves.
3. تقسيم anti-cheat إلى مستويات:
   - Level 1: server validation + ordering enforcement
   - Level 2: anomaly detection
   - Level 3: behavioral models / ML detection (اختياري)
4. إضافة backpressure limits:
   - moves/sec
   - messages/sec
5. إضافة metrics أساسية:
   - active sessions
   - rtc success rate
   - event lag
   - reconnect rate
   - forfeit rate

### المرحلة 5 — التوسّع والتشغيل
1. اعتماد Partitioning Strategy حسب sessionId.
2. ضمان أن كل session تعمل على worker واحد authoritative.
3. فصل WS layer عن RTC signaling عن game workers.
4. إضافة failure isolation zones.
5. توثيق non-goals والقيود.
6. إعداد dashboard للتشغيل والمراقبة.
7. إضافة Operational Playbooks للحالات الشائعة.

---

## 4) المهام التفصيلية

### A. Challenge & Session
- [ ] توحيد create/join/session lifecycle
- [ ] تثبيت ordering & idempotency
- [ ] تثبيت strict authority enforcement
- [ ] التحقق من deterministic behavior
- [ ] تثبيت snapshot persistence
- [ ] إضافة correlation ids
- [ ] توثيق data model النهائي

### B. Game Engine
- [ ] تعريف Move Contract Definition لكل لعبة
- [ ] مراجعة deterministic behavior
- [ ] تثبيت strong consistency على game state
- [ ] إضافة replay/audit support
- [ ] توثيق turn/sequence rules

### C. RTC / Voice
- [ ] فصل RTC control plane عن game plane
- [ ] تحسين reconnect for voice only
- [ ] توثيق media quality best-effort
- [ ] إضافة presence indicators
- [ ] إضافة rate limiting على presence updates
- [ ] إضافة coalescing / debounce على presence updates

### D. Realtime & Messaging
- [ ] إضافة ordering guarantees
- [ ] تطبيق idempotency
- [ ] ضبط backpressure
- [ ] تحسين event lag visibility
- [ ] توحيد handling لرسائل RTC
- [ ] ربط كل event بـ correlationId

### E. Anti-Cheat & Reliability
- [ ] إضافة validation hooks
- [ ] anomaly/rate detection
- [ ] replay verification
- [ ] failure recovery playbook
- [ ] تقسيم anti-cheat إلى مستويات تشغيلية واضحة

### F. Observability
- [ ] game event logs
- [ ] rtc signaling logs
- [ ] lifecycle tracing
- [ ] metrics dashboard
- [ ] alerts for lag / reconnect / forfeit
- [ ] session-level snapshots for debugging

### G. Scaling
- [ ] session partitioning strategy
- [ ] sticky sessions or sharding plan
- [ ] separate scaling for WS / RTC / engine workers
- [ ] failure isolation boundaries
- [ ] sessionId → shard partitioning strategy
- [ ] authoritative execution on a single worker per session

### H. Operational Playbooks
- [ ] Session stuck
- [ ] Player disconnect storm
- [ ] RTC outage
- [ ] WS lag spike
- [ ] detection / mitigation / recovery steps لكل حالة

---

## 5) الترتيب التنفيذي المقترح

### المرحلة التنفيذية 0 — التحضير
- [ ] تثبيت مخرجات المرحلة الأولى كمرجع رسمي
- [ ] تحديد الملفات/الوحدات التي ستتأثر في backend وshared وclient
- [ ] توثيق contract-level assumptions قبل أي تغيير في runtime

### المرحلة التنفيذية 1 — تثبيت أساس الحركات
- [ ] enforce ordering + idempotency
- [ ] verify deterministic engines
- [ ] implement authority enforcement
- [ ] define move contracts

### المرحلة التنفيذية 2 — snapshots ومسار الجلسة
- [ ] implement session snapshots
- [ ] add replay capability
- [ ] introduce correlationId + tracing
- [ ] normalize challenge → join → session → engine init → broadcast → close flow

### المرحلة التنفيذية 3 — RTC وpresence
- [ ] isolate RTC & presence
- [ ] add backpressure & rate limits
- [ ] presence channel separation
- [ ] presence rate limiting / debounce
- [ ] reconnect flow for voice only

### المرحلة التنفيذية 4 — observability والاعتمادية
- [ ] enable observability dashboards
- [ ] replay/audit support
- [ ] anti-cheat hooks
- [ ] observability metrics
- [ ] failure recovery playbooks

### المرحلة التنفيذية 5 — التوسّع والتشغيل
- [ ] scaling strategy
- [ ] failure isolation
- [ ] operational playbooks
- [ ] final documentation
## 5) الترتيب التنفيذي المقترح

### المرحلة التنفيذية 0 — التحضير
- [ ] تثبيت مخرجات المرحلة الأولى كمرجع رسمي
- [ ] تحديد الملفات/الوحدات التي ستتأثر في backend وshared وclient
- [ ] توثيق contract-level assumptions قبل أي تغيير في runtime

### المرحلة التنفيذية 1 — تثبيت أساس الحركات
- [ ] enforce ordering + idempotency
- [ ] verify deterministic engines
- [ ] implement authority enforcement
- [ ] define move contracts

### المرحلة التنفيذية 2 — snapshots ومسار الجلسة
- [ ] implement session snapshots
- [ ] add replay capability
- [ ] introduce correlationId + tracing
- [ ] normalize challenge → join → session → engine init → broadcast → close flow

### المرحلة التنفيذية 3 — RTC وpresence
- [ ] isolate RTC & presence
- [ ] add backpressure & rate limits
- [ ] presence channel separation
- [ ] presence rate limiting / debounce
- [ ] reconnect flow for voice only

### المرحلة التنفيذية 4 — observability والاعتمادية
- [ ] enable observability dashboards
- [ ] replay/audit support
- [ ] anti-cheat hooks
- [ ] observability metrics
- [ ] failure recovery playbooks

### المرحلة التنفيذية 5 — التوسّع والتشغيل
- [ ] scaling strategy
- [ ] failure isolation
- [ ] operational playbooks
- [ ] final documentation

---

## 6) مخرجات متوقعة
بعد تنفيذ الخطة، يجب أن نحصل على:
- لعبة مستقرة server-authoritative
- RTC منفصل وقابل للاسترداد
- session snapshots قابلة للعودة
- replayable matches
- tracing كامل من challenge إلى RTC
- تحكم أفضل في الأداء والضغط
- تجربة مستخدم أكثر وضوحًا

---

## 7) معايير النجاح
- لا توجد moves out-of-order
- لا توجد duplicate moves مؤثرة
- session recovery يعمل بعد crash
- RTC reconnect لا يكسر game session
- presence خفيف ولا يحمّل الـ game WS
- event lag قابل للقياس والتنبيه
- replay/audit يستطيع إعادة بناء المباراة
- الألعاب الفريقية تعمل بوضوح على مستوى team
- Operational playbooks جاهزة للحالات الشائعة (session stuck / disconnect storm / RTC outage / WS lag spike)

---

## 8) Operational Playbooks
حالات تشغيلية يجب أن تكون لها إجراءات واضحة:

- Session stuck
- Player disconnect storm
- RTC outage
- WS lag spike

#### لكل حالة
- detection
- mitigation
- recovery steps

## 9) Non-Goals
- لا نعد باتصال مثالي تحت الشبكات الضعيفة
- جودة RTC best-effort
- لا نثق في client لأي logic حرج في اللعبة
- النظام يفضل correctness على speed، وrecovery على failure

## 10) الخلاصة
الخطة تستهدف تحويل النظام من مجرد feature مكتوبة جيدًا إلى منصة تشغيلية صلبة:
- deterministic
- authoritative
- replayable
- observable
- scalable
- failure-aware

The system should always favor correctness over speed, and recovery over failure.
