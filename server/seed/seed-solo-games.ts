/**
 * Seed the 10 polished VEX solo mini-games into the `external_games` table.
 * Run via: `tsx server/seed/seed-solo-games.ts` (or imported from seed-main.ts).
 *
 * Each entry:
 *   - integrationType:  "cdn_assets"  (HTML/JS served from /games/<slug>/index.html)
 *   - externalUrl:      /games/<slug>/index.html
 *   - sandboxPermissions: same-origin allowed so they can use postMessage with parent
 */
import { db } from "../db";
import { externalGames } from "@shared/schema";
import { sql } from "drizzle-orm";

interface SoloGameSeed {
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;
  tags: string[];
  accentColor: string;
  orientation: "portrait" | "landscape" | "both";
  sortOrder: number;
  isFeatured: boolean;
}

export const SOLO_GAMES: SoloGameSeed[] = [
  {
    slug: "2048",
    nameEn: "2048",
    nameAr: "2048",
    descriptionEn: "Slide tiles, merge equal numbers, reach 2048 — the legendary brain-teaser.",
    descriptionAr: "اسحب البلاط، ادمج الأرقام المتشابهة، واصل إلى 2048!",
    category: "puzzle",
    tags: ["puzzle", "numbers", "merge", "classic"],
    accentColor: "#ffb627",
    orientation: "portrait",
    sortOrder: 1,
    isFeatured: true,
  },
  {
    slug: "sudoku",
    nameEn: "Sudoku",
    nameAr: "سودوكو",
    descriptionEn: "Fill the 9×9 grid so every row, column and box contains 1-9.",
    descriptionAr: "املأ الشبكة 9×9 بحيث يحتوي كل صف وعمود ومربع على 1-9.",
    category: "puzzle",
    tags: ["puzzle", "logic", "numbers"],
    accentColor: "#1e88ff",
    orientation: "portrait",
    sortOrder: 2,
    isFeatured: true,
  },
  {
    slug: "memory-flip",
    nameEn: "Memory Flip",
    nameAr: "تطابق الذاكرة",
    descriptionEn: "Flip cards, find matching pairs, beat the clock.",
    descriptionAr: "اقلب البطاقات، جد الأزواج المتطابقة، وتغلب على الساعة.",
    category: "puzzle",
    tags: ["memory", "cards", "matching"],
    accentColor: "#22c55e",
    orientation: "portrait",
    sortOrder: 3,
    isFeatured: true,
  },
  {
    slug: "reaction-time",
    nameEn: "Reaction Time",
    nameAr: "زمن رد الفعل",
    descriptionEn: "Tap as soon as the screen turns gold. How fast are you?",
    descriptionAr: "اضغط بمجرد أن تتحول الشاشة للذهبي. ما مدى سرعتك؟",
    category: "arcade",
    tags: ["reflex", "speed", "reaction"],
    accentColor: "#ef4444",
    orientation: "portrait",
    sortOrder: 4,
    isFeatured: false,
  },
  {
    slug: "color-match",
    nameEn: "Color Match",
    nameAr: "تطابق الألوان",
    descriptionEn: "Does the word match its color? Decide in a flash.",
    descriptionAr: "هل تطابق الكلمة لونها؟ قرر في لحظة!",
    category: "arcade",
    tags: ["reflex", "stroop", "brain"],
    accentColor: "#a855f7",
    orientation: "portrait",
    sortOrder: 5,
    isFeatured: true,
  },
  {
    slug: "tap-speed",
    nameEn: "Tap Speed",
    nameAr: "سرعة النقر",
    descriptionEn: "How many taps can you land in 10 seconds?",
    descriptionAr: "كم نقرة تستطيع تسجيلها في 10 ثوانٍ؟",
    category: "arcade",
    tags: ["speed", "tap", "reflex"],
    accentColor: "#22d3ee",
    orientation: "portrait",
    sortOrder: 6,
    isFeatured: false,
  },
  {
    slug: "number-merge",
    nameEn: "Number Merge",
    nameAr: "دمج الأرقام",
    descriptionEn: "Drop & merge numbered orbs. Build the highest tower!",
    descriptionAr: "أسقط واصنع كرات الأرقام. ابنِ أعلى برج!",
    category: "puzzle",
    tags: ["merge", "numbers", "physics"],
    accentColor: "#f97316",
    orientation: "portrait",
    sortOrder: 7,
    isFeatured: true,
  },
  {
    slug: "tile-slider",
    nameEn: "Tile Slider",
    nameAr: "بازل الأرقام",
    descriptionEn: "Slide tiles to put them in 1→15 order. A timeless classic.",
    descriptionAr: "حرّك البلاط لترتيبه من 1 إلى 15. لعبة كلاسيكية خالدة.",
    category: "puzzle",
    tags: ["puzzle", "sliding", "classic"],
    accentColor: "#1e88ff",
    orientation: "portrait",
    sortOrder: 8,
    isFeatured: false,
  },
  {
    slug: "pattern-recall",
    nameEn: "Pattern Recall",
    nameAr: "تذكر النمط",
    descriptionEn: "Watch the sequence light up, then repeat it. Levels grow!",
    descriptionAr: "شاهد التسلسل يضيء، ثم كرره. المستويات تتصاعد!",
    category: "puzzle",
    tags: ["memory", "pattern", "simon"],
    accentColor: "#22c55e",
    orientation: "portrait",
    sortOrder: 9,
    isFeatured: false,
  },
  {
    slug: "endless-runner",
    nameEn: "Endless Runner",
    nameAr: "العداء اللانهائي",
    descriptionEn: "Jump over obstacles, run as far as you can!",
    descriptionAr: "اقفز فوق العوائق، واركض لأبعد مسافة ممكنة!",
    category: "arcade",
    tags: ["arcade", "runner", "endless"],
    accentColor: "#ffb627",
    orientation: "portrait",
    sortOrder: 10,
    isFeatured: true,
  },
];

export async function seedSoloGames() {
  let inserted = 0;
  let skipped = 0;
  for (const g of SOLO_GAMES) {
    const existing = await db.select({ id: externalGames.id })
      .from(externalGames)
      .where(sql`${externalGames.slug} = ${g.slug}`);
    if (existing.length > 0) {
      // Update key fields so re-seeding refreshes metadata without losing stats
      await db.update(externalGames).set({
        nameEn: g.nameEn,
        nameAr: g.nameAr,
        descriptionEn: g.descriptionEn,
        descriptionAr: g.descriptionAr,
        category: g.category,
        tags: g.tags,
        accentColor: g.accentColor,
        orientation: g.orientation,
        sortOrder: g.sortOrder,
        isFeatured: g.isFeatured,
        integrationType: "cdn_assets",
        externalUrl: `/games/${g.slug}/index.html`,
        entryFile: "index.html",
        sandboxPermissions: "allow-scripts allow-same-origin allow-pointer-lock",
        isFreeToPlay: true,
        minPlayers: 1,
        maxPlayers: 1,
        minBet: "0.00",
        maxBet: "0.00",
        status: "active",
        sdkVersion: "1.0",
        developerName: "VEX Studio",
        version: "1.0.0",
        updatedAt: new Date(),
      }).where(sql`${externalGames.slug} = ${g.slug}`);
      skipped++;
      continue;
    }
    await db.insert(externalGames).values({
      slug: g.slug,
      nameEn: g.nameEn,
      nameAr: g.nameAr,
      descriptionEn: g.descriptionEn,
      descriptionAr: g.descriptionAr,
      category: g.category,
      tags: g.tags,
      integrationType: "cdn_assets",
      externalUrl: `/games/${g.slug}/index.html`,
      entryFile: "index.html",
      iconUrl: `/games/${g.slug}/icon.svg`,
      bannerUrl: `/games/${g.slug}/banner.svg`,
      thumbnailUrl: `/games/${g.slug}/icon.svg`,
      accentColor: g.accentColor,
      orientation: g.orientation,
      minPlayers: 1,
      maxPlayers: 1,
      minBet: "0.00",
      maxBet: "0.00",
      isFreeToPlay: true,
      hasInGameCurrency: false,
      sdkVersion: "1.0",
      sandboxPermissions: "allow-scripts allow-same-origin allow-pointer-lock",
      enableOffline: false,
      cacheMaxAge: 86400,
      status: "active",
      isFeatured: g.isFeatured,
      sortOrder: g.sortOrder,
      developerName: "VEX Studio",
      version: "1.0.0",
    });
    inserted++;
  }
  return { inserted, skipped, total: SOLO_GAMES.length };
}

// Allow direct execution: `tsx server/seed/seed-solo-games.ts`
if (process.argv[1] && process.argv[1].endsWith("seed-solo-games.ts")) {
  seedSoloGames()
    .then((r) => {
      console.log(`[seed-solo-games] inserted=${r.inserted}, refreshed=${r.skipped}, total=${r.total}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[seed-solo-games] failed:", e);
      process.exit(1);
    });
}
