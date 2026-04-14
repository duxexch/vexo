# دليل بناء تطبيق VEX للموبايل - إصدار الإنتاج
# VEX Mobile App - Production Build Guide
# آخر تحديث: فبراير 2026

---

## نظرة عامة | Overview

التطبيق مبني باستخدام **Capacitor** يلف الـ Web App كتطبيق أصلي (Native) لـ Android و iOS.
- **App ID:** `click.vixo.app`
- **App Name:** VEX
- **Server URL:** `https://vixo.click`
- **Min Android:** API 24 (Android 7.0)
- **Min iOS:** iOS 14+

---

## المتطلبات | Prerequisites

### للتطوير | Development:
- **Node.js** 20+ (LTS)
- **npm** 10+

### لبناء Android (Google Play):
- **Android Studio** Hedgehog (2023.1.1) أو أحدث
- **Android SDK** API 34 (Android 14)
- **Java JDK** 17+
- **Gradle** 8+

### لبناء iOS (App Store):
- **macOS** Ventura أو أحدث
- **Xcode** 15+
- **CocoaPods** 1.14+

---

## الخطوة 1: تثبيت الحزم

```bash
# تثبيت حزم المشروع
npm install

# تثبيت Capacitor CLI و Core
npm install @capacitor/core @capacitor/cli

# تثبيت منصات Android و iOS
npm install @capacitor/android @capacitor/ios

# تثبيت الـ Plugins المطلوبة
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard @capacitor/push-notifications @capacitor/app @capacitor/browser @capacitor/haptics @capacitor/network
```

---

## الخطوة 2: بناء المشروع للإنتاج

```bash
# بناء الـ Frontend
npm run build

# فحص المشاكل
npx cap doctor
```

---

## الخطوة 3: إضافة المنصات

```bash
# إضافة Android
npx cap add android

# إضافة iOS (يتطلب macOS)
npx cap add ios
```

---

## الخطوة 4: مزامنة الملفات

```bash
# نسخ الـ build للمنصات + تحديث الـ plugins
npx cap sync
```

---

## الخطوة 5: إعداد Android للإنتاج

### 5.1 إنشاء مفتاح التوقيع (مرة واحدة فقط):

إذا كان التطبيق لديه نسخة مثبتة بالفعل عند المستخدمين أو تم رفعه سابقاً، **لا تنشئ مفتاحاً جديداً**. يجب استخدام نفس مفتاح التوقيع في كل تحديث، وإلا سيرفض Android التحديث فوق النسخة الحالية وسيجبر المستخدم على حذف التطبيق أولاً.

```bash
keytool -genkey -v \
    -keystore android/keystore/vex-release-official.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
    -alias vex_release_official \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=VEX Platform, OU=Mobile, O=VEX, L=Riyadh, ST=Riyadh, C=SA"
```

> **مهم جداً**: احفظ ملف `android/keystore/vex-release-official.jks` وكلمات المرور في مكان آمن. لو ضاع المفتاح مش هتقدر تحدث التطبيق على Google Play أو فوق النسخ المثبتة حالياً.

### 5.2 إعداد Gradle للتوقيع:

أنشئ ملف `android/app/signing.properties`:
```properties
storeFile=../keystore/vex-release-official.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=vex_release_official
keyPassword=YOUR_KEY_PASSWORD
```

### 5.3 تعديل `android/app/build.gradle`:

أضف في نهاية `android {}`:
```groovy
signingConfigs {
    release {
        def signingProps = new Properties()
        def signingFile = file("signing.properties")
        if (signingFile.exists()) {
            signingProps.load(new FileInputStream(signingFile))
            storeFile file(signingProps['storeFile'])
            storePassword signingProps['storePassword']
            keyAlias signingProps['keyAlias']
            keyPassword signingProps['keyPassword']
        }
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

### 5.4 إعداد App Links (للظهور كتطبيق موثوق):

أضف في `android/app/src/main/AndroidManifest.xml` داخل `<activity>`:
```xml
<!-- Deep Links for OAuth callbacks -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="vixo.click" />
</intent-filter>

<!-- Custom scheme for OAuth -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="vexapp" android:host="callback" />
</intent-filter>
```

### 5.5 إعداد Network Security (للثقة):

أنشئ `android/app/src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">vixo.click</domain>
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </domain-config>
</network-security-config>
```

وأضف في `AndroidManifest.xml` في `<application>`:
```xml
android:networkSecurityConfig="@xml/network_security_config"
android:usesCleartextTraffic="false"
```

---

## الخطوة 6: بناء APK/AAB للإنتاج

### Android App Bundle (للمتجر - مطلوب):
```bash
# فتح Android Studio
npx cap open android

# أو من جذر المشروع بأمر موحد يختار JDK متوافق تلقائياً:
npm run mobile:android:bundle

# الملف في: android/app/build/outputs/bundle/release/app-release.aab
```

### APK للتوزيع المباشر:
```bash
npm run mobile:android:assemble

# الملف في: android/app/build/outputs/apk/release/app-release.apk
```

### تنظيف Build Android بنفس بيئة Java الصحيحة:
```bash
npm run mobile:android:clean
```

> أوامر `mobile:android:*` تضبط `JAVA_HOME` تلقائياً على JDK 21 متوافق قبل تشغيل Gradle، حتى لا يعود خطأ `Unsupported class file major version 69` أثناء البناء المحلي.

---

## الخطوة 7: إعداد App Links Verification (لتطبيق موثوق)

### إنشاء ملف Digital Asset Links:

يجب أن يُقدم من السيرفر على:
`https://vixo.click/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "click.vixo.app",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
  }
}]
```

### الحصول على SHA256 fingerprint:
```bash
keytool -list -v -keystore android/keystore/vex-release-official.jks -alias vex_release_official | grep SHA256
```

---

## الخطوة 8: النشر على Google Play Store

### المتطلبات:
1. حساب مطور Google Play ($25 مرة واحدة)
2. ملف AAB موقّع
3. أيقونة 512x512 (موجودة: `client/public/icons/vex-gaming-logo-512x512.png`)
4. Feature Graphic 1024x500
5. Screenshots (2-8) لكل حجم شاشة
6. وصف التطبيق (عربي + إنجليزي)

### خطوات الرفع:
1. ادخل [Google Play Console](https://play.google.com/console)
2. أنشئ تطبيق جديد → اختر "App" → اسم: **VEX**
3. **Store listing:**
   - Title: `VEX - Gaming & Trading Platform`
   - Short description: `Play Chess, Backgammon, Domino & more. Trade P2P securely.`
   - Category: **Games** → **Board**
   - Content rating: 18+ (بسبب التداول المالي)
4. ارفع AAB في Release > Production
5. **App signing:** Google Play يدير مفتاح التوقيع
6. **Content rating:** أجب على الاستبيان
7. **Data safety:** صرّح بالبيانات المجمعة
8. أرسل للمراجعة

### الوصف الكامل (English):
```
VEX - The Ultimate Gaming & P2P Trading Platform

🎮 GAMES:
• Chess - Classic & timed matches
• Backgammon - Traditional & modern rules  
• Domino - Multiple game modes
• Tarneeb - Authentic card game
• Baloot - Popular Arabian card game

💰 P2P TRADING:
• Trade with 85+ currencies
• Secure escrow system
• Real-time dispute resolution
• Verified traders

🏆 FEATURES:
• Real-time multiplayer matches
• Ranked competitive play
• Daily rewards & challenges
• Secure wallet system
• Push notifications
• Arabic & English support

🔒 SECURITY:
• End-to-end encryption
• Two-factor authentication
• Verified accounts
• Anti-cheat system

Download VEX now and join thousands of players worldwide!
```

### الوصف الكامل (العربي):
```
VEX - منصة الألعاب والتداول الشاملة

🎮 الألعاب:
• الشطرنج - مباريات كلاسيكية وسريعة
• الطاولة (باكغامون) - قواعد تقليدية وحديثة
• الدومينو - أوضاع لعب متعددة
• الطرنيب - لعبة الورق الأصيلة
• البلوت - لعبة الورق الشعبية

💰 التداول P2P:
• تداول بأكثر من 85 عملة
• نظام ضمان آمن
• حل النزاعات فوري
• متداولين موثقين

🏆 المميزات:
• مباريات لحظية متعددة اللاعبين
• لعب تنافسي مصنف
• مكافآت وتحديات يومية
• نظام محفظة آمن
• إشعارات فورية
• دعم عربي وإنجليزي

🔒 الأمان:
• تشفير من طرف لطرف
• مصادقة ثنائية
• حسابات موثقة
• نظام مكافحة الغش

حمّل VEX الآن وانضم لآلاف اللاعبين حول العالم!
```

---

## الخطوة 9: النشر على Apple App Store

### المتطلبات:
1. حساب Apple Developer ($99/سنة)
2. macOS + Xcode 15+
3. App ID مسجل في Apple Developer Portal

### الخطوات:
```bash
npx cap open ios
```

1. في Xcode: اختر **Generic iOS Device**
2. **Signing & Capabilities:**
   - Team: حساب المطور
   - Bundle Identifier: `click.vixo.app`
   - فعّل: Push Notifications, Associated Domains
3. **Product > Archive**
4. **Distribute App > App Store Connect**

---

## تحديث التطبيق

بعد أي تعديل على الكود:
```bash
npm run build
npx cap sync
npm run mobile:android:bundle
```

---

## فحص المشاكل | Troubleshooting

```bash
npx cap doctor                                    # فحص حالة Capacitor
npm run mobile:android:clean
npm run mobile:android:bundle                    # تنظيف وإعادة بناء
npx cap update                                     # تحديث plugins
```

---

## الملفات المهمة

| الملف | الوصف |
|-------|-------|
| `capacitor.config.ts` | إعدادات Capacitor الرئيسية |
| `client/public/manifest.json` | PWA manifest |
| `client/public/sw.js` | Service Worker |
| `client/public/icons/` | أيقونات التطبيق |
| `android/` | مشروع Android Studio |
| `ios/` | مشروع Xcode |
| `android/keystore/vex-release-official.jks` | مفتاح التوقيع (لا ترفعه لـ Git!) |

---

## ملاحظات أمان

1. **لا ترفع** `android/keystore/vex-release-official.jks` أو `signing.properties` على Git
2. `webContentsDebuggingEnabled: false` في الإنتاج (معطل بالفعل)
3. احفظ نسخة احتياطية من مفتاح التوقيع في مكان آمن
