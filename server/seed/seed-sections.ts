import { db } from "../db";
import { gameSections } from "@shared/schema";
import { eq } from "drizzle-orm";

/** Seed game sections (categories displayed in UI) */
export async function seedGameSections() {
  const sectionsList = [
    { key: "most_played", nameEn: "Most Played", nameAr: "الأكثر لعباً", icon: "TrendingUp", iconColor: "text-orange-500", sortOrder: 1, isActive: true },
    { key: "crash", nameEn: "Crash Games", nameAr: "ألعاب الانهيار", icon: "TrendingUp", iconColor: "text-red-500", sortOrder: 2, isActive: true },
    { key: "dice", nameEn: "Dice Games", nameAr: "ألعاب النرد", icon: "Dices", iconColor: "text-blue-500", sortOrder: 3, isActive: true },
    { key: "wheel", nameEn: "Wheel Games", nameAr: "ألعاب العجلة", icon: "CircleDot", iconColor: "text-green-500", sortOrder: 4, isActive: true },
    { key: "slots", nameEn: "Slots", nameAr: "السلوتس", icon: "Star", iconColor: "text-purple-500", sortOrder: 5, isActive: true },
    { key: "jackpot", nameEn: "Jackpot", nameAr: "الجائزة الكبرى", icon: "Trophy", iconColor: "text-yellow-500", sortOrder: 6, isActive: true },
    { key: "board", nameEn: "Board Games", nameAr: "ألعاب اللوحة", icon: "Gamepad2", iconColor: "text-cyan-500", sortOrder: 7, isActive: true },
    { key: "cards", nameEn: "Card Games", nameAr: "ألعاب الورق", icon: "Crown", iconColor: "text-pink-500", sortOrder: 8, isActive: true },
    { key: "strategy", nameEn: "Strategy", nameAr: "الاستراتيجية", icon: "Target", iconColor: "text-orange-500", sortOrder: 9, isActive: true },
    { key: "multiplayer", nameEn: "Multiplayer", nameAr: "متعددة اللاعبين", icon: "Gamepad2", iconColor: "text-primary", sortOrder: 10, isActive: true },
    { key: "featured", nameEn: "Featured", nameAr: "المميزة", icon: "Star", iconColor: "text-yellow-500", sortOrder: 11, isActive: true },
  ];

  let addedCount = 0;
  for (const section of sectionsList) {
    const [existing] = await db.select().from(gameSections).where(
      eq(gameSections.key, section.key)
    );
    if (!existing) {
      await db.insert(gameSections).values(section);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    console.log(`[Seed] Added ${addedCount} game sections`);
  } else {
    console.log("Game sections already seeded");
  }
}
