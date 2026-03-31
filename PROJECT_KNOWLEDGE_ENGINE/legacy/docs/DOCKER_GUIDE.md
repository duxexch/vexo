# دليل Docker لمنصة VEX
# VEX Platform Docker Guide

---

## فهرس المحتويات

1. [المتطلبات](#1-المتطلبات)
2. [التثبيت السريع](#2-التثبيت-السريع)
3. [التثبيت التفصيلي](#3-التثبيت-التفصيلي)
4. [الأوامر المتاحة](#4-الأوامر-المتاحة)
5. [إعداد SSL](#5-إعداد-ssl)
6. [النسخ الاحتياطي](#6-النسخ-الاحتياطي)
7. [حل المشاكل](#7-حل-المشاكل)

---

## 1. المتطلبات

### متطلبات النظام

- نظام تشغيل Linux (Ubuntu 20.04+ موصى به)
- ذاكرة RAM: 2 GB على الأقل
- مساحة تخزين: 20 GB على الأقل

### البرمجيات المطلوبة

- Docker (الإصدار 20.10+)
- Docker Compose (الإصدار 2.0+)

### تثبيت Docker على Ubuntu

```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Docker
curl -fsSL https://get.docker.com | sh

# إضافة المستخدم لمجموعة docker
sudo usermod -aG docker $USER

# تسجيل الخروج وإعادة الدخول لتفعيل التغييرات
# أو استخدم:
newgrp docker

# التحقق من التثبيت
docker --version
docker compose version
```

---

## 2. التثبيت السريع

### الطريقة الأسرع (أمر واحد)

```bash
# تحميل المشروع وتشغيل الإعداد
cd /var/www/vex
./scripts/docker-setup.sh
```

السكربت سيقوم بـ:
1. ✅ التحقق من تثبيت Docker
2. ✅ طلب بيانات قاعدة البيانات (اسم المستخدم، كلمة المرور، اسم القاعدة)
3. ✅ إنشاء ملف `.env` تلقائياً
4. ✅ بناء صور Docker
5. ✅ تشغيل قاعدة البيانات
6. ✅ دفع بقالب قاعدة البيانات
7. ✅ تشغيل التطبيق

---

## 3. التثبيت التفصيلي

### الخطوة 1: تحميل المشروع

```bash
cd /var/www
git clone https://your-repo-url.git vex
cd vex
```

### الخطوة 2: إنشاء ملف .env يدوياً (اختياري)

```bash
# نسخ ملف المثال
cp .env.example .env

# تعديل الملف
nano .env
```

محتوى الملف:

```env
# قاعدة البيانات
POSTGRES_USER=vex_user
POSTGRES_PASSWORD=كلمة_مرور_قوية_هنا
POSTGRES_DB=vex_db

# التطبيق
SESSION_SECRET=مفتاح_سري_عشوائي_32_حرف_على_الأقل
PORT=5000
NODE_ENV=production
```

### الخطوة 3: بناء الصور

```bash
docker compose build
```

### الخطوة 4: تشغيل قاعدة البيانات

```bash
# تشغيل قاعدة البيانات فقط
docker compose up -d db

# انتظار جاهزية القاعدة
sleep 10

# التحقق من الحالة
docker compose ps
```

### الخطوة 5: دفع بقالب قاعدة البيانات

```bash
# تحميل متغيرات البيئة
export $(cat .env | grep -v '^#' | xargs)
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"

# دفع البقالب
npm run db:push
```

### الخطوة 6: تشغيل التطبيق

```bash
docker compose up -d app
```

---

## 4. الأوامر المتاحة

استخدم سكربت `docker-run.sh` لإدارة المنصة:

```bash
./scripts/docker-run.sh [أمر]
```

### جدول الأوامر

| الأمر | الوصف |
|------|------|
| `start` | تشغيل جميع الخدمات |
| `stop` | إيقاف جميع الخدمات |
| `restart` | إعادة تشغيل جميع الخدمات |
| `logs` | عرض السجلات مباشرة |
| `status` | عرض حالة الخدمات |
| `build` | إعادة بناء الصور |
| `update` | تحديث وإعادة تشغيل |
| `backup` | نسخ احتياطي لقاعدة البيانات |
| `shell` | فتح shell في حاوية التطبيق |
| `db-shell` | فتح shell قاعدة البيانات |
| `clean` | حذف كل شيء (تحذير!) |

### أمثلة

```bash
# تشغيل المنصة
./scripts/docker-run.sh start

# عرض السجلات
./scripts/docker-run.sh logs

# إنشاء نسخة احتياطية
./scripts/docker-run.sh backup

# إيقاف المنصة
./scripts/docker-run.sh stop
```

---

## 5. إعداد SSL

### باستخدام Certbot (مستقل)

```bash
# تثبيت Certbot
sudo apt install -y certbot

# الحصول على شهادة
sudo certbot certonly --standalone -d yourdomain.com

# نسخ الشهادات
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem docker/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem docker/ssl/

# تعديل nginx.conf وإزالة التعليقات عن قسم HTTPS
nano docker/nginx.conf

# تشغيل مع Nginx
docker compose --profile with-nginx up -d
```

### تجديد تلقائي للشهادات

```bash
# إضافة مهمة cron
crontab -e

# أضف السطر التالي (تجديد كل يوم في الساعة 3 صباحاً)
0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/yourdomain.com/*.pem /var/www/vex/docker/ssl/ && docker compose restart nginx
```

---

## 6. النسخ الاحتياطي

### نسخ احتياطي يدوي

```bash
./scripts/docker-run.sh backup
```

### نسخ احتياطي تلقائي

```bash
# إنشاء مهمة cron
crontab -e

# نسخ احتياطي يومي في الساعة 2 صباحاً
0 2 * * * cd /var/www/vex && ./scripts/docker-run.sh backup
```

### استعادة النسخة الاحتياطية

```bash
# فك الضغط
gunzip backups/vex_backup_20260110.sql.gz

# استعادة
docker compose exec -T db psql -U vex_user -d vex_db < backups/vex_backup_20260110.sql
```

---

## 7. حل المشاكل

### المشكلة: فشل بناء Docker

**الحل:**
```bash
# تنظيف الكاش
docker system prune -a

# إعادة البناء
docker compose build --no-cache
```

### المشكلة: فشل الاتصال بقاعدة البيانات

**الحل:**
```bash
# التحقق من حالة قاعدة البيانات
docker compose ps db
docker compose logs db

# إعادة تشغيل قاعدة البيانات
docker compose restart db
```

### المشكلة: التطبيق لا يبدأ

**الحل:**
```bash
# عرض سجلات التطبيق
docker compose logs app

# فحص الأخطاء
docker compose exec app cat logs/err.log
```

### المشكلة: نفاد مساحة القرص

**الحل:**
```bash
# تنظيف الصور غير المستخدمة
docker image prune -a

# تنظيف الحاويات المتوقفة
docker container prune

# تنظيف الأحجام غير المستخدمة
docker volume prune
```

### المشكلة: بطء الأداء

**الحل:**
```bash
# التحقق من استخدام الموارد
docker stats

# زيادة موارد الحاوية في docker-compose.yml
# أضف تحت خدمة app:
deploy:
  resources:
    limits:
      memory: 2G
      cpus: '2'
```

---

## ملاحظات مهمة

1. **الأمان**:
   - لا تستخدم كلمات مرور ضعيفة
   - احفظ ملف `.env` بشكل آمن
   - استخدم SSL في الإنتاج

2. **الإنتاج**:
   - استخدم Nginx كوكيل عكسي
   - فعّل SSL/HTTPS
   - أعد النسخ الاحتياطي بانتظام

3. **المراقبة**:
   - راقب السجلات بانتظام
   - استخدم `docker stats` للمراقبة
   - أنشئ تنبيهات للأخطاء

---

تم إعداد هذا الدليل لمنصة VEX
VEX Platform Docker Documentation
