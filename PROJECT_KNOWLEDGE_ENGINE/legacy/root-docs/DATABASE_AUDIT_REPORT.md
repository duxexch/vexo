# تقرير تدقيق قاعدة البيانات الشامل - منصة VEX

> **تاريخ التقرير:** 23 فبراير 2026  
> **قاعدة البيانات:** PostgreSQL (عبر Drizzle ORM)  
> **ملف السكيما:** `shared/schema.ts` (2898 سطر)  
> **ملف الهجرة:** `scripts/db-indexes-constraints.sql`  

---

## 1. جرد الجداول (106 جدول)

### 1.1 الجداول الأساسية (المستخدمين والحسابات)

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 1 | `users` | **62** | `varchar (UUID)` | جدول المستخدمين الرئيسي - يحتوي على بيانات الحساب والإحصائيات والأرصدة |
| 2 | `agents` | 18 | `varchar (UUID)` | الوكلاء المعالِجين للإيداعات والسحوبات |
| 3 | `affiliates` | 16 | `varchar (UUID)` | المسوقين بالعمولة وإحصائياتهم |
| 4 | `user_preferences` | 14 | `varchar (UUID)` | تفضيلات المستخدم (اللغة، الإشعارات، العملة) |
| 5 | `user_relationships` | 7 | `varchar (UUID)` | علاقات المستخدمين (صداقة، حظر) |
| 6 | `user_sessions` | 11 | `varchar (UUID)` | جلسات تسجيل الدخول النشطة |
| 7 | `login_history` | 9 | `varchar (UUID)` | سجل محاولات تسجيل الدخول |
| 8 | `password_reset_tokens` | 6 | `varchar (UUID)` | رموز إعادة تعيين كلمة المرور |
| 9 | `otp_verifications` | 10 | `varchar (UUID)` | رموز التحقق (OTP) |
| 10 | `challenger_follows` | 4 | `varchar (UUID)` | متابعات المتحدّين |

### 1.2 الألعاب والمباريات

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 11 | `multiplayer_games` | 28 | `varchar (UUID)` | تعريف الألعاب متعددة اللاعبين (شطرنج، طاولة، دومينو، طرنيب، بلوت) |
| 12 | `games` | 28 | `varchar (UUID)` | تعريف الألعاب الفردية (سلوتس، كراش، إلخ) |
| 13 | `game_sessions` | 12 | `varchar (UUID)` | جلسات الألعاب الفردية |
| 14 | `live_game_sessions` | 28 | `varchar (UUID)` | جلسات الألعاب الحية متعددة اللاعبين |
| 15 | `game_moves` | 11 | `varchar (UUID)` | حركات اللعب المسجلة |
| 16 | `game_spectators` | 6 | `varchar (UUID)` | المتفرجون على الألعاب |
| 17 | `game_chat_messages` | 7 | `varchar (UUID)` | رسائل الدردشة أثناء اللعب |
| 18 | `game_matches` | 9 | `varchar (UUID)` | مباريات الألعاب (matchmaking) |
| 19 | `matchmaking_queue` | 7 | `varchar (UUID)` | طابور المطابقة للاعبين |
| 20 | `game_sections` | 10 | `varchar (UUID)` | أقسام الألعاب القابلة للتخصيص |

### 1.3 نظام التحديات

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 21 | `challenges` | 24 | `varchar (UUID)` | التحديات بين اللاعبين |
| 22 | `challenge_game_sessions` | 15 | `varchar (UUID)` | جلسات الألعاب ضمن التحديات |
| 23 | `challenge_spectator_bets` | 10 | `varchar (UUID)` | رهانات المتفرجين على التحديات |
| 24 | `challenge_spectators` | 5 | `varchar (UUID)` | المتفرجون على التحديات |
| 25 | `challenge_ratings` | 12 | `varchar (UUID)` | تصنيفات اللاعبين في التحديات |
| 26 | `challenge_gifts` | 8 | `varchar (UUID)` | الهدايا المرسلة أثناء التحديات |
| 27 | `challenge_chat_messages` | 8 | `varchar (UUID)` | رسائل الدردشة في التحديات |
| 28 | `challenge_points_ledger` | 7 | `varchar (UUID)` | سجل النقاط في التحديات |
| 29 | `challenge_follows` | 5 | `varchar (UUID)` | متابعة التحديات |
| 30 | `challenge_follow_notifications` | 6 | `varchar (UUID)` | إشعارات متابعة التحديات |

### 1.4 حركات الألعاب المحددة

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 31 | `chess_moves` | 17 | `varchar (UUID)` | حركات الشطرنج |
| 32 | `domino_moves` | 11 | `varchar (UUID)` | حركات الدومينو |
| 33 | `backgammon_moves` | 12 | `varchar (UUID)` | حركات الطاولة (الباكجامون) |
| 34 | `card_game_plays` | 11 | `varchar (UUID)` | لعبات الورق (طرنيب/بلوت) |
| 35 | `card_game_bids` | 8 | `varchar (UUID)` | مزايدات ألعاب الورق |

### 1.5 المعاملات المالية

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 36 | `transactions` | 14 | `varchar (UUID)` | جميع المعاملات المالية |
| 37 | `deposit_requests` | 15 | `varchar (UUID)` | طلبات الإيداع |
| 38 | `financial_limits` | 16 | `varchar (UUID)` | حدود مالية حسب مستوى VIP |
| 39 | `currencies` | 9 | `varchar (UUID)` | العملات المدعومة |
| 40 | `country_payment_methods` | 13 | `varchar (UUID)` | طرق الدفع حسب الدولة |
| 41 | `agent_payment_methods` | 11 | `varchar (UUID)` | طرق دفع الوكلاء |

### 1.6 العملة الافتراضية (VEX Coin)

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 42 | `project_currency_settings` | 20 | `varchar (UUID)` | إعدادات العملة الافتراضية |
| 43 | `project_currency_wallets` | 11 | `varchar (UUID)` | محافظ العملة الافتراضية |
| 44 | `project_currency_conversions` | 13 | `varchar (UUID)` | طلبات التحويل |
| 45 | `project_currency_ledger` | 12 | `varchar (UUID)` | سجل عمليات العملة الافتراضية |

### 1.7 نظام P2P (التداول بين المستخدمين)

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 46 | `p2p_offers` | 18 | `varchar (UUID)` | عروض البيع والشراء |
| 47 | `p2p_trades` | 23 | `varchar (UUID)` | صفقات التداول |
| 48 | `p2p_escrow` | 8 | `varchar (UUID)` | الضمان (Escrow) |
| 49 | `p2p_disputes` | 14 | `varchar (UUID)` | نزاعات P2P |
| 50 | `p2p_dispute_messages` | 8 | `varchar (UUID)` | رسائل النزاعات |
| 51 | `p2p_dispute_evidence` | 13 | `varchar (UUID)` | أدلة النزاعات |
| 52 | `p2p_trade_messages` | 11 | `varchar (UUID)` | رسائل الصفقات |
| 53 | `p2p_transaction_logs` | 11 | `varchar (UUID)` | سجل عمليات P2P |
| 54 | `p2p_settings` | 13 | `varchar (UUID)` | إعدادات P2P |
| 55 | `p2p_trader_profiles` | 16 | `varchar (UUID)` | ملفات المتداولين |
| 56 | `p2p_trader_metrics` | 25 | `varchar (UUID)` | مقاييس أداء المتداولين |
| 57 | `p2p_badge_definitions` | 17 | `varchar (UUID)` | تعريفات شارات P2P |
| 58 | `p2p_trader_badges` | 6 | `varchar (UUID)` | شارات المتداولين |
| 59 | `p2p_trader_ratings` | 7 | `varchar (UUID)` | تقييمات المتداولين |
| 60 | `p2p_trader_payment_methods` | 12 | `varchar (UUID)` | طرق دفع المتداولين |
| 61 | `p2p_prewritten_responses` | 10 | `varchar (UUID)` | ردود جاهزة مكتوبة مسبقاً |
| 62 | `p2p_dispute_rules` | 11 | `varchar (UUID)` | قواعد النزاعات |

### 1.8 نظام الدعم والمشاهدة (ادعم واربح)

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 63 | `support_settings` | 16 | `varchar (UUID)` | إعدادات نظام الدعم |
| 64 | `spectator_supports` | 16 | `varchar (UUID)` | دعم المتفرجين للاعبين |
| 65 | `matched_supports` | 10 | `varchar (UUID)` | الأدعمة المتطابقة |

### 1.9 الهدايا والانجازات

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 66 | `gift_catalog` | 13 | `varchar (UUID)` | كتالوج الهدايا (للتحديات) |
| 67 | `gift_items` | 12 | `varchar (UUID)` | عناصر الهدايا (للمشاهدة الحية) |
| 68 | `user_gift_inventory` | 6 | `varchar (UUID)` | مخزون هدايا المستخدم |
| 69 | `spectator_gifts` | 10 | `varchar (UUID)` | الهدايا المرسلة من المتفرجين |
| 70 | `badge_catalog` | 14 | `varchar (UUID)` | كتالوج الشارات العامة |
| 71 | `user_badges` | 4 | `varchar (UUID)` | شارات المستخدمين |
| 72 | `achievements` | 15 | `varchar (UUID)` | تعريفات الإنجازات |
| 73 | `user_achievements` | 8 | `varchar (UUID)` | إنجازات المستخدمين وتقدمهم |

### 1.10 المواسم والتصنيفات

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 74 | `seasons` | 11 | `varchar (UUID)` | المواسم التنافسية |
| 75 | `seasonal_stats` | 24 | `varchar (UUID)` | إحصائيات المواسم |
| 76 | `season_rewards` | 8 | `varchar (UUID)` | مكافآت المواسم |

### 1.11 الشكاوى والدعم

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 77 | `complaints` | 19 | `varchar (UUID)` | شكاوى المستخدمين |
| 78 | `complaint_messages` | 6 | `varchar (UUID)` | رسائل الشكاوى |
| 79 | `complaint_attachments` | 8 | `varchar (UUID)` | مرفقات الشكاوى |
| 80 | `support_contacts` | 9 | `varchar (UUID)` | جهات اتصال الدعم |

### 1.12 الإشعارات والتواصل

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 81 | `notifications` | 13 | `varchar (UUID)` | إشعارات المستخدمين |
| 82 | `announcements` | 17 | `varchar (UUID)` | الإعلانات العامة |
| 83 | `announcement_views` | 4 | `varchar (UUID)` | مشاهدات الإعلانات |
| 84 | `broadcast_notifications` | 10 | `varchar (UUID)` | إشعارات جماعية |
| 85 | `admin_alerts` | 15 | `varchar (UUID)` | تنبيهات الإدارة |
| 86 | `chat_messages` | 12 | `varchar (UUID)` | رسائل الدردشة الخاصة |

### 1.13 الإعدادات والتكوين

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 87 | `system_config` | 5 | `text (key)` | إعدادات النظام (مفتاح/قيمة) مع إصدار |
| 88 | `system_settings` | 9 | `varchar (UUID)` | إعدادات النظام العامة |
| 89 | `app_settings` | 7 | `varchar (UUID)` | إعدادات التطبيق |
| 90 | `chat_settings` | 5 | `varchar (UUID)` | إعدادات الدردشة |
| 91 | `gameplay_settings` | 7 | `varchar (UUID)` | إعدادات اللعب |
| 92 | `feature_flags` | 13 | `varchar (UUID)` | أعلام الميزات |
| 93 | `login_method_configs` | 9 | `varchar (UUID)` | تكوين طرق تسجيل الدخول |
| 94 | `scheduled_config_changes` | 11 | `varchar (UUID)` | تغييرات الإعدادات المجدولة |

### 1.14 المظهر والمحتوى

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 95 | `themes` | 14 | `varchar (UUID)` | السمات/المظاهر |
| 96 | `languages` | 7 | `varchar (UUID)` | اللغات المدعومة |
| 97 | `managed_languages` | 10 | `varchar (UUID)` | اللغات المُدارة مع الترجمات |
| 98 | `advertisements` | 15 | `varchar (UUID)` | الإعلانات (كاروسيل) |
| 99 | `social_platforms` | 25 | `varchar (UUID)` | منصات التواصل الاجتماعي (OAuth/OTP) |
| 100 | `promo_codes` | 14 | `varchar (UUID)` | رموز العروض الترويجية |
| 101 | `promo_code_usages` | 6 | `varchar (UUID)` | استخدامات الرموز الترويجية |
| 102 | `link_analytics` | 13 | `varchar (UUID)` | تحليلات الروابط |

### 1.15 سجلات التدقيق

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 103 | `audit_logs` | 9 | `varchar (UUID)` | سجلات التدقيق العامة |
| 104 | `admin_audit_logs` | 12 | `varchar (UUID)` | سجلات تدقيق الإدارة |

### 1.16 اللعب والإيموجي

| # | اسم الجدول | عدد الأعمدة | نوع المفتاح الأساسي | الغرض |
|---|-----------|-------------|---------------------|-------|
| 105 | `gameplay_emojis` | 9 | `varchar (UUID)` | إيموجي مدفوعة أثناء اللعب |
| 106 | `gameplay_messages` | 8 | `varchar (UUID)` | رسائل أثناء اللعب |

---

## 2. الفهارس (Indexes)

### 2.1 الفهارس المعرّفة في السكيما (schema.ts)

| الجدول | اسم الفهرس | الأعمدة | النوع |
|--------|-----------|---------|-------|
| `users` | `idx_users_role` | `role` | عادي |
| `users` | `idx_users_status` | `status` | عادي |
| `users` | `idx_users_referred_by` | `referred_by` | عادي |
| `users` | `idx_users_games_won` | `games_won` | عادي |
| `users` | `idx_users_total_earnings` | `total_earnings` | عادي |
| `users` | `idx_users_longest_win_streak` | `longest_win_streak` | عادي |
| `users` | `idx_users_chess_won` | `chess_won` | عادي |
| `users` | `idx_users_backgammon_won` | `backgammon_won` | عادي |
| `users` | `idx_users_domino_won` | `domino_won` | عادي |
| `users` | `idx_users_tarneeb_won` | `tarneeb_won` | عادي |
| `users` | `idx_users_baloot_won` | `baloot_won` | عادي |
| `otp_verifications` | `idx_otp_user_id` | `user_id` | عادي |
| `otp_verifications` | `idx_otp_expires_at` | `expires_at` | عادي |
| `agents` | `idx_agents_user_id` | `user_id` | فريد |
| `agents` | `idx_agents_is_active` | `is_active` | عادي |
| `agent_payment_methods` | `idx_agent_payment_methods_agent_id` | `agent_id` | عادي |
| `affiliates` | `idx_affiliates_user_id` | `user_id` | فريد |
| `affiliates` | `idx_affiliates_code` | `affiliate_code` | عادي |
| `promo_codes` | `idx_promo_codes_code`| `code` | عادي |
| `promo_codes` | `idx_promo_codes_affiliate_id` | `affiliate_id` | عادي |
| `promo_code_usages` | `idx_promo_code_usages_promo_code_id` | `promo_code_id` | عادي |
| `promo_code_usages` | `idx_promo_code_usages_user_id` | `user_id` | عادي |
| `link_analytics` | `idx_link_analytics_affiliate_id` | `affiliate_id` | عادي |
| `link_analytics` | `idx_link_analytics_clicked_at` | `clicked_at` | عادي |
| `multiplayer_games` | `idx_multiplayer_games_key` | `key` | عادي |
| `multiplayer_games` | `idx_multiplayer_games_is_active` | `is_active` | عادي |
| `multiplayer_games` | `idx_multiplayer_games_sort_order` | `sort_order` | عادي |
| `multiplayer_games` | `idx_multiplayer_games_category` | `category` | عادي |
| `multiplayer_games` | `idx_multiplayer_games_status` | `status` | عادي |
| `scheduled_config_changes` | `idx_scheduled_changes_game_id` | `game_id` | عادي |
| `scheduled_config_changes` | `idx_scheduled_changes_status` | `status` | عادي |
| `scheduled_config_changes` | `idx_scheduled_changes_scheduled_at` | `scheduled_at` | عادي |
| `games` | `idx_games_status` | `status` | عادي |
| `games` | `idx_games_category` | `category` | عادي |
| `games` | `idx_games_game_type` | `game_type` | عادي |
| `game_sessions` | `idx_game_sessions_user_id` | `user_id` | عادي |
| `game_sessions` | `idx_game_sessions_game_id` | `game_id` | عادي |
| `game_sessions` | `idx_game_sessions_created_at` | `created_at` | عادي |
| `transactions` | `idx_transactions_user_id` | `user_id` | عادي |
| `transactions` | `idx_transactions_type` | `type` | عادي |
| `transactions` | `idx_transactions_status` | `status` | عادي |
| `transactions` | `idx_transactions_created_at` | `created_at` | عادي |
| `complaints` | `idx_complaints_user_id` | `user_id` | عادي |
| `complaints` | `idx_complaints_assigned_agent_id` | `assigned_agent_id` | عادي |
| `complaints` | `idx_complaints_status` | `status` | عادي |
| `complaints` | `idx_complaints_priority` | `priority` | عادي |
| `complaint_messages` | `idx_complaint_messages_complaint_id` | `complaint_id` | عادي |
| `complaint_attachments` | `idx_complaint_attachments_complaint_id` | `complaint_id` | عادي |
| `audit_logs` | `idx_audit_logs_user_id` | `user_id` | عادي |
| `audit_logs` | `idx_audit_logs_action` | `action` | عادي |
| `audit_logs` | `idx_audit_logs_created_at` | `created_at` | عادي |
| `password_reset_tokens` | `idx_password_reset_tokens_user_id` | `user_id` | عادي |
| `password_reset_tokens` | `idx_password_reset_tokens_token` | `token` | عادي |
| `deposit_requests` | `idx_deposit_requests_user_id` | `user_id` | عادي |
| `deposit_requests` | `idx_deposit_requests_agent_id` | `assigned_agent_id` | عادي |
| `deposit_requests` | `idx_deposit_requests_status` | `status` | عادي |
| `country_payment_methods` | `idx_country_payment_methods_country` | `country_code` | عادي |
| `feature_flags` | `idx_feature_flags_key` | `key` | عادي |
| `feature_flags` | `idx_feature_flags_category` | `category` | عادي |
| `admin_audit_logs` | `idx_admin_audit_logs_admin` | `admin_id` | عادي |
| `admin_audit_logs` | `idx_admin_audit_logs_action` | `action` | عادي |
| `admin_audit_logs` | `idx_admin_audit_logs_created_at` | `created_at` | عادي |
| `p2p_offers` | `idx_p2p_offers_user_id` | `user_id` | عادي |
| `p2p_offers` | `idx_p2p_offers_type` | `type` | عادي |
| `p2p_offers` | `idx_p2p_offers_status` | `status` | عادي |
| `p2p_trades` | `idx_p2p_trades_offer_id` | `offer_id` | عادي |
| `p2p_trades` | `idx_p2p_trades_buyer_id` | `buyer_id` | عادي |
| `p2p_trades` | `idx_p2p_trades_seller_id` | `seller_id` | عادي |
| `p2p_trades` | `idx_p2p_trades_status` | `status` | عادي |
| `p2p_escrow` | `idx_p2p_escrow_trade_id` | `trade_id` | عادي |
| `p2p_disputes` | `idx_p2p_disputes_trade_id` | `trade_id` | عادي |
| `p2p_disputes` | `idx_p2p_disputes_status` | `status` | عادي |
| `p2p_transaction_logs` | `idx_p2p_transaction_logs_trade_id` | `trade_id` | عادي |
| `p2p_transaction_logs` | `idx_p2p_transaction_logs_dispute_id` | `dispute_id` | عادي |
| `p2p_transaction_logs` | `idx_p2p_transaction_logs_created_at` | `created_at` | عادي |
| `p2p_dispute_messages` | `idx_p2p_dispute_messages_dispute_id` | `dispute_id` | عادي |
| `p2p_dispute_messages` | `idx_p2p_dispute_messages_sender_id` | `sender_id` | عادي |
| `p2p_trade_messages` | `idx_p2p_trade_messages_trade_id` | `trade_id` | عادي |
| `p2p_trade_messages` | `idx_p2p_trade_messages_sender_id` | `sender_id` | عادي |
| `p2p_trade_messages` | `idx_p2p_trade_messages_created_at` | `created_at` | عادي |
| `p2p_dispute_evidence` | `idx_p2p_dispute_evidence_dispute_id` | `dispute_id` | عادي |
| `p2p_dispute_evidence` | `idx_p2p_dispute_evidence_uploader_id` | `uploader_id` | عادي |
| `p2p_prewritten_responses` | `idx_p2p_prewritten_responses_category` | `category` | عادي |
| `p2p_dispute_rules` | `idx_p2p_dispute_rules_category` | `category` | عادي |
| `p2p_trader_profiles` | `idx_p2p_trader_profiles_user_id` | `user_id` | عادي |
| `p2p_trader_profiles` | `idx_p2p_trader_profiles_verification` | `verification_level` | عادي |
| `p2p_trader_metrics` | `idx_p2p_trader_metrics_user_id` | `user_id` | عادي |
| `p2p_trader_metrics` | `idx_p2p_trader_metrics_completion_rate` | `completion_rate` | عادي |
| `p2p_trader_metrics` | `idx_p2p_trader_metrics_total_trades` | `total_trades` | عادي |
| `p2p_trader_badges` | `idx_p2p_trader_badges_user_id` | `user_id` | عادي |
| `p2p_trader_badges` | `idx_p2p_trader_badges_slug` | `badge_slug` | عادي |
| `p2p_trader_ratings` | `idx_p2p_trader_ratings_trade_id` | `trade_id` | عادي |
| `p2p_trader_ratings` | `idx_p2p_trader_ratings_rated_user` | `rated_user_id` | عادي |
| `p2p_trader_payment_methods` | `idx_p2p_trader_payment_methods_user_id` | `user_id` | عادي |
| `notifications` | `idx_notifications_user_id` | `user_id` | عادي |
| `notifications` | `idx_notifications_is_read` | `is_read` | عادي |
| `notifications` | `idx_notifications_type` | `type` | عادي |
| `user_sessions` | `idx_user_sessions_user_id` | `user_id` | عادي |
| `user_sessions` | `idx_user_sessions_token` | `session_token` | عادي |
| `user_sessions` | `idx_user_sessions_is_active` | `is_active` | عادي |
| `login_history` | `idx_login_history_user_id` | `user_id` | عادي |
| `login_history` | `idx_login_history_created_at` | `created_at` | عادي |
| `announcements` | `idx_announcements_status` | `status` | عادي |
| `announcements` | `idx_announcements_target` | `target` | عادي |
| `announcements` | `idx_announcements_published_at` | `published_at` | عادي |
| `announcement_views` | `idx_announcement_views_announcement_id` | `announcement_id` | عادي |
| `announcement_views` | `idx_announcement_views_user_id` | `user_id` | عادي |
| `user_preferences` | `idx_user_preferences_user_id` | `user_id` | عادي |
| `challenger_follows` | `idx_challenger_follows_follower` | `follower_id` | عادي |
| `challenger_follows` | `idx_challenger_follows_followed` | `followed_id` | عادي |
| `challenges` | `idx_challenges_player1` → `idx_challenges_player4` | `player1_id` → `player4_id` | عادي |
| `challenges` | `idx_challenges_status` | `status` | عادي |
| `challenges` | `idx_challenges_visibility` | `visibility` | عادي |
| `challenge_spectator_bets` | `idx_spectator_bets_challenge` | `challenge_id` | عادي |
| `challenge_spectator_bets` | `idx_spectator_bets_spectator` | `spectator_id` | عادي |
| `challenge_ratings` | `idx_challenge_ratings_user` | `user_id` | عادي |
| `challenge_ratings` | `idx_challenge_ratings_rank` | `rank` | عادي |
| وعشرات أخرى... | | | |

### 2.2 الفهارس الإضافية في ملف الهجرة (SQL Migration)

هذه الفهارس مُعرَّفة فقط في `db-indexes-constraints.sql` وليست في السكيما:

| الجدول | اسم الفهرس | الأعمدة | ملاحظة |
|--------|-----------|---------|--------|
| `live_game_sessions` | `idx_live_game_sessions_player2` | `player2_id` (partial) | WHERE player2_id IS NOT NULL |
| `live_game_sessions` | `idx_live_game_sessions_player3` | `player3_id` (partial) | WHERE player3_id IS NOT NULL |
| `live_game_sessions` | `idx_live_game_sessions_player4` | `player4_id` (partial) | WHERE player4_id IS NOT NULL |
| `live_game_sessions` | `idx_live_game_sessions_winner` | `winner_id` (partial) | WHERE winner_id IS NOT NULL |
| `live_game_sessions` | `idx_live_game_sessions_status` | `status` | مكرر مع السكيما! |
| `live_game_sessions` | `idx_live_game_sessions_challenge` | `challenge_id` (partial) | WHERE challenge_id IS NOT NULL |
| `notifications` | `idx_notifications_user_read` | `(user_id, is_read, created_at DESC)` | مركّب ممتاز |
| `challenges` | `idx_challenges_game_type` | `game_type` | ✅ |
| `challenges` | `idx_challenges_winner` | `winner_id` (partial) | WHERE winner_id IS NOT NULL |
| `spectator_supports` | `idx_spectator_supports_session` | `session_id` | ✅ |
| `spectator_supports` | `idx_spectator_supports_status` | `status` | مكرر |
| `matched_supports` | `idx_matched_supports_winner` | `winner_id` (partial) | ✅ |
| `matched_supports` | `idx_matched_supports_winner_support` | `winner_support_id` (partial) | ✅ |
| `transactions` | `idx_transactions_processed_by` | `processed_by` (partial) | ✅ |
| `complaints` | `idx_complaints_transaction` | `transaction_id` (partial) | ✅ |
| `complaints` | `idx_complaints_escalated` | `escalated_to` (partial) | ✅ |
| `p2p_disputes` | `idx_p2p_disputes_initiator` | `initiator_id` | ✅ |
| `p2p_disputes` | `idx_p2p_disputes_respondent` | `respondent_id` | ✅ |
| `game_matches` | `idx_game_matches_winner` | `winner_id` (partial) | ✅ |
| `challenge_spectator_bets` | `idx_challenge_spectator_bets_backed` | `backed_player_id` | ✅ |
| `challenge_game_sessions` | `idx_challenge_game_sessions_winner` | `winner_id` (partial) | ✅ |
| `game_moves` | `idx_game_moves_session` | `(session_id, move_number)` | مركّب |
| `game_spectators` | `idx_game_spectators_session` | `session_id` | مكرر |
| `project_currency_wallets` | `idx_project_currency_wallets_user` | `user_id` | مكرر |
| `project_currency_ledger` | `idx_project_currency_ledger_wallet` | `wallet_id` | مكرر |

### 2.3 ⚠️ الفهارس المفقودة (مطلوب إضافتها)

| الجدول | العمود (FK) | السبب | الأولوية |
|--------|------------|-------|---------|
| `promo_code_usages` | `transaction_id` | FK بدون فهرس - JOIN متكرر | 🔴 عالية |
| `link_analytics` | `registered_user_id` | FK بدون فهرس | 🟡 متوسطة |
| `system_config` | `updated_by` | FK بدون فهرس | 🟢 منخفضة |
| `system_settings` | `updated_by` | FK بدون فهرس | 🟢 منخفضة |
| `scheduled_config_changes` | `created_by` | FK بدون فهرس | 🟡 متوسطة |
| `games` | `created_by` | FK بدون فهرس | 🟢 منخفضة |
| `complaint_messages` | `sender_id` | FK بدون فهرس - بحث متكرر | 🟡 متوسطة |
| `complaint_attachments` | `uploaded_by` | FK بدون فهرس | 🟢 منخفضة |
| `country_payment_methods` | `currency_id` | FK بدون فهرس | 🟡 متوسطة |
| `feature_flags` | `updated_by` | FK بدون فهرس | 🟢 منخفضة |
| `p2p_disputes` | `resolved_by` | FK بدون فهرس | 🟡 متوسطة |
| `p2p_disputes` | `winner_user_id` | FK بدون فهرس | 🟡 متوسطة |
| `p2p_transaction_logs` | `user_id` | FK بدون فهرس - سجل عمليات | 🔴 عالية |
| `p2p_dispute_evidence` | `verified_by` | FK بدون فهرس | 🟢 منخفضة |
| `p2p_trader_ratings` | `rater_id` | FK بدون فهرس - منع التكرار | 🟡 متوسطة |
| `announcements` | `created_by` | FK بدون فهرس | 🟢 منخفضة |
| `challenge_follow_notifications` | `challenger_id` | FK بدون فهرس | 🟡 متوسطة |
| `challenge_gifts` | `gift_id` | FK بدون فهرس | 🟡 متوسطة |
| `challenge_game_sessions` | `current_turn` | FK بدون فهرس | 🟡 متوسطة |
| `card_game_bids` | `player_id` | FK بدون فهرس | 🟡 متوسطة |
| `app_settings` | `updated_by` | FK بدون فهرس | 🟢 منخفضة |
| `login_method_configs` | `updated_by` | FK بدون فهرس | 🟢 منخفضة |
| `chat_settings` | `updated_by` | FK بدون فهرس | 🟢 منخفضة |
| `gameplay_settings` | `updated_by` | FK بدون فهرس | 🟢 منخفضة |
| `gameplay_messages` | `emoji_id` | FK بدون فهرس | 🟡 متوسطة |
| `admin_alerts` | `read_by` | FK بدون فهرس | 🟢 منخفضة |
| `advertisements` | `created_by` | FK بدون فهرس | 🟢 منخفضة |
| `broadcast_notifications` | `sent_by` | FK بدون فهرس | 🟢 منخفضة |
| `live_game_sessions` | `current_turn` | FK بدون فهرس - استعلام متكرر | 🔴 عالية |
| `spectator_gifts` | `gift_item_id` | FK بدون فهرس | 🟡 متوسطة |
| `spectator_supports` | `session_id` | FK بدون فهرس (مضاف في SQL فقط) | 🔴 عالية |
| `project_currency_conversions` | `approved_by_id` | FK بدون فهرس | 🟡 متوسطة |

### 2.4 فهارس مركّبة مفقودة (Composite Indexes)

| الجدول | الفهرس المقترح | سبب الحاجة |
|--------|---------------|------------|
| `transactions` | `(user_id, type, created_at DESC)` | استعلام "معاملات مستخدم حسب النوع" شائع جداً |
| `transactions` | `(user_id, status)` | تصفية المعاملات المعلقة لمستخدم |
| `game_sessions` | `(user_id, game_id, created_at DESC)` | تاريخ لعب مستخدم بلعبة معينة |
| `challenges` | `(status, game_type, created_at DESC)` | البحث عن تحديات متاحة |
| `challenges` | `(player1_id, status)` | تحديات اللاعب النشطة |
| `chat_messages` | `(sender_id, receiver_id, created_at DESC)` | محادثة بين مستخدمَين |
| `p2p_offers` | `(status, type, crypto_currency)` | البحث عن عروض نشطة |
| `p2p_trades` | `(buyer_id, status)` أو `(seller_id, status)` | صفقات المستخدم النشطة |
| `user_sessions` | `(user_id, is_active, expires_at)` | التحقق من الجلسات النشطة |
| `deposit_requests` | `(user_id, status, created_at DESC)` | طلبات الإيداع المعلقة |
| `spectator_supports` | `(challenge_id, status)` | الأدعمة المعلقة لتحدي |
| `announcement_views` | `(announcement_id, user_id)` | UNIQUE لمنع التكرار |
| `login_history` | `(user_id, created_at DESC)` | آخر تسجيل دخول |

---

## 3. العلاقات (Relations)

### 3.1 خريطة المفاتيح الأجنبية (Foreign Keys)

#### الجدول المركزي: `users` (مرجع من 70+ FK)

```
users ←── agents.user_id
users ←── affiliates.user_id
users ←── otp_verifications.user_id (CASCADE)
users ←── transactions.user_id
users ←── game_sessions.user_id
users ←── complaints.user_id
users ←── complaint_messages.sender_id
users ←── complaint_attachments.uploaded_by
users ←── audit_logs.user_id
users ←── admin_audit_logs.admin_id
users ←── notifications.user_id
users ←── user_sessions.user_id
users ←── login_history.user_id
users ←── password_reset_tokens.user_id
users ←── deposit_requests.user_id
users ←── announcements.created_by
users ←── announcement_views.user_id
users ←── user_preferences.user_id
users ←── challenges.player1_id/player2_id/player3_id/player4_id/winner_id
users ←── challenge_spectator_bets.spectator_id/backed_player_id
users ←── challenge_ratings.user_id
users ←── p2p_offers.user_id
users ←── p2p_trades.buyer_id/seller_id
users ←── p2p_disputes.initiator_id/respondent_id/resolved_by/winner_user_id
users ←── chat_messages.sender_id/receiver_id
users ←── user_relationships.user_id/target_user_id
users ←── user_badges.user_id
users ←── live_game_sessions.player1_id/.../player4_id/winner_id/current_turn
users ←── game_moves.player_id
users ←── game_spectators.user_id
users ←── spectator_gifts.sender_id/recipient_id
users ←── game_chat_messages.user_id
users ←── user_achievements.user_id
users ←── seasonal_stats.user_id
users ←── project_currency_wallets.user_id
users ←── project_currency_conversions.user_id/approved_by_id
users ←── project_currency_ledger.user_id
users ←── spectator_supports.supporter_id/supported_player_id
users ←── matched_supports.winner_id
users ←── p2p_trader_profiles.user_id
users ←── p2p_trader_metrics.user_id
users ←── p2p_trader_badges.user_id
users ←── p2p_trader_ratings.rater_id/rated_user_id
users ←── p2p_trader_payment_methods.user_id
users ←── challenger_follows.follower_id/followed_id
users ←── challenge_follows.follower_id/followed_id
users ←── challenge_follow_notifications.follower_id/challenger_id
users ←── challenge_game_sessions.current_turn/winner_id
users ←── chess_moves.player_id
users ←── domino_moves.player_id
users ←── backgammon_moves.player_id
users ←── card_game_plays.player_id
users ←── card_game_bids.player_id
users ←── challenge_chat_messages.sender_id
users ←── challenge_points_ledger.user_id/target_player_id
users ←── challenge_gifts.sender_id/recipient_id
users ←── challenge_spectators.user_id
users ←── matchmaking_queue.user_id
users ←── game_matches.player1_id/player2_id/winner_id
users ←── gameplay_messages.sender_id
users ←── user_gift_inventory.user_id
users ←── broadcast_notifications.sent_by
users ←── admin_alerts.read_by
users ←── advertisements.created_by
users ←── p2p_dispute_evidence.uploader_id/verified_by
users ←── p2p_dispute_messages.sender_id
users ←── p2p_trade_messages.sender_id
users ←── system_config.updated_by
users ←── scheduled_config_changes.created_by
users ←── feature_flags.updated_by
users ←── system_settings.updated_by
users ←── complaints.escalated_to
users ←── link_analytics.registered_user_id
users ←── users.referred_by (ذاتي)
```

#### سلسلة العلاقات الهرمية:
```
users → agents → agent_payment_methods
users → affiliates → promo_codes → promo_code_usages
users → affiliates → link_analytics
games → game_sessions
games → matchmaking_queue
games → game_matches → gameplay_messages
games → live_game_sessions → game_moves
                           → game_spectators
                           → spectator_gifts
                           → game_chat_messages
challenges → challenge_game_sessions → chess_moves/domino_moves/backgammon_moves/card_game_plays/card_game_bids
           → challenge_spectator_bets
           → challenge_spectators
           → challenge_gifts
           → challenge_chat_messages (عبر session)
           → challenge_points_ledger
           → spectator_supports → matched_supports
           → live_game_sessions
p2p_offers → p2p_trades → p2p_escrow
                        → p2p_disputes → p2p_dispute_messages
                                       → p2p_dispute_evidence
                        → p2p_trade_messages
                        → p2p_transaction_logs
                        → p2p_trader_ratings
complaints → complaint_messages
           → complaint_attachments
seasons → seasonal_stats
        → season_rewards
achievements → user_achievements
badge_catalog → user_badges
gift_catalog → user_gift_inventory
             → challenge_gifts
gift_items → spectator_gifts
project_currency_wallets → project_currency_ledger
```

### 3.2 ⚠️ مرجع ذاتي (Self-Reference)
| الجدول | العمود | الوصف |
|--------|--------|-------|
| `users` | `referred_by` → `users.id` | نظام الإحالة |

### 3.3 ⚠️ جداول يتيمة (لا يُشار إليها بمفتاح أجنبي)

| الجدول | الملاحظة |
|--------|---------|
| `financial_limits` | لا يرتبط بأي جدول - يجب أن يرتبط بـ `users.vip_level` أو يُستخدم عبر التطبيق |
| `languages` | جدول إعداد بدون FK يشير إليه |
| `managed_languages` | مكرر مع `languages` - لماذا جدولان للغات؟ |
| `themes` | جدول إعداد |
| `support_contacts` | جدول إعداد |
| `p2p_prewritten_responses` | يُشار إليه بنص عبر `prewritten_template_id` لكن بدون FK حقيقي |
| `p2p_dispute_rules` | جدول إعداد |
| `p2p_settings` | إعداد مفرد (singleton) |
| `support_settings` | إعداد حسب نوع اللعبة |
| `project_currency_settings` | إعداد مفرد |
| `game_sections` | جدول إعداد |
| `social_platforms` | جدول إعداد |
| `gameplay_emojis` | يرتبط عبر `gameplay_messages.emoji_id` |

### 3.4 مراجع دائرية (Circular References)
| السلسلة | الوصف |
|---------|-------|
| `users` → `users` | `referred_by` مرجع ذاتي (مقبول) |
| `spectator_supports` → `matched_supports` → `spectator_supports` | `matched_support_id` نص عادي و `support1_id`/`support2_id` FK - دائري غير مباشر |

---

## 4. مشاكل تكامل البيانات

### 4.1 ⚠️ قيود NOT NULL مفقودة

| الجدول | العمود | المشكلة |
|--------|--------|---------|
| `users` | `email` | يمكن أن يكون `NULL` - معظم المنصات تتطلب بريد إلكتروني |
| `users` | `accountId` | يمكن أن يكون `NULL` - يُستخدم كمُعرّف حساب فريد |
| `users` | `firstName`, `lastName` | يمكن أن يكونا `NULL` |
| `complaints` | `rating` | لا يوجد تحقق من النطاق عند الإدخال |
| `p2p_trades` | `expiresAt` | يمكن أن يكون `NULL` - خطر على الضمان |
| `challenge_game_sessions` | `gameState` | يمكن أن يكون `NULL` |
| `p2p_escrow` | `status` | يستخدم `text` بدلاً من enum - لا يوجد تحقق |
| `link_analytics` | `ipAddress` | يمكن أن يكون `NULL` |

### 4.2 ⚠️ قيود CHECK مفقودة

القيود الموجودة في ملف الهجرة SQL:
- ✅ `users.balance >= 0`
- ✅ `users.total_deposited >= 0`
- ✅ `users.total_withdrawn >= 0`
- ✅ `agents.current_balance >= 0`
- ✅ `agents.daily_limit >= 0`
- ✅ `affiliates.total_commission_earned >= 0`
- ✅ `affiliates.pending_commission >= 0`
- ✅ `transactions.amount > 0`
- ✅ `challenges.bet_amount >= 0`
- ✅ `p2p_offers.price > 0`
- ✅ `p2p_offers.available_amount >= 0`
- ✅ `p2p_trades.amount > 0`
- ✅ `deposit_requests.amount > 0`
- ✅ `game_sessions.bet_amount >= 0`
- ✅ `spectator_supports.amount > 0`
- ✅ `gift_items.price >= 0`
- ✅ `project_currency_wallets.*_balance >= 0`

**القيود المفقودة التي يجب إضافتها:**

| الجدول | القيد المطلوب | السبب |
|--------|-------------|-------|
| `users` | `vip_level >= 0 AND vip_level <= 100` | منع قيم VIP غير منطقية |
| `users` | `games_played >= games_won + games_lost + games_draw` | تناسق الإحصائيات |
| `users` | `p2p_rating >= 0 AND p2p_rating <= 5` | تقييم ضمن النطاق |
| `users` | `total_wagered >= 0` | منع القيم السالبة |
| `users` | `total_won >= 0` | منع القيم السالبة |
| `complaints` | `rating >= 1 AND rating <= 5` | تقييم ضمن النطاق |
| `games` | `rtp >= 0 AND rtp <= 100` | نسبة العائد ضمن النطاق |
| `games` | `house_edge >= 0 AND house_edge <= 100` | هامش المنزل ضمن النطاق |
| `games` | `min_bet <= max_bet` | الحد الأدنى أقل من الأقصى |
| `multiplayerGames` | `min_stake <= max_stake` | الحد الأدنى أقل من الأقصى |
| `multiplayerGames` | `min_players <= max_players` | منطقي |
| `multiplayerGames` | `house_fee >= 0 AND house_fee <= 1` | نسبة العمولة |
| `agents` | `commission_rate_deposit >= 0 AND commission_rate_deposit <= 1` | نسبة صحيحة |
| `agents` | `performance_score >= 0 AND performance_score <= 100` | نطاق صحيح |
| `p2p_offers` | `min_limit <= max_limit` | حدود منطقية |
| `p2p_trader_ratings` | `rating >= 1 AND rating <= 5` | تقييم ضمن النطاق |
| `p2p_trader_metrics` | `overall_rating >= 0 AND overall_rating <= 5` | نطاق صحيح |
| `p2p_trader_metrics` | `completion_rate >= 0 AND completion_rate <= 100` | نسبة صحيحة |
| `spectator_supports` | `odds > 1` | الاحتمالات يجب أن تكون أكبر من 1 |
| `challenge_spectator_bets` | `bet_amount > 0` | مبلغ الرهان موجب |
| `gift_items` | `creator_share >= 0 AND creator_share <= 100` | نسبة صحيحة |
| `spectator_gifts` | `quantity > 0` | كمية موجبة |
| `seasons` | `start_date < end_date` | تاريخ البداية قبل النهاية |
| `season_rewards` | `rank_from <= rank_to` | ترتيب صحيح |
| `financial_limits` | `min_deposit <= max_deposit` | حدود منطقية |
| `financial_limits` | `min_withdrawal <= max_withdrawal` | حدود منطقية |
| `financial_limits` | `min_bet <= max_bet` | حدود منطقية |
| `project_currency_settings` | `exchange_rate > 0` | سعر صرف موجب |
| `support_settings` | `house_fee_percent >= 0 AND house_fee_percent <= 100` | نسبة صحيحة |

### 4.3 ⚠️ قيود UNIQUE مفقودة

| الجدول | الأعمدة | السبب |
|--------|---------|-------|
| `announcement_views` | `(announcement_id, user_id)` | منع تسجيل نفس المشاهدة مرتين |
| `challenger_follows` | `(follower_id, followed_id)` | منع المتابعة المزدوجة |
| `challenge_follows` | `(follower_id, followed_id)` | منع المتابعة المزدوجة |
| `challenge_spectators` | `(challenge_id, user_id)` | منع الانضمام المزدوج |
| `game_spectators` | `(session_id, user_id)` | منع الانضمام المزدوج |
| `p2p_trader_ratings` | `(trade_id, rater_id)` | منع التقييم المزدوج لنفس الصفقة |
| `user_gift_inventory` | `(user_id, gift_id)` | يجب تحديث الكمية بدلاً من إنشاء صف جديد |
| `challenge_follow_notifications` | `(follower_id, challenge_id)` | منع الإشعار المزدوج |
| `p2p_trader_badges` | `(user_id, badge_slug)` | منع الشارة المزدوجة |
| `financial_limits` | `vip_level` | مستوى VIP واحد لكل إعداد |

### 4.4 ⚠️ مشاكل دقة الأرقام العشرية

| الجدول | العمود | الدقة الحالية | المشكلة |
|--------|--------|-------------|---------|
| `users` | `p2p_rating` | `(3, 2)` | أقصى قيمة 9.99 - لا يكفي إذا كان التقييم من 10 |
| `challenges` | `bet_amount` | `(20, 8)` | دقة عالية جداً - 8 منازل عشرية لعملة عادية |
| `challenge_spectator_bets` | `bet_amount` | `(20, 8)` | نفس المشكلة |
| `challenge_ratings` | `total_earnings` | `(20, 8)` | 8 منازل عشرية غير ضرورية |
| `p2p_trades` | `amount` | `(15, 8)` | 8 منازل مناسبة للعملات الرقمية |
| `p2p_trades` | `fiat_amount` | `(15, 2)` | ✅ مناسبة |
| `p2p_escrow` | `amount` | `(15, 8)` | ✅ مناسبة للعملات الرقمية |
| `support_settings` | أوزان (weights) | `(5, 2)` | يجب أن يكون مجموعها = 1.0 - لا يوجد CHECK |

---

## 5. مشاكل تصميم السكيما

### 5.1 🔴 مشاكل عدم التطبيع (Denormalization)

#### مشكلة حرجة: إحصائيات مكررة في `users`

جدول `users` يحتوي على **62 عمود** منها **~25 عمود إحصائيات** يمكن حسابها من جداول أخرى:

| الأعمدة المكررة في `users` | المصدر الأصلي |
|---------------------------|-------------|
| `games_played`, `games_won`, `games_lost`, `games_draw` | يمكن حسابها من `challenges` + `game_sessions` |
| `chess_played`, `chess_won` | يمكن حسابها من `challenges WHERE game_type='chess'` |
| `backgammon_played`, `backgammon_won` | يمكن حسابها من `challenges WHERE game_type='backgammon'` |
| `domino_played`, `domino_won` | يمكن حسابها من `challenges WHERE game_type='domino'` |
| `tarneeb_played`, `tarneeb_won` | يمكن حسابها من `challenges WHERE game_type='tarneeb'` |
| `baloot_played`, `baloot_won` | يمكن حسابها من `challenges WHERE game_type='baloot'` |
| `current_win_streak`, `longest_win_streak` | يمكن حسابها من ترتيب المباريات |
| `total_deposited`, `total_withdrawn`, `total_wagered`, `total_won`, `total_earnings` | يمكن حسابها من `transactions` |
| `p2p_total_trades`, `p2p_successful_trades` | مكررة مع `p2p_trader_metrics` |

**نفس المشكلة في `seasonal_stats`:** نسخة كاملة من إحصائيات المستخدم مع فلترة حسب الموسم.

**خطر:** عدم تناسق البيانات إذا فشل تحديث الإحصائيات في عملية واحدة.

**التوصية:** استخدام Materialized Views أو حساب ذري (atomic increment) مع ضمان التناسق عبر transactions.

#### مشكلة: `challenge_ratings` مكرر مع `users`
- `challenge_ratings.wins/losses/draws` = نفس `users.games_won/games_lost/games_draw`
- `challenge_ratings.total_earnings` = نفس `users.total_earnings`

#### مشكلة: `p2p_trader_metrics` مكرر مع `users`
- `p2p_trader_metrics.total_trades` = نفس `users.p2p_total_trades`
- `p2p_trader_metrics.completed_trades` = نفس `users.p2p_successful_trades`

### 5.2 🔴 جداول واسعة جداً (Too Wide Tables)

| الجدول | عدد الأعمدة | التوصية |
|--------|------------|---------|
| `users` | **62** | تقسيم إلى: `users` (بيانات أساسية) + `user_stats` (إحصائيات) + `user_p2p_profile` (بيانات P2P) + `user_verification` (التحقق من الهوية) |
| `multiplayer_games` | 28 | مقبول لجدول إعدادات |
| `games` | 28 | مقبول لجدول إعدادات |
| `live_game_sessions` | 28 | يمكن فصل الأعمدة `player3/4_id` و `team_scores` لجدول خاص بالألعاب الرباعية |
| `p2p_trader_metrics` | 25 | يمكن فصل مقاييس 30 يوم إلى cache |
| `social_platforms` | 25 | يمكن تخزين الإعدادات المتغيرة في JSON |
| `challenges` | 24 | يمكن فصل players 3/4 لجدول `challenge_players` |
| `seasonal_stats` | 24 | يمكن تقليصها عبر إزالة التكرار |
| `p2p_trades` | 23 | الأعمدة `escrow_earned_amount`/`escrow_purchased_amount` يمكن نقلها لـ `p2p_escrow` |
| `project_currency_settings` | 20 | مقبول لجدول إعدادات مفرد |

### 5.3 ⚠️ قواعد الحذف التسلسلي المفقودة (Missing CASCADE)

**فقط جدولان يستخدمان `onDelete: "cascade"`:**
1. `otp_verifications.user_id` → `users.id` ✅
2. `scheduled_config_changes.game_id` → `multiplayer_games.id` ✅

**جداول تحتاج CASCADE بشدة:**

| الجدول | FK | السبب |
|--------|-----|-------|
| `complaint_messages` | `complaint_id` → `complaints.id` | حذف الشكوى يجب أن يحذف رسائلها |
| `complaint_attachments` | `complaint_id` → `complaints.id` | حذف الشكوى يجب أن يحذف مرفقاتها |
| `p2p_dispute_messages` | `dispute_id` → `p2p_disputes.id` | حذف النزاع يجب أن يحذف رسائله |
| `p2p_dispute_evidence` | `dispute_id` → `p2p_disputes.id` | حذف النزاع يجب أن يحذف أدلته |
| `p2p_trade_messages` | `trade_id` → `p2p_trades.id` | حذف الصفقة يجب أن يحذف رسائلها |
| `p2p_transaction_logs` | `trade_id` → `p2p_trades.id` | حذف الصفقة يجب أن يحذف سجلاتها |
| `challenge_game_sessions` | `challenge_id` → `challenges.id` | حذف التحدي يجب أن يحذف جلساته |
| `chess_moves` | `session_id` → `challenge_game_sessions.id` | حذف الجلسة يجب أن يحذف الحركات |
| `domino_moves` | `session_id` → `challenge_game_sessions.id` | نفس السبب |
| `backgammon_moves` | `session_id` → `challenge_game_sessions.id` | نفس السبب |
| `card_game_plays` | `session_id` → `challenge_game_sessions.id` | نفس السبب |
| `card_game_bids` | `session_id` → `challenge_game_sessions.id` | نفس السبب |
| `challenge_chat_messages` | `session_id` → `challenge_game_sessions.id` | نفس السبب |
| `game_moves` | `session_id` → `live_game_sessions.id` | حذف الجلسة يجب أن يحذف الحركات |
| `game_spectators` | `session_id` → `live_game_sessions.id` | حذف الجلسة يجب أن يحذف المتفرجين |
| `spectator_gifts` | `session_id` → `live_game_sessions.id` | حذف الجلسة يجب أن يحذف الهدايا |
| `game_chat_messages` | `session_id` → `live_game_sessions.id` | حذف الجلسة يجب أن يحذف الرسائل |
| `announcement_views` | `announcement_id` → `announcements.id` | حذف الإعلان يحذف المشاهدات |
| `season_rewards` | `season_id` → `seasons.id` | حذف الموسم يحذف المكافآت |
| `seasonal_stats` | `season_id` → `seasons.id` | حذف الموسم يحذف الإحصائيات |
| `project_currency_ledger` | `wallet_id` → `project_currency_wallets.id` | ربط محكم |
| `password_reset_tokens` | `user_id` → `users.id` | حذف المستخدم يحذف الرموز |
| `login_history` | `user_id` → `users.id` | حذف المستخدم يحذف السجل |
| `user_sessions` | `user_id` → `users.id` | حذف المستخدم يحذف الجلسات |
| `notifications` | `user_id` → `users.id` | حذف المستخدم يحذف إشعاراته |

> **ملاحظة:** يجب التحقق من أن منطق التطبيق لا يعتمد على بقاء السجلات بعد حذف الأب قبل إضافة CASCADE.

### 5.4 ⚠️ قيم Enum قد تكون ناقصة

| Enum | القيم الحالية | قيم مقترحة للإضافة |
|------|-------------|-------------------|
| `user_role` | `admin, agent, affiliate, player` | `moderator`, `support`, `vip_manager` |
| `transaction_type` | `deposit, withdrawal, stake, win, bonus, commission, refund, gift_sent, gift_received` | `p2p_buy`, `p2p_sell`, `escrow_hold`, `escrow_release`, `currency_conversion`, `achievement_reward`, `season_reward` |
| `audit_action` | `login, logout, deposit, withdrawal, stake, win, complaint, settings_change, user_update, game_update` | `password_change`, `profile_update`, `p2p_trade`, `challenge_create`, `balance_adjust` |
| `complaint_category` | `financial, technical, account, game, other` | `p2p`, `security`, `abuse` |
| `game_status` | `active, listed, inactive, maintenance` | `beta`, `deprecated` |
| `notification_type` | `announcement, transaction, security, promotion, system, p2p, id_verification, success, warning` | `challenge`, `game_result`, `friend_request`, `achievement` |
| `admin_audit_action` | 17 قيمة | `deposit_approve`, `withdrawal_approve`, `game_create`, `currency_settings_update` |

### 5.5 ⚠️ جداول إعدادات مكررة

| المجموعة | الجداول | المشكلة |
|---------|--------|---------|
| إعدادات النظام | `system_config`, `system_settings`, `app_settings` | **3 جداول** لنفس الغرض تقريباً |
| اللغات | `languages`, `managed_languages` | **جدولان** للغات |
| إعدادات اللعب | `gameplay_settings`, `chat_settings` | يمكن دمجها مع `system_settings` |
| هدايا | `gift_catalog` (للتحديات), `gift_items` (للمشاهدة) | يمكن توحيدها في جدول واحد |
| متابعات | `challenger_follows`, `challenge_follows` | جدولان للمتابعات بهياكل متشابهة |

### 5.6 ⚠️ سجلات تدقيق مفقودة

| العملية | سجل التدقيق | الحالة |
|---------|------------|--------|
| تغييرات المستخدم | `audit_logs` + `admin_audit_logs` | ✅ موجود |
| العمليات المالية | `transactions` | ✅ موجود |
| عمليات P2P | `p2p_transaction_logs` | ✅ موجود |
| تغييرات إعدادات الألعاب | `scheduled_config_changes` | ✅ موجود |
| عملة VEX | `project_currency_ledger` | ✅ موجود |
| **تغييرات الأرصدة المباشرة** | ❌ **غير موجود** | يجب تسجيل كل تعديل رصيد |
| **تغييرات أسعار الصرف** | ❌ **غير موجود** | تاريخ أسعار الصرف |
| **تغييرات الإعدادات العامة** | ❌ **غير موجود** | `system_settings` بدون سجل تاريخي |
| **حذف السجلات** | ❌ **غير موجود** | لا يوجد Soft Delete في معظم الجداول |
| **تغييرات حالة المستخدم** | جزئي | `admin_audit_logs` يغطي `user_ban`/`user_suspend` فقط |

---

## 6. مخاوف الأداء

### 6.1 🔴 جداول ستكون ضخمة بدون فهرسة كافية

| الجدول | حجم متوقع | المشكلة |
|--------|----------|---------|
| `game_moves` | ملايين الصفوف | فهرس مركب `(session_id, move_number)` موجود في SQL فقط |
| `chess_moves` | مئات الآلاف | لا يوجد فهرس مركب `(session_id, move_number)` |
| `domino_moves` | مئات الآلاف | نفس المشكلة |
| `backgammon_moves` | مئات الآلاف | نفس المشكلة |
| `card_game_plays` | مئات الآلاف | نفس المشكلة |
| `notifications` | ملايين الصفوف | يحتاج فهرس مركب `(user_id, is_read, created_at)` (موجود في SQL فقط) |
| `chat_messages` | ملايين الصفوف | يحتاج فهرس مركب `(sender_id, receiver_id, created_at)` |
| `transactions` | ملايين الصفوف | يحتاج فهرس مركب `(user_id, type, created_at)` |
| `audit_logs` | ملايين الصفوف | يحتاج تقسيم (partitioning) حسب التاريخ |
| `admin_audit_logs` | مئات الآلاف | يحتاج فهرس مركب `(entity_type, entity_id)` |
| `login_history` | ملايين الصفوف | يحتاج تقسيم حسب التاريخ |
| `p2p_trade_messages` | مئات الآلاف | فهرس مركب `(trade_id, created_at)` غير موجود |
| `link_analytics` | مئات الآلاف | يحتاج تقسيم حسب التاريخ |
| `project_currency_ledger` | ملايين الصفوف | فهرسة جيدة ✅ |
| `spectator_supports` | مئات الآلاف | يحتاج فهرس `(challenge_id, supported_player_id, status)` |

### 6.2 ⚠️ مخاطر N+1 Query

| السيناريو | العلاقة | المشكلة |
|----------|---------|---------|
| عرض قائمة التحديات | `challenges` → `users` (4 لاعبين + فائز) | 5 استعلامات لكل تحدي |
| عرض لوحة الإدارة | `users` → `agents/affiliates` → إحصائيات | سلسلة joins |
| عرض صفقات P2P | `p2p_trades` → `p2p_offers` → `users` (بائع/مشتري) | 3 استعلامات لكل صفقة |
| عرض الجلسة الحية | `live_game_sessions` → `users` (4 لاعبين) → `game_moves` | استعلامات متكررة |
| إشعارات المستخدم | `notifications` → ربط مع entities مختلفة | لا يوجد JOIN مباشر |
| شكاوى + رسائل | `complaints` → `complaint_messages` → `users` | N+1 للمرسلين |
| عرض متجر الهدايا | `gift_catalog` → `user_gift_inventory` per user | استعلام لكل هدية |

**التوصية:** استخدام `with` في Drizzle ORM لتحميل العلاقات مسبقاً أو استخدام `dataloader` pattern.

### 6.3 ⚠️ فهارس مكررة بين Schema و SQL Migration

| الفهرس | في السكيما | في SQL | المشكلة |
|--------|-----------|--------|---------|
| `idx_live_sessions_status` / `idx_live_game_sessions_status` | ✅ | ✅ | **مكرر** |
| `idx_supports_status` / `idx_spectator_supports_status` | ✅ | ✅ | **مكرر** |
| `idx_spectators_session` / `idx_game_spectators_session` | ✅ | ✅ | **مكرر** |
| `idx_currency_wallets_user` / `idx_project_currency_wallets_user` | ✅ | ✅ | **مكرر** |
| `idx_currency_ledger_wallet` / `idx_project_currency_ledger_wallet` | ✅ | ✅ | **مكرر** |

> **ملاحظة:** الفهارس المكررة تستهلك مساحة تخزين وتبطئ عمليات الكتابة بدون فائدة.

### 6.4 استراتيجيات تقسيم مقترحة (Partitioning)

| الجدول | استراتيجية التقسيم | السبب |
|--------|-------------------|-------|
| `audit_logs` | Range بحسب `created_at` (شهري) | نمو سريع، استعلامات دائماً بتاريخ |
| `admin_audit_logs` | Range بحسب `created_at` (شهري) | نفس السبب |
| `login_history` | Range بحسب `created_at` (شهري) | نفس السبب |
| `notifications` | Range بحسب `created_at` (شهري) | حجم ضخم |
| `game_moves` | Range بحسب `created_at` (أسبوعي) | ملايين الصفوف |
| `link_analytics` | Range بحسب `clicked_at` (شهري) | تحليلات تراكمية |
| `transactions` | Range بحسب `created_at` (شهري) | جدول محوري ضخم |
| `p2p_transaction_logs` | Range بحسب `created_at` (شهري) | سجل تراكمي |

---

## 7. مخاوف أمنية 🔐

### 7.1 🔴 تخزين البيانات الحساسة

| الجدول | العمود | نوع البيانات | المخاطرة | التوصية |
|--------|--------|-------------|---------|---------|
| `users` | `password` | `text` | كلمة المرور - يجب hashing (bcrypt/argon2) | التأكد من أن التطبيق يقوم بالـ hash قبل التخزين |
| `users` | `withdrawal_password` | `text` | كلمة مرور السحب | يجب hash مثل كلمة المرور الرئيسية |
| `social_platforms` | `client_secret` | `text` | سر OAuth | 🔴 **يجب تشفيره (AES-256)** أو نقله لـ Vault |
| `social_platforms` | `api_secret` | `text` | سر API | 🔴 **يجب تشفيره** |
| `social_platforms` | `bot_token` | `text` | رمز البوت | 🔴 **يجب تشفيره** |
| `social_platforms` | `access_token` | `text` | رمز الوصول | 🔴 **يجب تشفيره** |
| `social_platforms` | `refresh_token` | `text` | رمز التحديث | 🔴 **يجب تشفيره** |
| `password_reset_tokens` | `token` | `text` | رمز إعادة التعيين | يجب hash (مُخزّن كنص حالياً) |
| `user_sessions` | `session_token` | `text` | رمز الجلسة | يجب hash أو تشفير |
| `otp_verifications` | `code_hash` | `text` | ✅ مُخزّن كـ hash |

### 7.2 ⚠️ بيانات شخصية (PII) بدون تشفير

| الجدول | العمود | النوع |
|--------|--------|-------|
| `users` | `email`, `phone` | معلومات اتصال |
| `users` | `id_front_image`, `id_back_image` | صور الهوية الشخصية |
| `agent_payment_methods` | `account_number`, `holder_name` | معلومات بنكية |
| `p2p_trader_payment_methods` | `account_number`, `bank_name`, `holder_name` | معلومات بنكية |
| `link_analytics` | `ip_address` | عنوان IP |
| `login_history` | `ip_address` | عنوان IP |
| `audit_logs` | `ip_address` | عنوان IP |
| `admin_audit_logs` | `ip_address` | عنوان IP |
| `p2p_transaction_logs` | `ip_address` | عنوان IP |

**التوصية:** تشفير عمود صور الهوية ومعلومات الحسابات البنكية على مستوى التطبيق.

### 7.3 ⚠️ مخاطر إضافية

| المخاطرة | التفاصيل |
|---------|---------|
| **لا يوجد Rate Limiting على مستوى DB** | يعتمد فقط على التطبيق |
| **لا يوجد Row-Level Security (RLS)** | أي استعلام يمكنه الوصول لكل البيانات |
| **`p2p_escrow.status` نوع `text`** | بدون enum = إمكانية إدخال قيم خاطئة |
| **`users.blocked_users` / `muted_users` كـ array** | لا يمكن فرض FK على عناصر المصفوفة |
| **JSON مُخزّن كـ `text`** | `changes`, `metadata`, `settings`, `game_state` كلها `text` بدلاً من `jsonb` |

---

## 8. ملخص التوصيات حسب الأولوية

### 🔴 حرجة (يجب تنفيذها فوراً)

| # | التوصية | التأثير |
|---|---------|--------|
| 1 | تشفير أسرار OAuth في `social_platforms` | أمان |
| 2 | إضافة CHECK constraints للأرصدة والتقييمات | تكامل البيانات |
| 3 | إضافة UNIQUE constraints على المتابعات والمشاهدات | منع البيانات المكررة |
| 4 | إضافة الفهارس المركبة للـ `transactions`, `notifications`, `chat_messages` | أداء |
| 5 | التأكد من hash كلمات المرور و`password_reset_tokens` | أمان |

### 🟡 مهمة (خلال الأسبوعين القادمين)

| # | التوصية | التأثير |
|---|---------|--------|
| 6 | إضافة CASCADE DELETE للجداول الفرعية (رسائل، مرفقات، حركات) | تكامل البيانات |
| 7 | تقسيم جدول `users` (إحصائيات → جدول منفصل) | أداء + صيانة |
| 8 | إضافة الفهارس المفقودة للـ FKs (30+ فهرس) | أداء |
| 9 | توحيد جداول الإعدادات المكررة | صيانة |
| 10 | تحويل أعمدة JSON من `text` إلى `jsonb` | أداء الاستعلام |
| 11 | إزالة الفهارس المكررة بين السكيما والـ SQL | أداء الكتابة |

### 🟢 تحسينات (على المدى المتوسط)

| # | التوصية | التأثير |
|---|---------|--------|
| 12 | تقسيم الجداول الكبيرة (partitioning) | أداء على المدى الطويل |
| 13 | إضافة Soft Delete للجداول المهمة | استعادة البيانات |
| 14 | إنشاء Materialized Views للإحصائيات | أداء لوحات الإدارة |
| 15 | توحيد جداول الهدايا (`gift_catalog` + `gift_items`) | صيانة |
| 16 | توحيد جداول المتابعات (`challenger_follows` + `challenge_follows`) | صيانة |
| 17 | إضافة enum لـ `p2p_escrow.status` | تكامل البيانات |
| 18 | إضافة Row-Level Security (RLS) | أمان عميق |
| 19 | إضافة سجل تاريخ أسعار الصرف | تدقيق مالي |
| 20 | نقل `blocked_users`/`muted_users` من array إلى جدول منفصل | تكامل + أداء |

---

## 9. إحصائيات عامة

| المقياس | القيمة |
|---------|-------|
| إجمالي الجداول | **106** |
| إجمالي الأعمدة | **~1,250** |
| إجمالي الفهارس (في السكيما) | **~140** |
| إجمالي الفهارس (في SQL) | **~25 إضافي** |
| فهارس مكررة | **~5** |
| فهارس مفقودة (FK بدون فهرس) | **~32** |
| فهارس مركبة مفقودة | **~13** |
| UNIQUE constraints مفقودة | **~10** |
| CHECK constraints مفقودة | **~25** |
| CASCADE DELETE مفقودة | **~25** |
| Enum values | **22 enum** |
| أعمدة حساسة بدون تشفير | **~10** |
| جداول واسعة (>20 عمود) | **10** |
| جداول يتيمة | **~12** configuration tables |
| جداول إعدادات مكررة | **5** (يمكن توحيدها في 2) |

---

> **ملاحظة ختامية:** السكيما شاملة وتغطي نظاماً معقداً (ألعاب، تداول P2P، عملة افتراضية، تحديات، مشاهدة حية). المشاكل الرئيسية هي: (1) جدول `users` واسع جداً مع إحصائيات مكررة، (2) فهارس مركبة مفقودة للاستعلامات الشائعة، (3) بيانات حساسة بدون تشفير كافٍ، (4) قواعد CASCADE DELETE مفقودة في معظم العلاقات الهرمية.
