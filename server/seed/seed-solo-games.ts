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
  minPlayers?: number;
  maxPlayers?: number;
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
  {
    slug: "tic-tac-toe",
    nameEn: "Tic Tac Toe",
    nameAr: "إكس أو",
    descriptionEn: "Classic 3×3 strategy. Play vs a friend or beat the AI.",
    descriptionAr: "كلاسيكية 3×3. العب ضد صديق أو تحدَّ الذكاء الاصطناعي.",
    category: "strategy",
    tags: ["strategy", "classic", "2-player", "vs-ai"],
    accentColor: "#ffb627",
    orientation: "portrait",
    sortOrder: 11,
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    slug: "connect-4",
    nameEn: "Connect 4",
    nameAr: "وصل 4",
    descriptionEn: "Drop discs and connect four in a row before your rival does.",
    descriptionAr: "أسقط الأقراص واربط أربعة قبل خصمك!",
    category: "strategy",
    tags: ["strategy", "classic", "2-player", "vs-ai"],
    accentColor: "#1e88ff",
    orientation: "portrait",
    sortOrder: 12,
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    slug: "ludo",
    nameEn: "Ludo",
    nameAr: "لودو",
    descriptionEn: "Roll the dice, race your tokens home. Up to 4 players on one device.",
    descriptionAr: "ارمِ النرد وسابق إلى البيت. حتى 4 لاعبين على نفس الجهاز.",
    category: "board",
    tags: ["board", "dice", "4-player", "classic"],
    accentColor: "#22c55e",
    orientation: "portrait",
    sortOrder: 13,
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 4,
  },
  {
    slug: "memory-battle",
    nameEn: "Memory Battle",
    nameAr: "نزال الذاكرة",
    descriptionEn: "Match more pairs than your opponent in this turn-based memory duel.",
    descriptionAr: "اجمع أكثر زوج متطابق من خصمك في نزال الذاكرة بالأدوار.",
    category: "memory",
    tags: ["memory", "cards", "2-player", "duel"],
    accentColor: "#a855f7",
    orientation: "portrait",
    sortOrder: 14,
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 2,
  },
  {
    slug: "reaction-duel",
    nameEn: "Reaction Duel",
    nameAr: "نزال رد الفعل",
    descriptionEn: "Two players, one device. First to tap when the screen turns gold wins.",
    descriptionAr: "لاعبان وجهاز واحد. أول من يضغط عند تحوّل الشاشة للذهبي يفوز!",
    category: "arcade",
    tags: ["reflex", "speed", "2-player", "duel"],
    accentColor: "#ef4444",
    orientation: "portrait",
    sortOrder: 15,
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 2,
  },
  // ── Solo arcade additions (sortOrder 16-18) ──
  {
    slug: "snake",
    nameEn: "Snake",
    nameAr: "الثعبان",
    descriptionEn: "Eat, grow, survive. The classic that never gets old.",
    descriptionAr: "كُل، انمُ، اِبقَ على قيد الحياة. الكلاسيكية التي لا تموت.",
    category: "arcade",
    tags: ["arcade", "classic", "snake"],
    accentColor: "#22c55e",
    orientation: "portrait",
    sortOrder: 16,
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    slug: "stack-tower",
    nameEn: "Stack Tower",
    nameAr: "برج المكعبات",
    descriptionEn: "Tap at the right moment to stack the perfect tower.",
    descriptionAr: "اضغط في اللحظة المناسبة لبناء أعلى برج بدقة.",
    category: "arcade",
    tags: ["arcade", "timing", "stack"],
    accentColor: "#ffb627",
    orientation: "portrait",
    sortOrder: 17,
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    slug: "aim-trainer",
    nameEn: "Aim Trainer",
    nameAr: "مدرّب التصويب",
    descriptionEn: "30 seconds of pure precision. How sharp is your aim?",
    descriptionAr: "30 ثانية من التصويب الخالص. ما مدى دقتك؟",
    category: "arcade",
    tags: ["aim", "reflex", "precision"],
    accentColor: "#ef4444",
    orientation: "portrait",
    sortOrder: 18,
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 1,
  },
  // ── Duo additions (sortOrder 19-21) ──
  {
    slug: "pong",
    nameEn: "Pong",
    nameAr: "بونج",
    descriptionEn: "The grandfather of video games. Two paddles, one ball, first to seven.",
    descriptionAr: "جدّ ألعاب الفيديو. مضربان، كرة واحدة، الأول إلى سبعة يفوز.",
    category: "sports",
    tags: ["classic", "2-player", "vs-ai", "arcade"],
    accentColor: "#22d3ee",
    orientation: "portrait",
    sortOrder: 19,
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    slug: "air-hockey",
    nameEn: "Air Hockey",
    nameAr: "هوكي الهواء",
    descriptionEn: "Slam the puck into your rival's goal. First to seven wins.",
    descriptionAr: "اضرب القرص في مرمى خصمك. الأول إلى سبعة يفوز.",
    category: "sports",
    tags: ["sports", "2-player", "vs-ai", "arcade"],
    accentColor: "#1e88ff",
    orientation: "portrait",
    sortOrder: 20,
    isFeatured: true,
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    slug: "typing-duel",
    nameEn: "Typing Duel",
    nameAr: "نزال الكتابة",
    descriptionEn: "Two players, one word. Tap the letters in order — fastest finger wins.",
    descriptionAr: "لاعبان، كلمة واحدة. اضغط الحروف بالترتيب — أسرع إصبع يفوز.",
    category: "arcade",
    tags: ["typing", "speed", "2-player", "duel"],
    accentColor: "#a855f7",
    orientation: "portrait",
    sortOrder: 21,
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 2,
  },
  // ── Quad additions (sortOrder 22-24) ──
  {
    slug: "bomb-pass",
    nameEn: "Bomb Pass",
    nameAr: "تمرير القنبلة",
    descriptionEn: "Hot potato with a fuse. Pass before it explodes — last one standing wins.",
    descriptionAr: "بطاطا ساخنة بفتيل! مرّر قبل الانفجار — آخر صامد يفوز.",
    category: "party",
    tags: ["party", "4-player", "bomb", "pass"],
    accentColor: "#f97316",
    orientation: "portrait",
    sortOrder: 22,
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 4,
  },
  {
    slug: "quiz-rush",
    nameEn: "Quiz Rush",
    nameAr: "سباق الأسئلة",
    descriptionEn: "Up to 4 players, one question, four buzzers. Fastest correct answer scores.",
    descriptionAr: "حتى 4 لاعبين، سؤال واحد، أربعة أزرار. أسرع إجابة صحيحة تسجّل.",
    category: "trivia",
    tags: ["trivia", "quiz", "4-player", "buzzer"],
    accentColor: "#1e88ff",
    orientation: "portrait",
    sortOrder: 23,
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 4,
  },
  {
    slug: "dice-battle",
    nameEn: "Dice Battle",
    nameAr: "معركة النرد",
    descriptionEn: "Roll 3 dice each round. Doubles boost, triples explode. Highest after 5 wins.",
    descriptionAr: "ارمِ 3 نرد كل جولة. التطابق يضاعف، الثلاثي ينفجر. الأعلى بعد 5 جولات يفوز.",
    category: "board",
    tags: ["dice", "4-player", "luck", "board"],
    accentColor: "#ffb627",
    orientation: "portrait",
    sortOrder: 24,
    isFeatured: true,
    minPlayers: 2,
    maxPlayers: 4,
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
        minPlayers: g.minPlayers ?? 1,
        maxPlayers: g.maxPlayers ?? 1,
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
      minPlayers: g.minPlayers ?? 1,
      maxPlayers: g.maxPlayers ?? 1,
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
