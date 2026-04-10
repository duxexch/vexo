import { db } from "../db";
import { giftCatalog, gameplaySettings } from "@shared/schema";
import { eq } from "drizzle-orm";

/** Seed default gift catalog items */
export async function seedGiftCatalog() {
  const defaultGifts = [
    { name: "Rose", nameAr: "وردة", price: "0.50", iconUrl: "heart", category: "love", animationType: "float", coinValue: 5, sortOrder: 1 },
    { name: "Fire", nameAr: "نار", price: "1.00", iconUrl: "flame", category: "gaming", animationType: "burst", coinValue: 10, sortOrder: 2 },
    { name: "Trophy", nameAr: "كأس", price: "5.00", iconUrl: "trophy", category: "celebration", animationType: "spin", coinValue: 50, sortOrder: 3 },
    { name: "Crown", nameAr: "تاج", price: "10.00", iconUrl: "crown", category: "celebration", animationType: "rain", coinValue: 100, sortOrder: 4 },
    { name: "Rocket", nameAr: "صاروخ", price: "25.00", iconUrl: "rocket", category: "gaming", animationType: "burst", coinValue: 250, sortOrder: 5 },
    { name: "Diamond", nameAr: "ماسة", price: "50.00", iconUrl: "gem", category: "love", animationType: "spin", coinValue: 500, sortOrder: 6 },
    { name: "Star", nameAr: "نجمة", price: "2.00", iconUrl: "star", category: "general", animationType: "float", coinValue: 20, sortOrder: 7 },
    { name: "Lightning", nameAr: "برق", price: "3.00", iconUrl: "zap", category: "gaming", animationType: "burst", coinValue: 30, sortOrder: 8 },
  ];

  let addedCount = 0;
  for (const gift of defaultGifts) {
    const [existing] = await db.select().from(giftCatalog).where(eq(giftCatalog.name, gift.name));
    if (!existing) {
      await db.insert(giftCatalog).values(gift);
      addedCount++;
    }
  }
  
  if (addedCount > 0) {
    console.log(`[Seed] Added ${addedCount} gifts to catalog`);
  } else {
    console.log("Gift catalog already seeded");
  }
}

/** Seed default free play / gameplay settings */
export async function seedFreePlaySettings() {
  const defaults = [
    { key: 'free_play_enabled', value: 'true', description: 'Enable/disable the free play system', descriptionAr: 'تفعيل/تعطيل نظام اللعب المجاني' },
    { key: 'daily_bonus_enabled', value: 'true', description: 'Enable/disable daily bonus claims', descriptionAr: 'تفعيل/تعطيل المكافأة اليومية' },
    { key: 'ad_reward_enabled', value: 'true', description: 'Enable/disable ad watching rewards', descriptionAr: 'تفعيل/تعطيل مكافآت مشاهدة الإعلانات' },
    { key: 'referral_reward_enabled', value: 'true', description: 'Enable/disable referral rewards', descriptionAr: 'تفعيل/تعطيل مكافآت الإحالة' },
    { key: 'ad_reward_amount', value: '0.10', description: 'Reward amount per ad watch (project coins)', descriptionAr: 'مبلغ المكافأة لكل إعلان (عملة المشروع)' },
    { key: 'max_ads_per_day', value: '10', description: 'Maximum ads a user can watch per day', descriptionAr: 'الحد الأقصى للإعلانات يومياً' },
    { key: 'referral_reward_amount', value: '5.00', description: 'Reward for each referral (project coins)', descriptionAr: 'مكافأة كل إحالة (عملة المشروع)' },
    { key: 'freePlayLimit', value: '50', description: 'Maximum games per day (0 = unlimited)', descriptionAr: 'الحد الأقصى للألعاب يومياً (0 = بدون حد)' },
  ];

  let addedCount = 0;
  for (const setting of defaults) {
    const [existing] = await db.select().from(gameplaySettings)
      .where(eq(gameplaySettings.key, setting.key));
    if (!existing) {
      await db.insert(gameplaySettings).values(setting);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    console.log(`[Seed] Added ${addedCount} free play settings`);
  } else {
    console.log("Free play settings already seeded");
  }
}
