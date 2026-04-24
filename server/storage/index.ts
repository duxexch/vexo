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
  if (existingGames.length > 0) {
    logger.info('Multiplayer games already seeded');
    return;
  }

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
  ];

  for (const game of defaultGames) {
    await storage.createMultiplayerGame(game);
  }

  // Set initial config version for multiplayer games
  await storage.setSystemConfig('multiplayer_games_version', '1');
  
  logger.info('Seeded multiplayer games successfully');
}

// Run seed on module load
seedMultiplayerGames().catch(err => logger.error('Failed to seed multiplayer games', err instanceof Error ? err : new Error(String(err))));
