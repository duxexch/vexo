# البدء السريع - VEX Platform
# Quick Start Guide

---

## خطوات سريعة للتشغيل على VPS

### 1. تحميل وتثبيت المشروع

```bash
# الاتصال بالخادم
ssh root@your_server_ip

# تحديث النظام
apt update && apt upgrade -y

# تثبيت Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# تثبيت PostgreSQL
apt install -y postgresql postgresql-contrib

# تثبيت PM2 و Nginx
npm install -g pm2
apt install -y nginx certbot python3-certbot-nginx
```

### 2. إعداد قاعدة البيانات

```bash
sudo -u postgres psql

CREATE USER vex_user WITH PASSWORD 'كلمة_مرور_قوية';
CREATE DATABASE vex_db OWNER vex_user;
GRANT ALL PRIVILEGES ON DATABASE vex_db TO vex_user;
\q
```

### 3. إعداد المشروع

```bash
cd /var/www/vex

# نسخ ملف البيئة
cp .env.example .env

# تعديل الإعدادات
nano .env
# أضف:
# DATABASE_URL=postgresql://vex_user:كلمة_المرور@localhost:5432/vex_db
# SESSION_SECRET=مفتاح_سري_عشوائي

# تثبيت المتطلبات
npm install

# بناء المشروع
npm run build

# ترحيل قاعدة البيانات
npm run db:push
```

### 4. تشغيل المشروع

```bash
# تشغيل باستخدام PM2
pm2 start ecosystem.config.js --env production

# حفظ للتشغيل التلقائي
pm2 save
pm2 startup
```

### 5. إعداد Nginx و SSL

```bash
# إنشاء تكوين Nginx
nano /etc/nginx/sites-available/vex

# أضف التكوين المناسب (راجع الدليل الكامل)

# تفعيل الموقع
ln -s /etc/nginx/sites-available/vex /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# تثبيت SSL
certbot --nginx -d yourdomain.com
```

---

## أوامر مفيدة

| الأمر | الوصف |
|------|------|
| `pm2 status` | عرض حالة التطبيقات |
| `pm2 logs vex` | عرض السجلات |
| `pm2 restart vex` | إعادة تشغيل التطبيق |
| `pm2 stop vex` | إيقاف التطبيق |
| `pm2 monit` | مراقبة الأداء |

---

## روابط مهمة بعد التشغيل

- **الموقع الرئيسي**: https://yourdomain.com
- **لوحة الإدارة**: https://yourdomain.com/admin

### إنشاء حساب المسؤول الأول

عند تشغيل المشروع لأول مرة، سيتم إنشاء حساب مسؤول تلقائياً. للتحقق من بيانات الدخول، راجع سجلات التطبيق:

```bash
pm2 logs vex --lines 50
```

ابحث عن سطر يحتوي على "Default admin created" للحصول على بيانات الدخول.

أو أنشئ حساب مسؤول يدوياً:

```bash
# الدخول إلى قاعدة البيانات
psql -U vex_user -d vex_db

# إنشاء حساب مسؤول (غيّر كلمة المرور)
INSERT INTO users (username, password, role, status) 
VALUES ('admin', 'YOUR_HASHED_PASSWORD', 'admin', 'active');
```

**مهم**: استخدم bcrypt لتشفير كلمة المرور قبل إدخالها.

---

للمزيد من التفاصيل، راجع: `docs/DEPLOYMENT_GUIDE.md`
