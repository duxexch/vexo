-- Extend badge catalog with level-based entitlement controls
ALTER TABLE badge_catalog
ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;

ALTER TABLE badge_catalog
ADD COLUMN IF NOT EXISTS p2p_monthly_limit numeric(15,2);

ALTER TABLE badge_catalog
ADD COLUMN IF NOT EXISTS challenge_max_amount numeric(15,2);

ALTER TABLE badge_catalog
ADD COLUMN IF NOT EXISTS grants_p2p_privileges boolean NOT NULL DEFAULT false;

ALTER TABLE badge_catalog
ADD COLUMN IF NOT EXISTS show_on_profile boolean NOT NULL DEFAULT true;

ALTER TABLE badge_catalog
DROP CONSTRAINT IF EXISTS chk_badge_catalog_level_range;

ALTER TABLE badge_catalog
ADD CONSTRAINT chk_badge_catalog_level_range
CHECK (level >= 1 AND level <= 100);

ALTER TABLE badge_catalog
DROP CONSTRAINT IF EXISTS chk_badge_catalog_p2p_monthly_limit_non_negative;

ALTER TABLE badge_catalog
ADD CONSTRAINT chk_badge_catalog_p2p_monthly_limit_non_negative
CHECK (p2p_monthly_limit IS NULL OR p2p_monthly_limit >= 0);

ALTER TABLE badge_catalog
DROP CONSTRAINT IF EXISTS chk_badge_catalog_challenge_max_amount_non_negative;

ALTER TABLE badge_catalog
ADD CONSTRAINT chk_badge_catalog_challenge_max_amount_non_negative
CHECK (challenge_max_amount IS NULL OR challenge_max_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_badge_catalog_level ON badge_catalog(level);

-- Seed 10 trust badges with progressive limits and privileges
WITH seed_badges AS (
  SELECT * FROM (VALUES
    ('Trusted Seed', 'بذرة الثقة', 'Starter trust badge for new reliable traders.', 'شارة بداية الثقة للمتداولين الجدد الموثوقين.', 'Shield', '#10b981', 'trust', 'Manual trust assignment', 1, '5000.00'::numeric, '150.00'::numeric, true, true, 100, 1),
    ('Trusted Bronze', 'الثقة البرونزية', 'Bronze trust level with higher monthly trading room.', 'مستوى الثقة البرونزي مع مساحة تداول شهرية أعلى.', 'Medal', '#b45309', 'trust', 'Manual trust assignment', 2, '10000.00'::numeric, '300.00'::numeric, true, true, 200, 2),
    ('Trusted Silver', 'الثقة الفضية', 'Silver trust level for consistent platform users.', 'مستوى الثقة الفضي للمستخدمين المنتظمين.', 'BadgeCheck', '#64748b', 'trust', 'Manual trust assignment', 3, '25000.00'::numeric, '750.00'::numeric, true, true, 300, 3),
    ('Trusted Gold', 'الثقة الذهبية', 'Gold trust level with stronger P2P capacity.', 'مستوى الثقة الذهبي بسعة أكبر في تداول P2P.', 'Award', '#f59e0b', 'trust', 'Manual trust assignment', 4, '50000.00'::numeric, '1500.00'::numeric, true, true, 400, 4),
    ('Elite Trader', 'المتداول النخبوي', 'Elite tier unlocked for high-trust members.', 'فئة النخبة للأعضاء ذوي الثقة العالية.', 'Crown', '#ef4444', 'trust', 'Manual trust assignment', 5, '75000.00'::numeric, '2500.00'::numeric, true, true, 500, 5),
    ('Platinum Vault', 'الخزنة البلاتينية', 'Platinum tier for premium trusted traders.', 'الفئة البلاتينية للمتداولين الموثوقين المميزين.', 'Gem', '#06b6d4', 'trust', 'Manual trust assignment', 6, '100000.00'::numeric, '4000.00'::numeric, true, true, 600, 6),
    ('Diamond Trust', 'الثقة الماسية', 'Diamond-level trust with expanded challenge cap.', 'ثقة بمستوى الماس مع حد تحديات أعلى.', 'Diamond', '#0284c7', 'trust', 'Manual trust assignment', 7, '150000.00'::numeric, '7000.00'::numeric, true, true, 700, 7),
    ('Master Merchant', 'التاجر المتمكن', 'Master tier for top-performing market participants.', 'فئة الماستر لأفضل المشاركين في السوق.', 'Trophy', '#7c3aed', 'trust', 'Manual trust assignment', 8, '250000.00'::numeric, '12000.00'::numeric, true, true, 800, 8),
    ('Grand Commander', 'القائد الكبير', 'High authority trust tier with major limits.', 'فئة ثقة عالية الصلاحية بحدود كبيرة.', 'ShieldCheck', '#be123c', 'trust', 'Manual trust assignment', 9, '350000.00'::numeric, '18000.00'::numeric, true, true, 900, 9),
    ('Royal Legend', 'الأسطورة الملكية', 'Top trust tier with maximum badge privileges.', 'أعلى فئة ثقة بامتيازات الشارة القصوى.', 'Crown', '#1d4ed8', 'trust', 'Manual trust assignment', 10, '500000.00'::numeric, '25000.00'::numeric, true, true, 1000, 10)
  ) AS v(name, name_ar, description, description_ar, icon_name, color, category, requirement, level, p2p_monthly_limit, challenge_max_amount, grants_p2p_privileges, show_on_profile, points, sort_order)
)
INSERT INTO badge_catalog (
  name,
  name_ar,
  description,
  description_ar,
  icon_name,
  color,
  category,
  requirement,
  level,
  p2p_monthly_limit,
  challenge_max_amount,
  grants_p2p_privileges,
  show_on_profile,
  points,
  sort_order
)
SELECT
  s.name,
  s.name_ar,
  s.description,
  s.description_ar,
  s.icon_name,
  s.color,
  s.category,
  s.requirement,
  s.level,
  s.p2p_monthly_limit,
  s.challenge_max_amount,
  s.grants_p2p_privileges,
  s.show_on_profile,
  s.points,
  s.sort_order
FROM seed_badges s
WHERE NOT EXISTS (
  SELECT 1 FROM badge_catalog b WHERE lower(b.name) = lower(s.name)
);
