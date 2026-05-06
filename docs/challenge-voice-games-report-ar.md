# تقرير تحليلي عن خدمة التحديات والصوت والألعاب

## النسخة 1 — ملخص تنفيذي للإدارة

### ما هي الخدمة؟
هذه الخدمة تدير تحديات الألعاب بين المستخدمين بشكل لحظي، وتشمل:
- إنشاء التحدي
- قبول الخصم أو الصديق
- بدء جلسة اللعب
- تشغيل الصوت أو الفيديو أثناء المباراة
- دعم المشاهدين والهدايا
- إنهاء المباراة وتسوية النتيجة

### الألعاب المدعومة
- Backgammon
- Baloot
- Chess
- Domino
- LanguageDuel
- Tarneeb

### الفكرة الأساسية
الخدمة ليست مجرد لعبة، بل **منصة تحديات مباشرة** تجمع بين:
- المباراة نفسها
- التواصل الصوتي
- المتابعين
- الدعم والهدايا
- الحسابات والنتائج

### كيف يعمل الصوت؟
أثناء التحدي المفتوح بين مستخدمين، يتم فتح اتصال صوتي/مرئي مستقل عبر RTC.  
وكل مستخدم يملك زرين محليين:
- كتم/إلغاء كتم الميكروفون
- تشغيل/إيقاف الكاميرا

### لماذا هذا مهم؟
- يحسن التفاعل بين اللاعبين
- يرفع من مستوى الحماس داخل المباراة
- يفصل بين منطق اللعبة ومنطق الصوت، وهذا أفضل هندسيًا

### الخلاصة التنفيذية
النظام قوي وموسع، ويصلح كأساس لمنصة ألعاب تنافسية اجتماعية.  
بل هو أيضًا بنية قابلة للتحول إلى منصة بث وتفاعل اجتماعي في الوقت الحقيقي.  
لكن يحتاج استمرارية في توحيد طبقات realtime وتحسين وضوح واجهة الصوت للمستخدم.

---

## النسخة 2 — تقرير تقني للفريق الهندسي

**This system is designed as a server-authoritative, event-driven, real-time multiplayer platform with decoupled communication and gameplay layers.**

### 1) Overview
الخدمة مبنية كمنصة real-time متعددة الطبقات، حيث:
- التحدي يمثل الكيان التجاري والمنطقي الأساسي
- الجلسة تمثل الحالة التشغيلية للمباراة
- الـ engine يمثل منطق اللعبة
- الـ realtime layers تنقل الأحداث
- الـ RTC layer تتولى الاتصال الصوتي/المرئي

### 2) Architecture Layers

#### Challenge Layer
- إنشاء التحدي
- الانضمام
- تفاصيل التحدي
- القائمة
- السحب
- النقاط
- الهدايا
- الدعم

#### Session Layer
- `challengeGameSessions`
- `liveGameSessions`
- تتبع الدور الحالي
- تتبع النتائج
- تتبع اللاعبين 1..4
- تتبع المتفرجين

#### Deterministic Game Engine Layer
- chess
- backgammon
- domino
- tarneeb
- baloot
- languageduel

#### Realtime / RTC Layer
- `/ws`
- `/ws/game`
- `/chat`
- `/rtc`

### 3) Game Analysis

#### Chess
- لعبة 1v1 فقط
- تعتمد على `chess.js`
- تدير:
  - FEN
  - turn logic
  - check/checkmate
  - draw
  - timeout

#### Backgammon
- لعبة ثنائية
- تتطلب state دقيق وحركات مضبوطة
- مناسبة للتحدي المباشر

#### Domino
- تدعم 2 إلى 4 لاعبين
- فيها team mode
- فيها scoring معقد
- فيها rounds وpass/draw/play
- فيها bot support

#### Tarneeb
- 4 لاعبين عادة
- team-based
- تعتمد على bids وtricks وteam scoring

#### Baloot
- شبيهة بـ Tarneeb من حيث البنية
- 4 لاعبين
- team-based
- تحتاج state team-aware

#### LanguageDuel
- لعبة لغوية
- تدعم typed / spoken / mixed
- فيها `pointsToWin`
- قد تعتمد على الصوت بشكل مباشر

### 4) RTC & Voice
الصوت يعمل كطبقة اتصال مستقلة (Communication Layer) عبر WebRTC، ويستخدم:
- `rtc:invite`
- `rtc:answer`
- `rtc:sdp`
- `rtc:ice`
- `rtc:end`
- `rtc:tier`

#### في العميل
`useCallSession()` يدير:
- بدء المكالمة
- الرد عليها
- إنهاؤها
- اكتساب الوسائط المحلية
- إدارة حالة الاتصال
- كتم الميكروفون
- إيقاف الفيديو

#### أزرار التحكم
لكل مستخدم أثناء الاتصال:
- ميكروفون: mute/unmute
- كاميرا: video on/off

وهذه الأزرار تتحكم في `local media tracks` فقط.

### 5) State Ownership
توزيع الملكية الفعلية للحالة داخل النظام يجب أن يكون واضحًا:

- **Challenge state → database**
- **Session state → in-memory + persistent snapshot**
- **Game state → engine instance (server-side)**
- **Realtime state → ephemeral (WS connections)**
- **RTC state → خارج النظام (WebRTC peers)**

#### ملاحظة مهمة
يجب أن يوجد snapshot أو persistence للـ session حتى نضمن:
- crash recovery
- reconnect
- استمرار المباراة بعد انقطاع مؤقت

### 6) Event Flow (Lifecycle)
هذا هو التسلسل الزمني الفعلي الذي يمر به النظام:

1. User A creates challenge
2. User B joins challenge
3. Server assigns `sessionId` + `correlationId` لكل event
4. Server creates live session
5. Clients subscribe to realtime channels (`/ws`, `/ws/game`)
6. (اختياري) بدء RTC:
   - A sends `rtc:invite`
   - B sends `rtc:answer`
   - SDP/ICE exchange
7. Game start:
   - Server initializes engine
8. أثناء اللعب:
   - Client sends move
   - Server validates the move عبر engine
   - Server updates state
   - Server broadcasts via `/ws/game`
9. أثناء اللعب (صوت):
   - Media flows peer-to-peer عبر WebRTC
10. نهاية اللعبة:
   - Server determines result
   - Updates scores / points / gifts
11. إنهاء:
   - Session closed
   - (اختياري) إنهاء RTC
12. Server persists state snapshot periodically

### 7) Authority Model
**السيرفر هو Single Source of Truth**.

- جميع الحركات (moves) يتم إرسالها من العميل
- يتم التحقق منها في السيرفر
- يتم تطبيقها في الـ engine
- لا يتم الاعتماد على client state
- أي client state يُعتبر مجرد عرض (view) وليس مرجعًا

#### الهدف
- منع الغش
- منع desync
- ضمان consistency
- ضمان أن كل اللاعبين يرون نفس الحقيقة

### 8) Ordering & Idempotency
في الأنظمة realtime، الترتيب والتفرّد من أخطر نقاط الفشل.

#### المطلوب
كل move لازم يكون له:
- sequence number
- أو turn id

#### ما الذي يرفضه السيرفر؟
- duplicate moves
- out-of-order moves

#### الهدف
- منع race conditions
- منع replay attacks
- الحفاظ على consistency

### 9) Team Model
للألعاب الفريقية يجب formalize الفريق بوضوح:

#### تعريف
- teamId
- player → team mapping

#### القواعد
- turn order مرتبط بالفريق أو اللاعب حسب اللعبة
- scoring يتم على مستوى الفريق

#### Realtime
- broadcast لكل اللاعبين

#### اختياري متقدم
- team صوت خاص (private channel)

### 10) UX-State Synchronization
واجهة المستخدم لا يجب أن تعتمد على optimistic updates في هذه الخدمة.

#### السلوك المطلوب
- UI ينتظر server confirmation
- loading states واضحة

#### أمثلة للحالات
- waiting for opponent
- reconnecting
- syncing state

هذا يمنع تضارب الحالة بين client وserver ويجعل التجربة أكثر ثباتًا.

### 11) Failure & Recovery
النظام يجب أن يتعامل مع الأعطال بشكل صريح:

#### أ) انقطاع لاعب
- تطبيق grace period
- grace period مرتبط بنوع اللعبة:
  - chess ≠ tarneeb
- محاولة reconnect
- بعد timeout:
  - auto-forfeit أو pause حسب اللعبة والسياسة

#### ب) انقطاع RTC فقط
- لا يؤثر على game session
- يظهر زر:
  - “إعادة الاتصال بالصوت”
- retry تلقائي + manual fallback

#### ج) desync
- إعادة تحميل state من السيرفر
- server authoritative override
- تجاهل أي state محلي غير متوافق

### 12) Presence & Awareness
النظام يحتاج طبقة حضور واضحة ليعرف المستخدمون حالة بعضهم:

- player online / offline
- داخل الجلسة / خرج
- في المكالمة / خارجها
- speaking indicator اختياري

#### ملاحظة تنفيذية
يُفضّل أن تُرسل presence updates عبر channel خفيف منفصل، وليس عبر full game WS، لتقليل الحمل وفصل concerns.

هذه الطبقة مهمة للـ retention وتجربة اللعب أكثر من كونها مجرد UI detail.

### 13) Architectural Principle
## Decoupling Communication from Gameplay

هذا هو المبدأ المعماري الرسمي في المنصة:
- التواصل الصوتي/المرئي مستقل عن منطق اللعبة
- اللعبة authoritative من السيرفر
- الاتصال يمكن أن يفشل أو يعاد بدون كسر state اللعبة

#### الفوائد
- failure isolation
- scalability
- إمكانية تطوير features مثل:
  - recording
  - moderation
  - voice effects
  - spectator audio

### 14) Observability
أي system realtime بهذا التعقيد يحتاج observability واضحة:

#### Logs
- game events
- rtc signaling
- challenge lifecycle
- spectator actions
- settlement actions

#### Metrics
- active sessions
- rtc success rate
- reconnect rate
- forfeit rate
- ws latency
- event lag (server → client latency)

#### Tracing
- challenge → session → game → rtc

بدون observability، أي bug realtime سيكون صعب التحقيق والإصلاح.

### 15) Data Model Snapshot
مثال مبسط يربط المفاهيم النظرية بشكل عملي:

```json
{
  "challengeId": "c123",
  "sessionId": "s456",
  "players": [
    { "userId": "u1", "teamId": "t1" },
    { "userId": "u2", "teamId": "t2" }
  ],
  "state": {
    "turn": "u1",
    "gameState": { "...": "..." },
    "score": { "t1": 10, "t2": 5 }
  },
  "status": "active"
}
```

### 16) API Surface (High-Level)
واجهة API العلوية المتوقعة على مستوى التكامل:

- `POST /challenges`
- `POST /challenges/{id}/join`
- `POST /sessions/{id}/move`
- `GET /sessions/{id}`
- `POST /rtc/invite`

### 17) Backpressure Handling
في realtime systems، يجب حماية السيرفر من الفيض الزائد:

- limit على moves/sec
- limit على messages/sec
- drop أو queue حسب priority
- حماية السيرفر من flood

### 18) Consistency Model
توضيح طبقات الـ consistency ضروري لتقليل سوء الفهم بين backend وfrontend:

- **Game State:** Strong consistency (server-authoritative)
- **Realtime Updates:** Eventually consistent (WS delivery)
- **Presence:** Best-effort consistency
- **RTC Media:** Unreliable / best-effort (WebRTC)

#### الهدف
- توضيح trade-offs بوضوح
- منع توقعات خاطئة من الفريق

### 19) Replay & Auditability
بما أن الـ engine deterministic، يمكن إعادة بناء المباراة بالكامل.

#### يتم تخزين
- initial state
- sequence of moves

#### إعادة البناء
- deterministic engine replay

#### الفوائد
- مشاهدة المباريات
- debugging
- dispute resolution
- anti-cheat verification

### 20) Anti-Cheat Considerations
حتى لو لم تكن مطبقة بالكامل الآن، يجب أن تبقى ضمن التصميم:

- server validation لكل move
- rate anomaly detection
- impossible move detection
- replay verification

#### اختياري
- behavioral analysis
- latency pattern analysis

### 21) Scaling Strategy (High-Level)
كيف يكبر النظام مع زيادة الحمل:

- stateless services (challenge / API)
- sticky sessions أو partitioning للـ game sessions
- sharding based on sessionId
- separate scaling:
  - WS layer
  - RTC signaling
  - game engine workers

### 22) Failure Isolation Zones
فصل الأعطال بين الطبقات أساسي في هذه المنصة:

- Game Layer failures لا تؤثر على RTC
- RTC failures لا تؤثر على Game
- Realtime delivery failures لا تكسر state (re-sync ممكن)
- Presence failures لا تؤثر على gameplay

### 23) Risks
- تعدد realtime stacks قد يسبب policy drift
- بعض المسارات قد تظل 2-player biased
- UX الصوت قد يسبب التباس إذا لم يُعرض بوضوح
- الألعاب الفريقية تحتاج تنسيقًا قويًا للحالة
- الصوت يعتمد على جودة الشبكة وTURN
- غياب observability كافية سيصعّب تشخيص الأعطال

### 24) Non-Goals
- The system does not guarantee perfect real-time delivery under poor networks
- RTC quality is best-effort
- Client is not trusted for any game-critical logic

### 25) Closing Principle
The system is designed to prioritize consistency and fairness over latency when conflicts arise.

---

## النسخة 3 — وثيقة Markdown جاهزة للنسخ

### عنوان الوثيقة
تقرير تحليلي عن خدمة التحديات والصوت والألعاب

### النطاق
يشمل التقرير:
- الألعاب المدعومة
- تدفق التحديات
- جلسات اللعب
- الصوت/الفيديو
- realtime
- المشاهدين والدعم والهدايا

### الاستنتاج المختصر
الخدمة عبارة عن منصة تحديات real-time متكاملة، وليست مجرد لعبة.  
تجمع بين:
- challenge management
- session state
- game engines
- RTC voice/video
- spectator interactions

### أهم نقطة في الصوت
عند وجود تحدي مفتوح بين مستخدمين، يظهر لكل مستخدم:
- زر كتم/إلغاء كتم الميكروفون
- زر تشغيل/إيقاف الكاميرا

وهذان الزران يعملان محليًا على جهاز المستخدم نفسه.

### التقييم العام
- **قوة:** معمارية واضحة وقابلة للتوسع
- **قوة:** دعم ألعاب متعددة وأنماط فريقية
- **قوة:** فصل الصوت عن اللعبة
- **خطر:** تعدد مسارات realtime
- **خطر:** تعقيد UX في الألعاب الجماعية
- **خطر:** افتراضات 1v1 في بعض الأجزاء القديمة

### النتيجة النهائية
الخدمة جاهزة لتكون أساسًا لمنصة ألعاب تنافسية اجتماعية قوية، بشرط استمرار توحيد سياسة realtime وتوضيح تجربة الصوت للمستخدم.
