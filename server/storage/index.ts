/**
 * Storage Module - Modularized database access layer
 * 
 * Split from monolithic storage.ts into domain-specific modules:
 * - users.ts: User accounts, auth, sessions, preferences
 * - financial.ts: Transactions, agents, affiliates, promo codes
 * - games.ts: Games, game sessions, multiplayer games
 * - live-games.ts: Live sessions, moves, spectators, gifts, chat
 * - social.ts: User relationships, social platforms
 * - p2p.ts: P2P trading (base + project currency)
 * - project-currency.ts: Project currency wallets, conversions, ledger
 * - challenges.ts: Challenges, challenge settings, resignation payout
 * - achievements.ts: Achievements, seasons
 * - admin.ts: Audit logs, system settings/config, scheduled changes, alerts
 * - notifications.ts: Notifications, announcements
 * - support.ts: Complaints, country payments, support settings, spectator supports
 * - helpers.ts: Shared utilities
 */

import { type InsertMultiplayerGame } from "@shared/schema";
import { logger } from "../lib/logger";

// Re-export shared types
export { type UpdateUserData, getErrorMessage } from "./helpers";

// Import all domain modules
import * as userStorage from "./users";
import * as financialStorage from "./financial";
import * as gameStorage from "./games";
import * as liveGameStorage from "./live-games";
import * as socialStorage from "./social";
import * as p2pStorage from "./p2p";
import * as projectCurrencyStorage from "./project-currency";
import * as challengeQueryStorage from "./challenge-queries";
import * as resignationPayoutStorage from "./resignation-payout";
import * as achievementCrudStorage from "./achievement-crud";
import * as seasonsStorage from "./seasons";
import * as adminStorage from "./admin";
import * as notificationStorage from "./notifications";
import * as supportStorage from "./support";
import * as directMessageStorage from "./direct-messages";

// Compose the unified storage object
export const storage = {
  // Users
  ...userStorage,
  // Financial
  ...financialStorage,
  // Games
  ...gameStorage,
  // Live Games
  ...liveGameStorage,
  // Social
  ...socialStorage,
  // P2P Trading
  ...p2pStorage,
  // Project Currency
  ...projectCurrencyStorage,
  // Challenges
  ...challengeQueryStorage,
  // Resignation Payout
  ...resignationPayoutStorage,
  // Achievements
  ...achievementCrudStorage,
  // Seasons
  ...seasonsStorage,
  // Admin
  ...adminStorage,
  // Notifications & Announcements
  ...notificationStorage,
  // Support & Complaints
  ...supportStorage,
  // Direct Messages (realtime DM channel — Task #16)
  ...directMessageStorage,
};

// ==================== SEED MULTIPLAYER GAMES ====================

async function seedMultiplayerGames() {
  const existingGames = await storage.listMultiplayerGames();
  const existingKeys = new Set(existingGames.map((g) => g.key));

  const defaultGames: InsertMultiplayerGame[] = [
    {
      key: 'chess',
      nameEn: 'Chess',
      nameAr: 'شطرنج',
      descriptionEn: 'The classic game of strategy',
      descriptionAr: 'لعبة الإستراتيجية الكلاسيكية',
      iconName: 'Crown',
      colorClass: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
      gradientClass: 'from-amber-500/20 to-amber-600/10',
      isActive: true,
      minStake: '1.00',
      maxStake: '1000.00',
      houseFee: '0.05',
      minPlayers: 2,
      maxPlayers: 2,
      defaultTimeLimit: 600,
      isFeatured: true,
      sortOrder: 1,
    },
    {
      key: 'backgammon',
      nameEn: 'Backgammon',
      nameAr: 'طاولة',
      descriptionEn: 'Ancient game of dice and strategy',
      descriptionAr: 'لعبة النرد والإستراتيجية القديمة',
      iconName: 'Shuffle',
      colorClass: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
      gradientClass: 'from-emerald-500/20 to-emerald-600/10',
      isActive: true,
      minStake: '1.00',
      maxStake: '1000.00',
      houseFee: '0.05',
      minPlayers: 2,
      maxPlayers: 2,
      defaultTimeLimit: 600,
      isFeatured: true,
      sortOrder: 2,
    },
    {
      key: 'domino',
      nameEn: 'Domino',
      nameAr: 'دومينو',
      descriptionEn: 'Classic tile matching game',
      descriptionAr: 'لعبة مطابقة البلاط الكلاسيكية',
      iconName: 'Target',
      colorClass: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
      gradientClass: 'from-blue-500/20 to-blue-600/10',
      isActive: true,
      minStake: '1.00',
      maxStake: '1000.00',
      houseFee: '0.05',
      minPlayers: 2,
      maxPlayers: 4,
      defaultTimeLimit: 600,
      isFeatured: false,
      sortOrder: 3,
    },
    {
      key: 'tarneeb',
      nameEn: 'Tarneeb',
      nameAr: 'طرنيب',
      descriptionEn: 'Popular Middle Eastern trick-taking card game',
      descriptionAr: 'لعبة الورق الشرق أوسطية الشهيرة',
      iconName: 'Gem',
      colorClass: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
      gradientClass: 'from-purple-500/20 to-purple-600/10',
      isActive: true,
      minStake: '1.00',
      maxStake: '1000.00',
      houseFee: '0.05',
      minPlayers: 4,
      maxPlayers: 4,
      defaultTimeLimit: 900,
      isFeatured: false,
      sortOrder: 4,
    },
    {
      key: 'baloot',
      nameEn: 'Baloot',
      nameAr: 'بلوت',
      descriptionEn: 'Traditional Saudi Arabian card game',
      descriptionAr: 'لعبة الورق السعودية التقليدية',
      iconName: 'Gem',
      colorClass: 'bg-rose-500/20 text-rose-500 border-rose-500/30',
      gradientClass: 'from-rose-500/20 to-rose-600/10',
      isActive: true,
      minStake: '1.00',
      maxStake: '1000.00',
      houseFee: '0.05',
      minPlayers: 4,
      maxPlayers: 4,
      defaultTimeLimit: 900,
      isFeatured: false,
      sortOrder: 5,
    },
    {
      key: 'snake',
      nameEn: 'Snake Arena',
      nameAr: 'حلبة الثعبان',
      descriptionEn: 'Classic snake - eat, grow, survive',
      descriptionAr: 'لعبة الثعبان الكلاسيكية',
      iconName: 'Zap',
      colorClass: 'bg-green-500/20 text-green-500 border-green-500/30',
      gradientClass: 'from-green-500/20 to-green-600/10',
      category: 'arcade',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 1,
      maxPlayers: 1,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: true,
      sortOrder: 10,
    },
    {
      key: 'stack_tower',
      nameEn: 'Stack Tower',
      nameAr: 'برج المكعبات',
      descriptionEn: 'Stack blocks higher and higher',
      descriptionAr: 'كدّس المكعبات لأعلى ما يمكن',
      iconName: 'Award',
      colorClass: 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30',
      gradientClass: 'from-indigo-500/20 to-indigo-600/10',
      category: 'arcade',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 1,
      maxPlayers: 1,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: false,
      sortOrder: 11,
    },
    {
      key: 'aim_trainer',
      nameEn: 'Aim Trainer',
      nameAr: 'مدرب التصويب',
      descriptionEn: 'Test your reflexes and accuracy',
      descriptionAr: 'اختبر سرعة ردود فعلك ودقتك',
      iconName: 'Target',
      colorClass: 'bg-red-500/20 text-red-500 border-red-500/30',
      gradientClass: 'from-red-500/20 to-red-600/10',
      category: 'arcade',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 1,
      maxPlayers: 1,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: true,
      sortOrder: 12,
    },
    {
      key: 'pong',
      nameEn: 'Pong Duel',
      nameAr: 'مبارزة بونغ',
      descriptionEn: 'Classic 1v1 paddle battle',
      descriptionAr: 'مبارزة كلاسيكية بمضرب 1 ضد 1',
      iconName: 'CircleDot',
      colorClass: 'bg-cyan-500/20 text-cyan-500 border-cyan-500/30',
      gradientClass: 'from-cyan-500/20 to-cyan-600/10',
      category: 'multiplayer',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 1,
      maxPlayers: 2,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: false,
      sortOrder: 13,
    },
    {
      key: 'air_hockey',
      nameEn: 'Air Hockey',
      nameAr: 'هوكي الهواء',
      descriptionEn: 'Fast-paced 1v1 air hockey',
      descriptionAr: 'هوكي سريع 1 ضد 1',
      iconName: 'Trophy',
      colorClass: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
      gradientClass: 'from-blue-500/20 to-blue-600/10',
      category: 'multiplayer',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 1,
      maxPlayers: 2,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: true,
      sortOrder: 14,
    },
    {
      key: 'typing_duel',
      nameEn: 'Typing Duel',
      nameAr: 'مبارزة الكتابة',
      descriptionEn: 'Race to type faster than your opponent',
      descriptionAr: 'سابق خصمك بالكتابة الأسرع',
      iconName: 'Swords',
      colorClass: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
      gradientClass: 'from-purple-500/20 to-purple-600/10',
      category: 'multiplayer',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 1,
      maxPlayers: 2,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: false,
      sortOrder: 15,
    },
    {
      key: 'bomb_pass',
      nameEn: 'Bomb Pass',
      nameAr: 'تمرير القنبلة',
      descriptionEn: 'Hot potato - pass before it explodes!',
      descriptionAr: 'مرر القنبلة قبل أن تنفجر!',
      iconName: 'Bomb',
      colorClass: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
      gradientClass: 'from-amber-500/20 to-amber-600/10',
      category: 'multiplayer',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 2,
      maxPlayers: 8,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: true,
      sortOrder: 16,
    },
    {
      key: 'quiz_rush',
      nameEn: 'Quiz Rush',
      nameAr: 'سباق الأسئلة',
      descriptionEn: 'Trivia race - first correct wins',
      descriptionAr: 'سباق المعلومات - أول إجابة صحيحة تفوز',
      iconName: 'Sparkles',
      colorClass: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30',
      gradientClass: 'from-emerald-500/20 to-emerald-600/10',
      category: 'multiplayer',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 2,
      maxPlayers: 8,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: true,
      sortOrder: 17,
    },
    {
      key: 'dice_battle',
      nameEn: 'Dice Battle',
      nameAr: 'معركة النرد',
      descriptionEn: 'Roll, score, and outsmart everyone',
      descriptionAr: 'ارمِ النرد، اجمع نقاطاً، واخدع الجميع',
      iconName: 'Dices',
      colorClass: 'bg-rose-500/20 text-rose-500 border-rose-500/30',
      gradientClass: 'from-rose-500/20 to-rose-600/10',
      category: 'multiplayer',
      isActive: true,
      minStake: '0.10',
      maxStake: '50.00',
      priceVex: '5',
      houseFee: '0.05',
      minPlayers: 2,
      maxPlayers: 8,
      defaultTimeLimit: 300,
      freePlayLimit: 3,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: false,
      sortOrder: 18,
    },
    {
      key: 'ludo',
      nameEn: 'Ludo Stakes',
      nameAr: 'لودو الرهان',
      descriptionEn: 'Wallet-linked Ludo with atomic settlement',
      descriptionAr: 'لودو مرتبط بالمحفظة مع تسوية ذرّية',
      iconName: 'Target',
      colorClass: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
      gradientClass: 'from-orange-500/20 to-orange-600/10',
      category: 'multiplayer',
      isActive: true,
      minStake: '1.00',
      maxStake: '250.00',
      priceVex: '10',
      houseFee: '0.05',
      minPlayers: 2,
      maxPlayers: 4,
      defaultTimeLimit: 900,
      freePlayLimit: 0,
      freePlayPeriod: 'daily',
      displayLocations: ['home', 'games', 'featured'],
      isFeatured: true,
      sortOrder: 19,
    },
  ];

  const missingGames = defaultGames.filter((g) => !existingKeys.has(g.key));

  if (missingGames.length === 0) {
    logger.info('Multiplayer games already seeded');
    return;
  }

  for (const game of missingGames) {
    await storage.createMultiplayerGame(game);
  }

  // Bump config version so clients re-fetch the new game list
  // `getSystemConfig` returns a `SystemConfigType | undefined` row, not a
  // string — pull `.value` (which itself is nullable) before parsing.
  const currentVersionRow = await storage.getSystemConfig('multiplayer_games_version');
  const currentVersion = parseInt(currentVersionRow?.value ?? '0', 10) || 0;
  await storage.setSystemConfig('multiplayer_games_version', String(currentVersion + 1));

  logger.info(`Seeded ${missingGames.length} multiplayer games successfully`);
}

// Run seed on module load
seedMultiplayerGames().catch(err => logger.error('Failed to seed multiplayer games', err instanceof Error ? err : new Error(String(err))));
