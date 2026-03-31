import { db } from "../db";
import {
  games, languages, currencies, countryPaymentMethods,
  themes, p2pSettings, financialLimits, promoCodes, socialPlatforms,
} from "@shared/schema";
import { defaultGames } from "./game-data";

/** Main seed — games, languages, currencies, payment methods, themes, p2p settings, financial limits, promo codes */
export async function seed() {
  console.log("Starting database seed...");

  const existingGames = await db.select().from(games).limit(1);
  if (existingGames.length > 0) {
    console.log("Games already exist, skipping seed.");
    return;
  }
  console.log("Adding games and supporting data...");

  await db.insert(games).values(defaultGames);
  console.log("Created games");

  await db.insert(languages).values([
    { code: "en", name: "English", nativeName: "English", isDefault: true, sortOrder: 1 },
    { code: "ar", name: "Arabic", nativeName: "العربية", isDefault: false, sortOrder: 2 },
  ]);
  console.log("Created languages");

  await db.insert(currencies).values([
    { code: "USD", name: "US Dollar", symbol: "$", exchangeRate: "1.000000", isDefault: true, country: "US", sortOrder: 1 },
    { code: "EGP", name: "Egyptian Pound", symbol: "ج.م", exchangeRate: "30.900000", country: "EG", sortOrder: 2 },
    { code: "SAR", name: "Saudi Riyal", symbol: "ر.س", exchangeRate: "3.750000", country: "SA", sortOrder: 3 },
    { code: "AED", name: "UAE Dirham", symbol: "د.إ", exchangeRate: "3.670000", country: "AE", sortOrder: 4 },
    { code: "USDT", name: "Tether", symbol: "USDT", exchangeRate: "1.000000", country: null, sortOrder: 5 },
  ]);
  console.log("Created currencies");

  await db.insert(countryPaymentMethods).values([
    { countryCode: "EG", name: "Vodafone Cash", type: "e_wallet", minAmount: "50.00", maxAmount: "50000.00", processingTime: "Instant", instructions: "Send to agent wallet number" },
    { countryCode: "EG", name: "InstaPay", type: "e_wallet", minAmount: "100.00", maxAmount: "100000.00", processingTime: "Instant" },
    { countryCode: "EG", name: "Bank Transfer", type: "bank_transfer", minAmount: "500.00", maxAmount: "500000.00", processingTime: "1-2 hours" },
    { countryCode: "SA", name: "STC Pay", type: "e_wallet", minAmount: "50.00", maxAmount: "20000.00", processingTime: "Instant" },
    { countryCode: "SA", name: "Bank Transfer", type: "bank_transfer", minAmount: "100.00", maxAmount: "100000.00", processingTime: "30 minutes" },
    { countryCode: "AE", name: "Apple Pay", type: "e_wallet", minAmount: "50.00", maxAmount: "50000.00", processingTime: "Instant" },
    { countryCode: "GLOBAL", name: "USDT (TRC20)", type: "crypto", minAmount: "10.00", maxAmount: "1000000.00", processingTime: "10-30 minutes" },
    { countryCode: "GLOBAL", name: "Bitcoin", type: "crypto", minAmount: "50.00", maxAmount: "1000000.00", processingTime: "30-60 minutes" },
  ]);
  console.log("Created payment methods");

  await db.insert(themes).values([
    {
      name: "vex-dark",
      displayName: "VEX Dark (Default)",
      primaryColor: "#00c853",
      secondaryColor: "#ff9800",
      accentColor: "#00e676",
      backgroundColor: "#0f1419",
      foregroundColor: "#ffffff",
      cardColor: "#1a1f2e",
      mutedColor: "#6b7280",
      borderColor: "#2d3748",
      isDefault: true,
    },
    {
      name: "vex-royal",
      displayName: "VEX Royal",
      primaryColor: "#6366f1",
      secondaryColor: "#f59e0b",
      accentColor: "#8b5cf6",
      backgroundColor: "#0c0a1d",
      foregroundColor: "#ffffff",
      cardColor: "#1e1b4b",
      mutedColor: "#9ca3af",
      borderColor: "#312e81",
      isDefault: false,
    },
  ]);
  console.log("Created themes");

  await db.insert(p2pSettings).values({
    platformFeePercentage: "0.005",
    minTradeAmount: "10.00",
    maxTradeAmount: "100000.00",
    escrowTimeoutHours: 24,
    paymentTimeoutMinutes: 15,
    isEnabled: true,
  });
  console.log("Created P2P settings");

  await db.insert(financialLimits).values([
    { name: "Basic", vipLevel: 0, minDeposit: "10.00", maxDeposit: "1000.00", minWithdrawal: "20.00", maxWithdrawal: "500.00", dailyWithdrawalLimit: "1000.00" },
    { name: "Bronze", vipLevel: 1, minDeposit: "10.00", maxDeposit: "5000.00", minWithdrawal: "20.00", maxWithdrawal: "2000.00", dailyWithdrawalLimit: "5000.00" },
    { name: "Silver", vipLevel: 2, minDeposit: "10.00", maxDeposit: "10000.00", minWithdrawal: "20.00", maxWithdrawal: "5000.00", dailyWithdrawalLimit: "10000.00" },
    { name: "Gold", vipLevel: 3, minDeposit: "10.00", maxDeposit: "25000.00", minWithdrawal: "20.00", maxWithdrawal: "10000.00", dailyWithdrawalLimit: "25000.00" },
    { name: "Platinum", vipLevel: 4, minDeposit: "10.00", maxDeposit: "50000.00", minWithdrawal: "20.00", maxWithdrawal: "25000.00", dailyWithdrawalLimit: "50000.00" },
  ]);
  console.log("Created financial limits");

  await db.insert(promoCodes).values([
    { code: "WELCOME100", type: "percentage", value: "100.00", minDeposit: "50.00", maxDiscount: "500.00", usageLimit: 1000 },
    { code: "VEX50", type: "fixed", value: "50.00", minDeposit: "100.00", usageLimit: 500 },
    { code: "NEWUSER", type: "percentage", value: "50.00", minDeposit: "20.00", maxDiscount: "200.00", perUserLimit: 1 },
  ]);
  console.log("Created promo codes");

  console.log("Database seed completed successfully!");
}

/** Seed default social platforms (OAuth, OTP, etc.) */
export async function seedSocialPlatforms() {
  const existing = await db.select().from(socialPlatforms).limit(1);
  if (existing.length > 0) {
    console.log("Social platforms already exist, skipping seed.");
    return;
  }

  console.log("Seeding default social platforms...");
  const defaultPlatforms = [
    { name: "google", displayName: "Google", displayNameAr: "جوجل", icon: "SiGoogle", type: "oauth" as const, sortOrder: 1, isEnabled: true },
    { name: "facebook", displayName: "Facebook", displayNameAr: "فيسبوك", icon: "SiFacebook", type: "oauth" as const, sortOrder: 2, isEnabled: true },
    { name: "telegram", displayName: "Telegram", displayNameAr: "تيليجرام", icon: "SiTelegram", type: "both" as const, sortOrder: 3, isEnabled: true },
    { name: "whatsapp", displayName: "WhatsApp", displayNameAr: "واتساب", icon: "SiWhatsapp", type: "otp" as const, sortOrder: 4, isEnabled: true },
    { name: "twitter", displayName: "X (Twitter)", displayNameAr: "إكس (تويتر)", icon: "SiX", type: "oauth" as const, sortOrder: 5, isEnabled: true },
    { name: "apple", displayName: "Apple", displayNameAr: "آبل", icon: "SiApple", type: "oauth" as const, sortOrder: 6, isEnabled: true },
    { name: "discord", displayName: "Discord", displayNameAr: "ديسكورد", icon: "SiDiscord", type: "oauth" as const, sortOrder: 7, isEnabled: false },
    { name: "linkedin", displayName: "LinkedIn", displayNameAr: "لينكدإن", icon: "SiLinkedin", type: "oauth" as const, sortOrder: 8, isEnabled: false },
    { name: "github", displayName: "GitHub", displayNameAr: "جيت هاب", icon: "SiGithub", type: "oauth" as const, sortOrder: 9, isEnabled: false },
    { name: "tiktok", displayName: "TikTok", displayNameAr: "تيك توك", icon: "SiTiktok", type: "oauth" as const, sortOrder: 10, isEnabled: false },
    { name: "instagram", displayName: "Instagram", displayNameAr: "إنستجرام", icon: "SiInstagram", type: "oauth" as const, sortOrder: 11, isEnabled: false },
    { name: "sms", displayName: "SMS", displayNameAr: "رسائل SMS", icon: "Phone", type: "otp" as const, sortOrder: 12, isEnabled: false },
  ];

  for (const platform of defaultPlatforms) {
    await db.insert(socialPlatforms).values(platform);
  }
  console.log(`[Seed] Added ${defaultPlatforms.length} social platforms`);
}
