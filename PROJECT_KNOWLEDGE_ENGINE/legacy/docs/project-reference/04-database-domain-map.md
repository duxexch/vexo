# 04 - Database Domain Map

Primary schema file: `shared/schema.ts`
Database access: `server/db.ts`
Data layer composition: `server/storage/index.ts`

## Data architecture model

1. PostgreSQL is the source of truth.
2. Drizzle ORM maps schema and types.
3. `shared/schema.ts` defines table structures, enums, and insert schemas.
4. Storage modules in `server/storage/*` provide domain-specific access and business-safe operations.

## Major schema domains

### Identity and access

- users
- active_sessions
- user_sessions
- login_history
- password_reset_tokens
- otp_verifications
- two_factor_backup_codes
- social_auth_accounts
- oauth_states

### Games and realtime core

- games
- multiplayer_games
- external_games
- game_sessions
- game_matches
- live_game_sessions
- game_moves
- game_spectators
- challenge_* family (challenges, sessions, spectators, bets, points, chat)

### Economy and wallet

- transactions
- deposit_requests
- project_currency_wallets
- project_currency_ledger
- project_currency_conversions

### P2P trading

- p2p_offers
- p2p_trades
- p2p_escrow
- p2p_disputes
- p2p_trade_messages
- p2p_dispute_messages
- p2p_dispute_evidence
- p2p settings and profile metrics tables

### Social and communication

- chat_messages
- gameplay_messages
- notifications
- announcements
- broadcast_notifications
- user_relationships
- follows tables

### Admin and configuration

- system_config
- system_settings
- app_settings
- feature_flags
- themes
- login_method_configs
- scheduled_config_changes
- admin_audit_logs
- admin_alerts

### Rewards and progression

- achievements
- user_achievements
- user_badges
- seasons
- seasonal_stats
- season_rewards
- daily_rewards

### Support and compliance

- complaints
- complaint_messages
- complaint_attachments
- support_tickets
- support_messages
- support_auto_replies
- support_contacts

## Storage module ownership

`server/storage/index.ts` composes these domain modules:

- users
- financial
- games
- live-games
- social
- p2p
- project-currency
- challenge-queries
- resignation-payout
- achievement-crud
- seasons
- admin
- notifications
- support

## Important FK behavior note

Most foreign keys referencing users are NO ACTION by default and require explicit deletion order in cleanup scripts. Do not assume cascade except where explicitly declared.

## Migration and schema evolution sources

- SQL migrations in `migrations/`
- Drizzle config in `drizzle.config.ts`
- Additional data patches via seed/setup scripts

## Safe modification checklist

1. Update table/enum definition in `shared/schema.ts`.
2. Update related storage module queries and types.
3. Check route handlers and frontend consumers.
4. Verify migrations/data backfill strategy.
5. Run type checks and startup validation.
