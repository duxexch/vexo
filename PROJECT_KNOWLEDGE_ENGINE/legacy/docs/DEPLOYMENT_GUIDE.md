# دليل تشغيل ونشر منصة VEX الشامل
# VEX Platform Complete Deployment Guide

---

## فهرس المحتويات

1. [نظرة عامة على المشروع](#1-نظرة-عامة-على-المشروع)
2. [متطلبات المشروع](#2-متطلبات-المشروع)
3. [تثبيت المشروع على VPS](#3-تثبيت-المشروع-على-vps)
4. [إعداد قاعدة البيانات](#4-إعداد-قاعدة-البيانات)
5. [تكوين ملف البيئة](#5-تكوين-ملف-البيئة)
6. [تشغيل المشروع](#6-تشغيل-المشروع)
7. [إعداد النطاق وشهادة SSL](#7-إعداد-النطاق-وشهادة-ssl)
8. [تغليف المشروع بتطبيق Flutter](#8-تغليف-المشروع-بتطبيق-flutter)
9. [النسخ الاحتياطي والاستعادة](#9-النسخ-الاحتياطي-والاستعادة)
10. [حل المشاكل الشائعة](#10-حل-المشاكل-الشائعة)

---

## 1. نظرة عامة على المشروع

### ما هي منصة VEX؟

منصة VEX هي نظام متكامل للألعاب والتداول من نظير إلى نظير (P2P). تتضمن المنصة:

- **نظام المستخدمين**: تسجيل الدخول، إنشاء الحسابات، إدارة الملفات الشخصية
- **نظام المحفظة**: إيداع وسحب الأموال، تحويلات P2P
- **نظام الألعاب**: ألعاب متعددة مع نظام مطابقة اللاعبين
- **نظام التحديات**: إنشاء تحديات بين اللاعبين
- **لوحة الإدارة**: إدارة كاملة للمنصة
- **نظام الدردشة**: رسائل فورية مع دعم الرسائل المختفية
- **نظام الوكلاء والمسوقين**: برنامج عمولات متكامل

### التقنيات المستخدمة

| التقنية | الاستخدام |
|---------|----------|
| Node.js | الخادم الخلفي (Backend) |
| React | واجهة المستخدم (Frontend) |
| PostgreSQL | قاعدة البيانات |
| TypeScript | لغة البرمجة |
| Vite | أداة البناء |
| Tailwind CSS | تصميم الواجهة |

---

## 2. متطلبات المشروع

### متطلبات الخادم (VPS)

| المتطلب | الحد الأدنى | الموصى به |
|---------|-------------|-----------|
| المعالج (CPU) | 1 نواة | 2+ نواة |
| الذاكرة (RAM) | 2 GB | 4+ GB |
| التخزين (Storage) | 20 GB SSD | 50+ GB SSD |
| نظام التشغيل | Ubuntu 20.04+ | Ubuntu 22.04 LTS |
| الاتصال | IPv4 ثابت | IPv4 + IPv6 |

### متطلبات البرمجيات

- **Node.js**: الإصدار 20 أو أحدث
- **npm**: الإصدار 10 أو أحدث
- **PostgreSQL**: الإصدار 14 أو أحدث
- **Nginx**: للوكيل العكسي وSSL
- **PM2**: لإدارة عمليات Node.js

---

## 3. تثبيت المشروع على VPS

### الخطوة 1: الاتصال بالخادم

افتح برنامج Terminal (أو PuTTY على Windows) واتصل بالخادم:

```bash
ssh root@your_server_ip
```

استبدل `your_server_ip` بعنوان IP الخاص بخادمك.

### الخطوة 2: تحديث النظام

```bash
apt update && apt upgrade -y
```

### الخطوة 3: تثبيت Node.js 20

```bash
# تحميل وتثبيت Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# التحقق من التثبيت
node -v  # يجب أن يظهر v20.x.x
npm -v   # يجب أن يظهر 10.x.x
```

### الخطوة 4: تثبيت PostgreSQL

```bash
# تثبيت PostgreSQL
apt install -y postgresql postgresql-contrib

# تشغيل الخدمة
systemctl start postgresql
systemctl enable postgresql
```

### الخطوة 5: تثبيت PM2 و Nginx

```bash
# تثبيت PM2 عالمياً
npm install -g pm2

# تثبيت Nginx
apt install -y nginx

# تشغيل Nginx
systemctl start nginx
systemctl enable nginx
```

### الخطوة 6: تحميل المشروع

```bash
# إنشاء مجلد للتطبيقات
mkdir -p /var/www
cd /var/www

# تحميل المشروع (استبدل الرابط برابط مشروعك)
git clone https://your-repository-url.git vex
cd vex

# أو رفع الملفات يدوياً باستخدام SFTP
```

### الخطوة 7: تثبيت المتطلبات

```bash
cd /var/www/vex
npm install
```

---

## 4. إعداد قاعدة البيانات

### الخطوة 1: إنشاء مستخدم وقاعدة بيانات

```bash
# الدخول إلى PostgreSQL
sudo -u postgres psql

# داخل PostgreSQL، نفذ الأوامر التالية:
```

```sql
-- إنشاء مستخدم جديد
CREATE USER vex_user WITH PASSWORD 'your_strong_password_here';

-- إنشاء قاعدة البيانات
CREATE DATABASE vex_db OWNER vex_user;

-- منح الصلاحيات
GRANT ALL PRIVILEGES ON DATABASE vex_db TO vex_user;

-- الخروج
\q
```

**مهم جداً**: استبدل `your_strong_password_here` بكلمة مرور قوية وآمنة!

### الخطوة 2: التحقق من الاتصال

```bash
# اختبار الاتصال
psql -h localhost -U vex_user -d vex_db
# أدخل كلمة المرور عند الطلب

# إذا تم الاتصال بنجاح، اخرج بـ:
\q
```

---

## 5. تكوين ملف البيئة

### الخطوة 1: إنشاء ملف .env

```bash
cd /var/www/vex
cp .env.example .env
nano .env
```

### الخطوة 2: تعديل الإعدادات

```env
# اتصال قاعدة البيانات
DATABASE_URL=postgresql://vex_user:your_strong_password_here@localhost:5432/vex_db

# مفتاح الجلسة السري (أنشئ مفتاح عشوائي)
SESSION_SECRET=your_random_32_character_secret_key

# منفذ الخادم
PORT=5000

# البيئة
NODE_ENV=production
```

### الخطوة 3: إنشاء مفتاح سري عشوائي

```bash
# أنشئ مفتاح عشوائي باستخدام:
openssl rand -base64 32

# انسخ الناتج واستخدمه في SESSION_SECRET
```

### الخطوة 4: حفظ الملف

اضغط `Ctrl + X` ثم `Y` ثم `Enter` للحفظ والخروج.

---

## 6. تشغيل المشروع

### الخطوة 1: بناء المشروع

```bash
cd /var/www/vex

# بناء المشروع للإنتاج
npm run build

# تشغيل ترحيلات قاعدة البيانات
npm run db:push
```

### الخطوة 2: تشغيل المشروع باستخدام PM2

```bash
# تشغيل المشروع
pm2 start dist/server/index.js --name "vex"

# التحقق من حالة التشغيل
pm2 status

# حفظ الإعدادات للتشغيل التلقائي
pm2 save
pm2 startup

# عرض السجلات
pm2 logs vex
```

### الخطوة 3: التحقق من التشغيل

```bash
# اختبار الاتصال المحلي
curl http://localhost:5000/api/health

# يجب أن يظهر رد إيجابي
```

---

## 7. إعداد النطاق وشهادة SSL

### الخطوة 1: إعداد Nginx

```bash
# إنشاء ملف تكوين Nginx
nano /etc/nginx/sites-available/vex
```

أضف المحتوى التالي:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

**مهم**: استبدل `yourdomain.com` بنطاقك الفعلي.

### الخطوة 2: تفعيل الموقع

```bash
# إنشاء رابط رمزي
ln -s /etc/nginx/sites-available/vex /etc/nginx/sites-enabled/

# اختبار التكوين
nginx -t

# إعادة تشغيل Nginx
systemctl reload nginx
```

### الخطوة 3: تثبيت شهادة SSL

```bash
# تثبيت Certbot
apt install -y certbot python3-certbot-nginx

# الحصول على شهادة SSL
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# اتبع التعليمات وأدخل بريدك الإلكتروني

# تجديد تلقائي (يتم تلقائياً)
certbot renew --dry-run
```

---

## 8. تغليف المشروع بتطبيق Flutter

### المتطلبات

- Flutter SDK (الإصدار 3.x أو أحدث)
- Android Studio أو VS Code مع إضافة Flutter
- حساب Google Play Developer (لنشر التطبيق)

### الخطوة 1: إنشاء مشروع Flutter جديد

```bash
# إنشاء مشروع Flutter
flutter create vex_app
cd vex_app
```

### الخطوة 2: تعديل ملف pubspec.yaml

```yaml
dependencies:
  flutter:
    sdk: flutter
  webview_flutter: ^4.4.2
  connectivity_plus: ^5.0.2
  flutter_native_splash: ^2.3.8
```

### الخطوة 3: إنشاء ملف الواجهة الرئيسية

أنشئ ملف `lib/main.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  runApp(const VexApp());
}

class VexApp extends StatelessWidget {
  const VexApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VEX',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.green,
        scaffoldBackgroundColor: const Color(0xFF0f1419),
      ),
      home: const WebViewScreen(),
    );
  }
}

class WebViewScreen extends StatefulWidget {
  const WebViewScreen({super.key});

  @override
  State<WebViewScreen> createState() => _WebViewScreenState();
}

class _WebViewScreenState extends State<WebViewScreen> {
  late final WebViewController controller;
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0f1419))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            setState(() => isLoading = true);
          },
          onPageFinished: (String url) {
            setState(() => isLoading = false);
          },
        ),
      )
      ..loadRequest(Uri.parse('https://yourdomain.com'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            WebViewWidget(controller: controller),
            if (isLoading)
              const Center(
                child: CircularProgressIndicator(
                  color: Color(0xFF00c853),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
```

**مهم**: استبدل `https://yourdomain.com` برابط موقعك الفعلي.

### الخطوة 4: بناء التطبيق

```bash
# تثبيت المتطلبات
flutter pub get

# بناء APK للأندرويد
flutter build apk --release

# بناء App Bundle للنشر على Google Play
flutter build appbundle --release

# ملف APK موجود في:
# build/app/outputs/flutter-apk/app-release.apk

# ملف AAB موجود في:
# build/app/outputs/bundle/release/app-release.aab
```

### الخطوة 5: إعداد أيقونة التطبيق

1. أضف أيقونتك في `assets/icon/icon.png`
2. أضف في `pubspec.yaml`:

```yaml
flutter_icons:
  android: true
  ios: true
  image_path: "assets/icon/icon.png"
```

3. نفذ الأمر:

```bash
flutter pub run flutter_launcher_icons
```

---

## 9. النسخ الاحتياطي والاستعادة

### نسخ احتياطي لقاعدة البيانات

```bash
# إنشاء نسخة احتياطية
pg_dump -U vex_user -h localhost vex_db > backup_$(date +%Y%m%d_%H%M%S).sql

# نسخة احتياطية مضغوطة
pg_dump -U vex_user -h localhost vex_db | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### استعادة قاعدة البيانات

```bash
# استعادة من ملف SQL
psql -U vex_user -h localhost vex_db < backup_file.sql

# استعادة من ملف مضغوط
gunzip -c backup_file.sql.gz | psql -U vex_user -h localhost vex_db
```

### نسخ احتياطي تلقائي (Cron Job)

```bash
# فتح محرر cron
crontab -e

# إضافة نسخ احتياطي يومي في الساعة 3 صباحاً
0 3 * * * pg_dump -U vex_user -h localhost vex_db | gzip > /var/backups/vex/backup_$(date +\%Y\%m\%d).sql.gz
```

---

## 10. حل المشاكل الشائعة

### المشكلة: خطأ في الاتصال بقاعدة البيانات

**الحل:**
```bash
# التحقق من تشغيل PostgreSQL
systemctl status postgresql

# إعادة تشغيل الخدمة
systemctl restart postgresql

# التحقق من إعدادات الاتصال في .env
```

### المشكلة: المنفذ 5000 مستخدم

**الحل:**
```bash
# معرفة العملية التي تستخدم المنفذ
lsof -i :5000

# إيقاف العملية
kill -9 PID
```

### المشكلة: خطأ في الذاكرة

**الحل:**
```bash
# زيادة حد الذاكرة لـ Node.js
export NODE_OPTIONS="--max-old-space-size=4096"
```

### المشكلة: شهادة SSL لا تعمل

**الحل:**
```bash
# تجديد الشهادة
certbot renew --force-renewal

# إعادة تشغيل Nginx
systemctl restart nginx
```

### المشكلة: التطبيق لا يبدأ تلقائياً

**الحل:**
```bash
# إعادة تفعيل PM2 startup
pm2 unstartup
pm2 startup
pm2 save
```

---

## ملاحظات مهمة

1. **الأمان**: 
   - غيّر كلمات المرور الافتراضية
   - استخدم جدار حماية (UFW)
   - حدّث النظام بانتظام

2. **الأداء**:
   - راقب استخدام الذاكرة والمعالج
   - استخدم CDN للملفات الثابتة
   - فعّل ضغط Gzip في Nginx

3. **الصيانة**:
   - أنشئ نسخ احتياطية منتظمة
   - راقب السجلات للأخطاء
   - حدّث المتطلبات بانتظام

---

## الدعم والمساعدة

إذا واجهت أي مشاكل:

1. راجع سجلات التطبيق: `pm2 logs vex`
2. راجع سجلات Nginx: `tail -f /var/log/nginx/error.log`
3. راجع سجلات PostgreSQL: `tail -f /var/log/postgresql/postgresql-14-main.log`

---

تم إعداد هذا الدليل لمنصة VEX
VEX Platform Documentation
