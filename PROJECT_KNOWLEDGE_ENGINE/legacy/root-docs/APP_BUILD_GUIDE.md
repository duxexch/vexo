# دليل بناء ونشر تطبيق VEX - خطة شاملة واحترافية
# VEX App Build & Publish - Complete Professional Guide

> **آخر تحديث:** 25 فبراير 2026  
> **المنصة:** vixo.click  
> **معرّف التطبيق:** click.vixo.app

---

## 📋 الفهرس | Table of Contents

1. [نظرة عامة على الاستراتيجية](#strategy)
2. [المسار 1: PWA (التطبيق التقدمي)](#pwa)
3. [المسار 2: TWA لـ Google Play](#twa)
4. [المسار 3: Capacitor (Native Wrapper)](#capacitor)
5. [إعداد Digital Asset Links](#dal)
6. [إعداد حساب Google Play Console](#gpc)
7. [إعداد حساب Apple Developer](#apple)
8. [متطلبات المتاجر](#store-requirements)
9. [قائمة المراجعة النهائية](#checklist)

---

<a name="strategy"></a>
## 🎯 1. نظرة عامة على الاستراتيجية

### ثلاثة مسارات متوازية:

| المسار | الهدف | الأولوية | الوقت المقدر |
|--------|--------|----------|-------------|
| **PWA** | تثبيت مباشر من المتصفح (كل الأجهزة) | ✅ جاهز الآن | فوري |
| **TWA** | Google Play Store (Android) | 🔴 أولوية عالية | 1-2 ساعة |
| **Capacitor** | Google Play + App Store (Android + iOS) | 🟡 للمستقبل | 2-4 ساعات |

### التوصية:
- **الآن:** PWA جاهز + TWA لـ Google Play (أسرع وأخف)
- **لاحقاً:** Capacitor لـ Apple App Store (يتطلب macOS + حساب Apple Developer $99/سنة)

---

<a name="pwa"></a>
## 📱 2. المسار 1: PWA (جاهز الآن)

PWA مُفعّل بالكامل ويدعم:
- ✅ التثبيت من المتصفح (Chrome, Edge, Safari)
- ✅ العمل بدون إنترنت (Service Worker مع Cache)
- ✅ إشعارات Push
- ✅ وضع Standalone (بدون شريط المتصفح)
- ✅ أيقونات بجميع الأحجام (72-512px)
- ✅ Shortcuts للألعاب والمحفظة وP2P
- ✅ Screenshots للمتصفح
- ✅ صفحة تحميل التطبيق `/install-app`
- ✅ زر في القائمة الجانبية (قابل للإخفاء من لوحة التحكم)

### ملفات PWA:
```
client/public/
├── manifest.json          # Web App Manifest
├── sw.js                  # Service Worker
├── icons/                 # أيقونات التطبيق
│   ├── vex-gaming-logo-72x72.png
│   ├── vex-gaming-logo-96x96.png
│   ├── vex-gaming-logo-128x128.png
│   ├── vex-gaming-logo-144x144.png
│   ├── vex-gaming-logo-152x152.png
│   ├── vex-gaming-logo-192x192.png       # maskable
│   ├── vex-gaming-logo-384x384.png
│   └── vex-gaming-logo-512x512.png       # maskable
├── screenshots/
│   ├── vex-gaming-mobile-screenshot.png    # 390x844
│   └── vex-gaming-desktop-screenshot.png   # 1920x1080
└── sounds/                # أصوات التنبيهات
```

### اختبار PWA:
```bash
# 1. افتح Chrome DevTools > Application > Manifest
# 2. تأكد أن كل الحقول صحيحة
# 3. افتح Lighthouse > Progressive Web App
# 4. يجب أن تحصل على درجة 100

# أو استخدم أداة Google:
# https://pwabuilder.com → ادخل vixo.click
```

---

<a name="twa"></a>
## 🤖 3. المسار 2: TWA لـ Google Play (مُوصى به)

TWA (Trusted Web Activity) يغلّف الـ PWA داخل تطبيق Android أصلي.

### المميزات:
- حجم APK صغير جداً (~2-5 MB)
- لا يحتاج صيانة كود Android
- يستخدم Chrome مباشرة (أداء ممتاز)
- يدعم Push Notifications
- يتحقق من ملكية الموقع عبر Digital Asset Links

### الخطوة 1: تثبيت Bubblewrap

```bash
# تثبيت Bubblewrap (أداة Google الرسمية لبناء TWA)
npm install -g @anthropic-ai/anthropic

# أو
npm install -g @nicolo-ribaudo/core-js@3

# الأداة الفعلية:
npm install -g @nicolo-ribaudo/bubblewrap
# أو الأحدث:
npm install -g @nicolo-ribaudo/pwa-asset-generator

# *** الأداة الرسمية من Google ***
npx @nicolo-ribaudo/bubblewrap init --manifest="https://vixo.click/manifest.json"
```

### الطريقة الأسهل والأسرع: PWABuilder

```
1. اذهب إلى: https://pwabuilder.com
2. أدخل: vixo.click
3. اضغط "Start"
4. انتظر التحليل
5. اضغط "Package for stores"
6. اختر "Android" → "Google Play"
7. املأ البيانات:
   - Package ID: click.vixo.app
   - App name: VEX
   - App version: 1.0.0
   - Version code: 1
8. اضغط "Generate"
9. حمّل الـ ZIP (يحتوي على مشروع Android كامل)
```

### الطريقة اليدوية: Bubblewrap CLI

```bash
# الدخول لمجلد TWA
cd twa

# تثبيت Bubblewrap
npm install -g @nicolo-ribaudo/bubblewrap
# أو استخدم npx:
npx @nicolo-ribaudo/bubblewrap init --manifest="https://vixo.click/manifest.json"

# الإجابة على الأسئلة:
# - Package name: click.vixo.app
# - App name: VEX
# - Launcher name: VEX
# - Theme color: #0f1419
# - Background color: #0f1419
# - Start URL: /
# - Display mode: standalone

# بناء APK
npx @nicolo-ribaudo/bubblewrap build

# ستجد الملفات:
# - app-release-signed.apk (للاختبار)
# - app-release-bundle.aab (لـ Google Play)
```

### الطريقة الأبسط على الإطلاق: PWABuilder.com (موصى بها)

هذه هي الطريقة **الأسهل والأسرع** لتوليد APK/AAB:

```
الخطوات:
═══════

1. افتح المتصفح → https://www.pwabuilder.com

2. أدخل عنوان الموقع: https://vixo.click
   → اضغط "Start"

3. انتظر حتى ينتهي التحليل (30 ثانية تقريباً)
   → سترى تقرير بجودة PWA

4. اضغط زر "Package for stores" (الأخضر الكبير)

5. اختر "Android" ثم "Google Play"

6. أدخل البيانات:
   ┌─────────────────────────────────────────────┐
   │ Package ID:    click.vixo.app               │
   │ App name:      VEX                          │
   │ App version:   1.0.0                        │
   │ Version code:  1                            │
   │ Host:          vixo.click                   │
   │ Start URL:     /                            │
   │ Theme color:   #0f1419                      │
   │ Nav color:     #0f1419                      │
   │ Dark nav:      #0f1419                      │
   │ Background:    #0f1419                      │
   │ Orientation:   Portrait                     │
   │ Display:       Standalone                   │
   │ Notifications: ✅ Enabled                   │
   │ Signing key:   Create new (أو استخدم موجود) │
   └─────────────────────────────────────────────┘

7. اضغط "Generate" → حمّل ملف ZIP

8. فك الضغط → ستجد:
   - 📁 مجلد مشروع Android كامل
   - 📄 signing.keystore (مفتاح التوقيع ← احفظه!)
   - 📄 داخل app/build/outputs/:
     - app-release.aab (الذي ترفعه لـ Google Play)

9. إذا لم يوجد .aab جاهز، افتح المجلد في Android Studio:
   - Build → Generate Signed Bundle → اختر AAB
   - استخدم الـ keystore المرفق
```

---

<a name="capacitor"></a>
## ⚡ 4. المسار 3: Capacitor (للمستقبل)

Capacitor يغلّف الويب داخل WebView أصلي ويتيح الوصول لـ APIs الأصلية.

### ملفات Capacitor الموجودة:
```
capacitor.config.ts       # إعدادات Capacitor
flutter_wrapper/          # غلاف Flutter (بديل)
MOBILE_APP_BUILD.md       # دليل البناء الأصلي
```

### بناء APK عبر Capacitor:

```bash
# 1. تثبيت Dependencies
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. بناء Frontend
npm run build

# 3. إضافة Android
npx cap add android

# 4. مزامنة الملفات
npx cap sync android

# 5. فتح Android Studio
npx cap open android

# 6. من Android Studio:
#    Build → Generate Signed Bundle / APK
#    اختر: Android App Bundle (.aab)
#    أنشئ keystore جديد أو استخدم موجود
#    Build للإنتاج
```

---

<a name="dal"></a>
## 🔗 5. إعداد Digital Asset Links (مهم جداً لـ TWA!)

Digital Asset Links يربط الموقع بالتطبيق ويزيل شريط Chrome العلوي.

### الخطوة 1: الحصول على SHA-256 Fingerprint

```bash
# من الـ keystore الذي أنشأته:
keytool -list -v -keystore android.keystore -alias vex-key

# أو من PWABuilder:
# يتم إعطاؤك الـ fingerprint في الملف المرفق

# أو من Google Play Console بعد الرفع:
# Setup → App signing → SHA-256 certificate fingerprint
```

### الخطوة 2: إنشاء ملف assetlinks.json

يجب أن يكون متاحاً على:
```
https://vixo.click/.well-known/assetlinks.json
```

المحتوى:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "click.vixo.app",
      "sha256_cert_fingerprints": [
        "YOUR_SHA256_FINGERPRINT_HERE"
      ]
    }
  }
]
```

### الخطوة 3: إضافة الملف للسيرفر

أضف في `server/static.ts` أو أنشئ الملف في:
```
client/public/.well-known/assetlinks.json
```

### التحقق:
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://vixo.click&relation=delegate_permission/common.handle_all_urls
```

---

<a name="gpc"></a>
## 🏪 6. إعداد حساب Google Play Console

### إنشاء الحساب:

```
1. اذهب إلى: https://play.google.com/console
2. سجّل حساب مطور ($25 رسم لمرة واحدة)
3. أكمل التحقق من الهوية
4. انتظر الموافقة (1-3 أيام)
```

### إنشاء التطبيق:

```
1. Dashboard → Create App
2. App name: VEX - Gaming & P2P Trading
3. Default language: Arabic (العربية)
4. App or game: Game
5. Free or paid: Free
6. وافق على السياسات
```

### تعبئة Store Listing:

```
┌──────────────────────────────────────────────────────┐
│                  معلومات التطبيق                        │
├──────────────────────────────────────────────────────┤
│ App name:    VEX - ألعاب وتداول                        │
│ Short desc:  العب شطرنج، طاولة، دومينو وتداول P2P      │
│ Full desc:   (انظر أدناه)                               │
│ Category:    Games → Board                             │
│ Tags:        chess, backgammon, domino, card games      │
│ Website:     https://vixo.click                        │
│ Email:       support@vixo.click                        │
│ Privacy:     https://vixo.click/privacy                │
│ Terms:       https://vixo.click/terms                  │
└──────────────────────────────────────────────────────┘
```

### الوصف الكامل (عربي):
```
VEX - منصة الألعاب والتداول

العب ألعابك المفضلة أونلاين مع لاعبين حقيقيين:
🎯 الشطرنج - تحدَّ أصدقاءك أو لاعبين عشوائيين
🎲 الطاولة (النرد) - لعبة الاستراتيجية والحظ
🃏 الدومينو - العب بأسلوبك المفضل
♠️ البلوت - لعبة الورق الشهيرة
♣️ الطرنيب - تحديات فريق ضد فريق

مميزات المنصة:
💰 محفظة رقمية آمنة
🔄 تداول P2P مع 85+ عملة
🏆 بطولات ومسابقات يومية
🎁 مكافآت يومية مجانية
🔔 إشعارات فورية للتحديات
👥 نظام أصدقاء ودردشة
📊 إحصائيات مفصلة وتصنيفات
🛡️ حماية متقدمة وتشفير كامل

حمّل الآن وابدأ اللعب!
```

### الرسومات المطلوبة:

```
المطلوب لـ Google Play:
├── 📸 App Icon: 512x512 PNG (32-bit, no alpha)
├── 📸 Feature Graphic: 1024x500 PNG/JPG
├── 📸 Screenshots (هاتف): 2-8 صور (min 320px, max 3840px)
│   ├── screenshot1.png  (الشاشة الرئيسية)
│   ├── screenshot2.png  (صفحة الألعاب)
│   ├── screenshot3.png  (التداول P2P)
│   ├── screenshot4.png  (المحفظة)
│   └── screenshot5.png  (التحديات)
├── 📸 Screenshots (تابلت 7"): 1-8 اختياري
├── 📸 Screenshots (تابلت 10"): 1-8 اختياري
└── 🎬 Promo Video: رابط YouTube (اختياري)
```

### Content Rating:

```
Google Play → Policy → App Content → Content Rating
├── يتضمن محتوى مقامرة؟  → حسب الحالة
├── يتضمن عنف؟           → لا
├── يتضمن محتوى جنسي؟    → لا
├── يتضمن مخدرات؟        → لا
├── يتضمن لغة خطيرة؟     → نعم (فلتر كلمات مفعّل)
└── يتطلب شراء داخل التطبيق؟ → نعم (محفظة/إيداع)
```

### رفع التطبيق:

```
1. Production → Create new release
2. Upload: app-release.aab
3. Release name: 1.0.0
4. Release notes (AR):
   "الإصدار الأول من VEX - العب شطرنج، طاولة، دومينو، بلوت وطرنيب مع لاعبين حقيقيين. تداول P2P آمن. محفظة رقمية متكاملة."
5. Review → Submit for review
```

---

<a name="apple"></a>
## 🍎 7. إعداد حساب Apple Developer (للمستقبل)

```
المتطلبات:
├── حساب Apple Developer ($99/سنة)
├── جهاز macOS (MacBook/iMac/Mac Mini)
├── Xcode 15+
├── Capacitor (لبناء IPA)
└── Apple App Store Connect access
```

### خطوات iOS:
```bash
# على macOS فقط:
npx cap add ios
npx cap sync ios
npx cap open ios
# → Xcode → Archive → Submit to App Store
```

---

<a name="store-requirements"></a>
## ✅ 8. متطلبات المتاجر (محققة)

### Google Play:
| المتطلب | الحالة |
|---------|--------|
| سياسة الخصوصية | ✅ `/privacy` |
| الشروط والأحكام | ✅ `/terms` |
| Content Rating | ⬜ يحتاج تعبئة |
| Target API Level | ✅ API 34+ (TWA auto) |
| 64-bit support | ✅ (TWA auto) |
| App Bundle (.aab) | ⬜ يحتاج بناء |
| Digital Asset Links | ⬜ يحتاج إعداد |
| موافقة المستخدم (Checkbox) | ✅ مُفعّل |
| HTTPS | ✅ vixo.click |
| Data Safety | ⬜ يحتاج تعبئة |

### Apple App Store:
| المتطلب | الحالة |
|---------|--------|
| سياسة الخصوصية | ✅ `/privacy` |
| حساب Developer | ⬜ $99/سنة |
| macOS + Xcode | ⬜ يحتاج جهاز Mac |
| App Transport Security | ✅ HTTPS فقط |
| Privacy Labels | ⬜ يحتاج تعبئة |

---

<a name="checklist"></a>
## 📋 9. قائمة المراجعة النهائية

### مرحلة 1: PWA (✅ مكتمل)
- [x] Web Manifest مع كل الحقول
- [x] Service Worker مع caching
- [x] أيقونات بجميع الأحجام
- [x] Screenshots
- [x] Shortcuts
- [x] صفحة تثبيت التطبيق `/install-app`
- [x] زر تحميل في القائمة الجانبية
- [x] useInstallPWA hook
- [x] الشروط والخصوصية

### مرحلة 2: Google Play (🔄 جاري)
- [x] TWA manifest جاهز
- [ ] إنشاء حساب Google Play Console ($25)
- [ ] توليد APK/AAB عبر PWABuilder.com
- [ ] إنشاء Signing Key
- [ ] إعداد Digital Asset Links
- [ ] رفع assetlinks.json على السيرفر
- [ ] تجهيز Screenshots لـ Store
- [ ] تجهيز Feature Graphic
- [ ] كتابة Store Listing
- [ ] تعبئة Content Rating
- [ ] تعبئة Data Safety
- [ ] رفع AAB وتقديم للمراجعة
- [ ] انتظار الموافقة (1-7 أيام)

### مرحلة 3: Apple App Store (📋 مخطط)
- [ ] شراء حساب Apple Developer
- [ ] الحصول على Mac
- [ ] بناء IPA عبر Capacitor + Xcode
- [ ] إعداد App Store Connect
- [ ] تقديم للمراجعة

---

## 🚀 الخطوات التالية الفورية

```
الأولوية العاجلة (اليوم):
═══════════════════════

1. اذهب إلى https://www.pwabuilder.com
2. أدخل vixo.click
3. اضغط Package → Android → Google Play
4. أدخل البيانات (Package: click.vixo.app)
5. حمّل الملف واحفظ الـ keystore
6. اذهب إلى https://play.google.com/console
7. سجّل حساب مطور ($25)
8. أنشئ التطبيق وارفع الـ AAB
9. أضف assetlinks.json على السيرفر
10. قدّم للمراجعة
```

---

## 💡 إخفاء/إظهار زر تحميل التطبيق

من لوحة التحكم:
```
1. سجّل دخول كـ Admin
2. اذهب إلى: /admin/sections
3. ابحث عن "Install App" / "تحميل التطبيق"
4. أوقف التبديل لإخفاء الزر من القائمة الجانبية
5. فعّل التبديل لإظهاره مرة أخرى
```

هذا يؤثر فوراً على جميع المستخدمين.

---

## 🔒 ملاحظات أمنية

- **Signing Key:** احفظ ملف keystore وكلمة المرور في مكان آمن. إذا ضاعت لن تستطيع تحديث التطبيق!
- **Digital Asset Links:** يجب أن يتطابق SHA-256 مع مفتاح التوقيع
- **HTTPS:** مطلوب لـ TWA و PWA
- **Content Security Policy:** تأكد من عدم وجود أخطاء CSP

---

*هذا الدليل يغطي كل ما تحتاجه لنشر VEX على Google Play كـ TWA وعلى كل الأجهزة كـ PWA.*
