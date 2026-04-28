import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, pgEnum, index, uniqueIndex, jsonb, type AnyPgColumn, foreignKey, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==================== ENUMS ====================

export const userRoleEnum = pgEnum("user_role", ["admin", "agent", "affiliate", "player"]);
export const userStatusEnum = pgEnum("user_status", ["active", "inactive", "suspended", "banned"]);
export const gameStatusEnum = pgEnum("game_status", ["active", "listed", "inactive", "maintenance"]);
export const gameVolatilityEnum = pgEnum("game_volatility", ["low", "medium", "high"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["deposit", "withdrawal", "stake", "win", "bonus", "commission", "refund", "gift_sent", "gift_received", "platform_fee", "game_refund", "currency_conversion"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "approved", "rejected", "completed", "cancelled"]);
export const complaintStatusEnum = pgEnum("complaint_status", ["open", "assigned", "in_progress", "escalated", "resolved", "closed"]);
export const complaintPriorityEnum = pgEnum("complaint_priority", ["low", "medium", "high", "urgent"]);
export const complaintCategoryEnum = pgEnum("complaint_category", ["financial", "technical", "account", "game", "other"]);
export const promoCodeTypeEnum = pgEnum("promo_code_type", ["percentage", "fixed", "free_spins"]);
export const paymentMethodTypeEnum = pgEnum("payment_method_type", ["bank_transfer", "e_wallet", "crypto", "card"]);
export const auditActionEnum = pgEnum("audit_action", ["login", "logout", "deposit", "withdrawal", "stake", "win", "complaint", "settings_change", "user_update", "game_update", "login_failed", "account_locked", "password_reset", "password_changed", "otp_requested", "otp_verified"]);
export const idVerificationStatusEnum = pgEnum("id_verification_status", ["pending", "approved", "rejected"]);
export const paymentOperationTypeEnum = pgEnum("payment_operation_type", [
  "deposit",
  "withdraw",
  "convert",
  "p2p_trade_create",
  "p2p_trade_pay",
  "p2p_trade_confirm",
]);
export const paymentOperationTokenStatusEnum = pgEnum("payment_operation_token_status", ["pending", "completed", "failed", "cancelled", "expired"]);
export const gameStateModeEnum = pgEnum("game_state_mode", ["LEGACY", "CANONICAL"]);

// ==================== ENUM TYPE HELPERS ====================
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type GameStatus = (typeof gameStatusEnum.enumValues)[number];
export type GameVolatility = (typeof gameVolatilityEnum.enumValues)[number];
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
export type TransactionStatus = (typeof transactionStatusEnum.enumValues)[number];
export type ComplaintStatus = (typeof complaintStatusEnum.enumValues)[number];
export type ComplaintPriority = (typeof complaintPriorityEnum.enumValues)[number];
export type ComplaintCategory = (typeof complaintCategoryEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];
export type PaymentMethodType = (typeof paymentMethodTypeEnum.enumValues)[number];
export type PromoCodeType = (typeof promoCodeTypeEnum.enumValues)[number];
export type AnnouncementStatus = (typeof announcementStatusEnum.enumValues)[number];
export type LiveGameStatus = (typeof liveGameStatusEnum.enumValues)[number];
export type AchievementCategory = (typeof achievementCategoryEnum.enumValues)[number];
export type ScheduledChangeStatus = (typeof scheduledChangeStatusEnum.enumValues)[number];
export type AdminAlertType = (typeof adminAlertTypeEnum.enumValues)[number];
export type AdminAlertSeverity = (typeof adminAlertSeverityEnum.enumValues)[number];
export type CurrencyConversionStatus = (typeof currencyConversionStatusEnum.enumValues)[number];
export type CurrencyLedgerType = (typeof currencyLedgerTypeEnum.enumValues)[number];
export type ReferralRewardType = (typeof referralRewardTypeEnum.enumValues)[number];
export type ReferralRewardStatus = (typeof referralRewardStatusEnum.enumValues)[number];
export type P2pDisputeStatus = (typeof p2pDisputeStatusEnum.enumValues)[number];
export type TournamentStatus = (typeof tournamentStatusEnum.enumValues)[number];
export type SupportTicketStatus = (typeof supportTicketStatusEnum.enumValues)[number];
export type AdminAuditAction = (typeof adminAuditActionEnum.enumValues)[number];
export type GameMatchStatus = (typeof gameMatchStatusEnum.enumValues)[number];
export type SupportStatus = (typeof supportStatusEnum.enumValues)[number];
export type DepositRequestStatus = (typeof depositRequestStatusEnum.enumValues)[number];
export type PaymentOperationType = (typeof paymentOperationTypeEnum.enumValues)[number];
export type PaymentOperationTokenStatus = (typeof paymentOperationTokenStatusEnum.enumValues)[number];
export type GameStateMode = (typeof gameStateModeEnum.enumValues)[number];
export type AccountRecoveryPurpose = "reactivate" | "restore_deleted";

// ==================== USERS ====================

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").unique(),
  username: text("username").notNull().unique(),
  usernameSelectedAt: timestamp("username_selected_at"),
  nickname: text("nickname").unique(),
  email: text("email").unique(),
  password: text("password").notNull(),
  profilePicture: text("profile_picture"),
  coverPhoto: text("cover_photo"),
  role: userRoleEnum("role").notNull().default("player"),
  status: userStatusEnum("status").notNull().default("active"),
  accountDisabledAt: timestamp("account_disabled_at"),
  accountDeletedAt: timestamp("account_deleted_at"),
  accountDeletionReason: text("account_deletion_reason"),
  accountRestoredAt: timestamp("account_restored_at"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone").unique(),
  phoneVerified: boolean("phone_verified").default(false),
  emailVerified: boolean("email_verified").default(false),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  balanceCurrency: text("balance_currency").notNull().default("USD"),
  balanceCurrencyLockedAt: timestamp("balance_currency_locked_at"),
  // Multi-currency wallet flags. When `multiCurrencyEnabled` is true, the
  // user may deposit / hold balances in any code from `allowedCurrencies`
  // (in addition to the primary `balanceCurrency`). Sub-wallet balances live
  // in `user_currency_wallets`. When false, the legacy single-currency
  // behaviour applies and the user can only operate in `balanceCurrency`.
  multiCurrencyEnabled: boolean("multi_currency_enabled").notNull().default(false),
  allowedCurrencies: text("allowed_currencies").array().notNull().default(sql`'{}'::text[]`),
  totalDeposited: decimal("total_deposited", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalWithdrawn: decimal("total_withdrawn", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalWagered: decimal("total_wagered", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalWon: decimal("total_won", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalEarnings: decimal("total_earnings", { precision: 15, scale: 2 }).notNull().default("0.00"),
  gamesPlayed: integer("games_played").notNull().default(0),
  gamesWon: integer("games_won").notNull().default(0),
  gamesLost: integer("games_lost").notNull().default(0),
  gamesDraw: integer("games_draw").notNull().default(0),
  chessPlayed: integer("chess_played").notNull().default(0),
  chessWon: integer("chess_won").notNull().default(0),
  backgammonPlayed: integer("backgammon_played").notNull().default(0),
  backgammonWon: integer("backgammon_won").notNull().default(0),
  dominoPlayed: integer("domino_played").notNull().default(0),
  dominoWon: integer("domino_won").notNull().default(0),
  tarneebPlayed: integer("tarneeb_played").notNull().default(0),
  tarneebWon: integer("tarneeb_won").notNull().default(0),
  balootPlayed: integer("baloot_played").notNull().default(0),
  balootWon: integer("baloot_won").notNull().default(0),
  currentWinStreak: integer("current_win_streak").notNull().default(0),
  longestWinStreak: integer("longest_win_streak").notNull().default(0),
  vipLevel: integer("vip_level").notNull().default(0),
  p2pBanned: boolean("p2p_banned").notNull().default(false),
  p2pBanReason: text("p2p_ban_reason"),
  p2pBannedAt: timestamp("p2p_banned_at"),
  // Per-user kill switch for the multi-currency wallet conversion feature
  // (Task #104). When true, this user cannot use POST /api/wallet/convert
  // even when the global toggle (`wallet_conversion.enabled` in app_settings)
  // is on. Used by admins to restrict abuse without disabling the feature
  // for everyone else. Default false = follows the global toggle.
  currencyConversionDisabled: boolean("currency_conversion_disabled").notNull().default(false),
  p2pRating: decimal("p2p_rating", { precision: 3, scale: 2 }).default("5.00"),
  p2pTotalTrades: integer("p2p_total_trades").notNull().default(0),
  p2pSuccessfulTrades: integer("p2p_successful_trades").notNull().default(0),
  idVerificationStatus: idVerificationStatusEnum("id_verification_status"),
  idFrontImage: text("id_front_image"),
  idBackImage: text("id_back_image"),
  idVerificationRejectionReason: text("id_verification_rejection_reason"),
  idVerifiedAt: timestamp("id_verified_at"),
  referredBy: varchar("referred_by").references((): AnyPgColumn => users.id),
  freePlayCount: integer("free_play_count").notNull().default(0),
  freePlayResetAt: timestamp("free_play_reset_at"),
  withdrawalPassword: text("withdrawal_password"),
  withdrawalPasswordEnabled: boolean("withdrawal_password_enabled").default(false),
  isOnline: boolean("is_online").notNull().default(false),
  stealthMode: boolean("stealth_mode").notNull().default(false),
  lastActiveAt: timestamp("last_active_at"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: timestamp("password_changed_at"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorVerifiedAt: timestamp("two_factor_verified_at"),
  registrationType: text("registration_type"),
  blockedUsers: text("blocked_users").array().notNull().default(sql`'{}'::text[]`),
  mutedUsers: text("muted_users").array().notNull().default(sql`'{}'::text[]`),
  // Per-conversation "notifications-only" mute. When peerId is in this
  // list the recipient still receives the message (realtime + history)
  // but no bell/push notification fires. Distinct from `mutedUsers`,
  // which suppresses the message itself.
  notificationMutedUsers: text("notification_muted_users").array().notNull().default(sql`'{}'::text[]`),
  // E2EE key pair
  e2eePublicKey: text("e2ee_public_key"),
  e2eeEncryptedPrivateKey: text("e2ee_encrypted_private_key"),
  e2eeKeyCreatedAt: timestamp("e2ee_key_created_at"),
  // Chat PIN lock
  chatPinHash: text("chat_pin_hash"),
  chatPinEnabled: boolean("chat_pin_enabled").notNull().default(false),
  chatPinFailedAttempts: integer("chat_pin_failed_attempts").notNull().default(0),
  chatPinLockedUntil: timestamp("chat_pin_locked_until"),
  chatPinSetAt: timestamp("chat_pin_set_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
}, (table) => [
  index("idx_users_role").on(table.role),
  index("idx_users_status").on(table.status),
  index("idx_users_referred_by").on(table.referredBy),
  index("idx_users_games_won").on(table.gamesWon),
  index("idx_users_total_earnings").on(table.totalEarnings),
  index("idx_users_longest_win_streak").on(table.longestWinStreak),
  index("idx_users_chess_won").on(table.chessWon),
  index("idx_users_backgammon_won").on(table.backgammonWon),
  index("idx_users_domino_won").on(table.dominoWon),
  index("idx_users_tarneeb_won").on(table.tarneebWon),
  index("idx_users_baloot_won").on(table.balootWon),
  index("idx_users_created_at").on(table.createdAt),
  index("idx_users_is_online").on(table.isOnline),
  index("idx_users_vip_level").on(table.vipLevel),
  check("chk_users_balance_non_negative", sql`${table.balance} >= 0`),
]);

export const usersRelations = relations(users, ({ one, many }) => ({
  referrer: one(users, { fields: [users.referredBy], references: [users.id] }),
  agent: one(agents, { fields: [users.id], references: [agents.userId] }),
  affiliate: one(affiliates, { fields: [users.id], references: [affiliates.userId] }),
  transactions: many(transactions),
  gameSessions: many(gameSessions),
  complaints: many(complaints),
  auditLogs: many(auditLogs),
}));

// ==================== OTP VERIFICATIONS ====================

export const otpContactTypeEnum = pgEnum("otp_contact_type", ["email", "phone"]);

export const otpVerifications = pgTable("otp_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactType: otpContactTypeEnum("contact_type").notNull(),
  contactValue: text("contact_value").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_otp_user_id").on(table.userId),
  index("idx_otp_expires_at").on(table.expiresAt),
]);

export const otpVerificationsRelations = relations(otpVerifications, ({ one }) => ({
  user: one(users, { fields: [otpVerifications.userId], references: [users.id] }),
}));

export const insertOtpVerificationSchema = createInsertSchema(otpVerifications).omit({
  id: true,
  createdAt: true,
});
export type InsertOtpVerification = z.infer<typeof insertOtpVerificationSchema>;
export type OtpVerification = typeof otpVerifications.$inferSelect;

// ==================== AGENTS ====================

export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  agentCode: text("agent_code").notNull().unique(),
  commissionRateDeposit: decimal("commission_rate_deposit", { precision: 5, scale: 4 }).notNull().default("0.02"),
  commissionRateWithdraw: decimal("commission_rate_withdraw", { precision: 5, scale: 4 }).notNull().default("0.01"),
  totalCommissionEarned: decimal("total_commission_earned", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalDepositsProcessed: decimal("total_deposits_processed", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalWithdrawalsProcessed: decimal("total_withdrawals_processed", { precision: 15, scale: 2 }).notNull().default("0.00"),
  dailyLimit: decimal("daily_limit", { precision: 15, scale: 2 }).notNull().default("100000.00"),
  monthlyLimit: decimal("monthly_limit", { precision: 15, scale: 2 }).notNull().default("1000000.00"),
  initialDeposit: decimal("initial_deposit", { precision: 15, scale: 2 }).notNull().default("0.00"),
  currentBalance: decimal("current_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  isOnline: boolean("is_online").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  assignedCustomersCount: integer("assigned_customers_count").notNull().default(0),
  performanceScore: decimal("performance_score", { precision: 5, scale: 2 }).notNull().default("100.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_agents_user_id").on(table.userId),
  index("idx_agents_is_active").on(table.isActive),
]);

export const agentsRelations = relations(agents, ({ one, many }) => ({
  user: one(users, { fields: [agents.userId], references: [users.id] }),
  paymentMethods: many(agentPaymentMethods),
  assignedComplaints: many(complaints),
  processedTransactions: many(transactions),
}));

// ==================== AGENT PAYMENT METHODS ====================

export const agentPaymentMethods = pgTable("agent_payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => agents.id),
  type: paymentMethodTypeEnum("type").notNull(),
  name: text("name").notNull(),
  accountNumber: text("account_number"),
  bankName: text("bank_name"),
  holderName: text("holder_name"),
  details: text("details"),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_agent_payment_methods_agent_id").on(table.agentId),
]);

export const agentPaymentMethodsRelations = relations(agentPaymentMethods, ({ one }) => ({
  agent: one(agents, { fields: [agentPaymentMethods.agentId], references: [agents.id] }),
}));

// ==================== AFFILIATES ====================

export const affiliates = pgTable("affiliates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  affiliateCode: text("affiliate_code").notNull().unique(),
  referralLink: text("referral_link"),
  marketerStatus: text("marketer_status").notNull().default("pending"),
  marketerBadgeGrantedAt: timestamp("marketer_badge_granted_at"),
  marketerBadgeGrantedBy: varchar("marketer_badge_granted_by").references(() => users.id),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull().default("5.00"),
  cpaEnabled: boolean("cpa_enabled").notNull().default(true),
  cpaAmount: decimal("cpa_amount", { precision: 15, scale: 2 }).notNull().default("5.00"),
  revshareEnabled: boolean("revshare_enabled").notNull().default(true),
  revshareRate: decimal("revshare_rate", { precision: 7, scale: 4 }).notNull().default("10.0000"),
  commissionHoldDays: integer("commission_hold_days").notNull().default(7),
  minQualifiedDeposits: decimal("min_qualified_deposits", { precision: 15, scale: 2 }).notNull().default("0.00"),
  minQualifiedWagered: decimal("min_qualified_wagered", { precision: 15, scale: 2 }).notNull().default("0.00"),
  minQualifiedGames: integer("min_qualified_games").notNull().default(0),
  totalReferrals: integer("total_referrals").notNull().default(0),
  activeReferrals: integer("active_referrals").notNull().default(0),
  totalCommissionEarned: decimal("total_commission_earned", { precision: 15, scale: 2 }).notNull().default("0.00"),
  pendingCommission: decimal("pending_commission", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalCpaEarned: decimal("total_cpa_earned", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalRevshareEarned: decimal("total_revshare_earned", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalWithdrawableCommission: decimal("total_withdrawable_commission", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalPaidCommission: decimal("total_paid_commission", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalClicks: integer("total_clicks").notNull().default(0),
  totalRegistrations: integer("total_registrations").notNull().default(0),
  totalDeposits: integer("total_deposits").notNull().default(0),
  tier: text("tier").notNull().default("bronze"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_affiliates_user_id").on(table.userId),
  index("idx_affiliates_code").on(table.affiliateCode),
  index("idx_affiliates_marketer_status").on(table.marketerStatus),
]);

export const affiliatesRelations = relations(affiliates, ({ one, many }) => ({
  user: one(users, { fields: [affiliates.userId], references: [users.id] }),
  promoCodes: many(promoCodes),
  linkAnalytics: many(linkAnalytics),
}));

// ==================== PROMO CODES ====================

export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  affiliateId: varchar("affiliate_id").references(() => affiliates.id),
  type: promoCodeTypeEnum("type").notNull().default("percentage"),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  minDeposit: decimal("min_deposit", { precision: 15, scale: 2 }).default("0.00"),
  maxDiscount: decimal("max_discount", { precision: 15, scale: 2 }),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  perUserLimit: integer("per_user_limit").default(1),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_promo_codes_code").on(table.code),
  index("idx_promo_codes_affiliate_id").on(table.affiliateId),
]);

export const promoCodesRelations = relations(promoCodes, ({ one, many }) => ({
  affiliate: one(affiliates, { fields: [promoCodes.affiliateId], references: [affiliates.id] }),
  usages: many(promoCodeUsages),
}));

// ==================== PROMO CODE USAGES ====================

export const promoCodeUsages = pgTable("promo_code_usages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promoCodeId: varchar("promo_code_id").notNull().references(() => promoCodes.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  transactionId: varchar("transaction_id").references(() => transactions.id),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).notNull(),
  usedAt: timestamp("used_at").notNull().defaultNow(),
}, (table) => [
  index("idx_promo_code_usages_promo_code_id").on(table.promoCodeId),
  index("idx_promo_code_usages_user_id").on(table.userId),
]);

export const promoCodeUsagesRelations = relations(promoCodeUsages, ({ one }) => ({
  promoCode: one(promoCodes, { fields: [promoCodeUsages.promoCodeId], references: [promoCodes.id] }),
  user: one(users, { fields: [promoCodeUsages.userId], references: [users.id] }),
  transaction: one(transactions, { fields: [promoCodeUsages.transactionId], references: [transactions.id] }),
}));

// ==================== LINK ANALYTICS ====================

export const linkAnalytics = pgTable("link_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  affiliateId: varchar("affiliate_id").notNull().references(() => affiliates.id),
  source: text("source"),
  medium: text("medium"),
  campaign: text("campaign"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  country: text("country"),
  city: text("city"),
  isRegistered: boolean("is_registered").notNull().default(false),
  isDeposited: boolean("is_deposited").notNull().default(false),
  registeredUserId: varchar("registered_user_id").references(() => users.id),
  clickedAt: timestamp("clicked_at").notNull().defaultNow(),
}, (table) => [
  index("idx_link_analytics_affiliate_id").on(table.affiliateId),
  index("idx_link_analytics_clicked_at").on(table.clickedAt),
]);

export const linkAnalyticsRelations = relations(linkAnalytics, ({ one }) => ({
  affiliate: one(affiliates, { fields: [linkAnalytics.affiliateId], references: [affiliates.id] }),
  registeredUser: one(users, { fields: [linkAnalytics.registeredUserId], references: [users.id] }),
}));

// ==================== MULTIPLAYER GAMES (Single Source of Truth) ====================

export const freePlayPeriodEnum = pgEnum("free_play_period", ["daily", "weekly", "monthly"]);

export const multiplayerGames = pgTable("multiplayer_games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // chess, backgammon, domino, tarneeb, baloot
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  descriptionEn: text("description_en"),
  descriptionAr: text("description_ar"),
  thumbnailUrl: text("thumbnail_url"),
  iconName: text("icon_name").notNull().default("Gamepad2"), // Lucide icon name
  colorClass: text("color_class").notNull().default("bg-primary/20 text-primary"), // Tailwind color classes
  gradientClass: text("gradient_class").default("from-primary/20 to-primary/10"),
  category: text("category").notNull().default("multiplayer"), // multiplayer, crash, dice, wheel, slots, jackpot
  status: gameStatusEnum("status").notNull().default("active"), // active, listed, inactive
  isActive: boolean("is_active").notNull().default(true),
  minStake: decimal("min_stake", { precision: 15, scale: 2 }).notNull().default("1.00"),
  maxStake: decimal("max_stake", { precision: 15, scale: 2 }).notNull().default("1000.00"),
  priceVex: decimal("price_vex", { precision: 15, scale: 2 }).notNull().default("0.00"), // Price in VEX coins
  houseFee: decimal("house_fee", { precision: 5, scale: 4 }).notNull().default("0.05"), // 5% = 0.05
  minPlayers: integer("min_players").notNull().default(2),
  maxPlayers: integer("max_players").notNull().default(2),
  defaultTimeLimit: integer("default_time_limit").notNull().default(300), // seconds
  freePlayLimit: integer("free_play_limit").notNull().default(0), // Number of free plays allowed
  freePlayPeriod: freePlayPeriodEnum("free_play_period").default("daily"), // Period for free play reset
  displayLocations: text("display_locations").array().notNull().default(sql`ARRAY['games']::text[]`), // home, games, challenges, featured
  isFeatured: boolean("is_featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  totalGamesPlayed: integer("total_games_played").notNull().default(0),
  totalVolume: decimal("total_volume", { precision: 20, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_multiplayer_games_key").on(table.key),
  index("idx_multiplayer_games_is_active").on(table.isActive),
  index("idx_multiplayer_games_sort_order").on(table.sortOrder),
  index("idx_multiplayer_games_category").on(table.category),
  index("idx_multiplayer_games_status").on(table.status),
]);

export const insertMultiplayerGameSchema = createInsertSchema(multiplayerGames).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalGamesPlayed: true,
  totalVolume: true,
});

export type InsertMultiplayerGame = z.infer<typeof insertMultiplayerGameSchema>;
export type MultiplayerGame = typeof multiplayerGames.$inferSelect;

// ==================== SYSTEM CONFIG (Configuration Versioning) ====================

export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value"),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertSystemConfigSchema = createInsertSchema(systemConfig);
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
export type SystemConfig = typeof systemConfig.$inferSelect;

// ==================== SCHEDULED CONFIG CHANGES ====================

export const scheduledChangeStatusEnum = pgEnum("scheduled_change_status", ["pending", "applied", "cancelled", "failed"]);
export const scheduledChangeActionEnum = pgEnum("scheduled_change_action", ["activate", "deactivate", "update_settings"]);

export const scheduledConfigChanges = pgTable("scheduled_config_changes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => multiplayerGames.id, { onDelete: "cascade" }),
  action: scheduledChangeActionEnum("action").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: scheduledChangeStatusEnum("status").notNull().default("pending"),
  changes: text("changes"), // JSON string of field changes for update_settings action
  description: text("description"), // Admin note about this change
  createdBy: varchar("created_by").notNull().references(() => users.id),
  appliedAt: timestamp("applied_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_scheduled_changes_game_id").on(table.gameId),
  index("idx_scheduled_changes_status").on(table.status),
  index("idx_scheduled_changes_scheduled_at").on(table.scheduledAt),
]);

export const scheduledConfigChangesRelations = relations(scheduledConfigChanges, ({ one }) => ({
  game: one(multiplayerGames, { fields: [scheduledConfigChanges.gameId], references: [multiplayerGames.id] }),
  creator: one(users, { fields: [scheduledConfigChanges.createdBy], references: [users.id] }),
}));

export const insertScheduledConfigChangeSchema = createInsertSchema(scheduledConfigChanges).omit({
  id: true,
  status: true,
  appliedAt: true,
  failureReason: true,
  createdAt: true,
});

export type InsertScheduledConfigChange = z.infer<typeof insertScheduledConfigChangeSchema>;
export type ScheduledConfigChange = typeof scheduledConfigChanges.$inferSelect;

// ==================== GAMES ====================

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category").notNull().default("slots"),
  sections: text("sections").array().notNull().default(sql`ARRAY['play']::text[]`),
  gameType: text("game_type").notNull().default("single"),
  status: gameStatusEnum("status").notNull().default("active"),
  rtp: decimal("rtp", { precision: 5, scale: 2 }).notNull().default("95.00"),
  houseEdge: decimal("house_edge", { precision: 5, scale: 2 }).notNull().default("5.00"),
  volatility: gameVolatilityEnum("volatility").notNull().default("medium"),
  minBet: decimal("min_bet", { precision: 15, scale: 2 }).notNull().default("1.00"),
  maxBet: decimal("max_bet", { precision: 15, scale: 2 }).notNull().default("1000.00"),
  multiplierMin: decimal("multiplier_min", { precision: 10, scale: 2 }).notNull().default("0.00"),
  multiplierMax: decimal("multiplier_max", { precision: 10, scale: 2 }).notNull().default("100.00"),
  playCount: integer("play_count").notNull().default(0),
  totalVolume: decimal("total_volume", { precision: 15, scale: 2 }).notNull().default("0.00"),
  isFeatured: boolean("is_featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  maxPlayers: integer("max_players").notNull().default(1),
  minPlayers: integer("min_players").notNull().default(1),
  isFreeToPlay: boolean("is_free_to_play").notNull().default(false),
  playPrice: decimal("play_price", { precision: 15, scale: 2 }).default("0.00"),
  pricingType: text("pricing_type").notNull().default("bet"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_games_status").on(table.status),
  index("idx_games_category").on(table.category),
  index("idx_games_game_type").on(table.gameType),
]);

export const gamesRelations = relations(games, ({ one, many }) => ({
  creator: one(users, { fields: [games.createdBy], references: [users.id] }),
  sessions: many(gameSessions),
}));

// ==================== EXTERNAL GAMES (Pluggable Game System) ====================

export const externalGameIntegrationEnum = pgEnum("external_game_integration", [
  "zip_upload",       // Upload ZIP file with HTML/JS/CSS game
  "external_url",     // Game hosted on external URL (iframe)
  "html_embed",       // Raw HTML/JS code pasted directly
  "cdn_assets",       // Game assets on CDN, entry point URL
  "api_bridge",       // Server-to-server API integration
  "git_repo",         // Pull from Git repository URL
  "pwa_app",          // Standalone PWA web app URL
]);

export const externalGameOrientationEnum = pgEnum("external_game_orientation", [
  "portrait", "landscape", "both"
]);

export const externalGames = pgTable("external_games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),                   // unique URL slug (e.g. "candy-crush")
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  descriptionEn: text("description_en"),
  descriptionAr: text("description_ar"),
  category: text("category").notNull().default("arcade"),  // arcade, puzzle, card, board, sports, casino, action, strategy, trivia
  tags: text("tags").array().default(sql`'{}'::text[]`),

  // Integration type
  integrationType: text("integration_type").notNull().default("zip_upload"),
  // For zip_upload: path to extracted files (e.g. /games/ext/candy-crush/)
  localPath: text("local_path"),
  // For external_url / cdn_assets / pwa_app: the URL
  externalUrl: text("external_url"),
  // For html_embed: raw HTML content stored
  htmlContent: text("html_content"),
  // For git_repo: repo URL + branch
  gitRepoUrl: text("git_repo_url"),
  gitBranch: text("git_branch").default("main"),
  // For api_bridge: API endpoint + secret key
  apiEndpoint: text("api_endpoint"),
  apiSecret: text("api_secret"),
  // Entry file within ZIP/repo (e.g. index.html)
  entryFile: text("entry_file").default("index.html"),

  // Display
  iconUrl: text("icon_url"),
  thumbnailUrl: text("thumbnail_url"),
  bannerUrl: text("banner_url"),
  screenshotUrls: text("screenshot_urls").array().default(sql`'{}'::text[]`),
  accentColor: text("accent_color").default("#6366f1"),
  orientation: text("orientation").default("both"),        // portrait, landscape, both

  // Game config
  minPlayers: integer("min_players").notNull().default(1),
  maxPlayers: integer("max_players").notNull().default(1),
  minBet: decimal("min_bet", { precision: 15, scale: 2 }).default("0.00"),
  maxBet: decimal("max_bet", { precision: 15, scale: 2 }).default("100.00"),
  isFreeToPlay: boolean("is_free_to_play").notNull().default(true),
  hasInGameCurrency: boolean("has_in_game_currency").notNull().default(false),
  sdkVersion: text("sdk_version").default("1.0"),
  // Economy modes: 'free' = no fee, 'fixed_fee' = deduct entryFee per session, 'prize' = pay minBet..maxBet for a chance to win prizeMultiplier×bet (house keeps housePercent)
  playMode: text("play_mode").notNull().default("free"),
  entryFee: decimal("entry_fee", { precision: 15, scale: 2 }).notNull().default("0.00"),
  prizeMultiplier: decimal("prize_multiplier", { precision: 6, scale: 2 }).notNull().default("1.80"),
  housePercent: decimal("house_percent", { precision: 5, scale: 2 }).notNull().default("10.00"),

  // Security / Sandbox
  sandboxPermissions: text("sandbox_permissions").default("allow-scripts allow-same-origin"),
  allowedOrigins: text("allowed_origins").array().default(sql`'{}'::text[]`),
  cspPolicy: text("csp_policy"),

  // Caching
  enableOffline: boolean("enable_offline").notNull().default(false),
  cacheMaxAge: integer("cache_max_age").notNull().default(86400),        // seconds
  totalSizeBytes: integer("total_size_bytes").default(0),

  // Stats
  playCount: integer("play_count").notNull().default(0),
  uniquePlayers: integer("unique_players").notNull().default(0),
  avgSessionSeconds: integer("avg_session_seconds").default(0),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0.00"),
  ratingCount: integer("rating_count").notNull().default(0),

  // Status & ordering
  status: gameStatusEnum("status").notNull().default("active"),
  isFeatured: boolean("is_featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),

  // Developer info
  developerName: text("developer_name"),
  developerUrl: text("developer_url"),
  version: text("version").default("1.0.0"),

  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_ext_games_slug").on(table.slug),
  index("idx_ext_games_status").on(table.status),
  index("idx_ext_games_category").on(table.category),
  index("idx_ext_games_integration").on(table.integrationType),
  index("idx_ext_games_sort").on(table.sortOrder),
]);

export const externalGamesRelations = relations(externalGames, ({ one }) => ({
  creator: one(users, { fields: [externalGames.createdBy], references: [users.id] }),
}));

export const insertExternalGameSchema = createInsertSchema(externalGames).omit({
  id: true,
  playCount: true,
  uniquePlayers: true,
  avgSessionSeconds: true,
  rating: true,
  ratingCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExternalGame = z.infer<typeof insertExternalGameSchema>;
export type ExternalGame = typeof externalGames.$inferSelect;

// External game play sessions
export const externalGameSessions = pgTable("external_game_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => externalGames.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionToken: text("session_token").notNull().unique(),    // unique token for PostMessage auth
  betAmount: decimal("bet_amount", { precision: 15, scale: 2 }).default("0.00"),
  winAmount: decimal("win_amount", { precision: 15, scale: 2 }).default("0.00"),
  score: integer("score").default(0),
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }),
  status: text("status").notNull().default("active"),  // active, completed, abandoned, error
  result: text("result"),                                // win, loss, draw, none
  metadata: jsonb("metadata"),                           // extra game-specific data
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
}, (table) => [
  index("idx_ext_sessions_game").on(table.gameId),
  index("idx_ext_sessions_user").on(table.userId),
  index("idx_ext_sessions_token").on(table.sessionToken),
  index("idx_ext_sessions_status").on(table.status),
]);

export const externalGameSessionsRelations = relations(externalGameSessions, ({ one }) => ({
  game: one(externalGames, { fields: [externalGameSessions.gameId], references: [externalGames.id] }),
  user: one(users, { fields: [externalGameSessions.userId], references: [users.id] }),
}));

export type ExternalGameSession = typeof externalGameSessions.$inferSelect;

// ==================== GAME SESSIONS ====================

export const gameSessions = pgTable("game_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  gameId: varchar("game_id").notNull().references(() => games.id),
  betAmount: decimal("bet_amount", { precision: 15, scale: 2 }).notNull(),
  multiplier: decimal("multiplier", { precision: 10, scale: 2 }).notNull(),
  winAmount: decimal("win_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  isWin: boolean("is_win").notNull(),
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).notNull(),
  seed: text("seed"),
  result: text("result"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_game_sessions_user_id").on(table.userId),
  index("idx_game_sessions_game_id").on(table.gameId),
  index("idx_game_sessions_created_at").on(table.createdAt),
]);

export const gameSessionsRelations = relations(gameSessions, ({ one }) => ({
  user: one(users, { fields: [gameSessions.userId], references: [users.id] }),
  game: one(games, { fields: [gameSessions.gameId], references: [games.id] }),
}));

// ==================== TRANSACTIONS ====================

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publicReference: text("public_reference").notNull().default(sql`UPPER('TXN-' || SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 16))`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: transactionTypeEnum("type").notNull(),
  status: transactionStatusEnum("status").notNull().default("pending"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  referenceId: text("reference_id"),
  // For multi-currency wallet users: which currency wallet this transaction
  // targets / originated from. NULL = legacy primary balance (USD-equivalent).
  walletCurrencyCode: text("wallet_currency_code"),
  processedBy: varchar("processed_by").references(() => agents.id),
  processedAt: timestamp("processed_at"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_transactions_user_id").on(table.userId),
  index("idx_transactions_type").on(table.type),
  index("idx_transactions_status").on(table.status),
  index("idx_transactions_created_at").on(table.createdAt),
  index("idx_transactions_user_date").on(table.userId, table.createdAt),
  // Composite index for the tournament refund banner lookup
  // (`server/routes/tournaments/listing.ts`: `loadUserRefundsByTournament`).
  // The query filters by user + type='refund' + reference_id IN (...), so a
  // (user_id, type, reference_id) index keeps it fast even for power users
  // with very large transaction histories.
  index("idx_transactions_user_type_reference").on(table.userId, table.type, table.referenceId),
  // Admin transactions screens (`/api/admin/transactions` listing + pending
  // tab) only ever look at type IN ('deposit','withdrawal'). A partial index
  // on that subset is dramatically smaller than a full-table composite and
  // serves the dominant access pattern: status filtered → exact match on the
  // leading column, then walk created_at in order (no separate sort needed).
  // When status is NOT filtered the index still prunes the heap to the
  // deposit/withdrawal subset (via bitmap scan), but Postgres still has to
  // sort the result by created_at because the leading key is status — that
  // path is acceptable only because the partial WHERE keeps the subset
  // small. Pending-tab queries (status='pending') are also handled by the
  // dedicated `idx_transactions_pending_created` partial index below.
  index("idx_transactions_admin_list")
    .on(table.status, table.createdAt)
    .where(sql`type IN ('deposit','withdrawal')`),
  // `storage.getPendingTransactions()` is `WHERE status='pending' ORDER BY
  // created_at ASC` (no type filter — used by the agent confirmation queue).
  // A partial index on the small pending subset, ordered by created_at,
  // gives sort-free top-N reads without bloating writes for the common
  // 'completed'/'rejected' rows.
  index("idx_transactions_pending_created")
    .on(table.createdAt)
    .where(sql`status = 'pending'`),
  // User-side history with a type filter (e.g. "show only my deposits") and
  // admin per-user drilldowns ("all 'win' transactions for user X"). The
  // existing (user_id, created_at) index has to filter type after the scan;
  // (user_id, type, created_at) lets the planner do an index-only walk.
  index("idx_transactions_user_type_created").on(table.userId, table.type, table.createdAt),
  uniqueIndex("uq_transactions_public_reference").on(table.publicReference),
  check("chk_transactions_amount_positive", sql`${table.amount} > 0`),
]);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  processor: one(agents, { fields: [transactions.processedBy], references: [agents.id] }),
}));

// ==================== FINANCIAL LIMITS ====================

export const financialLimits = pgTable("financial_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  vipLevel: integer("vip_level").notNull().default(0),
  minDeposit: decimal("min_deposit", { precision: 15, scale: 2 }).notNull().default("10.00"),
  maxDeposit: decimal("max_deposit", { precision: 15, scale: 2 }).notNull().default("10000.00"),
  minWithdrawal: decimal("min_withdrawal", { precision: 15, scale: 2 }).notNull().default("20.00"),
  maxWithdrawal: decimal("max_withdrawal", { precision: 15, scale: 2 }).notNull().default("5000.00"),
  dailyWithdrawalLimit: decimal("daily_withdrawal_limit", { precision: 15, scale: 2 }).notNull().default("10000.00"),
  monthlyWithdrawalLimit: decimal("monthly_withdrawal_limit", { precision: 15, scale: 2 }).notNull().default("100000.00"),
  minBet: decimal("min_bet", { precision: 15, scale: 2 }).notNull().default("1.00"),
  maxBet: decimal("max_bet", { precision: 15, scale: 2 }).notNull().default("1000.00"),
  dailyLossLimit: decimal("daily_loss_limit", { precision: 15, scale: 2 }),
  weeklyLossLimit: decimal("weekly_loss_limit", { precision: 15, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_financial_limits_vip_level").on(table.vipLevel),
]);

// ==================== COMPLAINTS ====================

export const complaints = pgTable("complaints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: text("ticket_number").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id),
  assignedAgentId: varchar("assigned_agent_id").references(() => agents.id),
  category: complaintCategoryEnum("category").notNull(),
  priority: complaintPriorityEnum("priority").notNull().default("medium"),
  status: complaintStatusEnum("status").notNull().default("open"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  transactionId: varchar("transaction_id").references(() => transactions.id),
  slaDeadline: timestamp("sla_deadline"),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  rating: integer("rating"),
  ratingComment: text("rating_comment"),
  escalatedAt: timestamp("escalated_at"),
  escalatedTo: varchar("escalated_to").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_complaints_user_id").on(table.userId),
  index("idx_complaints_assigned_agent_id").on(table.assignedAgentId),
  index("idx_complaints_status").on(table.status),
  index("idx_complaints_priority").on(table.priority),
  index("idx_complaints_created_at").on(table.createdAt),
]);

export const complaintsRelations = relations(complaints, ({ one, many }) => ({
  user: one(users, { fields: [complaints.userId], references: [users.id] }),
  assignedAgent: one(agents, { fields: [complaints.assignedAgentId], references: [agents.id] }),
  transaction: one(transactions, { fields: [complaints.transactionId], references: [transactions.id] }),
  escalatedToUser: one(users, { fields: [complaints.escalatedTo], references: [users.id] }),
  messages: many(complaintMessages),
  attachments: many(complaintAttachments),
}));

// ==================== COMPLAINT MESSAGES ====================

export const complaintMessages = pgTable("complaint_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  complaintId: varchar("complaint_id").notNull().references(() => complaints.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_complaint_messages_complaint_id").on(table.complaintId),
]);

export const complaintMessagesRelations = relations(complaintMessages, ({ one }) => ({
  complaint: one(complaints, { fields: [complaintMessages.complaintId], references: [complaints.id] }),
  sender: one(users, { fields: [complaintMessages.senderId], references: [users.id] }),
}));

// ==================== COMPLAINT ATTACHMENTS ====================

export const complaintAttachments = pgTable("complaint_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  complaintId: varchar("complaint_id").notNull().references(() => complaints.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
}, (table) => [
  index("idx_complaint_attachments_complaint_id").on(table.complaintId),
]);

export const complaintAttachmentsRelations = relations(complaintAttachments, ({ one }) => ({
  complaint: one(complaints, { fields: [complaintAttachments.complaintId], references: [complaints.id] }),
  uploader: one(users, { fields: [complaintAttachments.uploadedBy], references: [users.id] }),
}));

// ==================== AUDIT LOGS ====================

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: auditActionEnum("action").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_audit_logs_user_id").on(table.userId),
  index("idx_audit_logs_action").on(table.action),
  index("idx_audit_logs_created_at").on(table.createdAt),
]);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

// ==================== PAYMENT SECURITY (IP + OPERATION TOKEN) ====================

export const paymentIpBlocks = pgTable("payment_ip_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: text("ip_address").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  blockReason: text("block_reason").notNull(),
  autoBlocked: boolean("auto_blocked").notNull().default(true),
  blockedBy: varchar("blocked_by").references(() => users.id),
  unblockedBy: varchar("unblocked_by").references(() => users.id),
  metadata: text("metadata"),
  blockedAt: timestamp("blocked_at").notNull().defaultNow(),
  unblockedAt: timestamp("unblocked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_payment_ip_blocks_active").on(table.isActive),
  index("idx_payment_ip_blocks_blocked_at").on(table.blockedAt),
]);

export const paymentIpBlocksRelations = relations(paymentIpBlocks, ({ one }) => ({
  blocker: one(users, { fields: [paymentIpBlocks.blockedBy], references: [users.id] }),
  unblocker: one(users, { fields: [paymentIpBlocks.unblockedBy], references: [users.id] }),
}));

export const paymentIpActivities = pgTable("payment_ip_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: text("ip_address").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id),
  operation: paymentOperationTypeEnum("operation").notNull(),
  requestPath: text("request_path").notNull(),
  operationToken: text("operation_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_payment_ip_activities_ip").on(table.ipAddress),
  index("idx_payment_ip_activities_user").on(table.userId),
  index("idx_payment_ip_activities_operation").on(table.operation),
  index("idx_payment_ip_activities_created_at").on(table.createdAt),
]);

export const paymentIpActivitiesRelations = relations(paymentIpActivities, ({ one }) => ({
  user: one(users, { fields: [paymentIpActivities.userId], references: [users.id] }),
}));

export const paymentOperationTokens = pgTable("payment_operation_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id),
  operation: paymentOperationTypeEnum("operation").notNull(),
  status: paymentOperationTokenStatusEnum("status").notNull().default("pending"),
  ipAddress: text("ip_address"),
  requestPath: text("request_path").notNull(),
  requestHash: text("request_hash"),
  failureReason: text("failure_reason"),
  expiresAt: timestamp("expires_at").notNull(),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_payment_operation_tokens_user").on(table.userId),
  index("idx_payment_operation_tokens_operation").on(table.operation),
  index("idx_payment_operation_tokens_status").on(table.status),
  index("idx_payment_operation_tokens_expires_at").on(table.expiresAt),
]);

export const paymentOperationTokensRelations = relations(paymentOperationTokens, ({ one }) => ({
  user: one(users, { fields: [paymentOperationTokens.userId], references: [users.id] }),
}));

export const insertPaymentIpBlockSchema = createInsertSchema(paymentIpBlocks).omit({ id: true, blockedAt: true, createdAt: true, updatedAt: true });
export type InsertPaymentIpBlock = z.infer<typeof insertPaymentIpBlockSchema>;
export type PaymentIpBlock = typeof paymentIpBlocks.$inferSelect;

export const insertPaymentIpActivitySchema = createInsertSchema(paymentIpActivities).omit({ id: true, createdAt: true });
export type InsertPaymentIpActivity = z.infer<typeof insertPaymentIpActivitySchema>;
export type PaymentIpActivity = typeof paymentIpActivities.$inferSelect;

export const insertPaymentOperationTokenSchema = createInsertSchema(paymentOperationTokens).omit({ id: true, createdAt: true, finalizedAt: true });
export type InsertPaymentOperationToken = z.infer<typeof insertPaymentOperationTokenSchema>;
export type PaymentOperationToken = typeof paymentOperationTokens.$inferSelect;

// ==================== SYSTEM SETTINGS ====================

export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  category: text("category"),
  description: text("description"),
  dataType: text("data_type").default("string"),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ==================== PASSWORD RESET TOKENS ====================

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_password_reset_tokens_user_id").on(table.userId),
  index("idx_password_reset_tokens_token_hash").on(table.tokenHash),
]);

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

// ==================== ACCOUNT RECOVERY TOKENS ====================

export const accountRecoveryTokens = pgTable("account_recovery_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  purpose: text("purpose").notNull(), // reactivate | restore_deleted
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_account_recovery_tokens_user_id").on(table.userId),
  index("idx_account_recovery_tokens_purpose").on(table.purpose),
  index("idx_account_recovery_tokens_token_hash").on(table.tokenHash),
  index("idx_account_recovery_tokens_expires_at").on(table.expiresAt),
]);

export const accountRecoveryTokensRelations = relations(accountRecoveryTokens, ({ one }) => ({
  user: one(users, { fields: [accountRecoveryTokens.userId], references: [users.id] }),
}));

// ==================== ACTIVE SESSIONS ====================

export const activeSessions = pgTable("active_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenFingerprint: text("token_fingerprint").notNull(), // hash of token for lookup
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  deviceInfo: text("device_info"), // parsed device info
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_active_sessions_user_id").on(table.userId),
  index("idx_active_sessions_token_fp").on(table.tokenFingerprint),
  index("idx_active_sessions_active").on(table.isActive),
  index("idx_active_sessions_expires_at").on(table.expiresAt),
]);

export const activeSessionsRelations = relations(activeSessions, ({ one }) => ({
  user: one(users, { fields: [activeSessions.userId], references: [users.id] }),
}));

// ==================== 2FA BACKUP CODES ====================

export const twoFactorBackupCodes = pgTable("two_factor_backup_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_2fa_backup_user_id").on(table.userId),
]);

export const twoFactorBackupCodesRelations = relations(twoFactorBackupCodes, ({ one }) => ({
  user: one(users, { fields: [twoFactorBackupCodes.userId], references: [users.id] }),
}));

// ==================== DEPOSIT REQUESTS ====================

export const depositRequestStatusEnum = pgEnum("deposit_request_status", ["pending", "confirmed", "rejected", "expired"]);

export const depositRequests = pgTable("deposit_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  assignedAgentId: varchar("assigned_agent_id").references(() => agents.id),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  paymentMethod: text("payment_method").notNull(),
  paymentReference: text("payment_reference").notNull(),
  walletNumber: text("wallet_number"),
  status: depositRequestStatusEnum("status").notNull().default("pending"),
  minAmount: decimal("min_amount", { precision: 15, scale: 2 }),
  maxAmount: decimal("max_amount", { precision: 15, scale: 2 }),
  agentNote: text("agent_note"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_deposit_requests_user_id").on(table.userId),
  index("idx_deposit_requests_agent_id").on(table.assignedAgentId),
  index("idx_deposit_requests_status").on(table.status),
  index("idx_deposit_requests_created_at").on(table.createdAt),
]);

// ==================== LANGUAGES ====================

export const languages = pgTable("languages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nativeName: text("native_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ==================== CURRENCIES ====================

export const currencies = pgTable("currencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).notNull().default("1.000000"),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  country: text("country"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ==================== COUNTRY PAYMENT METHODS ====================

export const countryPaymentMethods = pgTable("country_payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: text("country_code").notNull(),
  currencyId: varchar("currency_id").references(() => currencies.id),
  name: text("name").notNull(),
  methodNumber: text("method_number").notNull().default(""),
  type: paymentMethodTypeEnum("type").notNull(),
  iconUrl: text("icon_url"),
  minAmount: decimal("min_amount", { precision: 15, scale: 2 }).notNull().default("10.00"),
  maxAmount: decimal("max_amount", { precision: 15, scale: 2 }).notNull().default("10000.00"),
  isAvailable: boolean("is_available").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  isWithdrawalEnabled: boolean("is_withdrawal_enabled").notNull().default(false),
  processingTime: text("processing_time"),
  instructions: text("instructions"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  index("idx_country_payment_methods_country").on(table.countryCode),
  index("idx_country_payment_methods_withdrawal_enabled").on(table.isWithdrawalEnabled),
]);

// ==================== FEATURE FLAGS (Section Control) ====================

export const featureFlags = pgTable("feature_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  category: text("category").notNull().default("section"),
  sortOrder: integer("sort_order").notNull().default(0),
  icon: text("icon"),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_feature_flags_key").on(table.key),
  index("idx_feature_flags_category").on(table.category),
]);

// ==================== ADMIN AUDIT LOGS ====================

export const adminAuditActionEnum = pgEnum("admin_audit_action", [
  "login", "logout", "login_failed", "account_locked", "password_reset",
  "user_update", "user_ban", "user_unban", "user_suspend", "user_balance_adjust",
  "reward_sent", "dispute_resolve", "theme_change", "section_toggle", "settings_update",
  "settings_change", "announcement_create", "announcement_update", "game_update", "promo_create",
  "p2p_ban", "p2p_unban", "p2p_offer_cancel", "p2p_dispute_resolve", "p2p_dispute_escalate", "p2p_dispute_close"
]);

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  action: adminAuditActionEnum("action").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_admin_audit_logs_admin").on(table.adminId),
  index("idx_admin_audit_logs_action").on(table.action),
  index("idx_admin_audit_logs_created_at").on(table.createdAt),
]);

export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  admin: one(users, { fields: [adminAuditLogs.adminId], references: [users.id] }),
}));

// ==================== THEMES ====================

export const themes = pgTable("themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  primaryColor: text("primary_color").notNull(),
  secondaryColor: text("secondary_color").notNull(),
  accentColor: text("accent_color").notNull(),
  backgroundColor: text("background_color").notNull(),
  foregroundColor: text("foreground_color").notNull(),
  cardColor: text("card_color").notNull(),
  mutedColor: text("muted_color").notNull(),
  borderColor: text("border_color").notNull(),
  // Task #195 — extended customization fields (all NULLABLE for backward compat).
  destructiveColor: text("destructive_color"),
  mode: text("mode"),
  fontHeading: text("font_heading"),
  fontBody: text("font_body"),
  radiusSm: text("radius_sm"),
  radiusMd: text("radius_md"),
  radiusLg: text("radius_lg"),
  shadowIntensity: text("shadow_intensity"),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ==================== SUPPORT CONTACTS ====================

export const supportContactTypeEnum = pgEnum("support_contact_type", [
  "whatsapp", "telegram", "email", "phone", "facebook", "instagram", "twitter", "discord", "other"
]);

export const supportContacts = pgTable("support_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: supportContactTypeEnum("type").notNull(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ==================== P2P ENUMS ====================

export const p2pOfferTypeEnum = pgEnum("p2p_offer_type", ["buy", "sell"]);
export const p2pOfferStatusEnum = pgEnum("p2p_offer_status", ["pending_approval", "active", "paused", "completed", "cancelled", "rejected"]);
export const p2pOfferVisibilityEnum = pgEnum("p2p_offer_visibility", ["public", "private_friend"]);
export const p2pDealKindEnum = pgEnum("p2p_deal_kind", ["standard_asset", "digital_product"]);
export const p2pOfferNegotiationStatusEnum = pgEnum("p2p_offer_negotiation_status", ["pending", "accepted", "rejected"]);
export const p2pTradeStatusEnum = pgEnum("p2p_trade_status", ["pending", "paid", "confirmed", "completed", "cancelled", "disputed"]);
export const p2pDisputeStatusEnum = pgEnum("p2p_dispute_status", ["open", "investigating", "resolved", "closed"]);
export const p2pFreezeRequestStatusEnum = pgEnum("p2p_freeze_request_status", ["pending", "approved", "rejected", "cancelled", "exhausted"]);

// ==================== P2P OFFERS ====================

export const p2pOffers = pgTable("p2p_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: p2pOfferTypeEnum("type").notNull(),
  status: p2pOfferStatusEnum("status").notNull().default("pending_approval"),
  visibility: p2pOfferVisibilityEnum("visibility").notNull().default("public"),
  dealKind: p2pDealKindEnum("deal_kind").notNull().default("standard_asset"),
  digitalProductType: text("digital_product_type"),
  exchangeOffered: text("exchange_offered"),
  exchangeRequested: text("exchange_requested"),
  supportMediationRequested: boolean("support_mediation_requested").notNull().default(false),
  requestedAdminFeePercentage: decimal("requested_admin_fee_percentage", { precision: 5, scale: 4 }),
  targetUserId: varchar("target_user_id").references(() => users.id),
  cryptoCurrency: text("crypto_currency").notNull(),
  fiatCurrency: text("fiat_currency").notNull(),
  // Wallet (sub-wallet) currency the seller's escrow is debited from / buyer is
  // credited to. NULL = legacy primary-balance path (`users.balance`). When set
  // the value matches `cryptoCurrency` and the seller's matching sub-wallet in
  // `user_currency_wallets` is used via `adjustUserCurrencyBalance`.
  walletCurrency: text("wallet_currency"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  availableAmount: decimal("available_amount", { precision: 15, scale: 8 }).notNull(),
  minLimit: decimal("min_limit", { precision: 15, scale: 2 }).notNull(),
  maxLimit: decimal("max_limit", { precision: 15, scale: 2 }).notNull(),
  paymentMethods: text("payment_methods").array(),
  paymentTimeLimit: integer("payment_time_limit").notNull().default(15),
  terms: text("terms"),
  autoReply: text("auto_reply"),
  moderationReason: text("moderation_reason"),
  counterResponse: text("counter_response"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  submittedForReviewAt: timestamp("submitted_for_review_at"),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  completedTrades: integer("completed_trades").notNull().default(0),
  completionRate: decimal("completion_rate", { precision: 5, scale: 2 }).notNull().default("100.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_offers_user_id").on(table.userId),
  index("idx_p2p_offers_target_user_id").on(table.targetUserId),
  index("idx_p2p_offers_type").on(table.type),
  index("idx_p2p_offers_deal_kind").on(table.dealKind),
  index("idx_p2p_offers_status").on(table.status),
  index("idx_p2p_offers_visibility").on(table.visibility),
  index("idx_p2p_offers_created_at").on(table.createdAt),
]);

// ==================== P2P OFFER NEGOTIATIONS ====================

export const p2pOfferNegotiations = pgTable("p2p_offer_negotiations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  offerId: varchar("offer_id").notNull().references(() => p2pOffers.id, { onDelete: "cascade" }),
  offerOwnerId: varchar("offer_owner_id").notNull().references(() => users.id),
  counterpartyUserId: varchar("counterparty_user_id").notNull().references(() => users.id),
  proposerId: varchar("proposer_id").notNull().references(() => users.id),
  previousNegotiationId: varchar("previous_negotiation_id").references((): AnyPgColumn => p2pOfferNegotiations.id),
  status: p2pOfferNegotiationStatusEnum("status").notNull().default("pending"),
  exchangeOffered: text("exchange_offered").notNull(),
  exchangeRequested: text("exchange_requested").notNull(),
  proposedTerms: text("proposed_terms").notNull(),
  supportMediationRequested: boolean("support_mediation_requested").notNull().default(false),
  adminFeePercentage: decimal("admin_fee_percentage", { precision: 5, scale: 4 }),
  rejectionReason: text("rejection_reason"),
  respondedBy: varchar("responded_by").references(() => users.id),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_offer_negotiations_offer_id").on(table.offerId),
  index("idx_p2p_offer_negotiations_owner_counterparty").on(table.offerOwnerId, table.counterpartyUserId),
  index("idx_p2p_offer_negotiations_status").on(table.status),
  index("idx_p2p_offer_negotiations_created_at").on(table.createdAt),
]);

// ==================== P2P TRADES ====================

export const p2pTrades = pgTable("p2p_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  offerId: varchar("offer_id").notNull().references(() => p2pOffers.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  dealKind: p2pDealKindEnum("deal_kind").notNull().default("standard_asset"),
  digitalProductType: text("digital_product_type"),
  exchangeOffered: text("exchange_offered"),
  exchangeRequested: text("exchange_requested"),
  negotiatedTerms: text("negotiated_terms"),
  supportMediationRequested: boolean("support_mediation_requested").notNull().default(false),
  negotiatedAdminFeePercentage: decimal("negotiated_admin_fee_percentage", { precision: 5, scale: 4 }),
  negotiationId: varchar("negotiation_id").references(() => p2pOfferNegotiations.id),
  status: p2pTradeStatusEnum("status").notNull().default("pending"),
  amount: decimal("amount", { precision: 15, scale: 8 }).notNull(),
  fiatAmount: decimal("fiat_amount", { precision: 15, scale: 2 }).notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentReference: text("payment_reference"),
  escrowAmount: decimal("escrow_amount", { precision: 15, scale: 8 }).notNull(),
  escrowEarnedAmount: decimal("escrow_earned_amount", { precision: 15, scale: 8 }).default("0"), // For project currency: earned portion
  escrowPurchasedAmount: decimal("escrow_purchased_amount", { precision: 15, scale: 8 }).default("0"), // For project currency: purchased portion
  platformFee: decimal("platform_fee", { precision: 15, scale: 8 }).notNull().default("0"),
  currencyType: text("currency_type").notNull().default("usd"), // 'usd' or 'project' (VEX Coin)
  // Sub-wallet currency for the seller's escrow / buyer credit. NULL = legacy
  // primary `users.balance` path. When set, the matching `user_currency_wallets`
  // row is debited/credited through `adjustUserCurrencyBalance` so multi-currency
  // sellers can offer in any of their allowed currencies.
  walletCurrency: text("wallet_currency"),
  expiresAt: timestamp("expires_at"),
  paidAt: timestamp("paid_at"),
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
  freezeHoursApplied: integer("freeze_hours_applied"),
  freezeReductionPercent: decimal("freeze_reduction_percent", { precision: 5, scale: 2 }),
  freezeUntil: timestamp("freeze_until"),
  freezeBenefitSourceRequestId: varchar("freeze_benefit_source_request_id"),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_trades_offer_id").on(table.offerId),
  index("idx_p2p_trades_buyer_id").on(table.buyerId),
  index("idx_p2p_trades_seller_id").on(table.sellerId),
  index("idx_p2p_trades_deal_kind").on(table.dealKind),
  index("idx_p2p_trades_negotiation_id").on(table.negotiationId),
  index("idx_p2p_trades_status").on(table.status),
  index("idx_p2p_trades_freeze_until").on(table.freezeUntil),
  index("idx_p2p_trades_created_at").on(table.createdAt),
]);

// ==================== P2P ESCROW ====================

export const p2pEscrow = pgTable("p2p_escrow", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id").notNull().references(() => p2pTrades.id),
  amount: decimal("amount", { precision: 15, scale: 8 }).notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("held"),
  heldAt: timestamp("held_at").notNull().defaultNow(),
  releasedAt: timestamp("released_at"),
  returnedAt: timestamp("returned_at"),
}, (table) => [
  index("idx_p2p_escrow_trade_id").on(table.tradeId),
  index("idx_p2p_escrow_status").on(table.status),
]);

// ==================== P2P DISPUTES ====================

export const p2pDisputes = pgTable("p2p_disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id").notNull().references(() => p2pTrades.id),
  initiatorId: varchar("initiator_id").notNull().references(() => users.id),
  respondentId: varchar("respondent_id").notNull().references(() => users.id),
  status: p2pDisputeStatusEnum("status").notNull().default("open"),
  reason: text("reason").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence").array(),
  resolution: text("resolution"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  winnerUserId: varchar("winner_user_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_disputes_trade_id").on(table.tradeId),
  index("idx_p2p_disputes_status").on(table.status),
]);

// ==================== P2P TRANSACTION LOGS ====================

export const p2pTransactionLogActionEnum = pgEnum("p2p_transaction_log_action", [
  "trade_created", "payment_marked", "payment_confirmed", "trade_completed",
  "trade_cancelled", "dispute_opened", "dispute_message", "evidence_uploaded",
  "dispute_resolved", "escrow_held", "escrow_released", "escrow_returned"
]);

export const p2pTransactionLogs = pgTable("p2p_transaction_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id").notNull().references(() => p2pTrades.id),
  disputeId: varchar("dispute_id").references(() => p2pDisputes.id),
  userId: varchar("user_id").references(() => users.id),
  action: p2pTransactionLogActionEnum("action").notNull(),
  description: text("description").notNull(),
  descriptionAr: text("description_ar"),
  metadata: text("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_transaction_logs_trade_id").on(table.tradeId),
  index("idx_p2p_transaction_logs_dispute_id").on(table.disputeId),
  index("idx_p2p_transaction_logs_created_at").on(table.createdAt),
]);

// ==================== P2P DISPUTE MESSAGES ====================

export const p2pDisputeMessages = pgTable("p2p_dispute_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  disputeId: varchar("dispute_id").notNull().references(() => p2pDisputes.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isPrewritten: boolean("is_prewritten").notNull().default(false),
  prewrittenTemplateId: varchar("prewritten_template_id"),
  isFromSupport: boolean("is_from_support").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_dispute_messages_dispute_id").on(table.disputeId),
  index("idx_p2p_dispute_messages_sender_id").on(table.senderId),
]);

// ==================== P2P TRADE MESSAGES ====================

export const p2pTradeMessages = pgTable("p2p_trade_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id").notNull().references(() => p2pTrades.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isPrewritten: boolean("is_prewritten").notNull().default(false),
  isSystemMessage: boolean("is_system_message").notNull().default(false),
  attachmentUrl: text("attachment_url"),
  attachmentType: text("attachment_type"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_trade_messages_trade_id").on(table.tradeId),
  index("idx_p2p_trade_messages_sender_id").on(table.senderId),
  index("idx_p2p_trade_messages_created_at").on(table.createdAt),
]);

// ==================== P2P DISPUTE EVIDENCE ====================

export const p2pDisputeEvidence = pgTable("p2p_dispute_evidence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  disputeId: varchar("dispute_id").notNull().references(() => p2pDisputes.id),
  uploaderId: varchar("uploader_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  description: text("description"),
  evidenceType: text("evidence_type").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  verifiedBy: varchar("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_dispute_evidence_dispute_id").on(table.disputeId),
  index("idx_p2p_dispute_evidence_uploader_id").on(table.uploaderId),
]);

// ==================== P2P PREWRITTEN RESPONSES ====================

export const p2pPrewrittenResponses = pgTable("p2p_prewritten_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  message: text("message").notNull(),
  messageAr: text("message_ar"),
  isActive: boolean("is_active").notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_prewritten_responses_category").on(table.category),
]);

// ==================== P2P DISPUTE RULES ====================

export const p2pDisputeRules = pgTable("p2p_dispute_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  content: text("content").notNull(),
  contentAr: text("content_ar"),
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_dispute_rules_category").on(table.category),
]);

// ==================== P2P FEE TYPE ENUM ====================

export const p2pFeeTypeEnum = pgEnum("p2p_fee_type", ["percentage", "fixed", "hybrid"]);

// ==================== P2P SETTINGS ====================

export const p2pSettings = pgTable("p2p_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Fee configuration
  feeType: p2pFeeTypeEnum("fee_type").notNull().default("percentage"),
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 5, scale: 4 }).notNull().default("0.005"),
  platformFeeFixed: decimal("platform_fee_fixed", { precision: 15, scale: 2 }).notNull().default("0.00"),
  minFee: decimal("min_fee", { precision: 15, scale: 2 }).notNull().default("0.00"),
  maxFee: decimal("max_fee", { precision: 15, scale: 2 }),
  // Trade limits
  minTradeAmount: decimal("min_trade_amount", { precision: 15, scale: 2 }).notNull().default("10.00"),
  maxTradeAmount: decimal("max_trade_amount", { precision: 15, scale: 2 }).notNull().default("100000.00"),
  p2pBuyCurrencies: text("p2p_buy_currencies").array().notNull().default(sql`ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP']::text[]`),
  p2pSellCurrencies: text("p2p_sell_currencies").array().notNull().default(sql`ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP']::text[]`),
  depositEnabledCurrencies: text("deposit_enabled_currencies").array().notNull().default(sql`ARRAY['USD','USDT','EUR','GBP','SAR','AED','EGP']::text[]`),
  // Timeouts
  escrowTimeoutHours: integer("escrow_timeout_hours").notNull().default(24),
  paymentTimeoutMinutes: integer("payment_timeout_minutes").notNull().default(15),
  autoExpireEnabled: boolean("auto_expire_enabled").notNull().default(true),
  // Status
  isEnabled: boolean("is_enabled").notNull().default(true),
  requireIdentityVerification: boolean("require_identity_verification").notNull().default(false),
  requirePhoneVerification: boolean("require_phone_verification").notNull().default(false),
  requireEmailVerification: boolean("require_email_verification").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const p2pFreezeProgramConfigs = pgTable("p2p_freeze_program_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  currencyCode: text("currency_code").notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  benefitRatePercent: decimal("benefit_rate_percent", { precision: 6, scale: 3 }).notNull().default("0.000"),
  baseReductionPercent: decimal("base_reduction_percent", { precision: 5, scale: 2 }).notNull().default("50.00"),
  maxReductionPercent: decimal("max_reduction_percent", { precision: 5, scale: 2 }).notNull().default("90.00"),
  minAmount: decimal("min_amount", { precision: 15, scale: 8 }).notNull().default("10.00000000"),
  maxAmount: decimal("max_amount", { precision: 15, scale: 8 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_freeze_program_configs_currency").on(table.currencyCode),
  index("idx_p2p_freeze_program_configs_enabled").on(table.isEnabled),
]);

export const p2pFreezeProgramMethods = pgTable("p2p_freeze_program_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id").notNull().references(() => p2pFreezeProgramConfigs.id, { onDelete: "cascade" }),
  countryPaymentMethodId: varchar("country_payment_method_id").notNull().references(() => countryPaymentMethods.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_freeze_program_methods_config").on(table.configId),
  index("idx_p2p_freeze_program_methods_method").on(table.countryPaymentMethodId),
  uniqueIndex("uniq_p2p_freeze_program_method").on(table.configId, table.countryPaymentMethodId),
]);

export const p2pFreezeRequests = pgTable("p2p_freeze_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  currencyCode: text("currency_code").notNull(),
  amount: decimal("amount", { precision: 15, scale: 8 }).notNull(),
  approvedAmount: decimal("approved_amount", { precision: 15, scale: 8 }).notNull().default("0.00000000"),
  remainingAmount: decimal("remaining_amount", { precision: 15, scale: 8 }).notNull().default("0.00000000"),
  benefitRatePercentSnapshot: decimal("benefit_rate_percent_snapshot", { precision: 6, scale: 3 }).notNull().default("0.000"),
  status: p2pFreezeRequestStatusEnum("status").notNull().default("pending"),
  countryPaymentMethodId: varchar("country_payment_method_id").notNull().references(() => countryPaymentMethods.id),
  payerName: text("payer_name"),
  paymentReference: text("payment_reference"),
  requestNote: text("request_note"),
  adminNote: text("admin_note"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_freeze_requests_user").on(table.userId),
  index("idx_p2p_freeze_requests_status").on(table.status),
  index("idx_p2p_freeze_requests_currency").on(table.currencyCode),
  index("idx_p2p_freeze_requests_created_at").on(table.createdAt),
]);

export const p2pFreezeBenefitConsumptions = pgTable("p2p_freeze_benefit_consumptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => p2pFreezeRequests.id, { onDelete: "cascade" }),
  tradeId: varchar("trade_id").notNull().references(() => p2pTrades.id),
  amountCovered: decimal("amount_covered", { precision: 15, scale: 8 }).notNull(),
  reductionPercent: decimal("reduction_percent", { precision: 5, scale: 2 }).notNull(),
  freezeHoursApplied: integer("freeze_hours_applied").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_freeze_benefit_consumptions_request").on(table.requestId),
  index("idx_p2p_freeze_benefit_consumptions_trade").on(table.tradeId),
  uniqueIndex("uniq_p2p_freeze_benefit_trade").on(table.tradeId),
]);

// ==================== P2P TRADER PROFILES ====================

export const p2pVerificationLevelEnum = pgEnum("p2p_verification_level", ["none", "email", "phone", "kyc_basic", "kyc_full"]);
export const p2pBadgeTypeEnum = pgEnum("p2p_badge_type", [
  "verified", "trusted_seller", "trusted_buyer", "fast_responder", "high_volume",
  "new_star", "dispute_free", "premium_trader", "top_rated"
]);

export const p2pTraderProfiles = pgTable("p2p_trader_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  displayName: text("display_name"),
  p2pUsername: text("p2p_username"),
  p2pUsernameChangeCount: integer("p2p_username_change_count").notNull().default(0),
  bio: text("bio"),
  region: text("region"),
  preferredCurrencies: text("preferred_currencies").array(),
  verificationLevel: p2pVerificationLevelEnum("verification_level").notNull().default("none"),
  canCreateOffers: boolean("can_create_offers").notNull().default(false),
  canTradeP2P: boolean("can_trade_p2p").notNull().default(false),
  monthlyTradeLimit: decimal("monthly_trade_limit", { precision: 15, scale: 2 }),
  isOnline: boolean("is_online").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at"),
  autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
  autoReplyMessage: text("auto_reply_message"),
  notifyOnTrade: boolean("notify_on_trade").notNull().default(true),
  notifyOnDispute: boolean("notify_on_dispute").notNull().default(true),
  notifyOnMessage: boolean("notify_on_message").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_trader_profiles_user_id").on(table.userId),
  index("idx_p2p_trader_profiles_verification").on(table.verificationLevel),
  uniqueIndex("uq_p2p_trader_profiles_p2p_username").on(table.p2pUsername),
]);

export const p2pTraderMetrics = pgTable("p2p_trader_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  totalTrades: integer("total_trades").notNull().default(0),
  completedTrades: integer("completed_trades").notNull().default(0),
  cancelledTrades: integer("cancelled_trades").notNull().default(0),
  completionRate: decimal("completion_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
  totalBuyTrades: integer("total_buy_trades").notNull().default(0),
  totalSellTrades: integer("total_sell_trades").notNull().default(0),
  totalVolumeUsdt: decimal("total_volume_usdt", { precision: 20, scale: 2 }).notNull().default("0.00"),
  totalDisputes: integer("total_disputes").notNull().default(0),
  disputesWon: integer("disputes_won").notNull().default(0),
  disputesLost: integer("disputes_lost").notNull().default(0),
  disputeRate: decimal("dispute_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
  avgReleaseTimeSeconds: integer("avg_release_time_seconds").notNull().default(0),
  avgPaymentTimeSeconds: integer("avg_payment_time_seconds").notNull().default(0),
  avgResponseTimeSeconds: integer("avg_response_time_seconds").notNull().default(0),
  positiveRatings: integer("positive_ratings").notNull().default(0),
  negativeRatings: integer("negative_ratings").notNull().default(0),
  overallRating: decimal("overall_rating", { precision: 3, scale: 2 }).notNull().default("0.00"),
  trades30d: integer("trades_30d").notNull().default(0),
  completion30d: decimal("completion_30d", { precision: 5, scale: 2 }).notNull().default("0.00"),
  volume30d: decimal("volume_30d", { precision: 20, scale: 2 }).notNull().default("0.00"),
  firstTradeAt: timestamp("first_trade_at"),
  lastTradeAt: timestamp("last_trade_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_trader_metrics_user_id").on(table.userId),
  index("idx_p2p_trader_metrics_completion_rate").on(table.completionRate),
  index("idx_p2p_trader_metrics_total_trades").on(table.totalTrades),
]);

export const p2pBadgeDefinitions = pgTable("p2p_badge_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description").notNull(),
  descriptionAr: text("description_ar"),
  icon: text("icon").notNull(),
  color: text("color").notNull().default("#00c853"),
  minTrades: integer("min_trades"),
  minCompletionRate: decimal("min_completion_rate", { precision: 5, scale: 2 }),
  minVolume: decimal("min_volume", { precision: 20, scale: 2 }),
  maxDisputeRate: decimal("max_dispute_rate", { precision: 5, scale: 2 }),
  maxResponseTime: integer("max_response_time"),
  requiresVerification: p2pVerificationLevelEnum("requires_verification"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const p2pTraderBadges = pgTable("p2p_trader_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  badgeSlug: text("badge_slug").notNull(),
  earnedAt: timestamp("earned_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  isDisplayed: boolean("is_displayed").notNull().default(true),
}, (table) => [
  index("idx_p2p_trader_badges_user_id").on(table.userId),
  index("idx_p2p_trader_badges_slug").on(table.badgeSlug),
  uniqueIndex("idx_p2p_trader_badges_unique").on(table.userId, table.badgeSlug),
]);

export const p2pTraderRatings = pgTable("p2p_trader_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id").notNull().references(() => p2pTrades.id),
  raterId: varchar("rater_id").notNull().references(() => users.id),
  ratedUserId: varchar("rated_user_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_trader_ratings_trade_id").on(table.tradeId),
  index("idx_p2p_trader_ratings_rated_user").on(table.ratedUserId),
  uniqueIndex("idx_p2p_trader_ratings_unique").on(table.tradeId, table.raterId),
  check("chk_p2p_rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
]);

export const p2pTraderPaymentMethods = pgTable("p2p_trader_payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: paymentMethodTypeEnum("type").notNull(),
  name: text("name").notNull(),
  displayLabel: text("display_label"),
  countryCode: text("country_code"),
  countryPaymentMethodId: varchar("country_payment_method_id").references(() => countryPaymentMethods.id),
  accountNumber: text("account_number"),
  bankName: text("bank_name"),
  holderName: text("holder_name"),
  details: text("details"),
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_p2p_trader_payment_methods_user_id").on(table.userId),
  index("idx_p2p_trader_payment_methods_country_code").on(table.countryCode),
  index("idx_p2p_trader_payment_methods_country_payment_method_id").on(table.countryPaymentMethodId),
]);

// ==================== NOTIFICATIONS ====================

export const notificationTypeEnum = pgEnum("notification_type", ["announcement", "transaction", "security", "promotion", "system", "p2p", "id_verification", "success", "warning"]);
export const notificationPriorityEnum = pgEnum("notification_priority", ["low", "normal", "high", "urgent"]);

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: notificationTypeEnum("type").notNull().default("system"),
  priority: notificationPriorityEnum("priority").notNull().default("normal"),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  message: text("message").notNull(),
  messageAr: text("message_ar"),
  link: text("link"),
  metadata: text("metadata"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_notifications_user_id").on(table.userId),
  index("idx_notifications_is_read").on(table.isRead),
  index("idx_notifications_type").on(table.type),
  index("idx_notifications_created_at").on(table.createdAt),
  index("idx_notifications_user_read_date").on(table.userId, table.isRead, table.createdAt),
]);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const webPushSubscriptions = pgTable("web_push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  expirationTime: timestamp("expiration_time"),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_web_push_subscriptions_endpoint_unique").on(table.endpoint),
  index("idx_web_push_subscriptions_user_id").on(table.userId),
  index("idx_web_push_subscriptions_active").on(table.isActive),
  index("idx_web_push_subscriptions_user_active").on(table.userId, table.isActive),
]);

export const webPushSubscriptionsRelations = relations(webPushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [webPushSubscriptions.userId], references: [users.id] }),
}));

// ==================== DEVICE PUSH TOKENS (APNs / FCM for VoIP + alerts) ====================
// Tracks native device tokens registered by Capacitor builds. iOS sends two
// distinct tokens per device (PushKit VoIP token + standard APNs token); we
// store them as separate rows distinguished by `kind` so the server can pick
// the right one (`voip` for incoming-call wakes, `apns` for non-call alerts,
// `fcm` for Android FCM).
export const devicePushTokens = pgTable("device_push_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  platform: varchar("platform").notNull(), // 'ios' | 'android'
  kind: varchar("kind").notNull(), // 'voip' | 'apns' | 'fcm'
  token: text("token").notNull(),
  bundleId: text("bundle_id"),
  appVersion: text("app_version"),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_device_push_tokens_token_kind_unique").on(table.token, table.kind),
  index("idx_device_push_tokens_user_id").on(table.userId),
  index("idx_device_push_tokens_user_active").on(table.userId, table.isActive),
  index("idx_device_push_tokens_user_kind_active").on(table.userId, table.kind, table.isActive),
]);

export const devicePushTokensRelations = relations(devicePushTokens, ({ one }) => ({
  user: one(users, { fields: [devicePushTokens.userId], references: [users.id] }),
}));

// ==================== USER SESSIONS ====================

export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionToken: text("session_token").notNull().unique(),
  deviceInfo: text("device_info"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  location: text("location"),
  isActive: boolean("is_active").notNull().default(true),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_user_sessions_user_id").on(table.userId),
  index("idx_user_sessions_token").on(table.sessionToken),
  index("idx_user_sessions_is_active").on(table.isActive),
]);

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
}));

// ==================== LOGIN HISTORY ====================

export const loginHistory = pgTable("login_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceInfo: text("device_info"),
  location: text("location"),
  isSuccess: boolean("is_success").notNull().default(true),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_login_history_user_id").on(table.userId),
  index("idx_login_history_created_at").on(table.createdAt),
]);

export const loginHistoryRelations = relations(loginHistory, ({ one }) => ({
  user: one(users, { fields: [loginHistory.userId], references: [users.id] }),
}));

// ==================== ANNOUNCEMENTS ====================

export const announcementStatusEnum = pgEnum("announcement_status", ["draft", "scheduled", "published", "archived"]);
export const announcementTargetEnum = pgEnum("announcement_target", ["all", "players", "agents", "affiliates", "vip"]);

export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  content: text("content").notNull(),
  contentAr: text("content_ar"),
  imageUrl: text("image_url"),
  link: text("link"),
  status: announcementStatusEnum("status").notNull().default("draft"),
  target: announcementTargetEnum("target").notNull().default("all"),
  priority: notificationPriorityEnum("priority").notNull().default("normal"),
  isPinned: boolean("is_pinned").notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_announcements_status").on(table.status),
  index("idx_announcements_target").on(table.target),
  index("idx_announcements_published_at").on(table.publishedAt),
]);

export const announcementsRelations = relations(announcements, ({ one }) => ({
  creator: one(users, { fields: [announcements.createdBy], references: [users.id] }),
}));

// ==================== ANNOUNCEMENT VIEWS ====================

export const announcementViews = pgTable("announcement_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").notNull().references(() => announcements.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  viewedAt: timestamp("viewed_at").notNull().defaultNow(),
}, (table) => [
  index("idx_announcement_views_announcement_id").on(table.announcementId),
  index("idx_announcement_views_user_id").on(table.userId),
  uniqueIndex("idx_announcement_views_unique").on(table.announcementId, table.userId),
]);

// ==================== USER PREFERENCES ====================

export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  language: text("language").notNull().default("en"),
  currency: text("currency").notNull().default("USD"),
  countryCode: text("country_code"),
  regionCode: text("region_code"),
  regionName: text("region_name"),
  city: text("city"),
  addressLine: text("address_line"),
  timezone: text("timezone").default("UTC"),
  notifyAnnouncements: boolean("notify_announcements").notNull().default(true),
  notifyTransactions: boolean("notify_transactions").notNull().default(true),
  notifyPromotions: boolean("notify_promotions").notNull().default(true),
  notifyP2P: boolean("notify_p2p").notNull().default(true),
  notifyChallengerActivity: boolean("notify_challenger_activity").notNull().default(true),
  emailNotifications: boolean("email_notifications").notNull().default(false),
  smsNotifications: boolean("sms_notifications").notNull().default(false),
  hideBalanceInLists: boolean("hide_balance_in_lists").notNull().default(false),
  // Task #17: when true, the in-game chat panel hides spectator messages
  // entirely so the player only sees fellow-player chat. The visual badge
  // on the bubble (eye icon + "Spectator") shows regardless of this flag.
  hideSpectatorChat: boolean("hide_spectator_chat").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_user_preferences_user_id").on(table.userId),
  index("idx_user_preferences_language").on(table.language),
  index("idx_user_preferences_country_code").on(table.countryCode),
  index("idx_user_preferences_region_code").on(table.regionCode),
]);

// ==================== CHALLENGER FOLLOWS ====================

export const challengerFollows = pgTable("challenger_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").notNull().references(() => users.id),
  followedId: varchar("followed_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_challenger_follows_follower").on(table.followerId),
  index("idx_challenger_follows_followed").on(table.followedId),
  uniqueIndex("idx_challenger_follows_unique").on(table.followerId, table.followedId),
]);

export const challengerFollowsRelations = relations(challengerFollows, ({ one }) => ({
  follower: one(users, { fields: [challengerFollows.followerId], references: [users.id] }),
  followed: one(users, { fields: [challengerFollows.followedId], references: [users.id] }),
}));

export const insertChallengerFollowSchema = createInsertSchema(challengerFollows).omit({ id: true, createdAt: true });
export type InsertChallengerFollow = z.infer<typeof insertChallengerFollowSchema>;
export type ChallengerFollow = typeof challengerFollows.$inferSelect;

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, { fields: [userPreferences.userId], references: [users.id] }),
}));

// ==================== CHALLENGE SYSTEM ====================

export const challenges = pgTable("challenges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameType: text("game_type").notNull(),
  betAmount: decimal("bet_amount", { precision: 20, scale: 8 }).notNull().default("0"),
  currencyType: text("currency_type").notNull().default("usd"), // usd, project (VEX Coin)
  visibility: text("visibility").notNull().default("public"), // public, private
  status: text("status").notNull().default("waiting"), // waiting, active, completed, cancelled
  player1Id: varchar("player1_id").notNull().references(() => users.id),
  player2Id: varchar("player2_id").references(() => users.id),
  player3Id: varchar("player3_id").references(() => users.id),
  player4Id: varchar("player4_id").references(() => users.id),
  requiredPlayers: integer("required_players").notNull().default(2), // 2 or 4 players
  currentPlayers: integer("current_players").notNull().default(1), // how many have joined
  winnerId: varchar("winner_id").references(() => users.id),
  opponentType: text("opponent_type").default("random"), // random, friend
  friendAccountId: text("friend_account_id"),
  dominoTargetScore: integer("domino_target_score"),
  nativeLanguageCode: text("native_language_code"),
  targetLanguageCode: text("target_language_code"),
  languageDuelMode: text("language_duel_mode"), // typed, spoken, mixed
  languageDuelPointsToWin: integer("language_duel_points_to_win"),
  timeLimit: integer("time_limit").notNull().default(300), // seconds
  player1Score: integer("player1_score").default(0),
  player2Score: integer("player2_score").default(0),
  player3Score: integer("player3_score").default(0),
  player4Score: integer("player4_score").default(0),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_challenges_player1").on(table.player1Id),
  index("idx_challenges_player2").on(table.player2Id),
  index("idx_challenges_player3").on(table.player3Id),
  index("idx_challenges_player4").on(table.player4Id),
  index("idx_challenges_status").on(table.status),
  index("idx_challenges_visibility").on(table.visibility),
  index("idx_challenges_game_type_created").on(table.gameType, table.createdAt),
  index("idx_challenges_status_visibility_created").on(table.status, table.visibility, table.createdAt),
  index("idx_challenges_status_created").on(table.status, table.createdAt),
  check("chk_challenges_bet_non_negative", sql`${table.betAmount} >= 0`),
  check("chk_challenges_required_players", sql`${table.requiredPlayers} IN (2, 4)`),
  check("chk_challenges_language_duel_mode", sql`${table.languageDuelMode} IS NULL OR ${table.languageDuelMode} IN ('typed', 'spoken', 'mixed')`),
  check("chk_challenges_language_duel_points_to_win", sql`${table.languageDuelPointsToWin} IS NULL OR (${table.languageDuelPointsToWin} >= 3 AND ${table.languageDuelPointsToWin} <= 30)`),
]);

export const challengeSpectatorBets = pgTable("challenge_spectator_bets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  spectatorId: varchar("spectator_id").notNull().references(() => users.id),
  backedPlayerId: varchar("backed_player_id").notNull().references(() => users.id),
  betAmount: decimal("bet_amount", { precision: 20, scale: 8 }).notNull(),
  currencyType: text("currency_type").notNull().default("usd"), // usd, project
  potentialWinnings: decimal("potential_winnings", { precision: 20, scale: 8 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, won, lost, refunded
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_spectator_bets_challenge").on(table.challengeId),
  index("idx_spectator_bets_spectator").on(table.spectatorId),
]);

export const challengeRatings = pgTable("challenge_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  totalChallenges: integer("total_challenges").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  totalEarnings: decimal("total_earnings", { precision: 20, scale: 8 }).notNull().default("0"),
  rank: text("rank").notNull().default("bronze"), // bronze, silver, gold, platinum, diamond
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_challenge_ratings_user").on(table.userId),
  index("idx_challenge_ratings_rank").on(table.rank),
]);

export const giftCatalog = pgTable("gift_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  iconUrl: text("icon_url"),
  category: text("category").default("general"), // general, love, celebration, gaming
  animationType: text("animation_type").default("float"), // float, burst, rain, spin
  coinValue: integer("coin_value").notNull().default(1), // value displayed during stream
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gift_catalog_category").on(table.category),
  index("idx_gift_catalog_active").on(table.isActive),
]);

export const userGiftInventory = pgTable("user_gift_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  giftId: varchar("gift_id").notNull().references(() => giftCatalog.id),
  quantity: integer("quantity").notNull().default(1),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gift_inventory_user").on(table.userId),
  index("idx_gift_inventory_gift").on(table.giftId),
]);

export const challengeGifts = pgTable("challenge_gifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  recipientId: varchar("recipient_id").notNull().references(() => users.id),
  giftId: varchar("gift_id").notNull().references(() => giftCatalog.id),
  quantity: integer("quantity").notNull().default(1),
  message: text("message"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
}, (table) => [
  index("idx_challenge_gifts_challenge").on(table.challengeId),
  index("idx_challenge_gifts_sender").on(table.senderId),
  index("idx_challenge_gifts_recipient").on(table.recipientId),
]);

export const challengeSpectators = pgTable("challenge_spectators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
}, (table) => [
  index("idx_challenge_spectators_challenge").on(table.challengeId),
  index("idx_challenge_spectators_user").on(table.userId),
  uniqueIndex("idx_challenge_spectators_unique").on(table.challengeId, table.userId),
]);

// ==================== CHALLENGE GAME SESSIONS ====================

export const challengeGameSessions = pgTable("challenge_game_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  gameType: text("game_type").notNull(),
  stateMode: gameStateModeEnum("state_mode").notNull().default("LEGACY"),
  currentTurn: varchar("current_turn").references(() => users.id),
  player1TimeRemaining: integer("player1_time_remaining").notNull().default(300),
  player2TimeRemaining: integer("player2_time_remaining").notNull().default(300),
  gameState: text("game_state"),
  status: text("status").notNull().default("waiting"),
  winnerId: varchar("winner_id").references(() => users.id),
  winReason: text("win_reason"),
  totalMoves: integer("total_moves").notNull().default(0),
  spectatorCount: integer("spectator_count").notNull().default(0),
  lastMoveAt: timestamp("last_move_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_game_sessions_challenge").on(table.challengeId),
  index("idx_game_sessions_status").on(table.status),
]);

export const chessMoves = pgTable("chess_moves", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => challengeGameSessions.id),
  playerId: varchar("player_id").notNull().references(() => users.id),
  moveNumber: integer("move_number").notNull(),
  fromSquare: text("from_square").notNull(),
  toSquare: text("to_square").notNull(),
  piece: text("piece").notNull(),
  capturedPiece: text("captured_piece"),
  isCheck: boolean("is_check").notNull().default(false),
  isCheckmate: boolean("is_checkmate").notNull().default(false),
  isCastling: boolean("is_castling").notNull().default(false),
  isEnPassant: boolean("is_en_passant").notNull().default(false),
  promotionPiece: text("promotion_piece"),
  fen: text("fen").notNull(),
  notation: text("notation").notNull(),
  timeSpent: integer("time_spent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chess_moves_session").on(table.sessionId),
  index("idx_chess_moves_player").on(table.playerId),
]);

export const dominoMoves = pgTable("domino_moves", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => challengeGameSessions.id),
  playerId: varchar("player_id").notNull().references(() => users.id),
  moveNumber: integer("move_number").notNull(),
  tileLeft: integer("tile_left").notNull(),
  tileRight: integer("tile_right").notNull(),
  placedEnd: text("placed_end"),
  isPassed: boolean("is_passed").notNull().default(false),
  boardState: text("board_state"),
  timeSpent: integer("time_spent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_domino_moves_session").on(table.sessionId),
  index("idx_domino_moves_player").on(table.playerId),
]);

export const challengeChatMessages = pgTable("challenge_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isQuickMessage: boolean("is_quick_message").notNull().default(false),
  quickMessageKey: text("quick_message_key"),
  isSpectator: boolean("is_spectator").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chat_messages_session").on(table.sessionId),
  index("idx_chat_messages_sender").on(table.senderId),
  foreignKey({ name: "ccm_session_id_fk", columns: [table.sessionId], foreignColumns: [challengeGameSessions.id] }),
]);

export const challengePointsLedger = pgTable("challenge_points_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  targetPlayerId: varchar("target_player_id").notNull().references(() => users.id),
  pointsAmount: integer("points_amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_points_ledger_challenge").on(table.challengeId),
  index("idx_points_ledger_user").on(table.userId),
  index("idx_points_ledger_target").on(table.targetPlayerId),
]);

export const challengeFollows = pgTable("challenge_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").notNull().references(() => users.id),
  followedId: varchar("followed_id").notNull().references(() => users.id),
  notifyOnMatch: boolean("notify_on_match").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_follows_follower").on(table.followerId),
  index("idx_follows_followed").on(table.followedId),
  uniqueIndex("idx_challenge_follows_unique").on(table.followerId, table.followedId),
]);

export const challengeFollowNotifications = pgTable("challenge_follow_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").notNull().references(() => users.id),
  challengerId: varchar("challenger_id").notNull().references(() => users.id),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_follow_notif_follower").on(table.followerId),
  index("idx_follow_notif_challenge").on(table.challengeId),
]);

// Backgammon moves table
export const backgammonMoves = pgTable("backgammon_moves", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => challengeGameSessions.id),
  playerId: varchar("player_id").notNull().references(() => users.id),
  moveNumber: integer("move_number").notNull(),
  fromPoint: integer("from_point").notNull(), // -1 = bar, 24 = bearing off
  toPoint: integer("to_point").notNull(),
  dieUsed: integer("die_used").notNull(),
  isHit: boolean("is_hit").notNull().default(false),
  isBearOff: boolean("is_bear_off").notNull().default(false),
  boardState: text("board_state"),
  timeSpent: integer("time_spent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_backgammon_moves_session").on(table.sessionId),
  index("idx_backgammon_moves_player").on(table.playerId),
]);

// Tarneeb/Baloot card plays table
export const cardGamePlays = pgTable("card_game_plays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => challengeGameSessions.id),
  playerId: varchar("player_id").notNull().references(() => users.id),
  roundNumber: integer("round_number").notNull(),
  trickNumber: integer("trick_number").notNull(),
  cardSuit: text("card_suit").notNull(),
  cardRank: text("card_rank").notNull(),
  playOrder: integer("play_order").notNull(),
  wonTrick: boolean("won_trick").notNull().default(false),
  timeSpent: integer("time_spent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_card_plays_session").on(table.sessionId),
  index("idx_card_plays_player").on(table.playerId),
]);

// Card game bids table
export const cardGameBids = pgTable("card_game_bids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => challengeGameSessions.id),
  playerId: varchar("player_id").notNull().references(() => users.id),
  roundNumber: integer("round_number").notNull(),
  bidValue: integer("bid_value"), // null = pass
  bidSuit: text("bid_suit"), // for Baloot hokm
  isPass: boolean("is_pass").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_card_bids_session").on(table.sessionId),
]);

export const insertChallengeGameSessionSchema = createInsertSchema(challengeGameSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertChallengeGameSession = z.infer<typeof insertChallengeGameSessionSchema>;
export type ChallengeGameSession = typeof challengeGameSessions.$inferSelect;

export const insertChessMoveSchema = createInsertSchema(chessMoves).omit({
  id: true,
  createdAt: true,
});
export type InsertChessMove = z.infer<typeof insertChessMoveSchema>;
export type ChessMove = typeof chessMoves.$inferSelect;

export const insertDominoMoveSchema = createInsertSchema(dominoMoves).omit({
  id: true,
  createdAt: true,
});
export type InsertDominoMove = z.infer<typeof insertDominoMoveSchema>;
export type DominoMove = typeof dominoMoves.$inferSelect;

export const insertChallengeChatMessageSchema = createInsertSchema(challengeChatMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertChallengeChatMessage = z.infer<typeof insertChallengeChatMessageSchema>;
export type ChallengeChatMessage = typeof challengeChatMessages.$inferSelect;

export const insertChallengePointsLedgerSchema = createInsertSchema(challengePointsLedger).omit({
  id: true,
  createdAt: true,
});
export type InsertChallengePointsLedger = z.infer<typeof insertChallengePointsLedgerSchema>;
export type ChallengePointsLedgerEntry = typeof challengePointsLedger.$inferSelect;

export const insertChallengeFollowSchema = createInsertSchema(challengeFollows).omit({
  id: true,
  createdAt: true,
});
export type InsertChallengeFollow = z.infer<typeof insertChallengeFollowSchema>;
export type ChallengeFollow = typeof challengeFollows.$inferSelect;

// ==================== APP SETTINGS ====================

export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value"),
  valueAr: text("value_ar"),
  category: text("category"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_app_settings_key").on(table.key),
  index("idx_app_settings_category").on(table.category),
]);

// ==================== LOGIN METHOD CONFIGS ====================

export const loginMethodConfigs = pgTable("login_method_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  method: text("method").notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  otpEnabled: boolean("otp_enabled").notNull().default(false),
  otpLength: integer("otp_length").notNull().default(6),
  otpExpiryMinutes: integer("otp_expiry_minutes").notNull().default(5),
  settings: text("settings"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_login_method_configs_method").on(table.method),
]);

// ==================== MANAGED LANGUAGES ====================

export const managedLanguages = pgTable("managed_languages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nativeName: text("native_name"),
  direction: text("direction").notNull().default("ltr"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  translations: text("translations"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_managed_languages_code").on(table.code),
  index("idx_managed_languages_is_active").on(table.isActive),
]);

// ==================== BADGE CATALOG ====================

export const badgeCatalog = pgTable("badge_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  iconUrl: text("icon_url"),
  iconName: text("icon_name"),
  color: text("color"),
  category: text("category"),
  requirement: text("requirement"),
  level: integer("level").notNull().default(1),
  p2pMonthlyLimit: decimal("p2p_monthly_limit", { precision: 15, scale: 2 }),
  challengeMaxAmount: decimal("challenge_max_amount", { precision: 15, scale: 2 }),
  grantsP2pPrivileges: boolean("grants_p2p_privileges").notNull().default(false),
  showOnProfile: boolean("show_on_profile").notNull().default(true),
  points: integer("points").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_badge_catalog_category").on(table.category),
  index("idx_badge_catalog_level").on(table.level),
  index("idx_badge_catalog_is_active").on(table.isActive),
]);

// ==================== USER BADGES ====================

export const userBadges = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  badgeId: varchar("badge_id").notNull().references(() => badgeCatalog.id),
  earnedAt: timestamp("earned_at").notNull().defaultNow(),
}, (table) => [
  index("idx_user_badges_user_id").on(table.userId),
  index("idx_user_badges_badge_id").on(table.badgeId),
  uniqueIndex("idx_user_badges_user_badge_unique").on(table.userId, table.badgeId),
]);

export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, { fields: [userBadges.userId], references: [users.id] }),
  badge: one(badgeCatalog, { fields: [userBadges.badgeId], references: [badgeCatalog.id] }),
}));

// ==================== USER RELATIONSHIPS ====================

export const userRelationships = pgTable("user_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  targetUserId: varchar("target_user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_user_relationships_user_id").on(table.userId),
  index("idx_user_relationships_target_user_id").on(table.targetUserId),
  index("idx_user_relationships_type").on(table.type),
  index("idx_user_relationships_status").on(table.status),
  uniqueIndex("idx_user_relationships_unique").on(table.userId, table.targetUserId, table.type),
]);

export const userRelationshipsRelations = relations(userRelationships, ({ one }) => ({
  user: one(users, { fields: [userRelationships.userId], references: [users.id] }),
  targetUser: one(users, { fields: [userRelationships.targetUserId], references: [users.id] }),
}));

// ==================== USER REPORTS ====================
//
// Task #148: spectator "Report" used to silently re-use the block endpoint, so
// moderators never saw the report. Each row here is one report dropped onto a
// queue admins can review. Kept intentionally small: reporter, reported user,
// where it came from (e.g. "spectator"), an optional reason / details, and a
// review-status that admins flip from "pending" to one of the terminal states.
export const userReportContextEnum = pgEnum("user_report_context", [
  "spectator", "chat", "profile", "other",
]);

export const userReportReasonEnum = pgEnum("user_report_reason", [
  "spam", "harassment", "cheating", "other",
]);

export const userReportStatusEnum = pgEnum("user_report_status", [
  "pending", "reviewed", "actioned", "dismissed",
]);

export const userReports = pgTable("user_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id").notNull().references(() => users.id),
  reportedUserId: varchar("reported_user_id").notNull().references(() => users.id),
  context: userReportContextEnum("context").notNull().default("other"),
  reason: userReportReasonEnum("reason"),
  details: text("details"),
  status: userReportStatusEnum("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_user_reports_reported_user_id").on(table.reportedUserId),
  index("idx_user_reports_reporter_id").on(table.reporterId),
  index("idx_user_reports_status").on(table.status),
  index("idx_user_reports_created_at").on(table.createdAt),
  // DB-level guard against duplicate pending reports from the same reporter
  // against the same target — closes the race window the app-level
  // check-then-insert dedupe can't cover.
  uniqueIndex("idx_user_reports_unique_pending")
    .on(table.reporterId, table.reportedUserId)
    .where(sql`status = 'pending'`),
]);

export const userReportsRelations = relations(userReports, ({ one }) => ({
  reporter: one(users, { fields: [userReports.reporterId], references: [users.id], relationName: "userReportReporter" }),
  reportedUser: one(users, { fields: [userReports.reportedUserId], references: [users.id], relationName: "userReportReported" }),
  reviewer: one(users, { fields: [userReports.reviewedBy], references: [users.id], relationName: "userReportReviewer" }),
}));

// ==================== CHAT MESSAGES ====================

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  receiverId: varchar("receiver_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  // E2EE fields
  encryptedContent: text("encrypted_content"),
  senderPublicKey: text("sender_public_key"),
  nonce: text("nonce"),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  // Media fields
  messageType: text("message_type").notNull().default("text"),
  attachmentUrl: text("attachment_url"),
  mediaUrl: text("media_url"),
  mediaThumbnailUrl: text("media_thumbnail_url"),
  mediaSize: integer("media_size"),
  mediaMimeType: text("media_mime_type"),
  mediaOriginalName: text("media_original_name"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  isDisappearing: boolean("is_disappearing").notNull().default(false),
  disappearAfterRead: boolean("disappear_after_read").notNull().default(false),
  // Auto-delete
  autoDeleteAt: timestamp("auto_delete_at"),
  deletedAt: timestamp("deleted_at"),
  // Reply / Edit / Reactions (Telegram-grade features)
  replyToId: varchar("reply_to_id"),
  isEdited: boolean("is_edited").notNull().default(false),
  editedAt: timestamp("edited_at"),
  reactions: jsonb("reactions").$type<Record<string, string[]>>(),
  deletedForUsers: text("deleted_for_users").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chat_messages_sender_id").on(table.senderId),
  index("idx_chat_messages_receiver_id").on(table.receiverId),
  index("idx_chat_messages_created_at").on(table.createdAt),
  index("idx_chat_messages_auto_delete").on(table.autoDeleteAt),
  index("idx_chat_messages_conversation").on(table.senderId, table.receiverId, table.createdAt),
  index("idx_chat_messages_unread").on(table.receiverId, table.senderId, table.isRead),
]);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
  receiver: one(users, { fields: [chatMessages.receiverId], references: [users.id] }),
}));

// ==================== BROADCAST NOTIFICATIONS ====================

export const broadcastNotifications = pgTable("broadcast_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  content: text("content").notNull(),
  contentAr: text("content_ar"),
  targetType: text("target_type").notNull(),
  targetValue: text("target_value"),
  sentBy: varchar("sent_by").references(() => users.id),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_broadcast_notifications_target_type").on(table.targetType),
  index("idx_broadcast_notifications_sent_at").on(table.sentAt),
]);

export const broadcastNotificationsRelations = relations(broadcastNotifications, ({ one }) => ({
  sender: one(users, { fields: [broadcastNotifications.sentBy], references: [users.id] }),
}));

// ==================== CHAT SETTINGS ====================

export const chatSettings = pgTable("chat_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chat_settings_key").on(table.key),
]);

// ==================== GAMEPLAY SETTINGS ====================

export const gameplaySettings = pgTable("gameplay_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  descriptionAr: text("description_ar"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gameplay_settings_key").on(table.key),
]);

// ==================== MATCHMAKING QUEUE ====================

export const matchTypeEnum = pgEnum("match_type", ["random", "friend"]);
export const matchmakingStatusEnum = pgEnum("matchmaking_status", ["waiting", "matched", "expired", "cancelled"]);
export const gameMatchStatusEnum = pgEnum("game_match_status", ["pending", "in_progress", "completed", "cancelled"]);

export const matchmakingQueue = pgTable("matchmaking_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  matchType: matchTypeEnum("match_type").notNull().default("random"),
  friendAccountId: varchar("friend_account_id"),
  status: matchmakingStatusEnum("status").notNull().default("waiting"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_matchmaking_queue_game_id").on(table.gameId),
  index("idx_matchmaking_queue_user_id").on(table.userId),
  index("idx_matchmaking_queue_status").on(table.status),
]);

export const matchmakingQueueRelations = relations(matchmakingQueue, ({ one }) => ({
  game: one(games, { fields: [matchmakingQueue.gameId], references: [games.id] }),
  user: one(users, { fields: [matchmakingQueue.userId], references: [users.id] }),
}));

// ==================== GAME MATCHES ====================

export const gameMatches = pgTable("game_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").notNull().references(() => games.id),
  player1Id: varchar("player1_id").notNull().references(() => users.id),
  player2Id: varchar("player2_id").notNull().references(() => users.id),
  status: gameMatchStatusEnum("status").notNull().default("pending"),
  winnerId: varchar("winner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_game_matches_game_id").on(table.gameId),
  index("idx_game_matches_player1_id").on(table.player1Id),
  index("idx_game_matches_player2_id").on(table.player2Id),
  index("idx_game_matches_status").on(table.status),
]);

export const gameMatchesRelations = relations(gameMatches, ({ one }) => ({
  game: one(games, { fields: [gameMatches.gameId], references: [games.id] }),
  player1: one(users, { fields: [gameMatches.player1Id], references: [users.id] }),
  player2: one(users, { fields: [gameMatches.player2Id], references: [users.id] }),
  winner: one(users, { fields: [gameMatches.winnerId], references: [users.id] }),
}));

// ==================== SAM9 LEARNING TABLES ====================
// Persistent storage for the Sam9 AI agent: per-player skill profiles,
// per-match outcome records, and in-game banter dedup log. Lets Sam9
// remember every customer it has played with and learn over time.

export const sam9PlayerProfiles = pgTable("sam9_player_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  // Computed skill tier (newbie | casual | regular | strong | expert).
  skillTier: text("skill_tier").notNull().default("casual"),
  // 0..1 estimated mastery aggregated across games this player touches.
  masteryScore: decimal("mastery_score", { precision: 4, scale: 3 }).notNull().default("0.500"),
  // Per-game mastery breakdown stored as JSON: { domino: 0.4, chess: 0.7, ... }
  gameMastery: jsonb("game_mastery").notNull().default(sql`'{}'::jsonb`),
  // Aggregated win-rate vs Sam9 specifically (across all games).
  vsSam9Played: integer("vs_sam9_played").notNull().default(0),
  vsSam9Won: integer("vs_sam9_won").notNull().default(0),
  vsSam9Lost: integer("vs_sam9_lost").notNull().default(0),
  vsSam9Draw: integer("vs_sam9_draw").notNull().default(0),
  // Last 10 outcomes vs Sam9 — drives engagement balancing decisions.
  recentForm: text("recent_form").array().notNull().default(sql`'{}'::text[]`),
  // Computed engagement score 0..100 — high means player keeps coming back.
  engagementScore: decimal("engagement_score", { precision: 5, scale: 2 }).notNull().default("50.00"),
  // Latest engagement plan Sam9 chose (e.g. for the admin readout).
  lastEngagementPlan: jsonb("last_engagement_plan").notNull().default(sql`'{}'::jsonb`),
  // Account-derived facts at last refresh (cheap snapshot to avoid join on hot path).
  vipLevel: integer("vip_level").notNull().default(0),
  accountAgeDays: integer("account_age_days").notNull().default(0),
  isNewbie: boolean("is_newbie").notNull().default(true),
  // Cached preferred game type (Sam9 picks banter flavor from this).
  preferredGameType: text("preferred_game_type"),
  // When the snapshot was last refreshed from `users` + `sam9_match_records`.
  refreshedAt: timestamp("refreshed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_sam9_profiles_user_id").on(table.userId),
  index("idx_sam9_profiles_skill_tier").on(table.skillTier),
  index("idx_sam9_profiles_engagement").on(table.engagementScore),
  index("idx_sam9_profiles_refreshed_at").on(table.refreshedAt),
]);

export const sam9MatchRecords = pgTable("sam9_match_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // The live game session id (varchar) — kept as plain text since session
  // lifetimes are managed elsewhere and we don't want CASCADE coupling.
  sessionId: varchar("session_id").notNull(),
  humanUserId: varchar("human_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  botUserId: varchar("bot_user_id").notNull().references(() => users.id),
  gameType: text("game_type").notNull(),
  // Snapshot of player profile at match start (JSON), so we can replay
  // Sam9's reasoning later if a customer complains.
  profileSnapshot: jsonb("profile_snapshot").notNull().default(sql`'{}'::jsonb`),
  baseDifficulty: text("base_difficulty").notNull(),
  effectiveDifficulty: text("effective_difficulty").notNull(),
  // Engagement plan applied to this match (mistake bias, think-time mult, banter mood).
  engagementPlan: jsonb("engagement_plan").notNull().default(sql`'{}'::jsonb`),
  // 'win' | 'loss' | 'draw' | 'abandon' (from the human player's perspective).
  outcome: text("outcome"),
  // Sam9's average decision confidence across the match (0..1).
  avgConfidence: decimal("avg_confidence", { precision: 4, scale: 3 }),
  totalMoves: integer("total_moves").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
}, (table) => [
  index("idx_sam9_matches_human_user_id").on(table.humanUserId),
  index("idx_sam9_matches_bot_user_id").on(table.botUserId),
  index("idx_sam9_matches_session_id").on(table.sessionId),
  index("idx_sam9_matches_game_type").on(table.gameType),
  index("idx_sam9_matches_started_at").on(table.startedAt),
]);

export const sam9BanterLog = pgTable("sam9_banter_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  humanUserId: varchar("human_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // The phrase key Sam9 used (avoids picking the same phrase twice in the
  // same session and same player streak).
  phraseKey: text("phrase_key").notNull(),
  // The trigger context: 'opening' | 'good_player_move' | 'good_own_move'
  // | 'losing' | 'winning' | 'on_player_win' | 'on_player_loss' | 'draw'.
  triggerContext: text("trigger_context").notNull(),
  // The actual rendered Arabic text emitted (for audit / dedup display).
  renderedText: text("rendered_text").notNull(),
  emittedAt: timestamp("emitted_at").notNull().defaultNow(),
}, (table) => [
  index("idx_sam9_banter_session_id").on(table.sessionId),
  index("idx_sam9_banter_user_id").on(table.humanUserId),
  index("idx_sam9_banter_emitted_at").on(table.emittedAt),
]);

export const sam9PlayerProfilesRelations = relations(sam9PlayerProfiles, ({ one }) => ({
  user: one(users, { fields: [sam9PlayerProfiles.userId], references: [users.id] }),
}));

export const sam9MatchRecordsRelations = relations(sam9MatchRecords, ({ one }) => ({
  human: one(users, { fields: [sam9MatchRecords.humanUserId], references: [users.id] }),
  bot: one(users, { fields: [sam9MatchRecords.botUserId], references: [users.id] }),
}));

export const sam9BanterLogRelations = relations(sam9BanterLog, ({ one }) => ({
  human: one(users, { fields: [sam9BanterLog.humanUserId], references: [users.id] }),
}));

// ==================== INSERT SCHEMAS ====================

export const insertMatchmakingQueueSchema = createInsertSchema(matchmakingQueue).omit({ id: true, createdAt: true });
export const insertGameMatchSchema = createInsertSchema(gameMatches).omit({ id: true, createdAt: true });

export const insertChallengeSchema = createInsertSchema(challenges).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChallengeSpectatorBetSchema = createInsertSchema(challengeSpectatorBets).omit({ id: true, createdAt: true });
export const insertChallengeRatingSchema = createInsertSchema(challengeRatings).omit({ id: true, updatedAt: true });
export const insertGiftCatalogSchema = createInsertSchema(giftCatalog).omit({ id: true, createdAt: true });
export const insertUserGiftInventorySchema = createInsertSchema(userGiftInventory).omit({ id: true, purchasedAt: true, updatedAt: true });
export const insertChallengeGiftSchema = createInsertSchema(challengeGifts).omit({ id: true, sentAt: true });
export const insertChallengeSpectatorSchema = createInsertSchema(challengeSpectators).omit({ id: true, joinedAt: true });

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertWebPushSubscriptionSchema = createInsertSchema(webPushSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
  isActive: true,
});
export const insertUserSessionSchema = createInsertSchema(userSessions).omit({ id: true, createdAt: true });
export const insertLoginHistorySchema = createInsertSchema(loginHistory).omit({ id: true, createdAt: true });
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnnouncementViewSchema = createInsertSchema(announcementViews).omit({ id: true });
export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({ id: true, updatedAt: true });

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAgentSchema = createInsertSchema(agents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAffiliateSchema = createInsertSchema(affiliates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGameSchema = createInsertSchema(games).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertComplaintSchema = createInsertSchema(complaints).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true, createdAt: true });
export const insertGameSessionSchema = createInsertSchema(gameSessions).omit({ id: true, createdAt: true });
export const insertAgentPaymentMethodSchema = createInsertSchema(agentPaymentMethods).omit({ id: true, createdAt: true });
export const insertComplaintMessageSchema = createInsertSchema(complaintMessages).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertFinancialLimitSchema = createInsertSchema(financialLimits).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });
export const insertAccountRecoveryTokenSchema = createInsertSchema(accountRecoveryTokens).omit({ id: true, createdAt: true });
export const insertDepositRequestSchema = createInsertSchema(depositRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLanguageSchema = createInsertSchema(languages).omit({ id: true });
export const insertCurrencySchema = createInsertSchema(currencies).omit({ id: true });
export const insertCountryPaymentMethodSchema = createInsertSchema(countryPaymentMethods).omit({ id: true });
export const insertThemeSchema = createInsertSchema(themes).omit({ id: true, createdAt: true });
export const insertFeatureFlagSchema = createInsertSchema(featureFlags).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({ id: true, createdAt: true });
export const insertP2POfferSchema = createInsertSchema(p2pOffers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertP2POfferNegotiationSchema = createInsertSchema(p2pOfferNegotiations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertP2PTradeSchema = createInsertSchema(p2pTrades).omit({ id: true, createdAt: true, updatedAt: true });
export const insertP2PEscrowSchema = createInsertSchema(p2pEscrow).omit({ id: true });
export const insertP2PDisputeSchema = createInsertSchema(p2pDisputes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertP2PSettingsSchema = createInsertSchema(p2pSettings).omit({ id: true, updatedAt: true });
export const insertP2PFreezeProgramConfigSchema = createInsertSchema(p2pFreezeProgramConfigs).omit({ id: true, updatedAt: true });
export const insertP2PFreezeProgramMethodSchema = createInsertSchema(p2pFreezeProgramMethods).omit({ id: true, createdAt: true });
export const insertP2PFreezeRequestSchema = createInsertSchema(p2pFreezeRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertP2PFreezeBenefitConsumptionSchema = createInsertSchema(p2pFreezeBenefitConsumptions).omit({ id: true, createdAt: true });
export const insertP2PTransactionLogSchema = createInsertSchema(p2pTransactionLogs).omit({ id: true, createdAt: true });
export const insertP2PDisputeMessageSchema = createInsertSchema(p2pDisputeMessages).omit({ id: true, createdAt: true });
export const insertP2PTradeMessageSchema = createInsertSchema(p2pTradeMessages).omit({ id: true, createdAt: true });
export const insertP2PDisputeEvidenceSchema = createInsertSchema(p2pDisputeEvidence).omit({ id: true, createdAt: true });
export const insertP2PPrewrittenResponseSchema = createInsertSchema(p2pPrewrittenResponses).omit({ id: true, createdAt: true });
export const insertP2PDisputeRuleSchema = createInsertSchema(p2pDisputeRules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupportContactSchema = createInsertSchema(supportContacts).omit({ id: true, createdAt: true, updatedAt: true });

export const insertAppSettingSchema = createInsertSchema(appSettings).omit({ id: true, updatedAt: true });
export const insertLoginMethodConfigSchema = createInsertSchema(loginMethodConfigs).omit({ id: true, updatedAt: true });
export const insertManagedLanguageSchema = createInsertSchema(managedLanguages).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBadgeCatalogSchema = createInsertSchema(badgeCatalog).omit({ id: true, createdAt: true });
export const insertUserBadgeSchema = createInsertSchema(userBadges).omit({ id: true, earnedAt: true });
export const insertUserRelationshipSchema = createInsertSchema(userRelationships).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserReportSchema = createInsertSchema(userReports).omit({ id: true, createdAt: true, reviewedAt: true, reviewedBy: true, reviewNotes: true, status: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertBroadcastNotificationSchema = createInsertSchema(broadcastNotifications).omit({ id: true, sentAt: true });
export const insertChatSettingSchema = createInsertSchema(chatSettings).omit({ id: true, updatedAt: true });
export const insertGameplaySettingSchema = createInsertSchema(gameplaySettings).omit({ id: true, updatedAt: true });

// ==================== TYPES ====================

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;
export type Affiliate = typeof affiliates.$inferSelect;

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type Complaint = typeof complaints.$inferSelect;

export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;

export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type GameSession = typeof gameSessions.$inferSelect;

export type InsertAgentPaymentMethod = z.infer<typeof insertAgentPaymentMethodSchema>;
export type AgentPaymentMethod = typeof agentPaymentMethods.$inferSelect;

export type InsertComplaintMessage = z.infer<typeof insertComplaintMessageSchema>;
export type ComplaintMessage = typeof complaintMessages.$inferSelect;

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export type InsertFinancialLimit = z.infer<typeof insertFinancialLimitSchema>;
export type FinancialLimit = typeof financialLimits.$inferSelect;

export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

export type ComplaintAttachment = typeof complaintAttachments.$inferSelect;
export type LinkAnalytic = typeof linkAnalytics.$inferSelect;
export type PromoCodeUsage = typeof promoCodeUsages.$inferSelect;

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export type InsertAccountRecoveryToken = z.infer<typeof insertAccountRecoveryTokenSchema>;
export type AccountRecoveryToken = typeof accountRecoveryTokens.$inferSelect;

export type InsertDepositRequest = z.infer<typeof insertDepositRequestSchema>;
export type DepositRequest = typeof depositRequests.$inferSelect;

export type InsertLanguage = z.infer<typeof insertLanguageSchema>;
export type Language = typeof languages.$inferSelect;

export type InsertCurrency = z.infer<typeof insertCurrencySchema>;
export type Currency = typeof currencies.$inferSelect;

export type InsertCountryPaymentMethod = z.infer<typeof insertCountryPaymentMethodSchema>;
export type CountryPaymentMethod = typeof countryPaymentMethods.$inferSelect;

export type InsertTheme = z.infer<typeof insertThemeSchema>;
export type Theme = typeof themes.$inferSelect;

export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type FeatureFlag = typeof featureFlags.$inferSelect;

export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;

export type InsertP2POffer = z.infer<typeof insertP2POfferSchema>;
export type P2POffer = typeof p2pOffers.$inferSelect;

export type InsertP2POfferNegotiation = z.infer<typeof insertP2POfferNegotiationSchema>;
export type P2POfferNegotiation = typeof p2pOfferNegotiations.$inferSelect;

export type InsertP2PTrade = z.infer<typeof insertP2PTradeSchema>;
export type P2PTrade = typeof p2pTrades.$inferSelect;

export type InsertP2PEscrow = z.infer<typeof insertP2PEscrowSchema>;
export type P2PEscrow = typeof p2pEscrow.$inferSelect;

export type InsertP2PDispute = z.infer<typeof insertP2PDisputeSchema>;
export type P2PDispute = typeof p2pDisputes.$inferSelect;

export type InsertP2PSettings = z.infer<typeof insertP2PSettingsSchema>;
export type P2PSettings = typeof p2pSettings.$inferSelect;

export type InsertP2PFreezeProgramConfig = z.infer<typeof insertP2PFreezeProgramConfigSchema>;
export type P2PFreezeProgramConfig = typeof p2pFreezeProgramConfigs.$inferSelect;

export type InsertP2PFreezeProgramMethod = z.infer<typeof insertP2PFreezeProgramMethodSchema>;
export type P2PFreezeProgramMethod = typeof p2pFreezeProgramMethods.$inferSelect;

export type InsertP2PFreezeRequest = z.infer<typeof insertP2PFreezeRequestSchema>;
export type P2PFreezeRequest = typeof p2pFreezeRequests.$inferSelect;

export type InsertP2PFreezeBenefitConsumption = z.infer<typeof insertP2PFreezeBenefitConsumptionSchema>;
export type P2PFreezeBenefitConsumption = typeof p2pFreezeBenefitConsumptions.$inferSelect;

export type InsertP2PTransactionLog = z.infer<typeof insertP2PTransactionLogSchema>;
export type P2PTransactionLog = typeof p2pTransactionLogs.$inferSelect;

export type InsertP2PDisputeMessage = z.infer<typeof insertP2PDisputeMessageSchema>;
export type P2PDisputeMessage = typeof p2pDisputeMessages.$inferSelect;

export type InsertP2PTradeMessage = z.infer<typeof insertP2PTradeMessageSchema>;
export type P2PTradeMessage = typeof p2pTradeMessages.$inferSelect;

export type P2PTraderRating = typeof p2pTraderRatings.$inferSelect;
export type P2PTraderMetric = typeof p2pTraderMetrics.$inferSelect;

export type InsertP2PDisputeEvidence = z.infer<typeof insertP2PDisputeEvidenceSchema>;
export type P2PDisputeEvidence = typeof p2pDisputeEvidence.$inferSelect;

export type InsertP2PPrewrittenResponse = z.infer<typeof insertP2PPrewrittenResponseSchema>;
export type P2PPrewrittenResponse = typeof p2pPrewrittenResponses.$inferSelect;

export type InsertP2PDisputeRule = z.infer<typeof insertP2PDisputeRuleSchema>;
export type P2PDisputeRule = typeof p2pDisputeRules.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertWebPushSubscription = z.infer<typeof insertWebPushSubscriptionSchema>;
export type WebPushSubscription = typeof webPushSubscriptions.$inferSelect;

export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;

export type InsertLoginHistory = z.infer<typeof insertLoginHistorySchema>;
export type LoginHistory = typeof loginHistory.$inferSelect;

export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcements.$inferSelect;

export type AnnouncementView = typeof announcementViews.$inferSelect;

export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

// Challenge system types
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;
export type Challenge = typeof challenges.$inferSelect;

export type InsertChallengeSpectatorBet = z.infer<typeof insertChallengeSpectatorBetSchema>;
export type ChallengeSpectatorBet = typeof challengeSpectatorBets.$inferSelect;

export type InsertChallengeRating = z.infer<typeof insertChallengeRatingSchema>;
export type ChallengeRating = typeof challengeRatings.$inferSelect;

export type InsertGiftCatalog = z.infer<typeof insertGiftCatalogSchema>;
export type GiftCatalog = typeof giftCatalog.$inferSelect;

export type InsertUserGiftInventory = z.infer<typeof insertUserGiftInventorySchema>;
export type UserGiftInventory = typeof userGiftInventory.$inferSelect;

export type InsertChallengeGift = z.infer<typeof insertChallengeGiftSchema>;
export type ChallengeGift = typeof challengeGifts.$inferSelect;

export type InsertChallengeSpectator = z.infer<typeof insertChallengeSpectatorSchema>;
export type ChallengeSpectator = typeof challengeSpectators.$inferSelect;

export type InsertSupportContact = z.infer<typeof insertSupportContactSchema>;
export type SupportContact = typeof supportContacts.$inferSelect;

export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type AppSetting = typeof appSettings.$inferSelect;

export type InsertLoginMethodConfig = z.infer<typeof insertLoginMethodConfigSchema>;
export type LoginMethodConfig = typeof loginMethodConfigs.$inferSelect;

export type InsertManagedLanguage = z.infer<typeof insertManagedLanguageSchema>;
export type ManagedLanguage = typeof managedLanguages.$inferSelect;

export type InsertBadgeCatalog = z.infer<typeof insertBadgeCatalogSchema>;
export type BadgeCatalog = typeof badgeCatalog.$inferSelect;

export type InsertUserBadge = z.infer<typeof insertUserBadgeSchema>;
export type UserBadge = typeof userBadges.$inferSelect;

export type InsertUserRelationship = z.infer<typeof insertUserRelationshipSchema>;
export type UserRelationship = typeof userRelationships.$inferSelect;

export type InsertUserReport = z.infer<typeof insertUserReportSchema>;
export type UserReport = typeof userReports.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertBroadcastNotification = z.infer<typeof insertBroadcastNotificationSchema>;
export type BroadcastNotification = typeof broadcastNotifications.$inferSelect;

export type InsertChatSetting = z.infer<typeof insertChatSettingSchema>;
export type ChatSetting = typeof chatSettings.$inferSelect;

export type InsertGameplaySetting = z.infer<typeof insertGameplaySettingSchema>;
export type GameplaySetting = typeof gameplaySettings.$inferSelect;

export type InsertMatchmakingQueue = z.infer<typeof insertMatchmakingQueueSchema>;
export type MatchmakingQueue = typeof matchmakingQueue.$inferSelect;

export type InsertGameMatch = z.infer<typeof insertGameMatchSchema>;
export type GameMatch = typeof gameMatches.$inferSelect;

// ==================== GAMEPLAY EMOJIS (Paid Emojis) ====================

export const gameplayEmojis = pgTable("gameplay_emojis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  emoji: text("emoji").notNull(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0.50"),
  category: text("category").notNull().default("general"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGameplayEmojiSchema = createInsertSchema(gameplayEmojis).omit({ id: true, createdAt: true });
export type InsertGameplayEmoji = z.infer<typeof insertGameplayEmojiSchema>;
export type GameplayEmoji = typeof gameplayEmojis.$inferSelect;

// ==================== GAMEPLAY MESSAGES (In-game Chat) ====================

export const gameplayMessages = pgTable("gameplay_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").notNull().references(() => gameMatches.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message"),
  emojiId: varchar("emoji_id").references(() => gameplayEmojis.id),
  isEmoji: boolean("is_emoji").notNull().default(false),
  emojiCost: decimal("emoji_cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gameplay_messages_match").on(table.matchId),
  index("idx_gameplay_messages_sender").on(table.senderId),
]);

export const gameplayMessagesRelations = relations(gameplayMessages, ({ one }) => ({
  match: one(gameMatches, { fields: [gameplayMessages.matchId], references: [gameMatches.id] }),
  sender: one(users, { fields: [gameplayMessages.senderId], references: [users.id] }),
  emoji: one(gameplayEmojis, { fields: [gameplayMessages.emojiId], references: [gameplayEmojis.id] }),
}));

export const insertGameplayMessageSchema = createInsertSchema(gameplayMessages).omit({ id: true, createdAt: true });
export type InsertGameplayMessage = z.infer<typeof insertGameplayMessageSchema>;
export type GameplayMessage = typeof gameplayMessages.$inferSelect;

// ==================== GAME SECTIONS (Customizable Section Names) ====================

export const gameSections = pgTable("game_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  icon: text("icon").notNull().default("Gamepad2"),
  iconColor: text("icon_color").notNull().default("text-primary"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGameSectionSchema = createInsertSchema(gameSections).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGameSection = z.infer<typeof insertGameSectionSchema>;
export type GameSection = typeof gameSections.$inferSelect;

// ==================== ADMIN ALERTS (Real-time Admin Notifications) ====================

export const adminAlertTypeEnum = pgEnum("admin_alert_type", [
  "new_dispute", "dispute_update", "new_trade", "trade_issue",
  "new_complaint", "complaint_escalated", "game_change", "user_issue",
  "payment_issue", "system_alert", "security_alert", "support_message"
]);

export const adminAlertSeverityEnum = pgEnum("admin_alert_severity", ["info", "warning", "critical", "urgent"]);

export const adminAlerts = pgTable("admin_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: adminAlertTypeEnum("type").notNull(),
  severity: adminAlertSeverityEnum("severity").notNull().default("info"),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  message: text("message").notNull(),
  messageAr: text("message_ar"),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  deepLink: text("deep_link"),
  metadata: text("metadata"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  readBy: varchar("read_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_admin_alerts_type").on(table.type),
  index("idx_admin_alerts_severity").on(table.severity),
  index("idx_admin_alerts_is_read").on(table.isRead),
  index("idx_admin_alerts_created_at").on(table.createdAt),
]);

export const adminAlertsRelations = relations(adminAlerts, ({ one }) => ({
  reader: one(users, { fields: [adminAlerts.readBy], references: [users.id] }),
}));

export const insertAdminAlertSchema = createInsertSchema(adminAlerts).omit({ id: true, createdAt: true });
export type InsertAdminAlert = z.infer<typeof insertAdminAlertSchema>;
export type AdminAlert = typeof adminAlerts.$inferSelect;

// ==================== ADVERTISEMENTS (Carousel Ads) ====================

export const advertisementTypeEnum = pgEnum("advertisement_type", ["image", "video", "link", "embed"]);

export const advertisements = pgTable("advertisements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  type: advertisementTypeEnum("type").notNull().default("image"),
  assetUrl: text("asset_url"),
  targetUrl: text("target_url"),
  embedCode: text("embed_code"),
  displayDuration: integer("display_duration").notNull().default(5000),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_advertisements_active").on(table.isActive),
  index("idx_advertisements_sort").on(table.sortOrder),
]);

export const advertisementsRelations = relations(advertisements, ({ one }) => ({
  creator: one(users, { fields: [advertisements.createdBy], references: [users.id] }),
}));

export const insertAdvertisementSchema = createInsertSchema(advertisements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdvertisement = z.infer<typeof insertAdvertisementSchema>;
export type Advertisement = typeof advertisements.$inferSelect;

export const freePlayAdEventTypeEnum = pgEnum("free_play_ad_event_type", ["view", "click", "reward_claim"]);

export const freePlayAdEvents = pgTable("free_play_ad_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertisementId: varchar("advertisement_id").references(() => advertisements.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: freePlayAdEventTypeEnum("event_type").notNull(),
  rewardAmount: decimal("reward_amount", { precision: 10, scale: 2 }),
  source: text("source"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_free_play_ad_events_ad_id").on(table.advertisementId),
  index("idx_free_play_ad_events_user_id").on(table.userId),
  index("idx_free_play_ad_events_type").on(table.eventType),
  index("idx_free_play_ad_events_created_at").on(table.createdAt),
]);

export const freePlayAdEventsRelations = relations(freePlayAdEvents, ({ one }) => ({
  advertisement: one(advertisements, { fields: [freePlayAdEvents.advertisementId], references: [advertisements.id] }),
  user: one(users, { fields: [freePlayAdEvents.userId], references: [users.id] }),
}));

export const insertFreePlayAdEventSchema = createInsertSchema(freePlayAdEvents).omit({ id: true, createdAt: true });
export type InsertFreePlayAdEvent = z.infer<typeof insertFreePlayAdEventSchema>;
export type FreePlayAdEvent = typeof freePlayAdEvents.$inferSelect;

// ==================== SOCIAL PLATFORMS (OAuth & OTP Settings) ====================

export const socialPlatformTypeEnum = pgEnum("social_platform_type", ["oauth", "otp", "both"]);

export const socialPlatforms = pgTable("social_platforms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  displayNameAr: text("display_name_ar"),
  icon: text("icon").notNull(),
  type: socialPlatformTypeEnum("type").notNull().default("oauth"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  webhookUrl: text("webhook_url"),
  callbackUrl: text("callback_url"),
  botToken: text("bot_token"),
  phoneNumberId: text("phone_number_id"),
  businessAccountId: text("business_account_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  otpEnabled: boolean("otp_enabled").notNull().default(false),
  otpTemplate: text("otp_template"),
  otpExpiry: integer("otp_expiry").notNull().default(300),
  sortOrder: integer("sort_order").notNull().default(0),
  settings: text("settings"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_social_platforms_enabled").on(table.isEnabled),
  index("idx_social_platforms_sort").on(table.sortOrder),
]);

export const insertSocialPlatformSchema = createInsertSchema(socialPlatforms).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSocialPlatform = z.infer<typeof insertSocialPlatformSchema>;
export type SocialPlatform = typeof socialPlatforms.$inferSelect;

// ==================== SOCIAL AUTH ACCOUNTS ====================
export const socialAuthAccounts = pgTable("social_auth_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platformName: text("platform_name").notNull(), // e.g. "google", "facebook"
  providerUserId: text("provider_user_id").notNull(), // ID from the provider
  providerEmail: text("provider_email"),
  providerDisplayName: text("provider_display_name"),
  providerAvatar: text("provider_avatar"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  rawProfile: text("raw_profile"), // JSON stringified raw profile from provider
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
}, (table) => [
  index("idx_social_auth_user").on(table.userId),
  uniqueIndex("idx_social_auth_provider_unique").on(table.platformName, table.providerUserId),
]);

export const insertSocialAuthAccountSchema = createInsertSchema(socialAuthAccounts).omit({ id: true, linkedAt: true, lastUsedAt: true });
export type InsertSocialAuthAccount = z.infer<typeof insertSocialAuthAccountSchema>;
export type SocialAuthAccount = typeof socialAuthAccounts.$inferSelect;

// ==================== OAUTH STATES (CSRF protection) ====================
export const oauthStates = pgTable("oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  state: text("state").notNull().unique(),
  platformName: text("platform_name").notNull(),
  redirectUrl: text("redirect_url"),
  codeVerifier: text("code_verifier"), // PKCE
  sessionFingerprint: text("session_fingerprint"),
  clientBindingHash: text("client_binding_hash"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_oauth_state").on(table.state),
]);

export type OAuthState = typeof oauthStates.$inferSelect;

// ==================== LIVE GAME SESSIONS (Multiplayer) ====================

export const liveGameStatusEnum = pgEnum("live_game_status", ["waiting", "starting", "in_progress", "paused", "completed", "cancelled"]);

export const liveGameSessions = pgTable("live_game_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").references(() => challenges.id),
  gameId: varchar("game_id").notNull().references(() => games.id),
  gameType: text("game_type").notNull(),
  stateMode: gameStateModeEnum("state_mode").notNull().default("LEGACY"),
  status: liveGameStatusEnum("status").notNull().default("waiting"),
  gameState: text("game_state"),
  currentTurn: varchar("current_turn").references(() => users.id),
  turnNumber: integer("turn_number").notNull().default(0),
  turnStartedAt: timestamp("turn_started_at"),
  turnTimeLimit: integer("turn_time_limit").notNull().default(60),
  player1Id: varchar("player1_id").notNull().references(() => users.id),
  player2Id: varchar("player2_id").references(() => users.id),
  player3Id: varchar("player3_id").references(() => users.id),
  player4Id: varchar("player4_id").references(() => users.id),
  player1Score: integer("player1_score").notNull().default(0),
  player2Score: integer("player2_score").notNull().default(0),
  player3Score: integer("player3_score").notNull().default(0),
  player4Score: integer("player4_score").notNull().default(0),
  team1Score: integer("team1_score").notNull().default(0),
  team2Score: integer("team2_score").notNull().default(0),
  winnerId: varchar("winner_id").references(() => users.id),
  winningTeam: integer("winning_team"),
  spectatorCount: integer("spectator_count").notNull().default(0),
  totalGiftsValue: decimal("total_gifts_value", { precision: 15, scale: 2 }).notNull().default("0.00"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_live_sessions_challenge").on(table.challengeId),
  index("idx_live_sessions_game").on(table.gameId),
  index("idx_live_sessions_status").on(table.status),
  index("idx_live_sessions_player1").on(table.player1Id),
  index("idx_live_sessions_player2").on(table.player2Id),
  index("idx_live_sessions_player3").on(table.player3Id),
  index("idx_live_sessions_player4").on(table.player4Id),
]);

export const liveGameSessionsRelations = relations(liveGameSessions, ({ one, many }) => ({
  challenge: one(challenges, { fields: [liveGameSessions.challengeId], references: [challenges.id] }),
  game: one(games, { fields: [liveGameSessions.gameId], references: [games.id] }),
  player1: one(users, { fields: [liveGameSessions.player1Id], references: [users.id] }),
  player2: one(users, { fields: [liveGameSessions.player2Id], references: [users.id] }),
  player3: one(users, { fields: [liveGameSessions.player3Id], references: [users.id] }),
  player4: one(users, { fields: [liveGameSessions.player4Id], references: [users.id] }),
  winner: one(users, { fields: [liveGameSessions.winnerId], references: [users.id] }),
  currentTurnPlayer: one(users, { fields: [liveGameSessions.currentTurn], references: [users.id] }),
  moves: many(gameMoves),
  spectators: many(gameSpectators),
  gifts: many(spectatorGifts),
}));

export const insertLiveGameSessionSchema = createInsertSchema(liveGameSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLiveGameSession = z.infer<typeof insertLiveGameSessionSchema>;
export type LiveGameSession = typeof liveGameSessions.$inferSelect;

// ==================== GAME MOVES (Move History) ====================

export const gameMoves = pgTable("game_moves", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => liveGameSessions.id),
  playerId: varchar("player_id").notNull().references(() => users.id),
  moveNumber: integer("move_number").notNull(),
  moveType: text("move_type").notNull(),
  moveData: text("move_data").notNull(),
  previousState: text("previous_state"),
  newState: text("new_state"),
  isValid: boolean("is_valid").notNull().default(true),
  timeTaken: integer("time_taken"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_moves_session").on(table.sessionId),
  index("idx_moves_player").on(table.playerId),
  index("idx_moves_number").on(table.sessionId, table.moveNumber),
]);

export const gameMovesRelations = relations(gameMoves, ({ one }) => ({
  session: one(liveGameSessions, { fields: [gameMoves.sessionId], references: [liveGameSessions.id] }),
  player: one(users, { fields: [gameMoves.playerId], references: [users.id] }),
}));

export const insertGameMoveSchema = createInsertSchema(gameMoves).omit({ id: true, createdAt: true });
export type InsertGameMove = z.infer<typeof insertGameMoveSchema>;
export type GameMove = typeof gameMoves.$inferSelect;

// ==================== GAME EVENTS (Phase 0 Passive Event Log) ====================

export const gameEvents = pgTable("game_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: text("event_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  sessionId: varchar("session_id").references(() => liveGameSessions.id),
  challengeId: varchar("challenge_id").references(() => challenges.id),
  challengeSessionId: varchar("challenge_session_id").references(() => challengeGameSessions.id),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  actorId: varchar("actor_id").notNull().references(() => users.id),
  actorType: text("actor_type").notNull().default("player"),
  moveType: text("move_type"),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("recorded"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  appliedAt: timestamp("applied_at"),
}, (table) => [
  uniqueIndex("idx_game_events_idempotency_key").on(table.idempotencyKey),
  index("idx_game_events_event_id").on(table.eventId),
  index("idx_game_events_session_created").on(table.sessionId, table.createdAt),
  index("idx_game_events_challenge_created").on(table.challengeId, table.createdAt),
]);

export const gameEventsRelations = relations(gameEvents, ({ one }) => ({
  session: one(liveGameSessions, { fields: [gameEvents.sessionId], references: [liveGameSessions.id] }),
  challenge: one(challenges, { fields: [gameEvents.challengeId], references: [challenges.id] }),
  challengeSession: one(challengeGameSessions, { fields: [gameEvents.challengeSessionId], references: [challengeGameSessions.id] }),
  actor: one(users, { fields: [gameEvents.actorId], references: [users.id] }),
}));

export const insertGameEventSchema = createInsertSchema(gameEvents).omit({ id: true, createdAt: true });
export type InsertGameEvent = z.infer<typeof insertGameEventSchema>;
export type GameEvent = typeof gameEvents.$inferSelect;

// ==================== GAME SPECTATORS ====================

export const gameSpectators = pgTable("game_spectators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => liveGameSessions.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
  totalGiftsSent: decimal("total_gifts_sent", { precision: 15, scale: 2 }).notNull().default("0.00"),
}, (table) => [
  index("idx_spectators_session").on(table.sessionId),
  index("idx_spectators_user").on(table.userId),
]);

export const gameSpectatorsRelations = relations(gameSpectators, ({ one }) => ({
  session: one(liveGameSessions, { fields: [gameSpectators.sessionId], references: [liveGameSessions.id] }),
  user: one(users, { fields: [gameSpectators.userId], references: [users.id] }),
}));

export const insertGameSpectatorSchema = createInsertSchema(gameSpectators).omit({ id: true, joinedAt: true });
export type InsertGameSpectator = z.infer<typeof insertGameSpectatorSchema>;
export type GameSpectator = typeof gameSpectators.$inferSelect;

// ==================== GIFT ITEMS ====================

export const giftItems = pgTable("gift_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  icon: text("icon").notNull(),
  animationUrl: text("animation_url"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  creatorShare: decimal("creator_share", { precision: 5, scale: 2 }).notNull().default("70.00"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gift_items_active").on(table.isActive),
]);

export const insertGiftItemSchema = createInsertSchema(giftItems).omit({ id: true, createdAt: true });
export type InsertGiftItem = z.infer<typeof insertGiftItemSchema>;
export type GiftItem = typeof giftItems.$inferSelect;

// ==================== SPECTATOR GIFTS ====================

export const spectatorGifts = pgTable("spectator_gifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => liveGameSessions.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  recipientId: varchar("recipient_id").notNull().references(() => users.id),
  giftItemId: varchar("gift_item_id").notNull().references(() => giftItems.id),
  quantity: integer("quantity").notNull().default(1),
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }).notNull(),
  recipientEarnings: decimal("recipient_earnings", { precision: 15, scale: 2 }).notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_gifts_session").on(table.sessionId),
  index("idx_gifts_sender").on(table.senderId),
  index("idx_gifts_recipient").on(table.recipientId),
]);

export const spectatorGiftsRelations = relations(spectatorGifts, ({ one }) => ({
  session: one(liveGameSessions, { fields: [spectatorGifts.sessionId], references: [liveGameSessions.id] }),
  sender: one(users, { fields: [spectatorGifts.senderId], references: [users.id] }),
  recipient: one(users, { fields: [spectatorGifts.recipientId], references: [users.id] }),
  giftItem: one(giftItems, { fields: [spectatorGifts.giftItemId], references: [giftItems.id] }),
}));

export const insertSpectatorGiftSchema = createInsertSchema(spectatorGifts).omit({ id: true, createdAt: true });
export type InsertSpectatorGift = z.infer<typeof insertSpectatorGiftSchema>;
export type SpectatorGift = typeof spectatorGifts.$inferSelect;

// ==================== GAME CHAT MESSAGES ====================

export const gameChatMessages = pgTable("game_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => liveGameSessions.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  messageType: text("message_type").notNull().default("text"),
  isFromSpectator: boolean("is_from_spectator").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_game_chat_session").on(table.sessionId),
  index("idx_game_chat_user").on(table.userId),
]);

export const gameChatMessagesRelations = relations(gameChatMessages, ({ one }) => ({
  session: one(liveGameSessions, { fields: [gameChatMessages.sessionId], references: [liveGameSessions.id] }),
  user: one(users, { fields: [gameChatMessages.userId], references: [users.id] }),
}));

export const insertGameChatMessageSchema = createInsertSchema(gameChatMessages).omit({ id: true, createdAt: true });
export type InsertGameChatMessage = z.infer<typeof insertGameChatMessageSchema>;
export type GameChatMessage = typeof gameChatMessages.$inferSelect;

// ==================== ACHIEVEMENTS ====================

export const achievementCategoryEnum = pgEnum("achievement_category", ["games", "wins", "earnings", "streaks", "social", "special"]);
export const achievementRarityEnum = pgEnum("achievement_rarity", ["common", "uncommon", "rare", "epic", "legendary"]);

export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  category: achievementCategoryEnum("category").notNull(),
  rarity: achievementRarityEnum("rarity").notNull().default("common"),
  gameType: text("game_type"),
  requirement: integer("requirement").notNull().default(1),
  rewardAmount: decimal("reward_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  iconName: text("icon_name").notNull().default("trophy"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_achievements_category").on(table.category),
  index("idx_achievements_game_type").on(table.gameType),
  index("idx_achievements_rarity").on(table.rarity),
]);

export const insertAchievementSchema = createInsertSchema(achievements).omit({ id: true, createdAt: true });
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type Achievement = typeof achievements.$inferSelect;

// ==================== USER ACHIEVEMENTS ====================

export const userAchievements = pgTable("user_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  achievementId: varchar("achievement_id").notNull().references(() => achievements.id),
  progress: integer("progress").notNull().default(0),
  unlockedAt: timestamp("unlocked_at"),
  rewardClaimed: boolean("reward_claimed").notNull().default(false),
  rewardClaimedAt: timestamp("reward_claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_user_achievement_unique").on(table.userId, table.achievementId),
  index("idx_user_achievements_user").on(table.userId),
  index("idx_user_achievements_unlocked").on(table.unlockedAt),
]);

export const userAchievementsRelations = relations(userAchievements, ({ one }) => ({
  user: one(users, { fields: [userAchievements.userId], references: [users.id] }),
  achievement: one(achievements, { fields: [userAchievements.achievementId], references: [achievements.id] }),
}));

export const insertUserAchievementSchema = createInsertSchema(userAchievements).omit({ id: true, createdAt: true });
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;
export type UserAchievement = typeof userAchievements.$inferSelect;

// ==================== SEASONS ====================

export const seasonStatusEnum = pgEnum("season_status", ["upcoming", "active", "ended", "archived"]);

export const seasons = pgTable("seasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  number: integer("number").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  descriptionEn: text("description_en"),
  descriptionAr: text("description_ar"),
  status: seasonStatusEnum("status").notNull().default("upcoming"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  prizePool: decimal("prize_pool", { precision: 15, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_seasons_status").on(table.status),
  index("idx_seasons_dates").on(table.startDate, table.endDate),
]);

export const insertSeasonSchema = createInsertSchema(seasons).omit({ id: true, createdAt: true });
export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Season = typeof seasons.$inferSelect;

// ==================== SEASONAL STATS ====================

export const seasonalStats = pgTable("seasonal_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  seasonId: varchar("season_id").notNull().references(() => seasons.id),
  gamesPlayed: integer("games_played").notNull().default(0),
  gamesWon: integer("games_won").notNull().default(0),
  gamesLost: integer("games_lost").notNull().default(0),
  gamesDraw: integer("games_draw").notNull().default(0),
  chessPlayed: integer("chess_played").notNull().default(0),
  chessWon: integer("chess_won").notNull().default(0),
  backgammonPlayed: integer("backgammon_played").notNull().default(0),
  backgammonWon: integer("backgammon_won").notNull().default(0),
  dominoPlayed: integer("domino_played").notNull().default(0),
  dominoWon: integer("domino_won").notNull().default(0),
  tarneebPlayed: integer("tarneeb_played").notNull().default(0),
  tarneebWon: integer("tarneeb_won").notNull().default(0),
  balootPlayed: integer("baloot_played").notNull().default(0),
  balootWon: integer("baloot_won").notNull().default(0),
  totalEarnings: decimal("total_earnings", { precision: 15, scale: 2 }).notNull().default("0.00"),
  currentWinStreak: integer("current_win_streak").notNull().default(0),
  longestWinStreak: integer("longest_win_streak").notNull().default(0),
  rank: integer("rank"),
  rankUpdatedAt: timestamp("rank_updated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_seasonal_stats_user_season").on(table.userId, table.seasonId),
  index("idx_seasonal_stats_season").on(table.seasonId),
  index("idx_seasonal_stats_games_won").on(table.seasonId, table.gamesWon),
  index("idx_seasonal_stats_earnings").on(table.seasonId, table.totalEarnings),
  index("idx_seasonal_stats_streak").on(table.seasonId, table.longestWinStreak),
]);

export const seasonalStatsRelations = relations(seasonalStats, ({ one }) => ({
  user: one(users, { fields: [seasonalStats.userId], references: [users.id] }),
  season: one(seasons, { fields: [seasonalStats.seasonId], references: [seasons.id] }),
}));

export const insertSeasonalStatsSchema = createInsertSchema(seasonalStats).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSeasonalStats = z.infer<typeof insertSeasonalStatsSchema>;
export type SeasonalStats = typeof seasonalStats.$inferSelect;

// ==================== SEASON REWARDS ====================

export const seasonRewards = pgTable("season_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  seasonId: varchar("season_id").notNull().references(() => seasons.id),
  rankFrom: integer("rank_from").notNull(),
  rankTo: integer("rank_to").notNull(),
  rewardAmount: decimal("reward_amount", { precision: 15, scale: 2 }).notNull(),
  rewardDescriptionEn: text("reward_description_en"),
  rewardDescriptionAr: text("reward_description_ar"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_season_rewards_season").on(table.seasonId),
]);

export const seasonRewardsRelations = relations(seasonRewards, ({ one }) => ({
  season: one(seasons, { fields: [seasonRewards.seasonId], references: [seasons.id] }),
}));

export const insertSeasonRewardSchema = createInsertSchema(seasonRewards).omit({ id: true, createdAt: true });
export type InsertSeasonReward = z.infer<typeof insertSeasonRewardSchema>;
export type SeasonReward = typeof seasonRewards.$inferSelect;

// ==================== PROJECT CURRENCY ====================

export const currencyApprovalModeEnum = pgEnum("currency_approval_mode", ["automatic", "manual"]);
export const currencyConversionStatusEnum = pgEnum("currency_conversion_status", ["pending", "approved", "rejected", "completed"]);
export const currencyLedgerTypeEnum = pgEnum("currency_ledger_type", ["conversion", "game_stake", "game_win", "p2p_send", "p2p_receive", "p2p_escrow", "p2p_received", "p2p_refund", "bonus", "refund", "admin_adjustment"]);

// Project Currency Settings - Admin configuration
export const projectCurrencySettings = pgTable("project_currency_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  currencyName: text("currency_name").notNull().default("VEX Coin"),
  currencySymbol: text("currency_symbol").notNull().default("VEX"),
  baseCurrencyCode: text("base_currency_code").notNull().default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).notNull().default("100"),
  minConversionAmount: decimal("min_conversion_amount", { precision: 15, scale: 2 }).notNull().default("1.00"),
  maxConversionAmount: decimal("max_conversion_amount", { precision: 15, scale: 2 }).notNull().default("10000.00"),
  dailyConversionLimitPerUser: decimal("daily_conversion_limit_per_user", { precision: 15, scale: 2 }).notNull().default("5000.00"),
  totalPlatformDailyLimit: decimal("total_platform_daily_limit", { precision: 15, scale: 2 }).notNull().default("1000000.00"),
  conversionCommissionRate: decimal("conversion_commission_rate", { precision: 5, scale: 4 }).notNull().default("0.01"),
  approvalMode: currencyApprovalModeEnum("approval_mode").notNull().default("automatic"),
  isActive: boolean("is_active").notNull().default(true),
  useInGames: boolean("use_in_games").notNull().default(true),
  useInP2P: boolean("use_in_p2p").notNull().default(true),
  allowEarnedBalance: boolean("allow_earned_balance").notNull().default(true),
  earnedBalanceExpireDays: integer("earned_balance_expire_days"),
  allowPointsConversion: boolean("allow_points_conversion").notNull().default(false),
  pointsExchangeRate: decimal("points_exchange_rate", { precision: 15, scale: 6 }).default("10"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectCurrencySettingsSchema = createInsertSchema(projectCurrencySettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectCurrencySettings = z.infer<typeof insertProjectCurrencySettingsSchema>;
export type ProjectCurrencySettings = typeof projectCurrencySettings.$inferSelect;

// ==================== USER MULTI-CURRENCY WALLETS ====================
// Holds per-currency sub-wallet balances for users with `multiCurrencyEnabled = true`.
// The user's PRIMARY currency continues to live in `users.balance` /
// `users.balanceCurrency` (legacy columns) — this table only stores the
// additional sub-wallets (e.g. an account whose primary is USD but who is
// also allowed to hold EGP and SAR). Rows are created lazily on first credit.
export const userCurrencyWallets = pgTable("user_currency_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currencyCode: text("currency_code").notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalDeposited: decimal("total_deposited", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalWithdrawn: decimal("total_withdrawn", { precision: 15, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_user_currency_wallets_user_currency").on(table.userId, table.currencyCode),
  index("idx_user_currency_wallets_user").on(table.userId),
  check("chk_ucw_balance_non_negative", sql`${table.balance} >= 0`),
]);

export const userCurrencyWalletsRelations = relations(userCurrencyWallets, ({ one }) => ({
  user: one(users, { fields: [userCurrencyWallets.userId], references: [users.id] }),
}));

export const insertUserCurrencyWalletSchema = createInsertSchema(userCurrencyWallets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserCurrencyWallet = z.infer<typeof insertUserCurrencyWalletSchema>;
export type UserCurrencyWallet = typeof userCurrencyWallets.$inferSelect;

// Project Currency Wallets - User balances
export const projectCurrencyWallets = pgTable("project_currency_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  purchasedBalance: decimal("purchased_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  earnedBalance: decimal("earned_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalBalance: decimal("total_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalConverted: decimal("total_converted", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalSpent: decimal("total_spent", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalEarned: decimal("total_earned", { precision: 15, scale: 2 }).notNull().default("0.00"),
  lockedBalance: decimal("locked_balance", { precision: 15, scale: 2 }).notNull().default("0.00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_currency_wallets_user").on(table.userId),
  check("chk_pcw_purchased_balance_non_negative", sql`${table.purchasedBalance} >= 0`),
  check("chk_pcw_earned_balance_non_negative", sql`${table.earnedBalance} >= 0`),
  check("chk_pcw_total_balance_non_negative", sql`${table.totalBalance} >= 0`),
]);

export const projectCurrencyWalletsRelations = relations(projectCurrencyWallets, ({ one }) => ({
  user: one(users, { fields: [projectCurrencyWallets.userId], references: [users.id] }),
}));

export const insertProjectCurrencyWalletSchema = createInsertSchema(projectCurrencyWallets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectCurrencyWallet = z.infer<typeof insertProjectCurrencyWalletSchema>;
export type ProjectCurrencyWallet = typeof projectCurrencyWallets.$inferSelect;

// Project Currency Conversions - Conversion requests with approval
export const projectCurrencyConversions = pgTable("project_currency_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  baseCurrencyAmount: decimal("base_currency_amount", { precision: 15, scale: 2 }).notNull(),
  projectCurrencyAmount: decimal("project_currency_amount", { precision: 15, scale: 2 }).notNull(),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 15, scale: 6 }).notNull(),
  commissionAmount: decimal("commission_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  netAmount: decimal("net_amount", { precision: 15, scale: 2 }).notNull(),
  status: currencyConversionStatusEnum("status").notNull().default("pending"),
  approvedById: varchar("approved_by_id").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_currency_conversions_user").on(table.userId),
  index("idx_currency_conversions_status").on(table.status),
  index("idx_currency_conversions_date").on(table.createdAt),
]);

export const projectCurrencyConversionsRelations = relations(projectCurrencyConversions, ({ one }) => ({
  user: one(users, { fields: [projectCurrencyConversions.userId], references: [users.id] }),
  approvedBy: one(users, { fields: [projectCurrencyConversions.approvedById], references: [users.id] }),
}));

export const insertProjectCurrencyConversionSchema = createInsertSchema(projectCurrencyConversions).omit({ id: true, createdAt: true });
export type InsertProjectCurrencyConversion = z.infer<typeof insertProjectCurrencyConversionSchema>;
export type ProjectCurrencyConversion = typeof projectCurrencyConversions.$inferSelect;

// Project Currency Ledger - Transaction history
export const projectCurrencyLedger = pgTable("project_currency_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  walletId: varchar("wallet_id").notNull(),
  type: currencyLedgerTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).notNull(),
  referenceId: varchar("reference_id"),
  referenceType: text("reference_type"),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_currency_ledger_user").on(table.userId),
  index("idx_currency_ledger_wallet").on(table.walletId),
  index("idx_currency_ledger_type").on(table.type),
  index("idx_currency_ledger_date").on(table.createdAt),
  index("idx_currency_ledger_reference").on(table.referenceId, table.referenceType),
  foreignKey({ name: "pcl_wallet_id_fk", columns: [table.walletId], foreignColumns: [projectCurrencyWallets.id] }),
]);

export const projectCurrencyLedgerRelations = relations(projectCurrencyLedger, ({ one }) => ({
  user: one(users, { fields: [projectCurrencyLedger.userId], references: [users.id] }),
  wallet: one(projectCurrencyWallets, { fields: [projectCurrencyLedger.walletId], references: [projectCurrencyWallets.id] }),
}));

export const insertProjectCurrencyLedgerSchema = createInsertSchema(projectCurrencyLedger).omit({ id: true, createdAt: true });
export type InsertProjectCurrencyLedger = z.infer<typeof insertProjectCurrencyLedgerSchema>;
export type ProjectCurrencyLedger = typeof projectCurrencyLedger.$inferSelect;

// ==================== CHALLENGE SETTINGS (إعدادات التحديات) ====================

export const challengeSettings = pgTable("challenge_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameType: text("game_type").notNull().unique(), // chess, backgammon, domino, tarneeb, baloot
  isEnabled: boolean("is_enabled").notNull().default(true),
  // Commission
  commissionPercent: decimal("commission_percent", { precision: 5, scale: 2 }).notNull().default("5.00"), // Platform commission on total pot
  // Surrender rules
  allowSurrender: boolean("allow_surrender").notNull().default(true),
  surrenderWinnerPercent: decimal("surrender_winner_percent", { precision: 5, scale: 2 }).notNull().default("70.00"), // Winner gets 70% of pot after commission
  surrenderLoserRefundPercent: decimal("surrender_loser_refund_percent", { precision: 5, scale: 2 }).notNull().default("30.00"), // Loser gets back 30% of their stake (loses 70%)
  // Withdraw rules — waiting=0% penalty, active=70% penalty (hardcoded in route)
  withdrawPenaltyPercent: decimal("withdraw_penalty_percent", { precision: 5, scale: 2 }).notNull().default("0.00"), // Only for waiting challenges (0% = full refund)
  // Time limits
  turnTimeoutSeconds: integer("turn_timeout_seconds").notNull().default(300), // Per-move timeout (5 minutes)
  reconnectGraceSeconds: integer("reconnect_grace_seconds").notNull().default(60), // Disconnect grace period
  challengeExpiryMinutes: integer("challenge_expiry_minutes").notNull().default(30), // Auto-cancel waiting challenges
  // Stake limits (override multiplayerGames if set)
  minStake: decimal("min_stake", { precision: 15, scale: 2 }).notNull().default("1.00"),
  maxStake: decimal("max_stake", { precision: 15, scale: 2 }).notNull().default("1000.00"),
  // Draw rules
  allowDraw: boolean("allow_draw").notNull().default(true),
  // Spectator limits
  maxSpectators: integer("max_spectators").notNull().default(100),
  allowSpectators: boolean("allow_spectators").notNull().default(true),
  // Anti-exploit
  minMovesBeforeSurrender: integer("min_moves_before_surrender").notNull().default(2), // Prevent instant surrender exploit
  maxConcurrentChallenges: integer("max_concurrent_challenges").notNull().default(3), // Prevent balance-drain exploit
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_challenge_settings_game_type").on(table.gameType),
]);

export const insertChallengeSettingsSchema = createInsertSchema(challengeSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChallengeSettings = z.infer<typeof insertChallengeSettingsSchema>;
export type ChallengeSettings = typeof challengeSettings.$inferSelect;

// ==================== SPECTATOR SUPPORT SYSTEM (ادعم واربح) ====================

// Enums for support system
export const supportStatusEnum = pgEnum("support_status", ["pending", "matched", "won", "lost", "cancelled", "refunded"]);
export const supportModeEnum = pgEnum("support_mode", ["instant", "wait_for_match"]);
export const oddsCalculationModeEnum = pgEnum("odds_calculation_mode", ["automatic", "manual"]);

// Support Settings - Admin configuration for odds and algorithm
export const supportSettings = pgTable("support_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameType: text("game_type").notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  oddsMode: oddsCalculationModeEnum("odds_mode").notNull().default("automatic"),
  defaultOddsPlayer1: decimal("default_odds_player1", { precision: 5, scale: 2 }).notNull().default("1.90"),
  defaultOddsPlayer2: decimal("default_odds_player2", { precision: 5, scale: 2 }).notNull().default("1.90"),
  minSupportAmount: decimal("min_support_amount", { precision: 15, scale: 2 }).notNull().default("1.00"),
  maxSupportAmount: decimal("max_support_amount", { precision: 15, scale: 2 }).notNull().default("10000.00"),
  houseFeePercent: decimal("house_fee_percent", { precision: 5, scale: 2 }).notNull().default("5.00"),
  allowInstantMatch: boolean("allow_instant_match").notNull().default(true),
  instantMatchOdds: decimal("instant_match_odds", { precision: 5, scale: 2 }).notNull().default("1.80"),
  winRateWeight: decimal("win_rate_weight", { precision: 5, scale: 2 }).notNull().default("0.60"),
  experienceWeight: decimal("experience_weight", { precision: 5, scale: 2 }).notNull().default("0.25"),
  streakWeight: decimal("streak_weight", { precision: 5, scale: 2 }).notNull().default("0.15"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupportSettingsSchema = createInsertSchema(supportSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupportSettings = z.infer<typeof insertSupportSettingsSchema>;
export type SupportSettings = typeof supportSettings.$inferSelect;

// Spectator Supports - Individual support entries
export const spectatorSupports = pgTable("spectator_supports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  sessionId: varchar("session_id").references(() => liveGameSessions.id),
  supporterId: varchar("supporter_id").notNull().references(() => users.id),
  supportedPlayerId: varchar("supported_player_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  odds: decimal("odds", { precision: 5, scale: 2 }).notNull(),
  potentialWinnings: decimal("potential_winnings", { precision: 15, scale: 2 }).notNull(),
  mode: supportModeEnum("mode").notNull().default("wait_for_match"),
  status: supportStatusEnum("status").notNull().default("pending"),
  matchedSupportId: varchar("matched_support_id"),
  houseFee: decimal("house_fee", { precision: 15, scale: 2 }).notNull().default("0.00"),
  actualWinnings: decimal("actual_winnings", { precision: 15, scale: 2 }),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_supports_challenge").on(table.challengeId),
  index("idx_supports_supporter").on(table.supporterId),
  index("idx_supports_player").on(table.supportedPlayerId),
  index("idx_supports_status").on(table.status),
  index("idx_supports_matched").on(table.matchedSupportId),
]);

export const spectatorSupportsRelations = relations(spectatorSupports, ({ one }) => ({
  challenge: one(challenges, { fields: [spectatorSupports.challengeId], references: [challenges.id] }),
  session: one(liveGameSessions, { fields: [spectatorSupports.sessionId], references: [liveGameSessions.id] }),
  supporter: one(users, { fields: [spectatorSupports.supporterId], references: [users.id] }),
  supportedPlayer: one(users, { fields: [spectatorSupports.supportedPlayerId], references: [users.id] }),
}));

export const insertSpectatorSupportSchema = createInsertSchema(spectatorSupports).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSpectatorSupport = z.infer<typeof insertSpectatorSupportSchema>;
export type SpectatorSupport = typeof spectatorSupports.$inferSelect;

// Matched Supports - Pairs of opposing supports
export const matchedSupports = pgTable("matched_supports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  support1Id: varchar("support1_id").notNull().references(() => spectatorSupports.id),
  support2Id: varchar("support2_id").notNull().references(() => spectatorSupports.id),
  totalPool: decimal("total_pool", { precision: 15, scale: 2 }).notNull(),
  houseFeeTotal: decimal("house_fee_total", { precision: 15, scale: 2 }).notNull(),
  winnerId: varchar("winner_id").references(() => users.id),
  winnerSupportId: varchar("winner_support_id").references(() => spectatorSupports.id),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_matched_challenge").on(table.challengeId),
  index("idx_matched_support1").on(table.support1Id),
  index("idx_matched_support2").on(table.support2Id),
]);

export const matchedSupportsRelations = relations(matchedSupports, ({ one }) => ({
  challenge: one(challenges, { fields: [matchedSupports.challengeId], references: [challenges.id] }),
  support1: one(spectatorSupports, { fields: [matchedSupports.support1Id], references: [spectatorSupports.id] }),
  support2: one(spectatorSupports, { fields: [matchedSupports.support2Id], references: [spectatorSupports.id] }),
  winner: one(users, { fields: [matchedSupports.winnerId], references: [users.id] }),
}));

export const insertMatchedSupportSchema = createInsertSchema(matchedSupports).omit({ id: true, createdAt: true });
export type InsertMatchedSupport = z.infer<typeof insertMatchedSupportSchema>;
export type MatchedSupport = typeof matchedSupports.$inferSelect;

// ==================== TOURNAMENTS ====================

export const tournamentStatusEnum = pgEnum("tournament_status", ["upcoming", "registration", "in_progress", "completed", "cancelled"]);
export const tournamentFormatEnum = pgEnum("tournament_format", ["single_elimination", "double_elimination", "round_robin", "swiss"]);

export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  description: text("description"),
  descriptionAr: text("description_ar"),
  isPublished: boolean("is_published").notNull().default(true),
  publishedAt: timestamp("published_at"),
  shareSlug: text("share_slug"),
  coverImageUrl: text("cover_image_url"),
  promoVideoUrl: text("promo_video_url"),
  gameType: text("game_type").notNull(), // chess, backgammon, domino, tarneeb, baloot
  format: tournamentFormatEnum("format").notNull().default("single_elimination"),
  status: tournamentStatusEnum("status").notNull().default("upcoming"),
  maxPlayers: integer("max_players").notNull().default(16),
  minPlayers: integer("min_players").notNull().default(4),
  autoStartOnFull: boolean("auto_start_on_full").notNull().default(false),
  autoStartPlayerCount: integer("auto_start_player_count"),
  entryFee: decimal("entry_fee", { precision: 15, scale: 2 }).notNull().default("0.00"),
  prizePool: decimal("prize_pool", { precision: 15, scale: 2 }).notNull().default("0.00"),
  currency: text("currency").notNull().default("usd"), // 'usd' (cash balance) | 'project' (VXC)
  prizeDistributionMethod: text("prize_distribution_method").notNull().default("top_3"),
  prizeDistribution: text("prize_distribution"), // JSON: [50, 30, 20] percentages
  prizesSettledAt: timestamp("prizes_settled_at"),
  currentRound: integer("current_round").notNull().default(0),
  totalRounds: integer("total_rounds").notNull().default(0),
  registrationStartsAt: timestamp("registration_starts_at"),
  registrationEndsAt: timestamp("registration_ends_at"),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdBy: varchar("created_by").references(() => users.id),
  winnerId: varchar("winner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_tournaments_status").on(table.status),
  index("idx_tournaments_is_published").on(table.isPublished),
  index("idx_tournaments_game_type").on(table.gameType),
  index("idx_tournaments_starts_at").on(table.startsAt),
  uniqueIndex("idx_tournaments_share_slug_unique").on(table.shareSlug),
]);

export const tournamentParticipants = pgTable("tournament_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  seed: integer("seed"),
  isEliminated: boolean("is_eliminated").notNull().default(false),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  placement: integer("placement"),
  prizeWon: decimal("prize_won", { precision: 15, scale: 2 }).default("0.00"),
  // Sub-wallet currency the participant paid the entry fee from. NULL = legacy
  // primary balance path (`users.balance`). When set, refunds and prize payouts
  // for this participant target the matching `user_currency_wallets` row via
  // `adjustUserCurrencyBalance`. Only meaningful when tournament.currency='usd'
  // (cash path); ignored for project (VXC) tournaments.
  walletCurrency: text("wallet_currency"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (table) => [
  index("idx_tp_tournament").on(table.tournamentId),
  index("idx_tp_user").on(table.userId),
  uniqueIndex("idx_tp_unique").on(table.tournamentId, table.userId),
]);

export const tournamentMatches = pgTable("tournament_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id),
  round: integer("round").notNull(),
  matchNumber: integer("match_number").notNull(),
  player1Id: varchar("player1_id").references(() => users.id),
  player2Id: varchar("player2_id").references(() => users.id),
  winnerId: varchar("winner_id").references(() => users.id),
  player1Score: integer("player1_score").default(0),
  player2Score: integer("player2_score").default(0),
  challengeId: varchar("challenge_id").references(() => challenges.id),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, bye
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_tm_tournament_round").on(table.tournamentId, table.round),
  index("idx_tm_players").on(table.player1Id, table.player2Id),
]);

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  creator: one(users, { fields: [tournaments.createdBy], references: [users.id] }),
  winner: one(users, { fields: [tournaments.winnerId], references: [users.id] }),
  participants: many(tournamentParticipants),
  matches: many(tournamentMatches),
}));

export const tournamentParticipantsRelations = relations(tournamentParticipants, ({ one }) => ({
  tournament: one(tournaments, { fields: [tournamentParticipants.tournamentId], references: [tournaments.id] }),
  user: one(users, { fields: [tournamentParticipants.userId], references: [users.id] }),
}));

export const tournamentMatchesRelations = relations(tournamentMatches, ({ one }) => ({
  tournament: one(tournaments, { fields: [tournamentMatches.tournamentId], references: [tournaments.id] }),
  player1: one(users, { fields: [tournamentMatches.player1Id], references: [users.id] }),
  player2: one(users, { fields: [tournamentMatches.player2Id], references: [users.id] }),
  winner: one(users, { fields: [tournamentMatches.winnerId], references: [users.id] }),
  challenge: one(challenges, { fields: [tournamentMatches.challengeId], references: [challenges.id] }),
}));

export const insertTournamentSchema = createInsertSchema(tournaments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournaments.$inferSelect;

export const insertTournamentParticipantSchema = createInsertSchema(tournamentParticipants).omit({ id: true, joinedAt: true });
export type InsertTournamentParticipant = z.infer<typeof insertTournamentParticipantSchema>;
export type TournamentParticipant = typeof tournamentParticipants.$inferSelect;

export const insertTournamentMatchSchema = createInsertSchema(tournamentMatches).omit({ id: true, createdAt: true });
export type InsertTournamentMatch = z.infer<typeof insertTournamentMatchSchema>;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;

// ==================== DAILY REWARDS ====================

export const dailyRewards = pgTable("daily_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  day: integer("day").notNull(), // streak day (1-7)
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  claimedAt: timestamp("claimed_at").defaultNow().notNull(),
  streakCount: integer("streak_count").notNull().default(1),
}, (table) => [
  index("daily_rewards_user_idx").on(table.userId),
  index("daily_rewards_claimed_idx").on(table.claimedAt),
]);

export const dailyRewardsRelations = relations(dailyRewards, ({ one }) => ({
  user: one(users, { fields: [dailyRewards.userId], references: [users.id] }),
}));

export const insertDailyRewardSchema = createInsertSchema(dailyRewards).omit({ id: true, claimedAt: true });
export type InsertDailyReward = z.infer<typeof insertDailyRewardSchema>;
export type DailyReward = typeof dailyRewards.$inferSelect;

// ==================== AD WATCH LOG ====================

export const adWatchLog = pgTable("ad_watch_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  rewardAmount: decimal("reward_amount", { precision: 10, scale: 2 }).notNull().default("0.10"),
  watchedAt: timestamp("watched_at").notNull().defaultNow(),
}, (table) => [
  index("ad_watch_log_user_idx").on(table.userId),
  index("ad_watch_log_watched_idx").on(table.watchedAt),
]);

export const adWatchLogRelations = relations(adWatchLog, ({ one }) => ({
  user: one(users, { fields: [adWatchLog.userId], references: [users.id] }),
}));

// ==================== REFERRAL REWARDS LOG ====================

export const referralRewardTypeEnum = pgEnum("referral_reward_type", ["cpa", "revshare", "adjustment"]);
export const referralRewardStatusEnum = pgEnum("referral_reward_status", ["on_hold", "released", "paid", "reversed"]);

export const referralRewardsLog = pgTable("referral_rewards_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id),
  referredId: varchar("referred_id").notNull().references(() => users.id),
  rewardAmount: decimal("reward_amount", { precision: 10, scale: 2 }).notNull(),
  rewardType: referralRewardTypeEnum("reward_type").notNull().default("cpa"),
  rewardStatus: referralRewardStatusEnum("reward_status").notNull().default("released"),
  holdUntil: timestamp("hold_until"),
  releasedAt: timestamp("released_at"),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  eventReference: text("event_reference"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("referral_rewards_referrer_idx").on(table.referrerId),
  index("referral_rewards_referred_idx").on(table.referredId),
  index("referral_rewards_type_idx").on(table.rewardType),
  index("referral_rewards_status_idx").on(table.rewardStatus),
  index("referral_rewards_hold_until_idx").on(table.holdUntil),
  uniqueIndex("referral_rewards_event_ref_unique").on(table.eventReference),
]);

export const affiliateReferralSnapshots = pgTable("affiliate_referral_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  affiliateId: varchar("affiliate_id").notNull().references(() => affiliates.id, { onDelete: "cascade" }),
  referredId: varchar("referred_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastNetRevenue: decimal("last_net_revenue", { precision: 15, scale: 2 }).notNull().default("0.00"),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_affiliate_referral_snapshots_unique").on(table.affiliateId, table.referredId),
  index("idx_affiliate_referral_snapshots_affiliate").on(table.affiliateId),
  index("idx_affiliate_referral_snapshots_referred").on(table.referredId),
]);

export const marketerSchedulerRunStatusEnum = pgEnum("marketer_scheduler_run_status", ["running", "success", "failed", "skipped"]);
export const marketerSchedulerRunTriggerEnum = pgEnum("marketer_scheduler_run_trigger", ["auto", "manual"]);

export const marketerCommissionSchedulerRuns = pgTable("marketer_commission_scheduler_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trigger: marketerSchedulerRunTriggerEnum("trigger").notNull().default("auto"),
  status: marketerSchedulerRunStatusEnum("status").notNull().default("running"),
  runKey: text("run_key"),
  idempotencyKey: text("idempotency_key"),
  nodeId: text("node_id"),
  attemptCount: integer("attempt_count").notNull().default(1),
  retryCount: integer("retry_count").notNull().default(0),
  generatedEvents: integer("generated_events").notNull().default(0),
  generatedAmount: decimal("generated_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  releasedEvents: integer("released_events").notNull().default(0),
  releasedAmount: decimal("released_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
  errorMessage: text("error_message"),
  metadata: text("metadata"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_marketer_scheduler_runs_status").on(table.status),
  index("idx_marketer_scheduler_runs_trigger").on(table.trigger),
  index("idx_marketer_scheduler_runs_started_at").on(table.startedAt),
  index("idx_marketer_scheduler_runs_run_key").on(table.runKey),
  uniqueIndex("idx_marketer_scheduler_runs_idempotency_key").on(table.idempotencyKey),
]);

// ==================== SUPPORT CHAT ====================

export const supportTicketStatusEnum = pgEnum("support_ticket_status", ["open", "active", "waiting", "closed"]);

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  subject: text("subject"),
  status: supportTicketStatusEnum("status").notNull().default("open"),
  assignedAdminId: varchar("assigned_admin_id"),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_support_tickets_user").on(table.userId),
  index("idx_support_tickets_status").on(table.status),
  index("idx_support_tickets_last_msg").on(table.lastMessageAt),
  index("idx_support_tickets_user_status").on(table.userId, table.status),
  index("idx_support_tickets_status_last_msg").on(table.status, table.lastMessageAt),
]);

export const supportMessages = pgTable("support_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull(),
  senderType: text("sender_type").notNull().default("user"),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  mediaName: text("media_name"),
  isAutoReply: boolean("is_auto_reply").notNull().default(false),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_support_messages_ticket").on(table.ticketId),
  index("idx_support_messages_created").on(table.createdAt),
  index("idx_support_messages_unread").on(table.ticketId, table.isRead, table.senderType),
]);

export const supportAutoReplies = pgTable("support_auto_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trigger: text("trigger").notNull(),
  response: text("response").notNull(),
  responseAr: text("response_ar"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  user: one(users, { fields: [supportTickets.userId], references: [users.id] }),
  messages: many(supportMessages),
}));

export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  ticket: one(supportTickets, { fields: [supportMessages.ticketId], references: [supportTickets.id] }),
}));

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastMessageAt: true,
  closedAt: true,
  closedBy: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({
  id: true,
  createdAt: true,
  readAt: true,
});
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
export type SupportMessage = typeof supportMessages.$inferSelect;

export const insertSupportAutoReplySchema = createInsertSchema(supportAutoReplies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportAutoReply = z.infer<typeof insertSupportAutoReplySchema>;
export type SupportAutoReply = typeof supportAutoReplies.$inferSelect;

// ==================== CHAT MEDIA PERMISSIONS ====================

export const chatMediaPermissions = pgTable("chat_media_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  mediaEnabled: boolean("media_enabled").notNull().default(false),
  grantedBy: text("granted_by").notNull().default("purchase"), // "admin" | "purchase"
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // null = permanent
  pricePaid: decimal("price_paid", { precision: 15, scale: 2 }).default("0.00"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chat_media_perm_user").on(table.userId),
  index("idx_chat_media_perm_enabled").on(table.mediaEnabled),
]);

export const chatMediaPermissionsRelations = relations(chatMediaPermissions, ({ one }) => ({
  user: one(users, { fields: [chatMediaPermissions.userId], references: [users.id] }),
}));

// ==================== CHAT AUTO-DELETE PERMISSIONS ====================

export const chatAutoDeletePermissions = pgTable("chat_auto_delete_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  autoDeleteEnabled: boolean("auto_delete_enabled").notNull().default(false),
  deleteAfterMinutes: integer("delete_after_minutes").notNull().default(60), // 1, 5, 15, 30, 60, 1440
  grantedBy: text("granted_by").notNull().default("purchase"), // "admin" | "purchase"
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // null = permanent
  pricePaid: decimal("price_paid", { precision: 15, scale: 2 }).default("0.00"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chat_auto_del_perm_user").on(table.userId),
  index("idx_chat_auto_del_perm_enabled").on(table.autoDeleteEnabled),
]);

export const chatAutoDeletePermissionsRelations = relations(chatAutoDeletePermissions, ({ one }) => ({
  user: one(users, { fields: [chatAutoDeletePermissions.userId], references: [users.id] }),
}));

// ==================== CHAT CALL SESSIONS ====================

export const chatCallSessions = pgTable("chat_call_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callerId: varchar("caller_id").notNull().references(() => users.id),
  receiverId: varchar("receiver_id").notNull().references(() => users.id),
  callType: text("call_type").notNull(), // voice | video
  status: text("status").notNull().default("active"), // active | ended | cancelled
  startedAt: timestamp("started_at").notNull().defaultNow(),
  connectedAt: timestamp("connected_at"),
  endedAt: timestamp("ended_at"),
  endedBy: varchar("ended_by").references(() => users.id),
  durationSeconds: integer("duration_seconds"),
  billedMinutes: integer("billed_minutes").notNull().default(0),
  ratePerMinute: decimal("rate_per_minute", { precision: 15, scale: 2 }).notNull().default("0.00"),
  totalCharged: decimal("total_charged", { precision: 15, scale: 2 }).notNull().default("0.00"),
  chargedFromWalletId: varchar("charged_from_wallet_id"),
  ledgerEntryId: varchar("ledger_entry_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_chat_call_sessions_caller").on(table.callerId),
  index("idx_chat_call_sessions_receiver").on(table.receiverId),
  index("idx_chat_call_sessions_status").on(table.status),
  index("idx_chat_call_sessions_started_at").on(table.startedAt),
  check("chk_chat_call_type", sql`${table.callType} IN ('voice', 'video')`),
  check("chk_chat_call_status", sql`${table.status} IN ('active', 'ended', 'cancelled')`),
  check("chk_chat_call_billed_minutes_non_negative", sql`${table.billedMinutes} >= 0`),
  check("chk_chat_call_total_charged_non_negative", sql`${table.totalCharged} >= 0`),
  foreignKey({
    name: "chat_call_sessions_wallet_fk",
    columns: [table.chargedFromWalletId],
    foreignColumns: [projectCurrencyWallets.id],
  }),
  foreignKey({
    name: "chat_call_sessions_ledger_fk",
    columns: [table.ledgerEntryId],
    foreignColumns: [projectCurrencyLedger.id],
  }),
]);

export const chatCallSessionsRelations = relations(chatCallSessions, ({ one }) => ({
  caller: one(users, { fields: [chatCallSessions.callerId], references: [users.id] }),
  receiver: one(users, { fields: [chatCallSessions.receiverId], references: [users.id] }),
  endedByUser: one(users, { fields: [chatCallSessions.endedBy], references: [users.id] }),
  chargedFromWallet: one(projectCurrencyWallets, {
    fields: [chatCallSessions.chargedFromWalletId],
    references: [projectCurrencyWallets.id],
  }),
  ledgerEntry: one(projectCurrencyLedger, {
    fields: [chatCallSessions.ledgerEntryId],
    references: [projectCurrencyLedger.id],
  }),
}));

export const insertChatCallSessionSchema = createInsertSchema(chatCallSessions).omit({
  id: true,
  startedAt: true,
  connectedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertChatCallSession = z.infer<typeof insertChatCallSessionSchema>;
export type ChatCallSession = typeof chatCallSessions.$inferSelect;
