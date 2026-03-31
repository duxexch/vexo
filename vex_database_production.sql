--
-- PostgreSQL database dump
--

\restrict eg4Ap50ajAwUUMOTh7m6tdrSIud0ozJFPlVB1eQwbz7LvavXHT5DkXcXFsrdQU9

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: achievement_category; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.achievement_category AS ENUM (
    'games',
    'wins',
    'earnings',
    'streaks',
    'social',
    'special'
);


ALTER TYPE public.achievement_category OWNER TO vex_user;

--
-- Name: achievement_rarity; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.achievement_rarity AS ENUM (
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary'
);


ALTER TYPE public.achievement_rarity OWNER TO vex_user;

--
-- Name: admin_alert_severity; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.admin_alert_severity AS ENUM (
    'info',
    'warning',
    'critical',
    'urgent'
);


ALTER TYPE public.admin_alert_severity OWNER TO vex_user;

--
-- Name: admin_alert_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.admin_alert_type AS ENUM (
    'new_dispute',
    'dispute_update',
    'new_trade',
    'trade_issue',
    'new_complaint',
    'complaint_escalated',
    'game_change',
    'user_issue',
    'payment_issue',
    'system_alert',
    'security_alert'
);


ALTER TYPE public.admin_alert_type OWNER TO vex_user;

--
-- Name: admin_audit_action; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.admin_audit_action AS ENUM (
    'login',
    'logout',
    'user_update',
    'user_ban',
    'user_suspend',
    'user_balance_adjust',
    'reward_sent',
    'dispute_resolve',
    'theme_change',
    'section_toggle',
    'settings_update',
    'announcement_create',
    'announcement_update',
    'game_update',
    'promo_create',
    'p2p_ban',
    'p2p_unban'
);


ALTER TYPE public.admin_audit_action OWNER TO vex_user;

--
-- Name: advertisement_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.advertisement_type AS ENUM (
    'image',
    'video',
    'link',
    'embed'
);


ALTER TYPE public.advertisement_type OWNER TO vex_user;

--
-- Name: announcement_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.announcement_status AS ENUM (
    'draft',
    'scheduled',
    'published',
    'archived'
);


ALTER TYPE public.announcement_status OWNER TO vex_user;

--
-- Name: announcement_target; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.announcement_target AS ENUM (
    'all',
    'players',
    'agents',
    'affiliates',
    'vip'
);


ALTER TYPE public.announcement_target OWNER TO vex_user;

--
-- Name: audit_action; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.audit_action AS ENUM (
    'login',
    'logout',
    'deposit',
    'withdrawal',
    'stake',
    'win',
    'complaint',
    'settings_change',
    'user_update',
    'game_update'
);


ALTER TYPE public.audit_action OWNER TO vex_user;

--
-- Name: complaint_category; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.complaint_category AS ENUM (
    'financial',
    'technical',
    'account',
    'game',
    'other'
);


ALTER TYPE public.complaint_category OWNER TO vex_user;

--
-- Name: complaint_priority; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.complaint_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


ALTER TYPE public.complaint_priority OWNER TO vex_user;

--
-- Name: complaint_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.complaint_status AS ENUM (
    'open',
    'assigned',
    'in_progress',
    'escalated',
    'resolved',
    'closed'
);


ALTER TYPE public.complaint_status OWNER TO vex_user;

--
-- Name: currency_approval_mode; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.currency_approval_mode AS ENUM (
    'automatic',
    'manual'
);


ALTER TYPE public.currency_approval_mode OWNER TO vex_user;

--
-- Name: currency_conversion_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.currency_conversion_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'completed'
);


ALTER TYPE public.currency_conversion_status OWNER TO vex_user;

--
-- Name: currency_ledger_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.currency_ledger_type AS ENUM (
    'conversion',
    'game_stake',
    'game_win',
    'p2p_send',
    'p2p_receive',
    'bonus',
    'refund',
    'admin_adjustment'
);


ALTER TYPE public.currency_ledger_type OWNER TO vex_user;

--
-- Name: deposit_request_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.deposit_request_status AS ENUM (
    'pending',
    'confirmed',
    'rejected',
    'expired'
);


ALTER TYPE public.deposit_request_status OWNER TO vex_user;

--
-- Name: free_play_period; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.free_play_period AS ENUM (
    'daily',
    'weekly',
    'monthly'
);


ALTER TYPE public.free_play_period OWNER TO vex_user;

--
-- Name: game_match_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.game_match_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE public.game_match_status OWNER TO vex_user;

--
-- Name: game_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.game_status AS ENUM (
    'active',
    'listed',
    'inactive',
    'maintenance'
);


ALTER TYPE public.game_status OWNER TO vex_user;

--
-- Name: game_volatility; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.game_volatility AS ENUM (
    'low',
    'medium',
    'high'
);


ALTER TYPE public.game_volatility OWNER TO vex_user;

--
-- Name: id_verification_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.id_verification_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE public.id_verification_status OWNER TO vex_user;

--
-- Name: live_game_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.live_game_status AS ENUM (
    'waiting',
    'starting',
    'in_progress',
    'paused',
    'completed',
    'cancelled'
);


ALTER TYPE public.live_game_status OWNER TO vex_user;

--
-- Name: match_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.match_type AS ENUM (
    'random',
    'friend'
);


ALTER TYPE public.match_type OWNER TO vex_user;

--
-- Name: matchmaking_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.matchmaking_status AS ENUM (
    'waiting',
    'matched',
    'expired',
    'cancelled'
);


ALTER TYPE public.matchmaking_status OWNER TO vex_user;

--
-- Name: notification_priority; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.notification_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


ALTER TYPE public.notification_priority OWNER TO vex_user;

--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.notification_type AS ENUM (
    'announcement',
    'transaction',
    'security',
    'promotion',
    'system',
    'p2p',
    'id_verification',
    'success',
    'warning'
);


ALTER TYPE public.notification_type OWNER TO vex_user;

--
-- Name: odds_calculation_mode; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.odds_calculation_mode AS ENUM (
    'automatic',
    'manual'
);


ALTER TYPE public.odds_calculation_mode OWNER TO vex_user;

--
-- Name: otp_contact_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.otp_contact_type AS ENUM (
    'email',
    'phone'
);


ALTER TYPE public.otp_contact_type OWNER TO vex_user;

--
-- Name: p2p_badge_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.p2p_badge_type AS ENUM (
    'verified',
    'trusted_seller',
    'trusted_buyer',
    'fast_responder',
    'high_volume',
    'new_star',
    'dispute_free',
    'premium_trader',
    'top_rated'
);


ALTER TYPE public.p2p_badge_type OWNER TO vex_user;

--
-- Name: p2p_dispute_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.p2p_dispute_status AS ENUM (
    'open',
    'investigating',
    'resolved',
    'closed'
);


ALTER TYPE public.p2p_dispute_status OWNER TO vex_user;

--
-- Name: p2p_fee_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.p2p_fee_type AS ENUM (
    'percentage',
    'fixed',
    'hybrid'
);


ALTER TYPE public.p2p_fee_type OWNER TO vex_user;

--
-- Name: p2p_offer_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.p2p_offer_status AS ENUM (
    'active',
    'paused',
    'completed',
    'cancelled'
);


ALTER TYPE public.p2p_offer_status OWNER TO vex_user;

--
-- Name: p2p_offer_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.p2p_offer_type AS ENUM (
    'buy',
    'sell'
);


ALTER TYPE public.p2p_offer_type OWNER TO vex_user;

--
-- Name: p2p_trade_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.p2p_trade_status AS ENUM (
    'pending',
    'paid',
    'confirmed',
    'completed',
    'cancelled',
    'disputed'
);


ALTER TYPE public.p2p_trade_status OWNER TO vex_user;

--
-- Name: p2p_transaction_log_action; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.p2p_transaction_log_action AS ENUM (
    'trade_created',
    'payment_marked',
    'payment_confirmed',
    'trade_completed',
    'trade_cancelled',
    'dispute_opened',
    'dispute_message',
    'evidence_uploaded',
    'dispute_resolved',
    'escrow_held',
    'escrow_released',
    'escrow_returned'
);


ALTER TYPE public.p2p_transaction_log_action OWNER TO vex_user;

--
-- Name: p2p_verification_level; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.p2p_verification_level AS ENUM (
    'none',
    'email',
    'phone',
    'kyc_basic',
    'kyc_full'
);


ALTER TYPE public.p2p_verification_level OWNER TO vex_user;

--
-- Name: payment_method_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.payment_method_type AS ENUM (
    'bank_transfer',
    'e_wallet',
    'crypto',
    'card'
);


ALTER TYPE public.payment_method_type OWNER TO vex_user;

--
-- Name: promo_code_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.promo_code_type AS ENUM (
    'percentage',
    'fixed',
    'free_spins'
);


ALTER TYPE public.promo_code_type OWNER TO vex_user;

--
-- Name: scheduled_change_action; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.scheduled_change_action AS ENUM (
    'activate',
    'deactivate',
    'update_settings'
);


ALTER TYPE public.scheduled_change_action OWNER TO vex_user;

--
-- Name: scheduled_change_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.scheduled_change_status AS ENUM (
    'pending',
    'applied',
    'cancelled',
    'failed'
);


ALTER TYPE public.scheduled_change_status OWNER TO vex_user;

--
-- Name: season_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.season_status AS ENUM (
    'upcoming',
    'active',
    'ended',
    'archived'
);


ALTER TYPE public.season_status OWNER TO vex_user;

--
-- Name: social_platform_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.social_platform_type AS ENUM (
    'oauth',
    'otp',
    'both'
);


ALTER TYPE public.social_platform_type OWNER TO vex_user;

--
-- Name: support_contact_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.support_contact_type AS ENUM (
    'whatsapp',
    'telegram',
    'email',
    'phone',
    'facebook',
    'instagram',
    'twitter',
    'discord',
    'other'
);


ALTER TYPE public.support_contact_type OWNER TO vex_user;

--
-- Name: support_mode; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.support_mode AS ENUM (
    'instant',
    'wait_for_match'
);


ALTER TYPE public.support_mode OWNER TO vex_user;

--
-- Name: support_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.support_status AS ENUM (
    'pending',
    'matched',
    'won',
    'lost',
    'cancelled',
    'refunded'
);


ALTER TYPE public.support_status OWNER TO vex_user;

--
-- Name: transaction_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.transaction_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'completed',
    'cancelled'
);


ALTER TYPE public.transaction_status OWNER TO vex_user;

--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.transaction_type AS ENUM (
    'deposit',
    'withdrawal',
    'stake',
    'win',
    'bonus',
    'commission',
    'refund',
    'gift_sent',
    'gift_received'
);


ALTER TYPE public.transaction_type OWNER TO vex_user;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'agent',
    'affiliate',
    'player'
);


ALTER TYPE public.user_role OWNER TO vex_user;

--
-- Name: user_status; Type: TYPE; Schema: public; Owner: vex_user
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'inactive',
    'suspended',
    'banned'
);


ALTER TYPE public.user_status OWNER TO vex_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.achievements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name_en text NOT NULL,
    name_ar text NOT NULL,
    description_en text NOT NULL,
    description_ar text NOT NULL,
    category public.achievement_category NOT NULL,
    rarity public.achievement_rarity DEFAULT 'common'::public.achievement_rarity NOT NULL,
    game_type text,
    requirement integer DEFAULT 1 NOT NULL,
    reward_amount numeric(15,2) DEFAULT 0.00 NOT NULL,
    icon_name text DEFAULT 'trophy'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.achievements OWNER TO vex_user;

--
-- Name: admin_alerts; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.admin_alerts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    type public.admin_alert_type NOT NULL,
    severity public.admin_alert_severity DEFAULT 'info'::public.admin_alert_severity NOT NULL,
    title text NOT NULL,
    title_ar text,
    message text NOT NULL,
    message_ar text,
    entity_type text,
    entity_id character varying,
    deep_link text,
    metadata text,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp without time zone,
    read_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admin_alerts OWNER TO vex_user;

--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.admin_audit_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    admin_id character varying NOT NULL,
    action public.admin_audit_action NOT NULL,
    entity_type text,
    entity_id character varying,
    previous_value text,
    new_value text,
    reason text,
    ip_address text,
    user_agent text,
    metadata text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admin_audit_logs OWNER TO vex_user;

--
-- Name: advertisements; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.advertisements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    title_ar text,
    type public.advertisement_type DEFAULT 'image'::public.advertisement_type NOT NULL,
    asset_url text,
    target_url text,
    embed_code text,
    display_duration integer DEFAULT 5000 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    starts_at timestamp without time zone,
    ends_at timestamp without time zone,
    created_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.advertisements OWNER TO vex_user;

--
-- Name: affiliates; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.affiliates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    affiliate_code text NOT NULL,
    referral_link text,
    commission_rate numeric(5,2) DEFAULT 5.00 NOT NULL,
    total_referrals integer DEFAULT 0 NOT NULL,
    active_referrals integer DEFAULT 0 NOT NULL,
    total_commission_earned numeric(15,2) DEFAULT 0.00 NOT NULL,
    pending_commission numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_clicks integer DEFAULT 0 NOT NULL,
    total_registrations integer DEFAULT 0 NOT NULL,
    total_deposits integer DEFAULT 0 NOT NULL,
    tier text DEFAULT 'bronze'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.affiliates OWNER TO vex_user;

--
-- Name: agent_payment_methods; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.agent_payment_methods (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    agent_id character varying NOT NULL,
    type public.payment_method_type NOT NULL,
    name text NOT NULL,
    account_number text,
    bank_name text,
    holder_name text,
    details text,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agent_payment_methods OWNER TO vex_user;

--
-- Name: agents; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.agents (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    agent_code text NOT NULL,
    commission_rate_deposit numeric(5,4) DEFAULT 0.02 NOT NULL,
    commission_rate_withdraw numeric(5,4) DEFAULT 0.01 NOT NULL,
    total_commission_earned numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_deposits_processed numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_withdrawals_processed numeric(15,2) DEFAULT 0.00 NOT NULL,
    daily_limit numeric(15,2) DEFAULT 100000.00 NOT NULL,
    monthly_limit numeric(15,2) DEFAULT 1000000.00 NOT NULL,
    initial_deposit numeric(15,2) DEFAULT 0.00 NOT NULL,
    current_balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    is_online boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    assigned_customers_count integer DEFAULT 0 NOT NULL,
    performance_score numeric(5,2) DEFAULT 100.00 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agents OWNER TO vex_user;

--
-- Name: announcement_views; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.announcement_views (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    announcement_id character varying NOT NULL,
    user_id character varying NOT NULL,
    viewed_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.announcement_views OWNER TO vex_user;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.announcements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    title_ar text,
    content text NOT NULL,
    content_ar text,
    image_url text,
    link text,
    status public.announcement_status DEFAULT 'draft'::public.announcement_status NOT NULL,
    target public.announcement_target DEFAULT 'all'::public.announcement_target NOT NULL,
    priority public.notification_priority DEFAULT 'normal'::public.notification_priority NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    published_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.announcements OWNER TO vex_user;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.app_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text,
    value_ar text,
    category text,
    updated_by character varying,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.app_settings OWNER TO vex_user;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.audit_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    action public.audit_action NOT NULL,
    entity_type text,
    entity_id character varying,
    details text,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO vex_user;

--
-- Name: backgammon_moves; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.backgammon_moves (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    player_id character varying NOT NULL,
    move_number integer NOT NULL,
    from_point integer NOT NULL,
    to_point integer NOT NULL,
    die_used integer NOT NULL,
    is_hit boolean DEFAULT false NOT NULL,
    is_bear_off boolean DEFAULT false NOT NULL,
    board_state text,
    time_spent integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.backgammon_moves OWNER TO vex_user;

--
-- Name: badge_catalog; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.badge_catalog (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    description text,
    description_ar text,
    icon_url text,
    icon_name text,
    color text,
    category text,
    requirement text,
    points integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.badge_catalog OWNER TO vex_user;

--
-- Name: broadcast_notifications; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.broadcast_notifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    title_ar text,
    content text NOT NULL,
    content_ar text,
    target_type text NOT NULL,
    target_value text,
    sent_by character varying,
    sent_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone
);


ALTER TABLE public.broadcast_notifications OWNER TO vex_user;

--
-- Name: card_game_bids; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.card_game_bids (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    player_id character varying NOT NULL,
    round_number integer NOT NULL,
    bid_value integer,
    bid_suit text,
    is_pass boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.card_game_bids OWNER TO vex_user;

--
-- Name: card_game_plays; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.card_game_plays (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    player_id character varying NOT NULL,
    round_number integer NOT NULL,
    trick_number integer NOT NULL,
    card_suit text NOT NULL,
    card_rank text NOT NULL,
    play_order integer NOT NULL,
    won_trick boolean DEFAULT false NOT NULL,
    time_spent integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.card_game_plays OWNER TO vex_user;

--
-- Name: challenge_chat_messages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_chat_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    message text NOT NULL,
    is_quick_message boolean DEFAULT false NOT NULL,
    quick_message_key text,
    is_spectator boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.challenge_chat_messages OWNER TO vex_user;

--
-- Name: challenge_follow_notifications; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_follow_notifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    follower_id character varying NOT NULL,
    challenger_id character varying NOT NULL,
    challenge_id character varying NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.challenge_follow_notifications OWNER TO vex_user;

--
-- Name: challenge_follows; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_follows (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    follower_id character varying NOT NULL,
    followed_id character varying NOT NULL,
    notify_on_match boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.challenge_follows OWNER TO vex_user;

--
-- Name: challenge_game_sessions; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_game_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    challenge_id character varying NOT NULL,
    game_type text NOT NULL,
    current_turn character varying,
    player1_time_remaining integer DEFAULT 300 NOT NULL,
    player2_time_remaining integer DEFAULT 300 NOT NULL,
    game_state text,
    last_move_at timestamp without time zone,
    status text DEFAULT 'waiting'::text NOT NULL,
    winner_id character varying,
    win_reason text,
    total_moves integer DEFAULT 0 NOT NULL,
    spectator_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.challenge_game_sessions OWNER TO vex_user;

--
-- Name: challenge_gifts; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_gifts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    challenge_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    recipient_id character varying NOT NULL,
    gift_id character varying NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    message text,
    sent_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.challenge_gifts OWNER TO vex_user;

--
-- Name: challenge_points_ledger; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_points_ledger (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    challenge_id character varying NOT NULL,
    user_id character varying NOT NULL,
    target_player_id character varying NOT NULL,
    points_amount integer NOT NULL,
    reason text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.challenge_points_ledger OWNER TO vex_user;

--
-- Name: challenge_ratings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_ratings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    total_challenges integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    draws integer DEFAULT 0 NOT NULL,
    win_rate numeric(5,2) DEFAULT '0'::numeric,
    current_streak integer DEFAULT 0,
    best_streak integer DEFAULT 0,
    total_earnings numeric(20,8) DEFAULT '0'::numeric,
    rank text DEFAULT 'bronze'::text,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.challenge_ratings OWNER TO vex_user;

--
-- Name: challenge_spectator_bets; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_spectator_bets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    challenge_id character varying NOT NULL,
    spectator_id character varying NOT NULL,
    backed_player_id character varying NOT NULL,
    bet_amount numeric(20,8) NOT NULL,
    potential_winnings numeric(20,8) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    settled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    currency_type text DEFAULT 'usd'::text NOT NULL
);


ALTER TABLE public.challenge_spectator_bets OWNER TO vex_user;

--
-- Name: challenge_spectators; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenge_spectators (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    challenge_id character varying NOT NULL,
    user_id character varying NOT NULL,
    joined_at timestamp without time zone DEFAULT now() NOT NULL,
    left_at timestamp without time zone
);


ALTER TABLE public.challenge_spectators OWNER TO vex_user;

--
-- Name: challenger_follows; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenger_follows (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    follower_id character varying NOT NULL,
    followed_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.challenger_follows OWNER TO vex_user;

--
-- Name: challenges; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.challenges (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    game_type text NOT NULL,
    bet_amount numeric(20,8) DEFAULT '0'::numeric NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    player1_id character varying NOT NULL,
    player2_id character varying,
    winner_id character varying,
    opponent_type text DEFAULT 'random'::text,
    friend_account_id text,
    time_limit integer DEFAULT 300 NOT NULL,
    player1_score integer DEFAULT 0,
    player2_score integer DEFAULT 0,
    started_at timestamp without time zone,
    ended_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    currency_type text DEFAULT 'usd'::text NOT NULL,
    player3_id character varying,
    player4_id character varying,
    required_players integer DEFAULT 2 NOT NULL,
    current_players integer DEFAULT 1 NOT NULL,
    player3_score integer DEFAULT 0,
    player4_score integer DEFAULT 0
);


ALTER TABLE public.challenges OWNER TO vex_user;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.chat_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    sender_id character varying NOT NULL,
    receiver_id character varying NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    attachment_url text,
    read_at timestamp without time zone,
    is_disappearing boolean DEFAULT false NOT NULL,
    disappear_after_read boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone
);


ALTER TABLE public.chat_messages OWNER TO vex_user;

--
-- Name: chat_settings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.chat_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text,
    updated_by character varying,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chat_settings OWNER TO vex_user;

--
-- Name: chess_moves; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.chess_moves (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    player_id character varying NOT NULL,
    move_number integer NOT NULL,
    from_square text NOT NULL,
    to_square text NOT NULL,
    piece text NOT NULL,
    captured_piece text,
    is_check boolean DEFAULT false NOT NULL,
    is_checkmate boolean DEFAULT false NOT NULL,
    is_castling boolean DEFAULT false NOT NULL,
    is_en_passant boolean DEFAULT false NOT NULL,
    promotion_piece text,
    notation text NOT NULL,
    fen text NOT NULL,
    time_spent integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chess_moves OWNER TO vex_user;

--
-- Name: complaint_attachments; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.complaint_attachments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    complaint_id character varying NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text,
    file_size integer,
    uploaded_by character varying NOT NULL,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.complaint_attachments OWNER TO vex_user;

--
-- Name: complaint_messages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.complaint_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    complaint_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    message text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.complaint_messages OWNER TO vex_user;

--
-- Name: complaints; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.complaints (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    ticket_number text NOT NULL,
    user_id character varying NOT NULL,
    assigned_agent_id character varying,
    category public.complaint_category NOT NULL,
    priority public.complaint_priority DEFAULT 'medium'::public.complaint_priority NOT NULL,
    status public.complaint_status DEFAULT 'open'::public.complaint_status NOT NULL,
    subject text NOT NULL,
    description text NOT NULL,
    transaction_id character varying,
    sla_deadline timestamp without time zone,
    resolved_at timestamp without time zone,
    resolution text,
    rating integer,
    rating_comment text,
    escalated_at timestamp without time zone,
    escalated_to character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.complaints OWNER TO vex_user;

--
-- Name: country_payment_methods; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.country_payment_methods (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    country_code text NOT NULL,
    currency_id character varying,
    name text NOT NULL,
    type public.payment_method_type NOT NULL,
    icon_url text,
    min_amount numeric(15,2) DEFAULT 10.00 NOT NULL,
    max_amount numeric(15,2) DEFAULT 10000.00 NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    processing_time text,
    instructions text,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.country_payment_methods OWNER TO vex_user;

--
-- Name: currencies; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.currencies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    exchange_rate numeric(15,6) DEFAULT 1.000000 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    country text,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.currencies OWNER TO vex_user;

--
-- Name: deposit_requests; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.deposit_requests (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    assigned_agent_id character varying,
    amount numeric(15,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    payment_method text NOT NULL,
    payment_reference text NOT NULL,
    wallet_number text,
    status public.deposit_request_status DEFAULT 'pending'::public.deposit_request_status NOT NULL,
    min_amount numeric(15,2),
    max_amount numeric(15,2),
    agent_note text,
    confirmed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.deposit_requests OWNER TO vex_user;

--
-- Name: domino_moves; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.domino_moves (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    player_id character varying NOT NULL,
    move_number integer NOT NULL,
    tile_left integer NOT NULL,
    tile_right integer NOT NULL,
    placed_end text,
    is_passed boolean DEFAULT false NOT NULL,
    board_state text,
    time_spent integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.domino_moves OWNER TO vex_user;

--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.feature_flags (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    name_ar text,
    description text,
    description_ar text,
    is_enabled boolean DEFAULT true NOT NULL,
    category text DEFAULT 'section'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    icon text,
    updated_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.feature_flags OWNER TO vex_user;

--
-- Name: financial_limits; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.financial_limits (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    vip_level integer DEFAULT 0 NOT NULL,
    min_deposit numeric(15,2) DEFAULT 10.00 NOT NULL,
    max_deposit numeric(15,2) DEFAULT 10000.00 NOT NULL,
    min_withdrawal numeric(15,2) DEFAULT 20.00 NOT NULL,
    max_withdrawal numeric(15,2) DEFAULT 5000.00 NOT NULL,
    daily_withdrawal_limit numeric(15,2) DEFAULT 10000.00 NOT NULL,
    monthly_withdrawal_limit numeric(15,2) DEFAULT 100000.00 NOT NULL,
    min_bet numeric(15,2) DEFAULT 1.00 NOT NULL,
    max_bet numeric(15,2) DEFAULT 1000.00 NOT NULL,
    daily_loss_limit numeric(15,2),
    weekly_loss_limit numeric(15,2),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.financial_limits OWNER TO vex_user;

--
-- Name: game_chat_messages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.game_chat_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    user_id character varying NOT NULL,
    message text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    is_from_spectator boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.game_chat_messages OWNER TO vex_user;

--
-- Name: game_matches; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.game_matches (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    game_id character varying NOT NULL,
    player1_id character varying NOT NULL,
    player2_id character varying NOT NULL,
    status public.game_match_status DEFAULT 'pending'::public.game_match_status NOT NULL,
    winner_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone
);


ALTER TABLE public.game_matches OWNER TO vex_user;

--
-- Name: game_moves; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.game_moves (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    player_id character varying NOT NULL,
    move_number integer NOT NULL,
    move_type text NOT NULL,
    move_data text NOT NULL,
    previous_state text,
    new_state text,
    is_valid boolean DEFAULT true NOT NULL,
    time_taken integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.game_moves OWNER TO vex_user;

--
-- Name: game_sections; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.game_sections (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name_en text NOT NULL,
    name_ar text NOT NULL,
    icon text DEFAULT 'Gamepad2'::text NOT NULL,
    icon_color text DEFAULT 'text-primary'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.game_sections OWNER TO vex_user;

--
-- Name: game_sessions; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.game_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    game_id character varying NOT NULL,
    bet_amount numeric(15,2) NOT NULL,
    multiplier numeric(10,2) NOT NULL,
    win_amount numeric(15,2) DEFAULT 0.00 NOT NULL,
    is_win boolean NOT NULL,
    balance_before numeric(15,2) NOT NULL,
    balance_after numeric(15,2) NOT NULL,
    seed text,
    result text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.game_sessions OWNER TO vex_user;

--
-- Name: game_spectators; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.game_spectators (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    user_id character varying NOT NULL,
    joined_at timestamp without time zone DEFAULT now() NOT NULL,
    left_at timestamp without time zone,
    total_gifts_sent numeric(15,2) DEFAULT 0.00 NOT NULL
);


ALTER TABLE public.game_spectators OWNER TO vex_user;

--
-- Name: gameplay_emojis; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.gameplay_emojis (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    emoji text NOT NULL,
    name text NOT NULL,
    name_ar text,
    price numeric(10,2) DEFAULT 0.50 NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.gameplay_emojis OWNER TO vex_user;

--
-- Name: gameplay_messages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.gameplay_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    match_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    message text,
    emoji_id character varying,
    is_emoji boolean DEFAULT false NOT NULL,
    emoji_cost numeric(10,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.gameplay_messages OWNER TO vex_user;

--
-- Name: gameplay_settings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.gameplay_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    description_ar text,
    updated_by character varying,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.gameplay_settings OWNER TO vex_user;

--
-- Name: games; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.games (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    thumbnail_url text,
    category text DEFAULT 'slots'::text NOT NULL,
    status public.game_status DEFAULT 'active'::public.game_status NOT NULL,
    rtp numeric(5,2) DEFAULT 95.00 NOT NULL,
    house_edge numeric(5,2) DEFAULT 5.00 NOT NULL,
    volatility public.game_volatility DEFAULT 'medium'::public.game_volatility NOT NULL,
    min_bet numeric(15,2) DEFAULT 1.00 NOT NULL,
    max_bet numeric(15,2) DEFAULT 1000.00 NOT NULL,
    multiplier_min numeric(10,2) DEFAULT 0.00 NOT NULL,
    multiplier_max numeric(10,2) DEFAULT 100.00 NOT NULL,
    play_count integer DEFAULT 0 NOT NULL,
    total_volume numeric(15,2) DEFAULT 0.00 NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    sections text[] DEFAULT ARRAY['play'::text] NOT NULL,
    game_type text DEFAULT 'single'::text NOT NULL,
    max_players integer DEFAULT 1 NOT NULL,
    min_players integer DEFAULT 1 NOT NULL,
    is_free_to_play boolean DEFAULT false NOT NULL,
    play_price numeric(15,2) DEFAULT 0.00,
    pricing_type text DEFAULT 'bet'::text NOT NULL
);


ALTER TABLE public.games OWNER TO vex_user;

--
-- Name: gift_catalog; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.gift_catalog (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    description text,
    description_ar text,
    price numeric(20,8) NOT NULL,
    icon_url text,
    category text DEFAULT 'general'::text,
    animation_type text DEFAULT 'float'::text,
    coin_value integer DEFAULT 1,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.gift_catalog OWNER TO vex_user;

--
-- Name: gift_items; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.gift_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    description text,
    description_ar text,
    icon text NOT NULL,
    animation_url text,
    price numeric(15,2) NOT NULL,
    creator_share numeric(5,2) DEFAULT 70.00 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.gift_items OWNER TO vex_user;

--
-- Name: languages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.languages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    native_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.languages OWNER TO vex_user;

--
-- Name: link_analytics; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.link_analytics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    affiliate_id character varying NOT NULL,
    source text,
    medium text,
    campaign text,
    ip_address text,
    user_agent text,
    country text,
    city text,
    is_registered boolean DEFAULT false NOT NULL,
    is_deposited boolean DEFAULT false NOT NULL,
    registered_user_id character varying,
    clicked_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.link_analytics OWNER TO vex_user;

--
-- Name: live_game_sessions; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.live_game_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    challenge_id character varying,
    game_id character varying NOT NULL,
    game_type text NOT NULL,
    status public.live_game_status DEFAULT 'waiting'::public.live_game_status NOT NULL,
    game_state text,
    current_turn character varying,
    turn_number integer DEFAULT 0 NOT NULL,
    turn_started_at timestamp without time zone,
    turn_time_limit integer DEFAULT 60 NOT NULL,
    player1_id character varying NOT NULL,
    player2_id character varying,
    player3_id character varying,
    player4_id character varying,
    player1_score integer DEFAULT 0 NOT NULL,
    player2_score integer DEFAULT 0 NOT NULL,
    player3_score integer DEFAULT 0 NOT NULL,
    player4_score integer DEFAULT 0 NOT NULL,
    team1_score integer DEFAULT 0 NOT NULL,
    team2_score integer DEFAULT 0 NOT NULL,
    winner_id character varying,
    winning_team integer,
    spectator_count integer DEFAULT 0 NOT NULL,
    total_gifts_value numeric(15,2) DEFAULT 0.00 NOT NULL,
    started_at timestamp without time zone,
    ended_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.live_game_sessions OWNER TO vex_user;

--
-- Name: login_history; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.login_history (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    ip_address text,
    user_agent text,
    device_info text,
    location text,
    is_success boolean DEFAULT true NOT NULL,
    failure_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.login_history OWNER TO vex_user;

--
-- Name: login_method_configs; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.login_method_configs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    method text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    otp_enabled boolean DEFAULT false NOT NULL,
    otp_length integer DEFAULT 6 NOT NULL,
    otp_expiry_minutes integer DEFAULT 5 NOT NULL,
    settings text,
    updated_by character varying,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.login_method_configs OWNER TO vex_user;

--
-- Name: managed_languages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.managed_languages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    native_name text,
    direction text DEFAULT 'ltr'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    translations text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.managed_languages OWNER TO vex_user;

--
-- Name: matched_supports; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.matched_supports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    challenge_id character varying NOT NULL,
    support1_id character varying NOT NULL,
    support2_id character varying NOT NULL,
    total_pool numeric(15,2) NOT NULL,
    house_fee_total numeric(15,2) NOT NULL,
    winner_id character varying,
    winner_support_id character varying,
    settled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.matched_supports OWNER TO vex_user;

--
-- Name: matchmaking_queue; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.matchmaking_queue (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    game_id character varying NOT NULL,
    user_id character varying NOT NULL,
    match_type public.match_type DEFAULT 'random'::public.match_type NOT NULL,
    friend_account_id character varying,
    status public.matchmaking_status DEFAULT 'waiting'::public.matchmaking_status NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.matchmaking_queue OWNER TO vex_user;

--
-- Name: multiplayer_games; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.multiplayer_games (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name_en text NOT NULL,
    name_ar text NOT NULL,
    description_en text,
    description_ar text,
    icon_name text DEFAULT 'Gamepad2'::text NOT NULL,
    color_class text DEFAULT 'bg-primary/20 text-primary'::text NOT NULL,
    gradient_class text DEFAULT 'from-primary/20 to-primary/10'::text,
    is_active boolean DEFAULT true NOT NULL,
    min_stake numeric(15,2) DEFAULT 1.00 NOT NULL,
    max_stake numeric(15,2) DEFAULT 1000.00 NOT NULL,
    house_fee numeric(5,4) DEFAULT 0.05 NOT NULL,
    min_players integer DEFAULT 2 NOT NULL,
    max_players integer DEFAULT 2 NOT NULL,
    default_time_limit integer DEFAULT 300 NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    total_games_played integer DEFAULT 0 NOT NULL,
    total_volume numeric(20,2) DEFAULT 0.00 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    category text DEFAULT 'multiplayer'::text NOT NULL,
    status public.game_status DEFAULT 'active'::public.game_status NOT NULL,
    price_vex numeric(15,2) DEFAULT 0.00 NOT NULL,
    free_play_limit integer DEFAULT 0 NOT NULL,
    free_play_period public.free_play_period DEFAULT 'daily'::public.free_play_period,
    display_locations text[] DEFAULT ARRAY['games'::text] NOT NULL
);


ALTER TABLE public.multiplayer_games OWNER TO vex_user;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.notifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type public.notification_type DEFAULT 'system'::public.notification_type NOT NULL,
    priority public.notification_priority DEFAULT 'normal'::public.notification_priority NOT NULL,
    title text NOT NULL,
    title_ar text,
    message text NOT NULL,
    message_ar text,
    link text,
    metadata text,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO vex_user;

--
-- Name: otp_verifications; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.otp_verifications (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    contact_type public.otp_contact_type NOT NULL,
    contact_value text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    consumed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.otp_verifications OWNER TO vex_user;

--
-- Name: p2p_badge_definitions; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_badge_definitions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    name_ar text,
    description text NOT NULL,
    description_ar text,
    icon text NOT NULL,
    color text DEFAULT '#00c853'::text NOT NULL,
    min_trades integer,
    min_completion_rate numeric(5,2),
    min_volume numeric(20,2),
    max_dispute_rate numeric(5,2),
    max_response_time integer,
    requires_verification public.p2p_verification_level,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_badge_definitions OWNER TO vex_user;

--
-- Name: p2p_dispute_evidence; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_dispute_evidence (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    dispute_id character varying NOT NULL,
    uploader_id character varying NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text NOT NULL,
    file_size integer NOT NULL,
    description text,
    evidence_type text NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    verified_by character varying,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_dispute_evidence OWNER TO vex_user;

--
-- Name: p2p_dispute_messages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_dispute_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    dispute_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    message text NOT NULL,
    is_prewritten boolean DEFAULT false NOT NULL,
    prewritten_template_id character varying,
    is_from_support boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_dispute_messages OWNER TO vex_user;

--
-- Name: p2p_dispute_rules; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_dispute_rules (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    title_ar text,
    content text NOT NULL,
    content_ar text,
    icon text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_dispute_rules OWNER TO vex_user;

--
-- Name: p2p_disputes; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_disputes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trade_id character varying NOT NULL,
    initiator_id character varying NOT NULL,
    respondent_id character varying NOT NULL,
    status public.p2p_dispute_status DEFAULT 'open'::public.p2p_dispute_status NOT NULL,
    reason text NOT NULL,
    description text NOT NULL,
    evidence text[],
    resolution text,
    resolved_by character varying,
    winner_user_id character varying,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_disputes OWNER TO vex_user;

--
-- Name: p2p_escrow; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_escrow (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trade_id character varying NOT NULL,
    amount numeric(15,8) NOT NULL,
    currency text NOT NULL,
    status text DEFAULT 'held'::text NOT NULL,
    held_at timestamp without time zone DEFAULT now() NOT NULL,
    released_at timestamp without time zone,
    returned_at timestamp without time zone
);


ALTER TABLE public.p2p_escrow OWNER TO vex_user;

--
-- Name: p2p_offers; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_offers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type public.p2p_offer_type NOT NULL,
    status public.p2p_offer_status DEFAULT 'active'::public.p2p_offer_status NOT NULL,
    crypto_currency text NOT NULL,
    fiat_currency text NOT NULL,
    price numeric(15,2) NOT NULL,
    available_amount numeric(15,8) NOT NULL,
    min_limit numeric(15,2) NOT NULL,
    max_limit numeric(15,2) NOT NULL,
    payment_methods text[],
    payment_time_limit integer DEFAULT 15 NOT NULL,
    terms text,
    auto_reply text,
    completed_trades integer DEFAULT 0 NOT NULL,
    completion_rate numeric(5,2) DEFAULT 100.00 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_offers OWNER TO vex_user;

--
-- Name: p2p_prewritten_responses; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_prewritten_responses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    title_ar text,
    message text NOT NULL,
    message_ar text,
    is_active boolean DEFAULT true NOT NULL,
    usage_count integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_prewritten_responses OWNER TO vex_user;

--
-- Name: p2p_settings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    platform_fee_percentage numeric(5,4) DEFAULT 0.005 NOT NULL,
    min_trade_amount numeric(15,2) DEFAULT 10.00 NOT NULL,
    max_trade_amount numeric(15,2) DEFAULT 100000.00 NOT NULL,
    escrow_timeout_hours integer DEFAULT 24 NOT NULL,
    payment_timeout_minutes integer DEFAULT 15 NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    fee_type public.p2p_fee_type DEFAULT 'percentage'::public.p2p_fee_type NOT NULL,
    platform_fee_fixed numeric(15,2) DEFAULT 0.00 NOT NULL,
    min_fee numeric(15,2) DEFAULT 0.00 NOT NULL,
    max_fee numeric(15,2),
    auto_expire_enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE public.p2p_settings OWNER TO vex_user;

--
-- Name: p2p_trade_messages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_trade_messages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trade_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    message text NOT NULL,
    is_prewritten boolean DEFAULT false NOT NULL,
    is_system_message boolean DEFAULT false NOT NULL,
    attachment_url text,
    attachment_type text,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_trade_messages OWNER TO vex_user;

--
-- Name: p2p_trader_badges; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_trader_badges (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    badge_slug text NOT NULL,
    earned_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone,
    is_displayed boolean DEFAULT true NOT NULL
);


ALTER TABLE public.p2p_trader_badges OWNER TO vex_user;

--
-- Name: p2p_trader_metrics; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_trader_metrics (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    total_trades integer DEFAULT 0 NOT NULL,
    completed_trades integer DEFAULT 0 NOT NULL,
    cancelled_trades integer DEFAULT 0 NOT NULL,
    completion_rate numeric(5,2) DEFAULT 0.00 NOT NULL,
    total_buy_trades integer DEFAULT 0 NOT NULL,
    total_sell_trades integer DEFAULT 0 NOT NULL,
    total_volume_usdt numeric(20,2) DEFAULT 0.00 NOT NULL,
    total_disputes integer DEFAULT 0 NOT NULL,
    disputes_won integer DEFAULT 0 NOT NULL,
    disputes_lost integer DEFAULT 0 NOT NULL,
    dispute_rate numeric(5,2) DEFAULT 0.00 NOT NULL,
    avg_release_time_seconds integer DEFAULT 0 NOT NULL,
    avg_payment_time_seconds integer DEFAULT 0 NOT NULL,
    avg_response_time_seconds integer DEFAULT 0 NOT NULL,
    positive_ratings integer DEFAULT 0 NOT NULL,
    negative_ratings integer DEFAULT 0 NOT NULL,
    overall_rating numeric(3,2) DEFAULT 0.00 NOT NULL,
    trades_30d integer DEFAULT 0 NOT NULL,
    completion_30d numeric(5,2) DEFAULT 0.00 NOT NULL,
    volume_30d numeric(20,2) DEFAULT 0.00 NOT NULL,
    first_trade_at timestamp without time zone,
    last_trade_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_trader_metrics OWNER TO vex_user;

--
-- Name: p2p_trader_payment_methods; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_trader_payment_methods (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type public.payment_method_type NOT NULL,
    name text NOT NULL,
    account_number text,
    bank_name text,
    holder_name text,
    details text,
    is_verified boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_trader_payment_methods OWNER TO vex_user;

--
-- Name: p2p_trader_profiles; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_trader_profiles (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    display_name text,
    bio text,
    region text,
    preferred_currencies text[],
    verification_level public.p2p_verification_level DEFAULT 'none'::public.p2p_verification_level NOT NULL,
    is_online boolean DEFAULT false NOT NULL,
    last_seen_at timestamp without time zone,
    auto_reply_enabled boolean DEFAULT false NOT NULL,
    auto_reply_message text,
    notify_on_trade boolean DEFAULT true NOT NULL,
    notify_on_dispute boolean DEFAULT true NOT NULL,
    notify_on_message boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_trader_profiles OWNER TO vex_user;

--
-- Name: p2p_trader_ratings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_trader_ratings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trade_id character varying NOT NULL,
    rater_id character varying NOT NULL,
    rated_user_id character varying NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_trader_ratings OWNER TO vex_user;

--
-- Name: p2p_trades; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_trades (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    offer_id character varying NOT NULL,
    buyer_id character varying NOT NULL,
    seller_id character varying NOT NULL,
    status public.p2p_trade_status DEFAULT 'pending'::public.p2p_trade_status NOT NULL,
    amount numeric(15,8) NOT NULL,
    fiat_amount numeric(15,2) NOT NULL,
    price numeric(15,2) NOT NULL,
    payment_method text NOT NULL,
    payment_reference text,
    escrow_amount numeric(15,8) NOT NULL,
    platform_fee numeric(15,8) DEFAULT '0'::numeric NOT NULL,
    expires_at timestamp without time zone,
    paid_at timestamp without time zone,
    confirmed_at timestamp without time zone,
    completed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    cancel_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    currency_type text DEFAULT 'usd'::text NOT NULL,
    escrow_earned_amount numeric(15,8) DEFAULT '0'::numeric,
    escrow_purchased_amount numeric(15,8) DEFAULT '0'::numeric
);


ALTER TABLE public.p2p_trades OWNER TO vex_user;

--
-- Name: p2p_transaction_logs; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.p2p_transaction_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    trade_id character varying NOT NULL,
    dispute_id character varying,
    user_id character varying,
    action public.p2p_transaction_log_action NOT NULL,
    description text NOT NULL,
    description_ar text,
    metadata text,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.p2p_transaction_logs OWNER TO vex_user;

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.password_reset_tokens (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO vex_user;

--
-- Name: project_currency_conversions; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.project_currency_conversions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    base_currency_amount numeric(15,2) NOT NULL,
    project_currency_amount numeric(15,2) NOT NULL,
    exchange_rate_used numeric(15,6) NOT NULL,
    commission_amount numeric(15,2) DEFAULT 0.00 NOT NULL,
    net_amount numeric(15,2) NOT NULL,
    status public.currency_conversion_status DEFAULT 'pending'::public.currency_conversion_status NOT NULL,
    approved_by_id character varying,
    rejection_reason text,
    approved_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.project_currency_conversions OWNER TO vex_user;

--
-- Name: project_currency_ledger; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.project_currency_ledger (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    wallet_id character varying NOT NULL,
    type public.currency_ledger_type NOT NULL,
    amount numeric(15,2) NOT NULL,
    balance_before numeric(15,2) NOT NULL,
    balance_after numeric(15,2) NOT NULL,
    reference_id character varying,
    reference_type text,
    description text,
    metadata text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.project_currency_ledger OWNER TO vex_user;

--
-- Name: project_currency_settings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.project_currency_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    currency_name text DEFAULT 'VEX Coin'::text NOT NULL,
    currency_symbol text DEFAULT 'VEX'::text NOT NULL,
    base_currency_code text DEFAULT 'USD'::text NOT NULL,
    exchange_rate numeric(15,6) DEFAULT '100'::numeric NOT NULL,
    min_conversion_amount numeric(15,2) DEFAULT 1.00 NOT NULL,
    max_conversion_amount numeric(15,2) DEFAULT 10000.00 NOT NULL,
    daily_conversion_limit_per_user numeric(15,2) DEFAULT 5000.00 NOT NULL,
    total_platform_daily_limit numeric(15,2) DEFAULT 1000000.00 NOT NULL,
    conversion_commission_rate numeric(5,4) DEFAULT 0.01 NOT NULL,
    approval_mode public.currency_approval_mode DEFAULT 'automatic'::public.currency_approval_mode NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    allow_points_conversion boolean DEFAULT false NOT NULL,
    points_exchange_rate numeric(15,6) DEFAULT '10'::numeric,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    use_in_games boolean DEFAULT true NOT NULL,
    use_in_p2p boolean DEFAULT true NOT NULL,
    allow_earned_balance boolean DEFAULT true NOT NULL,
    earned_balance_expire_days integer
);


ALTER TABLE public.project_currency_settings OWNER TO vex_user;

--
-- Name: project_currency_wallets; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.project_currency_wallets (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    purchased_balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    earned_balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_converted numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_spent numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_earned numeric(15,2) DEFAULT 0.00 NOT NULL,
    locked_balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.project_currency_wallets OWNER TO vex_user;

--
-- Name: promo_code_usages; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.promo_code_usages (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    promo_code_id character varying NOT NULL,
    user_id character varying NOT NULL,
    transaction_id character varying,
    discount_amount numeric(15,2) NOT NULL,
    used_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.promo_code_usages OWNER TO vex_user;

--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.promo_codes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    affiliate_id character varying,
    type public.promo_code_type DEFAULT 'percentage'::public.promo_code_type NOT NULL,
    value numeric(10,2) NOT NULL,
    min_deposit numeric(15,2) DEFAULT 0.00,
    max_discount numeric(15,2),
    usage_limit integer,
    usage_count integer DEFAULT 0 NOT NULL,
    per_user_limit integer DEFAULT 1,
    is_active boolean DEFAULT true NOT NULL,
    starts_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.promo_codes OWNER TO vex_user;

--
-- Name: scheduled_config_changes; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.scheduled_config_changes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    game_id character varying NOT NULL,
    action public.scheduled_change_action NOT NULL,
    scheduled_at timestamp without time zone NOT NULL,
    status public.scheduled_change_status DEFAULT 'pending'::public.scheduled_change_status NOT NULL,
    changes text,
    description text,
    created_by character varying NOT NULL,
    applied_at timestamp without time zone,
    failure_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.scheduled_config_changes OWNER TO vex_user;

--
-- Name: season_rewards; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.season_rewards (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    season_id character varying NOT NULL,
    rank_from integer NOT NULL,
    rank_to integer NOT NULL,
    reward_amount numeric(15,2) NOT NULL,
    reward_description_en text,
    reward_description_ar text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.season_rewards OWNER TO vex_user;

--
-- Name: seasonal_stats; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.seasonal_stats (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    season_id character varying NOT NULL,
    games_played integer DEFAULT 0 NOT NULL,
    games_won integer DEFAULT 0 NOT NULL,
    games_lost integer DEFAULT 0 NOT NULL,
    games_draw integer DEFAULT 0 NOT NULL,
    chess_played integer DEFAULT 0 NOT NULL,
    chess_won integer DEFAULT 0 NOT NULL,
    backgammon_played integer DEFAULT 0 NOT NULL,
    backgammon_won integer DEFAULT 0 NOT NULL,
    domino_played integer DEFAULT 0 NOT NULL,
    domino_won integer DEFAULT 0 NOT NULL,
    tarneeb_played integer DEFAULT 0 NOT NULL,
    tarneeb_won integer DEFAULT 0 NOT NULL,
    baloot_played integer DEFAULT 0 NOT NULL,
    baloot_won integer DEFAULT 0 NOT NULL,
    total_earnings numeric(15,2) DEFAULT 0.00 NOT NULL,
    current_win_streak integer DEFAULT 0 NOT NULL,
    longest_win_streak integer DEFAULT 0 NOT NULL,
    rank integer,
    rank_updated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.seasonal_stats OWNER TO vex_user;

--
-- Name: seasons; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.seasons (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    number integer NOT NULL,
    name_en text NOT NULL,
    name_ar text NOT NULL,
    description_en text,
    description_ar text,
    status public.season_status DEFAULT 'upcoming'::public.season_status NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    prize_pool numeric(15,2) DEFAULT 0.00 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.seasons OWNER TO vex_user;

--
-- Name: social_platforms; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.social_platforms (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    display_name_ar text,
    icon text NOT NULL,
    type public.social_platform_type DEFAULT 'oauth'::public.social_platform_type NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    client_id text,
    client_secret text,
    api_key text,
    api_secret text,
    webhook_url text,
    callback_url text,
    bot_token text,
    phone_number_id text,
    business_account_id text,
    access_token text,
    refresh_token text,
    otp_enabled boolean DEFAULT false NOT NULL,
    otp_template text,
    otp_expiry integer DEFAULT 300 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    settings text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.social_platforms OWNER TO vex_user;

--
-- Name: spectator_gifts; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.spectator_gifts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying NOT NULL,
    sender_id character varying NOT NULL,
    recipient_id character varying NOT NULL,
    gift_item_id character varying NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    total_price numeric(15,2) NOT NULL,
    recipient_earnings numeric(15,2) NOT NULL,
    message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.spectator_gifts OWNER TO vex_user;

--
-- Name: spectator_supports; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.spectator_supports (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    challenge_id character varying NOT NULL,
    session_id character varying,
    supporter_id character varying NOT NULL,
    supported_player_id character varying NOT NULL,
    amount numeric(15,2) NOT NULL,
    odds numeric(5,2) NOT NULL,
    potential_winnings numeric(15,2) NOT NULL,
    mode public.support_mode DEFAULT 'wait_for_match'::public.support_mode NOT NULL,
    status public.support_status DEFAULT 'pending'::public.support_status NOT NULL,
    matched_support_id character varying,
    house_fee numeric(15,2) DEFAULT 0.00 NOT NULL,
    actual_winnings numeric(15,2),
    settled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.spectator_supports OWNER TO vex_user;

--
-- Name: support_contacts; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.support_contacts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    type public.support_contact_type NOT NULL,
    label text NOT NULL,
    value text NOT NULL,
    icon text,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.support_contacts OWNER TO vex_user;

--
-- Name: support_settings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.support_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    game_type text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    odds_mode public.odds_calculation_mode DEFAULT 'automatic'::public.odds_calculation_mode NOT NULL,
    default_odds_player1 numeric(5,2) DEFAULT 1.90 NOT NULL,
    default_odds_player2 numeric(5,2) DEFAULT 1.90 NOT NULL,
    min_support_amount numeric(15,2) DEFAULT 1.00 NOT NULL,
    max_support_amount numeric(15,2) DEFAULT 10000.00 NOT NULL,
    house_fee_percent numeric(5,2) DEFAULT 5.00 NOT NULL,
    allow_instant_match boolean DEFAULT true NOT NULL,
    instant_match_odds numeric(5,2) DEFAULT 1.80 NOT NULL,
    win_rate_weight numeric(5,2) DEFAULT 0.60 NOT NULL,
    experience_weight numeric(5,2) DEFAULT 0.25 NOT NULL,
    streak_weight numeric(5,2) DEFAULT 0.15 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.support_settings OWNER TO vex_user;

--
-- Name: system_config; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.system_config (
    key text NOT NULL,
    value text,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by character varying
);


ALTER TABLE public.system_config OWNER TO vex_user;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.system_settings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    category text,
    description text,
    data_type text DEFAULT 'string'::text,
    updated_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.system_settings OWNER TO vex_user;

--
-- Name: themes; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.themes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    primary_color text NOT NULL,
    secondary_color text NOT NULL,
    accent_color text NOT NULL,
    background_color text NOT NULL,
    foreground_color text NOT NULL,
    card_color text NOT NULL,
    muted_color text NOT NULL,
    border_color text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.themes OWNER TO vex_user;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.transactions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    type public.transaction_type NOT NULL,
    status public.transaction_status DEFAULT 'pending'::public.transaction_status NOT NULL,
    amount numeric(15,2) NOT NULL,
    balance_before numeric(15,2) NOT NULL,
    balance_after numeric(15,2) NOT NULL,
    description text,
    reference_id text,
    processed_by character varying,
    processed_at timestamp without time zone,
    admin_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.transactions OWNER TO vex_user;

--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.user_achievements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    achievement_id character varying NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    unlocked_at timestamp without time zone,
    reward_claimed boolean DEFAULT false NOT NULL,
    reward_claimed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_achievements OWNER TO vex_user;

--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.user_badges (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    badge_id character varying NOT NULL,
    earned_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_badges OWNER TO vex_user;

--
-- Name: user_gift_inventory; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.user_gift_inventory (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    gift_id character varying NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    purchased_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_gift_inventory OWNER TO vex_user;

--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.user_preferences (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    timezone text DEFAULT 'UTC'::text,
    notify_announcements boolean DEFAULT true NOT NULL,
    notify_transactions boolean DEFAULT true NOT NULL,
    notify_promotions boolean DEFAULT true NOT NULL,
    notify_p2p boolean DEFAULT true NOT NULL,
    email_notifications boolean DEFAULT false NOT NULL,
    sms_notifications boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    notify_challenger_activity boolean DEFAULT true NOT NULL,
    hide_balance_in_lists boolean DEFAULT false NOT NULL
);


ALTER TABLE public.user_preferences OWNER TO vex_user;

--
-- Name: user_relationships; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.user_relationships (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    target_user_id character varying NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_relationships OWNER TO vex_user;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.user_sessions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    session_token text NOT NULL,
    device_info text,
    ip_address text,
    user_agent text,
    location text,
    is_active boolean DEFAULT true NOT NULL,
    last_active_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_sessions OWNER TO vex_user;

--
-- Name: users; Type: TABLE; Schema: public; Owner: vex_user
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    email text,
    password text NOT NULL,
    role public.user_role DEFAULT 'player'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'active'::public.user_status NOT NULL,
    first_name text,
    last_name text,
    phone text,
    balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_deposited numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_withdrawn numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_wagered numeric(15,2) DEFAULT 0.00 NOT NULL,
    total_won numeric(15,2) DEFAULT 0.00 NOT NULL,
    vip_level integer DEFAULT 0 NOT NULL,
    referred_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    last_login_at timestamp without time zone,
    account_id character varying,
    phone_verified boolean DEFAULT false,
    p2p_banned boolean DEFAULT false NOT NULL,
    p2p_ban_reason text,
    p2p_banned_at timestamp without time zone,
    free_play_count integer DEFAULT 0 NOT NULL,
    free_play_reset_at timestamp without time zone,
    nickname text,
    profile_picture text,
    p2p_rating numeric(3,2) DEFAULT 5.00,
    p2p_total_trades integer DEFAULT 0 NOT NULL,
    p2p_successful_trades integer DEFAULT 0 NOT NULL,
    id_front_image text,
    id_back_image text,
    id_verification_rejection_reason text,
    id_verified_at timestamp without time zone,
    id_verification_status public.id_verification_status,
    withdrawal_password text,
    withdrawal_password_enabled boolean DEFAULT false,
    is_online boolean DEFAULT false NOT NULL,
    stealth_mode boolean DEFAULT false NOT NULL,
    last_active_at timestamp without time zone,
    must_change_password boolean DEFAULT false NOT NULL,
    total_earnings numeric(15,2) DEFAULT 0.00 NOT NULL,
    games_played integer DEFAULT 0 NOT NULL,
    games_won integer DEFAULT 0 NOT NULL,
    games_lost integer DEFAULT 0 NOT NULL,
    games_draw integer DEFAULT 0 NOT NULL,
    chess_played integer DEFAULT 0 NOT NULL,
    chess_won integer DEFAULT 0 NOT NULL,
    backgammon_played integer DEFAULT 0 NOT NULL,
    backgammon_won integer DEFAULT 0 NOT NULL,
    domino_played integer DEFAULT 0 NOT NULL,
    domino_won integer DEFAULT 0 NOT NULL,
    tarneeb_played integer DEFAULT 0 NOT NULL,
    tarneeb_won integer DEFAULT 0 NOT NULL,
    baloot_played integer DEFAULT 0 NOT NULL,
    baloot_won integer DEFAULT 0 NOT NULL,
    current_win_streak integer DEFAULT 0 NOT NULL,
    longest_win_streak integer DEFAULT 0 NOT NULL,
    blocked_users text[] DEFAULT '{}'::text[] NOT NULL,
    muted_users text[] DEFAULT '{}'::text[] NOT NULL,
    cover_photo text,
    email_verified boolean DEFAULT false
);


ALTER TABLE public.users OWNER TO vex_user;

--
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.achievements (id, key, name_en, name_ar, description_en, description_ar, category, rarity, game_type, requirement, reward_amount, icon_name, sort_order, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: admin_alerts; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.admin_alerts (id, type, severity, title, title_ar, message, message_ar, entity_type, entity_id, deep_link, metadata, is_read, read_at, read_by, created_at) FROM stdin;
\.


--
-- Data for Name: admin_audit_logs; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.admin_audit_logs (id, admin_id, action, entity_type, entity_id, previous_value, new_value, reason, ip_address, user_agent, metadata, created_at) FROM stdin;
3273954e-99c3-4a2c-a43e-4333185fc794	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 19:40:45.741671
310be179-fa93-4a44-a2f0-5aa9758296a5	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:09:11.469252
822935bf-25ce-4287-be7f-c616eb17ce3d	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:20:52.810231
3db286a6-b912-45c1-ad21-9c32fed5e46d	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:33:53.739051
a851b768-3260-4119-9c4c-a8b10571ba89	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	section_toggle	feature_flag	73638c94-b979-4e78-a5e7-3c6c0c3b1c26	true	false	\N	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:36:05.288662
7d82cb38-33ae-4e33-9ffd-a056a6e241d9	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	cf6253a2-dc52-4f80-b9ec-ef9ff0c69570	0	100000	فتلاتبتبتبي	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:37:52.242389
03953220-f897-4938-9c36-db66f7d4b1f9	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	section_toggle	feature_flag	73638c94-b979-4e78-a5e7-3c6c0c3b1c26	false	true	\N	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:38:44.355673
dd4a5611-f290-4b09-b816-2a9b115eb3f5	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:48:44.661735
f5b01650-e492-4e48-b734-da1d3431eb0e	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	2816cb35-beb1-4838-9ff9-508006841d4b	0	100000	sdfadad	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:49:05.857793
1b22cbba-80af-4f67-9554-d5822303d3f8	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	2b95632c-c4ea-49a2-bdf3-a9ff4c8eccb5	0	100000	zdvzdvdvdv	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-08 21:49:37.776363
56781694-48be-4b43-b0fb-cf8577b0b27b	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-09 00:03:29.558443
ca8b11c1-b93a-43d4-adb7-a3af03d287d6	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	dbff1338-7a54-4bc3-bdf4-28957de21b39	0	4723899	ssfd4t3t\n	172.31.88.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-09 00:04:10.649055
11a374df-d6fa-4522-a77f-ada48bcbcaf8	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.114.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-09 08:27:05.615686
7ece2daa-d981-478c-ba2b-9d0b2246490a	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.114.162	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-09 08:47:08.331074
e5855943-315a-4b45-926f-ce23084d7a14	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.93.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-10 08:34:32.656165
1e11a614-5c93-415f-95cd-914b52f2f956	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.93.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-10 12:45:54.22802
9f729776-273a-4953-9800-11dd879ea185	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	d960f328-1d84-4cd3-a49c-754f06811cf7	0	1224545	hhhfdsdffdsadfgwetw4tt	172.31.93.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-10 12:46:30.278498
242d9ecd-391e-4d96-8cbd-734e43029d5d	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	d960f328-1d84-4cd3-a49c-754f06811cf7	1224545	1221011	dsgsgfdff	172.31.93.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-10 12:52:09.807447
10f51bbc-c536-49e8-b382-c2d2dcc8ebb6	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.93.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-10 13:13:23.783432
4fc84fc8-0fc5-4b4b-ab25-b5ff42fcbf62	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.87.226	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-10 16:53:22.089662
81220ab9-ec09-45fa-b3f2-a9f2efc2bb7e	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.93.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-13 02:40:46.413892
3959dd51-bca6-4636-8180-90baee37bda7	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.117.130	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-13 10:43:59.262763
73229b9e-277b-4cbf-9432-1903eed6291a	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.117.130	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-13 10:55:39.872269
b6fcadf8-6964-4581-a172-5b8debe88b07	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.117.130	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-13 11:06:17.264979
34bad7d1-6b96-47c6-80e8-737a2d560e94	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.117.130	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-13 11:07:29.041918
542d17f8-1e66-411d-b782-5188933d39b8	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.117.130	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-13 11:08:22.521568
cfb3816e-91a2-4b75-8ab1-4c3633cd5206	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	127.0.0.1	curl/8.14.1	\N	2026-01-13 11:12:50.342597
0527dd16-b2ac-4cd3-82c4-97b068ac3f86	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.117.130	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-13 11:27:00.342644
c5a19f4b-366f-4a98-bdbe-fc998c7ad957	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	172.31.117.130	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-13 11:44:18.015822
a38a0796-6c26-4660-9341-36d3d97bfe52	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.8.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-14 14:18:27.670228
ff11f057-3e06-4d1c-9b44-23ad298934f8	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.6.247	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-17 09:43:50.50009
60d7b295-4821-4f6e-99fa-4a7b63810cf0	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	reward_sent	user	60ba58c6-5c77-45dd-8493-151573e00df2	\N	2523453453	ترلاىرلاى	10.82.9.91	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-17 09:45:40.654482
8e73d12b-5bf9-4c91-8b5a-e42d38ffcd16	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.2.224	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-17 10:47:32.10743
19cd29e2-56aa-43fc-b8f0-3f8b07e38b0a	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.6.247	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-17 11:49:55.232808
4327e216-d6d6-4c1b-9449-978c0a681cfe	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.10.191	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-17 14:50:23.576995
0da06291-d6bc-4b67-b1cc-4709eb946489	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.1.198	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-17 15:07:40.666983
94a0545a-a5e9-464c-b8db-5bdd966d4690	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.10.191	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-17 17:42:00.665824
d06c27e5-5be6-4495-b5b9-9e64bc9440e8	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.5.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-18 11:16:29.848803
0ebb19bc-cd3e-48bb-9781-a91815a2fb40	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	0	242422	ghjgjg	10.82.10.191	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-18 11:17:03.718241
cfda3b08-6d5f-4a05-be8e-3bfe1053ee44	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	127.0.0.1	curl/8.14.1	\N	2026-01-18 12:14:40.677186
b4a3e0c9-ed69-43c8-9ac0-aad88741f377	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-18 14:38:16.219515
35a05d06-dd60-497c-9042-b311e457443c	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.5.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 02:19:04.008935
b50ed3f5-71d5-4631-a03d-d5eb0c0615b6	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.10.8	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 02:19:40.524168
1fa5212d-c358-4ca1-9cba-a75d5987ba22	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.5.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 02:32:39.805941
e3487688-d33b-47da-8721-150c83eadee9	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.10.8	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 02:43:09.04591
42c3b075-3eee-43a0-9c63-4be5d189bf1a	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 02:43:51.503294
378b2b54-5336-46a4-bec9-315f6a8065ef	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 02:43:56.247232
6a7bf637-e3df-43b1-a8d8-f21be3ed91ad	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 02:44:01.176934
a337e8a5-2a22-428e-bef7-a0cee8c351a0	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	game_update	multiplayer_game	379bd5b7-7475-4bf0-a886-cf63042af540	\N	\N	\N	\N	\N	\N	2026-01-19 02:44:41.012043
87409d26-fae1-445e-a0e6-646b87db653f	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.6.13	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 16:39:16.463696
4cf82330-31ff-4e84-b1f5-d31c0db984f5	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.8.3	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 17:55:24.377891
0fb6f9d4-24b6-4c21-a634-f9db95c7f3ef	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.2.52	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 20:10:26.586811
bb100f1a-77d3-416d-85aa-60caacda926c	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	074689ad-b8ce-44b8-a015-daed296f5281	0	515451521	scsdds	10.82.2.52	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 20:10:46.275574
c1482035-b12a-4a7e-8d06-1e132422f581	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 20:18:49.114056
f0d80dfc-8580-4274-930c-76ba67e3cb76	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	8c56493e-4777-406b-bbf0-a47203630997	0	2222	ببللل	10.82.2.52	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 20:19:07.894771
aeb27368-1229-4ed5-9f1e-cf6a04d4948d	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.4.100	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 20:30:57.5537
e0609be1-1f9e-4f31-9cad-d48c71cd03bc	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	377adf3b-56b3-4d0d-922b-3a6ddb3fb524	0	54645342	بلءؤرءؤرء	10.82.2.52	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-19 20:31:18.078889
a7c1587d-c6d7-47a7-a085-9c1b36285eb6	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.8.3	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:03:34.256105
24404c31-8340-4fad-be51-f4533e73886f	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	377adf3b-56b3-4d0d-922b-3a6ddb3fb524	54645342	7589179876	XCDSA	10.82.5.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:04:05.663427
3f051f76-80b3-4df9-a15b-9bdbc3525c91	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	fd1e958c-afc3-49bc-a229-a1049ff601e3	0	45345342	WSFAS	10.82.5.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:04:29.035491
40a3e855-627c-484b-8cbc-5b3abbeaa733	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	da6f34a0-2e4c-4b95-92af-c77488d71838	0	53453453	FSDFSDF	10.82.5.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:04:37.455302
5f775da0-3418-48e4-a457-fbb200431a5d	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	7d8e1972-80e7-4e00-abc8-84f726c204b6	0	7564534	SDASDASD	10.82.5.34	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:05:06.717213
1c5d7c78-e137-40cc-b80d-82b55ef956e8	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	8c9ab0fc-6d0b-4f68-919a-fd15bf74df6c	0	4534533456456	يبئيبئيب	10.82.6.13	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:35:40.384202
fdb0f853-4b41-4fdf-a2a8-acbbbc4f763a	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	1a06eb5f-8fca-4c3d-8264-339f3d9a8cda	0	45331345	بسيبسيبثق	10.82.6.13	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:35:48.76367
a8e89472-a09a-4a2d-8106-206eff944329	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	b684a576-04af-4caa-8ccb-c52339356cc3	0	48978646	ثسثقصثق	10.82.0.54	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:43:21.309682
4191ed48-5b71-4b69-962d-20685612dccc	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	00d893bf-c7cc-4c5a-b65d-77f97985d3de	0	5624645	فسفسث	10.82.0.54	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:43:28.203866
80963bfe-1dd4-4cec-863b-bcdf51e44226	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	dc1ec030-d8a5-4972-8e1e-20f01abaee69	0	1563123123	ؤلابليل	10.82.0.54	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:43:36.646544
13317fd1-cb21-42b1-9cd1-f3e678af7065	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	07d181cd-5c5f-48ef-9176-a8bde979da32	0	546456456	ثبسيبسيب	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:58:18.019574
f33a8807-53c3-4ac6-a22f-dd5502a24482	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	reward_sent	user	07d181cd-5c5f-48ef-9176-a8bde979da32	\N	533123	سبسيبسيبسي	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:58:28.985897
46003646-d386-41ab-96f7-050b6d1b432f	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	reward_sent	user	cdaf32f9-3a37-4c86-85bc-03929da172d7	\N	45645323	سبسيبسيب	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:58:36.38543
dc04057c-9c2d-4ed4-9600-46ebb40d9943	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	cdaf32f9-3a37-4c86-85bc-03929da172d7	45645323	499080446	سيسيبسيب	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:58:50.413713
2d81416d-9645-43ea-9dd5-6f780052567a	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	3091265b-af8d-4bf0-af19-c36a8301a6b2	0	5345343	سبسيبسيبس	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:58:58.003938
7b1c8b08-f85b-4bfd-884f-8d7c6426b655	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	reward_sent	user	3091265b-af8d-4bf0-af19-c36a8301a6b2	\N	453434	سيسيب	10.82.7.39	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 00:59:06.991364
a5e3f583-d4e2-46e8-bb21-258de4f8e7ba	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	e6092a9c-04aa-48d2-8617-202ff5a62c50	0	5456456	صثث	10.82.10.8	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 01:16:42.281562
dcfb7e90-ffc2-49e5-afdd-c04d5aa48e3e	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	9d753bee-0ae8-4ddf-9339-f2346874c163	0	545343	سبسيبسي	10.82.2.52	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 01:16:50.245237
4c876c6f-827a-474a-aa17-d9478f3fd0f0	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	6beed496-b444-491f-aa82-d806cf365496	0	5345343	يبسبسيب	10.82.2.52	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-20 01:16:57.862371
83a99ba3-f2b9-4c5e-beb2-d38bb81cb7ce	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	login	admin	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	\N	\N	\N	10.82.12.87	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-21 20:20:53.67049
c342747e-5d06-4c3d-8459-7e690a86312c	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	5bbefd70-91b3-4631-a5ee-79c68522b3f5	0	5454545454	srvverrererere	10.82.12.87	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-21 20:22:12.469298
c8a793de-2a01-4ea0-a93c-54aad37338e8	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	user_balance_adjust	user	986a9ace-9937-49a2-bd90-c66c64d71789	0	5445540540	tbvrrverereer	10.82.12.87	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36	\N	2026-01-21 20:22:21.744303
\.


--
-- Data for Name: advertisements; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.advertisements (id, title, title_ar, type, asset_url, target_url, embed_code, display_duration, sort_order, is_active, starts_at, ends_at, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: affiliates; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.affiliates (id, user_id, affiliate_code, referral_link, commission_rate, total_referrals, active_referrals, total_commission_earned, pending_commission, total_clicks, total_registrations, total_deposits, tier, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: agent_payment_methods; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.agent_payment_methods (id, agent_id, type, name, account_number, bank_name, holder_name, details, is_active, is_default, created_at) FROM stdin;
\.


--
-- Data for Name: agents; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.agents (id, user_id, agent_code, commission_rate_deposit, commission_rate_withdraw, total_commission_earned, total_deposits_processed, total_withdrawals_processed, daily_limit, monthly_limit, initial_deposit, current_balance, is_online, is_active, assigned_customers_count, performance_score, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: announcement_views; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.announcement_views (id, announcement_id, user_id, viewed_at) FROM stdin;
\.


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.announcements (id, title, title_ar, content, content_ar, image_url, link, status, target, priority, is_pinned, view_count, published_at, expires_at, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.app_settings (id, key, value, value_ar, category, updated_by, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at) FROM stdin;
b2a0c601-c2b4-4244-aa7b-698c6b75ad3d	adda118b-baaa-4c4a-be30-6b37480c541f	login	user	adda118b-baaa-4c4a-be30-6b37480c541f	One-click registration	172.31.99.2	\N	2026-01-08 08:24:16.355575
0c7ab166-4a92-4617-ba2b-9254a6015665	e35dd5aa-e73f-42b1-b7a4-06878e272dc1	login	user	e35dd5aa-e73f-42b1-b7a4-06878e272dc1	One-click registration	172.31.99.2	\N	2026-01-08 08:27:51.678213
e92e14b7-36ac-41cf-a9d8-1f2d745c1602	ded354bc-875c-4698-b3d6-f960502422ca	login	user	ded354bc-875c-4698-b3d6-f960502422ca	One-click registration	172.31.99.2	\N	2026-01-08 10:46:52.063047
ce44262d-36cc-4d52-9d91-dd5fb73ceda7	2b95632c-c4ea-49a2-bdf3-a9ff4c8eccb5	login	user	2b95632c-c4ea-49a2-bdf3-a9ff4c8eccb5	One-click registration	172.31.99.2	\N	2026-01-08 12:51:37.453788
92e5bd5d-3bd6-445b-8c17-9dd8cb98ebeb	19c3cd61-dab7-44b2-858f-eb78d837eeaf	login	user	19c3cd61-dab7-44b2-858f-eb78d837eeaf	One-click registration	172.31.101.130	\N	2026-01-08 15:06:18.074625
6ba4e867-c27d-444d-9f6e-20bb57b3744a	04b72e47-958f-4911-bd1e-178905783898	login	user	04b72e47-958f-4911-bd1e-178905783898	One-click registration	172.31.92.66	\N	2026-01-08 15:58:05.048754
bca38200-6019-44f4-98c0-d4b4f4443d10	107dcbdc-c6c5-44b2-b8c4-ebbc6fc6e2a8	login	user	107dcbdc-c6c5-44b2-b8c4-ebbc6fc6e2a8	One-click registration	172.31.88.162	\N	2026-01-08 19:55:54.601482
8f143825-87da-4a83-ad36-f90f7c9150d8	cf6253a2-dc52-4f80-b9ec-ef9ff0c69570	login	user	cf6253a2-dc52-4f80-b9ec-ef9ff0c69570	One-click registration	172.31.88.162	\N	2026-01-08 21:10:37.225561
3924bf3f-3d9a-400f-b6a4-f85ed7682483	2816cb35-beb1-4838-9ff9-508006841d4b	login	user	2816cb35-beb1-4838-9ff9-508006841d4b	One-click registration	172.31.88.162	\N	2026-01-08 21:46:42.385214
4386b906-6278-4996-aa6d-af28fcc9f62d	59bd74e6-720b-4848-b7e4-c0a3aff7a1df	login	user	59bd74e6-720b-4848-b7e4-c0a3aff7a1df	One-click registration	172.31.88.162	\N	2026-01-08 22:27:00.654515
7bd715de-31ee-4398-b797-90dc7db4b13e	dbff1338-7a54-4bc3-bdf4-28957de21b39	login	user	dbff1338-7a54-4bc3-bdf4-28957de21b39	One-click registration	172.31.88.162	\N	2026-01-08 23:47:18.826437
644a8236-e5f9-4201-898c-31c6c99a5a0b	594918aa-1ca5-4fbe-b750-b83df28571b8	login	user	594918aa-1ca5-4fbe-b750-b83df28571b8	One-click registration	172.31.114.162	\N	2026-01-09 07:12:41.91074
4fb99b6e-fb93-4f39-b632-62e7ad2330a5	60c28790-7b50-4244-a3f0-95196c6e3baf	login	user	60c28790-7b50-4244-a3f0-95196c6e3baf	One-click registration	172.31.114.162	\N	2026-01-09 07:12:57.922215
a50d91f4-9a72-4d68-943c-42d49c5bdf6a	d5e61a5b-1772-4ef9-8d5d-a94b0de7a33d	login	user	d5e61a5b-1772-4ef9-8d5d-a94b0de7a33d	One-click registration	172.31.114.162	\N	2026-01-09 07:20:55.839664
4bf897aa-5f9a-4512-871e-1c64b3cb279c	cadb52ef-24e5-4b17-83ec-40dcc068476f	login	user	cadb52ef-24e5-4b17-83ec-40dcc068476f	One-click registration	172.31.114.162	\N	2026-01-09 07:21:23.849829
476363b9-eaf3-4fa8-9edc-f780656d4b1a	4047f725-5fa8-4fe8-a5e7-1978c4839ffd	login	user	4047f725-5fa8-4fe8-a5e7-1978c4839ffd	One-click registration	172.31.114.162	\N	2026-01-09 07:45:36.175339
96d3801e-0196-4061-9c19-7b058a07c449	e00d5698-1e15-4c46-8e6d-adfac213cafa	login	user	e00d5698-1e15-4c46-8e6d-adfac213cafa	One-click registration	172.31.114.162	\N	2026-01-09 08:24:34.475188
771b3188-7422-4ce3-be1c-91f3ba05d75f	0d66dde2-10d5-4c2b-9c4b-a50c216d5350	login	user	0d66dde2-10d5-4c2b-9c4b-a50c216d5350	One-click registration	172.31.114.162	\N	2026-01-09 08:38:17.677132
15cf67df-1e44-4985-8098-63cb8d558a40	f7358d4c-643c-44a9-8f32-7462fec0c6d9	login	user	f7358d4c-643c-44a9-8f32-7462fec0c6d9	One-click registration	172.31.114.162	\N	2026-01-09 09:32:22.118245
8753c829-5986-4a8a-80c2-5e559f38b886	9ea54806-3585-452e-b9a4-2f86b6f98a74	login	user	9ea54806-3585-452e-b9a4-2f86b6f98a74	One-click registration	172.31.114.162	\N	2026-01-09 10:12:34.90721
af518e9f-16b9-48f1-93f0-9ae5ba0874e5	8a4f2766-7127-4bce-990d-9a00ff266dae	login	user	8a4f2766-7127-4bce-990d-9a00ff266dae	One-click registration	172.31.114.162	\N	2026-01-09 10:30:49.021384
9c25e531-4ccc-464e-a57c-21f9fe003386	12ad25a8-9672-4df3-a5d2-91f3af9ae413	login	user	12ad25a8-9672-4df3-a5d2-91f3af9ae413	One-click registration	172.31.114.162	\N	2026-01-09 10:31:52.032211
76533a28-761c-4123-a47b-683826d35f59	3e50a70a-f768-4761-a81f-3b0ad7d7eafd	login	user	3e50a70a-f768-4761-a81f-3b0ad7d7eafd	One-click registration	172.31.114.162	\N	2026-01-09 10:44:03.441729
9b3ea665-9b9b-4bd3-8793-b0fabcafc9b2	6928bea5-e874-468f-a2c7-c4cca89501c6	login	user	6928bea5-e874-468f-a2c7-c4cca89501c6	One-click registration	172.31.114.162	\N	2026-01-09 10:48:25.834828
a2ef9cff-ee9a-4da4-b627-499b158eff77	5c390306-10f9-4a3a-b9c7-9d213e86239c	login	user	5c390306-10f9-4a3a-b9c7-9d213e86239c	One-click registration	172.31.93.34	\N	2026-01-10 08:31:10.748067
76197d30-e48d-4826-bd08-0a187aac13b7	32595d29-4360-4faf-b772-6fd25e799437	login	user	32595d29-4360-4faf-b772-6fd25e799437	One-click registration	172.31.93.34	\N	2026-01-10 12:41:26.287445
e4d1e85b-b8a6-4505-81cc-cb3a507c9a78	8b4dc410-4133-465c-8a2c-a34eb0e0bd0f	login	user	8b4dc410-4133-465c-8a2c-a34eb0e0bd0f	One-click registration	172.31.93.34	\N	2026-01-10 12:43:38.521219
69cd2928-02dd-410d-8406-d64300851da3	d960f328-1d84-4cd3-a49c-754f06811cf7	login	user	d960f328-1d84-4cd3-a49c-754f06811cf7	One-click registration	172.31.93.34	\N	2026-01-10 12:44:26.01132
b2674e1c-4d71-4673-8a6a-f14a69452b24	5a758612-b4ee-4735-b497-ee2504cecced	login	user	5a758612-b4ee-4735-b497-ee2504cecced	One-click registration	172.31.93.34	\N	2026-01-10 13:16:44.084548
fac24bed-03e0-43dd-bd14-c6505b59610b	6c42c595-593c-438a-9353-ed051ceae603	login	user	6c42c595-593c-438a-9353-ed051ceae603	One-click registration	172.31.93.34	\N	2026-01-10 13:35:14.231469
6f3f96bd-1c89-4a85-a653-02bc590e5cb1	cc5ad47b-6d28-479d-a714-c3f600013846	login	user	cc5ad47b-6d28-479d-a714-c3f600013846	One-click registration	172.31.87.226	\N	2026-01-10 16:51:56.301519
36012cb3-e5d1-45df-94dc-a46c68bd8a06	3b7b23cf-b458-46b6-96f6-818f5ca923df	login	user	3b7b23cf-b458-46b6-96f6-818f5ca923df	One-click registration	172.31.117.130	\N	2026-01-13 11:38:51.907574
6a6656a3-dc4f-4f65-a788-9efdba908149	b949cb81-a7ab-42c6-899f-cb4c420241f3	login	user	b949cb81-a7ab-42c6-899f-cb4c420241f3	One-click registration	10.81.13.121	\N	2026-01-13 12:04:20.190315
c58a382d-07c6-447e-bc32-a06bac8d5abd	5b1105fe-732d-4d98-871b-1092dd8a8223	login	user	5b1105fe-732d-4d98-871b-1092dd8a8223	One-click registration	10.82.10.44	\N	2026-01-14 16:45:49.747554
d2b8bce4-c403-4fd9-8411-c955bcd27737	b60adb8a-e0b1-4bc1-95b1-8b01e51e4187	login	user	b60adb8a-e0b1-4bc1-95b1-8b01e51e4187	One-click registration	10.82.0.123	\N	2026-01-14 21:09:32.008607
33c2c046-a1c8-4fb9-a458-e568340fb077	0e1192c2-ce12-4acd-9937-e9c56a3cffc8	login	user	0e1192c2-ce12-4acd-9937-e9c56a3cffc8	One-click registration	10.82.10.137	\N	2026-01-16 18:23:20.424569
14f8cbdb-dab5-491f-9405-523b883b5309	461f7139-ed02-4e6f-83e4-8031da57798a	login	user	461f7139-ed02-4e6f-83e4-8031da57798a	User registered	\N	\N	2026-01-16 19:01:04.552061
c43f063a-c473-4cc4-bf2a-1c5d39314756	743d1c29-8363-4606-94ba-657396364190	login	user	743d1c29-8363-4606-94ba-657396364190	User registered	\N	\N	2026-01-16 19:01:34.507681
572f1f59-5aaa-4249-9e29-211746431833	25f58bd5-714f-47d4-8ece-d0c7b3acd333	login	user	25f58bd5-714f-47d4-8ece-d0c7b3acd333	User registered	\N	\N	2026-01-16 19:02:16.535545
52f61377-295a-449c-996c-e1021a707983	01a3a574-7f97-49a5-b165-be3631bb26f6	login	user	01a3a574-7f97-49a5-b165-be3631bb26f6	User registered	\N	\N	2026-01-16 19:37:38.209427
536c1494-fea8-4ad7-a293-57c156f2fa04	88405ac1-36b4-494d-9c5b-46616577d924	login	user	88405ac1-36b4-494d-9c5b-46616577d924	User registered	\N	\N	2026-01-16 19:37:38.416639
a96fb7a5-47e5-4101-8c64-0e5a42097bc5	6e7da5f4-43a3-4969-bad9-6feccd645b85	login	user	6e7da5f4-43a3-4969-bad9-6feccd645b85	User registered	\N	\N	2026-01-16 19:37:38.603598
d9af4acd-a070-4913-8e2c-8dcf9071e6e2	f2c45c36-73ea-410f-ba91-19e31b6e5868	login	user	f2c45c36-73ea-410f-ba91-19e31b6e5868	User registered	\N	\N	2026-01-16 19:37:38.711212
d0965008-ee7f-43cf-a139-59c70e68502e	377916e5-004e-4b35-babb-dce8f6175da6	login	user	377916e5-004e-4b35-babb-dce8f6175da6	User registered	\N	\N	2026-01-16 19:37:38.844498
fb9c140b-6307-4ce3-86ba-1d1073fbe63e	ff9e0a9b-7607-4843-b15b-ace7aef28c3e	login	user	ff9e0a9b-7607-4843-b15b-ace7aef28c3e	User registered	\N	\N	2026-01-16 19:37:38.958232
b313fa2d-ca29-4d9a-aa46-be6c78663c15	b788eb6a-438a-4983-9fd6-527b20cfee5f	login	user	b788eb6a-438a-4983-9fd6-527b20cfee5f	User registered	\N	\N	2026-01-16 19:37:39.077161
fedf557b-df55-4765-8bc3-b38afa5b0ce4	e1cc63d7-58be-4de8-b245-1e92db6cc4e8	login	user	e1cc63d7-58be-4de8-b245-1e92db6cc4e8	User registered	\N	\N	2026-01-16 19:37:39.18916
29c82a05-d445-496c-b43e-e036a04d6481	2094744c-0070-40fa-9682-6b1390f40429	login	user	2094744c-0070-40fa-9682-6b1390f40429	User registered	\N	\N	2026-01-16 19:37:39.308067
9cf73d46-4540-4aa1-9011-3f8db6b15893	604f980a-5ac6-4aca-9618-7f81db15965e	login	user	604f980a-5ac6-4aca-9618-7f81db15965e	User registered	\N	\N	2026-01-16 19:37:39.412872
6dfe619d-ed90-4d6c-89eb-b925e8d4d8b8	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	login	user	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	User registered	\N	\N	2026-01-16 19:39:44.092942
23ecbf11-53bd-45fb-b4ea-52d7c708fb6d	e8d2e602-8ac8-4fb2-b597-228ade337c63	login	user	e8d2e602-8ac8-4fb2-b597-228ade337c63	User registered	\N	\N	2026-01-16 19:39:44.245348
f4d8957e-b5b3-4808-8f7e-09e8cdcf2010	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	login	user	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	User logged in	127.0.0.1	\N	2026-01-16 19:39:44.37223
d0b23711-e6ae-437a-bd1f-7387bce28432	e8d2e602-8ac8-4fb2-b597-228ade337c63	login	user	e8d2e602-8ac8-4fb2-b597-228ade337c63	User logged in	127.0.0.1	\N	2026-01-16 19:39:44.477954
0f0a0f72-03ef-45cb-b825-42ac68405567	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	login	user	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	User logged in	127.0.0.1	\N	2026-01-16 19:39:44.60684
6999cff1-aa59-416f-91a7-3ab15d75ee95	e8d2e602-8ac8-4fb2-b597-228ade337c63	login	user	e8d2e602-8ac8-4fb2-b597-228ade337c63	User logged in	127.0.0.1	\N	2026-01-16 19:39:44.71092
6c7ef8dc-8cc0-489c-baa5-61d5051ed97c	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	login	user	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	User logged in	127.0.0.1	\N	2026-01-16 19:39:44.824678
8a504a69-4f75-4f9b-a246-07ee0c60e0d3	e8d2e602-8ac8-4fb2-b597-228ade337c63	login	user	e8d2e602-8ac8-4fb2-b597-228ade337c63	User logged in	127.0.0.1	\N	2026-01-16 19:39:44.936493
313d6765-0cd8-41a2-9adf-c4de0b182f43	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	login	user	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	User logged in	127.0.0.1	\N	2026-01-16 19:39:45.057399
206cf1c7-fc50-4a3f-a4d0-e838fc37c1b6	e8d2e602-8ac8-4fb2-b597-228ade337c63	login	user	e8d2e602-8ac8-4fb2-b597-228ade337c63	User logged in	127.0.0.1	\N	2026-01-16 19:39:45.15887
6d0d53b0-d131-466d-839d-af5e135f65b7	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	login	user	4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	User logged in	127.0.0.1	\N	2026-01-16 19:39:45.291708
853dd3c0-b716-4231-8ca3-b85c49917cc3	e8d2e602-8ac8-4fb2-b597-228ade337c63	login	user	e8d2e602-8ac8-4fb2-b597-228ade337c63	User logged in	127.0.0.1	\N	2026-01-16 19:39:45.394881
99ccd468-0f89-4127-a596-5ae3faa063be	747fa743-e259-40e9-b365-1e99ccb46643	login	user	747fa743-e259-40e9-b365-1e99ccb46643	User registered	\N	\N	2026-01-16 19:40:03.87445
8eba7acf-6dc3-4409-b96f-78fa0d9f4d8a	8e5b8186-7d37-419c-b3a5-3de4661fa666	login	user	8e5b8186-7d37-419c-b3a5-3de4661fa666	User registered	\N	\N	2026-01-16 19:40:03.985896
9df8e1a7-8812-44d3-ba21-23d8752d10af	747fa743-e259-40e9-b365-1e99ccb46643	login	user	747fa743-e259-40e9-b365-1e99ccb46643	User logged in	127.0.0.1	\N	2026-01-16 19:40:04.139652
d781a8eb-f9a7-4b56-ac38-db1a181e6c2a	8e5b8186-7d37-419c-b3a5-3de4661fa666	login	user	8e5b8186-7d37-419c-b3a5-3de4661fa666	User logged in	127.0.0.1	\N	2026-01-16 19:40:04.273401
83fba0bf-7d1b-4882-a985-5693d5ef82ea	747fa743-e259-40e9-b365-1e99ccb46643	login	user	747fa743-e259-40e9-b365-1e99ccb46643	User logged in	127.0.0.1	\N	2026-01-16 19:40:04.384531
a28cc1eb-ac76-4af0-a2c4-2b8e9ca6a002	8e5b8186-7d37-419c-b3a5-3de4661fa666	login	user	8e5b8186-7d37-419c-b3a5-3de4661fa666	User logged in	127.0.0.1	\N	2026-01-16 19:40:04.48312
bc5698da-c49e-4fef-ad8c-8e6e51e02730	747fa743-e259-40e9-b365-1e99ccb46643	login	user	747fa743-e259-40e9-b365-1e99ccb46643	User logged in	127.0.0.1	\N	2026-01-16 19:40:04.608062
fc3d6dc0-5261-474c-8ab9-0d9a66f516f0	36b25b32-3bc9-4b47-bc04-74638d6fe716	login	user	36b25b32-3bc9-4b47-bc04-74638d6fe716	User registered	\N	\N	2026-01-16 19:46:05.520912
cad7a887-5998-41c3-a3b5-48db7d9202a9	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	login	user	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	User registered	\N	\N	2026-01-16 19:46:05.642315
e30e30d9-021b-4896-a854-47e180a4a177	36b25b32-3bc9-4b47-bc04-74638d6fe716	login	user	36b25b32-3bc9-4b47-bc04-74638d6fe716	User logged in	127.0.0.1	\N	2026-01-16 19:46:05.843395
b4db4b97-52bd-44aa-8f16-22b40bf35e92	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	login	user	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	User logged in	127.0.0.1	\N	2026-01-16 19:46:05.949874
511bb7a3-0cc9-4760-a0f9-faef1172fe73	36b25b32-3bc9-4b47-bc04-74638d6fe716	login	user	36b25b32-3bc9-4b47-bc04-74638d6fe716	User logged in	127.0.0.1	\N	2026-01-16 19:46:06.074796
e8b5c115-4d41-41fb-bf82-8cdeb433ca47	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	login	user	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	User logged in	127.0.0.1	\N	2026-01-16 19:46:06.186517
7ed64fc0-e5fe-44ee-9a1e-476eb3556f33	36b25b32-3bc9-4b47-bc04-74638d6fe716	login	user	36b25b32-3bc9-4b47-bc04-74638d6fe716	User logged in	127.0.0.1	\N	2026-01-16 19:46:06.296647
05d90f41-7321-446b-9f08-f87b1e3953af	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	login	user	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	User logged in	127.0.0.1	\N	2026-01-16 19:46:06.40352
b53be28d-c78e-4fd8-9592-c6d3316f3e2d	36b25b32-3bc9-4b47-bc04-74638d6fe716	login	user	36b25b32-3bc9-4b47-bc04-74638d6fe716	User logged in	127.0.0.1	\N	2026-01-16 19:46:06.532238
d2b013d3-2882-4579-b777-5efb83e0325d	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	login	user	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	User logged in	127.0.0.1	\N	2026-01-16 19:46:06.64982
c867f27a-01ec-4a81-a228-7a0615216387	36b25b32-3bc9-4b47-bc04-74638d6fe716	login	user	36b25b32-3bc9-4b47-bc04-74638d6fe716	User logged in	127.0.0.1	\N	2026-01-16 19:46:06.781002
765e1300-87a3-4ab3-b8bd-4e53739410a6	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	login	user	cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	User logged in	127.0.0.1	\N	2026-01-16 19:46:06.904058
f0f65841-eb9b-4d00-95f3-e85ace3da442	31ed322f-ae77-41bf-b40a-5edd20d82a99	login	user	31ed322f-ae77-41bf-b40a-5edd20d82a99	User registered	\N	\N	2026-01-16 19:46:53.889942
c82447a1-bbda-460e-bd05-081d5caadc65	558d03ae-4a4c-469d-8a61-12586e1a677c	login	user	558d03ae-4a4c-469d-8a61-12586e1a677c	User registered	\N	\N	2026-01-16 19:46:53.995557
365163ef-996a-451c-b8f5-2cd204121ad8	31ed322f-ae77-41bf-b40a-5edd20d82a99	login	user	31ed322f-ae77-41bf-b40a-5edd20d82a99	User logged in	127.0.0.1	\N	2026-01-16 19:46:54.307895
2ebb8c5a-f5ae-4147-97c8-95e968fa80d8	558d03ae-4a4c-469d-8a61-12586e1a677c	login	user	558d03ae-4a4c-469d-8a61-12586e1a677c	User logged in	127.0.0.1	\N	2026-01-16 19:46:54.415957
d9fb4f6a-b690-4094-b688-bcaf1995011c	31ed322f-ae77-41bf-b40a-5edd20d82a99	login	user	31ed322f-ae77-41bf-b40a-5edd20d82a99	User logged in	127.0.0.1	\N	2026-01-16 19:46:54.831329
6025761d-4d90-4475-a647-dc35f289bb94	558d03ae-4a4c-469d-8a61-12586e1a677c	login	user	558d03ae-4a4c-469d-8a61-12586e1a677c	User logged in	127.0.0.1	\N	2026-01-16 19:46:54.933719
a4e20a9a-5838-4be5-9a5c-843ec6586af4	31ed322f-ae77-41bf-b40a-5edd20d82a99	login	user	31ed322f-ae77-41bf-b40a-5edd20d82a99	User logged in	127.0.0.1	\N	2026-01-16 19:46:55.053591
9cc2da84-3f1d-40c9-8d70-283a7cc453e5	558d03ae-4a4c-469d-8a61-12586e1a677c	login	user	558d03ae-4a4c-469d-8a61-12586e1a677c	User logged in	127.0.0.1	\N	2026-01-16 19:46:55.17694
618f615a-06d6-4942-84e0-7b5d5fbf6112	31ed322f-ae77-41bf-b40a-5edd20d82a99	login	user	31ed322f-ae77-41bf-b40a-5edd20d82a99	User logged in	127.0.0.1	\N	2026-01-16 19:46:55.29841
c07e804b-1337-430e-b648-d841222ce8d2	558d03ae-4a4c-469d-8a61-12586e1a677c	login	user	558d03ae-4a4c-469d-8a61-12586e1a677c	User logged in	127.0.0.1	\N	2026-01-16 19:46:55.401099
92360d0b-d182-4ba6-baa8-f80824355971	31ed322f-ae77-41bf-b40a-5edd20d82a99	login	user	31ed322f-ae77-41bf-b40a-5edd20d82a99	User logged in	127.0.0.1	\N	2026-01-16 19:46:55.523028
d3dc4fdf-9f8d-4c95-9193-a11ae0e82bdc	558d03ae-4a4c-469d-8a61-12586e1a677c	login	user	558d03ae-4a4c-469d-8a61-12586e1a677c	User logged in	127.0.0.1	\N	2026-01-16 19:46:55.625362
935f3f5e-1ded-463d-b8a8-1ec6bd7d4268	e62bc3fb-fdaa-485b-a977-0bab3f604328	login	user	e62bc3fb-fdaa-485b-a977-0bab3f604328	User registered	\N	\N	2026-01-16 19:48:10.832484
cbc9e554-2cfc-4e15-8eae-405e20479788	123dff37-4b6c-4d0e-8a6b-aab402acefbf	login	user	123dff37-4b6c-4d0e-8a6b-aab402acefbf	User registered	\N	\N	2026-01-16 19:48:10.951062
fca5ec13-a2c3-4540-aaf3-4bde482cabbc	e62bc3fb-fdaa-485b-a977-0bab3f604328	login	user	e62bc3fb-fdaa-485b-a977-0bab3f604328	User logged in	127.0.0.1	\N	2026-01-16 19:48:11.090205
368e1fce-dfe6-4437-bd3c-2d1622e7d6fd	123dff37-4b6c-4d0e-8a6b-aab402acefbf	login	user	123dff37-4b6c-4d0e-8a6b-aab402acefbf	User logged in	127.0.0.1	\N	2026-01-16 19:48:11.225583
1e9d8493-6759-489b-8253-a56a361a7f0d	e62bc3fb-fdaa-485b-a977-0bab3f604328	login	user	e62bc3fb-fdaa-485b-a977-0bab3f604328	User logged in	127.0.0.1	\N	2026-01-16 19:48:11.383665
88e8b8ac-ae7d-43b4-87f5-8f3c31b2b930	123dff37-4b6c-4d0e-8a6b-aab402acefbf	login	user	123dff37-4b6c-4d0e-8a6b-aab402acefbf	User logged in	127.0.0.1	\N	2026-01-16 19:48:11.530842
a1c88913-3357-4523-8f96-1010737158fc	e62bc3fb-fdaa-485b-a977-0bab3f604328	login	user	e62bc3fb-fdaa-485b-a977-0bab3f604328	User logged in	127.0.0.1	\N	2026-01-16 19:48:11.698306
c8fa806e-daab-43a7-9264-0952ac50b7c9	123dff37-4b6c-4d0e-8a6b-aab402acefbf	login	user	123dff37-4b6c-4d0e-8a6b-aab402acefbf	User logged in	127.0.0.1	\N	2026-01-16 19:48:11.974303
c44dbe36-012f-4e0c-a789-91613aa818f6	e62bc3fb-fdaa-485b-a977-0bab3f604328	login	user	e62bc3fb-fdaa-485b-a977-0bab3f604328	User logged in	127.0.0.1	\N	2026-01-16 19:48:12.113678
4368deb8-d971-4646-86d5-fadd9455335c	123dff37-4b6c-4d0e-8a6b-aab402acefbf	login	user	123dff37-4b6c-4d0e-8a6b-aab402acefbf	User logged in	127.0.0.1	\N	2026-01-16 19:48:12.233681
d56bb8e2-3f5f-4b1a-a360-d94de43ca993	e62bc3fb-fdaa-485b-a977-0bab3f604328	login	user	e62bc3fb-fdaa-485b-a977-0bab3f604328	User logged in	127.0.0.1	\N	2026-01-16 19:48:12.371601
147ee99d-ab4b-4f19-a125-5a1a3faf6498	123dff37-4b6c-4d0e-8a6b-aab402acefbf	login	user	123dff37-4b6c-4d0e-8a6b-aab402acefbf	User logged in	127.0.0.1	\N	2026-01-16 19:48:12.473663
caa310e2-265b-4efd-9882-c32c2dcc813e	0a66d9b4-9985-4fe7-a322-4fc59524df11	login	user	0a66d9b4-9985-4fe7-a322-4fc59524df11	User registered	\N	\N	2026-01-16 22:30:59.208583
9127429a-8627-448f-8cdb-d3d8354d5fbe	feb746f1-da58-4f06-a48e-e0b9d7026a92	login	user	feb746f1-da58-4f06-a48e-e0b9d7026a92	User registered	\N	\N	2026-01-16 22:31:00.104796
d694b067-cf54-471f-bb22-bf04699f8ead	ac52de32-a239-4459-9da3-d06254edca70	login	user	ac52de32-a239-4459-9da3-d06254edca70	User registered	\N	\N	2026-01-16 22:31:00.226823
63510a34-08b3-4e2f-a1db-6af1d45aa5b3	1c8ac38e-41d8-4537-9279-fb9c5c94b575	login	user	1c8ac38e-41d8-4537-9279-fb9c5c94b575	User registered	\N	\N	2026-01-16 22:31:58.085402
e9a6af4b-56ca-4db1-a21e-a094322f9248	a6131658-56f0-4bab-bf6f-6c400a0a561b	login	user	a6131658-56f0-4bab-bf6f-6c400a0a561b	User registered	\N	\N	2026-01-16 22:31:58.870122
24249bf7-ac7a-46bb-8791-7c295ab5afe4	4933407d-7003-4666-a17e-3da3b8be7e29	login	user	4933407d-7003-4666-a17e-3da3b8be7e29	User registered	\N	\N	2026-01-16 22:31:58.99199
cef421da-e4ae-46af-a37d-316727e34fdb	047292c6-d028-4259-a9b3-69171a3afaf5	login	user	047292c6-d028-4259-a9b3-69171a3afaf5	User registered	\N	\N	2026-01-16 22:32:42.931719
b7f7b300-9926-4b16-b8f2-05d99e1ecc79	a89ad087-d359-49eb-ab5d-493f8dc16e11	login	user	a89ad087-d359-49eb-ab5d-493f8dc16e11	User registered	\N	\N	2026-01-16 22:32:43.668561
cdca8192-5d98-49f8-8c1a-0adef05f8272	c76d8fcb-f5fe-44aa-b628-0cca73968af4	login	user	c76d8fcb-f5fe-44aa-b628-0cca73968af4	User registered	\N	\N	2026-01-16 22:32:43.784767
383e1a11-9010-46e8-b2a1-41bb19115b03	b838ed7e-5905-4cec-8669-32ca4586674a	login	user	b838ed7e-5905-4cec-8669-32ca4586674a	User logged in	127.0.0.1	\N	2026-01-16 23:02:28.829157
61eaf440-7120-4ce7-a2d4-6dda0dd54ce2	6afff146-196b-46b8-bb0a-70ab0c0f0849	login	user	6afff146-196b-46b8-bb0a-70ab0c0f0849	User logged in	127.0.0.1	\N	2026-01-16 23:02:57.110421
3a25b3ce-38ab-4edd-9a17-07a1045af479	cdb746f6-1376-4302-a637-136cb48338f8	login	user	cdb746f6-1376-4302-a637-136cb48338f8	User logged in	127.0.0.1	\N	2026-01-16 23:02:57.659013
220f93b4-5c4e-4546-b0e0-f02a78850c01	7b0ed86a-dc2d-4e77-a8a2-b09f6022202b	login	user	7b0ed86a-dc2d-4e77-a8a2-b09f6022202b	User logged in	127.0.0.1	\N	2026-01-16 23:02:57.800691
f4b09ecc-70c4-49fd-bd84-aa3863a2c754	e564935e-0fc3-41fc-bbb6-0d964f2d8e75	login	user	e564935e-0fc3-41fc-bbb6-0d964f2d8e75	User logged in	127.0.0.1	\N	2026-01-16 23:02:58.012403
8eb4b4fd-4a9a-40c7-b7ff-37f8ab430893	e402383f-8a74-4ac2-bfcb-c4cd25e4e509	login	user	e402383f-8a74-4ac2-bfcb-c4cd25e4e509	User logged in	127.0.0.1	\N	2026-01-16 23:02:58.275873
e7453191-3bc2-4a7e-9aea-8d54a36cf88b	6c43b5c9-c124-4447-a3bb-321bca6436c5	login	user	6c43b5c9-c124-4447-a3bb-321bca6436c5	User logged in	127.0.0.1	\N	2026-01-16 23:02:58.635941
cbf46d78-efd2-46b9-9f50-e36f81f950b4	c6d47057-4a4a-4942-9834-0e77d3d73a3a	login	user	c6d47057-4a4a-4942-9834-0e77d3d73a3a	User logged in	127.0.0.1	\N	2026-01-16 23:02:58.755429
b801dd2e-e421-4834-baea-63f46bf71164	6d286f7f-d527-4b4a-9b25-c1a904a96742	login	user	6d286f7f-d527-4b4a-9b25-c1a904a96742	User logged in	127.0.0.1	\N	2026-01-16 23:02:59.134529
f49da2ab-c758-4022-959c-5d42f30eda8e	10d9a122-b54b-46ed-acd7-e79f5fec1568	login	user	10d9a122-b54b-46ed-acd7-e79f5fec1568	User logged in	127.0.0.1	\N	2026-01-16 23:02:59.281925
4a2107a5-7c80-4ce0-a8d7-e3bd9686e972	6e092951-4f9f-49f7-83d1-468fffa39883	login	user	6e092951-4f9f-49f7-83d1-468fffa39883	User logged in	127.0.0.1	\N	2026-01-16 23:02:59.520526
9e724c48-347f-4282-b387-c1a312c73a41	7d3a527e-213d-4bdf-99dc-d232e74a3c7c	login	user	7d3a527e-213d-4bdf-99dc-d232e74a3c7c	User logged in	127.0.0.1	\N	2026-01-16 23:02:59.770123
bf99e20d-821a-4575-9d2e-9ed8d6af99f1	31b1ab14-cd5a-4620-96ef-56f7c903087a	login	user	31b1ab14-cd5a-4620-96ef-56f7c903087a	User logged in	127.0.0.1	\N	2026-01-16 23:03:00.331847
c33f52d8-0e55-4874-8510-d3caaf17c345	240531f5-e6e5-46bf-90a6-2314eaf07c7b	login	user	240531f5-e6e5-46bf-90a6-2314eaf07c7b	User logged in	127.0.0.1	\N	2026-01-16 23:03:00.493302
59a121fb-2fb4-47d8-b890-48bca3be01a4	33c531e3-c267-4464-8541-03122409d94d	login	user	33c531e3-c267-4464-8541-03122409d94d	User logged in	127.0.0.1	\N	2026-01-16 23:03:00.775774
e244c5d2-b910-4994-add5-19a8d5cc41c8	bb8f2e91-2abb-46fd-acaf-accfeb674c9b	login	user	bb8f2e91-2abb-46fd-acaf-accfeb674c9b	User logged in	127.0.0.1	\N	2026-01-16 23:04:24.068584
edd7ce03-18de-4663-b5e2-6ef91f7b24bf	274013ee-b272-4cc0-bf69-f06ecfec224e	login	user	274013ee-b272-4cc0-bf69-f06ecfec224e	User logged in	127.0.0.1	\N	2026-01-16 23:04:24.377806
5208bb5b-7b80-4843-a21e-1bc20c4cfd68	06e65c15-f90c-415e-a390-94abab4f12d7	login	user	06e65c15-f90c-415e-a390-94abab4f12d7	User logged in	127.0.0.1	\N	2026-01-16 23:04:24.844119
a6fe3127-b15e-4f6f-be83-36e670e79bcd	c2b70c3f-4bc5-4649-b19e-0306c4c019ec	login	user	c2b70c3f-4bc5-4649-b19e-0306c4c019ec	User logged in	127.0.0.1	\N	2026-01-16 23:04:24.944238
2f605f55-609e-4411-8fb6-0072339f1259	832970ed-abf4-43f6-a8ee-b3f10d1d1765	login	user	832970ed-abf4-43f6-a8ee-b3f10d1d1765	User logged in	127.0.0.1	\N	2026-01-16 23:04:25.047475
9ff19215-0899-4f91-8df5-d0c5148bc0f3	dd07d35f-11ee-4016-8b9a-a03e043b4507	login	user	dd07d35f-11ee-4016-8b9a-a03e043b4507	User logged in	127.0.0.1	\N	2026-01-16 23:04:25.254695
12bb6028-9bfd-4ebd-8022-06620e02d546	f74567bd-d96e-4d70-a865-ad4595a85bb4	login	user	f74567bd-d96e-4d70-a865-ad4595a85bb4	User logged in	127.0.0.1	\N	2026-01-16 23:04:25.589534
73fca19e-a856-4b1f-ad00-4ba63d987619	c79871bd-c9ad-49b6-88e3-d2cd50d74fd6	login	user	c79871bd-c9ad-49b6-88e3-d2cd50d74fd6	User logged in	127.0.0.1	\N	2026-01-16 23:04:25.686302
a4aef572-3c6a-4f24-bdcc-1b7558cbbbc2	b7a1375d-faf8-4b91-84fa-f80510f0a8d9	login	user	b7a1375d-faf8-4b91-84fa-f80510f0a8d9	User logged in	127.0.0.1	\N	2026-01-16 23:04:26.010989
8e38d90f-6de2-42a6-a690-c02a2de70f62	19a5e8df-c063-4e5d-9fec-6b8196e3d718	login	user	19a5e8df-c063-4e5d-9fec-6b8196e3d718	User logged in	127.0.0.1	\N	2026-01-16 23:04:26.125814
64ef69e5-5306-400d-ac47-7d8dcecd1dcb	2c32b6d2-1d27-4449-b22c-6be176fbc1a2	login	user	2c32b6d2-1d27-4449-b22c-6be176fbc1a2	User logged in	127.0.0.1	\N	2026-01-16 23:04:26.334583
fe496b16-01dc-44f2-8d79-3cc7099ec9f4	684bbf61-bb95-48ab-956e-3ed13c1ac743	login	user	684bbf61-bb95-48ab-956e-3ed13c1ac743	User logged in	127.0.0.1	\N	2026-01-16 23:04:26.558298
8da6397c-f585-4fac-8365-ae097677921b	3992efaa-b958-4086-919e-dc229b3f539d	login	user	3992efaa-b958-4086-919e-dc229b3f539d	User logged in	127.0.0.1	\N	2026-01-16 23:04:27.014394
ca25c7e8-e2bb-41f6-8937-fe7b2c06c0f1	7038f0e0-8fab-4306-86a0-10f0ece1e758	login	user	7038f0e0-8fab-4306-86a0-10f0ece1e758	User logged in	127.0.0.1	\N	2026-01-16 23:04:27.111625
66a45f04-3e65-4789-9b93-ac967f8c041f	20c0f052-379e-4ddf-a756-dbcd0a3358da	login	user	20c0f052-379e-4ddf-a756-dbcd0a3358da	User logged in	127.0.0.1	\N	2026-01-16 23:04:27.322944
ac35363b-f809-4776-9a4f-6eba53b989fc	bfb5ae54-28c0-4bbf-af2d-9d8859fa5379	login	user	bfb5ae54-28c0-4bbf-af2d-9d8859fa5379	User logged in	127.0.0.1	\N	2026-01-16 23:05:34.134985
cafc826c-d131-41de-8f65-6d9251ad8124	9b615429-ec17-4911-8e65-e7db2c524574	login	user	9b615429-ec17-4911-8e65-e7db2c524574	User logged in	127.0.0.1	\N	2026-01-16 23:05:34.415778
8216f037-80cd-4ec5-ab1f-19fd0f8466d5	9e1f9d00-1939-499c-86cb-82255590ad63	login	user	9e1f9d00-1939-499c-86cb-82255590ad63	User logged in	127.0.0.1	\N	2026-01-16 23:05:34.914237
3735f660-2708-41fb-8e92-ad4546529cce	e6afbaa3-c0a0-4ca8-b467-eeb2d3aaf505	login	user	e6afbaa3-c0a0-4ca8-b467-eeb2d3aaf505	User logged in	127.0.0.1	\N	2026-01-16 23:05:35.014507
2c54a180-c5ba-4a75-94dd-6fbd2931aac3	b3900e08-ca51-4ba7-97dd-92798aa4bc3c	login	user	b3900e08-ca51-4ba7-97dd-92798aa4bc3c	User logged in	127.0.0.1	\N	2026-01-16 23:05:35.124261
145ad611-2c99-43f9-ad80-ed50840cec0a	46e32f3d-2333-4739-92d6-69afa4cadfdd	login	user	46e32f3d-2333-4739-92d6-69afa4cadfdd	User logged in	127.0.0.1	\N	2026-01-16 23:05:35.339925
3c90061c-2440-495f-a227-c54b27c9792d	b12504c6-b116-40e4-b5bf-ef902b718746	login	user	b12504c6-b116-40e4-b5bf-ef902b718746	User logged in	127.0.0.1	\N	2026-01-16 23:05:35.671726
e85c5c12-669a-4c10-bff0-2f17d2d0ca97	0cb917e5-be92-4e23-b267-1f7160584d36	login	user	0cb917e5-be92-4e23-b267-1f7160584d36	User logged in	127.0.0.1	\N	2026-01-16 23:05:35.778318
913be6aa-604f-41c7-a14c-d0abcf9a1a4e	77144dae-3ab8-42e9-ac41-c21ce54f26ba	login	user	77144dae-3ab8-42e9-ac41-c21ce54f26ba	User logged in	127.0.0.1	\N	2026-01-16 23:05:36.093521
bffab111-457a-425b-8e11-28b61882a287	33cef31b-cec5-497f-acf7-e286a2d4a8b7	login	user	33cef31b-cec5-497f-acf7-e286a2d4a8b7	User logged in	127.0.0.1	\N	2026-01-16 23:05:36.206544
84fa4efe-47e6-45c7-ac00-1b0ce7ebe7c7	743e5bbe-4096-4821-a1cb-b93ed0c5187e	login	user	743e5bbe-4096-4821-a1cb-b93ed0c5187e	User logged in	127.0.0.1	\N	2026-01-16 23:05:36.411263
8c7d001e-a50d-4eb2-80b2-0fe7faa47e51	0fd14e17-b8c1-4be1-809b-c3d579701252	login	user	0fd14e17-b8c1-4be1-809b-c3d579701252	User logged in	127.0.0.1	\N	2026-01-16 23:05:36.618297
a245af1a-6ace-4bc8-90c7-6b4d47805d8d	0455237a-d556-45bf-a83a-a5c1f212d5e1	login	user	0455237a-d556-45bf-a83a-a5c1f212d5e1	User logged in	127.0.0.1	\N	2026-01-16 23:05:37.13642
cc228fea-448e-4336-97fa-06a0ea79db6b	39ac6f59-3898-42c1-907a-065782df5fe9	login	user	39ac6f59-3898-42c1-907a-065782df5fe9	User logged in	127.0.0.1	\N	2026-01-16 23:05:37.271585
d780ba7d-7671-475b-87e2-19cc28487b46	026743b1-d1bc-4d3d-b7ac-fc4d4382b768	login	user	026743b1-d1bc-4d3d-b7ac-fc4d4382b768	User logged in	127.0.0.1	\N	2026-01-16 23:05:37.374784
20149fe6-511d-4b0c-b1f8-03bb408713ea	87a9fd0e-08a4-49ae-a554-69343bad01c1	login	user	87a9fd0e-08a4-49ae-a554-69343bad01c1	User logged in	127.0.0.1	\N	2026-01-16 23:05:37.702513
013510f1-3894-42bc-9141-43beffc94421	51f0531d-199b-4634-8d89-6c7de5d25bf4	login	user	51f0531d-199b-4634-8d89-6c7de5d25bf4	One-click registration	10.82.8.199	\N	2026-01-17 00:45:09.00326
7e791a2d-ac9d-4dff-a9e2-f1b856a25b15	60ba58c6-5c77-45dd-8493-151573e00df2	login	user	60ba58c6-5c77-45dd-8493-151573e00df2	One-click registration	10.82.6.247	\N	2026-01-17 09:43:02.167871
ae966590-2d5e-4264-b0ce-64a45310e6df	ff7b0431-dda5-4433-8912-8e6114144ecf	login	user	ff7b0431-dda5-4433-8912-8e6114144ecf	One-click registration	10.82.2.224	\N	2026-01-17 10:50:53.463322
5d8bf4be-be79-4761-863f-0e64301cb780	fd1b585b-3a65-464c-8de9-38dbc3b97211	login	user	fd1b585b-3a65-464c-8de9-38dbc3b97211	One-click registration	10.82.2.224	\N	2026-01-17 13:56:36.297413
35dc9a90-0648-4273-9c0e-8901e670e824	6a22fd4d-72b5-4d9a-900f-c5135f4b9f31	login	user	6a22fd4d-72b5-4d9a-900f-c5135f4b9f31	One-click registration	10.82.2.224	\N	2026-01-17 17:12:59.575185
1da511f1-f728-4315-8d92-4c0be0e28078	69dc9332-3c4f-46a4-af1e-2edc0047ebf8	login	user	69dc9332-3c4f-46a4-af1e-2edc0047ebf8	One-click registration	10.82.2.224	\N	2026-01-17 17:13:05.314089
bad5d41f-89ec-4fd4-a4b5-9ce974045f7e	ab30cdb9-7220-4345-96c0-fad6ff6d5017	login	user	ab30cdb9-7220-4345-96c0-fad6ff6d5017	One-click registration	10.82.0.66	\N	2026-01-17 17:22:11.044045
1288e73a-57fc-4104-a41a-f5b2c985906c	ff684bcd-97f9-4c2d-ab75-e053be0a60c1	login	user	ff684bcd-97f9-4c2d-ab75-e053be0a60c1	User logged in	127.0.0.1	\N	2026-01-17 17:30:29.010916
9ea6566a-1dee-4e8b-b265-7a6f61fd9a7b	bed43532-9f93-4594-9de6-5bdfa1d3df0c	login	user	bed43532-9f93-4594-9de6-5bdfa1d3df0c	User logged in	127.0.0.1	\N	2026-01-17 17:30:29.450746
67c86ce0-6059-4960-9a5b-cf82d3a98044	c18ab9f3-6a8e-4101-addb-913fc0bbbffa	login	user	c18ab9f3-6a8e-4101-addb-913fc0bbbffa	User logged in	127.0.0.1	\N	2026-01-17 17:30:30.116017
2e4d095b-68f9-4377-9ba5-22bc8073b39b	fc408a15-c0ea-48af-9552-418315e55cfc	login	user	fc408a15-c0ea-48af-9552-418315e55cfc	User logged in	127.0.0.1	\N	2026-01-17 17:30:30.250315
feaa7191-0a07-41ad-ad55-9720505450bf	da9637fe-ac95-4eb9-b614-a9a3113c35f2	login	user	da9637fe-ac95-4eb9-b614-a9a3113c35f2	User logged in	127.0.0.1	\N	2026-01-17 17:30:30.400608
786e130c-b390-476c-8855-dc16b02c028c	7838c21b-911a-4db9-8ef1-7eb4e5191b59	login	user	7838c21b-911a-4db9-8ef1-7eb4e5191b59	User logged in	127.0.0.1	\N	2026-01-17 17:30:30.723288
68a88d25-fd81-4d64-935a-c866328c9470	5f20ee37-3674-4edf-a9f7-1b6129a7373b	login	user	5f20ee37-3674-4edf-a9f7-1b6129a7373b	User logged in	127.0.0.1	\N	2026-01-17 17:30:31.075699
b49154a4-5f32-4283-87be-2fc453c9eef5	3e8d9d96-4fd5-4eb7-9483-fa409e041b2d	login	user	3e8d9d96-4fd5-4eb7-9483-fa409e041b2d	User logged in	127.0.0.1	\N	2026-01-17 17:30:31.191274
b7f75ba2-733d-4c45-a4ca-3883d3faf94f	571fb00a-18b2-4c96-b4d6-7e1e64d4d842	login	user	571fb00a-18b2-4c96-b4d6-7e1e64d4d842	User logged in	127.0.0.1	\N	2026-01-17 17:30:31.540369
c6af77f7-baae-4166-bc50-0e1d3f13f65b	6baf88f1-558c-482f-8d2a-50428be6fbc0	login	user	6baf88f1-558c-482f-8d2a-50428be6fbc0	User logged in	127.0.0.1	\N	2026-01-17 17:30:31.664549
2639ddb6-059f-4d79-a71d-e3224255de5b	05e45256-2e89-47dc-99ec-d04f38ab5e06	login	user	05e45256-2e89-47dc-99ec-d04f38ab5e06	User logged in	127.0.0.1	\N	2026-01-17 17:30:31.927946
066d2d8e-ef6c-4e99-a94b-41e46bebc5e4	4160d62e-5f36-4868-8c1e-3816cfc76407	login	user	4160d62e-5f36-4868-8c1e-3816cfc76407	User logged in	127.0.0.1	\N	2026-01-17 17:30:32.165558
19f7e8fd-4b8b-452c-8cd5-e997c67994b5	2f9b5593-e9a7-4fef-8e75-27dd68e7c6a3	login	user	2f9b5593-e9a7-4fef-8e75-27dd68e7c6a3	User logged in	127.0.0.1	\N	2026-01-17 17:30:32.673432
d4179328-d1e4-4c1b-87e0-fe432ac7adc4	55dfd29c-e602-4c38-8b73-f46a71b38e8c	login	user	55dfd29c-e602-4c38-8b73-f46a71b38e8c	User logged in	127.0.0.1	\N	2026-01-17 17:30:32.805356
9207f289-6679-4dd3-87d6-1852982dd6c0	893d2690-3436-4ed7-91e1-d3f6425bb154	login	user	893d2690-3436-4ed7-91e1-d3f6425bb154	User logged in	127.0.0.1	\N	2026-01-17 17:30:32.922594
da7ce4ee-e3b9-460b-947c-7a21ddad0333	00d4aefb-c871-402c-8a54-7ec5ac4fce68	login	user	00d4aefb-c871-402c-8a54-7ec5ac4fce68	User logged in	127.0.0.1	\N	2026-01-17 17:30:33.167879
2623d3cb-e1e6-49b9-8665-f9bb77775f1c	f6bd803e-6a65-4f50-8685-b7cd2da69169	login	user	f6bd803e-6a65-4f50-8685-b7cd2da69169	User registered	\N	\N	2026-01-17 17:30:35.512626
d4797960-f33e-4ff4-9fa1-28ad439ca8de	a4dd661f-cc83-4e13-9f43-51a7a97912df	login	user	a4dd661f-cc83-4e13-9f43-51a7a97912df	User registered	\N	\N	2026-01-17 17:30:36.392487
1548ec0f-7993-4d37-9554-fa74f21264c5	722d9f43-d1fe-471a-b864-b9fa464f1cf7	login	user	722d9f43-d1fe-471a-b864-b9fa464f1cf7	User registered	\N	\N	2026-01-17 17:30:36.523295
4ed7c55a-1fe9-41af-83f2-d85414563c1e	171e3120-af06-4bf8-a27f-840e2fad2cbc	login	user	171e3120-af06-4bf8-a27f-840e2fad2cbc	One-click registration	10.82.10.191	\N	2026-01-17 17:41:54.418672
a90d91e3-c47b-43c6-8335-63ead04d48d8	bd09669e-410e-4533-ba99-d3034612dbd5	login	user	bd09669e-410e-4533-ba99-d3034612dbd5	One-click registration	10.82.2.52	\N	2026-01-18 08:33:06.912797
55d31b84-2c8f-4783-9604-dd9552a0474b	c8c370ed-e8a0-4d38-a298-3d1c36d34aa2	login	user	c8c370ed-e8a0-4d38-a298-3d1c36d34aa2	Auto-registered from login attempt	127.0.0.1	\N	2026-01-18 08:47:37.626649
e1092b29-265e-40a4-98cf-3956afb62c6c	c8c370ed-e8a0-4d38-a298-3d1c36d34aa2	settings_change	user	c8c370ed-e8a0-4d38-a298-3d1c36d34aa2	email verified: newuser@example.com	\N	\N	2026-01-18 08:47:59.025835
84590902-2efb-42ac-ba7e-779e38e453e6	2ce87eed-2726-43fd-926b-29e71354d865	login	user	2ce87eed-2726-43fd-926b-29e71354d865	One-click registration	10.82.10.191	\N	2026-01-18 10:14:20.061255
1711453b-65ef-4e86-a2c1-bacbbca92736	2ce87eed-2726-43fd-926b-29e71354d865	user_update	user	2ce87eed-2726-43fd-926b-29e71354d865	Profile updated	\N	\N	2026-01-18 10:14:40.453095
e89f73ab-cb6f-49ef-90d0-154324157557	6982329c-1f84-4198-9703-4fbbd3f0c584	login	user	6982329c-1f84-4198-9703-4fbbd3f0c584	Auto-registered from login attempt	127.0.0.1	\N	2026-01-18 10:27:18.245729
1be3c2dc-8f52-4a3b-96d9-c0398bd786f7	2ce87eed-2726-43fd-926b-29e71354d865	user_update	user	2ce87eed-2726-43fd-926b-29e71354d865	Profile updated	\N	\N	2026-01-18 10:37:49.984877
26dec964-793f-4788-b634-edd026720450	2ce87eed-2726-43fd-926b-29e71354d865	user_update	user	2ce87eed-2726-43fd-926b-29e71354d865	Profile updated	\N	\N	2026-01-18 10:38:03.398426
6a0464d8-98c1-4971-a3bd-6c66bb0aad1e	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Auto-registered from login attempt	10.82.9.91	\N	2026-01-18 10:45:34.842788
65a96ef7-354a-42e4-91b0-51066313ec31	b809515e-fcef-4488-ba4a-688f43be016b	login	user	b809515e-fcef-4488-ba4a-688f43be016b	Auto-registered from login attempt	127.0.0.1	\N	2026-01-18 10:49:51.166049
c4c437f3-b28c-423c-b3cd-a1713be093f3	224e28f6-1212-4173-b835-b30fe65fbe16	login	user	224e28f6-1212-4173-b835-b30fe65fbe16	Auto-registered from login attempt	127.0.0.1	\N	2026-01-18 10:49:55.602653
e4c32926-d0f0-499b-ae0e-4b03ccc56118	224e28f6-1212-4173-b835-b30fe65fbe16	login	user	224e28f6-1212-4173-b835-b30fe65fbe16	Login by email	127.0.0.1	\N	2026-01-18 10:51:52.465795
ee8d7e04-94b5-4938-b0f6-96e194104b22	1fd88a1e-738b-4162-881c-11fc0620246b	login	user	1fd88a1e-738b-4162-881c-11fc0620246b	Auto-registered from login attempt	127.0.0.1	\N	2026-01-18 10:52:01.149678
378b2fea-a2d4-452f-afcf-3ec777b7cec8	1fd88a1e-738b-4162-881c-11fc0620246b	login	user	1fd88a1e-738b-4162-881c-11fc0620246b	Login by email	127.0.0.1	\N	2026-01-18 10:52:01.278855
67febd5b-85d8-40d3-ace7-a7883852f9a3	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.4.29	\N	2026-01-18 10:53:12.124731
d5e38bee-eb4c-42cd-ba27-04c72e4eb9b2	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.5.34	\N	2026-01-18 11:09:34.789892
d6250611-98f8-4cc8-b089-55f1b6fd7f5e	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.9.4	\N	2026-01-18 11:52:07.770024
a3957daf-48ea-452d-b909-235b92ea60ee	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.2.52	\N	2026-01-18 11:56:37.888982
ec310f6f-e096-4638-b647-f25328124dc3	1f2400d8-f7dc-498c-a2dc-4d35f1a0be1c	login	user	1f2400d8-f7dc-498c-a2dc-4d35f1a0be1c	User registered	\N	\N	2026-01-18 12:15:05.418854
7bd93c00-4421-4571-b610-06af7e68d487	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.9.4	\N	2026-01-18 12:40:52.082254
31e90dc5-b81c-4ab4-9b14-f714802507c0	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.4.29	\N	2026-01-18 13:10:54.372228
b913dc84-b327-45be-be6a-9aa9fdda23db	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.10.7	\N	2026-01-18 14:01:58.947478
909fc9b3-883f-470a-bb0b-2b4f5fd59e41	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.5.34	\N	2026-01-18 14:26:52.329804
367ce885-488a-4dae-83c3-82affc7fe12a	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.7.39	\N	2026-01-18 14:31:50.575288
52069198-e824-473a-acbf-a83f86b1747b	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.8.3	\N	2026-01-18 14:47:00.714215
78820af9-5c1e-4040-a8a6-adf9e7144d40	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.5.34	\N	2026-01-18 14:58:23.014031
25a27ab6-30a2-4b68-bbc1-820658451980	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	login	user	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	Login by email	10.82.0.54	\N	2026-01-18 22:27:50.434746
28b55a57-5ad8-4f54-a065-23cb9d9c4843	a129c1da-c105-4f09-ba5e-cf9d3ee92b0c	login	user	a129c1da-c105-4f09-ba5e-cf9d3ee92b0c	One-click registration	10.82.2.52	\N	2026-01-19 03:47:35.493254
728bf3ed-ec7e-4b2c-a4f4-d27aa0524c60	fa1143d9-759a-435c-84fe-727016a35664	login	user	fa1143d9-759a-435c-84fe-727016a35664	One-click registration	10.82.9.4	\N	2026-01-19 18:45:29.782846
dfbf1021-9c0c-4f1c-b749-efb360cbf2f3	8a59f138-4ca9-4bc6-8c17-d9762250574b	login	user	8a59f138-4ca9-4bc6-8c17-d9762250574b	One-click registration	127.0.0.1	\N	2026-01-19 18:50:15.154276
0398e2c3-ba0c-4b8b-85b0-5e6f1abf8ff1	7de1ffff-37d1-4569-89ae-97b757a12331	login	user	7de1ffff-37d1-4569-89ae-97b757a12331	User registered	\N	\N	2026-01-19 18:50:29.123601
76768a3f-0bab-4255-a0f1-b483d47177d9	4a6ae42d-5986-4816-9e52-e9ad5ccd4c49	login	user	4a6ae42d-5986-4816-9e52-e9ad5ccd4c49	One-click registration	10.82.0.54	\N	2026-01-19 18:53:08.965418
84d067a6-54d0-4a2f-b905-8ec1371fd5c4	47146896-d6eb-4ffe-8a44-dd1346a5a908	login	user	47146896-d6eb-4ffe-8a44-dd1346a5a908	One-click registration	10.82.8.26	\N	2026-01-19 18:55:44.457733
1145ebfa-9240-4dcf-948e-3174ece0a7aa	6d983ba7-6634-4f08-ac41-2623c9b39e3c	login	user	6d983ba7-6634-4f08-ac41-2623c9b39e3c	One-click registration	10.82.8.26	\N	2026-01-19 18:56:15.357195
7f35c6d1-2b11-4dcd-99c2-36828e221640	d0680e30-a37f-4856-a6ca-7e571a6dfdd4	login	user	d0680e30-a37f-4856-a6ca-7e571a6dfdd4	One-click registration	127.0.0.1	\N	2026-01-19 18:57:27.508989
2a78a008-59c3-4eb7-b88a-540e55482b27	ccdbdb8f-f5f9-4b9b-aec5-db61dd771226	login	user	ccdbdb8f-f5f9-4b9b-aec5-db61dd771226	One-click registration	127.0.0.1	\N	2026-01-19 18:57:35.539738
1eef3bee-cc34-44ac-a2f0-81b27fd86cdd	d9cf6c09-6b8a-4874-89cb-070d18def00d	login	user	d9cf6c09-6b8a-4874-89cb-070d18def00d	One-click registration	10.82.9.4	\N	2026-01-19 18:59:33.828277
f9ad5677-c8ca-436d-a532-4bd17eb17a15	074689ad-b8ce-44b8-a015-daed296f5281	login	user	074689ad-b8ce-44b8-a015-daed296f5281	One-click registration	10.82.0.54	\N	2026-01-19 20:09:57.530834
7dbc18d4-d2c0-458a-9458-b08e2dc0be83	8c56493e-4777-406b-bbf0-a47203630997	login	user	8c56493e-4777-406b-bbf0-a47203630997	One-click registration	10.82.6.13	\N	2026-01-19 20:18:17.396036
dd61dd2a-b398-45c3-a7f0-4521a96e9a4c	377adf3b-56b3-4d0d-922b-3a6ddb3fb524	login	user	377adf3b-56b3-4d0d-922b-3a6ddb3fb524	One-click registration	10.82.2.52	\N	2026-01-19 20:30:40.900839
81cf9d42-78f1-4517-9d62-c8eae7378895	7d8e1972-80e7-4e00-abc8-84f726c204b6	login	user	7d8e1972-80e7-4e00-abc8-84f726c204b6	One-click registration	10.82.7.39	\N	2026-01-20 00:01:55.376793
d95a5af9-ba6f-435b-85b2-e26baff8ab53	fd1e958c-afc3-49bc-a229-a1049ff601e3	login	user	fd1e958c-afc3-49bc-a229-a1049ff601e3	One-click registration	10.82.6.13	\N	2026-01-20 00:01:56.558854
b14b0709-5ba4-42b5-a458-70cb63ed7fd5	da6f34a0-2e4c-4b95-92af-c77488d71838	login	user	da6f34a0-2e4c-4b95-92af-c77488d71838	One-click registration	10.82.8.3	\N	2026-01-20 00:03:57.947173
49dd7a02-9a12-4139-80b8-ab29fa7e459b	8c9ab0fc-6d0b-4f68-919a-fd15bf74df6c	login	user	8c9ab0fc-6d0b-4f68-919a-fd15bf74df6c	One-click registration	10.82.5.34	\N	2026-01-20 00:34:46.666335
366bce24-10da-436e-8d6f-4e1024f54e94	1a06eb5f-8fca-4c3d-8264-339f3d9a8cda	login	user	1a06eb5f-8fca-4c3d-8264-339f3d9a8cda	One-click registration	10.82.2.52	\N	2026-01-20 00:35:00.089738
f3f24698-6c68-40c2-b6f2-cf46dbfabd44	dc1ec030-d8a5-4972-8e1e-20f01abaee69	login	user	dc1ec030-d8a5-4972-8e1e-20f01abaee69	One-click registration	10.82.0.54	\N	2026-01-20 00:42:27.175512
bdaa3ed8-1760-4545-9d40-7dc0978d71a6	00d893bf-c7cc-4c5a-b65d-77f97985d3de	login	user	00d893bf-c7cc-4c5a-b65d-77f97985d3de	One-click registration	10.82.0.54	\N	2026-01-20 00:42:28.192281
39548393-15c1-4641-b13b-7a2ff4cda7ee	b684a576-04af-4caa-8ccb-c52339356cc3	login	user	b684a576-04af-4caa-8ccb-c52339356cc3	One-click registration	10.82.2.52	\N	2026-01-20 00:42:32.811836
d6301ab5-eea5-4f8d-8dd1-baf8046bab7d	07d181cd-5c5f-48ef-9176-a8bde979da32	login	user	07d181cd-5c5f-48ef-9176-a8bde979da32	One-click registration	10.82.5.34	\N	2026-01-20 00:56:34.674468
d7834222-7985-4df0-bb5f-fb796afcf9f1	cdaf32f9-3a37-4c86-85bc-03929da172d7	login	user	cdaf32f9-3a37-4c86-85bc-03929da172d7	One-click registration	10.82.8.3	\N	2026-01-20 00:56:38.123827
70acb8b2-2b11-40cd-8f69-2a790d0da6c8	3091265b-af8d-4bf0-af19-c36a8301a6b2	login	user	3091265b-af8d-4bf0-af19-c36a8301a6b2	One-click registration	10.82.10.8	\N	2026-01-20 00:56:39.207346
ea15866b-d0db-4f30-ad56-fcc7a33080d4	cdaf32f9-3a37-4c86-85bc-03929da172d7	withdrawal	transaction	6b874cd8-6b4c-4f2f-a546-e8989f3a703d	{"amount":2000}	\N	\N	2026-01-20 01:02:37.761443
77f72ccc-5f95-47b8-8e02-3b9a6e708657	9d753bee-0ae8-4ddf-9339-f2346874c163	login	user	9d753bee-0ae8-4ddf-9339-f2346874c163	One-click registration	10.82.10.8	\N	2026-01-20 01:15:19.379168
524a2a61-0583-4dd5-8228-53cfc0aefcf4	e6092a9c-04aa-48d2-8617-202ff5a62c50	login	user	e6092a9c-04aa-48d2-8617-202ff5a62c50	One-click registration	10.82.9.4	\N	2026-01-20 01:15:57.541912
4c17cb2d-5c20-46be-8983-4b44601a8a75	6beed496-b444-491f-aa82-d806cf365496	login	user	6beed496-b444-491f-aa82-d806cf365496	One-click registration	10.82.10.8	\N	2026-01-20 01:16:02.669117
c4d22be4-1412-48bf-8287-ed5016646b06	e340a4e0-50d4-4f58-a3b2-f892946f4499	login	user	e340a4e0-50d4-4f58-a3b2-f892946f4499	User registered	\N	\N	2026-01-21 15:24:09.285176
efe6f0f8-2e4f-490b-b215-1e9f4f7efec1	986a9ace-9937-49a2-bd90-c66c64d71789	login	user	986a9ace-9937-49a2-bd90-c66c64d71789	One-click registration	10.82.4.120	\N	2026-01-21 20:21:22.871237
eca2f8a1-58a5-4cef-8a76-d69d3740873b	5bbefd70-91b3-4631-a5ee-79c68522b3f5	login	user	5bbefd70-91b3-4631-a5ee-79c68522b3f5	One-click registration	10.82.12.87	\N	2026-01-21 20:21:44.762706
\.


--
-- Data for Name: backgammon_moves; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.backgammon_moves (id, session_id, player_id, move_number, from_point, to_point, die_used, is_hit, is_bear_off, board_state, time_spent, created_at) FROM stdin;
\.


--
-- Data for Name: badge_catalog; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.badge_catalog (id, name, name_ar, description, description_ar, icon_url, icon_name, color, category, requirement, points, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: broadcast_notifications; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.broadcast_notifications (id, title, title_ar, content, content_ar, target_type, target_value, sent_by, sent_at, expires_at) FROM stdin;
1ceaab6f-0a7d-4848-a92f-42438e214cdb	lvmbmb	زبينتلانيبلات	xlf;kbmdfmbdk	ءنكبتلاينتلثنت	user	dbff1338-7a54-4bc3-bdf4-28957de21b39	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-08 23:56:53.848882	\N
d877643f-b44a-47d9-9b8f-e7766784034b	lvmbmb	زبينتلانيبلات	xlf;kbmdfmbdk	ءنكبتلاينتلثنت	user	dbff1338-7a54-4bc3-bdf4-28957de21b39	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-08 23:56:57.503264	\N
\.


--
-- Data for Name: card_game_bids; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.card_game_bids (id, session_id, player_id, round_number, bid_value, bid_suit, is_pass, created_at) FROM stdin;
\.


--
-- Data for Name: card_game_plays; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.card_game_plays (id, session_id, player_id, round_number, trick_number, card_suit, card_rank, play_order, won_trick, time_spent, created_at) FROM stdin;
\.


--
-- Data for Name: challenge_chat_messages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_chat_messages (id, session_id, sender_id, message, is_quick_message, quick_message_key, is_spectator, created_at) FROM stdin;
\.


--
-- Data for Name: challenge_follow_notifications; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_follow_notifications (id, follower_id, challenger_id, challenge_id, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: challenge_follows; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_follows (id, follower_id, followed_id, notify_on_match, created_at) FROM stdin;
\.


--
-- Data for Name: challenge_game_sessions; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_game_sessions (id, challenge_id, game_type, current_turn, player1_time_remaining, player2_time_remaining, game_state, last_move_at, status, winner_id, win_reason, total_moves, spectator_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: challenge_gifts; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_gifts (id, challenge_id, sender_id, recipient_id, gift_id, quantity, message, sent_at) FROM stdin;
\.


--
-- Data for Name: challenge_points_ledger; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_points_ledger (id, challenge_id, user_id, target_player_id, points_amount, reason, created_at) FROM stdin;
\.


--
-- Data for Name: challenge_ratings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_ratings (id, user_id, total_challenges, wins, losses, draws, win_rate, current_streak, best_streak, total_earnings, rank, updated_at) FROM stdin;
\.


--
-- Data for Name: challenge_spectator_bets; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_spectator_bets (id, challenge_id, spectator_id, backed_player_id, bet_amount, potential_winnings, status, settled_at, created_at, currency_type) FROM stdin;
\.


--
-- Data for Name: challenge_spectators; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenge_spectators (id, challenge_id, user_id, joined_at, left_at) FROM stdin;
\.


--
-- Data for Name: challenger_follows; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenger_follows (id, follower_id, followed_id, created_at) FROM stdin;
\.


--
-- Data for Name: challenges; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.challenges (id, game_type, bet_amount, visibility, status, player1_id, player2_id, winner_id, opponent_type, friend_account_id, time_limit, player1_score, player2_score, started_at, ended_at, created_at, updated_at, currency_type, player3_id, player4_id, required_players, current_players, player3_score, player4_score) FROM stdin;
448492ce-2eef-4241-a0d9-369f6f5fcf84	chess	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 11:03:49.686	\N	2026-01-18 11:03:49.687829	2026-01-18 11:03:49.687829	usd	\N	\N	2	1	0	0
892b618e-cc97-4d63-af1b-eeda24b69a4c	domino	100.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-18 11:04:13.992	\N	2026-01-18 11:04:13.993656	2026-01-18 11:04:13.993656	usd	\N	\N	2	1	0	0
37e076a4-0fed-4fc3-b428-e6b558fd226c	chess	10.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 11:04:31.322	\N	2026-01-18 11:04:31.323482	2026-01-18 11:04:31.323482	usd	\N	\N	2	1	0	0
96a3183e-3d5c-40af-ac6f-aeccf1a01803	chess	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 11:04:48.903	\N	2026-01-18 11:04:48.905104	2026-01-18 11:04:48.905104	usd	\N	\N	2	1	0	0
bfaa8afc-7148-42ab-9b49-a5972608ca85	domino	500.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 11:05:01.072	\N	2026-01-18 11:05:01.073751	2026-01-18 11:05:01.073751	usd	\N	\N	2	1	0	0
5a54eb8f-7477-42c3-80c8-ae8946fa818a	domino	25.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 11:05:31.862	\N	2026-01-18 11:05:31.86447	2026-01-18 11:05:31.86447	usd	\N	\N	2	1	0	0
727c245a-1a99-4dac-bd2e-4319939dbbdf	backgammon	1000.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 11:05:57.356	\N	2026-01-18 11:05:57.35753	2026-01-18 11:05:57.35753	usd	\N	\N	2	1	0	0
76c17508-070f-4311-aa2d-36f071cc69b9	backgammon	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 11:06:15.991	\N	2026-01-18 11:06:15.992163	2026-01-18 11:06:15.992163	usd	\N	\N	2	1	0	0
eb67b4ef-d188-4a7f-af9a-fb4703cfe7a9	domino	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 11:06:27.685	\N	2026-01-18 11:06:27.686588	2026-01-18 11:06:27.686588	usd	\N	\N	2	1	0	0
191352a2-c695-4cc1-8f98-7f66f94fe1d3	chess	10.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 11:06:56.218	\N	2026-01-18 11:06:56.220124	2026-01-18 11:06:56.220124	usd	\N	\N	2	1	0	0
1763ac71-0809-47b2-87cd-3cbff7b78310	chess	5.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-18 11:07:10.897	\N	2026-01-18 11:07:10.899216	2026-01-18 11:07:10.899216	usd	\N	\N	2	1	0	0
ab18396f-4b0f-4f31-8cdc-e7e4552a95c6	chess	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 11:07:36.476	\N	2026-01-18 11:07:36.478177	2026-01-18 11:07:36.478177	usd	\N	\N	2	1	0	0
f5f4fac8-779a-43d0-8211-787d104ca42a	chess	1000.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 11:08:02.14	\N	2026-01-18 11:08:02.141259	2026-01-18 11:08:02.141259	usd	\N	\N	2	1	0	0
9e3ab9bc-acec-4f20-b8e9-5f88c1134961	backgammon	5.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 11:08:28.731	\N	2026-01-18 11:08:28.732541	2026-01-18 11:08:28.732541	usd	\N	\N	2	1	0	0
720616b2-9eff-41fa-9b36-f5d25966bbd6	backgammon	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 11:08:48.988	\N	2026-01-18 11:08:48.992542	2026-01-18 11:08:48.992542	usd	\N	\N	2	1	0	0
6ade078e-17d9-450a-857e-c8fcb1671082	backgammon	10.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 11:09:05.316	\N	2026-01-18 11:09:05.319335	2026-01-18 11:09:05.319335	usd	\N	\N	2	1	0	0
9aceeaa7-a5a1-4d57-8520-f73322b27fc1	backgammon	500.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 11:09:54.997	\N	2026-01-18 11:09:54.998601	2026-01-18 11:09:54.998601	usd	\N	\N	2	1	0	0
6c14f4e2-b5d9-4605-852d-e1b460e12c27	domino	50.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 11:10:24.906	\N	2026-01-18 11:10:24.907038	2026-01-18 11:10:24.907038	usd	\N	\N	2	1	0	0
9c3605e1-8308-4367-9e32-129bfa1badf3	chess	5.00000000	public	completed	f065b93a-0a3e-408b-964a-8759f618e683	ad92f2f2-89e3-47ed-a10e-6ed23626e440	ad92f2f2-89e3-47ed-a10e-6ed23626e440	random	\N	600	0	0	2026-01-18 11:09:26.358	2026-01-18 11:19:35.208	2026-01-18 11:09:26.359117	2026-01-18 11:19:35.208	usd	\N	\N	2	1	0	0
9b618a08-5f60-418b-ac2b-df0f579753ca	backgammon	250.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 11:19:49.092	\N	2026-01-18 11:19:49.093286	2026-01-18 11:19:49.093286	usd	\N	\N	2	1	0	0
a0423653-41d1-4539-8e77-fceb2861e157	chess	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 11:24:13.835	\N	2026-01-18 11:24:13.837176	2026-01-18 11:24:13.837176	usd	\N	\N	2	1	0	0
82650602-073a-48c5-b6c3-000f3d934d87	chess	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 11:24:32.966	\N	2026-01-18 11:24:32.968185	2026-01-18 11:24:32.968185	usd	\N	\N	2	1	0	0
d27166d6-41c4-4fe8-b5d6-a49796a7d75b	chess	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 11:24:50.778	\N	2026-01-18 11:24:50.780014	2026-01-18 11:24:50.780014	usd	\N	\N	2	1	0	0
f5e1ebb7-6f6b-4a11-992e-4126222ffd11	domino	500.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 11:25:03.345	\N	2026-01-18 11:25:03.34709	2026-01-18 11:25:03.34709	usd	\N	\N	2	1	0	0
ceb2a049-0c36-4cae-b460-74d2a82f9b00	backgammon	1000.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 11:25:18.143	\N	2026-01-18 11:25:18.144874	2026-01-18 11:25:18.144874	usd	\N	\N	2	1	0	0
be1a51a5-b8de-4932-a554-b0d257b0cc42	domino	100.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 11:34:25.768	\N	2026-01-18 11:34:25.769702	2026-01-18 11:34:25.769702	usd	\N	\N	2	1	0	0
3b2ce468-9850-49f2-96b2-a5c3cd6bb906	backgammon	1000.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 11:34:36.358	\N	2026-01-18 11:34:36.359534	2026-01-18 11:34:36.359534	usd	\N	\N	2	1	0	0
6dc6f5ea-1ab4-47cb-a66d-e3a6807e89a7	backgammon	100.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 11:35:01.907	\N	2026-01-18 11:35:01.908208	2026-01-18 11:35:01.908208	usd	\N	\N	2	1	0	0
4e937d1b-e6c0-4039-9cb7-3a9df3b3695c	domino	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 11:35:23.973	\N	2026-01-18 11:35:23.974096	2026-01-18 11:35:23.974096	usd	\N	\N	2	1	0	0
1ce645dc-686e-43fd-b15a-c4d266b05462	backgammon	5.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 11:35:33.108	\N	2026-01-18 11:35:33.110431	2026-01-18 11:35:33.110431	usd	\N	\N	2	1	0	0
8d4ae53d-de36-407b-b345-21bdda69132c	backgammon	500.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-18 11:35:59.802	\N	2026-01-18 11:35:59.80421	2026-01-18 11:35:59.80421	usd	\N	\N	2	1	0	0
021ef530-eec5-471f-947b-cba5da49ac2a	chess	100.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 11:36:27.819	\N	2026-01-18 11:36:27.821006	2026-01-18 11:36:27.821006	usd	\N	\N	2	1	0	0
6da85fd9-e664-419b-91dc-fe04af24f833	domino	100.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 11:36:39.941	\N	2026-01-18 11:36:39.942852	2026-01-18 11:36:39.942852	usd	\N	\N	2	1	0	0
006f3177-ab79-419f-8be0-5252551e2d78	chess	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 11:36:51.166	\N	2026-01-18 11:36:51.167412	2026-01-18 11:36:51.167412	usd	\N	\N	2	1	0	0
2bd50db5-b47d-426c-a73e-dcdd5e8fda2d	chess	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 11:43:38.205	\N	2026-01-18 11:43:38.206871	2026-01-18 11:43:38.206871	usd	\N	\N	2	1	0	0
43e25560-6b77-445e-899e-6982553c0249	backgammon	50.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 11:44:02.546	\N	2026-01-18 11:44:02.548008	2026-01-18 11:44:02.548008	usd	\N	\N	2	1	0	0
ab1342ef-1824-4acc-8992-f6cbe893e0dc	domino	250.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 11:44:18.873	\N	2026-01-18 11:44:18.877692	2026-01-18 11:44:18.877692	usd	\N	\N	2	1	0	0
7db8cdb0-7c22-464a-8742-970058d51254	chess	10.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 11:44:31.312	\N	2026-01-18 11:44:31.313231	2026-01-18 11:44:31.313231	usd	\N	\N	2	1	0	0
306061f3-9b9d-4855-9c56-03c7ede9d3f6	backgammon	5.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 11:44:50.697	\N	2026-01-18 11:44:50.698852	2026-01-18 11:44:50.698852	usd	\N	\N	2	1	0	0
639fdab5-5f74-4012-aeb6-a896f633305b	chess	1000.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 11:45:04.251	\N	2026-01-18 11:45:04.252217	2026-01-18 11:45:04.252217	usd	\N	\N	2	1	0	0
3de48827-ae87-41d7-affa-8b3a87b6dc01	chess	250.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 11:45:14.343	\N	2026-01-18 11:45:14.343864	2026-01-18 11:45:14.343864	usd	\N	\N	2	1	0	0
e3979b5d-c17c-4d30-91b9-f6b9a8764cbf	backgammon	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 11:48:56.921	\N	2026-01-18 11:48:56.922873	2026-01-18 11:48:56.922873	usd	\N	\N	2	1	0	0
973faf87-b19c-4e31-89d8-e342bcb5aa1a	chess	500.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 11:49:12.287	\N	2026-01-18 11:49:12.288006	2026-01-18 11:49:12.288006	usd	\N	\N	2	1	0	0
29644461-62cd-4a61-b670-a9b25bb07402	chess	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 11:49:37.286	\N	2026-01-18 11:49:37.287795	2026-01-18 11:49:37.287795	usd	\N	\N	2	1	0	0
7e95512e-4d04-4ad7-b911-88231c3e13ac	domino	5.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 11:50:13.523	\N	2026-01-18 11:50:13.524973	2026-01-18 11:50:13.524973	usd	\N	\N	2	1	0	0
02d583e7-7174-4100-b236-44bc9b4f0d5b	domino	25.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 11:50:29.56	\N	2026-01-18 11:50:29.56206	2026-01-18 11:50:29.56206	usd	\N	\N	2	1	0	0
050efd89-7abb-4428-a2d7-1e813159642d	domino	25.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 11:50:46.145	\N	2026-01-18 11:50:46.146069	2026-01-18 11:50:46.146069	usd	\N	\N	2	1	0	0
546d395e-8acd-470b-a55e-f29f433bbbde	backgammon	100.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 11:50:57.187	\N	2026-01-18 11:50:57.187775	2026-01-18 11:50:57.187775	usd	\N	\N	2	1	0	0
e97af2ff-409b-4656-850a-7f9ed880944c	chess	5.00000000	public	completed	4c22629a-ae59-4cc3-828e-8bfeb868dfba	2e7732d2-a184-411e-a433-e4fded1ade6f	2e7732d2-a184-411e-a433-e4fded1ade6f	random	\N	600	0	0	2026-01-18 11:49:50.706	2026-01-18 12:00:21.817	2026-01-18 11:49:50.708109	2026-01-18 12:00:21.817	usd	\N	\N	2	1	0	0
be3de070-a961-4b97-b0b2-89d96e6f3631	domino	10.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-18 12:00:27.061	\N	2026-01-18 12:00:27.062146	2026-01-18 12:00:27.062146	usd	\N	\N	2	1	0	0
18791b9b-555e-4f15-8798-856c0cf09183	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-18 12:09:12.633	\N	2026-01-18 12:09:12.634982	2026-01-18 12:09:12.634982	usd	\N	\N	2	1	0	0
c964749f-c63d-4686-90c5-f80dfcdcc1e3	backgammon	10.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 12:09:37.277	\N	2026-01-18 12:09:37.279771	2026-01-18 12:09:37.279771	usd	\N	\N	2	1	0	0
eaf83a3d-1efe-4277-8502-efb8998a9ba1	chess	250.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 12:09:56.021	\N	2026-01-18 12:09:56.023873	2026-01-18 12:09:56.023873	usd	\N	\N	2	1	0	0
83da1b31-5816-4f23-9164-8a3dd5de8291	chess	25.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 12:10:22.122	\N	2026-01-18 12:10:22.123257	2026-01-18 12:10:22.123257	usd	\N	\N	2	1	0	0
24586312-3339-439b-a2e1-a6431da9cd44	domino	25.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 12:10:42.021	\N	2026-01-18 12:10:42.022924	2026-01-18 12:10:42.022924	usd	\N	\N	2	1	0	0
36216bf4-3f55-4a5b-8075-392b0727e937	domino	1000.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 12:11:02.6	\N	2026-01-18 12:11:02.602179	2026-01-18 12:11:02.602179	usd	\N	\N	2	1	0	0
353ec0f1-50da-47f2-8c80-d434f1705c15	domino	100.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 12:11:27.724	\N	2026-01-18 12:11:27.725583	2026-01-18 12:11:27.725583	usd	\N	\N	2	1	0	0
a88cd74b-dc49-4d9a-acc8-cf3d8606368e	chess	100.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 12:11:46.918	\N	2026-01-18 12:11:46.920681	2026-01-18 12:11:46.920681	usd	\N	\N	2	1	0	0
5d7ae71b-4693-4ca5-9f5d-ebecdc521936	backgammon	5.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 12:12:04.73	\N	2026-01-18 12:12:04.732024	2026-01-18 12:12:04.732024	usd	\N	\N	2	1	0	0
738447d7-d8ee-447f-a489-d835b7d4b3dc	domino	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 12:12:16.768	\N	2026-01-18 12:12:16.769869	2026-01-18 12:12:16.769869	usd	\N	\N	2	1	0	0
a84b989f-e996-49a1-ade0-f03bccfb5f9e	chess	1000.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-18 12:12:35.526	\N	2026-01-18 12:12:35.527382	2026-01-18 12:12:35.527382	usd	\N	\N	2	1	0	0
7a66c4a6-a336-48c3-bbe4-fd7819fec481	chess	5.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:12:46.098	\N	2026-01-18 12:12:46.099377	2026-01-18 12:12:46.099377	usd	\N	\N	2	1	0	0
17199219-8a5c-4869-9305-44b95292c55f	backgammon	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 12:13:03.717	\N	2026-01-18 12:13:03.720692	2026-01-18 12:13:03.720692	usd	\N	\N	2	1	0	0
05cb6593-0a5d-43f4-acdf-fa80bc425a16	backgammon	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 12:13:27.664	\N	2026-01-18 12:13:27.666119	2026-01-18 12:13:27.666119	usd	\N	\N	2	1	0	0
fe40af25-bfb4-448c-87a1-a7b63beabc12	backgammon	50.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 12:13:43.422	\N	2026-01-18 12:13:43.423815	2026-01-18 12:13:43.423815	usd	\N	\N	2	1	0	0
6e16211f-de52-4c40-ae15-75c1d9e18ed7	domino	50.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 12:14:02.284	\N	2026-01-18 12:14:02.28552	2026-01-18 12:14:02.28552	usd	\N	\N	2	1	0	0
a4ff48a8-5716-4505-a250-3dbeb8589ade	domino	250.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 12:14:11.957	\N	2026-01-18 12:14:11.958609	2026-01-18 12:14:11.958609	usd	\N	\N	2	1	0	0
49932148-6fec-45be-8fc3-4f5831ecdce7	domino	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 12:14:40.662	\N	2026-01-18 12:14:40.663924	2026-01-18 12:14:40.663924	usd	\N	\N	2	1	0	0
12f4c7fa-8c7f-4c90-b08b-fa8bbbc9287a	domino	1000.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:15:09.878	\N	2026-01-18 12:15:09.880298	2026-01-18 12:15:09.880298	usd	\N	\N	2	1	0	0
a839c57d-bf5d-4249-940d-3291f2c2585e	chess	25.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 12:15:24.51	\N	2026-01-18 12:15:24.511997	2026-01-18 12:15:24.511997	usd	\N	\N	2	1	0	0
1ef8b513-18ae-40ed-ae65-a69433c9fca2	chess	100.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 12:15:35.784	\N	2026-01-18 12:15:35.785644	2026-01-18 12:15:35.785644	usd	\N	\N	2	1	0	0
952c0905-3add-48e4-a90f-20a32655cfb7	domino	25.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 12:15:46.069	\N	2026-01-18 12:15:46.070398	2026-01-18 12:15:46.070398	usd	\N	\N	2	1	0	0
e5bb8e6f-d85a-4937-a058-94e235f31482	backgammon	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 12:16:03.423	\N	2026-01-18 12:16:03.42722	2026-01-18 12:16:03.42722	usd	\N	\N	2	1	0	0
e1a5cfcd-4ffe-4fc8-9d70-febe4f426948	backgammon	25.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 12:16:18.968	\N	2026-01-18 12:16:18.969393	2026-01-18 12:16:18.969393	usd	\N	\N	2	1	0	0
5dfd2ec4-e8f0-44f1-adbf-4c4985fd1be1	backgammon	1000.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 12:16:30.77	\N	2026-01-18 12:16:30.771006	2026-01-18 12:16:30.771006	usd	\N	\N	2	1	0	0
7d9518e8-2f84-4c19-aae1-156becdac1a1	chess	25.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 12:18:12.518	\N	2026-01-18 12:18:12.521622	2026-01-18 12:18:12.521622	usd	\N	\N	2	1	0	0
54163d9a-1c2d-4525-9185-65d191bc67d9	chess	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 12:18:38.516	\N	2026-01-18 12:18:38.517257	2026-01-18 12:18:38.517257	usd	\N	\N	2	1	0	0
28f308a5-36ec-4c0a-8065-c97ce970cec5	backgammon	5.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 12:18:49.689	\N	2026-01-18 12:18:49.691082	2026-01-18 12:18:49.691082	usd	\N	\N	2	1	0	0
e5d7828f-3e5b-4f7e-8cf7-531d64da0410	domino	50.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 12:19:05.54	\N	2026-01-18 12:19:05.54162	2026-01-18 12:19:05.54162	usd	\N	\N	2	1	0	0
52ea6f5a-dc29-4f40-9fea-79ea7899c191	backgammon	50.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:19:20.025	\N	2026-01-18 12:19:20.027208	2026-01-18 12:19:20.027208	usd	\N	\N	2	1	0	0
28c3b9ac-287c-4dd7-ac3b-f97b57fa3415	domino	250.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 12:19:38.343	\N	2026-01-18 12:19:38.344271	2026-01-18 12:19:38.344271	usd	\N	\N	2	1	0	0
91705767-2444-41cd-8501-e8c0df77deaa	domino	25.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 12:20:00.446	\N	2026-01-18 12:20:00.448226	2026-01-18 12:20:00.448226	usd	\N	\N	2	1	0	0
c31c4310-ed5a-48c9-b3a6-0301d6cd1732	domino	50.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 12:20:26.572	\N	2026-01-18 12:20:26.573517	2026-01-18 12:20:26.573517	usd	\N	\N	2	1	0	0
d686ddad-515c-4fe3-95a1-01bd12ba87be	backgammon	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 12:20:46.342	\N	2026-01-18 12:20:46.343327	2026-01-18 12:20:46.343327	usd	\N	\N	2	1	0	0
576ee0ae-0db0-48ed-9f07-d46e53bd7aa7	domino	100.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 12:21:16.066	\N	2026-01-18 12:21:16.067086	2026-01-18 12:21:16.067086	usd	\N	\N	2	1	0	0
1eb70755-9a06-4bc6-bbef-4d6814c4aac1	domino	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-18 12:21:39.007	\N	2026-01-18 12:21:39.008561	2026-01-18 12:21:39.008561	usd	\N	\N	2	1	0	0
147f46af-ad6b-410b-bfa2-23c9b3b6ae15	chess	250.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-18 12:32:05.829	\N	2026-01-18 12:32:05.831067	2026-01-18 12:32:05.831067	usd	\N	\N	2	1	0	0
ddd96853-4fe7-4838-b3ba-4021fbc1ec1d	backgammon	100.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 12:32:18.352	\N	2026-01-18 12:32:18.353589	2026-01-18 12:32:18.353589	usd	\N	\N	2	1	0	0
91f6606f-60b0-4096-a536-935508fe6d42	backgammon	5.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 12:32:42.092	\N	2026-01-18 12:32:42.093233	2026-01-18 12:32:42.093233	usd	\N	\N	2	1	0	0
c4c016be-695b-4d16-b334-699f7c87e43b	domino	25.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 12:33:01.21	\N	2026-01-18 12:33:01.212666	2026-01-18 12:33:01.212666	usd	\N	\N	2	1	0	0
5badb7b6-1a1a-4fa1-a45a-762df614dd10	backgammon	5.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-18 12:33:24.209	\N	2026-01-18 12:33:24.211045	2026-01-18 12:33:24.211045	usd	\N	\N	2	1	0	0
a4cffbb2-9489-454a-a8a6-906cf012a7b8	domino	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 12:33:48.201	\N	2026-01-18 12:33:48.202178	2026-01-18 12:33:48.202178	usd	\N	\N	2	1	0	0
6bcd7d73-e816-4749-99d3-f8924d04a427	chess	500.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 12:34:16.453	\N	2026-01-18 12:34:16.454561	2026-01-18 12:34:16.454561	usd	\N	\N	2	1	0	0
1095a8a2-841b-44c3-9a7f-c648ae01c83b	chess	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 12:34:43.803	\N	2026-01-18 12:34:43.805164	2026-01-18 12:34:43.805164	usd	\N	\N	2	1	0	0
12544596-d610-4628-a2cd-3c69cf655ee7	domino	250.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 12:34:54.247	\N	2026-01-18 12:34:54.248883	2026-01-18 12:34:54.248883	usd	\N	\N	2	1	0	0
1d639211-2f78-4e61-935a-201ab8d8ec70	chess	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 12:35:24.892	\N	2026-01-18 12:35:24.894041	2026-01-18 12:35:24.894041	usd	\N	\N	2	1	0	0
50503656-b73c-4a90-b2a1-6e77fcd94372	chess	1000.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 12:35:42.815	\N	2026-01-18 12:35:42.816313	2026-01-18 12:35:42.816313	usd	\N	\N	2	1	0	0
dacf29e4-8f85-47ec-98f8-6b0ceb83ba02	backgammon	100.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 12:35:57.354	\N	2026-01-18 12:35:57.35612	2026-01-18 12:35:57.35612	usd	\N	\N	2	1	0	0
5a8e770d-c8b9-4486-b572-4dbb09072937	chess	500.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 12:36:23.6	\N	2026-01-18 12:36:23.601501	2026-01-18 12:36:23.601501	usd	\N	\N	2	1	0	0
8395a484-82ca-45b6-b491-24efcee12d5c	chess	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:36:38.187	\N	2026-01-18 12:36:38.189397	2026-01-18 12:36:38.189397	usd	\N	\N	2	1	0	0
2af51bc0-c4f4-410b-b23c-8300975204ad	chess	100.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 12:36:55.436	\N	2026-01-18 12:36:55.438097	2026-01-18 12:36:55.438097	usd	\N	\N	2	1	0	0
9a088ea3-1b66-4d4e-a826-ab7afb7f1498	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-18 12:37:06.695	\N	2026-01-18 12:37:06.698359	2026-01-18 12:37:06.698359	usd	\N	\N	2	1	0	0
5a613846-66c6-40f5-a54f-2d6f2d0db007	domino	25.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 12:37:34.788	\N	2026-01-18 12:37:34.790847	2026-01-18 12:37:34.790847	usd	\N	\N	2	1	0	0
d14fc6c5-52d4-488d-9bdf-fb8f65f12591	backgammon	10.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 12:38:00.076	\N	2026-01-18 12:38:00.078201	2026-01-18 12:38:00.078201	usd	\N	\N	2	1	0	0
b83b7263-ae97-4280-8a6f-6cd6cc7bc3f3	backgammon	10.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 12:38:21.414	\N	2026-01-18 12:38:21.416377	2026-01-18 12:38:21.416377	usd	\N	\N	2	1	0	0
ba807a20-f004-468c-9044-2e7c527c4a8d	domino	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:38:34.386	\N	2026-01-18 12:38:34.387708	2026-01-18 12:38:34.387708	usd	\N	\N	2	1	0	0
3288a63c-8250-4c7c-922a-0a4688ce734c	domino	5.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 12:38:49.468	\N	2026-01-18 12:38:49.47041	2026-01-18 12:38:49.47041	usd	\N	\N	2	1	0	0
c624af58-7d55-4f3d-9476-f7014350d4c0	domino	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:44:50.864	\N	2026-01-18 12:44:50.866002	2026-01-18 12:44:50.866002	usd	\N	\N	2	1	0	0
1805d6a7-495a-4b79-a534-2ab6e872fdfe	backgammon	50.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-18 12:45:09.785	\N	2026-01-18 12:45:09.787122	2026-01-18 12:45:09.787122	usd	\N	\N	2	1	0	0
3b18cf6a-3e4a-487a-98ac-ce4932a28a1a	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:45:32.981	\N	2026-01-18 12:45:32.983349	2026-01-18 12:45:32.983349	usd	\N	\N	2	1	0	0
3d1ddd7b-734a-40eb-a631-9c052b0e94a0	domino	10.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 12:45:58.854	\N	2026-01-18 12:45:58.855958	2026-01-18 12:45:58.855958	usd	\N	\N	2	1	0	0
d6b1b311-e371-46d8-acd4-4fd7b5162b86	chess	5.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:46:20.025	\N	2026-01-18 12:46:20.02758	2026-01-18 12:46:20.02758	usd	\N	\N	2	1	0	0
8f37d4f3-e893-4072-ae47-1dc06dc9b7ee	chess	10.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 12:46:48.829	\N	2026-01-18 12:46:48.830195	2026-01-18 12:46:48.830195	usd	\N	\N	2	1	0	0
5922e99e-298d-45a9-9e67-0c285b620952	domino	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 12:47:18.396	\N	2026-01-18 12:47:18.399346	2026-01-18 12:47:18.399346	usd	\N	\N	2	1	0	0
abf5a2e1-5e38-4eff-b023-71462e6d8e0b	backgammon	10.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 12:47:40.808	\N	2026-01-18 12:47:40.813085	2026-01-18 12:47:40.813085	usd	\N	\N	2	1	0	0
15ac7cce-e82b-4a6e-9b3f-664463d61f8f	backgammon	500.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 12:47:59.967	\N	2026-01-18 12:47:59.968219	2026-01-18 12:47:59.968219	usd	\N	\N	2	1	0	0
bb251d34-4be5-4829-8eda-f5fa009ade62	chess	100.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 12:48:14.126	\N	2026-01-18 12:48:14.132009	2026-01-18 12:48:14.132009	usd	\N	\N	2	1	0	0
b854a53c-656a-464e-9fa2-4c4503b2c070	domino	10.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 12:48:31.952	\N	2026-01-18 12:48:31.954673	2026-01-18 12:48:31.954673	usd	\N	\N	2	1	0	0
5b0dd095-136e-4314-bfba-a6f17a125408	domino	25.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 12:48:57.305	\N	2026-01-18 12:48:57.306329	2026-01-18 12:48:57.306329	usd	\N	\N	2	1	0	0
5a44c485-0468-4e26-b569-f88343a7b2ea	backgammon	500.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-18 12:49:19.974	\N	2026-01-18 12:49:19.975008	2026-01-18 12:49:19.975008	usd	\N	\N	2	1	0	0
935e09db-252e-4971-bdf9-208b8ab078da	backgammon	10.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-18 12:49:41.293	\N	2026-01-18 12:49:41.295668	2026-01-18 12:49:41.295668	usd	\N	\N	2	1	0	0
c28430c9-ad16-404b-acdf-ce92ba41b9aa	backgammon	1000.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 12:50:04.428	\N	2026-01-18 12:50:04.431755	2026-01-18 12:50:04.431755	usd	\N	\N	2	1	0	0
0b11bfad-bdd4-4900-b4e2-d9a4d84fc4d3	domino	500.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-18 12:50:20.272	\N	2026-01-18 12:50:20.273764	2026-01-18 12:50:20.273764	usd	\N	\N	2	1	0	0
f819784f-54db-4428-893b-089772f4be1a	chess	500.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-18 12:50:33.995	\N	2026-01-18 12:50:33.996023	2026-01-18 12:50:33.996023	usd	\N	\N	2	1	0	0
0f9ccb2c-4d1c-40de-beef-f737371a58cd	backgammon	5.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 12:50:58.258	\N	2026-01-18 12:50:58.26058	2026-01-18 12:50:58.26058	usd	\N	\N	2	1	0	0
1999863d-725d-4ebc-b46d-d31a361de789	domino	50.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 12:52:36.779	\N	2026-01-18 12:52:36.780796	2026-01-18 12:52:36.780796	usd	\N	\N	2	1	0	0
741f342a-a3dc-48c5-9749-39ccc320fbc6	chess	5.00000000	public	completed	5955c883-e5a0-41eb-989a-0f118bdc9e9a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	5955c883-e5a0-41eb-989a-0f118bdc9e9a	random	\N	600	0	0	2026-01-18 12:52:15.194	2026-01-18 13:03:44.048	2026-01-18 12:52:15.195196	2026-01-18 13:03:44.048	usd	\N	\N	2	1	0	0
a8a82a70-9cd9-4433-a147-ebe120279052	domino	10.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-18 13:03:48.931	\N	2026-01-18 13:03:48.932276	2026-01-18 13:03:48.932276	usd	\N	\N	2	1	0	0
105da262-9a87-462e-bdaf-3306f6df39c3	backgammon	1000.00000000	public	completed	2151b666-646a-45f1-9c94-a097927ee87f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	2151b666-646a-45f1-9c94-a097927ee87f	random	\N	600	0	0	2026-01-18 12:51:17.654	2026-01-18 13:08:43.45	2026-01-18 12:51:17.657298	2026-01-18 13:08:43.45	usd	\N	\N	2	1	0	0
91280f01-eda7-4d8f-bf61-caf2b783e5a4	backgammon	1000.00000000	public	completed	a955ff28-c8c8-45cb-aafa-ea60c086139f	3f7d7f25-80fd-4402-a898-dee310faf409	a955ff28-c8c8-45cb-aafa-ea60c086139f	random	\N	600	0	0	2026-01-18 12:51:59.27	2026-01-18 13:09:03.107	2026-01-18 12:51:59.271409	2026-01-18 13:09:03.107	usd	\N	\N	2	1	0	0
3035389f-e002-45d2-a106-f9cde4035ad9	backgammon	1000.00000000	public	completed	978946cb-9458-451c-9a4f-2f908966ec3a	b154aeba-0034-4e32-9643-49e1d094fe67	978946cb-9458-451c-9a4f-2f908966ec3a	random	\N	600	0	0	2026-01-18 12:51:38.007	2026-01-18 13:09:33.296	2026-01-18 12:51:38.008626	2026-01-18 13:09:33.296	usd	\N	\N	2	1	0	0
86f6274f-5f6b-4098-9258-3dbc01c7c5a6	domino	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 13:09:47.232	\N	2026-01-18 13:09:47.233359	2026-01-18 13:09:47.233359	usd	\N	\N	2	1	0	0
58bec305-eea3-44df-9959-5f6b61fc72ec	chess	10.00000000	public	completed	e87885fb-aa52-49e2-92e9-9ad265fca46c	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	random	\N	600	0	0	2026-01-18 13:08:57.56	2026-01-18 13:19:26.957	2026-01-18 13:08:57.561649	2026-01-18 13:19:26.957	usd	\N	\N	2	1	0	0
284329f6-d3e1-4335-b170-5bf3e5e311f1	chess	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 13:19:27.668	\N	2026-01-18 13:19:27.669956	2026-01-18 13:19:27.669956	usd	\N	\N	2	1	0	0
0bd63ab9-2482-4f2b-b3d0-6455ba05b75e	chess	25.00000000	public	completed	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	3f7d7f25-80fd-4402-a898-dee310faf409	3f7d7f25-80fd-4402-a898-dee310faf409	random	\N	600	0	0	2026-01-18 13:09:17.942	2026-01-18 13:20:20.98	2026-01-18 13:09:17.943284	2026-01-18 13:20:20.98	usd	\N	\N	2	1	0	0
2f0a40c6-31a0-4f95-9726-060b6c80f213	backgammon	5.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 13:20:26.283	\N	2026-01-18 13:20:26.284367	2026-01-18 13:20:26.284367	usd	\N	\N	2	1	0	0
0dbeaa4f-4dc1-4e89-a53c-ab4ca13fd13d	domino	5.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 13:31:55.249	\N	2026-01-18 13:31:55.25177	2026-01-18 13:31:55.25177	usd	\N	\N	2	1	0	0
cef33efd-e380-4e27-99ba-41fb51cb758c	chess	250.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 13:32:18.628	\N	2026-01-18 13:32:18.629801	2026-01-18 13:32:18.629801	usd	\N	\N	2	1	0	0
5e765440-0eb6-4e87-8117-549e2feba238	backgammon	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 13:32:36.42	\N	2026-01-18 13:32:36.423706	2026-01-18 13:32:36.423706	usd	\N	\N	2	1	0	0
02d98b31-8893-41ad-bbc1-73bd9143cca4	chess	50.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 13:32:53.192	\N	2026-01-18 13:32:53.194172	2026-01-18 13:32:53.194172	usd	\N	\N	2	1	0	0
6b422512-d8e6-496a-899c-a65ea47ae3cb	domino	50.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 13:33:14.578	\N	2026-01-18 13:33:14.579724	2026-01-18 13:33:14.579724	usd	\N	\N	2	1	0	0
67331075-323b-4b8a-b8e6-69770d445f88	chess	50.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 13:34:28.994	\N	2026-01-18 13:34:28.99704	2026-01-18 13:34:28.99704	usd	\N	\N	2	1	0	0
51bbe402-2896-436d-8076-66288932e5bf	domino	1000.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-18 13:34:57.905	\N	2026-01-18 13:34:57.911949	2026-01-18 13:34:57.911949	usd	\N	\N	2	1	0	0
babb51e0-65a8-4b6b-9e7c-2bf5ae840082	chess	25.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 13:35:19.334	\N	2026-01-18 13:35:19.33594	2026-01-18 13:35:19.33594	usd	\N	\N	2	1	0	0
ff9bd41e-32fb-44be-a6e3-d311e84ac868	domino	5.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 13:35:34.617	\N	2026-01-18 13:35:34.617992	2026-01-18 13:35:34.617992	usd	\N	\N	2	1	0	0
7c9454a7-e884-4db2-8f9e-cd92a2847474	backgammon	100.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 13:35:59.199	\N	2026-01-18 13:35:59.200927	2026-01-18 13:35:59.200927	usd	\N	\N	2	1	0	0
d32f1399-44b7-4cba-ab0d-fcebf50ccb72	domino	5.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 13:37:47.907	\N	2026-01-18 13:37:47.90881	2026-01-18 13:37:47.90881	usd	\N	\N	2	1	0	0
eda7e0f7-9150-4048-a83e-76c3d5a413c4	backgammon	25.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 13:38:11.746	\N	2026-01-18 13:38:11.747859	2026-01-18 13:38:11.747859	usd	\N	\N	2	1	0	0
b4baba38-4c36-46ca-8726-4be2c3f999bf	domino	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 13:38:31.11	\N	2026-01-18 13:38:31.111798	2026-01-18 13:38:31.111798	usd	\N	\N	2	1	0	0
41f01d62-ce5f-4559-9a83-a57c1dac5f1c	chess	500.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 13:38:48.78	\N	2026-01-18 13:38:48.78133	2026-01-18 13:38:48.78133	usd	\N	\N	2	1	0	0
6e117b21-48b4-4390-885c-b628d1456f5d	domino	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 13:39:17.169	\N	2026-01-18 13:39:17.170453	2026-01-18 13:39:17.170453	usd	\N	\N	2	1	0	0
0a6c4d82-2263-4cc5-b193-cbb859d407fd	backgammon	10.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 13:42:29.105	\N	2026-01-18 13:42:29.106762	2026-01-18 13:42:29.106762	usd	\N	\N	2	1	0	0
328503df-7757-4cff-aab9-46027903b817	domino	10.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 13:42:47.464	\N	2026-01-18 13:42:47.467784	2026-01-18 13:42:47.467784	usd	\N	\N	2	1	0	0
c5aad026-8dad-40d9-9d68-ec5b5408839f	backgammon	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 13:43:10.121	\N	2026-01-18 13:43:10.122185	2026-01-18 13:43:10.122185	usd	\N	\N	2	1	0	0
686aadf2-e1e4-4ddc-ad88-bb64465d8228	chess	1000.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 13:43:35.864	\N	2026-01-18 13:43:35.865924	2026-01-18 13:43:35.865924	usd	\N	\N	2	1	0	0
09430799-fc72-4702-b6ab-4c76e62c0259	domino	5.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 13:43:54.773	\N	2026-01-18 13:43:54.773982	2026-01-18 13:43:54.773982	usd	\N	\N	2	1	0	0
64667435-f664-4320-be3d-b2a54af049b9	backgammon	500.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 13:51:17.293	\N	2026-01-18 13:51:17.294266	2026-01-18 13:51:17.294266	usd	\N	\N	2	1	0	0
3e376632-5464-477b-95ac-a2e1af1445df	domino	100.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 13:51:34.819	\N	2026-01-18 13:51:34.821178	2026-01-18 13:51:34.821178	usd	\N	\N	2	1	0	0
1d3c37b1-3c65-4428-8c51-0b62877fdf21	backgammon	5.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 13:52:01.628	\N	2026-01-18 13:52:01.630232	2026-01-18 13:52:01.630232	usd	\N	\N	2	1	0	0
6fc1287f-11f2-496a-a1cc-2b367761835f	domino	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 13:52:19.898	\N	2026-01-18 13:52:19.899599	2026-01-18 13:52:19.899599	usd	\N	\N	2	1	0	0
a3c01ecd-fe6b-4817-a38e-de54d6cf9bce	chess	500.00000000	public	completed	5955c883-e5a0-41eb-989a-0f118bdc9e9a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 13:50:49.888	2026-01-18 14:18:31.565	2026-01-18 13:50:49.889364	2026-01-18 14:18:31.565	usd	\N	\N	2	1	0	0
b7ddb3b0-6074-4499-be04-edbe97692822	backgammon	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 14:18:40.627	\N	2026-01-18 14:18:40.629285	2026-01-18 14:18:40.629285	usd	\N	\N	2	1	0	0
a7eb2a62-da23-4387-af2e-3c01536166e1	backgammon	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 14:25:01.48	\N	2026-01-18 14:25:01.482953	2026-01-18 14:25:01.482953	usd	\N	\N	2	1	0	0
d13af369-a395-43f1-8b43-7d158208d261	chess	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-18 14:25:32.204	\N	2026-01-18 14:25:32.206025	2026-01-18 14:25:32.206025	usd	\N	\N	2	1	0	0
6cdff908-9602-4bfe-b46f-2b9b534edc8d	backgammon	500.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 14:25:58.53	\N	2026-01-18 14:25:58.532075	2026-01-18 14:25:58.532075	usd	\N	\N	2	1	0	0
a08fbbdf-d023-4256-9644-ff54a800827f	chess	250.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 14:26:16.843	\N	2026-01-18 14:26:16.845374	2026-01-18 14:26:16.845374	usd	\N	\N	2	1	0	0
6ac965b6-4b4c-4b8d-85ad-044002384b4c	backgammon	500.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 14:26:46.223	\N	2026-01-18 14:26:46.225034	2026-01-18 14:26:46.225034	usd	\N	\N	2	1	0	0
b36bf01e-2a62-46e3-8f6f-4bcdd2ab5ef0	chess	100.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 14:27:09.542	\N	2026-01-18 14:27:09.545315	2026-01-18 14:27:09.545315	usd	\N	\N	2	1	0	0
04ea4cfa-036b-465e-83c5-4ae534a4674b	domino	1000.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 14:27:34.109	\N	2026-01-18 14:27:34.110492	2026-01-18 14:27:34.110492	usd	\N	\N	2	1	0	0
1d8a0d50-4aaf-40df-967e-a367b489552a	backgammon	100.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 14:29:50.927	\N	2026-01-18 14:29:50.929971	2026-01-18 14:29:50.929971	usd	\N	\N	2	1	0	0
9e9c04db-b0c0-48d0-baa5-1df3ec0674dd	backgammon	1000.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 14:30:12.607	\N	2026-01-18 14:30:12.608546	2026-01-18 14:30:12.608546	usd	\N	\N	2	1	0	0
1ecc2d9d-e178-4c51-bfbb-900e73799572	chess	50.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 14:30:31.139	\N	2026-01-18 14:30:31.14095	2026-01-18 14:30:31.14095	usd	\N	\N	2	1	0	0
1a567ee6-ad0f-456a-9efa-aec41d8c1ff1	domino	50.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 14:30:51.769	\N	2026-01-18 14:30:51.770234	2026-01-18 14:30:51.770234	usd	\N	\N	2	1	0	0
0abb55f3-24ca-4012-bba7-c65b306f8e0a	backgammon	50.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 14:31:15.316	\N	2026-01-18 14:31:15.317535	2026-01-18 14:31:15.317535	usd	\N	\N	2	1	0	0
cf85beb2-c0db-4489-8ace-9bf50c7bb373	chess	50.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 14:31:43.953	\N	2026-01-18 14:31:43.953991	2026-01-18 14:31:43.953991	usd	\N	\N	2	1	0	0
b4334ce2-7b13-4ef3-8d5d-e323d18ac6ad	chess	25.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 14:42:24.962	\N	2026-01-18 14:42:24.963894	2026-01-18 14:42:24.963894	usd	\N	\N	2	1	0	0
882bc3d4-970e-45b5-97dc-62db4dd67ea8	backgammon	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 14:42:41.926	\N	2026-01-18 14:42:41.92781	2026-01-18 14:42:41.92781	usd	\N	\N	2	1	0	0
6c86d592-8d34-4fcb-bfab-293b35994657	chess	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 14:43:04.364	\N	2026-01-18 14:43:04.365319	2026-01-18 14:43:04.365319	usd	\N	\N	2	1	0	0
2045ac5c-03aa-45c3-9515-3d5c84fddcf8	domino	250.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 14:43:30.422	\N	2026-01-18 14:43:30.423434	2026-01-18 14:43:30.423434	usd	\N	\N	2	1	0	0
8a4890bc-eb1a-402c-89b1-0380a8f4d138	domino	50.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 14:43:42.03	\N	2026-01-18 14:43:42.031798	2026-01-18 14:43:42.031798	usd	\N	\N	2	1	0	0
a11ff0d3-b83d-4087-bec0-13b070906246	chess	500.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-18 14:44:00.882	\N	2026-01-18 14:44:00.884507	2026-01-18 14:44:00.884507	usd	\N	\N	2	1	0	0
d9562d2f-9d83-4ef0-a353-0140592bd92b	backgammon	25.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 14:44:17.733	\N	2026-01-18 14:44:17.735208	2026-01-18 14:44:17.735208	usd	\N	\N	2	1	0	0
07dd9418-7d23-4e15-b7a2-47b53489d657	domino	250.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 14:44:43.498	\N	2026-01-18 14:44:43.49974	2026-01-18 14:44:43.49974	usd	\N	\N	2	1	0	0
c0bc65ab-79a8-4119-9df3-1617f6b23872	domino	10.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 14:45:08.343	\N	2026-01-18 14:45:08.344473	2026-01-18 14:45:08.344473	usd	\N	\N	2	1	0	0
1c22c685-e632-4d2d-8c31-da03545702d7	chess	100.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 14:45:35.895	\N	2026-01-18 14:45:35.897853	2026-01-18 14:45:35.897853	usd	\N	\N	2	1	0	0
bfdc4e7a-84e7-4aa0-aeb4-47cb0d15daa8	domino	250.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 14:46:00.848	\N	2026-01-18 14:46:00.849879	2026-01-18 14:46:00.849879	usd	\N	\N	2	1	0	0
9acb1977-c78c-4de3-9aa4-905f6d6e2eab	backgammon	25.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-18 14:46:19.645	\N	2026-01-18 14:46:19.650664	2026-01-18 14:46:19.650664	usd	\N	\N	2	1	0	0
726bb948-134a-47eb-9796-f50c29d5c819	domino	10.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 14:46:34.691	\N	2026-01-18 14:46:34.69264	2026-01-18 14:46:34.69264	usd	\N	\N	2	1	0	0
90181645-3540-4217-9a92-7b4e86716c2d	domino	250.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 14:51:08.497	\N	2026-01-18 14:51:08.498456	2026-01-18 14:51:08.498456	usd	\N	\N	2	1	0	0
15e96e16-1e41-4af3-916c-20a927aa1606	chess	500.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 14:51:25.497	\N	2026-01-18 14:51:25.500809	2026-01-18 14:51:25.500809	usd	\N	\N	2	1	0	0
e83f800b-0978-487e-aa64-a57d2d43c15d	domino	10.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 14:51:49.329	\N	2026-01-18 14:51:49.330603	2026-01-18 14:51:49.330603	usd	\N	\N	2	1	0	0
e2c6d545-9826-445e-a9a4-6df544deab1b	backgammon	50.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 14:52:13.905	\N	2026-01-18 14:52:13.906219	2026-01-18 14:52:13.906219	usd	\N	\N	2	1	0	0
3286aaa6-374c-48b0-b6f1-01206a7dc43e	domino	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 14:52:42.216	\N	2026-01-18 14:52:42.217847	2026-01-18 14:52:42.217847	usd	\N	\N	2	1	0	0
689d6595-bfea-41c6-a3e9-ae939b42e8c1	domino	5.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 14:52:58.406	\N	2026-01-18 14:52:58.40806	2026-01-18 14:52:58.40806	usd	\N	\N	2	1	0	0
49252739-b770-4ea2-b32d-2f3e0879b427	backgammon	5.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 14:53:24.707	\N	2026-01-18 14:53:24.710001	2026-01-18 14:53:24.710001	usd	\N	\N	2	1	0	0
9992ffd0-b653-4f07-bc33-2e0bfe104f12	chess	25.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-18 14:53:42.786	\N	2026-01-18 14:53:42.787256	2026-01-18 14:53:42.787256	usd	\N	\N	2	1	0	0
7b1ff82a-9ef1-45d2-8cfc-5da8c86a86d3	domino	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-18 14:54:02.498	\N	2026-01-18 14:54:02.500111	2026-01-18 14:54:02.500111	usd	\N	\N	2	1	0	0
4041bcc8-57ca-4547-976d-9a120e1b16a8	backgammon	100.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 14:54:19.162	\N	2026-01-18 14:54:19.164662	2026-01-18 14:54:19.164662	usd	\N	\N	2	1	0	0
41737f5e-80dc-4067-86d9-5e1c8496fd3f	chess	250.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 14:54:34.83	\N	2026-01-18 14:54:34.832101	2026-01-18 14:54:34.832101	usd	\N	\N	2	1	0	0
797acf4e-1c74-4af8-aaff-16a4b73508f2	domino	100.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 14:55:02.976	\N	2026-01-18 14:55:02.981526	2026-01-18 14:55:02.981526	usd	\N	\N	2	1	0	0
7c7f4152-bafc-4258-9c17-6bbee594cb36	backgammon	10.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 14:55:19.18	\N	2026-01-18 14:55:19.181792	2026-01-18 14:55:19.181792	usd	\N	\N	2	1	0	0
003ed71f-daa1-4ba6-b076-9b1b7ba6450c	backgammon	50.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 14:56:54.386	\N	2026-01-18 14:56:54.38724	2026-01-18 14:56:54.38724	usd	\N	\N	2	1	0	0
22b5cb82-76e6-4186-bf1b-9527bd912eb2	domino	250.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 14:57:23.88	\N	2026-01-18 14:57:23.882163	2026-01-18 14:57:23.882163	usd	\N	\N	2	1	0	0
535be523-a13f-4d6b-aebc-247889e6a5b3	chess	250.00000000	public	completed	978946cb-9458-451c-9a4f-2f908966ec3a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 14:56:35.047	2026-01-18 15:10:02.228	2026-01-18 14:56:35.048938	2026-01-18 15:10:02.228	usd	\N	\N	2	1	0	0
8d64207c-0fc9-44f0-ade1-b767621507e9	domino	1000.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 14:58:00.594	\N	2026-01-18 14:58:00.595405	2026-01-18 14:58:00.595405	usd	\N	\N	2	1	0	0
861a8d1a-ae00-4574-b5f3-402f8359b313	chess	5.00000000	public	completed	bab291d9-b2d0-4d10-b0aa-a803febba3e3	4c22629a-ae59-4cc3-828e-8bfeb868dfba	4c22629a-ae59-4cc3-828e-8bfeb868dfba	random	\N	600	0	0	2026-01-18 14:57:43.428	2026-01-18 15:09:01.363	2026-01-18 14:57:43.429752	2026-01-18 15:09:01.363	usd	\N	\N	2	1	0	0
e41c025d-7872-418b-b53d-019ceb097faf	chess	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 15:09:24.676	\N	2026-01-18 15:09:24.677928	2026-01-18 15:09:24.677928	usd	\N	\N	2	1	0	0
c06e27e3-6c30-433f-90a4-3dbafa85d6eb	backgammon	500.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-18 15:10:15.902	\N	2026-01-18 15:10:15.903667	2026-01-18 15:10:15.903667	usd	\N	\N	2	1	0	0
f89c33eb-3734-4a36-bb83-476328582890	backgammon	250.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 22:04:52.47	\N	2026-01-18 22:04:52.472545	2026-01-18 22:04:52.472545	usd	\N	\N	2	1	0	0
ec6f519a-ce7f-4880-8dbf-467750a687bb	backgammon	10.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 22:05:41.315	\N	2026-01-18 22:05:41.316606	2026-01-18 22:05:41.316606	usd	\N	\N	2	1	0	0
992da3c2-f736-40e0-a31b-0c1fcb00a3fe	domino	500.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 22:06:11.021	\N	2026-01-18 22:06:11.022372	2026-01-18 22:06:11.022372	usd	\N	\N	2	1	0	0
8df43344-8d55-4c4f-ab81-54898b1f07fd	chess	500.00000000	public	completed	b154aeba-0034-4e32-9643-49e1d094fe67	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 22:05:21.25	2026-01-18 22:34:24.462	2026-01-18 22:05:21.25179	2026-01-18 22:34:24.462	usd	\N	\N	2	1	0	0
7df3283b-4aa8-4ea1-8557-487f3b496d1f	backgammon	25.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 22:34:35.593	\N	2026-01-18 22:34:35.59429	2026-01-18 22:34:35.59429	usd	\N	\N	2	1	0	0
9ae5d07f-8dab-402b-bb26-442f3c350d88	chess	10.00000000	public	completed	a955ff28-c8c8-45cb-aafa-ea60c086139f	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 22:06:37.263	2026-01-18 22:39:18.845	2026-01-18 22:06:37.263845	2026-01-18 22:39:18.845	usd	\N	\N	2	1	0	0
73dc0e39-bcc5-4a09-b8a7-85958ce6dc0c	domino	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 22:39:19.747	\N	2026-01-18 22:39:19.748328	2026-01-18 22:39:19.748328	usd	\N	\N	2	1	0	0
07e46acb-d0d5-4098-a6d7-bd0d6014ff1a	chess	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 23:28:08.814	\N	2026-01-18 23:28:08.81582	2026-01-18 23:28:08.81582	usd	\N	\N	2	1	0	0
2eb45ff0-3556-4600-83c9-fd274e5a829a	backgammon	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 23:28:34.119	\N	2026-01-18 23:28:34.12084	2026-01-18 23:28:34.12084	usd	\N	\N	2	1	0	0
87cacd05-9f7a-48a8-9852-e342d7b68ea6	domino	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 23:28:56.363	\N	2026-01-18 23:28:56.364757	2026-01-18 23:28:56.364757	usd	\N	\N	2	1	0	0
4c1ceb60-e33c-49b0-b18c-8d74e0b49bb5	domino	250.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-18 23:29:13.695	\N	2026-01-18 23:29:13.696371	2026-01-18 23:29:13.696371	usd	\N	\N	2	1	0	0
1c043414-9d91-4087-867f-16dc6138e57e	chess	5.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-18 23:29:38.615	\N	2026-01-18 23:29:38.616943	2026-01-18 23:29:38.616943	usd	\N	\N	2	1	0	0
562c67c8-db1d-4ec9-bdb1-4d8d8976c35f	backgammon	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 23:29:47.601	\N	2026-01-18 23:29:47.602951	2026-01-18 23:29:47.602951	usd	\N	\N	2	1	0	0
df5fd1b8-4869-4b4e-b6a2-a53c4633da7f	domino	250.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 23:30:15.492	\N	2026-01-18 23:30:15.493688	2026-01-18 23:30:15.493688	usd	\N	\N	2	1	0	0
ae38d15b-fb20-4eef-9f33-ffefefdf4b0d	backgammon	250.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-18 23:30:37.655	\N	2026-01-18 23:30:37.656909	2026-01-18 23:30:37.656909	usd	\N	\N	2	1	0	0
49a1d4da-7169-485a-b57a-93baa86357c8	backgammon	10.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 23:30:53.244	\N	2026-01-18 23:30:53.245835	2026-01-18 23:30:53.245835	usd	\N	\N	2	1	0	0
6c00d18a-c280-4cfe-86b1-28d72ca3af84	domino	10.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 23:31:12.371	\N	2026-01-18 23:31:12.372645	2026-01-18 23:31:12.372645	usd	\N	\N	2	1	0	0
f3cccee6-72a0-4009-99de-1c1c4ebc7256	chess	25.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 23:31:41.542	\N	2026-01-18 23:31:41.544702	2026-01-18 23:31:41.544702	usd	\N	\N	2	1	0	0
934d3be6-59c1-440c-9d10-b0a512cd86f4	backgammon	5.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-18 23:31:56.962	\N	2026-01-18 23:31:56.964682	2026-01-18 23:31:56.964682	usd	\N	\N	2	1	0	0
d888bd42-1077-4ad1-965a-697ec609ee73	domino	500.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-18 23:32:12.243	\N	2026-01-18 23:32:12.244371	2026-01-18 23:32:12.244371	usd	\N	\N	2	1	0	0
0d1e5669-641f-40c5-853c-d2c91a5e929d	backgammon	25.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 23:32:30.513	\N	2026-01-18 23:32:30.515065	2026-01-18 23:32:30.515065	usd	\N	\N	2	1	0	0
fe6e1606-0d27-4803-8380-9b836c36f9fc	chess	1000.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 23:32:45.825	\N	2026-01-18 23:32:45.827837	2026-01-18 23:32:45.827837	usd	\N	\N	2	1	0	0
6ebb4db8-dbe9-4360-8f7c-371db19b2acb	domino	250.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 23:33:14.202	\N	2026-01-18 23:33:14.203285	2026-01-18 23:33:14.203285	usd	\N	\N	2	1	0	0
5e4aad88-ccb2-4194-93b3-fb3e0a3a9462	domino	50.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 23:33:30.734	\N	2026-01-18 23:33:30.736075	2026-01-18 23:33:30.736075	usd	\N	\N	2	1	0	0
00b48ea1-3a77-47f3-b77e-4daaab5335f5	backgammon	50.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-18 23:33:58.767	\N	2026-01-18 23:33:58.770923	2026-01-18 23:33:58.770923	usd	\N	\N	2	1	0	0
fa6d91a1-1da6-48e6-8ce2-d387461d6717	domino	250.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 23:34:15.205	\N	2026-01-18 23:34:15.206849	2026-01-18 23:34:15.206849	usd	\N	\N	2	1	0	0
b426dae3-910c-4e5a-a96d-1d835bf4f532	chess	10.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 23:34:44.531	\N	2026-01-18 23:34:44.682117	2026-01-18 23:34:44.682117	usd	\N	\N	2	1	0	0
97e62214-0ee6-49f2-9d1a-7f8e3f41c581	domino	500.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 23:35:05.355	\N	2026-01-18 23:35:05.357278	2026-01-18 23:35:05.357278	usd	\N	\N	2	1	0	0
66c5d4ea-a7c7-488f-abfd-74cdc312ffe8	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 23:42:34.44	\N	2026-01-18 23:42:34.441884	2026-01-18 23:42:34.441884	usd	\N	\N	2	1	0	0
d1c35b63-bc2f-44e8-9ea4-d81df3eefdcf	backgammon	500.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-18 23:42:52.836	\N	2026-01-18 23:42:52.838025	2026-01-18 23:42:52.838025	usd	\N	\N	2	1	0	0
2d1b742f-c5cb-4cd0-a17c-49c9429bfb6b	chess	1000.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 23:43:10.653	\N	2026-01-18 23:43:10.655742	2026-01-18 23:43:10.655742	usd	\N	\N	2	1	0	0
918f103a-bf23-4365-83c4-2cad7919ee20	domino	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 23:43:38.943	\N	2026-01-18 23:43:38.945711	2026-01-18 23:43:38.945711	usd	\N	\N	2	1	0	0
167fb064-2785-41ba-8d41-459513843f74	backgammon	5.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 23:43:54.453	\N	2026-01-18 23:43:54.455255	2026-01-18 23:43:54.455255	usd	\N	\N	2	1	0	0
b073657b-6233-4407-a80e-e9242ae7c66a	chess	250.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 23:44:10.978	\N	2026-01-18 23:44:10.979514	2026-01-18 23:44:10.979514	usd	\N	\N	2	1	0	0
a8b9fb12-6ac6-4c07-a2d4-711bfeccdd30	domino	250.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 23:44:37.359	\N	2026-01-18 23:44:37.360656	2026-01-18 23:44:37.360656	usd	\N	\N	2	1	0	0
c69de558-6a9c-4896-b06e-35ad95a9d11e	backgammon	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-18 23:44:53.48	\N	2026-01-18 23:44:53.481353	2026-01-18 23:44:53.481353	usd	\N	\N	2	1	0	0
4ecf027b-0dbe-4bdd-9e4f-02b4ffb90420	chess	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-18 23:50:28.778	\N	2026-01-18 23:50:28.780512	2026-01-18 23:50:28.780512	usd	\N	\N	2	1	0	0
fc948a1c-f799-4342-8c21-c20572b0edc1	domino	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-18 23:50:43.054	\N	2026-01-18 23:50:43.056055	2026-01-18 23:50:43.056055	usd	\N	\N	2	1	0	0
26e3102e-6603-4f85-bdaf-8466539c0ddb	backgammon	1000.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-18 23:51:04.768	\N	2026-01-18 23:51:04.771337	2026-01-18 23:51:04.771337	usd	\N	\N	2	1	0	0
56873935-6778-44b4-bc4b-445bf14ab030	domino	500.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-18 23:51:24.561	\N	2026-01-18 23:51:24.562589	2026-01-18 23:51:24.562589	usd	\N	\N	2	1	0	0
7eb63701-8697-4ab9-a70c-ebe196e4637c	chess	250.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 23:51:44.399	\N	2026-01-18 23:51:44.40124	2026-01-18 23:51:44.40124	usd	\N	\N	2	1	0	0
fa5f1b3d-85a5-4135-b5a8-6dba2d0b9ca1	domino	250.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 23:52:08.25	\N	2026-01-18 23:52:08.254432	2026-01-18 23:52:08.254432	usd	\N	\N	2	1	0	0
c473830f-bcba-4887-ad95-317a04e05e1e	backgammon	1000.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 23:52:24.726	\N	2026-01-18 23:52:24.727418	2026-01-18 23:52:24.727418	usd	\N	\N	2	1	0	0
044e8ade-b918-4663-ad10-2560e9c22f5f	domino	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-18 23:52:40.715	\N	2026-01-18 23:52:40.716357	2026-01-18 23:52:40.716357	usd	\N	\N	2	1	0	0
f3edf48f-5020-4e9f-94ab-734508c25a72	backgammon	5.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 23:52:59.281	\N	2026-01-18 23:52:59.282357	2026-01-18 23:52:59.282357	usd	\N	\N	2	1	0	0
1f1f922d-bda8-4175-be8b-7958ce891d40	chess	25.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-18 23:53:23.26	\N	2026-01-18 23:53:23.261928	2026-01-18 23:53:23.261928	usd	\N	\N	2	1	0	0
2a3cc54a-208f-4168-b3b1-59786196bf8c	backgammon	500.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-18 23:53:43.95	\N	2026-01-18 23:53:43.951331	2026-01-18 23:53:43.951331	usd	\N	\N	2	1	0	0
70ae998f-b8d5-458c-841d-7fc48fe1f7a0	domino	250.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-18 23:54:06.927	\N	2026-01-18 23:54:06.9287	2026-01-18 23:54:06.9287	usd	\N	\N	2	1	0	0
6472eda4-2515-4d63-ae81-b5692ee31f8a	chess	250.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-18 23:54:35.498	\N	2026-01-18 23:54:35.50044	2026-01-18 23:54:35.50044	usd	\N	\N	2	1	0	0
78fb846f-8262-4a58-9fa2-abf27bf419f5	backgammon	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-18 23:54:48.656	\N	2026-01-18 23:54:48.657807	2026-01-18 23:54:48.657807	usd	\N	\N	2	1	0	0
4ee112f8-7d4c-44a3-982e-3754f835c958	domino	1000.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-18 23:55:16.157	\N	2026-01-18 23:55:16.158745	2026-01-18 23:55:16.158745	usd	\N	\N	2	1	0	0
8f6529e8-00c1-4b91-a593-3a7367516c63	backgammon	250.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 23:55:45.664	\N	2026-01-18 23:55:45.665329	2026-01-18 23:55:45.665329	usd	\N	\N	2	1	0	0
cf5d2d69-aaf8-4262-88cb-f58221fd02b8	domino	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-18 23:56:05.661	\N	2026-01-18 23:56:05.662171	2026-01-18 23:56:05.662171	usd	\N	\N	2	1	0	0
768c4bec-1ba3-4574-a8ff-582b43096d16	backgammon	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-18 23:56:31.894	\N	2026-01-18 23:56:31.895516	2026-01-18 23:56:31.895516	usd	\N	\N	2	1	0	0
6b55f0b1-b691-4156-9877-a4ddc487e3b6	backgammon	50.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 00:09:05.579	\N	2026-01-19 00:09:05.582369	2026-01-19 00:09:05.582369	usd	\N	\N	2	1	0	0
f9b7217a-6265-4451-b2db-dcafb12fce93	chess	100.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 00:09:26.019	\N	2026-01-19 00:09:26.021676	2026-01-19 00:09:26.021676	usd	\N	\N	2	1	0	0
63735fe8-3ede-44a5-8252-df24421fa733	backgammon	250.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 00:09:42.01	\N	2026-01-19 00:09:42.01246	2026-01-19 00:09:42.01246	usd	\N	\N	2	1	0	0
c05ba2dc-905d-490d-8ce7-7e6b644e7867	domino	25.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 00:10:01.63	\N	2026-01-19 00:10:01.634192	2026-01-19 00:10:01.634192	usd	\N	\N	2	1	0	0
48ee3076-1aaa-432d-b59c-33686cc2f9bb	backgammon	500.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 00:10:29.078	\N	2026-01-19 00:10:29.080839	2026-01-19 00:10:29.080839	usd	\N	\N	2	1	0	0
f5b4f003-2361-4185-8a08-504e5e6e37e2	chess	500.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 00:10:51.108	\N	2026-01-19 00:10:51.110444	2026-01-19 00:10:51.110444	usd	\N	\N	2	1	0	0
33aca4a8-4316-47a1-8ab1-a61326f583cb	domino	10.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 00:11:16.658	\N	2026-01-19 00:11:16.660025	2026-01-19 00:11:16.660025	usd	\N	\N	2	1	0	0
16f29896-44ff-443b-b659-a571dfb3c8b5	backgammon	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 00:11:45.387	\N	2026-01-19 00:11:45.388515	2026-01-19 00:11:45.388515	usd	\N	\N	2	1	0	0
0107e7eb-4d7d-429a-88cf-8f228d4cd0ce	backgammon	500.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 00:12:01.077	\N	2026-01-19 00:12:01.079664	2026-01-19 00:12:01.079664	usd	\N	\N	2	1	0	0
a09db845-c92c-4336-a80b-5dc5ff21a255	domino	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 00:12:19.188	\N	2026-01-19 00:12:19.189993	2026-01-19 00:12:19.189993	usd	\N	\N	2	1	0	0
d5352c54-f159-4ed1-bdc5-98e75466aef2	backgammon	1000.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 00:12:44.123	\N	2026-01-19 00:12:44.125367	2026-01-19 00:12:44.125367	usd	\N	\N	2	1	0	0
b0cb8419-3127-46df-acd0-510f650fb779	chess	250.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 00:13:07.569	\N	2026-01-19 00:13:07.571035	2026-01-19 00:13:07.571035	usd	\N	\N	2	1	0	0
88bf588a-9cca-4674-b443-244a54b1a018	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 00:13:35.905	\N	2026-01-19 00:13:35.906178	2026-01-19 00:13:35.906178	usd	\N	\N	2	1	0	0
dfb18e33-ee49-4319-b02b-c789250920cd	chess	5.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 00:15:10.493	\N	2026-01-19 00:15:10.494893	2026-01-19 00:15:10.494893	usd	\N	\N	2	1	0	0
1f15359a-5fda-49bf-9620-ea42ccf06969	domino	10.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 00:15:26.066	\N	2026-01-19 00:15:26.067378	2026-01-19 00:15:26.067378	usd	\N	\N	2	1	0	0
ad2b02eb-7c49-462f-ac42-31c061a61ed7	chess	25.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 00:15:54.881	\N	2026-01-19 00:15:54.883039	2026-01-19 00:15:54.883039	usd	\N	\N	2	1	0	0
37994236-862e-4acd-8a91-cb099c782260	backgammon	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 00:16:14.884	\N	2026-01-19 00:16:14.885466	2026-01-19 00:16:14.885466	usd	\N	\N	2	1	0	0
4aa9bc40-d2c3-485d-b86a-f12d9e36ae78	chess	50.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 00:16:33.57	\N	2026-01-19 00:16:33.571866	2026-01-19 00:16:33.571866	usd	\N	\N	2	1	0	0
052426ee-b6d6-4a44-80e2-795cb144a2d4	domino	50.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 00:29:06.839	\N	2026-01-19 00:29:06.840833	2026-01-19 00:29:06.840833	usd	\N	\N	2	1	0	0
66b9b8b2-9798-49f4-b3d1-4c77c97734a2	domino	1000.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 00:29:26.407	\N	2026-01-19 00:29:26.408695	2026-01-19 00:29:26.408695	usd	\N	\N	2	1	0	0
3573e59b-1c00-4f99-85b7-c07c02254349	chess	25.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 00:29:46.748	\N	2026-01-19 00:29:46.749891	2026-01-19 00:29:46.749891	usd	\N	\N	2	1	0	0
16919609-4f89-4cfa-9de8-9ab8cfd50cdc	domino	50.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 00:30:09.466	\N	2026-01-19 00:30:09.468039	2026-01-19 00:30:09.468039	usd	\N	\N	2	1	0	0
de881a16-8d4c-4115-9ab0-e4e414484783	chess	500.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 00:30:24.552	\N	2026-01-19 00:30:24.553994	2026-01-19 00:30:24.553994	usd	\N	\N	2	1	0	0
71ed10c6-5743-4c59-8486-dea899bf4537	backgammon	500.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 00:30:45.72	\N	2026-01-19 00:30:45.721446	2026-01-19 00:30:45.721446	usd	\N	\N	2	1	0	0
caff1c6a-2de0-4715-943c-7936e15844f5	chess	5.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 00:31:42.693	\N	2026-01-19 00:31:42.69475	2026-01-19 00:31:42.69475	usd	\N	\N	2	1	0	0
c54ec90d-b14d-4533-87ef-eafa278bff13	domino	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 00:31:59.893	\N	2026-01-19 00:31:59.895209	2026-01-19 00:31:59.895209	usd	\N	\N	2	1	0	0
a55f8772-2fc8-46fc-a1b0-466e1f7bd37f	backgammon	250.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 00:32:21.133	\N	2026-01-19 00:32:21.135356	2026-01-19 00:32:21.135356	usd	\N	\N	2	1	0	0
09a18bb2-4892-484d-bada-7bb66f446edc	domino	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 00:32:37.451	\N	2026-01-19 00:32:37.452661	2026-01-19 00:32:37.452661	usd	\N	\N	2	1	0	0
128ffe31-c766-4e44-bea0-65a407515532	chess	500.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 00:33:02.407	\N	2026-01-19 00:33:02.48618	2026-01-19 00:33:02.48618	usd	\N	\N	2	1	0	0
e8984d20-a71f-4795-b9fb-9612278c9015	backgammon	250.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 00:45:54.908	\N	2026-01-19 00:45:54.911425	2026-01-19 00:45:54.911425	usd	\N	\N	2	1	0	0
50d87a75-d2ce-438c-a03a-06df7366b714	domino	25.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 00:46:16.586	\N	2026-01-19 00:46:16.587483	2026-01-19 00:46:16.587483	usd	\N	\N	2	1	0	0
d287183a-c50c-476f-aa68-2e42f8cff37a	domino	500.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 00:46:37.98	\N	2026-01-19 00:46:37.982215	2026-01-19 00:46:37.982215	usd	\N	\N	2	1	0	0
986dd831-9869-4495-97f1-f6590da6149d	chess	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 00:46:53.01	\N	2026-01-19 00:46:53.012222	2026-01-19 00:46:53.012222	usd	\N	\N	2	1	0	0
c8ee0186-4e82-477d-813c-fa1d58a67574	domino	1000.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 00:47:14.827	\N	2026-01-19 00:47:14.828716	2026-01-19 00:47:14.828716	usd	\N	\N	2	1	0	0
7f7b45b6-fa45-4dbb-a826-ef474a9c10e6	backgammon	5.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 00:47:31.72	\N	2026-01-19 00:47:31.721119	2026-01-19 00:47:31.721119	usd	\N	\N	2	1	0	0
8e01ca82-baed-41d6-b417-7b67f0e8a129	chess	50.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 00:47:55.194	\N	2026-01-19 00:47:55.195376	2026-01-19 00:47:55.195376	usd	\N	\N	2	1	0	0
60a2e5de-d434-488e-9d5b-0c738f98b9f0	backgammon	50.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 00:48:52.304	\N	2026-01-19 00:48:52.306556	2026-01-19 00:48:52.306556	usd	\N	\N	2	1	0	0
9e89e269-e4e1-4c9c-ad03-e3c10f23bff5	domino	500.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 00:49:19.079	\N	2026-01-19 00:49:19.080784	2026-01-19 00:49:19.080784	usd	\N	\N	2	1	0	0
38f48ebc-9a6e-46e5-a395-932ead374518	chess	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 00:49:38.699	\N	2026-01-19 00:49:38.70436	2026-01-19 00:49:38.70436	usd	\N	\N	2	1	0	0
222c662b-bfca-4d68-8d72-7e09abe81435	domino	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 00:49:58.622	\N	2026-01-19 00:49:58.623527	2026-01-19 00:49:58.623527	usd	\N	\N	2	1	0	0
272be2d5-9e58-477f-9cb0-5d4c02b8385d	chess	100.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 00:50:16.828	\N	2026-01-19 00:50:16.87382	2026-01-19 00:50:16.87382	usd	\N	\N	2	1	0	0
da8902f2-bb2e-441f-9688-0fcab2eaa68a	domino	100.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 00:55:42.626	\N	2026-01-19 00:55:42.627577	2026-01-19 00:55:42.627577	usd	\N	\N	2	1	0	0
009ee6a9-24ce-44cc-97ed-c31743ac57de	chess	5.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 00:56:10.188	\N	2026-01-19 00:56:10.191511	2026-01-19 00:56:10.191511	usd	\N	\N	2	1	0	0
693ff238-50d2-4c2e-8cec-0bc3e99177e2	backgammon	50.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 00:56:29.721	\N	2026-01-19 00:56:29.887356	2026-01-19 00:56:29.887356	usd	\N	\N	2	1	0	0
4be461e4-1c64-4be3-959c-1190d36ddcc9	domino	1000.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 00:56:57.735	\N	2026-01-19 00:56:57.736301	2026-01-19 00:56:57.736301	usd	\N	\N	2	1	0	0
1d36bc81-d268-4205-a3aa-4ac2c2b0b7b4	backgammon	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 00:57:23.469	\N	2026-01-19 00:57:23.470031	2026-01-19 00:57:23.470031	usd	\N	\N	2	1	0	0
61eb169f-1862-46eb-9cf2-8d3cf720f255	chess	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 01:06:09.352	\N	2026-01-19 01:06:09.35339	2026-01-19 01:06:09.35339	usd	\N	\N	2	1	0	0
680e2baf-6dd5-4b51-b4ec-d06daece4869	backgammon	50.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 01:06:32.368	\N	2026-01-19 01:06:32.369367	2026-01-19 01:06:32.369367	usd	\N	\N	2	1	0	0
f85a5374-9151-4c14-973c-d58a41541e85	backgammon	5.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 01:06:42.013	\N	2026-01-19 01:06:42.014894	2026-01-19 01:06:42.014894	usd	\N	\N	2	1	0	0
4ed3cdf4-7b3c-4433-95c0-7bfe06cd749b	chess	50.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 01:07:08.584	\N	2026-01-19 01:07:08.5854	2026-01-19 01:07:08.5854	usd	\N	\N	2	1	0	0
43539fd5-bdf5-4a83-af3e-dce21af40586	backgammon	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 01:07:35.905	\N	2026-01-19 01:07:35.907623	2026-01-19 01:07:35.907623	usd	\N	\N	2	1	0	0
0ac4c6fa-46b5-4d1f-b270-de866f1fa85b	chess	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 01:08:05.471	\N	2026-01-19 01:08:05.479281	2026-01-19 01:08:05.479281	usd	\N	\N	2	1	0	0
734d9b30-8c2f-4823-aceb-019c252e8d5d	backgammon	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 01:08:22.741	\N	2026-01-19 01:08:22.742858	2026-01-19 01:08:22.742858	usd	\N	\N	2	1	0	0
0e33b71e-03ed-4c09-8096-a66d0fee40fc	backgammon	250.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 01:16:40.467	\N	2026-01-19 01:16:40.469064	2026-01-19 01:16:40.469064	usd	\N	\N	2	1	0	0
80122076-ee8e-41d3-b6f0-0804fa37c0f3	backgammon	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 01:16:56.551	\N	2026-01-19 01:16:56.552629	2026-01-19 01:16:56.552629	usd	\N	\N	2	1	0	0
0725ebf6-10eb-40ae-9194-de0f6e297af9	chess	10.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 01:17:17.735	\N	2026-01-19 01:17:17.737054	2026-01-19 01:17:17.737054	usd	\N	\N	2	1	0	0
67084184-6389-4f12-9e5e-9f64548b397f	backgammon	100.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 01:17:47.51	\N	2026-01-19 01:17:47.598756	2026-01-19 01:17:47.598756	usd	\N	\N	2	1	0	0
178221f9-1591-432d-b558-ce25662efad6	chess	250.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 01:18:06.534	\N	2026-01-19 01:18:06.536178	2026-01-19 01:18:06.536178	usd	\N	\N	2	1	0	0
7d876ae6-2d7c-41f6-9b62-a20fe2b09b98	domino	50.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 01:18:22.897	\N	2026-01-19 01:18:22.898209	2026-01-19 01:18:22.898209	usd	\N	\N	2	1	0	0
8d7a26ef-810a-423f-b31f-d2e4085e8793	domino	5.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 01:25:53.801	\N	2026-01-19 01:25:53.803853	2026-01-19 01:25:53.803853	usd	\N	\N	2	1	0	0
e6b8b69d-c715-41d6-98ca-2f902779192d	backgammon	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 01:26:14.326	\N	2026-01-19 01:26:14.328	2026-01-19 01:26:14.328	usd	\N	\N	2	1	0	0
902934c3-b4e6-41fe-b161-2cfe99a34a2e	chess	250.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 01:26:30.071	\N	2026-01-19 01:26:30.072845	2026-01-19 01:26:30.072845	usd	\N	\N	2	1	0	0
ad91e4e0-38a5-4b87-8dfc-624f6403211a	domino	100.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 01:26:50.97	\N	2026-01-19 01:26:50.971848	2026-01-19 01:26:50.971848	usd	\N	\N	2	1	0	0
e99be37b-d6bb-4bf3-8656-edc55d49f25f	backgammon	10.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 01:27:11.44	\N	2026-01-19 01:27:11.442216	2026-01-19 01:27:11.442216	usd	\N	\N	2	1	0	0
a199888a-9db3-4d27-98c8-08a19fc7c72d	chess	25.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 01:33:32.701	\N	2026-01-19 01:33:32.703478	2026-01-19 01:33:32.703478	usd	\N	\N	2	1	0	0
9488c9fa-3499-4bd6-8715-7388fb9a97d7	backgammon	25.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 01:34:01.398	\N	2026-01-19 01:34:01.400758	2026-01-19 01:34:01.400758	usd	\N	\N	2	1	0	0
e27aafb8-75ca-411f-b1c2-91d4ccdeafd0	domino	25.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 01:34:21.095	\N	2026-01-19 01:34:21.096933	2026-01-19 01:34:21.096933	usd	\N	\N	2	1	0	0
3c34beb6-c467-4d4b-9b28-c7de0471f382	backgammon	25.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 01:34:39.114	\N	2026-01-19 01:34:39.116205	2026-01-19 01:34:39.116205	usd	\N	\N	2	1	0	0
8d125193-b5bf-4025-9fd9-3ad431684ca7	domino	1000.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 01:35:05.048	\N	2026-01-19 01:35:05.053133	2026-01-19 01:35:05.053133	usd	\N	\N	2	1	0	0
097aa460-6a9f-434b-939e-cc7cdd4f57e4	backgammon	50.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 01:35:32.849	\N	2026-01-19 01:35:32.851113	2026-01-19 01:35:32.851113	usd	\N	\N	2	1	0	0
c13f016d-df8f-476d-8dc9-c434cd6eb3fc	backgammon	50.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 01:52:48.048	\N	2026-01-19 01:52:48.04996	2026-01-19 01:52:48.04996	usd	\N	\N	2	1	0	0
5072d301-220a-40cd-be83-ae7c7a8521c9	chess	25.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 01:53:08.811	\N	2026-01-19 01:53:08.812172	2026-01-19 01:53:08.812172	usd	\N	\N	2	1	0	0
d6aabf52-0c6b-4b2a-b5ab-a3bb87f93e4a	backgammon	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 01:53:36.468	\N	2026-01-19 01:53:36.46995	2026-01-19 01:53:36.46995	usd	\N	\N	2	1	0	0
0795e1f2-f1c2-433d-aab7-2d83b1e93f57	domino	1000.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 01:53:56.029	\N	2026-01-19 01:53:56.031126	2026-01-19 01:53:56.031126	usd	\N	\N	2	1	0	0
61be4db3-5412-48f6-b6ad-dce2d505f752	backgammon	100.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 01:54:17.051	\N	2026-01-19 01:54:17.052729	2026-01-19 01:54:17.052729	usd	\N	\N	2	1	0	0
84f567a4-73a4-4f30-913d-66b6660d83e7	chess	50.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 01:54:36.919	\N	2026-01-19 01:54:36.921502	2026-01-19 01:54:36.921502	usd	\N	\N	2	1	0	0
71151c2f-8e40-4884-8629-285a06608eb4	domino	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 01:55:08.806	\N	2026-01-19 01:55:08.809256	2026-01-19 01:55:08.809256	usd	\N	\N	2	1	0	0
7a13c9aa-23a4-4943-8ddc-ee42642a6f72	chess	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 01:55:37.821	\N	2026-01-19 01:55:37.823293	2026-01-19 01:55:37.823293	usd	\N	\N	2	1	0	0
ce034bbc-c937-408b-a747-e0d57d7873b4	backgammon	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 01:55:55.897	\N	2026-01-19 01:55:55.904304	2026-01-19 01:55:55.904304	usd	\N	\N	2	1	0	0
8c62ae22-ad1e-4106-b4ce-f6f1b2c0e6a1	chess	10.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 01:56:24.117	\N	2026-01-19 01:56:24.118713	2026-01-19 01:56:24.118713	usd	\N	\N	2	1	0	0
9cd37b66-8c92-41ef-b83c-6eac367db67d	backgammon	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 01:56:49.489	\N	2026-01-19 01:56:49.490505	2026-01-19 01:56:49.490505	usd	\N	\N	2	1	0	0
71a10714-2968-44a8-93fe-203eb134b225	domino	5.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 02:06:15.73	\N	2026-01-19 02:06:15.733679	2026-01-19 02:06:15.733679	usd	\N	\N	2	1	0	0
c1a0c2e9-51e6-401b-8288-e48423f64fbf	chess	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 02:06:32.966	\N	2026-01-19 02:06:32.968674	2026-01-19 02:06:32.968674	usd	\N	\N	2	1	0	0
d231d2a1-9e30-46b2-b31e-9e40699f0328	backgammon	100.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 02:07:02.643	\N	2026-01-19 02:07:02.64443	2026-01-19 02:07:02.64443	usd	\N	\N	2	1	0	0
890f015e-b047-47dd-96dd-04a5a2730867	backgammon	500.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 02:07:23.94	\N	2026-01-19 02:07:23.942275	2026-01-19 02:07:23.942275	usd	\N	\N	2	1	0	0
65f0f396-6a0d-4851-9fd8-bb3a886feb7b	domino	100.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 02:07:46.786	\N	2026-01-19 02:07:46.788395	2026-01-19 02:07:46.788395	usd	\N	\N	2	1	0	0
eee9b8b6-faa7-4673-96b1-9787bdf46d7e	chess	100.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 02:08:08.044	\N	2026-01-19 02:08:08.046179	2026-01-19 02:08:08.046179	usd	\N	\N	2	1	0	0
55d1f9e6-f314-4660-b34c-5d9c4d7dfa4c	domino	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 02:08:28.526	\N	2026-01-19 02:08:28.529045	2026-01-19 02:08:28.529045	usd	\N	\N	2	1	0	0
681b43ad-6309-41e3-99ac-4087429b6564	domino	10.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 02:08:48.851	\N	2026-01-19 02:08:48.853674	2026-01-19 02:08:48.853674	usd	\N	\N	2	1	0	0
1475cc6f-f5ce-4a4b-a252-30390e5d3d5b	chess	250.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 02:09:15.722	\N	2026-01-19 02:09:15.723757	2026-01-19 02:09:15.723757	usd	\N	\N	2	1	0	0
59936342-3a4c-4818-ac34-21612d87aa7a	chess	25.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 02:09:38.687	\N	2026-01-19 02:09:38.689303	2026-01-19 02:09:38.689303	usd	\N	\N	2	1	0	0
1decbe04-fdd5-4dc2-95c4-108394568c36	domino	5.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 02:10:01.12	\N	2026-01-19 02:10:01.121345	2026-01-19 02:10:01.121345	usd	\N	\N	2	1	0	0
e8560977-47d3-4036-88e0-6f985ebfc963	domino	100.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 02:10:15.066	\N	2026-01-19 02:10:15.068799	2026-01-19 02:10:15.068799	usd	\N	\N	2	1	0	0
4145d4ae-1b58-4399-96c7-38f667b8f066	backgammon	10.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 02:10:31.137	\N	2026-01-19 02:10:31.138626	2026-01-19 02:10:31.138626	usd	\N	\N	2	1	0	0
93dfb200-20f3-426c-9478-cd93199b367c	domino	100.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 02:10:47.235	\N	2026-01-19 02:10:47.237496	2026-01-19 02:10:47.237496	usd	\N	\N	2	1	0	0
a1e716cd-8458-404e-9c73-39e30db80b1f	chess	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 02:11:11.684	\N	2026-01-19 02:11:11.685596	2026-01-19 02:11:11.685596	usd	\N	\N	2	1	0	0
e5a68f9c-0590-4527-a4d7-40555ec12b24	domino	25.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 02:11:39.634	\N	2026-01-19 02:11:39.636626	2026-01-19 02:11:39.636626	usd	\N	\N	2	1	0	0
684562c7-4117-4dce-a835-8eed388bfe87	backgammon	100.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 02:12:25.691	\N	2026-01-19 02:12:25.693829	2026-01-19 02:12:25.693829	usd	\N	\N	2	1	0	0
c1c13d71-aa17-4895-8795-998a47cfe313	chess	10.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 02:12:52.705	\N	2026-01-19 02:12:52.707048	2026-01-19 02:12:52.707048	usd	\N	\N	2	1	0	0
bbb4a502-0123-47b0-aee1-0a4f20362596	domino	500.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 02:13:10.788	\N	2026-01-19 02:13:10.870204	2026-01-19 02:13:10.870204	usd	\N	\N	2	1	0	0
1a768aa1-3258-4b9f-a3de-f5c3f5bb00c5	chess	500.00000000	public	completed	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 02:12:03.304	2026-01-19 02:39:10.445	2026-01-19 02:12:03.305283	2026-01-19 02:39:10.445	usd	\N	\N	2	1	0	0
91d35ef7-e763-40bb-81b3-5b31bc3720e5	backgammon	1000.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 02:39:26.806	\N	2026-01-19 02:39:26.807808	2026-01-19 02:39:26.807808	usd	\N	\N	2	1	0	0
5557beaa-7509-4ef4-976f-26e20ddb9472	chess	5.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 02:39:56.548	\N	2026-01-19 02:39:56.549983	2026-01-19 02:39:56.549983	usd	\N	\N	2	1	0	0
bb9126b8-6f38-4405-84d9-e1c0a38768b1	domino	1000.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 02:40:22.868	\N	2026-01-19 02:40:22.86934	2026-01-19 02:40:22.86934	usd	\N	\N	2	1	0	0
efca6dc3-5944-44a2-a695-f41c54770861	chess	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 02:40:41.56	\N	2026-01-19 02:40:41.561271	2026-01-19 02:40:41.561271	usd	\N	\N	2	1	0	0
eecb9323-041e-41e7-8004-77d4a8cca2ea	domino	1000.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 02:41:04.272	\N	2026-01-19 02:41:04.273691	2026-01-19 02:41:04.273691	usd	\N	\N	2	1	0	0
e4ef254d-dd01-4a0d-a60a-e25478818ec3	chess	100.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 02:41:28.793	\N	2026-01-19 02:41:28.79469	2026-01-19 02:41:28.79469	usd	\N	\N	2	1	0	0
0105e0f3-7738-4845-b330-615b8acef4ee	backgammon	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 02:41:57.644	\N	2026-01-19 02:41:57.645279	2026-01-19 02:41:57.645279	usd	\N	\N	2	1	0	0
7e497480-2ff6-4816-943a-0b98a363286d	domino	5.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 02:42:25.8	\N	2026-01-19 02:42:25.801206	2026-01-19 02:42:25.801206	usd	\N	\N	2	1	0	0
d4d2852f-f511-4a9f-91b5-21ef5e480fbf	chess	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 02:47:09.208	\N	2026-01-19 02:47:09.210698	2026-01-19 02:47:09.210698	usd	\N	\N	2	1	0	0
35183977-a49e-4f78-8985-5a541d11a177	domino	500.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 02:47:37.624	\N	2026-01-19 02:47:37.625443	2026-01-19 02:47:37.625443	usd	\N	\N	2	1	0	0
d45f5ee1-5d96-4480-9e64-8764e971d097	backgammon	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 02:47:57.215	\N	2026-01-19 02:47:57.216524	2026-01-19 02:47:57.216524	usd	\N	\N	2	1	0	0
ec8a5661-f4fb-4d44-96a2-f9d739c24a2f	domino	1000.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 02:48:16.48	\N	2026-01-19 02:48:16.481593	2026-01-19 02:48:16.481593	usd	\N	\N	2	1	0	0
470b9952-ea38-4e75-bc5e-fb446f23910b	backgammon	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 02:48:45.395	\N	2026-01-19 02:48:45.397256	2026-01-19 02:48:45.397256	usd	\N	\N	2	1	0	0
83a5b653-d27a-4b8d-90eb-b6765ad24b66	chess	10.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 02:49:03.113	\N	2026-01-19 02:49:03.114703	2026-01-19 02:49:03.114703	usd	\N	\N	2	1	0	0
776ab23c-5581-4ae2-9868-d0c41e936f96	backgammon	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 02:49:26.8	\N	2026-01-19 02:49:26.801284	2026-01-19 02:49:26.801284	usd	\N	\N	2	1	0	0
10ea9831-92f4-4ec6-9a52-fe322fbce423	chess	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 02:49:43.93	\N	2026-01-19 02:49:43.931813	2026-01-19 02:49:43.931813	usd	\N	\N	2	1	0	0
60487587-9022-4be9-9b9f-94e40c968a10	domino	10.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 02:50:05.485	\N	2026-01-19 02:50:05.486691	2026-01-19 02:50:05.486691	usd	\N	\N	2	1	0	0
ff56b31a-4873-47ed-9503-f46fe55ec029	backgammon	250.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 02:50:22.163	\N	2026-01-19 02:50:22.164463	2026-01-19 02:50:22.164463	usd	\N	\N	2	1	0	0
009a305a-2abc-4163-8e8b-b5b8f6d1b487	chess	25.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 02:50:46.733	\N	2026-01-19 02:50:46.734459	2026-01-19 02:50:46.734459	usd	\N	\N	2	1	0	0
1ddd2043-8a5c-4611-a5ef-42191f2b16b4	domino	500.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 02:51:06.812	\N	2026-01-19 02:51:06.813807	2026-01-19 02:51:06.813807	usd	\N	\N	2	1	0	0
8ee3dc12-f59f-4605-ba0e-6b814108c5d5	chess	500.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 02:51:33.544	\N	2026-01-19 02:51:33.545668	2026-01-19 02:51:33.545668	usd	\N	\N	2	1	0	0
0a068936-2efc-4fdf-9d31-56a8b561660b	backgammon	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 02:52:03.361	\N	2026-01-19 02:52:03.362325	2026-01-19 02:52:03.362325	usd	\N	\N	2	1	0	0
07c29265-4aaf-4421-b547-cfd5bfabdb3d	domino	5.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 02:52:12.872	\N	2026-01-19 02:52:12.874071	2026-01-19 02:52:12.874071	usd	\N	\N	2	1	0	0
e2d70362-fb02-49d2-bbe8-c7508a50d53d	backgammon	1000.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 02:52:34.113	\N	2026-01-19 02:52:34.115181	2026-01-19 02:52:34.115181	usd	\N	\N	2	1	0	0
9d6b128e-796b-41ad-8abe-95fbb6b4fccc	chess	500.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 02:52:54.081	\N	2026-01-19 02:52:54.082719	2026-01-19 02:52:54.082719	usd	\N	\N	2	1	0	0
ea41c0a0-2504-4799-9d87-995d0f0d11c6	domino	500.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 02:53:12.289	\N	2026-01-19 02:53:12.290169	2026-01-19 02:53:12.290169	usd	\N	\N	2	1	0	0
9ae030fb-a840-49eb-8281-958f05945b16	backgammon	500.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 02:53:35.929	\N	2026-01-19 02:53:35.933403	2026-01-19 02:53:35.933403	usd	\N	\N	2	1	0	0
47752c5d-4485-4810-93f8-54e829c86a12	chess	10.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 02:56:54.033	\N	2026-01-19 02:56:54.035334	2026-01-19 02:56:54.035334	usd	\N	\N	2	1	0	0
5828531b-6774-4181-a667-af06514985cc	backgammon	10.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 02:57:17.215	\N	2026-01-19 02:57:17.217131	2026-01-19 02:57:17.217131	usd	\N	\N	2	1	0	0
ace9ec26-a747-4cb2-bff3-0009e7363c76	domino	10.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 02:57:43.214	\N	2026-01-19 02:57:43.215696	2026-01-19 02:57:43.215696	usd	\N	\N	2	1	0	0
96f95a96-e155-4f84-a5e9-282b436a8eba	chess	25.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 02:58:07.226	\N	2026-01-19 02:58:07.23089	2026-01-19 02:58:07.23089	usd	\N	\N	2	1	0	0
d72dc6e3-b8b2-4a9d-a04f-1f5f488d2c8b	backgammon	100.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 02:58:25.674	\N	2026-01-19 02:58:25.675386	2026-01-19 02:58:25.675386	usd	\N	\N	2	1	0	0
f8777f51-e577-41dc-92fd-c29911b40959	chess	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 03:05:26.479	\N	2026-01-19 03:05:26.480529	2026-01-19 03:05:26.480529	usd	\N	\N	2	1	0	0
23e2c91e-bab5-4578-92f0-7b2fb3737b38	domino	1000.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 03:05:55.931	\N	2026-01-19 03:05:55.93215	2026-01-19 03:05:55.93215	usd	\N	\N	2	1	0	0
38c61fb0-681d-4830-92a3-1e5adf30fbc3	backgammon	50.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 03:06:17.293	\N	2026-01-19 03:06:17.29568	2026-01-19 03:06:17.29568	usd	\N	\N	2	1	0	0
ee9d6608-a9a4-4e03-b5e7-9afcdd73cc64	domino	250.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 03:06:36.348	\N	2026-01-19 03:06:36.34941	2026-01-19 03:06:36.34941	usd	\N	\N	2	1	0	0
1dc578be-7478-4e9d-901d-af0cc616893d	chess	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 03:06:57.98	\N	2026-01-19 03:06:57.981855	2026-01-19 03:06:57.981855	usd	\N	\N	2	1	0	0
c4358278-8f97-4e98-8878-b662ad250a6e	domino	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 03:16:06.656	\N	2026-01-19 03:16:06.657899	2026-01-19 03:16:06.657899	usd	\N	\N	2	1	0	0
716a416d-8b34-4214-a452-f688cc66cb70	backgammon	50.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 03:16:34.079	\N	2026-01-19 03:16:34.08081	2026-01-19 03:16:34.08081	usd	\N	\N	2	1	0	0
f6846a01-40a8-4f62-9ac4-c9b9df695394	domino	500.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 03:17:02.784	\N	2026-01-19 03:17:02.785596	2026-01-19 03:17:02.785596	usd	\N	\N	2	1	0	0
ffa16673-a69a-4836-9b15-316758f941a4	chess	1000.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 03:17:27.073	\N	2026-01-19 03:17:27.074746	2026-01-19 03:17:27.074746	usd	\N	\N	2	1	0	0
bc56e7b6-ff65-434b-a636-e026c4b78756	domino	25.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 03:17:46.077	\N	2026-01-19 03:17:46.080444	2026-01-19 03:17:46.080444	usd	\N	\N	2	1	0	0
44724079-fcf0-4c40-9d13-38c21a22cd40	backgammon	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 03:18:13.306	\N	2026-01-19 03:18:13.308519	2026-01-19 03:18:13.308519	usd	\N	\N	2	1	0	0
231090a6-410d-4757-81f1-fe68f65da689	domino	50.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 03:18:29.174	\N	2026-01-19 03:18:29.175749	2026-01-19 03:18:29.175749	usd	\N	\N	2	1	0	0
f6c092e0-0ed9-49da-ab5b-2c860d5a21d8	chess	10.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 03:18:50.592	\N	2026-01-19 03:18:50.779116	2026-01-19 03:18:50.779116	usd	\N	\N	2	1	0	0
39fda348-671d-4de4-94b3-2d7d3448019f	backgammon	50.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 03:19:06.678	\N	2026-01-19 03:19:06.678995	2026-01-19 03:19:06.678995	usd	\N	\N	2	1	0	0
7e14fa75-537a-4a18-b623-5eb2efd2290c	domino	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 03:26:49.092	\N	2026-01-19 03:26:49.094116	2026-01-19 03:26:49.094116	usd	\N	\N	2	1	0	0
2e1cc221-49cc-4f1b-b397-56d5632cd144	backgammon	50.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 03:27:16.916	\N	2026-01-19 03:27:16.917469	2026-01-19 03:27:16.917469	usd	\N	\N	2	1	0	0
a8db01d5-1a34-4bd5-b252-9d539f9ee5f4	chess	25.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 03:27:45.743	\N	2026-01-19 03:27:45.744391	2026-01-19 03:27:45.744391	usd	\N	\N	2	1	0	0
d39acea4-ad33-4ded-8abf-c9e51b00b73d	domino	5.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 03:28:02.312	\N	2026-01-19 03:28:02.316743	2026-01-19 03:28:02.316743	usd	\N	\N	2	1	0	0
ccb36338-45d0-4c96-a65e-2534ae85cf99	chess	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 03:28:11.728	\N	2026-01-19 03:28:11.72994	2026-01-19 03:28:11.72994	usd	\N	\N	2	1	0	0
d24cd23c-51e2-4ac9-a4a2-595121c82f3a	backgammon	100.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 03:28:36.233	\N	2026-01-19 03:28:36.234363	2026-01-19 03:28:36.234363	usd	\N	\N	2	1	0	0
9f896dce-71d2-4d68-8a1d-936132fe62b6	domino	250.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 03:28:57.842	\N	2026-01-19 03:28:57.844182	2026-01-19 03:28:57.844182	usd	\N	\N	2	1	0	0
447b218c-5ea2-4786-8252-fe3d24a36cfc	chess	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 03:29:16.964	\N	2026-01-19 03:29:16.968116	2026-01-19 03:29:16.968116	usd	\N	\N	2	1	0	0
42b332c7-3b83-41df-8b2a-2a31da6308a4	backgammon	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 03:29:46.137	\N	2026-01-19 03:29:46.138993	2026-01-19 03:29:46.138993	usd	\N	\N	2	1	0	0
9091091d-46aa-4a68-908e-3693e5b22481	chess	250.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 03:40:00.476	\N	2026-01-19 03:40:00.47802	2026-01-19 03:40:00.47802	usd	\N	\N	2	1	0	0
bf176cdb-56e6-4753-9246-591fbe362cac	domino	50.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 03:40:22.098	\N	2026-01-19 03:40:22.100238	2026-01-19 03:40:22.100238	usd	\N	\N	2	1	0	0
fd0971d0-3042-4482-993f-25af088cb851	domino	100.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 03:40:37.897	\N	2026-01-19 03:40:37.898269	2026-01-19 03:40:37.898269	usd	\N	\N	2	1	0	0
b65040a8-50af-49e5-8ab8-830aa1e11b4d	backgammon	50.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 03:41:20.495	\N	2026-01-19 03:41:20.496929	2026-01-19 03:41:20.496929	usd	\N	\N	2	1	0	0
4938ec0b-39cc-43b2-aa90-3cf49af5ed76	chess	25.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 03:41:48.482	\N	2026-01-19 03:41:48.483584	2026-01-19 03:41:48.483584	usd	\N	\N	2	1	0	0
52f49088-5c00-41aa-b0f2-406ddf4000ac	domino	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 03:42:09.593	\N	2026-01-19 03:42:09.593905	2026-01-19 03:42:09.593905	usd	\N	\N	2	1	0	0
a6aad42e-e8c9-410b-b1d3-fe8119f105ba	chess	25.00000000	public	completed	4d358b24-397b-4020-87f3-de6acaf35864	f065b93a-0a3e-408b-964a-8759f618e683	4d358b24-397b-4020-87f3-de6acaf35864	random	\N	600	0	0	2026-01-19 03:41:01.464	2026-01-19 03:47:56.461	2026-01-19 03:41:01.465604	2026-01-19 03:47:56.461	usd	\N	\N	2	1	0	0
17ac26a4-e90d-41ee-821c-cfc41a9bd76e	chess	500.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 03:47:59.395	\N	2026-01-19 03:47:59.397397	2026-01-19 03:47:59.397397	usd	\N	\N	2	1	0	0
027c925a-60b4-4d6a-a4de-034a0fdc0f3d	domino	5.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 16:38:51.016	\N	2026-01-19 16:38:51.018394	2026-01-19 16:38:51.018394	usd	\N	\N	2	1	0	0
ef1fa31c-d095-4844-a5db-2dc0eb58c356	backgammon	250.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 16:39:15.816	\N	2026-01-19 16:39:15.817345	2026-01-19 16:39:15.817345	usd	\N	\N	2	1	0	0
6ef31761-fb0c-47c3-ae74-08e29674df2b	chess	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 16:39:32.94	\N	2026-01-19 16:39:32.942093	2026-01-19 16:39:32.942093	usd	\N	\N	2	1	0	0
e8aa7701-1679-4746-83ef-48281eaafbcc	backgammon	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 16:39:48.409	\N	2026-01-19 16:39:48.410891	2026-01-19 16:39:48.410891	usd	\N	\N	2	1	0	0
aadf45d1-fad6-446e-8ac8-3b8551127dbb	domino	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 16:40:14.984	\N	2026-01-19 16:40:14.9939	2026-01-19 16:40:14.9939	usd	\N	\N	2	1	0	0
73bf22bd-30d3-4a2e-b594-24bf3c28e77a	domino	100.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 16:41:35.049	\N	2026-01-19 16:41:35.088712	2026-01-19 16:41:35.088712	usd	\N	\N	2	1	0	0
158d9908-41fc-4903-ae29-6903e7bb1f18	chess	5.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 16:41:51.831	\N	2026-01-19 16:41:51.83251	2026-01-19 16:41:51.83251	usd	\N	\N	2	1	0	0
705ed9d3-bb32-4660-b424-d625de14ddc5	backgammon	5.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 16:42:21.543	\N	2026-01-19 16:42:21.545142	2026-01-19 16:42:21.545142	usd	\N	\N	2	1	0	0
5aefc3d9-20f4-46b7-9406-dcc288cfb06e	domino	50.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 16:42:41.003	\N	2026-01-19 16:42:41.005281	2026-01-19 16:42:41.005281	usd	\N	\N	2	1	0	0
ec0feffc-6408-4638-a18a-6f588c28213a	backgammon	250.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 16:43:07.759	\N	2026-01-19 16:43:07.7608	2026-01-19 16:43:07.7608	usd	\N	\N	2	1	0	0
a5f46148-ae1d-415f-9c3a-dedcd5490760	backgammon	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 16:44:10.376	\N	2026-01-19 16:44:10.378141	2026-01-19 16:44:10.378141	usd	\N	\N	2	1	0	0
a29acc4b-4839-4f69-b050-b4eefcdd7baf	chess	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 16:44:35.356	\N	2026-01-19 16:44:35.35743	2026-01-19 16:44:35.35743	usd	\N	\N	2	1	0	0
3dff52b9-c5e9-493a-b93d-9b838b17bb19	domino	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 16:44:54.572	\N	2026-01-19 16:44:54.575657	2026-01-19 16:44:54.575657	usd	\N	\N	2	1	0	0
b33c6041-d5b0-42bd-9487-31ec7b7e0bf9	backgammon	500.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 16:45:12.255	\N	2026-01-19 16:45:12.257332	2026-01-19 16:45:12.257332	usd	\N	\N	2	1	0	0
68235cf2-bc9b-41c3-bfee-b99a27ba8036	chess	500.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 16:45:47.454	\N	2026-01-19 16:45:47.456304	2026-01-19 16:45:47.456304	usd	\N	\N	2	1	0	0
248d15e3-8483-495a-90ac-0b18b7832f0e	backgammon	10.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 16:46:08.54	\N	2026-01-19 16:46:08.542408	2026-01-19 16:46:08.542408	usd	\N	\N	2	1	0	0
5d5a29e9-c40f-4702-94c4-fa20fe143db7	domino	1000.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 16:46:29.177	\N	2026-01-19 16:46:29.179393	2026-01-19 16:46:29.179393	usd	\N	\N	2	1	0	0
c6d8045a-264f-4b59-b3c8-8dce23088762	chess	500.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 16:46:39.433	\N	2026-01-19 16:46:39.438771	2026-01-19 16:46:39.438771	usd	\N	\N	2	1	0	0
ba568c17-4a53-4b58-ba0f-e4089e25a559	backgammon	25.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 16:46:54.794	\N	2026-01-19 16:46:54.795908	2026-01-19 16:46:54.795908	usd	\N	\N	2	1	0	0
6ddf408f-65ff-48c7-84f0-b9d3eaed4937	domino	1000.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 16:47:11.232	\N	2026-01-19 16:47:11.234226	2026-01-19 16:47:11.234226	usd	\N	\N	2	1	0	0
aa9bf363-a975-41ba-93a8-4d5a995d6626	chess	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 16:47:26.323	\N	2026-01-19 16:47:26.325065	2026-01-19 16:47:26.325065	usd	\N	\N	2	1	0	0
cb871aad-4317-445f-9332-49ec55db0390	domino	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 16:47:49.029	\N	2026-01-19 16:47:49.031189	2026-01-19 16:47:49.031189	usd	\N	\N	2	1	0	0
f9f589b7-7212-4d2a-96cd-8d81fd3e07d6	chess	10.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 16:48:06.411	\N	2026-01-19 16:48:06.415725	2026-01-19 16:48:06.415725	usd	\N	\N	2	1	0	0
848e6a00-c3a6-4f6e-8aa6-770dc0783173	domino	100.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 16:48:27.269	\N	2026-01-19 16:48:27.270721	2026-01-19 16:48:27.270721	usd	\N	\N	2	1	0	0
a76ea2cc-2bc8-460a-9a2c-c5d539046b6f	domino	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 16:48:36.817	\N	2026-01-19 16:48:36.818454	2026-01-19 16:48:36.818454	usd	\N	\N	2	1	0	0
3c883ce6-7dee-4a63-91ca-c8c69282e243	backgammon	250.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 16:49:06.462	\N	2026-01-19 16:49:06.463745	2026-01-19 16:49:06.463745	usd	\N	\N	2	1	0	0
72db06a4-9e84-42cd-b108-855390bf7540	backgammon	100.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 16:49:19.442	\N	2026-01-19 16:49:19.444686	2026-01-19 16:49:19.444686	usd	\N	\N	2	1	0	0
7fa7e29f-a3ca-4a5a-b7e8-fa7a9b584121	chess	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 16:49:46.627	\N	2026-01-19 16:49:46.628243	2026-01-19 16:49:46.628243	usd	\N	\N	2	1	0	0
8a460056-a91c-43de-95b3-93a570d33818	backgammon	250.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 16:50:14.802	\N	2026-01-19 16:50:14.803254	2026-01-19 16:50:14.803254	usd	\N	\N	2	1	0	0
11c88c0a-5395-4766-8eb9-4593967fc499	chess	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 16:50:43.745	\N	2026-01-19 16:50:43.746624	2026-01-19 16:50:43.746624	usd	\N	\N	2	1	0	0
b946f996-b7af-49ec-b41a-96206a078a47	backgammon	250.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 16:51:00.828	\N	2026-01-19 16:51:00.829225	2026-01-19 16:51:00.829225	usd	\N	\N	2	1	0	0
ab2d4196-1a50-4ce5-b58a-38e64a087ffe	domino	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 16:52:46.481	\N	2026-01-19 16:52:46.48289	2026-01-19 16:52:46.48289	usd	\N	\N	2	1	0	0
a7330fba-0c24-4917-91fe-d6818f7fa5cc	backgammon	1000.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 16:53:08.517	\N	2026-01-19 16:53:08.519495	2026-01-19 16:53:08.519495	usd	\N	\N	2	1	0	0
e4ca0179-62f6-4780-986a-368524522e69	domino	100.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 16:53:29.392	\N	2026-01-19 16:53:29.393884	2026-01-19 16:53:29.393884	usd	\N	\N	2	1	0	0
b507ef34-e3d8-4513-8544-8c1403100a85	chess	500.00000000	public	completed	978946cb-9458-451c-9a4f-2f908966ec3a	e87885fb-aa52-49e2-92e9-9ad265fca46c	e87885fb-aa52-49e2-92e9-9ad265fca46c	random	\N	600	0	0	2026-01-19 16:53:47.447	2026-01-19 17:05:00.262	2026-01-19 16:53:47.44871	2026-01-19 17:05:00.262	usd	\N	\N	2	1	0	0
d6631731-f6fd-4f31-a9dd-0102633ba8b0	backgammon	1000.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 17:05:04.341	\N	2026-01-19 17:05:04.342137	2026-01-19 17:05:04.342137	usd	\N	\N	2	1	0	0
c28f5fa4-3f93-4085-9bcc-4bb853190eac	chess	5.00000000	public	completed	b8d9bf67-623e-4147-9d94-cc85dc9b5851	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 16:52:24.325	2026-01-19 17:24:34.717	2026-01-19 16:52:24.327787	2026-01-19 17:24:34.717	usd	\N	\N	2	1	0	0
5bd3bac5-6b40-41ff-bb9b-a4b6870f641b	chess	1000.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 17:24:52.135	\N	2026-01-19 17:24:52.136623	2026-01-19 17:24:52.136623	usd	\N	\N	2	1	0	0
1b44c04b-8608-4a12-9a05-1a0be72e4e55	chess	5.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 17:24:59.549	\N	2026-01-19 17:24:59.550856	2026-01-19 17:24:59.550856	usd	\N	\N	2	1	0	0
d8b44dac-b828-47d0-8886-6829ea3bcd47	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 17:25:22.681	\N	2026-01-19 17:25:22.68372	2026-01-19 17:25:22.68372	usd	\N	\N	2	1	0	0
dc1d745a-2830-4c89-8e39-f2f1bd60836c	domino	250.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 17:25:37.347	\N	2026-01-19 17:25:37.349096	2026-01-19 17:25:37.349096	usd	\N	\N	2	1	0	0
fd681082-37a4-4dd3-b732-6f01b80ee452	backgammon	50.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 17:25:56.528	\N	2026-01-19 17:25:56.5303	2026-01-19 17:25:56.5303	usd	\N	\N	2	1	0	0
4ffd3fd3-62ae-417f-b0c5-e0aa5cd0d8ad	chess	250.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 17:26:23.087	\N	2026-01-19 17:26:23.08852	2026-01-19 17:26:23.08852	usd	\N	\N	2	1	0	0
8d2501aa-7585-4fa3-aadd-5236db76322f	chess	500.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 17:26:45.077	\N	2026-01-19 17:26:45.079085	2026-01-19 17:26:45.079085	usd	\N	\N	2	1	0	0
831f906d-ab72-45d4-a3b2-1f995f157f83	domino	1000.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 17:27:03.133	\N	2026-01-19 17:27:03.135075	2026-01-19 17:27:03.135075	usd	\N	\N	2	1	0	0
213eb1c2-d08c-4d31-8417-fb4603ecbb28	backgammon	1000.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 17:27:27.157	\N	2026-01-19 17:27:27.161815	2026-01-19 17:27:27.161815	usd	\N	\N	2	1	0	0
5d6e41ad-c4f2-42c3-821c-901471f5cb6c	domino	5.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 17:27:44.08	\N	2026-01-19 17:27:44.083777	2026-01-19 17:27:44.083777	usd	\N	\N	2	1	0	0
cb410905-3a6d-4d30-a533-a4393149cf7e	backgammon	250.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 17:28:04.241	\N	2026-01-19 17:28:04.242551	2026-01-19 17:28:04.242551	usd	\N	\N	2	1	0	0
6b7f99f5-da4b-4b1c-8f91-c542a28a2964	domino	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 17:41:41.501	\N	2026-01-19 17:41:41.503095	2026-01-19 17:41:41.503095	usd	\N	\N	2	1	0	0
9cf74896-21c7-4bdb-9106-37eaeb16f506	chess	25.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 17:42:09.864	\N	2026-01-19 17:42:09.867543	2026-01-19 17:42:09.867543	usd	\N	\N	2	1	0	0
9bc6d469-acb5-4c4d-a2fa-b75513a0b5fd	domino	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 17:42:33.973	\N	2026-01-19 17:42:33.975625	2026-01-19 17:42:33.975625	usd	\N	\N	2	1	0	0
0b86e2d4-93d7-4f1c-8a12-8c0cdd982754	backgammon	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 17:42:52.17	\N	2026-01-19 17:42:52.172088	2026-01-19 17:42:52.172088	usd	\N	\N	2	1	0	0
8e81c79f-6aa1-4ee7-812a-972a1bcc2ec5	chess	250.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 17:43:14.707	\N	2026-01-19 17:43:14.713477	2026-01-19 17:43:14.713477	usd	\N	\N	2	1	0	0
6f127318-0372-4477-bf88-2f573bf479dc	domino	250.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 17:43:29.224	\N	2026-01-19 17:43:29.225801	2026-01-19 17:43:29.225801	usd	\N	\N	2	1	0	0
ebddf17e-5005-4023-bf28-8b3ff1865844	backgammon	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 17:43:47.145	\N	2026-01-19 17:43:47.146748	2026-01-19 17:43:47.146748	usd	\N	\N	2	1	0	0
aa8a6b75-91c3-4045-8823-a25829463d3f	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 17:44:13.939	\N	2026-01-19 17:44:13.941276	2026-01-19 17:44:13.941276	usd	\N	\N	2	1	0	0
67b91f4e-773e-42c9-8409-4d90151e57bc	chess	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 17:44:41.775	\N	2026-01-19 17:44:41.776941	2026-01-19 17:44:41.776941	usd	\N	\N	2	1	0	0
c368b5c6-f499-42e6-8763-85f8e49aff48	domino	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 17:45:06.363	\N	2026-01-19 17:45:06.364179	2026-01-19 17:45:06.364179	usd	\N	\N	2	1	0	0
db2a7549-5aa3-42c0-813d-fc8e5df1c185	backgammon	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 17:45:21.889	\N	2026-01-19 17:45:21.903328	2026-01-19 17:45:21.903328	usd	\N	\N	2	1	0	0
4a46db13-30d4-4b51-aac7-25093b2e8f5f	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 17:45:39.024	\N	2026-01-19 17:45:39.026974	2026-01-19 17:45:39.026974	usd	\N	\N	2	1	0	0
b230bff6-ad96-4f8f-83ce-60e6cf668565	backgammon	1000.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 17:46:00.559	\N	2026-01-19 17:46:00.56128	2026-01-19 17:46:00.56128	usd	\N	\N	2	1	0	0
85fb7d54-0430-4a77-80d7-7e29e4c33735	chess	5.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 17:46:18.76	\N	2026-01-19 17:46:18.761399	2026-01-19 17:46:18.761399	usd	\N	\N	2	1	0	0
a10ff4c4-4556-4ac4-ab15-04081cd55028	backgammon	100.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 17:46:41.293	\N	2026-01-19 17:46:41.295061	2026-01-19 17:46:41.295061	usd	\N	\N	2	1	0	0
e62c8e9d-80fc-4683-a055-f43df2921171	chess	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 17:47:03.617	\N	2026-01-19 17:47:03.619409	2026-01-19 17:47:03.619409	usd	\N	\N	2	1	0	0
912a68c4-e785-41a9-b175-ab568208b7df	backgammon	1000.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 17:47:19.034	\N	2026-01-19 17:47:19.035789	2026-01-19 17:47:19.035789	usd	\N	\N	2	1	0	0
1484cf61-639b-4ccc-ab65-fa58b2cb724e	chess	25.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 17:47:31.272	\N	2026-01-19 17:47:31.273571	2026-01-19 17:47:31.273571	usd	\N	\N	2	1	0	0
7fe44f0e-141f-457e-9556-1e8bf75a29f5	backgammon	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 17:47:46.642	\N	2026-01-19 17:47:46.644019	2026-01-19 17:47:46.644019	usd	\N	\N	2	1	0	0
e61bd97c-ee28-45ea-a981-6a3f46abbe67	domino	1000.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 17:48:04.269	\N	2026-01-19 17:48:04.270657	2026-01-19 17:48:04.270657	usd	\N	\N	2	1	0	0
69ab1209-b940-44f1-9771-073e8544c379	chess	100.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 17:48:20.02	\N	2026-01-19 17:48:20.021982	2026-01-19 17:48:20.021982	usd	\N	\N	2	1	0	0
95d511da-7d73-4448-b46b-5429a968d2af	domino	100.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 17:48:47.047	\N	2026-01-19 17:48:47.048694	2026-01-19 17:48:47.048694	usd	\N	\N	2	1	0	0
234ca85d-a442-4656-ba1e-598217793cb6	domino	100.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 17:49:26.7	\N	2026-01-19 17:49:26.702039	2026-01-19 17:49:26.702039	usd	\N	\N	2	1	0	0
53c5b14d-82f1-4d40-9f1c-3c18e19e98f5	chess	5.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 17:49:50.462	\N	2026-01-19 17:49:50.464934	2026-01-19 17:49:50.464934	usd	\N	\N	2	1	0	0
3495aadd-800e-455b-8fc5-72561c52733e	chess	5.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 17:50:13.44	\N	2026-01-19 17:50:13.442252	2026-01-19 17:50:13.442252	usd	\N	\N	2	1	0	0
9a236d40-4bb6-4e28-86c3-78e61582b425	domino	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 17:50:33.649	\N	2026-01-19 17:50:33.651315	2026-01-19 17:50:33.651315	usd	\N	\N	2	1	0	0
05f73e8f-93a3-4c5b-8482-88d09b35f5fb	chess	250.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 17:50:51.514	\N	2026-01-19 17:50:51.516073	2026-01-19 17:50:51.516073	usd	\N	\N	2	1	0	0
f96e3f14-934d-4e53-b4f1-4cbf12674798	domino	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 17:51:15.679	\N	2026-01-19 17:51:15.680226	2026-01-19 17:51:15.680226	usd	\N	\N	2	1	0	0
18b19ff5-3d1b-4505-be46-a9d5d51371d5	chess	50.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 17:51:32.809	\N	2026-01-19 17:51:32.810382	2026-01-19 17:51:32.810382	usd	\N	\N	2	1	0	0
16746e22-9e88-4135-819d-8270c60be438	domino	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 17:51:58.335	\N	2026-01-19 17:51:58.337134	2026-01-19 17:51:58.337134	usd	\N	\N	2	1	0	0
62b60af5-27b2-4916-9db9-3b062b0fb4e2	backgammon	5.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 17:52:28.118	\N	2026-01-19 17:52:28.119742	2026-01-19 17:52:28.119742	usd	\N	\N	2	1	0	0
1761d6fe-f176-4c01-b06b-aed2a0b873ee	domino	1000.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 17:52:54.568	\N	2026-01-19 17:52:54.569481	2026-01-19 17:52:54.569481	usd	\N	\N	2	1	0	0
ca0469f9-bd57-4c83-bc88-31554eac4d1f	backgammon	250.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 17:53:19.351	\N	2026-01-19 17:53:19.353748	2026-01-19 17:53:19.353748	usd	\N	\N	2	1	0	0
dd8a8021-9d1c-4446-9a65-72da6aaaf265	chess	500.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 17:53:34.64	\N	2026-01-19 17:53:34.642582	2026-01-19 17:53:34.642582	usd	\N	\N	2	1	0	0
b85f4a4a-925b-4dbf-a273-e8746a016838	chess	100.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 18:04:11.464	\N	2026-01-19 18:04:11.466954	2026-01-19 18:04:11.466954	usd	\N	\N	2	1	0	0
978d72ea-4256-41b4-9ac0-0e0ed7d87053	backgammon	250.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 18:04:32.016	\N	2026-01-19 18:04:32.018036	2026-01-19 18:04:32.018036	usd	\N	\N	2	1	0	0
eed7cb7f-e8f5-402d-af59-3368a0949364	chess	5.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 18:05:00.85	\N	2026-01-19 18:05:00.852439	2026-01-19 18:05:00.852439	usd	\N	\N	2	1	0	0
fd216111-cac2-4802-bad5-40c41ec0aa6d	domino	5.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 18:05:19.454	\N	2026-01-19 18:05:19.455562	2026-01-19 18:05:19.455562	usd	\N	\N	2	1	0	0
bc21dcfc-06b5-406f-8c2c-f31af2b52c0a	backgammon	250.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 18:05:35.41	\N	2026-01-19 18:05:35.411784	2026-01-19 18:05:35.411784	usd	\N	\N	2	1	0	0
0cb322c9-d719-487a-ac61-e79f52fb0052	backgammon	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 18:07:02.459	\N	2026-01-19 18:07:02.461651	2026-01-19 18:07:02.461651	usd	\N	\N	2	1	0	0
8908e7af-2c3d-4ccb-8d51-39ef3d6aea85	chess	100.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 18:07:31.623	\N	2026-01-19 18:07:31.6249	2026-01-19 18:07:31.6249	usd	\N	\N	2	1	0	0
a1518663-81f5-4fb3-927b-31ebc422fecb	domino	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 18:07:57.415	\N	2026-01-19 18:07:57.416438	2026-01-19 18:07:57.416438	usd	\N	\N	2	1	0	0
e6a76111-ebf6-4080-a3e3-47b97fccfaac	chess	250.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 18:08:15.168	\N	2026-01-19 18:08:15.170168	2026-01-19 18:08:15.170168	usd	\N	\N	2	1	0	0
d0c8bddc-41a0-48bb-bf74-fb50ac5b0cf2	backgammon	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 18:08:33.588	\N	2026-01-19 18:08:33.589212	2026-01-19 18:08:33.589212	usd	\N	\N	2	1	0	0
d91650cb-88bc-41b2-8ebb-30d3b1a6a8c6	backgammon	5.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 18:14:20.091	\N	2026-01-19 18:14:20.09329	2026-01-19 18:14:20.09329	usd	\N	\N	2	1	0	0
84644dab-5ad2-4207-9a23-b89e71964210	chess	5.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 18:14:38.455	\N	2026-01-19 18:14:38.456238	2026-01-19 18:14:38.456238	usd	\N	\N	2	1	0	0
fb13806b-78a0-4b83-b72f-51be0def6209	domino	5.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 18:15:00.437	\N	2026-01-19 18:15:00.438452	2026-01-19 18:15:00.438452	usd	\N	\N	2	1	0	0
6fe05617-406b-451b-9715-76026adc57f6	chess	500.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 18:15:21.366	\N	2026-01-19 18:15:21.366906	2026-01-19 18:15:21.366906	usd	\N	\N	2	1	0	0
04559664-ba36-46a4-96c0-a9cc099c70bb	backgammon	5.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 18:15:43.271	\N	2026-01-19 18:15:43.27305	2026-01-19 18:15:43.27305	usd	\N	\N	2	1	0	0
1e48367f-6009-47bc-b16b-cae5650d5172	chess	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 18:18:50.056	\N	2026-01-19 18:18:50.058375	2026-01-19 18:18:50.058375	usd	\N	\N	2	1	0	0
0eb75e31-e22f-4729-afea-cbc15d65571e	domino	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 18:19:16.316	\N	2026-01-19 18:19:16.317587	2026-01-19 18:19:16.317587	usd	\N	\N	2	1	0	0
ae9729c6-97b5-455a-81de-6baa920b4fa1	chess	500.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 18:19:49.601	\N	2026-01-19 18:19:49.602759	2026-01-19 18:19:49.602759	usd	\N	\N	2	1	0	0
70ab8e53-0767-45ad-8b79-16e666190575	backgammon	10.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 18:20:08.446	\N	2026-01-19 18:20:08.447342	2026-01-19 18:20:08.447342	usd	\N	\N	2	1	0	0
9e24661f-e4f1-4609-86df-9b6f9d6efc90	chess	250.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 18:20:29.966	\N	2026-01-19 18:20:29.967392	2026-01-19 18:20:29.967392	usd	\N	\N	2	1	0	0
b91e6633-52b6-46ae-9370-1a89e4282634	backgammon	500.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 18:20:53.309	\N	2026-01-19 18:20:53.310402	2026-01-19 18:20:53.310402	usd	\N	\N	2	1	0	0
cf4cdbe0-208d-4404-8ecd-c185e8fe93c5	chess	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 18:21:20.062	\N	2026-01-19 18:21:20.063096	2026-01-19 18:21:20.063096	usd	\N	\N	2	1	0	0
87df3e19-aece-4b6f-94b6-9f8e82a25116	domino	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 18:21:40.187	\N	2026-01-19 18:21:40.190835	2026-01-19 18:21:40.190835	usd	\N	\N	2	1	0	0
4cc07c2a-dd4b-488c-ae80-9ff374082cd9	chess	10.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 18:22:08.991	\N	2026-01-19 18:22:08.992661	2026-01-19 18:22:08.992661	usd	\N	\N	2	1	0	0
c468b5db-8d48-4c35-928d-c22d24decb09	domino	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 18:22:28.399	\N	2026-01-19 18:22:28.400594	2026-01-19 18:22:28.400594	usd	\N	\N	2	1	0	0
55bfdca3-1805-49ae-833c-7ef8a6895a91	chess	25.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 18:22:36.352	\N	2026-01-19 18:22:36.354168	2026-01-19 18:22:36.354168	usd	\N	\N	2	1	0	0
7a898cfb-d378-46db-96a2-504650605304	domino	100.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 18:23:01.92	\N	2026-01-19 18:23:01.921134	2026-01-19 18:23:01.921134	usd	\N	\N	2	1	0	0
4defdd04-e0a2-445f-a64b-f6434dc20752	backgammon	250.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 18:23:29.18	\N	2026-01-19 18:23:29.182077	2026-01-19 18:23:29.182077	usd	\N	\N	2	1	0	0
bd15cff4-bcd8-472a-882e-e729064e1073	chess	50.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 18:23:57.839	\N	2026-01-19 18:23:57.840965	2026-01-19 18:23:57.840965	usd	\N	\N	2	1	0	0
477906f1-fc32-495b-ba81-cc797839b991	domino	1000.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 18:24:21.148	\N	2026-01-19 18:24:21.149435	2026-01-19 18:24:21.149435	usd	\N	\N	2	1	0	0
014af2dc-e52a-44c1-a388-b201c10b1909	domino	250.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 18:30:52.852	\N	2026-01-19 18:30:52.861963	2026-01-19 18:30:52.861963	usd	\N	\N	2	1	0	0
2f080586-3038-46f5-bc19-c3e5e313a48e	backgammon	500.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 18:31:10.855	\N	2026-01-19 18:31:10.860704	2026-01-19 18:31:10.860704	usd	\N	\N	2	1	0	0
b5aee703-79db-4334-8323-630196bb31b6	domino	10.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 18:31:31.396	\N	2026-01-19 18:31:31.397426	2026-01-19 18:31:31.397426	usd	\N	\N	2	1	0	0
78804f82-cc33-4c83-8f59-48d6a4267276	chess	100.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 18:31:53.843	\N	2026-01-19 18:31:53.849703	2026-01-19 18:31:53.849703	usd	\N	\N	2	1	0	0
e460584c-65d7-45a4-b02b-f4ab4efdbd44	domino	25.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 18:32:17.429	\N	2026-01-19 18:32:17.429907	2026-01-19 18:32:17.429907	usd	\N	\N	2	1	0	0
347256af-3390-46e1-b1f2-de6cf1a5d057	backgammon	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 18:34:02.841	\N	2026-01-19 18:34:02.843549	2026-01-19 18:34:02.843549	usd	\N	\N	2	1	0	0
c7a122d9-f816-4cc6-b64e-2d0d972a37a2	chess	500.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 18:34:23.829	\N	2026-01-19 18:34:23.831741	2026-01-19 18:34:23.831741	usd	\N	\N	2	1	0	0
007bb8d7-3ed2-486a-8dff-9da101bf87a4	backgammon	50.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 18:34:41.388	\N	2026-01-19 18:34:41.389555	2026-01-19 18:34:41.389555	usd	\N	\N	2	1	0	0
b7826898-922c-427a-a9d9-20f5d439211e	chess	5.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 18:35:13.663	\N	2026-01-19 18:35:13.667243	2026-01-19 18:35:13.667243	usd	\N	\N	2	1	0	0
2c664edd-cbd1-4f91-a149-027b13556621	chess	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 18:35:28.374	\N	2026-01-19 18:35:28.376311	2026-01-19 18:35:28.376311	usd	\N	\N	2	1	0	0
bb1abd4c-90b1-4d42-a1b8-229d89fef584	backgammon	100.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 18:35:53.386	\N	2026-01-19 18:35:53.387238	2026-01-19 18:35:53.387238	usd	\N	\N	2	1	0	0
57d7f802-b7fc-4b14-98f1-8a2c2df25bbb	domino	100.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 18:36:12.988	\N	2026-01-19 18:36:12.990478	2026-01-19 18:36:12.990478	usd	\N	\N	2	1	0	0
5ac4239e-cf54-4a56-b7c6-0c70723201b7	backgammon	250.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 18:36:32.953	\N	2026-01-19 18:36:32.954728	2026-01-19 18:36:32.954728	usd	\N	\N	2	1	0	0
aa3146b9-b14d-4c5f-b872-e243fc9b0296	domino	250.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 18:36:49.128	\N	2026-01-19 18:36:49.129475	2026-01-19 18:36:49.129475	usd	\N	\N	2	1	0	0
e29b4470-dfa2-44d7-8f2e-906be60e135f	domino	100.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 18:37:40.891	\N	2026-01-19 18:37:40.893461	2026-01-19 18:37:40.893461	usd	\N	\N	2	1	0	0
986a34eb-8a07-4998-9e04-77708931e1e2	chess	10.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 18:38:02.571	\N	2026-01-19 18:38:02.574276	2026-01-19 18:38:02.574276	usd	\N	\N	2	1	0	0
cbd6c0b9-00ed-4c39-ac4e-166b6b9f79c3	backgammon	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 18:38:33.52	\N	2026-01-19 18:38:33.522406	2026-01-19 18:38:33.522406	usd	\N	\N	2	1	0	0
beeac4ce-4058-4254-a005-293202a141df	domino	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 18:38:49.081	\N	2026-01-19 18:38:49.083489	2026-01-19 18:38:49.083489	usd	\N	\N	2	1	0	0
9bbc2766-5e5a-4523-ae0b-511de2e669ab	backgammon	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 18:39:14.164	\N	2026-01-19 18:39:14.165774	2026-01-19 18:39:14.165774	usd	\N	\N	2	1	0	0
e95bfe5f-9d70-4869-b4c3-46bcb8bd3d72	domino	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 18:39:33.638	\N	2026-01-19 18:39:33.639061	2026-01-19 18:39:33.639061	usd	\N	\N	2	1	0	0
54a2577e-94a7-4038-915a-786783fc48f9	chess	10.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 18:39:53.147	\N	2026-01-19 18:39:53.149419	2026-01-19 18:39:53.149419	usd	\N	\N	2	1	0	0
09e1503b-469f-4411-a683-796e58f62129	domino	500.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 18:40:02.019	\N	2026-01-19 18:40:02.021266	2026-01-19 18:40:02.021266	usd	\N	\N	2	1	0	0
3db8212c-6a6f-42ed-98f7-9224da35c158	chess	25.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 18:40:23.891	\N	2026-01-19 18:40:23.892554	2026-01-19 18:40:23.892554	usd	\N	\N	2	1	0	0
dda568e1-0301-4496-9c44-7d5bb092695b	domino	100.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 18:40:39.281	\N	2026-01-19 18:40:39.283116	2026-01-19 18:40:39.283116	usd	\N	\N	2	1	0	0
0084b38f-f523-48a9-a03d-6d8c277a575f	backgammon	10.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 18:40:53.225	\N	2026-01-19 18:40:53.226698	2026-01-19 18:40:53.226698	usd	\N	\N	2	1	0	0
a65c7f03-7b36-40f6-a927-cf8d34e4ce12	chess	50.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 18:41:20.603	\N	2026-01-19 18:41:20.604987	2026-01-19 18:41:20.604987	usd	\N	\N	2	1	0	0
33b222aa-3eb2-4e9d-a539-3841a43c6ed2	domino	25.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 18:41:40.702	\N	2026-01-19 18:41:40.703819	2026-01-19 18:41:40.703819	usd	\N	\N	2	1	0	0
690f8375-53a6-4ddd-b2b2-55fe4ab3f235	backgammon	5.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 18:42:03.523	\N	2026-01-19 18:42:03.525113	2026-01-19 18:42:03.525113	usd	\N	\N	2	1	0	0
a15c2790-97c6-42a5-8154-ea6c094dbb56	domino	100.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 18:42:22.184	\N	2026-01-19 18:42:22.186706	2026-01-19 18:42:22.186706	usd	\N	\N	2	1	0	0
3186e7d0-b9f3-4681-9b44-b6e445b5f1d2	backgammon	50.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 18:42:42.473	\N	2026-01-19 18:42:42.475776	2026-01-19 18:42:42.475776	usd	\N	\N	2	1	0	0
3b16e957-3797-4b7f-ad2d-4eca7f4b2aab	chess	10.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 18:43:01.135	\N	2026-01-19 18:43:01.136459	2026-01-19 18:43:01.136459	usd	\N	\N	2	1	0	0
0ccd13e5-7bfd-4652-842e-b82d7b35f991	backgammon	500.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 18:43:17.175	\N	2026-01-19 18:43:17.176628	2026-01-19 18:43:17.176628	usd	\N	\N	2	1	0	0
8aad24f1-e67c-41c2-8132-fadf3199812d	backgammon	50.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 18:49:47.303	\N	2026-01-19 18:49:47.305465	2026-01-19 18:49:47.305465	usd	\N	\N	2	1	0	0
67b02a45-9c98-4c42-8383-9c0dfe4c5e4b	domino	10.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 18:50:02.588	\N	2026-01-19 18:50:02.589947	2026-01-19 18:50:02.589947	usd	\N	\N	2	1	0	0
e9192a01-93e4-4834-bb92-e9798c43753a	chess	500.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 18:50:19.823	\N	2026-01-19 18:50:19.824069	2026-01-19 18:50:19.824069	usd	\N	\N	2	1	0	0
f3f350b1-215f-4240-8c2b-9bbbac951303	chess	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 18:50:56.256	\N	2026-01-19 18:50:56.257654	2026-01-19 18:50:56.257654	usd	\N	\N	2	1	0	0
ed9d6dc1-cab1-4f95-9fc0-a11b8fc0afd7	domino	500.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 18:51:23.568	\N	2026-01-19 18:51:23.569486	2026-01-19 18:51:23.569486	usd	\N	\N	2	1	0	0
11b973df-3add-4bfb-aed9-3c00c37fd8a0	backgammon	500.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 18:51:46.323	\N	2026-01-19 18:51:46.324115	2026-01-19 18:51:46.324115	usd	\N	\N	2	1	0	0
0fc17e03-eb4d-46ae-bc92-b0b2030b44cf	domino	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 18:52:03.663	\N	2026-01-19 18:52:03.741198	2026-01-19 18:52:03.741198	usd	\N	\N	2	1	0	0
f55c254f-0558-4a03-91af-c804f29c90aa	chess	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 18:52:27.488	\N	2026-01-19 18:52:27.489982	2026-01-19 18:52:27.489982	usd	\N	\N	2	1	0	0
ef4b5d69-e103-48a1-8d3b-1d5b0d408626	domino	50.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 18:57:23.907	\N	2026-01-19 18:57:23.909178	2026-01-19 18:57:23.909178	usd	\N	\N	2	1	0	0
d834cbf1-7a6e-4ea2-a785-67f462e0463f	chess	5.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 18:57:48.2	\N	2026-01-19 18:57:48.201836	2026-01-19 18:57:48.201836	usd	\N	\N	2	1	0	0
d9466389-02e6-44cb-a2ad-c333df0962b2	backgammon	500.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 18:58:08.414	\N	2026-01-19 18:58:08.415599	2026-01-19 18:58:08.415599	usd	\N	\N	2	1	0	0
284ab36b-3916-4819-b2f5-6c02184e93b4	chess	25.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 18:58:25.641	\N	2026-01-19 18:58:25.643624	2026-01-19 18:58:25.643624	usd	\N	\N	2	1	0	0
ccd3950b-d7f8-4a09-aaf2-e9fa89e797a7	backgammon	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 18:58:38.357	\N	2026-01-19 18:58:38.361717	2026-01-19 18:58:38.361717	usd	\N	\N	2	1	0	0
fa7ebaaa-a8c1-4503-b0f6-3a729d747938	domino	250.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 18:58:55.532	\N	2026-01-19 18:58:55.533761	2026-01-19 18:58:55.533761	usd	\N	\N	2	1	0	0
50971c2e-6712-4db0-a538-51c5ce493bce	backgammon	5.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 18:59:14.935	\N	2026-01-19 18:59:14.93669	2026-01-19 18:59:14.93669	usd	\N	\N	2	1	0	0
1692f6aa-b82e-4408-b15b-f0988bf8a3d7	chess	500.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 18:59:39.071	\N	2026-01-19 18:59:39.072178	2026-01-19 18:59:39.072178	usd	\N	\N	2	1	0	0
1c0cddbf-ade5-471b-9b36-b1993d5be6d9	backgammon	5.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 19:00:02.647	\N	2026-01-19 19:00:02.655707	2026-01-19 19:00:02.655707	usd	\N	\N	2	1	0	0
d48bc4af-4ffc-4330-946a-c3089f293677	backgammon	50.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 19:13:02.637	\N	2026-01-19 19:13:02.639349	2026-01-19 19:13:02.639349	usd	\N	\N	2	1	0	0
b9ba77ff-9859-4974-9533-b2815ad770d6	chess	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 19:13:31.763	\N	2026-01-19 19:13:31.765248	2026-01-19 19:13:31.765248	usd	\N	\N	2	1	0	0
66b06130-6d49-437e-9716-4c2b9ead638b	domino	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 19:13:53.619	\N	2026-01-19 19:13:53.620544	2026-01-19 19:13:53.620544	usd	\N	\N	2	1	0	0
6714aad6-7e5d-4dd0-b61c-86ca08358b43	backgammon	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 19:14:13.354	\N	2026-01-19 19:14:13.355488	2026-01-19 19:14:13.355488	usd	\N	\N	2	1	0	0
34817cc9-add0-485b-ac1d-6c5eb390f0b4	chess	1000.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 19:14:42.341	\N	2026-01-19 19:14:42.342315	2026-01-19 19:14:42.342315	usd	\N	\N	2	1	0	0
031db926-30da-440b-b222-bfa499452be7	backgammon	5.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 19:14:59.759	\N	2026-01-19 19:14:59.761037	2026-01-19 19:14:59.761037	usd	\N	\N	2	1	0	0
a488a2e0-a42b-4900-bd66-20d2245b97d3	domino	10.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 19:15:19.765	\N	2026-01-19 19:15:19.766673	2026-01-19 19:15:19.766673	usd	\N	\N	2	1	0	0
032792b2-273b-4b0f-bd0b-494662aab961	backgammon	1000.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 19:15:36	\N	2026-01-19 19:15:36.002473	2026-01-19 19:15:36.002473	usd	\N	\N	2	1	0	0
cd102e17-6d62-49a3-b37c-513d971c99f6	domino	100.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 19:16:28.988	\N	2026-01-19 19:16:28.989445	2026-01-19 19:16:28.989445	usd	\N	\N	2	1	0	0
10f9f755-9721-47d4-b196-ecf8560aad0b	backgammon	5.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 19:16:45.186	\N	2026-01-19 19:16:45.241739	2026-01-19 19:16:45.241739	usd	\N	\N	2	1	0	0
3889643f-c3f2-4f00-8fd0-43d877c33a46	chess	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 19:17:02.461	\N	2026-01-19 19:17:02.465281	2026-01-19 19:17:02.465281	usd	\N	\N	2	1	0	0
698ac104-1bcf-4192-8d1d-5befddb79a48	domino	250.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 19:17:27.979	\N	2026-01-19 19:17:27.980431	2026-01-19 19:17:27.980431	usd	\N	\N	2	1	0	0
f7e67ff8-707b-4435-aba8-b67ca2281a61	chess	5.00000000	public	completed	ad92f2f2-89e3-47ed-a10e-6ed23626e440	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 19:16:01.127	2026-01-19 19:43:47.598	2026-01-19 19:16:01.12843	2026-01-19 19:43:47.598	usd	\N	\N	2	1	0	0
8617f1ad-3845-429c-993b-d9b929505f69	backgammon	500.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 19:43:55.846	\N	2026-01-19 19:43:55.847821	2026-01-19 19:43:55.847821	usd	\N	\N	2	1	0	0
6cd6a2a0-24e7-42a0-8fbf-f81b2e3eae2b	domino	1000.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 19:50:14.635	\N	2026-01-19 19:50:14.637183	2026-01-19 19:50:14.637183	usd	\N	\N	2	1	0	0
3c16d8f6-858a-448d-a7ec-8a9afd51a857	backgammon	5.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 19:50:32.022	\N	2026-01-19 19:50:32.024318	2026-01-19 19:50:32.024318	usd	\N	\N	2	1	0	0
9df8daa4-19a0-4de7-a245-e5042e8c839d	domino	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 19:51:00.208	\N	2026-01-19 19:51:00.210861	2026-01-19 19:51:00.210861	usd	\N	\N	2	1	0	0
7815176b-e418-4725-84a9-1d46a9a3d2b4	chess	25.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 19:51:24.427	\N	2026-01-19 19:51:24.430358	2026-01-19 19:51:24.430358	usd	\N	\N	2	1	0	0
f4037f78-8d19-4f2a-a12e-e8e1c167c462	backgammon	500.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 19:51:47.785	\N	2026-01-19 19:51:47.786454	2026-01-19 19:51:47.786454	usd	\N	\N	2	1	0	0
a72eb4e7-6edd-49fe-afdd-cff96344091e	chess	5.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 19:52:13.957	\N	2026-01-19 19:52:13.959578	2026-01-19 19:52:13.959578	usd	\N	\N	2	1	0	0
09ec3f09-b8b2-469e-bad5-f36b834bca3b	backgammon	1000.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 19:52:30.107	\N	2026-01-19 19:52:30.109257	2026-01-19 19:52:30.109257	usd	\N	\N	2	1	0	0
30a54508-dbf6-4e0d-8441-60336e6aaaa6	domino	50.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 19:52:56.491	\N	2026-01-19 19:52:56.492424	2026-01-19 19:52:56.492424	usd	\N	\N	2	1	0	0
ad48f0fa-7bfd-43ef-ab05-a5e7c128a0e9	backgammon	500.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 19:53:19.878	\N	2026-01-19 19:53:19.879715	2026-01-19 19:53:19.879715	usd	\N	\N	2	1	0	0
38cf29dc-4750-4c2e-b536-572aadc6f0a5	backgammon	500.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 19:53:35.186	\N	2026-01-19 19:53:35.188513	2026-01-19 19:53:35.188513	usd	\N	\N	2	1	0	0
4e72fb93-11e7-487f-9036-fc0288ef51a2	domino	500.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 19:53:57.824	\N	2026-01-19 19:53:57.826266	2026-01-19 19:53:57.826266	usd	\N	\N	2	1	0	0
be85f409-998b-4440-a976-d4dcd7e04ade	chess	10.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 19:54:21.264	\N	2026-01-19 19:54:21.265649	2026-01-19 19:54:21.265649	usd	\N	\N	2	1	0	0
2aaaa41e-dc33-470d-a83d-4f76ba6f74d1	backgammon	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 19:54:39.989	\N	2026-01-19 19:54:39.990078	2026-01-19 19:54:39.990078	usd	\N	\N	2	1	0	0
0bc7cb03-8627-465b-bac4-e7fd24c6a0af	domino	1000.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 19:54:48.902	\N	2026-01-19 19:54:48.90356	2026-01-19 19:54:48.90356	usd	\N	\N	2	1	0	0
952670b6-4434-4a06-bff4-dcb81dc03835	backgammon	100.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 19:55:07.118	\N	2026-01-19 19:55:07.119454	2026-01-19 19:55:07.119454	usd	\N	\N	2	1	0	0
5a6cb643-1e15-4402-a59a-baeae99d6a7e	domino	25.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 19:55:22.428	\N	2026-01-19 19:55:22.430313	2026-01-19 19:55:22.430313	usd	\N	\N	2	1	0	0
9c59edfc-295a-42c0-99cf-a1f7a04f0ee7	backgammon	1000.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 19:55:30.03	\N	2026-01-19 19:55:30.031822	2026-01-19 19:55:30.031822	usd	\N	\N	2	1	0	0
14affff8-1b69-4b21-9c31-68f67ffc997e	chess	1000.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 19:55:50.875	\N	2026-01-19 19:55:50.876542	2026-01-19 19:55:50.876542	usd	\N	\N	2	1	0	0
98a767b8-1756-4cb8-9c11-0754c7ffecac	backgammon	1000.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 19:56:19.1	\N	2026-01-19 19:56:19.101391	2026-01-19 19:56:19.101391	usd	\N	\N	2	1	0	0
1c5af05a-8c01-4f4f-925a-01983079b117	domino	5.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-19 19:56:38.796	\N	2026-01-19 19:56:38.798026	2026-01-19 19:56:38.798026	usd	\N	\N	2	1	0	0
bc830a86-29f6-48fa-b220-91713f7e1af7	chess	50.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 19:56:48.464	\N	2026-01-19 19:56:48.466185	2026-01-19 19:56:48.466185	usd	\N	\N	2	1	0	0
d2027f56-cc65-4583-9f82-f13bbc5e975a	domino	25.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 19:57:14.792	\N	2026-01-19 19:57:14.794525	2026-01-19 19:57:14.794525	usd	\N	\N	2	1	0	0
97ea4a37-64c0-4048-9e36-87266a482ef3	chess	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 19:57:40.394	\N	2026-01-19 19:57:40.396197	2026-01-19 19:57:40.396197	usd	\N	\N	2	1	0	0
24b85a79-3afa-40d5-9978-89b8b74bc354	domino	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 19:58:00.525	\N	2026-01-19 19:58:00.527051	2026-01-19 19:58:00.527051	usd	\N	\N	2	1	0	0
2dee1429-0d52-49e8-b231-773858f30114	backgammon	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 19:58:19.884	\N	2026-01-19 19:58:19.885846	2026-01-19 19:58:19.885846	usd	\N	\N	2	1	0	0
1af8f549-2532-4965-888f-c294ecdf8416	backgammon	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 20:14:08.27	\N	2026-01-19 20:14:08.27214	2026-01-19 20:14:08.27214	usd	\N	\N	2	1	0	0
c1964a49-c82a-42e6-bfaa-183ff0896fdf	backgammon	5.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 20:14:55.329	\N	2026-01-19 20:14:55.330721	2026-01-19 20:14:55.330721	usd	\N	\N	2	1	0	0
7e22e5c4-0c7c-4fc5-b874-7840c9ceb353	domino	100.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 20:15:15.567	\N	2026-01-19 20:15:15.568971	2026-01-19 20:15:15.568971	usd	\N	\N	2	1	0	0
15e9c82a-d1f1-4433-9966-2b130e7e608d	chess	1000.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 20:15:41.461	\N	2026-01-19 20:15:41.46304	2026-01-19 20:15:41.46304	usd	\N	\N	2	1	0	0
87207a8b-3b92-4a33-9eb3-eb0bb1e427ae	backgammon	50.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 20:16:03.561	\N	2026-01-19 20:16:03.56281	2026-01-19 20:16:03.56281	usd	\N	\N	2	1	0	0
9b921dd4-39db-41c0-873e-cb80481a80a9	chess	5.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 20:16:22.705	\N	2026-01-19 20:16:22.706954	2026-01-19 20:16:22.706954	usd	\N	\N	2	1	0	0
918dcd11-31dd-426f-a23a-452512923950	chess	500.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 20:16:44.441	\N	2026-01-19 20:16:44.443458	2026-01-19 20:16:44.443458	usd	\N	\N	2	1	0	0
87296ef5-0b73-4b36-bbc0-3c77e37fda6d	backgammon	25.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 20:17:07.936	\N	2026-01-19 20:17:07.936936	2026-01-19 20:17:07.936936	usd	\N	\N	2	1	0	0
9cc6b9f9-d493-4c3d-b287-44b8d53ae45e	domino	250.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 20:17:30.255	\N	2026-01-19 20:17:30.259693	2026-01-19 20:17:30.259693	usd	\N	\N	2	1	0	0
3a8b7fa7-c68c-473d-9dd1-ce06f995689e	chess	50.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 20:17:46.958	\N	2026-01-19 20:17:46.960104	2026-01-19 20:17:46.960104	usd	\N	\N	2	1	0	0
09576b47-267d-4b22-9e77-b793d82d5517	domino	25.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 20:18:15.216	\N	2026-01-19 20:18:15.217943	2026-01-19 20:18:15.217943	usd	\N	\N	2	1	0	0
e985c62a-623f-411f-b5a1-26394d5e205b	backgammon	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 20:23:19.676	\N	2026-01-19 20:23:19.67895	2026-01-19 20:23:19.67895	usd	\N	\N	2	1	0	0
93eea950-6c20-4afb-8333-8bf09f9da23a	chess	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 20:23:46.787	\N	2026-01-19 20:23:46.788316	2026-01-19 20:23:46.788316	usd	\N	\N	2	1	0	0
22feb18e-c77b-4fd8-9203-6d51a1e172c2	backgammon	1000.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 20:24:09.38	\N	2026-01-19 20:24:09.38126	2026-01-19 20:24:09.38126	usd	\N	\N	2	1	0	0
49278408-89c8-4c35-8053-5843de6f0cd1	domino	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 20:24:57.114	\N	2026-01-19 20:24:57.116569	2026-01-19 20:24:57.116569	usd	\N	\N	2	1	0	0
6910adc5-82f8-4625-862d-7653f6329e9e	chess	1000.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 20:25:13.763	\N	2026-01-19 20:25:13.76465	2026-01-19 20:25:13.76465	usd	\N	\N	2	1	0	0
77750c2f-50e1-4ebc-9c83-5eb6b3533a7b	backgammon	100.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 20:25:29.032	\N	2026-01-19 20:25:29.033808	2026-01-19 20:25:29.033808	usd	\N	\N	2	1	0	0
d7dc7a7d-00a5-453d-9bd1-3639b0579a16	domino	5.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 20:25:46.261	\N	2026-01-19 20:25:46.262417	2026-01-19 20:25:46.262417	usd	\N	\N	2	1	0	0
8253ce1c-afd1-4e60-a499-308a71bb7398	chess	10.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 20:26:04.038	\N	2026-01-19 20:26:04.039572	2026-01-19 20:26:04.039572	usd	\N	\N	2	1	0	0
da7d0de2-0d9c-4bdf-849b-ccd666d4a8c4	backgammon	1000.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 20:26:34.148	\N	2026-01-19 20:26:34.155512	2026-01-19 20:26:34.155512	usd	\N	\N	2	1	0	0
ec3efb3c-2c72-433c-b3a2-9fa410b15de5	domino	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 20:26:50.339	\N	2026-01-19 20:26:50.341064	2026-01-19 20:26:50.341064	usd	\N	\N	2	1	0	0
7179758d-4667-4a80-8d07-331b271c7177	chess	100.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 20:27:07.063	\N	2026-01-19 20:27:07.065906	2026-01-19 20:27:07.065906	usd	\N	\N	2	1	0	0
2898f03b-f7a5-4f83-bd15-66706b887bef	backgammon	10.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 20:27:22.442	\N	2026-01-19 20:27:22.443325	2026-01-19 20:27:22.443325	usd	\N	\N	2	1	0	0
8b62df5d-7cd6-4714-970d-f0a6a220463b	domino	100.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 20:27:55.227	\N	2026-01-19 20:27:55.229167	2026-01-19 20:27:55.229167	usd	\N	\N	2	1	0	0
e97cb13d-b378-47a6-8dc0-74cd39b050d1	backgammon	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 20:28:14.6	\N	2026-01-19 20:28:14.601949	2026-01-19 20:28:14.601949	usd	\N	\N	2	1	0	0
d10cc441-6aff-4fd8-8fbf-9f82e6abbc27	backgammon	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 20:28:47.973	\N	2026-01-19 20:28:47.974557	2026-01-19 20:28:47.974557	usd	\N	\N	2	1	0	0
668c7112-0d28-4a71-b697-ad7ab79dd730	backgammon	25.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 20:29:39.99	\N	2026-01-19 20:29:39.992052	2026-01-19 20:29:39.992052	usd	\N	\N	2	1	0	0
e2b52b74-41fc-4d26-a650-c176a006398e	chess	25.00000000	public	completed	4c22629a-ae59-4cc3-828e-8bfeb868dfba	a955ff28-c8c8-45cb-aafa-ea60c086139f	a955ff28-c8c8-45cb-aafa-ea60c086139f	random	\N	600	0	0	2026-01-19 20:28:32.356	2026-01-19 20:36:45.686	2026-01-19 20:28:32.359174	2026-01-19 20:36:45.686	usd	\N	\N	2	1	0	0
0033fc06-e7c5-4253-9438-08baf3fb7653	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 20:37:01.941	\N	2026-01-19 20:37:01.94274	2026-01-19 20:37:01.94274	usd	\N	\N	2	1	0	0
badb8f79-cc9e-43bf-91e8-662e9396f3e1	chess	250.00000000	public	completed	4d358b24-397b-4020-87f3-de6acaf35864	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 20:29:14.649	2026-01-19 20:55:16.7	2026-01-19 20:29:14.650464	2026-01-19 20:55:16.7	usd	\N	\N	2	1	0	0
b0f33156-88c2-4083-974a-55380dd27338	backgammon	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 20:55:41.465	\N	2026-01-19 20:55:41.466284	2026-01-19 20:55:41.466284	usd	\N	\N	2	1	0	0
1a41c60f-c50c-4c32-a790-c0d6dc6b75a1	chess	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 23:33:01.623	\N	2026-01-19 23:33:01.624734	2026-01-19 23:33:01.624734	usd	\N	\N	2	1	0	0
9680d90b-a360-426c-a48e-04967a1f6121	domino	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 23:33:25.352	\N	2026-01-19 23:33:25.353812	2026-01-19 23:33:25.353812	usd	\N	\N	2	1	0	0
2c7a1832-ced1-401e-b88a-d72e4388c713	chess	10.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 23:33:57.373	\N	2026-01-19 23:33:57.375408	2026-01-19 23:33:57.375408	usd	\N	\N	2	1	0	0
0075e40b-1af4-4d1c-a11f-6d9d40d96271	backgammon	5.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 23:34:19.718	\N	2026-01-19 23:34:19.719456	2026-01-19 23:34:19.719456	usd	\N	\N	2	1	0	0
7c564197-ab2f-4bee-ad1d-c282dc6661a1	chess	100.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 23:34:46.513	\N	2026-01-19 23:34:46.514195	2026-01-19 23:34:46.514195	usd	\N	\N	2	1	0	0
d01deb27-dd4b-47dc-9fdf-7c5de1de86c4	domino	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 23:35:16.632	\N	2026-01-19 23:35:16.633674	2026-01-19 23:35:16.633674	usd	\N	\N	2	1	0	0
61d83824-850a-4e92-b6cc-73839bb9c726	chess	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 23:35:44.297	\N	2026-01-19 23:35:44.29911	2026-01-19 23:35:44.29911	usd	\N	\N	2	1	0	0
d384ec22-7705-4ee6-a106-3dc2d6019be2	backgammon	50.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 23:36:11.972	\N	2026-01-19 23:36:11.974143	2026-01-19 23:36:11.974143	usd	\N	\N	2	1	0	0
19a26aff-84c8-4c31-9019-e51234e3b292	backgammon	250.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 23:36:40.764	\N	2026-01-19 23:36:40.765592	2026-01-19 23:36:40.765592	usd	\N	\N	2	1	0	0
2c89e396-d6c4-4785-889f-eab6a7ba1337	domino	25.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-19 23:37:04.984	\N	2026-01-19 23:37:04.986313	2026-01-19 23:37:04.986313	usd	\N	\N	2	1	0	0
f5f54c44-4d2c-4dae-89a0-b88f60ed2c8d	chess	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 23:37:24.425	\N	2026-01-19 23:37:24.427304	2026-01-19 23:37:24.427304	usd	\N	\N	2	1	0	0
03995b89-a63b-41ff-ae0f-e20cfeba4171	domino	100.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 23:37:51.794	\N	2026-01-19 23:37:51.795527	2026-01-19 23:37:51.795527	usd	\N	\N	2	1	0	0
5455e4b9-264c-4d7b-a6d8-a00e8dd9e61b	chess	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-19 23:38:16.246	\N	2026-01-19 23:38:16.248129	2026-01-19 23:38:16.248129	usd	\N	\N	2	1	0	0
9713fef1-6083-47b0-b5da-9eff2fff9215	backgammon	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 23:38:37.793	\N	2026-01-19 23:38:37.80137	2026-01-19 23:38:37.80137	usd	\N	\N	2	1	0	0
6c670f6c-1392-4d35-b5ee-fbad92618533	chess	10.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 23:38:59.445	\N	2026-01-19 23:38:59.447007	2026-01-19 23:38:59.447007	usd	\N	\N	2	1	0	0
a19695b6-4925-44f4-9426-77abdba086d4	backgammon	5.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 23:39:26.81	\N	2026-01-19 23:39:26.812546	2026-01-19 23:39:26.812546	usd	\N	\N	2	1	0	0
6e46d4d0-0c3e-46a5-a435-eacfa0bb9cfa	chess	50.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 23:42:01.996	\N	2026-01-19 23:42:01.998057	2026-01-19 23:42:01.998057	usd	\N	\N	2	1	0	0
39a00a7b-8d00-4dfb-9d1f-85796bb3e1f2	domino	1000.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 23:42:21.33	\N	2026-01-19 23:42:21.331224	2026-01-19 23:42:21.331224	usd	\N	\N	2	1	0	0
7fb05ea3-85c4-4406-9315-86b7f7cdaac2	backgammon	100.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 23:42:36.463	\N	2026-01-19 23:42:36.464431	2026-01-19 23:42:36.464431	usd	\N	\N	2	1	0	0
c7e953af-758a-4b43-b73e-a37726c32bb3	backgammon	100.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-19 23:43:08.923	\N	2026-01-19 23:43:08.924816	2026-01-19 23:43:08.924816	usd	\N	\N	2	1	0	0
640389c0-1166-4ec3-bd49-211f75c6a740	domino	50.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 23:43:25.341	\N	2026-01-19 23:43:25.342482	2026-01-19 23:43:25.342482	usd	\N	\N	2	1	0	0
4ef51e97-9a44-4417-b74d-3835139022e2	chess	5.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 23:43:58.055	\N	2026-01-19 23:43:58.057635	2026-01-19 23:43:58.057635	usd	\N	\N	2	1	0	0
e91cedc6-aa27-4883-948c-0ddd795838a4	domino	5.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 23:44:24.216	\N	2026-01-19 23:44:24.217262	2026-01-19 23:44:24.217262	usd	\N	\N	2	1	0	0
f60f0487-219e-4639-9672-0a6ed0f5428b	chess	100.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 23:44:47.492	\N	2026-01-19 23:44:47.494719	2026-01-19 23:44:47.494719	usd	\N	\N	2	1	0	0
74fb4df9-f18d-4fc4-a0fa-b446d5cd0eda	backgammon	500.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-19 23:45:04.912	\N	2026-01-19 23:45:04.913636	2026-01-19 23:45:04.913636	usd	\N	\N	2	1	0	0
9d0f07bd-dda1-40bd-8d72-55d601af8925	domino	250.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-19 23:45:34.515	\N	2026-01-19 23:45:34.516546	2026-01-19 23:45:34.516546	usd	\N	\N	2	1	0	0
9036fcaa-38c1-40c0-96df-841f13e0730a	chess	10.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 23:45:59.525	\N	2026-01-19 23:45:59.526363	2026-01-19 23:45:59.526363	usd	\N	\N	2	1	0	0
731f6669-2c29-428a-bb96-2c9fff0f6469	backgammon	222.00000000	public	active	377adf3b-56b3-4d0d-922b-3a6ddb3fb524	da6f34a0-2e4c-4b95-92af-c77488d71838	\N	random	\N	600	0	0	2026-01-20 00:07:29.102	\N	2026-01-19 20:31:30.890183	2026-01-20 00:07:29.102	usd	\N	\N	2	1	0	0
7abf2531-921a-4356-a1c4-d086a731a7ca	domino	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 23:46:22.537	\N	2026-01-19 23:46:22.539163	2026-01-19 23:46:22.539163	usd	\N	\N	2	1	0	0
9c6c73ae-4555-4860-a519-90fa335cc3c6	backgammon	500.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-19 23:46:40.546	\N	2026-01-19 23:46:40.547872	2026-01-19 23:46:40.547872	usd	\N	\N	2	1	0	0
ec8526bd-6dcc-4655-a30b-f6248f60edf2	domino	250.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 23:47:00.533	\N	2026-01-19 23:47:00.534326	2026-01-19 23:47:00.534326	usd	\N	\N	2	1	0	0
02d36b34-a2a1-4dae-adf8-2c34fc1cf49b	chess	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-19 23:47:22.464	\N	2026-01-19 23:47:22.465995	2026-01-19 23:47:22.465995	usd	\N	\N	2	1	0	0
5d8dbd36-5356-4410-bc49-75579086a047	backgammon	5.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 23:47:41.722	\N	2026-01-19 23:47:41.723787	2026-01-19 23:47:41.723787	usd	\N	\N	2	1	0	0
1702dc28-7825-44f2-af0c-b98717a9ac3e	chess	250.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-19 23:48:04.874	\N	2026-01-19 23:48:04.875639	2026-01-19 23:48:04.875639	usd	\N	\N	2	1	0	0
a2e90c5d-2787-4501-8694-b5dc42b9724d	domino	25.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-19 23:48:20.372	\N	2026-01-19 23:48:20.374014	2026-01-19 23:48:20.374014	usd	\N	\N	2	1	0	0
f90c6f10-ffaf-4bce-85e0-1e93ea71bc54	backgammon	250.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-19 23:48:50.201	\N	2026-01-19 23:48:50.202997	2026-01-19 23:48:50.202997	usd	\N	\N	2	1	0	0
0a3c44fd-425c-4dd1-9099-5442470b8fef	backgammon	1000.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-19 23:49:19.168	\N	2026-01-19 23:49:19.169328	2026-01-19 23:49:19.169328	usd	\N	\N	2	1	0	0
0d7a5dea-0d5b-4c13-bc99-a935e10bd782	domino	5.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 23:49:35.527	\N	2026-01-19 23:49:35.527889	2026-01-19 23:49:35.527889	usd	\N	\N	2	1	0	0
f4df5ef3-5d6e-4e45-b874-b5639d959da9	backgammon	5.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 23:49:58.934	\N	2026-01-19 23:49:58.936186	2026-01-19 23:49:58.936186	usd	\N	\N	2	1	0	0
6b9514d4-53d9-4219-9323-8260b0d95a5f	chess	10.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-19 23:50:26.207	\N	2026-01-19 23:50:26.208597	2026-01-19 23:50:26.208597	usd	\N	\N	2	1	0	0
7fe024c1-fefb-4e05-8a36-cc24f8ed0f7c	domino	5.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 23:50:56.204	\N	2026-01-19 23:50:56.205495	2026-01-19 23:50:56.205495	usd	\N	\N	2	1	0	0
a1eff104-eb07-4a9b-81d8-593031a81683	chess	100.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-19 23:51:21.514	\N	2026-01-19 23:51:21.514922	2026-01-19 23:51:21.514922	usd	\N	\N	2	1	0	0
6ffbbb8d-8ff3-44c7-bbb0-7d76576c9c82	backgammon	250.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-19 23:51:43.628	\N	2026-01-19 23:51:43.63247	2026-01-19 23:51:43.63247	usd	\N	\N	2	1	0	0
e1699c99-db40-42fb-bd5f-dcac6b50ca8c	domino	25.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-19 23:52:15.723	\N	2026-01-19 23:52:15.724396	2026-01-19 23:52:15.724396	usd	\N	\N	2	1	0	0
33a1a82a-953c-4fa8-b016-140e0d948ff6	chess	500.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-19 23:52:44.716	\N	2026-01-19 23:52:44.728828	2026-01-19 23:52:44.728828	usd	\N	\N	2	1	0	0
5258182d-e11b-4850-93f6-68038d850671	backgammon	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-19 23:53:04.604	\N	2026-01-19 23:53:04.605512	2026-01-19 23:53:04.605512	usd	\N	\N	2	1	0	0
a404321e-9633-4f8b-b1c5-bb4d4b80eab3	chess	1000.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-19 23:53:34.058	\N	2026-01-19 23:53:34.059782	2026-01-19 23:53:34.059782	usd	\N	\N	2	1	0	0
cd87a522-8e90-4d9f-97a9-ac0efd544c94	backgammon	250.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-19 23:53:52.979	\N	2026-01-19 23:53:52.980736	2026-01-19 23:53:52.980736	usd	\N	\N	2	1	0	0
ae792f0c-868e-4f51-8240-9c4096bdadd9	domino	100.00000000	public	active	fd1e958c-afc3-49bc-a229-a1049ff601e3	da6f34a0-2e4c-4b95-92af-c77488d71838	\N	random	\N	600	0	0	2026-01-20 00:06:43.131	\N	2026-01-20 00:05:34.631163	2026-01-20 00:06:43.131	usd	\N	\N	2	1	0	0
46988afd-a368-4a9e-b1f0-9d12221bdc8b	backgammon	10.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-20 00:12:53.359	\N	2026-01-20 00:12:53.360846	2026-01-20 00:12:53.360846	usd	\N	\N	2	1	0	0
8a8a8796-43f5-42e6-b658-752fbc721ec3	chess	10.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-20 00:13:12.584	\N	2026-01-20 00:13:12.586914	2026-01-20 00:13:12.586914	usd	\N	\N	2	1	0	0
bf339657-e217-478f-b3b1-b2d6c4262b93	domino	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-20 00:13:38.673	\N	2026-01-20 00:13:38.675244	2026-01-20 00:13:38.675244	usd	\N	\N	2	1	0	0
3d607a70-d1ce-43ce-a874-3b17d09d1293	chess	10.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-20 00:13:54.574	\N	2026-01-20 00:13:54.575806	2026-01-20 00:13:54.575806	usd	\N	\N	2	1	0	0
c7f4e5f8-1e9d-44a7-9660-f29ae1ba2af0	domino	5.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 00:14:24.456	\N	2026-01-20 00:14:24.45714	2026-01-20 00:14:24.45714	usd	\N	\N	2	1	0	0
b7d6bc79-a7e5-4ac2-bb63-0d84d5785f0f	chess	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 00:14:45.584	\N	2026-01-20 00:14:45.585905	2026-01-20 00:14:45.585905	usd	\N	\N	2	1	0	0
043e7ac0-6d86-4bb4-958c-31d099611079	domino	25.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 00:15:00.768	\N	2026-01-20 00:15:00.769894	2026-01-20 00:15:00.769894	usd	\N	\N	2	1	0	0
58bb75fa-3ccd-455f-8a28-9f97c523f826	backgammon	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-20 00:15:22.687	\N	2026-01-20 00:15:22.688521	2026-01-20 00:15:22.688521	usd	\N	\N	2	1	0	0
2b3ed5bf-2ba2-4d54-8977-410aaffc5ee7	domino	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 00:15:40.885	\N	2026-01-20 00:15:40.886956	2026-01-20 00:15:40.886956	usd	\N	\N	2	1	0	0
b57537b0-068b-4750-bb3b-9a5430241c95	chess	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-20 00:16:10.513	\N	2026-01-20 00:16:10.514828	2026-01-20 00:16:10.514828	usd	\N	\N	2	1	0	0
b75264ea-dcfd-4373-96cc-3f1c833bff11	backgammon	50.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-20 00:16:51.054	\N	2026-01-20 00:16:51.055767	2026-01-20 00:16:51.055767	usd	\N	\N	2	1	0	0
1504e496-c19b-450c-aae6-393ed8520de1	domino	10.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-20 00:17:09.176	\N	2026-01-20 00:17:09.177829	2026-01-20 00:17:09.177829	usd	\N	\N	2	1	0	0
d6018264-aaa7-4f8f-a89f-ddeba058b68b	backgammon	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 00:17:48.098	\N	2026-01-20 00:17:48.099775	2026-01-20 00:17:48.099775	usd	\N	\N	2	1	0	0
9e026c2b-d7d3-4c30-a493-f297012be68a	domino	1000.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-20 00:18:06.01	\N	2026-01-20 00:18:06.012064	2026-01-20 00:18:06.012064	usd	\N	\N	2	1	0	0
e1914012-5f7b-4c5a-b2a9-c274e5e56adc	backgammon	250.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 00:18:35.557	\N	2026-01-20 00:18:35.558437	2026-01-20 00:18:35.558437	usd	\N	\N	2	1	0	0
a75c705e-6e79-404d-aa06-74659f7f7022	chess	5.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-20 00:18:57.027	\N	2026-01-20 00:18:57.02881	2026-01-20 00:18:57.02881	usd	\N	\N	2	1	0	0
63d18cbd-3be7-4dcb-b066-34469e2dd714	domino	100.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 00:19:23.281	\N	2026-01-20 00:19:23.283348	2026-01-20 00:19:23.283348	usd	\N	\N	2	1	0	0
2f6d885a-a3a9-45f1-897e-9c0c0cd281fd	chess	500.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 00:19:40.145	\N	2026-01-20 00:19:40.146698	2026-01-20 00:19:40.146698	usd	\N	\N	2	1	0	0
c269ab76-c782-4738-8a70-6342284f989c	backgammon	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-20 00:20:08.822	\N	2026-01-20 00:20:08.82425	2026-01-20 00:20:08.82425	usd	\N	\N	2	1	0	0
bf539075-3510-4e14-a05a-ad7295a530cc	chess	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-20 00:20:33.112	\N	2026-01-20 00:20:33.115101	2026-01-20 00:20:33.115101	usd	\N	\N	2	1	0	0
35924204-4281-4ea6-bf3c-022978c749fb	domino	250.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 00:20:58.552	\N	2026-01-20 00:20:58.553909	2026-01-20 00:20:58.553909	usd	\N	\N	2	1	0	0
d30a1120-99c8-4c2f-aa13-0bcd3f32bd0b	domino	50.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 00:21:32.387	\N	2026-01-20 00:21:32.389684	2026-01-20 00:21:32.389684	usd	\N	\N	2	1	0	0
0b4f89a3-1e8f-416f-8d4e-a20c943d95fd	chess	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-20 00:21:47.621	\N	2026-01-20 00:21:47.622083	2026-01-20 00:21:47.622083	usd	\N	\N	2	1	0	0
9ed73702-1907-4b68-9f01-8c566dfb2bca	backgammon	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-20 00:22:09.956	\N	2026-01-20 00:22:09.957267	2026-01-20 00:22:09.957267	usd	\N	\N	2	1	0	0
797484c9-2ba8-428e-a4ce-6ccf60bffb2f	backgammon	50.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-20 00:22:37.066	\N	2026-01-20 00:22:37.068059	2026-01-20 00:22:37.068059	usd	\N	\N	2	1	0	0
9d303e11-03f9-4665-88fb-5a9fe46a8e6b	chess	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-20 00:22:52.114	\N	2026-01-20 00:22:52.115446	2026-01-20 00:22:52.115446	usd	\N	\N	2	1	0	0
24495602-f752-414a-b3de-9652b02dd73d	domino	5.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-20 00:23:13.906	\N	2026-01-20 00:23:13.907946	2026-01-20 00:23:13.907946	usd	\N	\N	2	1	0	0
cb1f9561-0011-4302-8e70-7adc3442a4d6	domino	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-20 00:24:03.896	\N	2026-01-20 00:24:03.897899	2026-01-20 00:24:03.897899	usd	\N	\N	2	1	0	0
a54a28b8-1d6f-4788-8ee2-458d5e4ce339	chess	10.00000000	public	completed	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	3f7d7f25-80fd-4402-a898-dee310faf409	3f7d7f25-80fd-4402-a898-dee310faf409	random	\N	600	0	0	2026-01-20 00:23:37.374	2026-01-20 00:25:24.729	2026-01-20 00:23:37.375781	2026-01-20 00:25:24.729	usd	\N	\N	2	1	0	0
0acb78eb-9865-40ae-8dc5-80ddd81a34f9	chess	250.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-20 00:25:31.406	\N	2026-01-20 00:25:31.407468	2026-01-20 00:25:31.407468	usd	\N	\N	2	1	0	0
1782b0ba-d9f5-44cd-9918-f9491cc36da7	domino	25.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-20 00:27:47.039	\N	2026-01-20 00:27:47.040931	2026-01-20 00:27:47.040931	usd	\N	\N	2	1	0	0
4f97470f-133c-4607-87e9-79423584a8de	chess	50.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-20 00:28:11.902	\N	2026-01-20 00:28:11.903217	2026-01-20 00:28:11.903217	usd	\N	\N	2	1	0	0
e2e1f620-2888-48a8-9429-f382c5ac9f71	domino	25.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 00:28:41.779	\N	2026-01-20 00:28:41.78046	2026-01-20 00:28:41.78046	usd	\N	\N	2	1	0	0
b96afa60-61a9-41fb-aa2c-82f72ccc6798	domino	25.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 00:29:19.147	\N	2026-01-20 00:29:19.149906	2026-01-20 00:29:19.149906	usd	\N	\N	2	1	0	0
291f35d9-fee3-455f-8913-b0a6eff3efd1	backgammon	100.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 00:29:46.426	\N	2026-01-20 00:29:46.427815	2026-01-20 00:29:46.427815	usd	\N	\N	2	1	0	0
c3ade015-fc8e-47bf-9bb4-c51f8d6283d1	chess	5.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 00:30:09.037	\N	2026-01-20 00:30:09.041217	2026-01-20 00:30:09.041217	usd	\N	\N	2	1	0	0
895546da-7049-43fc-8cd0-e24c67568094	backgammon	100.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 00:30:29.906	\N	2026-01-20 00:30:29.907541	2026-01-20 00:30:29.907541	usd	\N	\N	2	1	0	0
11dc2c70-e4e8-4dc9-8d83-cbde04df11a6	domino	10.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-20 00:30:45.261	\N	2026-01-20 00:30:45.26206	2026-01-20 00:30:45.26206	usd	\N	\N	2	1	0	0
dc2c13e7-087e-4cfc-8096-3fa2aa3a5bc7	chess	250.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-20 00:32:00.408	\N	2026-01-20 00:32:00.409314	2026-01-20 00:32:00.409314	usd	\N	\N	2	1	0	0
e384fd03-1bba-486a-aa7d-89778fac2df2	domino	5.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-20 00:32:16.597	\N	2026-01-20 00:32:16.598254	2026-01-20 00:32:16.598254	usd	\N	\N	2	1	0	0
3e17153d-9309-4118-82f2-9f1cb3480327	chess	25.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-20 00:32:39.256	\N	2026-01-20 00:32:39.25752	2026-01-20 00:32:39.25752	usd	\N	\N	2	1	0	0
6f09833a-4ffd-4093-9c12-5fea4aa45613	backgammon	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-20 00:33:01.164	\N	2026-01-20 00:33:01.165462	2026-01-20 00:33:01.165462	usd	\N	\N	2	1	0	0
6eef3e3b-df6c-44b9-8b48-790bc66c6b18	chess	1000.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 00:33:23.967	\N	2026-01-20 00:33:23.968544	2026-01-20 00:33:23.968544	usd	\N	\N	2	1	0	0
054c2672-b427-4f5d-a988-aafc6a9cb790	chess	100.00000000	public	active	8c9ab0fc-6d0b-4f68-919a-fd15bf74df6c	1a06eb5f-8fca-4c3d-8264-339f3d9a8cda	\N	random	\N	600	0	0	2026-01-20 00:36:45.688	\N	2026-01-20 00:36:07.237525	2026-01-20 00:36:45.688	usd	\N	\N	2	1	0	0
8711663b-13b0-487d-b27a-e3b1437c89fb	chess	250.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-20 00:38:32.559	\N	2026-01-20 00:38:32.561467	2026-01-20 00:38:32.561467	usd	\N	\N	2	1	0	0
6e933e65-39da-4708-9ca2-5829438f89de	domino	5.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-20 00:39:00.145	\N	2026-01-20 00:39:00.147754	2026-01-20 00:39:00.147754	usd	\N	\N	2	1	0	0
5f9e3364-d03e-41d4-bd42-3c615e235e37	chess	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-20 00:39:24.303	\N	2026-01-20 00:39:24.30478	2026-01-20 00:39:24.30478	usd	\N	\N	2	1	0	0
4b116e7e-f66a-479d-b13b-882535a26b43	domino	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-20 00:39:41	\N	2026-01-20 00:39:41.001669	2026-01-20 00:39:41.001669	usd	\N	\N	2	1	0	0
c3039c77-3a88-47f1-bdf1-a8f224616ad2	domino	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-20 00:40:16.706	\N	2026-01-20 00:40:16.707893	2026-01-20 00:40:16.707893	usd	\N	\N	2	1	0	0
e7fa494d-36e6-41b7-8398-44824df23699	chess	5.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 00:40:35.34	\N	2026-01-20 00:40:35.341498	2026-01-20 00:40:35.341498	usd	\N	\N	2	1	0	0
3847d941-fc3e-42c0-abf1-1fce1d8e1be2	domino	25.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-20 00:40:56.591	\N	2026-01-20 00:40:56.593198	2026-01-20 00:40:56.593198	usd	\N	\N	2	1	0	0
0939b20f-a6bd-4e61-be36-4654fe1ca09a	chess	1000.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-20 00:41:26.991	\N	2026-01-20 00:41:26.993267	2026-01-20 00:41:26.993267	usd	\N	\N	2	1	0	0
bfe7985d-2fa9-419b-a546-abb663046c94	domino	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-20 00:41:45.789	\N	2026-01-20 00:41:45.791212	2026-01-20 00:41:45.791212	usd	\N	\N	2	1	0	0
e2531c2d-9a26-4987-8471-3e0d68701ab8	chess	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-20 00:42:10.976	\N	2026-01-20 00:42:10.977969	2026-01-20 00:42:10.977969	usd	\N	\N	2	1	0	0
49da7f1f-5a7e-480a-b0fb-716c00a21aff	domino	25.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 00:42:31.733	\N	2026-01-20 00:42:31.734571	2026-01-20 00:42:31.734571	usd	\N	\N	2	1	0	0
f911ab63-7bca-4f4e-9b57-2ead78ae8168	backgammon	5.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-20 00:42:49.869	\N	2026-01-20 00:42:49.87091	2026-01-20 00:42:49.87091	usd	\N	\N	2	1	0	0
41a8b28a-7e4a-44fc-be4c-f46d65f41654	chess	500.00000000	public	active	dc1ec030-d8a5-4972-8e1e-20f01abaee69	00d893bf-c7cc-4c5a-b65d-77f97985d3de	\N	random	\N	600	0	0	2026-01-20 00:45:03.341	\N	2026-01-20 00:44:00.603263	2026-01-20 00:45:03.341	usd	\N	\N	2	1	0	0
1670f8e1-e494-4e08-819d-302d58492111	chess	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 00:51:44.452	\N	2026-01-20 00:51:44.454113	2026-01-20 00:51:44.454113	usd	\N	\N	2	1	0	0
a34837d9-320d-421a-8984-ea4351be611a	backgammon	25.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-20 00:52:02.363	\N	2026-01-20 00:52:02.365057	2026-01-20 00:52:02.365057	usd	\N	\N	2	1	0	0
4ea31dc2-b1f1-4296-97c4-b69a47779c44	domino	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-20 00:52:26.011	\N	2026-01-20 00:52:26.012672	2026-01-20 00:52:26.012672	usd	\N	\N	2	1	0	0
fd075b65-b325-4612-92fb-182c3a25ed1e	backgammon	100.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-20 00:52:54.174	\N	2026-01-20 00:52:54.177114	2026-01-20 00:52:54.177114	usd	\N	\N	2	1	0	0
05d27d5e-8fd4-4685-ad33-c2e91e2cdd77	chess	25.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 00:53:12.212	\N	2026-01-20 00:53:12.213357	2026-01-20 00:53:12.213357	usd	\N	\N	2	1	0	0
cafd92fc-96ec-4304-b355-7efde4e906a4	domino	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-20 00:53:32.671	\N	2026-01-20 00:53:32.673205	2026-01-20 00:53:32.673205	usd	\N	\N	2	1	0	0
4f5c49fa-5b74-4890-acf8-65a25a2e36ab	chess	100.00000000	public	active	3091265b-af8d-4bf0-af19-c36a8301a6b2	cdaf32f9-3a37-4c86-85bc-03929da172d7	\N	random	\N	600	0	0	2026-01-20 01:00:34.393	\N	2026-01-20 01:00:04.771666	2026-01-20 01:00:34.393	usd	\N	\N	2	1	0	0
008f7ea9-4067-4806-97da-33a1d2d481f9	domino	5.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-20 01:07:40.174	\N	2026-01-20 01:07:40.176152	2026-01-20 01:07:40.176152	usd	\N	\N	2	1	0	0
a5312397-aaf3-4342-b543-2dd4c66a76fd	backgammon	250.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-20 01:08:00.709	\N	2026-01-20 01:08:00.710346	2026-01-20 01:08:00.710346	usd	\N	\N	2	1	0	0
0730f54d-a0a8-4342-871a-490f2e073e5a	chess	25.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 01:08:18.206	\N	2026-01-20 01:08:18.207815	2026-01-20 01:08:18.207815	usd	\N	\N	2	1	0	0
e2384f06-1e1f-4c21-a4f7-2896e1cd3025	chess	5.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 01:08:38.022	\N	2026-01-20 01:08:38.023807	2026-01-20 01:08:38.023807	usd	\N	\N	2	1	0	0
6b41cb32-ff70-4aee-b050-5f1196726547	backgammon	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-20 01:08:57.543	\N	2026-01-20 01:08:57.544989	2026-01-20 01:08:57.544989	usd	\N	\N	2	1	0	0
2b1b6a52-9773-4e9f-8ebc-8d13793267ba	domino	10.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-20 01:09:17.319	\N	2026-01-20 01:09:17.323479	2026-01-20 01:09:17.323479	usd	\N	\N	2	1	0	0
2072a058-82aa-4f17-ad46-de251fd9e0a3	backgammon	100.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 01:09:36.603	\N	2026-01-20 01:09:36.60502	2026-01-20 01:09:36.60502	usd	\N	\N	2	1	0	0
d8c2693c-6855-4d5a-8e1a-8496afb43099	domino	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-20 01:10:03.137	\N	2026-01-20 01:10:03.138397	2026-01-20 01:10:03.138397	usd	\N	\N	2	1	0	0
6b482e0a-b24f-45cb-bff1-e33014417fdd	backgammon	250.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-20 01:10:22.207	\N	2026-01-20 01:10:22.208232	2026-01-20 01:10:22.208232	usd	\N	\N	2	1	0	0
1b5a9812-66bc-4c81-8b34-3e2676763959	chess	100.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-20 01:10:37.838	\N	2026-01-20 01:10:37.839948	2026-01-20 01:10:37.839948	usd	\N	\N	2	1	0	0
0cb474f6-7153-4da0-83b5-e8957ec045a9	domino	25.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-20 01:11:07.528	\N	2026-01-20 01:11:07.529788	2026-01-20 01:11:07.529788	usd	\N	\N	2	1	0	0
45397650-912c-4c13-a621-6e118cbfb6fa	chess	1000.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-20 01:11:31.545	\N	2026-01-20 01:11:31.546691	2026-01-20 01:11:31.546691	usd	\N	\N	2	1	0	0
4c8e717e-2f9e-49c0-b252-36017fd5f890	domino	25.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 01:11:48.528	\N	2026-01-20 01:11:48.529957	2026-01-20 01:11:48.529957	usd	\N	\N	2	1	0	0
04998c33-1583-4baf-a5c7-2b70ca6308d7	chess	25.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-20 01:12:11.159	\N	2026-01-20 01:12:11.160194	2026-01-20 01:12:11.160194	usd	\N	\N	2	1	0	0
043278ae-a5db-4478-a3eb-5bf595cbeda0	backgammon	50.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-20 01:13:01.084	\N	2026-01-20 01:13:01.086972	2026-01-20 01:13:01.086972	usd	\N	\N	2	1	0	0
c4b23bef-8401-415b-bf46-8c3aa886b63a	domino	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 01:13:22.357	\N	2026-01-20 01:13:22.358169	2026-01-20 01:13:22.358169	usd	\N	\N	2	1	0	0
30f552c8-e639-4b9f-b3bf-6c3737dedb52	chess	50.00000000	public	completed	459e828e-ee4f-4ca2-a778-4729c42070f6	2e7732d2-a184-411e-a433-e4fded1ade6f	459e828e-ee4f-4ca2-a778-4729c42070f6	random	\N	600	0	0	2026-01-20 01:12:42.539	2026-01-20 01:19:25.019	2026-01-20 01:12:42.541282	2026-01-20 01:19:25.019	usd	\N	\N	2	1	0	0
e08dd71b-1669-4fc7-901a-a98f119a9f42	chess	5.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 01:13:43.775	\N	2026-01-20 01:13:43.776687	2026-01-20 01:13:43.776687	usd	\N	\N	2	1	0	0
304b2ac8-5f2c-432d-b539-1c1957787670	backgammon	250.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-20 01:14:13.479	\N	2026-01-20 01:14:13.480887	2026-01-20 01:14:13.480887	usd	\N	\N	2	1	0	0
9cc221c2-278a-4abc-a85d-6718cd89f346	chess	100.00000000	public	active	9d753bee-0ae8-4ddf-9339-f2346874c163	6beed496-b444-491f-aa82-d806cf365496	\N	random	\N	600	0	0	2026-01-20 01:17:47.061	\N	2026-01-20 01:17:28.454426	2026-01-20 01:17:47.061	usd	\N	\N	2	1	0	0
19f84c30-82e4-407c-8352-08e0a339da23	chess	50.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-20 01:19:25.144	\N	2026-01-20 01:19:25.14575	2026-01-20 01:19:25.14575	usd	\N	\N	2	1	0	0
22290224-f680-491b-a385-b66333bb1124	chess	250.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 01:27:41.955	\N	2026-01-20 01:27:41.957969	2026-01-20 01:27:41.957969	usd	\N	\N	2	1	0	0
666e659c-da2e-4050-9a92-f89674bea958	domino	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-20 01:28:09.79	\N	2026-01-20 01:28:09.791157	2026-01-20 01:28:09.791157	usd	\N	\N	2	1	0	0
08e27ef2-2a0f-4bfc-aa0a-93378995de84	backgammon	50.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-20 01:28:30.776	\N	2026-01-20 01:28:30.780714	2026-01-20 01:28:30.780714	usd	\N	\N	2	1	0	0
967ed333-5d03-4176-93df-014fa9c80ea0	backgammon	1000.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 01:29:02.322	\N	2026-01-20 01:29:02.326715	2026-01-20 01:29:02.326715	usd	\N	\N	2	1	0	0
bf254fb4-83e2-45fb-ac6f-ec20ab9a61b5	backgammon	10.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-20 01:29:22.102	\N	2026-01-20 01:29:22.103774	2026-01-20 01:29:22.103774	usd	\N	\N	2	1	0	0
7b74bafd-25a4-4214-a331-07106294a1cd	domino	10.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-20 01:29:51.961	\N	2026-01-20 01:29:51.963159	2026-01-20 01:29:51.963159	usd	\N	\N	2	1	0	0
4d88a63f-a209-438d-bbf2-b7a7b1a3dc22	backgammon	5.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-20 01:30:20.956	\N	2026-01-20 01:30:20.957345	2026-01-20 01:30:20.957345	usd	\N	\N	2	1	0	0
6c37b7a4-f430-42c5-90eb-8fce225ab25a	domino	50.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 01:30:41.42	\N	2026-01-20 01:30:41.421206	2026-01-20 01:30:41.421206	usd	\N	\N	2	1	0	0
be6896b6-47f5-4e34-9234-44b56ddff8bf	chess	5.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-20 01:31:03.311	\N	2026-01-20 01:31:03.31276	2026-01-20 01:31:03.31276	usd	\N	\N	2	1	0	0
40d836e9-0753-4b4b-884d-adfbb54162c7	backgammon	10.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-20 01:31:30.181	\N	2026-01-20 01:31:30.183096	2026-01-20 01:31:30.183096	usd	\N	\N	2	1	0	0
1d49ed54-015f-4ff7-baf4-0af20c69a367	domino	500.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-20 01:31:53.584	\N	2026-01-20 01:31:53.585645	2026-01-20 01:31:53.585645	usd	\N	\N	2	1	0	0
36d5489e-1f2c-4fdd-b393-959357345b33	backgammon	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-20 02:21:47.373	\N	2026-01-20 02:21:47.37483	2026-01-20 02:21:47.37483	usd	\N	\N	2	1	0	0
1d457da0-74b9-435a-8710-1e7738d4314f	chess	1000.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 02:22:07.395	\N	2026-01-20 02:22:07.396963	2026-01-20 02:22:07.396963	usd	\N	\N	2	1	0	0
012cc2d3-84ee-4230-a26f-9be2e2737877	domino	5.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-20 02:22:23.291	\N	2026-01-20 02:22:23.292459	2026-01-20 02:22:23.292459	usd	\N	\N	2	1	0	0
55b647b9-5c10-44c7-81fc-68e2a29fb269	chess	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-20 02:22:43.466	\N	2026-01-20 02:22:43.467082	2026-01-20 02:22:43.467082	usd	\N	\N	2	1	0	0
a8370a99-0a86-4d97-8406-6d5e24342caa	domino	10.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-20 02:23:02.805	\N	2026-01-20 02:23:02.807095	2026-01-20 02:23:02.807095	usd	\N	\N	2	1	0	0
8103b426-25ab-4cbb-8a86-8a56f4cebd06	backgammon	1000.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-20 03:05:29.027	\N	2026-01-20 03:05:29.028368	2026-01-20 03:05:29.028368	usd	\N	\N	2	1	0	0
2ccd3596-5fa6-4155-8da3-c4488361b8e0	domino	10.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-20 03:05:44.483	\N	2026-01-20 03:05:44.485427	2026-01-20 03:05:44.485427	usd	\N	\N	2	1	0	0
8203ee1c-7769-49fa-8c52-435d4c7609a2	backgammon	500.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 03:06:03.868	\N	2026-01-20 03:06:03.86909	2026-01-20 03:06:03.86909	usd	\N	\N	2	1	0	0
9c068948-8445-4bb7-9b78-842de88fbf4a	domino	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-20 03:06:27.831	\N	2026-01-20 03:06:27.832396	2026-01-20 03:06:27.832396	usd	\N	\N	2	1	0	0
4eab75da-386a-42b2-8297-f8ec501f9336	chess	25.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 03:06:49.376	\N	2026-01-20 03:06:49.377367	2026-01-20 03:06:49.377367	usd	\N	\N	2	1	0	0
cf00aa44-aea8-45f4-bece-22bd59be2850	backgammon	25.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 03:07:15.705	\N	2026-01-20 03:07:15.70714	2026-01-20 03:07:15.70714	usd	\N	\N	2	1	0	0
34730a43-6a15-4c07-bbe4-1eb4aa5bf647	chess	10.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-20 03:07:37.995	\N	2026-01-20 03:07:37.998023	2026-01-20 03:07:37.998023	usd	\N	\N	2	1	0	0
1cd1e62c-0a9e-411d-9397-56b2a95e5b64	backgammon	25.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 03:08:04.757	\N	2026-01-20 03:08:04.758597	2026-01-20 03:08:04.758597	usd	\N	\N	2	1	0	0
61870c9e-47fd-48e8-ab43-6f14f0cb00e2	domino	100.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	\N	random	\N	600	0	0	2026-01-20 03:08:32.218	\N	2026-01-20 03:08:32.219775	2026-01-20 03:08:32.219775	usd	\N	\N	2	1	0	0
d54b22a5-d836-4248-a9a8-075d00429851	backgammon	500.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-20 03:08:49.138	\N	2026-01-20 03:08:49.139798	2026-01-20 03:08:49.139798	usd	\N	\N	2	1	0	0
1f41cc1a-a29d-4701-8d29-5063c0a4d06e	domino	100.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	4d358b24-397b-4020-87f3-de6acaf35864	\N	random	\N	600	0	0	2026-01-20 03:21:57.631	\N	2026-01-20 03:21:57.634351	2026-01-20 03:21:57.634351	usd	\N	\N	2	1	0	0
1c107912-6470-4431-8b47-08d085b64be6	backgammon	500.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 03:22:18.796	\N	2026-01-20 03:22:18.797078	2026-01-20 03:22:18.797078	usd	\N	\N	2	1	0	0
9e5333bc-e239-4276-b40b-a1c6e5f7d933	domino	250.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-20 03:22:39.84	\N	2026-01-20 03:22:39.842695	2026-01-20 03:22:39.842695	usd	\N	\N	2	1	0	0
7e690714-b819-4a9c-93ce-e035b1a54455	backgammon	5.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 03:23:02.498	\N	2026-01-20 03:23:02.499449	2026-01-20 03:23:02.499449	usd	\N	\N	2	1	0	0
de830622-bff5-4725-a487-729c9ab82eb5	domino	500.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-20 03:23:23.724	\N	2026-01-20 03:23:23.725448	2026-01-20 03:23:23.725448	usd	\N	\N	2	1	0	0
e688862b-7475-4d4e-acb2-a5727255a4e7	domino	250.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-20 04:52:58.011	\N	2026-01-20 04:52:58.013384	2026-01-20 04:52:58.013384	usd	\N	\N	2	1	0	0
601c2adc-173e-48b1-8e8f-c60a997ce4d5	backgammon	500.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-20 04:53:40.231	\N	2026-01-20 04:53:40.232912	2026-01-20 04:53:40.232912	usd	\N	\N	2	1	0	0
f78e0fc3-065a-4668-ad9e-a4a23383fa7e	backgammon	5.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-20 04:54:26.934	\N	2026-01-20 04:54:26.936659	2026-01-20 04:54:26.936659	usd	\N	\N	2	1	0	0
4b2944f6-b3ad-44a9-baba-c0455d5d3d43	chess	25.00000000	public	completed	e949ad28-20ef-49fe-b91b-f340e0ee30dd	5955c883-e5a0-41eb-989a-0f118bdc9e9a	5955c883-e5a0-41eb-989a-0f118bdc9e9a	random	\N	600	0	0	2026-01-20 04:54:04.844	2026-01-20 04:59:07.289	2026-01-20 04:54:04.845839	2026-01-20 04:59:07.289	usd	\N	\N	2	1	0	0
e7970189-9ecf-4b7e-87c1-7e2e9cb263c3	chess	25.00000000	public	completed	459e828e-ee4f-4ca2-a778-4729c42070f6	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-20 04:53:16.629	2026-01-20 05:16:46.091	2026-01-20 04:53:16.63089	2026-01-20 05:16:46.091	usd	\N	\N	2	1	0	0
fda23af4-f12b-462f-a687-a33476071fed	backgammon	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-20 05:17:10.209	\N	2026-01-20 05:17:10.212194	2026-01-20 05:17:10.212194	usd	\N	\N	2	1	0	0
30ef99b6-c3ec-4a56-bb67-1ecec925069a	chess	100.00000000	public	completed	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 04:59:16.351	2026-01-20 05:21:58.385	2026-01-20 04:59:16.351943	2026-01-20 05:21:58.385	usd	\N	\N	2	1	0	0
e779969e-a6db-4ce7-9c34-8f8577790d23	domino	100.00000000	public	active	f065b93a-0a3e-408b-964a-8759f618e683	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-20 05:22:12.107	\N	2026-01-20 05:22:12.108485	2026-01-20 05:22:12.108485	usd	\N	\N	2	1	0	0
2d2e7dbb-7c24-4f5b-8e9c-99c32c7b9725	backgammon	500.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-20 07:21:41.068	\N	2026-01-20 07:21:41.069581	2026-01-20 07:21:41.069581	usd	\N	\N	2	1	0	0
9316bba2-7623-4028-87b9-e115d50657b5	domino	10.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-20 07:22:04.842	\N	2026-01-20 07:22:04.843528	2026-01-20 07:22:04.843528	usd	\N	\N	2	1	0	0
87a34fb8-9d1e-4a21-8cb6-2f01aa5d47f9	domino	25.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-20 07:22:46.025	\N	2026-01-20 07:22:46.025807	2026-01-20 07:22:46.025807	usd	\N	\N	2	1	0	0
9004c182-6787-4b0e-96e8-7cebee21c89c	chess	5.00000000	public	completed	f065b93a-0a3e-408b-964a-8759f618e683	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-20 07:22:23.828	2026-01-20 07:51:10.285	2026-01-20 07:22:23.829271	2026-01-20 07:51:10.285	usd	\N	\N	2	1	0	0
0520f6bb-8269-48aa-9b7f-60b1b5b7e6d8	backgammon	10.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 07:51:19.328	\N	2026-01-20 07:51:19.329715	2026-01-20 07:51:19.329715	usd	\N	\N	2	1	0	0
a5686421-ea91-40a0-a351-1bb4b279e686	chess	50.00000000	public	completed	3f7d7f25-80fd-4402-a898-dee310faf409	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-20 07:21:22.176	2026-01-20 08:02:16.106	2026-01-20 07:21:22.177322	2026-01-20 08:02:16.106	usd	\N	\N	2	1	0	0
6fab3160-27b7-483f-87ae-2f4e67ec73d7	chess	10.00000000	public	completed	e949ad28-20ef-49fe-b91b-f340e0ee30dd	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-20 08:02:28.239	2026-01-20 08:41:21.642	2026-01-20 08:02:28.239879	2026-01-20 08:41:21.642	usd	\N	\N	2	1	0	0
13a278a6-520f-4dbd-9d97-d58d8d33c618	domino	1000.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-20 08:41:25.867	\N	2026-01-20 08:41:25.868755	2026-01-20 08:41:25.868755	usd	\N	\N	2	1	0	0
09b48911-b481-4f98-9e65-0cc32bb6c522	chess	250.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-21 14:46:46.476	\N	2026-01-21 14:46:46.478052	2026-01-21 14:46:46.478052	usd	\N	\N	2	1	0	0
3308da6f-83e7-45a0-aa21-27e55d97e07c	backgammon	50.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-21 14:47:10.167	\N	2026-01-21 14:47:10.168848	2026-01-21 14:47:10.168848	usd	\N	\N	2	1	0	0
78b4d7c4-5dd3-435b-89c8-06e3c4c449a8	chess	500.00000000	public	active	2e7732d2-a184-411e-a433-e4fded1ade6f	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-21 14:47:37.694	\N	2026-01-21 14:47:37.696151	2026-01-21 14:47:37.696151	usd	\N	\N	2	1	0	0
3c0e6c73-9d6b-434a-8ba2-e021a8ec44cd	domino	25.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-21 14:48:02.559	\N	2026-01-21 14:48:02.560387	2026-01-21 14:48:02.560387	usd	\N	\N	2	1	0	0
3b2d2c3f-b0f1-44f7-8197-562d6c36ce21	backgammon	25.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-21 14:48:18.366	\N	2026-01-21 14:48:18.367603	2026-01-21 14:48:18.367603	usd	\N	\N	2	1	0	0
97f1581b-c759-44fc-91b7-d38849a15f07	domino	50.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-21 14:50:50.066	\N	2026-01-21 14:50:50.067588	2026-01-21 14:50:50.067588	usd	\N	\N	2	1	0	0
07462293-70d1-4524-9594-726945ec79b8	chess	250.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-21 14:51:18.367	\N	2026-01-21 14:51:18.368794	2026-01-21 14:51:18.368794	usd	\N	\N	2	1	0	0
a9b64dfc-1b5c-4af2-9683-4366891d9aa4	backgammon	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-21 14:51:34.258	\N	2026-01-21 14:51:34.25937	2026-01-21 14:51:34.25937	usd	\N	\N	2	1	0	0
394ec4a5-6130-43df-b52f-205fbac59bb3	domino	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-21 14:51:56.254	\N	2026-01-21 14:51:56.264073	2026-01-21 14:51:56.264073	usd	\N	\N	2	1	0	0
2ffa2244-37b4-42e6-b30d-d37d27622aae	chess	250.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	f065b93a-0a3e-408b-964a-8759f618e683	\N	random	\N	600	0	0	2026-01-21 14:52:17.381	\N	2026-01-21 14:52:17.382665	2026-01-21 14:52:17.382665	usd	\N	\N	2	1	0	0
f982bb89-d1b9-465c-815c-06171b015590	chess	5.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-21 14:52:54.371	\N	2026-01-21 14:52:54.372489	2026-01-21 14:52:54.372489	usd	\N	\N	2	1	0	0
b3df9381-c6d8-4d1b-92c4-1eaf99100b84	backgammon	100.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-21 14:53:16.485	\N	2026-01-21 14:53:16.486786	2026-01-21 14:53:16.486786	usd	\N	\N	2	1	0	0
f16a405a-2b45-4a5a-905a-249e02c46248	domino	1000.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-21 14:53:43.88	\N	2026-01-21 14:53:43.882133	2026-01-21 14:53:43.882133	usd	\N	\N	2	1	0	0
d2b84c60-8723-40ae-a0b6-2a63d9bd1e5f	backgammon	25.00000000	public	active	459e828e-ee4f-4ca2-a778-4729c42070f6	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-21 14:53:59.768	\N	2026-01-21 14:53:59.769089	2026-01-21 14:53:59.769089	usd	\N	\N	2	1	0	0
620b2f66-6d01-46fe-8070-354d502e56c2	domino	100.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	4c22629a-ae59-4cc3-828e-8bfeb868dfba	\N	random	\N	600	0	0	2026-01-21 14:54:23.465	\N	2026-01-21 14:54:23.466615	2026-01-21 14:54:23.466615	usd	\N	\N	2	1	0	0
03e58e40-be8d-4ccc-8fbc-73c63a949416	backgammon	10.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-21 14:57:49.825	\N	2026-01-21 14:57:49.828443	2026-01-21 14:57:49.828443	usd	\N	\N	2	1	0	0
634d1c5a-0baa-4a3e-944d-cc8fd4cb6791	chess	5.00000000	public	active	655d723f-16f5-4711-b795-4c5acf35890d	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-21 14:58:16.966	\N	2026-01-21 14:58:16.967723	2026-01-21 14:58:16.967723	usd	\N	\N	2	1	0	0
b769d1fc-0026-4b94-9499-7bcc99d1b0ec	domino	10.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-21 14:58:34.306	\N	2026-01-21 14:58:34.307727	2026-01-21 14:58:34.307727	usd	\N	\N	2	1	0	0
0a476340-ed5d-4a8f-ad71-e7f5d3c5d349	domino	500.00000000	public	active	4d358b24-397b-4020-87f3-de6acaf35864	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-21 15:22:27.221	\N	2026-01-21 15:22:27.222731	2026-01-21 15:22:27.222731	usd	\N	\N	2	1	0	0
4a246714-043f-45f8-bd4d-3b97cd1d5799	domino	10.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-21 15:23:05.251	\N	2026-01-21 15:23:05.252663	2026-01-21 15:23:05.252663	usd	\N	\N	2	1	0	0
a4c815b3-f8e2-4f75-8627-8617da1822d8	backgammon	1000.00000000	public	active	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-21 15:23:26.054	\N	2026-01-21 15:23:26.055409	2026-01-21 15:23:26.055409	usd	\N	\N	2	1	0	0
a813769b-afc1-43e0-831a-514f4d425c7f	chess	50.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-21 15:24:02.521	\N	2026-01-21 15:24:02.523611	2026-01-21 15:24:02.523611	usd	\N	\N	2	1	0	0
66e00772-2305-4f8a-9c7c-e1e657f20e1a	domino	10.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-21 15:24:30.487	\N	2026-01-21 15:24:30.488633	2026-01-21 15:24:30.488633	usd	\N	\N	2	1	0	0
337d9196-14ff-4d33-9960-d2e754287b05	backgammon	100.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-21 15:24:53.799	\N	2026-01-21 15:24:53.799949	2026-01-21 15:24:53.799949	usd	\N	\N	2	1	0	0
85a72332-5759-462a-9d79-fcc178372e5a	backgammon	25.00000000	public	active	e87885fb-aa52-49e2-92e9-9ad265fca46c	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-21 15:25:13.134	\N	2026-01-21 15:25:13.135776	2026-01-21 15:25:13.135776	usd	\N	\N	2	1	0	0
f1b30e02-56aa-4f55-8a38-f11ef9e1d9b8	domino	10.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	2151b666-646a-45f1-9c94-a097927ee87f	\N	random	\N	600	0	0	2026-01-21 15:25:41.549	\N	2026-01-21 15:25:41.551381	2026-01-21 15:25:41.551381	usd	\N	\N	2	1	0	0
b5f42e00-6fdc-49e9-9a98-017765c208bf	chess	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-21 15:26:09.661	\N	2026-01-21 15:26:09.663441	2026-01-21 15:26:09.663441	usd	\N	\N	2	1	0	0
a0482e58-85b6-4462-ac5e-d148fbc10420	backgammon	500.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-21 15:26:29.512	\N	2026-01-21 15:26:29.513531	2026-01-21 15:26:29.513531	usd	\N	\N	2	1	0	0
385d4564-9a39-43c0-a942-6bb754654436	chess	100.00000000	public	completed	655d723f-16f5-4711-b795-4c5acf35890d	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	random	\N	600	0	0	2026-01-21 15:26:46.897	2026-01-21 15:46:16.233	2026-01-21 15:26:46.89855	2026-01-21 15:46:16.233	usd	\N	\N	2	1	0	0
5b1267de-d638-4a9f-bb15-1deb406322e3	domino	10.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-21 15:46:22.528	\N	2026-01-21 15:46:22.52961	2026-01-21 15:46:22.52961	usd	\N	\N	2	1	0	0
446874e5-a79a-45b0-9ea1-d4f2daa57a36	chess	25.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-21 16:04:51.892	\N	2026-01-21 16:04:51.893718	2026-01-21 16:04:51.893718	usd	\N	\N	2	1	0	0
758653fd-34e9-42ba-86db-fa72e02485e6	backgammon	50.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-21 16:05:12.867	\N	2026-01-21 16:05:12.868962	2026-01-21 16:05:12.868962	usd	\N	\N	2	1	0	0
e2a518bf-cf42-40bd-bf23-7c13ae0db6c6	domino	100.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	b154aeba-0034-4e32-9643-49e1d094fe67	\N	random	\N	600	0	0	2026-01-21 16:05:33.783	\N	2026-01-21 16:05:33.784442	2026-01-21 16:05:33.784442	usd	\N	\N	2	1	0	0
c5d45830-baf9-46af-a469-58d2b30b279b	chess	5.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-21 16:05:57.9	\N	2026-01-21 16:05:57.902385	2026-01-21 16:05:57.902385	usd	\N	\N	2	1	0	0
82d14d73-9924-468d-b7b1-da6ef8cb542f	backgammon	500.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-21 16:06:15.092	\N	2026-01-21 16:06:15.093797	2026-01-21 16:06:15.093797	usd	\N	\N	2	1	0	0
70b8d1a9-d442-4c2c-a909-aa9f23082cd1	chess	10.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-21 16:06:41.011	\N	2026-01-21 16:06:41.012965	2026-01-21 16:06:41.012965	usd	\N	\N	2	1	0	0
04c60dee-a366-40de-a060-1b3a783e171b	domino	500.00000000	public	active	b8d9bf67-623e-4147-9d94-cc85dc9b5851	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-21 16:07:09.417	\N	2026-01-21 16:07:09.418936	2026-01-21 16:07:09.418936	usd	\N	\N	2	1	0	0
60482550-9c3a-4a66-ac17-bcb7353bb850	chess	1000.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-21 16:07:29.898	\N	2026-01-21 16:07:29.90023	2026-01-21 16:07:29.90023	usd	\N	\N	2	1	0	0
68a20e84-b4c5-4010-9979-39e679957807	chess	1000.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	3f7d7f25-80fd-4402-a898-dee310faf409	\N	random	\N	600	0	0	2026-01-21 16:07:54.864	\N	2026-01-21 16:07:54.866305	2026-01-21 16:07:54.866305	usd	\N	\N	2	1	0	0
29b8462a-064b-4d13-a159-bac892d8f31b	domino	5.00000000	public	active	e949ad28-20ef-49fe-b91b-f340e0ee30dd	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-21 16:08:19.278	\N	2026-01-21 16:08:19.279588	2026-01-21 16:08:19.279588	usd	\N	\N	2	1	0	0
85093e46-443e-4bc8-808a-bc13271b662e	chess	500.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-21 16:08:38.014	\N	2026-01-21 16:08:38.019961	2026-01-21 16:08:38.019961	usd	\N	\N	2	1	0	0
16b9e852-2377-4dcf-b1e5-9723c21c0be2	chess	25.00000000	public	active	2151b666-646a-45f1-9c94-a097927ee87f	655d723f-16f5-4711-b795-4c5acf35890d	\N	random	\N	600	0	0	2026-01-21 16:09:04.273	\N	2026-01-21 16:09:04.275018	2026-01-21 16:09:04.275018	usd	\N	\N	2	1	0	0
3b0ad9ce-8c58-4faf-aaa1-f372bf696832	backgammon	250.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	459e828e-ee4f-4ca2-a778-4729c42070f6	\N	random	\N	600	0	0	2026-01-21 16:09:22.621	\N	2026-01-21 16:09:22.622982	2026-01-21 16:09:22.622982	usd	\N	\N	2	1	0	0
97bd05bd-4299-44d6-b3f0-9d3bbd96fafc	chess	500.00000000	public	active	978946cb-9458-451c-9a4f-2f908966ec3a	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-21 16:09:50.445	\N	2026-01-21 16:09:50.447013	2026-01-21 16:09:50.447013	usd	\N	\N	2	1	0	0
462574df-4143-41b7-8ae6-d7093b7ac84d	domino	1000.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-21 16:10:10.242	\N	2026-01-21 16:10:10.244272	2026-01-21 16:10:10.244272	usd	\N	\N	2	1	0	0
82ba8a53-e3ee-4ada-9f82-f86ed93db077	chess	250.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-21 16:10:27.166	\N	2026-01-21 16:10:27.216538	2026-01-21 16:10:27.216538	usd	\N	\N	2	1	0	0
4b30753c-34fc-472f-9bc9-d36055af3f9e	domino	50.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	b8d9bf67-623e-4147-9d94-cc85dc9b5851	\N	random	\N	600	0	0	2026-01-21 16:21:41.44	\N	2026-01-21 16:21:41.442353	2026-01-21 16:21:41.442353	usd	\N	\N	2	1	0	0
d8d3f50a-20c2-428e-a1f3-2ce215571686	chess	25.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-21 16:22:03.992	\N	2026-01-21 16:22:03.994981	2026-01-21 16:22:03.994981	usd	\N	\N	2	1	0	0
c63445a1-fc16-4af4-94ab-3c4cd68454b9	backgammon	10.00000000	public	active	3f7d7f25-80fd-4402-a898-dee310faf409	2e7732d2-a184-411e-a433-e4fded1ade6f	\N	random	\N	600	0	0	2026-01-21 16:22:47.154	\N	2026-01-21 16:22:47.156323	2026-01-21 16:22:47.156323	usd	\N	\N	2	1	0	0
bbabf69b-2517-4053-ba5a-5814bdea2452	domino	250.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	bab291d9-b2d0-4d10-b0aa-a803febba3e3	\N	random	\N	600	0	0	2026-01-21 16:31:59.721	\N	2026-01-21 16:31:59.724188	2026-01-21 16:31:59.724188	usd	\N	\N	2	1	0	0
38cfbbf7-959a-4186-aa8e-9df6ff460913	chess	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	e87885fb-aa52-49e2-92e9-9ad265fca46c	\N	random	\N	600	0	0	2026-01-21 16:32:30.94	\N	2026-01-21 16:32:30.941708	2026-01-21 16:32:30.941708	usd	\N	\N	2	1	0	0
f55751af-a2a0-4690-80d9-a91d5cc75869	domino	1000.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	5955c883-e5a0-41eb-989a-0f118bdc9e9a	\N	random	\N	600	0	0	2026-01-21 16:33:06.868	\N	2026-01-21 16:33:06.8699	2026-01-21 16:33:06.8699	usd	\N	\N	2	1	0	0
205c3358-414a-4f32-9b1e-e7c2c4ba0637	backgammon	50.00000000	public	active	a955ff28-c8c8-45cb-aafa-ea60c086139f	32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	\N	random	\N	600	0	0	2026-01-21 16:33:30.503	\N	2026-01-21 16:33:30.504195	2026-01-21 16:33:30.504195	usd	\N	\N	2	1	0	0
98dda44f-9ec2-416a-914e-755b78fd7f42	domino	1000.00000000	public	active	5955c883-e5a0-41eb-989a-0f118bdc9e9a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-21 16:33:58.598	\N	2026-01-21 16:33:58.600035	2026-01-21 16:33:58.600035	usd	\N	\N	2	1	0	0
5b7b4c70-e986-4f19-90c7-e4ecdc03f3ca	chess	500.00000000	public	active	bab291d9-b2d0-4d10-b0aa-a803febba3e3	703b875c-e673-4382-97c9-524e0463898a	\N	random	\N	600	0	0	2026-01-21 16:34:26.383	\N	2026-01-21 16:34:26.385081	2026-01-21 16:34:26.385081	usd	\N	\N	2	1	0	0
688bd941-6f12-4189-8061-0e82caf74686	backgammon	10.00000000	public	active	b154aeba-0034-4e32-9643-49e1d094fe67	ad92f2f2-89e3-47ed-a10e-6ed23626e440	\N	random	\N	600	0	0	2026-01-21 16:34:49.806	\N	2026-01-21 16:34:49.807902	2026-01-21 16:34:49.807902	usd	\N	\N	2	1	0	0
437d7e7d-00bf-4e95-9275-3d68d6fa8e31	chess	25.00000000	public	active	983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	e949ad28-20ef-49fe-b91b-f340e0ee30dd	\N	random	\N	600	0	0	2026-01-21 16:45:55.105	\N	2026-01-21 16:45:55.107395	2026-01-21 16:45:55.107395	usd	\N	\N	2	1	0	0
adeb8e36-7ac1-4e65-a6d5-2fc239d8648f	domino	500.00000000	public	active	4c22629a-ae59-4cc3-828e-8bfeb868dfba	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-21 16:46:22.204	\N	2026-01-21 16:46:22.205385	2026-01-21 16:46:22.205385	usd	\N	\N	2	1	0	0
0b20ec88-8e1d-4387-becd-951625246e38	chess	5.00000000	public	active	703b875c-e673-4382-97c9-524e0463898a	a955ff28-c8c8-45cb-aafa-ea60c086139f	\N	random	\N	600	0	0	2026-01-21 16:46:38.962	\N	2026-01-21 16:46:38.964502	2026-01-21 16:46:38.964502	usd	\N	\N	2	1	0	0
67e401c7-ba9a-403e-8331-bc87ef59b345	domino	250.00000000	public	active	ad92f2f2-89e3-47ed-a10e-6ed23626e440	978946cb-9458-451c-9a4f-2f908966ec3a	\N	random	\N	600	0	0	2026-01-21 16:47:00.622	\N	2026-01-21 16:47:00.623682	2026-01-21 16:47:00.623682	usd	\N	\N	2	1	0	0
3974fdbc-bdd1-407a-8e0d-113eac9ff93d	chess	124.00000000	public	active	5bbefd70-91b3-4631-a5ee-79c68522b3f5	986a9ace-9937-49a2-bd90-c66c64d71789	\N	random	\N	600	0	0	2026-01-21 20:22:56.71	\N	2026-01-21 20:22:38.430599	2026-01-21 20:22:56.71	usd	\N	\N	2	2	0	0
71d7df54-cd74-4b1b-842b-f0c764c8c8b0	domino	200.00000000	public	active	5bbefd70-91b3-4631-a5ee-79c68522b3f5	986a9ace-9937-49a2-bd90-c66c64d71789	\N	random	\N	600	0	0	2026-01-21 20:23:44.532	\N	2026-01-21 20:23:27.70291	2026-01-21 20:23:44.532	usd	\N	\N	2	2	0	0
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.chat_messages (id, sender_id, receiver_id, content, message_type, is_read, created_at, attachment_url, read_at, is_disappearing, disappear_after_read, deleted_at) FROM stdin;
\.


--
-- Data for Name: chat_settings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.chat_settings (id, key, value, updated_by, updated_at) FROM stdin;
\.


--
-- Data for Name: chess_moves; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.chess_moves (id, session_id, player_id, move_number, from_square, to_square, piece, captured_piece, is_check, is_checkmate, is_castling, is_en_passant, promotion_piece, notation, fen, time_spent, created_at) FROM stdin;
\.


--
-- Data for Name: complaint_attachments; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.complaint_attachments (id, complaint_id, file_name, file_url, file_type, file_size, uploaded_by, uploaded_at) FROM stdin;
\.


--
-- Data for Name: complaint_messages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.complaint_messages (id, complaint_id, sender_id, message, is_internal, created_at) FROM stdin;
\.


--
-- Data for Name: complaints; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.complaints (id, ticket_number, user_id, assigned_agent_id, category, priority, status, subject, description, transaction_id, sla_deadline, resolved_at, resolution, rating, rating_comment, escalated_at, escalated_to, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: country_payment_methods; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.country_payment_methods (id, country_code, currency_id, name, type, icon_url, min_amount, max_amount, is_available, is_active, processing_time, instructions, sort_order) FROM stdin;
72fca384-dc02-4c02-804d-3df6bc743afa	EG	\N	Vodafone Cash	e_wallet	\N	50.00	50000.00	t	t	Instant	Send to agent wallet number	0
dc56f514-8fb4-4c68-893f-98cdd81a2e6e	EG	\N	InstaPay	e_wallet	\N	100.00	100000.00	t	t	Instant	\N	0
0280bc05-eb8a-4dd9-9c38-fbbd209a9110	EG	\N	Bank Transfer	bank_transfer	\N	500.00	500000.00	t	t	1-2 hours	\N	0
371b1bc8-fcad-4912-b8d0-5349ed8bcd0e	SA	\N	STC Pay	e_wallet	\N	50.00	20000.00	t	t	Instant	\N	0
88d1639e-edd5-404d-bf1a-4bd289623e42	SA	\N	Bank Transfer	bank_transfer	\N	100.00	100000.00	t	t	30 minutes	\N	0
a1f8cda3-21e0-4127-83f4-f49b87006e62	AE	\N	Apple Pay	e_wallet	\N	50.00	50000.00	t	t	Instant	\N	0
7236283a-7fdf-4c79-8b69-aa5d13d50b27	GLOBAL	\N	USDT (TRC20)	crypto	\N	10.00	1000000.00	t	t	10-30 minutes	\N	0
a42f136d-a60d-4ea3-b3cc-64b93110ae47	GLOBAL	\N	Bitcoin	crypto	\N	50.00	1000000.00	t	t	30-60 minutes	\N	0
332786b9-b9da-4f55-aad2-4df7d5552a14	ALL	\N	Bank Transfer	bank_transfer	\N	10.00	50000.00	t	t	1-3 business days	\N	1
343d94a7-78d3-468a-86db-8a2f5bb17ce1	ALL	\N	Visa	card	\N	10.00	10000.00	t	t	Instant	\N	2
8004a108-8cbe-47f1-a727-0e0db60c1c6f	ALL	\N	Mastercard	card	\N	10.00	10000.00	t	t	Instant	\N	3
ff60cdfe-8280-4e08-955d-dac66b8583eb	ALL	\N	PayPal	e_wallet	\N	5.00	10000.00	t	t	Instant	\N	4
762a9da3-6b8b-4963-9be9-6bd23426eade	ALL	\N	Skrill	e_wallet	\N	5.00	10000.00	t	t	Instant	\N	5
8c1c4f4b-05e3-4e5c-8c98-e3bfaacf152e	ALL	\N	Neteller	e_wallet	\N	5.00	10000.00	t	t	Instant	\N	6
782e69fd-d4e9-4161-9edf-fab3f579a936	ALL	\N	Apple Pay	e_wallet	\N	10.00	5000.00	t	t	Instant	\N	7
59ccc2d1-60a7-4512-b6ba-4e55eefb9f18	ALL	\N	Google Pay	e_wallet	\N	10.00	5000.00	t	t	Instant	\N	8
a3f7a1fe-dd9f-492f-a3c9-e10b97e3fc2c	ALL	\N	Bitcoin (BTC)	crypto	\N	20.00	100000.00	t	t	10-60 minutes	\N	9
bc3fdd11-0742-4a4a-bfff-b9c4f583abda	ALL	\N	Ethereum (ETH)	crypto	\N	20.00	100000.00	t	t	5-15 minutes	\N	10
429f7be8-3a2a-4a1c-a945-62df1eb17bee	ALL	\N	Tether (USDT)	crypto	\N	10.00	100000.00	t	t	5-30 minutes	\N	11
ed77cca1-c1b5-4fff-bf42-10015fa30dce	ALL	\N	USD Coin (USDC)	crypto	\N	10.00	100000.00	t	t	5-30 minutes	\N	12
29169d0d-14d4-4e38-ab1f-f668cf04bde6	ALL	\N	Binance Pay	crypto	\N	10.00	50000.00	t	t	Instant	\N	13
d263ab40-c002-4f99-88e7-651212bdac05	ALL	\N	Perfect Money	e_wallet	\N	5.00	20000.00	t	t	Instant	\N	14
8049d76f-4a41-4962-bc15-6a2a3c342d74	ALL	\N	WebMoney	e_wallet	\N	5.00	10000.00	t	t	Instant	\N	15
42a5391d-a2b0-4b48-b256-491d73e61c60	EU	\N	Paysafecard	e_wallet	\N	10.00	1000.00	t	t	Instant	\N	16
0cdcbd3a-8df9-447d-81ea-5f85275deee3	EG	\N	Vodafone Cash	e_wallet	\N	50.00	50000.00	t	t	Instant	\N	17
7570c6af-9010-4fe2-92ad-f3481c02a4cf	EG	\N	Fawry	e_wallet	\N	50.00	50000.00	t	t	1-24 hours	\N	18
c4f55214-b383-4671-9217-5c30042ec753	EG	\N	InstaPay	bank_transfer	\N	50.00	100000.00	t	t	Instant	\N	19
d9e54c2a-4e9e-4581-82c7-70371c218a06	EG	\N	Orange Cash	e_wallet	\N	50.00	50000.00	t	t	Instant	\N	20
bb51fdbf-1db6-4cde-9c51-31285e445535	EG	\N	Etisalat Cash	e_wallet	\N	50.00	50000.00	t	t	Instant	\N	21
c0876b4f-4c0d-4337-8ded-b17a5d9ff8a7	SA	\N	STC Pay	e_wallet	\N	10.00	20000.00	t	t	Instant	\N	22
f1ba4fbe-0e40-4980-970e-75d4ed6b986e	SA	\N	Mada	card	\N	10.00	50000.00	t	t	Instant	\N	23
23823542-e38b-4ec9-9ffa-5503673e1ee1	KE	\N	M-Pesa	e_wallet	\N	100.00	150000.00	t	t	Instant	\N	24
fd379d00-ebd8-4b3b-9a66-d34fc9bbb333	GH	\N	MTN Mobile Money	e_wallet	\N	10.00	10000.00	t	t	Instant	\N	25
da5c077f-95f1-4117-8d4e-a33a0dade469	GH	\N	AirtelTigo Money	e_wallet	\N	10.00	10000.00	t	t	Instant	\N	26
d7a4b98e-49e7-4303-8bfa-9cca5914b219	NG	\N	OPay	e_wallet	\N	500.00	1000000.00	t	t	Instant	\N	27
1fd5d7a6-88e0-4d67-bd24-4c539354a7eb	NG	\N	Paystack	e_wallet	\N	500.00	500000.00	t	t	Instant	\N	28
93ff935d-6c49-404c-bddd-6df1ec71fb82	NG	\N	Flutterwave	e_wallet	\N	500.00	500000.00	t	t	Instant	\N	29
6658c8bd-c1bb-4f01-aca2-00dc22ca5caf	IN	\N	Paytm	e_wallet	\N	100.00	200000.00	t	t	Instant	\N	30
f4678df6-2765-432b-a739-ad55b81d8fbe	IN	\N	PhonePe	e_wallet	\N	100.00	200000.00	t	t	Instant	\N	31
62832de3-f109-4908-949e-7582fe32b194	IN	\N	GPay India	e_wallet	\N	100.00	200000.00	t	t	Instant	\N	32
d1699179-4fe2-414d-8742-26a76c68dc5f	IN	\N	UPI	bank_transfer	\N	100.00	500000.00	t	t	Instant	\N	33
f9d1f34b-f1bc-4c54-abd9-675152688fb3	CN	\N	Alipay	e_wallet	\N	10.00	50000.00	t	t	Instant	\N	34
4cf90b2b-1fa8-400e-9449-68751a916393	CN	\N	WeChat Pay	e_wallet	\N	10.00	50000.00	t	t	Instant	\N	35
c2d7edc2-5e67-464c-820a-ed3486efc999	SG	\N	GrabPay	e_wallet	\N	10.00	5000.00	t	t	Instant	\N	36
9703622e-77bc-421a-bc0b-be42097d58ca	PH	\N	GCash	e_wallet	\N	100.00	100000.00	t	t	Instant	\N	37
4eb33d53-061a-49f3-a71b-bf9e755ccb8d	PH	\N	PayMaya	e_wallet	\N	100.00	100000.00	t	t	Instant	\N	38
3f95f7f3-6b2b-4998-98eb-936f9006c1af	ID	\N	OVO	e_wallet	\N	10000.00	10000000.00	t	t	Instant	\N	39
64ffbad1-573d-49ca-bb2e-e460d252fc55	ID	\N	GoPay	e_wallet	\N	10000.00	10000000.00	t	t	Instant	\N	40
e45840b1-3222-4967-837b-85982c39d7ca	ID	\N	DANA	e_wallet	\N	10000.00	10000000.00	t	t	Instant	\N	41
6cd9c9d7-9623-46c5-92f2-c7a885e37240	TH	\N	TrueMoney	e_wallet	\N	100.00	50000.00	t	t	Instant	\N	42
6ff13b9c-4504-44fc-b0e6-85b764a1f077	MY	\N	Touch 'n Go	e_wallet	\N	10.00	5000.00	t	t	Instant	\N	43
e07047e7-617b-4936-9e09-e6265d8554cb	MY	\N	Boost	e_wallet	\N	10.00	5000.00	t	t	Instant	\N	44
\.


--
-- Data for Name: currencies; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.currencies (id, code, name, symbol, exchange_rate, is_active, is_default, country, sort_order) FROM stdin;
843a6354-4b04-40a5-bb8b-650b2b7fe4a9	USD	US Dollar	$	1.000000	t	t	US	1
aa6a8fdb-51da-4884-a9d1-c9ff2f4e59b1	EGP	Egyptian Pound	ج.م	30.900000	t	f	EG	2
5cae35eb-c546-417b-a05f-eb4ddd6c0077	SAR	Saudi Riyal	ر.س	3.750000	t	f	SA	3
6776640f-3611-47e8-ae93-3556b293a952	AED	UAE Dirham	د.إ	3.670000	t	f	AE	4
7289723e-a813-4e9f-ac3e-c6f9e7d106a2	USDT	Tether	USDT	1.000000	t	f	\N	5
387816da-ac96-4d2e-a0bc-3a9ca0176f40	EUR	Euro	€	0.920000	t	f	\N	0
6fd026d1-cdcb-4225-9fda-6dd3ae9e48bc	GBP	British Pound	£	0.790000	t	f	\N	0
19077c65-3c66-4cfd-8604-243c206ceed0	JPY	Japanese Yen	¥	149.500000	t	f	\N	0
af1705db-7c89-4329-b188-5ebf2b34af51	CNY	Chinese Yuan	¥	7.240000	t	f	\N	0
818dbf68-b335-4496-9343-6a27ae0603fd	AUD	Australian Dollar	A$	1.530000	t	f	\N	0
8e5e0f96-d955-410a-aad2-c76d2f5bdaa9	CAD	Canadian Dollar	C$	1.360000	t	f	\N	0
aab4372e-5650-49cb-aa98-ab62619be078	CHF	Swiss Franc	CHF	0.880000	t	f	\N	0
c12d490f-fed9-4b61-b9d2-6ae6062dc113	HKD	Hong Kong Dollar	HK$	7.810000	t	f	\N	0
edf6ba1c-35d8-428e-a404-e62852c7182f	SGD	Singapore Dollar	S$	1.340000	t	f	\N	0
b8c90607-7124-430c-ba4c-ba033d83a128	INR	Indian Rupee	₹	83.120000	t	f	\N	0
489d2fef-560a-4c35-8f2f-4a6ed28d635b	BRL	Brazilian Real	R$	4.970000	t	f	\N	0
89c9e4f0-9a20-4b81-9fb0-c405eed39aee	RUB	Russian Ruble	₽	92.500000	t	f	\N	0
3c516dde-6480-4703-8156-a8ec71aa8bed	KRW	South Korean Won	₩	1324.500000	t	f	\N	0
312422b6-5514-4e57-aabe-44b7d0d97823	MXN	Mexican Peso	Mex$	17.150000	t	f	\N	0
4a699218-7fed-4575-af03-b1be4bb5315c	ZAR	South African Rand	R	18.750000	t	f	\N	0
907823e0-6aee-41f5-8707-ec46d1a2f4b5	TRY	Turkish Lira	₺	32.150000	t	f	\N	0
f312339d-3d09-429f-9cd3-db8ee25f44b2	NGN	Nigerian Naira	₦	1550.000000	t	f	\N	0
381fddc7-df80-43be-9ab1-98d317146247	KWD	Kuwaiti Dinar	د.ك	0.310000	t	f	\N	0
fbecdf49-8cc7-49cd-a267-ebd4fa7b0159	QAR	Qatari Riyal	ر.ق	3.640000	t	f	\N	0
a699f246-b6d4-41e9-8f70-a68330b32615	BHD	Bahraini Dinar	ب.د	0.380000	t	f	\N	0
f23f6697-1464-470f-8516-5ff8aa021008	OMR	Omani Rial	ر.ع.	0.390000	t	f	\N	0
33e280b4-e797-4a1b-8d77-1b89386557d3	JOD	Jordanian Dinar	د.ا	0.710000	t	f	\N	0
96ffb264-a47f-407e-ae86-e71602e7c15f	LBP	Lebanese Pound	ل.ل	89500.000000	t	f	\N	0
df844e0e-615d-48af-ba46-04aa2b794ac6	IQD	Iraqi Dinar	ع.د	1310.000000	t	f	\N	0
4921c049-7efc-43e7-9b03-c76f09df70e1	PKR	Pakistani Rupee	₨	278.500000	t	f	\N	0
1070ec7c-dbbf-4878-8405-8c28aafb1359	BDT	Bangladeshi Taka	৳	109.750000	t	f	\N	0
24cd7fe4-d047-4ce0-8b9d-a390d48ceaa5	VND	Vietnamese Dong	₫	24500.000000	t	f	\N	0
c17e8f65-113b-4e84-b4de-f92632755718	THB	Thai Baht	฿	35.500000	t	f	\N	0
3e9828c8-396e-430e-9c37-e15988962c3f	MYR	Malaysian Ringgit	RM	4.720000	t	f	\N	0
a058694b-6d44-4ab7-bccd-f77dd81d5506	IDR	Indonesian Rupiah	Rp	15700.000000	t	f	\N	0
06dddb1f-5784-465e-b0bb-d192d548100c	PHP	Philippine Peso	₱	56.250000	t	f	\N	0
6f3fcfe0-9428-4387-8488-00a1f6379fa4	TWD	Taiwan Dollar	NT$	31.500000	t	f	\N	0
0a7da27e-6f6c-482c-b2ff-54cb877723fb	PLN	Polish Zloty	zł	4.020000	t	f	\N	0
816444e4-f02d-495c-9f5c-b7cc5bf3b06a	SEK	Swedish Krona	kr	10.450000	t	f	\N	0
6eb24dad-6120-4fb4-82ce-cf716ab39dd0	NOK	Norwegian Krone	kr	10.750000	t	f	\N	0
8281b389-d9c2-487c-a63a-05aa01bdef56	DKK	Danish Krone	kr	6.880000	t	f	\N	0
97822137-89c7-458e-a61e-8f562cddca40	CZK	Czech Koruna	Kč	23.150000	t	f	\N	0
a992be75-597e-4923-ab0e-68af661d1431	HUF	Hungarian Forint	Ft	358.500000	t	f	\N	0
26e0b726-4b72-41dd-84d1-d0bf711eb109	RON	Romanian Leu	lei	4.580000	t	f	\N	0
46f508ec-6e42-4f2e-819e-cbef80670a4a	BGN	Bulgarian Lev	лв	1.800000	t	f	\N	0
9f071273-2233-48aa-beeb-3b63e8521311	HRK	Croatian Kuna	kn	6.920000	t	f	\N	0
5f88aac8-feb5-4e95-a977-ea0fd474cf2b	ILS	Israeli Shekel	₪	3.650000	t	f	\N	0
920cbc69-a468-4353-b1b6-e6935453eef1	CLP	Chilean Peso	CLP$	950.000000	t	f	\N	0
7448a630-361f-41ab-84cb-c4aab7f22379	COP	Colombian Peso	COL$	3950.000000	t	f	\N	0
9956386e-e01d-4b57-a22d-24b18bca5387	PEN	Peruvian Sol	S/	3.720000	t	f	\N	0
1f56f7f2-f3b8-41ca-b28a-296772c6492f	ARS	Argentine Peso	AR$	850.000000	t	f	\N	0
ff885860-fd61-40cb-8806-ad663e5a7089	UAH	Ukrainian Hryvnia	₴	37.500000	t	f	\N	0
abcc7189-5250-482b-bc14-4a5a9ef760f7	KZT	Kazakhstani Tenge	₸	450.000000	t	f	\N	0
9ad8cc84-f0cd-4437-bcd6-cab3c9cd57f2	MAD	Moroccan Dirham	د.م.	10.050000	t	f	\N	0
c5831d93-6931-4f16-bd64-428e2f471304	TND	Tunisian Dinar	د.ت	3.120000	t	f	\N	0
989888c0-2fa2-40f2-90db-762818187512	DZD	Algerian Dinar	د.ج	134.500000	t	f	\N	0
8eeb9c5d-3c32-409b-bc8f-626318f54d67	LYD	Libyan Dinar	ل.د	4.850000	t	f	\N	0
76b62806-d0a0-44f2-a9eb-0e8d2288ff00	SDG	Sudanese Pound	ج.س.	601.000000	t	f	\N	0
1cdf3f5a-3bbf-4afb-80e6-b3b1e885127c	SYP	Syrian Pound	ل.س	13000.000000	t	f	\N	0
e292bc05-4aef-47fd-a0b3-569497dcb050	YER	Yemeni Rial	﷼	250.500000	t	f	\N	0
16e10238-f859-4e1a-a55a-4affe7c3152a	KES	Kenyan Shilling	KSh	153.500000	t	f	\N	0
ced72d84-d740-43b8-805d-1bbc7b68f019	GHS	Ghanaian Cedi	₵	12.450000	t	f	\N	0
e700a585-0f65-42c3-85e8-6cd376b4ee08	XAF	Central African CFA	FCFA	603.500000	t	f	\N	0
bbec527a-4ddb-48dd-97db-a566e8f08e58	XOF	West African CFA	CFA	603.500000	t	f	\N	0
63cb3176-baa1-4ead-b6c5-07db2a51877d	NZD	New Zealand Dollar	NZ$	1.640000	t	f	\N	0
e05f9349-5c17-4224-929a-ea1b824785a7	BTC	Bitcoin	₿	0.000024	t	f	\N	0
5c189fc7-411f-46f4-b06b-c55e332538ca	ETH	Ethereum	Ξ	0.000420	t	f	\N	0
d0ed4a4a-6201-4755-845d-240275dcd5d8	USDC	USD Coin	USDC	1.000000	t	f	\N	0
\.


--
-- Data for Name: deposit_requests; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.deposit_requests (id, user_id, assigned_agent_id, amount, currency, payment_method, payment_reference, wallet_number, status, min_amount, max_amount, agent_note, confirmed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: domino_moves; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.domino_moves (id, session_id, player_id, move_number, tile_left, tile_right, placed_end, is_passed, board_state, time_spent, created_at) FROM stdin;
\.


--
-- Data for Name: feature_flags; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.feature_flags (id, key, name, name_ar, description, description_ar, is_enabled, category, sort_order, icon, updated_by, created_at, updated_at) FROM stdin;
1e382118-2847-4f68-9185-6ec10d7a401c	dashboard	Dashboard	لوحة التحكم	Main dashboard and overview	لوحة التحكم الرئيسية والنظرة العامة	t	section	1	LayoutDashboard	\N	2026-01-08 21:35:20.059216	2026-01-08 21:35:20.059216
1fd97beb-3d59-45f0-a947-ecc2987369e3	wallet	Wallet	المحفظة	Wallet management and transactions	إدارة المحفظة والمعاملات	t	section	2	Wallet	\N	2026-01-08 21:35:20.059216	2026-01-08 21:35:20.059216
7691822d-41f7-4fd5-ba25-2292190dfaac	challenges	Challenges	التحديات	Multiplayer challenges and competitions	التحديات والمنافسات متعددة اللاعبين	t	section	3	Swords	\N	2026-01-08 21:35:20.059216	2026-01-08 21:35:20.059216
f2bf4588-a152-4fa6-a1df-7735931632f8	p2p	P2P Trading	تداول P2P	Peer-to-peer trading marketplace	سوق التداول بين الأفراد	t	section	5	ArrowLeftRight	\N	2026-01-08 21:35:20.059216	2026-01-08 21:35:20.059216
cd76732e-ac5e-48c6-b152-e7e050909996	free	Free Rewards	مكافآت مجانية	Free rewards and bonuses	المكافآت والهدايا المجانية	t	section	6	Gift	\N	2026-01-08 21:35:20.059216	2026-01-08 21:35:20.059216
cf31d01c-8cf4-4ed4-a459-1028063a3b27	transactions	Transactions	المعاملات	Transaction history and records	سجل المعاملات والعمليات	t	section	7	DollarSign	\N	2026-01-08 21:35:20.059216	2026-01-08 21:35:20.059216
61d6da09-a1b9-4e29-b266-8634c4f7bb89	complaints	Complaints	الشكاوى	Submit and track complaints	تقديم ومتابعة الشكاوى	t	section	8	AlertTriangle	\N	2026-01-08 21:35:20.059216	2026-01-08 21:35:20.059216
3caf4019-ae2c-41fb-8ca0-9502478c84b9	settings	Settings	الإعدادات	User settings and preferences	إعدادات وتفضيلات المستخدم	t	section	10	Settings	\N	2026-01-08 21:35:20.059216	2026-01-08 21:35:20.059216
070106fb-1f59-4be7-be4a-4253168a16ad	support	Support	الدعم	Customer support contact methods	طرق التواصل مع الدعم الفني	t	section	9	\N	\N	2026-01-08 20:51:01.52089	2026-01-08 20:51:01.52089
73638c94-b979-4e78-a5e7-3c6c0c3b1c26	play	Play Games	العب الألعاب	Access to games and entertainment	الوصول للألعاب والترفيه	t	section	4	Play	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-08 21:35:20.059216	2026-01-08 21:38:44.329
\.


--
-- Data for Name: financial_limits; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.financial_limits (id, name, vip_level, min_deposit, max_deposit, min_withdrawal, max_withdrawal, daily_withdrawal_limit, monthly_withdrawal_limit, min_bet, max_bet, daily_loss_limit, weekly_loss_limit, is_active, created_at, updated_at) FROM stdin;
70c05d58-9005-4326-aafe-423bf2e75d71	Basic	0	10.00	1000.00	20.00	500.00	1000.00	100000.00	1.00	1000.00	\N	\N	t	2026-01-08 08:54:34.817447	2026-01-08 08:54:34.817447
59889206-c8ff-4f18-843f-9459aec0e271	Bronze	1	10.00	5000.00	20.00	2000.00	5000.00	100000.00	1.00	1000.00	\N	\N	t	2026-01-08 08:54:34.817447	2026-01-08 08:54:34.817447
e9b27c5a-a2e7-4613-9e5f-a7e9c2bff8ea	Silver	2	10.00	10000.00	20.00	5000.00	10000.00	100000.00	1.00	1000.00	\N	\N	t	2026-01-08 08:54:34.817447	2026-01-08 08:54:34.817447
4b78fb1e-174e-4585-bb20-2976e150aa29	Gold	3	10.00	25000.00	20.00	10000.00	25000.00	100000.00	1.00	1000.00	\N	\N	t	2026-01-08 08:54:34.817447	2026-01-08 08:54:34.817447
242b957d-8a4c-48de-8238-fdc2682d96ff	Platinum	4	10.00	50000.00	20.00	25000.00	50000.00	100000.00	1.00	1000.00	\N	\N	t	2026-01-08 08:54:34.817447	2026-01-08 08:54:34.817447
\.


--
-- Data for Name: game_chat_messages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.game_chat_messages (id, session_id, user_id, message, message_type, is_from_spectator, created_at) FROM stdin;
\.


--
-- Data for Name: game_matches; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.game_matches (id, game_id, player1_id, player2_id, status, winner_id, created_at, started_at, completed_at) FROM stdin;
\.


--
-- Data for Name: game_moves; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.game_moves (id, session_id, player_id, move_number, move_type, move_data, previous_state, new_state, is_valid, time_taken, created_at) FROM stdin;
\.


--
-- Data for Name: game_sections; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.game_sections (id, key, name_en, name_ar, icon, icon_color, sort_order, is_active, created_at, updated_at) FROM stdin;
61d95bbb-c13f-4e1c-9829-d1dfd8bb1a35	crash	Crash Games	ألعاب الانهيار	TrendingUp	text-red-500	1	t	2026-01-09 08:12:05.550086	2026-01-09 08:12:05.550086
7fd2c437-3039-40cd-81b8-e600df9dbe1f	dice	Dice Games	ألعاب النرد	Dices	text-blue-500	2	t	2026-01-09 08:12:05.550086	2026-01-09 08:12:05.550086
c233839d-2aa2-475b-9b72-7913d011e9e7	wheel	Wheel Games	ألعاب العجلة	CircleDot	text-purple-500	3	t	2026-01-09 08:12:05.550086	2026-01-09 08:12:05.550086
20ae6e3d-d3d3-4eaa-a150-aaacb90a1583	slots	Slot Machines	ماكينات القمار	Star	text-yellow-500	4	t	2026-01-09 08:12:05.550086	2026-01-09 08:12:05.550086
4b6649c5-18e5-49bf-9a2f-181d0db383ff	jackpot	Jackpot Games	ألعاب الجائزة الكبرى	Trophy	text-green-500	5	t	2026-01-09 08:12:05.550086	2026-01-09 08:12:05.550086
\.


--
-- Data for Name: game_sessions; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.game_sessions (id, user_id, game_id, bet_amount, multiplier, win_amount, is_win, balance_before, balance_after, seed, result, created_at) FROM stdin;
\.


--
-- Data for Name: game_spectators; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.game_spectators (id, session_id, user_id, joined_at, left_at, total_gifts_sent) FROM stdin;
\.


--
-- Data for Name: gameplay_emojis; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.gameplay_emojis (id, emoji, name, name_ar, price, category, is_active, sort_order, created_at) FROM stdin;
a406f3d6-3373-4d09-b880-21490bfa5d2d	👍	Thumbs Up	إعجاب	0.50	reactions	t	1	2026-01-09 07:39:08.19867
db7ab0c9-9e7d-481d-b8f6-bddff8996aaf	😂	Laughing	ضحك	0.50	emotions	t	2	2026-01-09 07:39:08.19867
71a3faf8-261d-4837-9c5f-b551919d1ce7	🔥	Fire	نار	1.00	special	t	3	2026-01-09 07:39:08.19867
ee80c8ed-af09-47ea-a856-4b0f71709bdf	💰	Money Bag	كيس نقود	2.00	special	t	4	2026-01-09 07:39:08.19867
437af1da-58af-45d2-b81a-b24f9e8b2878	🎉	Party	احتفال	1.50	celebrations	t	5	2026-01-09 07:39:08.19867
4251f10b-46a1-42e3-be9e-74e79742c650	😎	Cool	رائع	0.75	emotions	t	6	2026-01-09 07:39:08.19867
4a1d37b3-8448-4696-8f01-53e00abbacd7	💎	Diamond	ماس	3.00	premium	t	7	2026-01-09 07:39:08.19867
c72feef2-5558-4b76-ba7c-f41bc7d7878d	🏆	Trophy	كأس	2.50	premium	t	8	2026-01-09 07:39:08.19867
2814b49c-c99a-4653-a913-43124e90153e	👑	Crown	تاج	5.00	premium	t	9	2026-01-09 07:39:08.19867
2b1fb6cf-957f-4e9f-b157-b8d614cfc796	💀	Skull	جمجمة	1.00	reactions	t	10	2026-01-09 07:39:08.19867
\.


--
-- Data for Name: gameplay_messages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.gameplay_messages (id, match_id, sender_id, message, emoji_id, is_emoji, emoji_cost, created_at) FROM stdin;
\.


--
-- Data for Name: gameplay_settings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.gameplay_settings (id, key, value, description, description_ar, updated_by, updated_at) FROM stdin;
246040b2-e923-450e-9836-c276b39ad37f	free_play_limit	5	Number of free plays per day	عدد اللعبات المجانية في اليوم	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-09 00:18:20.220457
ef2a9d7a-9d1d-4394-85b8-c38617b245de	min_bet	1.00	Minimum bet amount	الحد الأدنى للرهان	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-09 00:18:20.234432
c571909b-17d0-4ddc-b6f5-8d6ba3bc66d2	max_bet	1000.00	Maximum bet amount	الحد الأقصى للرهان	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-09 00:18:20.242738
f1f10c5c-29e8-4522-a3e4-8256cd9a49d8	house_edge	5.00	House edge percentage	نسبة ربح المنزل	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-09 00:18:20.251634
36d1a0ae-7c26-4fd7-bfb5-165997dd016e	default_rtp	95.00	Default return to player percentage	نسبة العائد للاعب الافتراضية	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-09 00:18:20.25788
\.


--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.games (id, name, description, image_url, thumbnail_url, category, status, rtp, house_edge, volatility, min_bet, max_bet, multiplier_min, multiplier_max, play_count, total_volume, is_featured, sort_order, created_by, created_at, updated_at, sections, game_type, max_players, min_players, is_free_to_play, play_price, pricing_type) FROM stdin;
602582c8-af9b-4ce7-a839-d8f644e9880f	Aviator	Watch the plane fly and cash out before it disappears!	\N	\N	crash	active	97.00	3.00	high	1.00	5000.00	1.00	1000.00	0	0.00	t	1	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
ad623f77-f375-46e1-950c-ab9e80c4d508	Rocket	Ride the rocket to the moon! Cash out before explosion.	\N	\N	crash	active	96.50	3.50	high	0.50	3000.00	1.00	500.00	0	0.00	f	2	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
56bb482a-79a3-477f-9166-d413359aee56	Balloon	Inflate the balloon and collect before it pops!	\N	\N	crash	active	97.50	2.50	medium	1.00	2000.00	1.00	200.00	0	0.00	f	3	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
2a04f31d-1a6c-47ea-acb8-a68e9adeee18	Classic Dice	Roll the dice and predict over or under. Simple and fast!	\N	\N	dice	active	98.00	2.00	low	0.50	2000.00	1.01	99.00	0	0.00	t	4	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
7e1c40ea-f5ad-4e05-b826-e6b4abad9578	Hi-Lo	Predict if the next number is higher or lower!	\N	\N	dice	active	97.00	3.00	low	1.00	1000.00	1.50	10.00	0	0.00	f	5	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
17decfa0-e43d-45dd-89ea-be80c9ae51a4	Triple Dice	Roll 3 dice and match combinations for big wins!	\N	\N	dice	active	96.00	4.00	medium	1.00	500.00	1.00	50.00	0	0.00	f	6	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
f6a68926-fbe0-4ddb-b4c9-e63b8cf75a29	Lucky Wheel	Spin the wheel of fortune for amazing prizes!	\N	\N	wheel	active	96.00	4.00	medium	1.00	1000.00	0.00	50.00	0	0.00	t	7	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
f4910357-63af-4fac-83e5-96034a31be27	Money Wheel	Classic money wheel with multiple segments!	\N	\N	wheel	active	95.50	4.50	medium	0.50	500.00	0.00	40.00	0	0.00	f	8	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
86b4befd-a410-47dd-b739-20cb83c43487	Dream Catcher	Catch your dreams with this exciting wheel game!	\N	\N	wheel	active	96.50	3.50	high	1.00	2000.00	0.00	100.00	0	0.00	f	9	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
9c689421-623f-4d8b-8f1f-d7970dff450b	VEX Slots	Classic slot machine with modern graphics!	\N	\N	slots	active	95.00	5.00	high	0.25	500.00	0.00	500.00	0	0.00	t	10	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
581142c2-aaa2-456d-9468-8a4468818582	Fruit Frenzy	Juicy fruits and sweet wins await!	\N	\N	slots	active	96.00	4.00	medium	0.10	200.00	0.00	200.00	0	0.00	f	11	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
6b2179ee-a811-4367-b696-68f085f21580	Diamond Rush	Hunt for diamonds in this glittering slot!	\N	\N	slots	active	94.50	5.50	high	0.50	1000.00	0.00	1000.00	0	0.00	f	12	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
c593bccb-6335-40e0-b7bd-8df25e547248	Mega Jackpot	Progressive jackpot with life-changing prizes!	\N	\N	jackpot	active	93.00	7.00	high	5.00	500.00	0.00	10000.00	0	0.00	t	13	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
fa2bc56a-95e9-47d1-bbb6-f4a887e025bb	Daily Jackpot	Win the jackpot every day! Guaranteed winner.	\N	\N	jackpot	active	94.00	6.00	medium	1.00	100.00	0.00	1000.00	0	0.00	f	14	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
d0492eda-19c0-489f-9349-3867449ee5cb	Lucky 7 Jackpot	Match lucky 7s for the ultimate prize!	\N	\N	jackpot	active	92.00	8.00	high	2.00	200.00	0.00	5000.00	0	0.00	f	15	\N	2026-01-08 09:28:21.879105	2026-01-08 09:28:21.879105	{play}	single	1	1	f	0.00	bet
11235821-b641-44d4-9035-eb88dd612818	Penalty Shootout	Score goals and win big! Beat the goalkeeper in this exciting penalty shootout game.	/game-thumbnails/penalty-shootout.png	\N	sports	active	96.50	5.00	medium	0.50	100.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.500042	2026-01-10 13:28:45.500042	{play}	single	1	1	f	0.00	bet
432140c9-4550-4a43-9001-648da4e90cdf	Crash	Watch the multiplier rise and cash out before it crashes! High risk, high reward gameplay.	/game-thumbnails/crash.png	\N	crash	active	97.00	5.00	high	0.10	500.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.512323	2026-01-10 13:28:45.512323	{play}	single	1	1	f	0.00	bet
921844a1-8a2f-4dcb-9796-0081fdac75df	Lucky Dice	Roll the dice and predict the outcome. Classic casino dice game.	/game-thumbnails/lucky-dice.png	\N	dice	active	98.50	5.00	low	0.10	200.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.518223	2026-01-10 13:28:45.518223	{play}	single	1	1	f	0.00	bet
0abe150c-9062-4f13-ac89-01842a76f5c6	Plinko	Drop the ball and watch it bounce to your prize. Physics-based luck game.	/game-thumbnails/plinko.png	\N	arcade	active	97.00	5.00	medium	0.10	100.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.522086	2026-01-10 13:28:45.522086	{play}	single	1	1	f	0.00	bet
b11b9e40-9582-41b6-93af-fc65e3a184e0	Mines	Navigate the minefield and collect gems. One wrong step and it's game over!	/game-thumbnails/mines.png	\N	arcade	active	97.00	5.00	high	0.10	100.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.527775	2026-01-10 13:28:45.527775	{play}	single	1	1	f	0.00	bet
a16a17f9-d375-4312-9ced-a717a668782f	Tower Climb	Climb the tower and multiply your winnings with each level. How high can you go?	/game-thumbnails/tower-climb.png	\N	arcade	active	96.00	5.00	high	0.50	100.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.530636	2026-01-10 13:28:45.530636	{play}	single	1	1	f	0.00	bet
13404c6e-ab54-4a94-98d4-dca9d51617c7	Keno	Pick your lucky numbers and watch the draw. Classic lottery-style game.	/game-thumbnails/keno.png	\N	lottery	active	95.00	5.00	medium	0.10	50.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.534977	2026-01-10 13:28:45.534977	{play}	single	1	1	f	0.00	bet
3c04b79f-0d62-4803-bbb8-8cd2d8f7d92c	Wheel of Fortune	Spin the wheel and win amazing prizes! Lucky wheel game.	/game-thumbnails/wheel-of-fortune.png	\N	wheel	active	96.50	5.00	medium	0.50	100.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.540675	2026-01-10 13:28:45.540675	{play}	single	1	1	f	0.00	bet
ce74eb24-0e59-4f8b-93a8-312c81ba4ff6	Blackjack	Beat the dealer to 21! Classic casino card game.	/game-thumbnails/blackjack.png	\N	cards	active	99.50	5.00	low	1.00	500.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.545483	2026-01-10 13:28:45.545483	{play}	single	1	1	f	0.00	bet
67024d25-41e9-4321-9520-aea3239fbb33	Roulette	Place your bets and spin the wheel. European roulette with exciting payouts.	/game-thumbnails/roulette.png	\N	table	active	97.30	5.00	medium	0.50	500.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.549541	2026-01-10 13:28:45.549541	{play}	single	1	1	f	0.00	bet
1f45ba3b-101f-4324-8b61-20d972299261	Baccarat	Bet on player, banker, or tie in this elegant card game.	/game-thumbnails/baccarat.png	\N	cards	active	98.90	5.00	low	1.00	1000.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.552778	2026-01-10 13:28:45.552778	{play}	single	1	1	f	0.00	bet
041fbc46-436e-4a9a-a812-db6f09c3ac11	Coin Flip	Heads or tails? Double your money with a simple flip.	/game-thumbnails/coin-flip.png	\N	arcade	active	98.00	5.00	low	0.10	500.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.558101	2026-01-10 13:28:45.558101	{play}	single	1	1	f	0.00	bet
3a22df05-b438-42c4-b9a9-4956709f9c43	Scratch Cards	Scratch and reveal your instant prizes!	/game-thumbnails/scratch-cards.png	\N	instant	active	95.00	5.00	high	0.50	50.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.704735	2026-01-10 13:28:45.704735	{play}	single	1	1	f	0.00	bet
d0da6f11-88fc-4b69-ba37-e276c1d8665b	Slots Classic	Classic 3-reel slot machine with fruit symbols.	/game-thumbnails/slots-classic.png	\N	slots	active	96.00	5.00	medium	0.20	100.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.711681	2026-01-10 13:28:45.711681	{play}	single	1	1	f	0.00	bet
413e6f4d-bb53-4939-871c-73ff876b9e8b	Mega Slots	5-reel video slots with bonus rounds and free spins.	/game-thumbnails/mega-slots.png	\N	slots	active	96.50	5.00	high	0.20	200.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.716451	2026-01-10 13:28:45.716451	{play}	single	1	1	f	0.00	bet
8124026a-d539-4b52-96f7-c2fd8432d382	Dragon Tiger	Simple and fast card game - bet on Dragon or Tiger.	/game-thumbnails/dragon-tiger.png	\N	cards	active	96.30	5.00	low	0.50	500.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.72061	2026-01-10 13:28:45.72061	{play}	single	1	1	f	0.00	bet
4e34d4b2-a728-4bc2-9814-62e58105fb01	Sic Bo	Ancient Chinese dice game with multiple betting options.	/game-thumbnails/sic-bo.png	\N	dice	active	97.20	5.00	medium	0.50	200.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.723677	2026-01-10 13:28:45.723677	{play}	single	1	1	f	0.00	bet
7e06759f-5203-4722-8360-f00c2aa8a3bf	Craps	Roll the dice and win big in this classic casino game.	/game-thumbnails/craps.png	\N	dice	active	98.60	5.00	medium	1.00	500.00	0.00	100.00	0	0.00	f	0	\N	2026-01-10 13:28:45.726359	2026-01-10 13:28:45.726359	{play}	single	1	1	f	0.00	bet
c1ac411e-b70b-4828-9b44-5cbd03f00667	Domino	Classic domino game. Match tiles and be the first to empty your hand!	\N	\N	board	active	98.00	2.00	low	1.00	1000.00	1.00	2.00	0	0.00	t	1	\N	2026-01-16 17:05:51.112256	2026-01-16 17:05:51.112256	{challenges,multiplayer}	multiplayer	4	2	f	0.00	bet
cd49af3d-5cb9-42ef-acbf-439c5c1ab934	Chess	The ultimate strategy game. Checkmate your opponent to win!	\N	\N	strategy	active	100.00	0.00	low	1.00	500.00	1.00	2.00	0	0.00	t	2	\N	2026-01-16 17:05:51.112256	2026-01-16 17:05:51.112256	{challenges,multiplayer}	multiplayer	2	2	f	0.00	bet
12add3d3-8d8e-422f-b223-25d126328c17	Backgammon	Ancient board game of strategy and luck. Race to bear off all your pieces!	\N	\N	board	active	98.00	2.00	medium	1.00	500.00	1.00	2.00	0	0.00	f	3	\N	2026-01-16 17:05:51.112256	2026-01-16 17:05:51.112256	{challenges,multiplayer}	multiplayer	2	2	f	0.00	bet
19fc03ac-6a6e-4edc-bff4-b34ec95988b0	Tarneeb	Popular Arabic trick-taking card game. Team up and win!	\N	\N	cards	active	100.00	0.00	medium	1.00	500.00	1.00	2.00	0	0.00	t	4	\N	2026-01-16 17:05:51.112256	2026-01-16 17:05:51.112256	{challenges,multiplayer}	multiplayer	4	4	f	0.00	bet
40d24bf5-3c1d-4617-8871-abbbd4de8251	Baloot	Traditional Saudi Arabian card game. Strategy meets luck!	\N	\N	cards	active	100.00	0.00	medium	1.00	500.00	1.00	2.00	0	0.00	t	5	\N	2026-01-16 17:05:51.112256	2026-01-16 17:05:51.112256	{challenges,multiplayer}	multiplayer	4	4	f	0.00	bet
\.


--
-- Data for Name: gift_catalog; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.gift_catalog (id, name, name_ar, description, description_ar, price, icon_url, category, animation_type, coin_value, is_active, sort_order, created_at) FROM stdin;
bcbe4d14-338a-4eab-8d03-383de915d3db	Rose	وردة	\N	\N	0.50000000	heart	love	float	5	t	1	2026-01-19 23:51:06.113779
eb65df2d-9307-4b56-b2d7-9f9a5236801b	Fire	نار	\N	\N	1.00000000	flame	gaming	burst	10	t	2	2026-01-19 23:51:06.425715
b8968d28-5050-4a7e-872e-8b3431cc3ae0	Trophy	كأس	\N	\N	5.00000000	trophy	celebration	spin	50	t	3	2026-01-19 23:51:06.430524
eb1a20bb-1946-42a4-8ab8-29356020f770	Crown	تاج	\N	\N	10.00000000	crown	celebration	rain	100	t	4	2026-01-19 23:51:06.435286
42a313b8-bfd1-4ed3-bff3-dd2faf6fc851	Rocket	صاروخ	\N	\N	25.00000000	rocket	gaming	burst	250	t	5	2026-01-19 23:51:06.439051
44f92b12-0373-43e0-954a-a7d5a5cf2e3d	Diamond	ماسة	\N	\N	50.00000000	gem	love	spin	500	t	6	2026-01-19 23:51:06.442494
f31e6f28-34cc-48ec-be2e-f113a00276e8	Star	نجمة	\N	\N	2.00000000	star	general	float	20	t	7	2026-01-19 23:51:06.446471
d0f36636-b41f-496f-b102-9146d1086448	Lightning	برق	\N	\N	3.00000000	zap	gaming	burst	30	t	8	2026-01-19 23:51:06.450431
\.


--
-- Data for Name: gift_items; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.gift_items (id, name, name_ar, description, description_ar, icon, animation_url, price, creator_share, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: languages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.languages (id, code, name, native_name, is_active, is_default, sort_order) FROM stdin;
a0531963-1529-459e-ba47-8278ea0b69c5	en	English	English	t	t	1
5c7f77a9-2bc4-4852-b005-f42c7734916c	ar	Arabic	العربية	t	f	2
\.


--
-- Data for Name: link_analytics; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.link_analytics (id, affiliate_id, source, medium, campaign, ip_address, user_agent, country, city, is_registered, is_deposited, registered_user_id, clicked_at) FROM stdin;
\.


--
-- Data for Name: live_game_sessions; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.live_game_sessions (id, challenge_id, game_id, game_type, status, game_state, current_turn, turn_number, turn_started_at, turn_time_limit, player1_id, player2_id, player3_id, player4_id, player1_score, player2_score, player3_score, player4_score, team1_score, team2_score, winner_id, winning_team, spectator_count, total_gifts_value, started_at, ended_at, created_at, updated_at) FROM stdin;
be9563c3-97e1-4201-aa4c-e1663825ed69	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	31ed322f-ae77-41bf-b40a-5edd20d82a99	0	\N	60	31ed322f-ae77-41bf-b40a-5edd20d82a99	558d03ae-4a4c-469d-8a61-12586e1a677c	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:46:54.170299	2026-01-16 19:46:54.170299
e7b87084-11e3-4eaf-b3e8-614217f08e9f	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	31ed322f-ae77-41bf-b40a-5edd20d82a99	0	\N	60	31ed322f-ae77-41bf-b40a-5edd20d82a99	558d03ae-4a4c-469d-8a61-12586e1a677c	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:46:54.448925	2026-01-16 19:46:54.448925
30dae3b1-2899-402d-96c0-5235064eb1f5	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	31ed322f-ae77-41bf-b40a-5edd20d82a99	0	\N	60	31ed322f-ae77-41bf-b40a-5edd20d82a99	558d03ae-4a4c-469d-8a61-12586e1a677c	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:46:54.942272	2026-01-16 19:46:54.942272
489bb41f-dd50-43be-a086-1b40bd90fb61	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	31ed322f-ae77-41bf-b40a-5edd20d82a99	0	\N	60	31ed322f-ae77-41bf-b40a-5edd20d82a99	558d03ae-4a4c-469d-8a61-12586e1a677c	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:46:55.186298	2026-01-16 19:46:55.186298
68589f6f-acfe-4a7a-b99f-26de05d61e01	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	31ed322f-ae77-41bf-b40a-5edd20d82a99	0	\N	60	31ed322f-ae77-41bf-b40a-5edd20d82a99	558d03ae-4a4c-469d-8a61-12586e1a677c	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:46:55.411143	2026-01-16 19:46:55.411143
b4538884-fa5e-4f2c-9729-45180dc7ba53	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	31ed322f-ae77-41bf-b40a-5edd20d82a99	0	\N	60	31ed322f-ae77-41bf-b40a-5edd20d82a99	558d03ae-4a4c-469d-8a61-12586e1a677c	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:46:55.632567	2026-01-16 19:46:55.632567
7210d6a5-4c34-4a74-af35-78cfeccd0178	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	e62bc3fb-fdaa-485b-a977-0bab3f604328	0	\N	60	e62bc3fb-fdaa-485b-a977-0bab3f604328	123dff37-4b6c-4d0e-8a6b-aab402acefbf	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:48:10.960218	2026-01-16 19:48:10.960218
c29cf915-36b5-42a4-8a46-c4bd1fc3fc82	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	e62bc3fb-fdaa-485b-a977-0bab3f604328	0	\N	60	e62bc3fb-fdaa-485b-a977-0bab3f604328	123dff37-4b6c-4d0e-8a6b-aab402acefbf	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:48:11.236287	2026-01-16 19:48:11.236287
a88856a7-2c10-4e17-8c02-ee349f4cc63c	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	e62bc3fb-fdaa-485b-a977-0bab3f604328	0	\N	60	e62bc3fb-fdaa-485b-a977-0bab3f604328	123dff37-4b6c-4d0e-8a6b-aab402acefbf	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:48:11.550591	2026-01-16 19:48:11.550591
6be5c931-1153-4475-8c7c-79d73dc31674	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	e62bc3fb-fdaa-485b-a977-0bab3f604328	0	\N	60	e62bc3fb-fdaa-485b-a977-0bab3f604328	123dff37-4b6c-4d0e-8a6b-aab402acefbf	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:48:11.999034	2026-01-16 19:48:11.999034
3d39dca5-d1a6-44fb-a0d2-13302b9f4596	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	e62bc3fb-fdaa-485b-a977-0bab3f604328	0	\N	60	e62bc3fb-fdaa-485b-a977-0bab3f604328	123dff37-4b6c-4d0e-8a6b-aab402acefbf	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:48:12.24553	2026-01-16 19:48:12.24553
d0603f1c-3bcb-4338-b85c-13583c65a018	\N	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	\N	e62bc3fb-fdaa-485b-a977-0bab3f604328	0	\N	60	e62bc3fb-fdaa-485b-a977-0bab3f604328	123dff37-4b6c-4d0e-8a6b-aab402acefbf	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-16 19:48:12.480669	2026-01-16 19:48:12.480669
691c2d2e-f923-46d1-8614-b94025d9307b	41a8b28a-7e4a-44fc-be4c-f46d65f41654	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	{"initialized":true,"startedAt":"2026-01-20T00:45:03.384Z"}	\N	0	\N	60	dc1ec030-d8a5-4972-8e1e-20f01abaee69	00d893bf-c7cc-4c5a-b65d-77f97985d3de	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-20 00:45:03.384882	2026-01-20 00:45:03.384882
afcd25cf-c359-4d34-9413-5fe7621998ac	4f5c49fa-5b74-4890-acf8-65a25a2e36ab	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	{"initialized":true,"startedAt":"2026-01-20T01:00:34.433Z"}	\N	0	\N	60	3091265b-af8d-4bf0-af19-c36a8301a6b2	cdaf32f9-3a37-4c86-85bc-03929da172d7	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-20 01:00:34.43455	2026-01-20 01:00:34.43455
b943baad-fb85-46cc-a821-202d7cbcf925	9cc221c2-278a-4abc-a85d-6718cd89f346	cd49af3d-5cb9-42ef-acbf-439c5c1ab934	chess	in_progress	{"initialized":true,"startedAt":"2026-01-20T01:17:47.072Z"}	\N	0	\N	60	9d753bee-0ae8-4ddf-9339-f2346874c163	6beed496-b444-491f-aa82-d806cf365496	\N	\N	0	0	0	0	0	0	\N	\N	0	0.00	\N	\N	2026-01-20 01:17:47.072999	2026-01-20 01:17:47.072999
\.


--
-- Data for Name: login_history; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.login_history (id, user_id, ip_address, user_agent, device_info, location, is_success, failure_reason, created_at) FROM stdin;
\.


--
-- Data for Name: login_method_configs; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.login_method_configs (id, method, is_enabled, otp_enabled, otp_length, otp_expiry_minutes, settings, updated_by, updated_at) FROM stdin;
64ff7049-da70-4c19-bbfb-3a4ee04abbc1	phone	t	f	6	5	\N	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-10 12:57:50.290655
2ae92460-5be2-4e07-b31a-3d9963d456ad	google	t	f	6	5	\N	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-10 13:14:33.22968
040cb2fa-bff8-42de-8dfa-9fbf3c0973d0	email	t	f	6	5	\N	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-10 16:56:20.235
a0e514f2-998c-4f57-814b-61e610d4279d	facebook	t	t	5	15	\N	d3c00261-9a65-44e4-98ed-03bf38bcc7f6	2026-01-10 16:56:20.813
\.


--
-- Data for Name: managed_languages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.managed_languages (id, code, name, native_name, direction, is_default, is_active, translations, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: matched_supports; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.matched_supports (id, challenge_id, support1_id, support2_id, total_pool, house_fee_total, winner_id, winner_support_id, settled_at, created_at) FROM stdin;
\.


--
-- Data for Name: matchmaking_queue; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.matchmaking_queue (id, game_id, user_id, match_type, friend_account_id, status, created_at) FROM stdin;
\.


--
-- Data for Name: multiplayer_games; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.multiplayer_games (id, key, name_en, name_ar, description_en, description_ar, icon_name, color_class, gradient_class, is_active, min_stake, max_stake, house_fee, min_players, max_players, default_time_limit, is_featured, sort_order, total_games_played, total_volume, created_at, updated_at, category, status, price_vex, free_play_limit, free_play_period, display_locations) FROM stdin;
fd75c831-a308-4ed6-8743-4a35c59c9499	domino	Domino	دومينو	Classic tile matching game	لعبة مطابقة البلاط الكلاسيكية	Target	bg-blue-500/20 text-blue-500 border-blue-500/30	from-blue-500/20 to-blue-600/10	t	1.00	1000.00	0.0500	2	4	600	f	3	0	0.00	2026-01-17 09:54:28.093939	2026-01-17 09:54:28.093939	multiplayer	active	100.00	3	daily	{games,home,challenges}
580fba10-cb1f-4830-b268-889a8c3e014d	tarneeb	Tarneeb	طرنيب	Popular Middle Eastern trick-taking card game	لعبة الورق الشرق أوسطية الشهيرة	Gem	bg-purple-500/20 text-purple-500 border-purple-500/30	from-purple-500/20 to-purple-600/10	t	1.00	1000.00	0.0500	4	4	900	f	4	0	0.00	2026-01-17 09:54:28.103674	2026-01-17 09:54:28.103674	multiplayer	active	100.00	3	daily	{games,home,challenges}
e485f7db-8d4e-4346-9247-df7224ccd97a	baloot	Baloot	بلوت	Traditional Saudi Arabian card game	لعبة الورق السعودية التقليدية	Gem	bg-rose-500/20 text-rose-500 border-rose-500/30	from-rose-500/20 to-rose-600/10	t	1.00	1000.00	0.0500	4	4	900	f	5	0	0.00	2026-01-17 09:54:28.114436	2026-01-17 09:54:28.114436	multiplayer	active	100.00	3	daily	{games,home,challenges}
c61dd0d5-8efd-461b-838f-a14a45edaa05	backgammon	Backgammon	طاولة	Ancient game of dice and strategy	لعبة النرد والإستراتيجية القديمة	Shuffle	bg-emerald-500/20 text-emerald-500 border-emerald-500/30	from-emerald-500/20 to-emerald-600/10	t	1.00	1000.00	0.0500	2	2	600	t	2	3	0.00	2026-01-17 09:54:28.088663	2026-01-17 09:54:28.088663	multiplayer	active	100.00	3	daily	{games,home,challenges}
6a18515a-16da-42eb-bf0d-865bc1bd04ed	chess	Chess	شطرنج	Classic chess game with two players	لعبة الشطرنج الكلاسيكية بين لاعبين	crown	text-amber-500	from-amber-500 to-yellow-600	t	10.00	10000.00	5.0000	2	2	600	t	1	15	0.00	2026-01-19 02:47:50.404523	2026-01-19 02:47:50.404523	multiplayer	active	0.00	0	daily	{games,home,challenges}
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.notifications (id, user_id, type, priority, title, title_ar, message, message_ar, link, metadata, is_read, read_at, created_at) FROM stdin;
fe5a9f05-a666-4ffc-a842-35517bf7a6c6	dbff1338-7a54-4bc3-bdf4-28957de21b39	announcement	normal	lvmbmb	\N	xlf;kbmdfmbdk	\N	\N	{"broadcastId":"1ceaab6f-0a7d-4848-a92f-42438e214cdb"}	f	\N	2026-01-08 23:56:53.864411
4451992c-dcdf-4681-9c84-36fd444ed99d	dbff1338-7a54-4bc3-bdf4-28957de21b39	announcement	normal	lvmbmb	\N	xlf;kbmdfmbdk	\N	\N	{"broadcastId":"d877643f-b44a-47d9-9b8f-e7766784034b"}	f	\N	2026-01-08 23:56:57.511416
\.


--
-- Data for Name: otp_verifications; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.otp_verifications (id, user_id, contact_type, contact_value, code_hash, expires_at, attempts, max_attempts, consumed_at, created_at) FROM stdin;
d6fa6662-a59c-4641-9e5e-ee7074900714	c8c370ed-e8a0-4d38-a298-3d1c36d34aa2	email	newuser@example.com	$2b$10$dGgwPOQ16rUdqfNex9LG8eDCgLmtGnG4IttgkaUdtaZFmqEOw5FUK	2026-01-18 08:57:48.059	0	5	2026-01-18 08:47:59.012	2026-01-18 08:47:48.06604
6a4a018b-2ad4-4e55-997b-3248a05703b9	6982329c-1f84-4198-9703-4fbbd3f0c584	phone	+1555999888	$2b$10$fTOkeTfLIDjAL8WeLA60s.tOgv8Qi0PXmvYDTChPWiuKgRWdUlbqi	2026-01-18 10:37:27.72	0	5	\N	2026-01-18 10:27:27.725478
90729b52-fe98-4e7a-a89e-583968eec15a	2ce87eed-2726-43fd-926b-29e71354d865	email	duxexch@gmail.com	$2b$10$xP4iGZdutuVZO/DQQ9tS3ueQ8OdU7aivrR.ns1uIbw6u8r4pbhMPG	2026-01-18 10:47:36.385	0	5	\N	2026-01-18 10:37:36.389084
5c7f849a-1da0-4308-888c-50aa1c0cf761	2ce87eed-2726-43fd-926b-29e71354d865	phone	+201211780776	$2b$10$ePYG4LYYkBOVSTyEH8A5hec95QU9HIPahTn0hpM36FtnsjJedcoVy	2026-01-18 10:48:06.903	0	5	\N	2026-01-18 10:38:06.905166
\.


--
-- Data for Name: p2p_badge_definitions; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_badge_definitions (id, slug, name, name_ar, description, description_ar, icon, color, min_trades, min_completion_rate, min_volume, max_dispute_rate, max_response_time, requires_verification, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: p2p_dispute_evidence; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_dispute_evidence (id, dispute_id, uploader_id, file_name, file_url, file_type, file_size, description, evidence_type, is_verified, verified_by, verified_at, created_at) FROM stdin;
\.


--
-- Data for Name: p2p_dispute_messages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_dispute_messages (id, dispute_id, sender_id, message, is_prewritten, prewritten_template_id, is_from_support, created_at) FROM stdin;
\.


--
-- Data for Name: p2p_dispute_rules; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_dispute_rules (id, category, title, title_ar, content, content_ar, icon, is_active, sort_order, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: p2p_disputes; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_disputes (id, trade_id, initiator_id, respondent_id, status, reason, description, evidence, resolution, resolved_by, winner_user_id, resolved_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: p2p_escrow; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_escrow (id, trade_id, amount, currency, status, held_at, released_at, returned_at) FROM stdin;
\.


--
-- Data for Name: p2p_offers; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_offers (id, user_id, type, status, crypto_currency, fiat_currency, price, available_amount, min_limit, max_limit, payment_methods, payment_time_limit, terms, auto_reply, completed_trades, completion_rate, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: p2p_prewritten_responses; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_prewritten_responses (id, category, title, title_ar, message, message_ar, is_active, usage_count, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: p2p_settings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_settings (id, platform_fee_percentage, min_trade_amount, max_trade_amount, escrow_timeout_hours, payment_timeout_minutes, is_enabled, updated_at, fee_type, platform_fee_fixed, min_fee, max_fee, auto_expire_enabled) FROM stdin;
2d65a84c-a2ae-466b-8c0d-7c0edae8e415	0.0050	10.00	100000.00	24	15	t	2026-01-08 08:54:34.813786	percentage	0.00	0.00	\N	t
\.


--
-- Data for Name: p2p_trade_messages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_trade_messages (id, trade_id, sender_id, message, is_prewritten, is_system_message, attachment_url, attachment_type, is_read, read_at, created_at) FROM stdin;
\.


--
-- Data for Name: p2p_trader_badges; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_trader_badges (id, user_id, badge_slug, earned_at, expires_at, is_displayed) FROM stdin;
\.


--
-- Data for Name: p2p_trader_metrics; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_trader_metrics (id, user_id, total_trades, completed_trades, cancelled_trades, completion_rate, total_buy_trades, total_sell_trades, total_volume_usdt, total_disputes, disputes_won, disputes_lost, dispute_rate, avg_release_time_seconds, avg_payment_time_seconds, avg_response_time_seconds, positive_ratings, negative_ratings, overall_rating, trades_30d, completion_30d, volume_30d, first_trade_at, last_trade_at, updated_at) FROM stdin;
\.


--
-- Data for Name: p2p_trader_payment_methods; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_trader_payment_methods (id, user_id, type, name, account_number, bank_name, holder_name, details, is_verified, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: p2p_trader_profiles; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_trader_profiles (id, user_id, display_name, bio, region, preferred_currencies, verification_level, is_online, last_seen_at, auto_reply_enabled, auto_reply_message, notify_on_trade, notify_on_dispute, notify_on_message, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: p2p_trader_ratings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_trader_ratings (id, trade_id, rater_id, rated_user_id, rating, comment, created_at) FROM stdin;
\.


--
-- Data for Name: p2p_trades; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_trades (id, offer_id, buyer_id, seller_id, status, amount, fiat_amount, price, payment_method, payment_reference, escrow_amount, platform_fee, expires_at, paid_at, confirmed_at, completed_at, cancelled_at, cancel_reason, created_at, updated_at, currency_type, escrow_earned_amount, escrow_purchased_amount) FROM stdin;
\.


--
-- Data for Name: p2p_transaction_logs; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.p2p_transaction_logs (id, trade_id, dispute_id, user_id, action, description, description_ar, metadata, ip_address, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.password_reset_tokens (id, user_id, token, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: project_currency_conversions; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.project_currency_conversions (id, user_id, base_currency_amount, project_currency_amount, exchange_rate_used, commission_amount, net_amount, status, approved_by_id, rejection_reason, approved_at, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: project_currency_ledger; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.project_currency_ledger (id, user_id, wallet_id, type, amount, balance_before, balance_after, reference_id, reference_type, description, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: project_currency_settings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.project_currency_settings (id, currency_name, currency_symbol, base_currency_code, exchange_rate, min_conversion_amount, max_conversion_amount, daily_conversion_limit_per_user, total_platform_daily_limit, conversion_commission_rate, approval_mode, is_active, allow_points_conversion, points_exchange_rate, created_at, updated_at, use_in_games, use_in_p2p, allow_earned_balance, earned_balance_expire_days) FROM stdin;
c500a4a4-9d44-47ad-8158-86e52f70f187	VIX Coin	VX	USD	1.000000	1.00	10000.00	5000.00	1000000.00	0.0100	automatic	t	f	10.000000	2026-01-17 14:02:47.193564	2026-01-20 01:20:37.192	t	t	t	\N
\.


--
-- Data for Name: project_currency_wallets; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.project_currency_wallets (id, user_id, purchased_balance, earned_balance, total_balance, total_converted, total_spent, total_earned, locked_balance, created_at, updated_at) FROM stdin;
c4037283-45d2-4802-b16e-8ef5c34bac66	fd1b585b-3a65-464c-8de9-38dbc3b97211	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2026-01-17 14:03:26.360714	2026-01-17 14:03:26.360714
0a3b6632-7664-40db-99a5-d02312d55a4a	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2026-01-18 11:30:46.033836	2026-01-18 11:30:46.033836
84306ee8-9a03-4c55-8099-661723779e29	cdaf32f9-3a37-4c86-85bc-03929da172d7	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2026-01-20 01:01:55.751827	2026-01-20 01:01:55.751827
15118fdb-bfe4-43d1-bdd9-f0df272a4fb3	9d753bee-0ae8-4ddf-9339-f2346874c163	0.00	0.00	0.00	0.00	0.00	0.00	0.00	2026-01-20 01:19:38.698591	2026-01-20 01:19:38.698591
\.


--
-- Data for Name: promo_code_usages; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.promo_code_usages (id, promo_code_id, user_id, transaction_id, discount_amount, used_at) FROM stdin;
\.


--
-- Data for Name: promo_codes; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.promo_codes (id, code, affiliate_id, type, value, min_deposit, max_discount, usage_limit, usage_count, per_user_limit, is_active, starts_at, expires_at, created_at) FROM stdin;
9ca8d1b5-7f91-4aef-a705-39d921c082c5	WELCOME100	\N	percentage	100.00	50.00	500.00	1000	0	1	t	\N	\N	2026-01-08 08:54:34.821192
47db1c03-aa0a-40f0-a015-c4f2dac08661	VEX50	\N	fixed	50.00	100.00	\N	500	0	1	t	\N	\N	2026-01-08 08:54:34.821192
1ee0ed6e-f10f-4d9c-8608-66568f872ccf	NEWUSER	\N	percentage	50.00	20.00	200.00	\N	0	1	t	\N	\N	2026-01-08 08:54:34.821192
\.


--
-- Data for Name: scheduled_config_changes; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.scheduled_config_changes (id, game_id, action, scheduled_at, status, changes, description, created_by, applied_at, failure_reason, created_at) FROM stdin;
\.


--
-- Data for Name: season_rewards; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.season_rewards (id, season_id, rank_from, rank_to, reward_amount, reward_description_en, reward_description_ar, created_at) FROM stdin;
\.


--
-- Data for Name: seasonal_stats; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.seasonal_stats (id, user_id, season_id, games_played, games_won, games_lost, games_draw, chess_played, chess_won, backgammon_played, backgammon_won, domino_played, domino_won, tarneeb_played, tarneeb_won, baloot_played, baloot_won, total_earnings, current_win_streak, longest_win_streak, rank, rank_updated_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: seasons; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.seasons (id, number, name_en, name_ar, description_en, description_ar, status, start_date, end_date, prize_pool, created_at) FROM stdin;
\.


--
-- Data for Name: social_platforms; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.social_platforms (id, name, display_name, display_name_ar, icon, type, is_enabled, client_id, client_secret, api_key, api_secret, webhook_url, callback_url, bot_token, phone_number_id, business_account_id, access_token, refresh_token, otp_enabled, otp_template, otp_expiry, sort_order, settings, created_at, updated_at) FROM stdin;
e767a2ae-4c31-42a1-9bb4-1fc11572b9b9	google	Google	جوجل	SiGoogle	oauth	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	1	\N	2026-01-13 02:35:29.662578	2026-01-13 02:35:29.662578
f95b1900-8834-4955-8009-fc715667e0ea	facebook	Facebook	فيسبوك	SiFacebook	oauth	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	2	\N	2026-01-13 02:35:29.684573	2026-01-13 02:35:29.684573
0345cf22-bf17-458a-93d8-268d4c1b2859	telegram	Telegram	تيليجرام	SiTelegram	both	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	3	\N	2026-01-13 02:35:29.692885	2026-01-13 02:35:29.692885
926cfd03-b6df-448d-b2a3-c9bb6fa538e3	whatsapp	WhatsApp	واتساب	SiWhatsapp	otp	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	4	\N	2026-01-13 02:35:29.707435	2026-01-13 02:35:29.707435
37e2bbc9-c6bb-40ec-91c1-c06b909db545	twitter	X (Twitter)	إكس (تويتر)	SiX	oauth	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	5	\N	2026-01-13 02:35:29.712123	2026-01-13 02:35:29.712123
69a46285-ecb5-42f3-a6f7-b90e7481a233	apple	Apple	آبل	SiApple	oauth	t	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	6	\N	2026-01-13 02:35:29.716056	2026-01-13 02:35:29.716056
70cc70d0-66f2-4ec0-9921-2ff1eb36baae	discord	Discord	ديسكورد	SiDiscord	oauth	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	7	\N	2026-01-13 11:00:32.687325	2026-01-13 11:00:32.687325
8a59140b-38fc-4451-a010-ce01ea121560	linkedin	LinkedIn	لينكدإن	SiLinkedin	oauth	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	8	\N	2026-01-13 11:00:32.687325	2026-01-13 11:00:32.687325
8be8e147-6416-4cbb-9b7d-1333cb23c0b7	github	GitHub	جيت هاب	SiGithub	oauth	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	9	\N	2026-01-13 11:00:32.687325	2026-01-13 11:00:32.687325
73723d74-63ca-4931-9e74-f4cdfc6fd07e	tiktok	TikTok	تيك توك	SiTiktok	oauth	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	10	\N	2026-01-13 11:00:32.687325	2026-01-13 11:00:32.687325
9266f967-e8c5-4afb-9e83-c42b285d595e	instagram	Instagram	إنستجرام	SiInstagram	oauth	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	11	\N	2026-01-13 11:00:32.687325	2026-01-13 11:00:32.687325
07c791e7-db1a-4aef-9337-77358307c03c	sms	SMS	رسائل SMS	Phone	otp	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	300	12	\N	2026-01-13 11:00:32.687325	2026-01-13 11:00:32.687325
\.


--
-- Data for Name: spectator_gifts; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.spectator_gifts (id, session_id, sender_id, recipient_id, gift_item_id, quantity, total_price, recipient_earnings, message, created_at) FROM stdin;
\.


--
-- Data for Name: spectator_supports; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.spectator_supports (id, challenge_id, session_id, supporter_id, supported_player_id, amount, odds, potential_winnings, mode, status, matched_support_id, house_fee, actual_winnings, settled_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: support_contacts; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.support_contacts (id, type, label, value, icon, is_active, display_order, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: support_settings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.support_settings (id, game_type, is_enabled, odds_mode, default_odds_player1, default_odds_player2, min_support_amount, max_support_amount, house_fee_percent, allow_instant_match, instant_match_odds, win_rate_weight, experience_weight, streak_weight, created_at, updated_at) FROM stdin;
5e6276fe-2c00-41eb-8812-428c6dd03347	domino	t	automatic	1.90	1.90	1.00	1000.00	5.00	t	1.80	0.60	0.25	0.15	2026-01-18 12:15:27.180562	2026-01-18 12:15:27.180562
eb9184b3-e692-4ef0-bd8c-e2b741587786	chess	t	automatic	1.90	1.90	1.00	1000.00	5.00	t	1.80	0.60	0.25	0.15	2026-01-18 14:31:56.829354	2026-01-18 14:31:56.829354
7dbc50a8-ba92-430e-b7c3-800ff41d2ba2	backgammon	t	automatic	1.90	1.90	1.00	1000.00	5.00	t	1.80	0.60	0.25	0.15	2026-01-18 14:35:22.705296	2026-01-18 14:35:22.705296
\.


--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.system_config (key, value, version, updated_at, updated_by) FROM stdin;
multiplayer_games_version	1768790681015	2	2026-01-19 02:44:41.02	d3c00261-9a65-44e4-98ed-03bf38bcc7f6
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.system_settings (id, key, value, category, description, data_type, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: themes; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.themes (id, name, display_name, primary_color, secondary_color, accent_color, background_color, foreground_color, card_color, muted_color, border_color, is_active, is_default, created_at) FROM stdin;
91a4d4d8-4c14-4f28-bef7-1d47225632fd	vex-dark	VEX Dark (Default)	#00c853	#ff9800	#00e676	#0f1419	#ffffff	#1a1f2e	#6b7280	#2d3748	t	t	2026-01-08 08:54:34.81061
83b83af3-cd92-4cd3-8241-763c3685df87	vex-royal	VEX Royal	#6366f1	#f59e0b	#8b5cf6	#0c0a1d	#ffffff	#1e1b4b	#9ca3af	#312e81	t	f	2026-01-08 08:54:34.81061
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.transactions (id, user_id, type, status, amount, balance_before, balance_after, description, reference_id, processed_by, processed_at, admin_note, created_at, updated_at) FROM stdin;
6665e5a7-5447-4a22-b640-6b5eccd72237	cf6253a2-dc52-4f80-b9ec-ef9ff0c69570	bonus	completed	100000.00	0.00	100000.00	Admin adjustment: فتلاتبتبتبي	\N	\N	\N	فتلاتبتبتبي	2026-01-08 21:37:52.235435	2026-01-08 21:37:52.235435
9ac8d39b-8f62-4851-984a-45e60378bdd4	2816cb35-beb1-4838-9ff9-508006841d4b	bonus	completed	100000.00	0.00	100000.00	Admin adjustment: sdfadad	\N	\N	\N	sdfadad	2026-01-08 21:49:05.852142	2026-01-08 21:49:05.852142
f739cd05-1570-4787-a685-2317f5f7fbe2	2b95632c-c4ea-49a2-bdf3-a9ff4c8eccb5	bonus	completed	100000.00	0.00	100000.00	Admin adjustment: zdvzdvdvdv	\N	\N	\N	zdvzdvdvdv	2026-01-08 21:49:37.770871	2026-01-08 21:49:37.770871
778b640c-e523-49eb-a226-6af0401d06eb	dbff1338-7a54-4bc3-bdf4-28957de21b39	bonus	completed	4723899.00	0.00	4723899.00	Admin adjustment: ssfd4t3t\n	\N	\N	\N	ssfd4t3t\n	2026-01-09 00:04:10.642257	2026-01-09 00:04:10.642257
0e25cf9a-98ac-4d28-90d8-7f6ce7949de1	d960f328-1d84-4cd3-a49c-754f06811cf7	bonus	completed	1224545.00	0.00	1224545.00	Admin adjustment: hhhfdsdffdsadfgwetw4tt	\N	\N	\N	hhhfdsdffdsadfgwetw4tt	2026-01-10 12:46:30.260299	2026-01-10 12:46:30.260299
6bcb455b-f852-4f8b-b2b0-103aca13174d	d960f328-1d84-4cd3-a49c-754f06811cf7	withdrawal	completed	3534.00	1224545.00	1221011.00	Admin adjustment: dsgsgfdff	\N	\N	\N	dsgsgfdff	2026-01-10 12:52:09.798883	2026-01-10 12:52:09.798883
f6298e23-06e8-4955-8c0f-f2c523aa2618	0f3855e6-bb9a-462a-932b-3e096a93fb10	win	completed	25.00	50.00	75.00	Game winnings from session 32afb770-d959-42e1-a0e8-dbc70d50b56a	32afb770-d959-42e1-a0e8-dbc70d50b56a	\N	2026-01-16 23:34:29.349	\N	2026-01-16 23:34:29.335225	2026-01-16 23:34:29.335225
1045de4a-56ca-43dd-85e5-5f241618a264	9ef70f00-7c3e-427c-b658-fd47a2234b0a	stake	completed	25.00	75.00	50.00	Game stake loss in session 32afb770-d959-42e1-a0e8-dbc70d50b56a	32afb770-d959-42e1-a0e8-dbc70d50b56a	\N	2026-01-16 23:34:29.354	\N	2026-01-16 23:34:29.335225	2026-01-16 23:34:29.335225
0b106c57-aa2e-47d6-b9d1-74a7cd0d54d1	dc06a6de-1f5d-4507-b18e-bd89905cbfa1	win	completed	10.00	100.00	110.00	Game winnings from session cc7e723e-73a3-4356-b02a-ce022e12cd43	cc7e723e-73a3-4356-b02a-ce022e12cd43	\N	2026-01-16 23:34:29.96	\N	2026-01-16 23:34:29.92176	2026-01-16 23:34:29.92176
dadb5aeb-b371-42b1-8004-2da3bf82c9b1	73ca4c4a-a051-4a21-b3dd-1b7e96b480e0	stake	completed	10.00	110.00	100.00	Game stake loss in session cc7e723e-73a3-4356-b02a-ce022e12cd43	cc7e723e-73a3-4356-b02a-ce022e12cd43	\N	2026-01-16 23:34:29.962	\N	2026-01-16 23:34:29.92176	2026-01-16 23:34:29.92176
9092c26e-8595-4bc6-b7dc-66508c2308c0	dc06a6de-1f5d-4507-b18e-bd89905cbfa1	win	completed	10.00	110.00	120.00	Game winnings from session 16092186-abbf-423b-a3b3-db5c585f05a2	16092186-abbf-423b-a3b3-db5c585f05a2	\N	2026-01-16 23:34:29.985	\N	2026-01-16 23:34:29.973134	2026-01-16 23:34:29.973134
0f392530-87d7-4d34-9495-f7e360ede333	73ca4c4a-a051-4a21-b3dd-1b7e96b480e0	stake	completed	10.00	110.00	100.00	Game stake loss in session 16092186-abbf-423b-a3b3-db5c585f05a2	16092186-abbf-423b-a3b3-db5c585f05a2	\N	2026-01-16 23:34:29.988	\N	2026-01-16 23:34:29.973134	2026-01-16 23:34:29.973134
ceff0f75-80fc-4857-a3bf-34789b9049ee	dc06a6de-1f5d-4507-b18e-bd89905cbfa1	win	completed	10.00	120.00	130.00	Game winnings from session f137a1af-aff1-4937-8c74-c27d76390f39	f137a1af-aff1-4937-8c74-c27d76390f39	\N	2026-01-16 23:34:30.055	\N	2026-01-16 23:34:30.033258	2026-01-16 23:34:30.033258
e85b33db-d657-4393-8915-66e315f52d2b	73ca4c4a-a051-4a21-b3dd-1b7e96b480e0	stake	completed	10.00	110.00	100.00	Game stake loss in session f137a1af-aff1-4937-8c74-c27d76390f39	f137a1af-aff1-4937-8c74-c27d76390f39	\N	2026-01-16 23:34:30.083	\N	2026-01-16 23:34:30.033258	2026-01-16 23:34:30.033258
769a850a-5918-493b-9ec2-43638728ba3e	60ba58c6-5c77-45dd-8493-151573e00df2	bonus	completed	2523453453.00	0.00	2523453453.00	Reward: ترلاىرلاى	\N	\N	\N	Sent by admin: ترلاىرلاى	2026-01-17 09:45:40.648683	2026-01-17 09:45:40.648683
aa072bab-e051-4112-8f06-355fe736d0f1	f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	bonus	completed	242422.00	0.00	242422.00	Admin adjustment: ghjgjg	\N	\N	\N	ghjgjg	2026-01-18 11:17:03.699531	2026-01-18 11:17:03.699531
a799c9d8-9a77-4334-aebc-b2cd951903a5	074689ad-b8ce-44b8-a015-daed296f5281	bonus	completed	515451521.00	0.00	515451521.00	Admin adjustment: scsdds	\N	\N	\N	scsdds	2026-01-19 20:10:46.144637	2026-01-19 20:10:46.144637
f7ee94bb-3bb0-4a99-ac71-1b02fb89e347	8c56493e-4777-406b-bbf0-a47203630997	bonus	completed	2222.00	0.00	2222.00	Admin adjustment: ببللل	\N	\N	\N	ببللل	2026-01-19 20:19:07.890463	2026-01-19 20:19:07.890463
edd93c50-2995-4ffe-8ba5-16f0edfe028d	377adf3b-56b3-4d0d-922b-3a6ddb3fb524	bonus	completed	54645342.00	0.00	54645342.00	Admin adjustment: بلءؤرءؤرء	\N	\N	\N	بلءؤرءؤرء	2026-01-19 20:31:18.074374	2026-01-19 20:31:18.074374
8338a39c-4221-4a67-92c8-5d3004ffe062	377adf3b-56b3-4d0d-922b-3a6ddb3fb524	bonus	completed	7534534534.00	54645342.00	7589179876.00	Admin adjustment: XCDSA	\N	\N	\N	XCDSA	2026-01-20 00:04:05.66041	2026-01-20 00:04:05.66041
86774840-11de-4fac-9165-c0ad528eb226	fd1e958c-afc3-49bc-a229-a1049ff601e3	bonus	completed	45345342.00	0.00	45345342.00	Admin adjustment: WSFAS	\N	\N	\N	WSFAS	2026-01-20 00:04:29.032425	2026-01-20 00:04:29.032425
deb4ac38-965a-49b6-8ed7-dd6cb446a834	da6f34a0-2e4c-4b95-92af-c77488d71838	bonus	completed	53453453.00	0.00	53453453.00	Admin adjustment: FSDFSDF	\N	\N	\N	FSDFSDF	2026-01-20 00:04:37.451693	2026-01-20 00:04:37.451693
f46f0fc5-3747-4f89-9227-d774d46be878	7d8e1972-80e7-4e00-abc8-84f726c204b6	bonus	completed	7564534.00	0.00	7564534.00	Admin adjustment: SDASDASD	\N	\N	\N	SDASDASD	2026-01-20 00:05:06.699868	2026-01-20 00:05:06.699868
3a2b8fb0-36f5-46f0-bca9-b2da00f50e71	8c9ab0fc-6d0b-4f68-919a-fd15bf74df6c	bonus	completed	4534533456456.00	0.00	4534533456456.00	Admin adjustment: يبئيبئيب	\N	\N	\N	يبئيبئيب	2026-01-20 00:35:40.379715	2026-01-20 00:35:40.379715
eb9e103c-f96e-4d91-964b-7b1fa8c42562	1a06eb5f-8fca-4c3d-8264-339f3d9a8cda	bonus	completed	45331345.00	0.00	45331345.00	Admin adjustment: بسيبسيبثق	\N	\N	\N	بسيبسيبثق	2026-01-20 00:35:48.756526	2026-01-20 00:35:48.756526
a79cc9c2-5876-4ba2-97f1-c18fb730b5a9	b684a576-04af-4caa-8ccb-c52339356cc3	bonus	completed	48978646.00	0.00	48978646.00	Admin adjustment: ثسثقصثق	\N	\N	\N	ثسثقصثق	2026-01-20 00:43:21.287432	2026-01-20 00:43:21.287432
57d992f3-fb98-4dfa-84af-8affd8c08203	00d893bf-c7cc-4c5a-b65d-77f97985d3de	bonus	completed	5624645.00	0.00	5624645.00	Admin adjustment: فسفسث	\N	\N	\N	فسفسث	2026-01-20 00:43:28.197342	2026-01-20 00:43:28.197342
f14ed3a6-5f4b-4211-ba8f-a0570f590923	dc1ec030-d8a5-4972-8e1e-20f01abaee69	bonus	completed	1563123123.00	0.00	1563123123.00	Admin adjustment: ؤلابليل	\N	\N	\N	ؤلابليل	2026-01-20 00:43:36.633996	2026-01-20 00:43:36.633996
6a925b20-3143-410c-84bb-982ae7d2dc83	07d181cd-5c5f-48ef-9176-a8bde979da32	bonus	completed	546456456.00	0.00	546456456.00	Admin adjustment: ثبسيبسيب	\N	\N	\N	ثبسيبسيب	2026-01-20 00:58:18.01334	2026-01-20 00:58:18.01334
fb2e9940-9a4f-46d5-a10d-38690034c302	07d181cd-5c5f-48ef-9176-a8bde979da32	bonus	completed	533123.00	546456456.00	546989579.00	Reward: سبسيبسيبسي	\N	\N	\N	Sent by admin: سبسيبسيبسي	2026-01-20 00:58:28.981681	2026-01-20 00:58:28.981681
4d31f78b-fec1-46cc-ad0e-41201f31e28b	cdaf32f9-3a37-4c86-85bc-03929da172d7	bonus	completed	45645323.00	0.00	45645323.00	Reward: سبسيبسيب	\N	\N	\N	Sent by admin: سبسيبسيب	2026-01-20 00:58:36.380794	2026-01-20 00:58:36.380794
341ece98-7b01-4aa9-a930-5ac54ecf8021	cdaf32f9-3a37-4c86-85bc-03929da172d7	bonus	completed	453435123.00	45645323.00	499080446.00	Admin adjustment: سيسيبسيب	\N	\N	\N	سيسيبسيب	2026-01-20 00:58:50.409552	2026-01-20 00:58:50.409552
b5571f11-c119-4d42-826a-2c60b14051e0	3091265b-af8d-4bf0-af19-c36a8301a6b2	bonus	completed	5345343.00	0.00	5345343.00	Admin adjustment: سبسيبسيبس	\N	\N	\N	سبسيبسيبس	2026-01-20 00:58:58.000238	2026-01-20 00:58:58.000238
0b3f8fe7-5c70-4ad1-91a2-6494b33386d7	3091265b-af8d-4bf0-af19-c36a8301a6b2	bonus	completed	453434.00	5345343.00	5798777.00	Reward: سيسيب	\N	\N	\N	Sent by admin: سيسيب	2026-01-20 00:59:06.987892	2026-01-20 00:59:06.987892
6b874cd8-6b4c-4f2f-a546-e8989f3a703d	cdaf32f9-3a37-4c86-85bc-03929da172d7	withdrawal	pending	2000.00	499080346.00	499078346.00	Withdrawal request	\N	\N	\N	\N	2026-01-20 01:02:37.738261	2026-01-20 01:02:37.738261
3e823637-f50b-4091-b6da-a5f4dc479294	e6092a9c-04aa-48d2-8617-202ff5a62c50	bonus	completed	5456456.00	0.00	5456456.00	Admin adjustment: صثث	\N	\N	\N	صثث	2026-01-20 01:16:42.276693	2026-01-20 01:16:42.276693
e269afc0-305a-45b8-bf64-eb3d65faf4b7	9d753bee-0ae8-4ddf-9339-f2346874c163	bonus	completed	545343.00	0.00	545343.00	Admin adjustment: سبسيبسي	\N	\N	\N	سبسيبسي	2026-01-20 01:16:50.241484	2026-01-20 01:16:50.241484
ad2f4072-e15c-4808-9f01-789bc3307e3d	6beed496-b444-491f-aa82-d806cf365496	bonus	completed	5345343.00	0.00	5345343.00	Admin adjustment: يبسبسيب	\N	\N	\N	يبسبسيب	2026-01-20 01:16:57.857842	2026-01-20 01:16:57.857842
e111e13c-25d2-4250-8f49-f6b5781af2c2	5bbefd70-91b3-4631-a5ee-79c68522b3f5	bonus	completed	5454545454.00	0.00	5454545454.00	Admin adjustment: srvverrererere	\N	\N	\N	srvverrererere	2026-01-21 20:22:12.452863	2026-01-21 20:22:12.452863
112a3d4b-5158-4f86-9dc5-6573d3507d59	986a9ace-9937-49a2-bd90-c66c64d71789	bonus	completed	5445540540.00	0.00	5445540540.00	Admin adjustment: tbvrrverereer	\N	\N	\N	tbvrrverereer	2026-01-21 20:22:21.73058	2026-01-21 20:22:21.73058
\.


--
-- Data for Name: user_achievements; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.user_achievements (id, user_id, achievement_id, progress, unlocked_at, reward_claimed, reward_claimed_at, created_at) FROM stdin;
\.


--
-- Data for Name: user_badges; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.user_badges (id, user_id, badge_id, earned_at) FROM stdin;
\.


--
-- Data for Name: user_gift_inventory; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.user_gift_inventory (id, user_id, gift_id, quantity, purchased_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_preferences; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.user_preferences (id, user_id, language, currency, timezone, notify_announcements, notify_transactions, notify_promotions, notify_p2p, email_notifications, sms_notifications, updated_at, notify_challenger_activity, hide_balance_in_lists) FROM stdin;
6ed67f4e-2a93-4e70-b54e-fdd6daaba2e9	6c42c595-593c-438a-9353-ed051ceae603	en	GBP	UTC	t	t	t	t	f	f	2026-01-10 13:38:36.135171	t	f
\.


--
-- Data for Name: user_relationships; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.user_relationships (id, user_id, target_user_id, type, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.user_sessions (id, user_id, session_token, device_info, ip_address, user_agent, location, is_active, last_active_at, expires_at, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: vex_user
--

COPY public.users (id, username, email, password, role, status, first_name, last_name, phone, balance, total_deposited, total_withdrawn, total_wagered, total_won, vip_level, referred_by, created_at, updated_at, last_login_at, account_id, phone_verified, p2p_banned, p2p_ban_reason, p2p_banned_at, free_play_count, free_play_reset_at, nickname, profile_picture, p2p_rating, p2p_total_trades, p2p_successful_trades, id_front_image, id_back_image, id_verification_rejection_reason, id_verified_at, id_verification_status, withdrawal_password, withdrawal_password_enabled, is_online, stealth_mode, last_active_at, must_change_password, total_earnings, games_played, games_won, games_lost, games_draw, chess_played, chess_won, backgammon_played, backgammon_won, domino_played, domino_won, tarneeb_played, tarneeb_won, baloot_played, baloot_won, current_win_streak, longest_win_streak, blocked_users, muted_users, cover_photo, email_verified) FROM stdin;
432ddd04-bf46-4e87-9089-3eb43d54c657	test_1768594405100_i10sna9q	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.13202	2026-01-16 20:13:25.13202	\N	test_1768594405100_i10sna9q	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ff3a8aff-b543-490e-a839-1a52b92506ad	test_1768594405293_jv80e7bg	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.294035	2026-01-16 20:13:25.315	\N	test_1768594405293_jv80e7bg	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
51f0531d-199b-4634-8d89-6c7de5d25bf4	781594136	\N	$2b$10$woVw3V6B8utZVCw9pzhSReqyIzj7Jd7nkSFrcOAj1/iFLZDF9iYfG	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 00:45:08.932081	2026-01-17 00:45:14.413	\N	781594136	f	f	\N	\N	0	\N	صثقبصثب	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
60ba58c6-5c77-45dd-8493-151573e00df2	884283633	\N	$2b$10$uXprga8h8LehM4bquYGEje9T6A76tAJ1L0G7pNDZlfW8K6U9RzOTO	player	active	\N	\N	\N	2523453453.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 09:43:02.115108	2026-01-17 09:45:40.608	\N	884283633	f	f	\N	\N	0	\N	ggggيي	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6a22fd4d-72b5-4d9a-900f-c5135f4b9f31	400517441	\N	$2b$10$RINJCJ7uUOYxmkk9zTGkWOA5s4B8v6cwgZdtClUHkCg2qtV09rCMW	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:12:59.548407	2026-01-17 17:12:59.548407	\N	400517441	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
3e50a70a-f768-4761-a81f-3b0ad7d7eafd	418434712	\N	$2b$10$Cmglh3.le6u.D4yb2KCdSepLX4dYkPgx9.9X6zV3Hm436Fph7t/gu	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 10:44:03.417097	2026-01-09 10:44:13.489	\N	418434712	f	f	\N	\N	0	\N	ؤبايبليليبليلي	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
69dc9332-3c4f-46a4-af1e-2edc0047ebf8	160858297	\N	$2b$10$PfLa47r3cTkM6slCZKfHuusfysu29F9i/1wY0CdNugMdZL8ETDWhi	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:13:05.295443	2026-01-17 17:13:10.774	\N	160858297	f	f	\N	\N	0	\N	5555	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d3c00261-9a65-44e4-98ed-03bf38bcc7f6	admin	admin@pwm.local	$2b$12$NitqL2mH1Nw5aQuxzReww.vhCf/ocGrPzXCPBwy/5QfxrW9sEN7di	admin	active	Admin	User	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 08:19:38.157659	2026-01-08 08:19:38.157659	\N	100000000	f	f	\N	\N	0	\N	user_d3c00261	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
00d4aefb-c871-402c-8a54-7ec5ac4fce68	api_2aAzV5_user_mixed_api_user	api_2aAzV5_user_mixed_api_user@test.com	$2b$10$T.qd8fJqWAS1NVd.gxCOj.S3EABNmk3fqGKz8o2m/og1.ciHUvLty	player	active	\N	\N	\N	50000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:33.049934	2026-01-17 17:30:33.163	2026-01-17 17:30:33.163	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b809515e-fcef-4488-ba4a-688f43be016b	newtest_99y6	newtest@example.com	$2b$10$h9/NdJR6rqsiBbSn5Ac5G.iUX6NFxbOQYEiaIrAnO3vDeIOL2nnOW	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 10:49:51.060839	2026-01-18 10:49:51.060839	\N	316759181	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
35c76776-5aaf-4a89-8416-92857ce45e7b	test_1768594405151_nkmayzwi	\N	test-password-hash	player	active	\N	\N	\N	1050.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.152688	2026-01-16 20:13:25.286	\N	test_1768594405151_nkmayzwi	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
893d2690-3436-4ed7-91e1-d3f6425bb154	api_2aAzV5_user_spec_api_watcher	api_2aAzV5_user_spec_api_watcher@test.com	$2b$10$WMDIK4gtEnxc7hOPSRu7juu/phNt9mQuEoRWbTVIupBQ0PI45l.L2	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:32.546916	2026-01-17 17:30:32.917	2026-01-17 17:30:32.917	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
224e28f6-1212-4173-b835-b30fe65fbe16	newtest2_6bfs	newtest2@example.com	$2b$10$4aqkfm83JRguUMw46jQvBeypPC13SrYJrDoIzIUqBi3sDMUPVUQOS	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 10:49:55.598234	2026-01-18 10:51:52.411	2026-01-18 10:51:52.411	516853403	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
8c9ab0fc-6d0b-4f68-919a-fd15bf74df6c	781228677	\N	$2b$10$hMdDj9ftEOlsJ4YAirghheCEG0inYXkAaaZIP34nURkmFx0DJI9oS	player	active	\N	\N	\N	4534533456356.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:34:46.649288	2026-01-20 00:35:40.374	\N	781228677	f	f	\N	\N	0	\N	Csggt4fff	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a955ff28-c8c8-45cb-aafa-ea60c086139f	bot_86I6OUTE	bot_86I6OUTE@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	خالد		\N	9706.13	5320.00	10018.31	94493.85	5119.91	4	\N	2026-01-18 11:03:49.57208	2026-01-18 11:03:49.57208	\N	291493976	t	f	\N	\N	0	\N	خالد_الحربي	https://api.dicebear.com/7.x/avataaars/svg?seed=bot17	4.58	5	32	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	391	166	221	5	15	48	43	46	26	5	32	23	33	11	7	26	{}	{}	\N	t
f7358d4c-643c-44a9-8f32-7462fec0c6d9	486322953	\N	$2b$10$SFmZI9kwIgV36kg0JzNOBOZPFXRSzyl5x1bT29CFHwRr0cqKwBiY6	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 09:32:22.092223	2026-01-09 09:32:33.631	\N	486322953	f	f	\N	\N	0	\N	ءلختكسخلت	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
9ea54806-3585-452e-b9a4-2f86b6f98a74	388244938	\N	$2b$10$34fV4iXrvYc1j/b6OOVdQ.xxyOIY9Ba9JIRs5EmYFKz785141d4oy	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 10:12:34.877605	2026-01-09 10:12:45.957	\N	388244938	f	f	\N	\N	0	\N	لمبملمامل	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
12ad25a8-9672-4df3-a5d2-91f3af9ae413	265464412	\N	$2b$10$oAhiMJBevvyOFx4mOihGUeUKVnG4kVaU9L0PoEf.g8FMQt3YqljAG	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 10:31:52.010645	2026-01-09 10:32:03.202	\N	265464412	f	f	\N	\N	0	\N	سيلسرسي	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
5c390306-10f9-4a3a-b9c7-9d213e86239c	131815663	\N	$2b$10$fQReAZH1.Yu5p1VjDCYhtemc5rmLPjUthDVhkPum9q0wsd4V7ihDa	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-10 08:31:10.728473	2026-01-10 08:31:26.361	\N	131815663	f	f	\N	\N	0	\N	fjdd	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
adda118b-baaa-4c4a-be30-6b37480c541f	191480522	\N	$2b$10$K5js0/xUxOaqd1TQ0DUAV.h0vLljNNnJqGdr9yewcqfOA3dPlcesG	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 08:24:16.337476	2026-01-08 08:24:16.337476	\N	191480522	f	f	\N	\N	0	\N	user_adda118b	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e35dd5aa-e73f-42b1-b7a4-06878e272dc1	394055913	\N	$2b$10$ERhQ802lEmF48Tt78zi/MuOroyy/M2hNa1PfqZzcAKCTwqJnCNn4W	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 08:27:51.658109	2026-01-08 08:27:51.658109	\N	394055913	f	f	\N	\N	0	\N	user_e35dd5aa	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ded354bc-875c-4698-b3d6-f960502422ca	671688827	\N	$2b$10$i0lepReIbitv1qhOnYxgyOVqo1d.MYAAD.X7u5WzlXNrSPypYZ8CW	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 10:46:52.042894	2026-01-08 10:46:52.042894	\N	671688827	f	f	\N	\N	0	\N	user_ded354bc	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
19c3cd61-dab7-44b2-858f-eb78d837eeaf	704909057	\N	$2b$10$Ix9VFJ2.Xggysi0OndEdGuK3AeXVvg.7dIbsLMl0zXYcF0i/3m9rq	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 15:06:18.048169	2026-01-08 15:06:18.048169	\N	704909057	f	f	\N	\N	0	\N	user_19c3cd61	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
04b72e47-958f-4911-bd1e-178905783898	940684446	\N	$2b$10$bdlqTp4AM3fByqoCpyLnsuLKNyJ5B5kUUSeiew9cddirxN8oLKPLq	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 15:58:04.975172	2026-01-08 15:58:04.975172	\N	940684446	f	f	\N	\N	0	\N	user_04b72e47	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
107dcbdc-c6c5-44b2-b8c4-ebbc6fc6e2a8	625812925	\N	$2b$10$aiBIuPHTQ7tqaYAE8sLco./FLCVJaZiYbRv1aQZgnitg2DwH8HaAS	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 19:55:54.582416	2026-01-08 19:55:54.582416	\N	625812925	f	f	\N	\N	0	\N	user_107dcbdc	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6928bea5-e874-468f-a2c7-c4cca89501c6	646020981	\N	$2b$10$bxhss/bQXlo5KG6dRlz8eOLccGT71sgG5zJ6f5f5veRaHJ6trP3ze	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 10:48:25.816908	2026-01-09 10:48:25.816908	\N	646020981	f	f	\N	\N	0	\N	user_6928bea5	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
2b95632c-c4ea-49a2-bdf3-a9ff4c8eccb5	441957252	\N	$2b$10$xRPg5RUYYEk6Nc.BO4.rl.W/j67igshrukHSy.en/nXNZvJ0wcyNi	player	active	\N	\N	\N	100000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 12:51:37.347748	2026-01-08 21:49:37.746	\N	441957252	f	f	\N	\N	0	\N	user_2b95632c	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
2816cb35-beb1-4838-9ff9-508006841d4b	550883964	\N	$2b$10$Z4ZAIpaaksjAA4G7sfW1eeYJsMoI7qUkaUz91RVluZu/FXU7rd.CS	player	active	\N	\N	\N	100000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 21:46:42.368315	2026-01-08 22:11:33.47	\N	550883964	f	t	sdsddvdv	\N	0	\N	user_2816cb35	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cf6253a2-dc52-4f80-b9ec-ef9ff0c69570	117818154	\N	$2b$10$Szu7r1OvIUnvSXNcv5Zsb.0ae44Y.nKS36oeJEr.X9n/hNTvdCfv2	player	active	\N	\N	\N	100000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 21:10:37.200049	2026-01-08 22:11:48.538	\N	117818154	f	t	zdvsdvsvssdsdvsdv	\N	0	\N	user_cf6253a2	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
59bd74e6-720b-4848-b7e4-c0a3aff7a1df	133503581	\N	$2b$10$es1itzuO4FIEVArIij4f0OoPBb8VxvlkyWbEpUkRpMI8PSYHTyBy.	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 22:27:00.635151	2026-01-08 22:27:00.635151	\N	133503581	f	f	\N	\N	0	\N	user_59bd74e6	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
dbff1338-7a54-4bc3-bdf4-28957de21b39	977886352	\N	$2b$10$VrfNAhA8DfzFteQOJTeMQ.lgC.3tUzK3FjpPwOSKh6OfViBShs0um	player	active	\N	\N	\N	4723899.00	0.00	0.00	0.00	0.00	0	\N	2026-01-08 23:47:18.804188	2026-01-09 00:04:10.619	\N	977886352	f	f	\N	\N	0	\N	user_dbff1338	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
594918aa-1ca5-4fbe-b750-b83df28571b8	473600179	\N	$2b$10$wGDSilI8k2/iVRbAZ3c5P.z0JLap5ljUjXM0WOYV0amaPItMdM/A.	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 07:12:41.887474	2026-01-09 07:12:41.887474	\N	473600179	f	f	\N	\N	0	\N	user_594918aa	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
60c28790-7b50-4244-a3f0-95196c6e3baf	919568700	\N	$2b$10$nXabgPHNTua82d8w0xvU2.XGo/mvL6lTQVGHAJDQmlasmO8YBOlCi	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 07:12:57.915712	2026-01-09 07:12:57.915712	\N	919568700	f	f	\N	\N	0	\N	user_60c28790	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d5e61a5b-1772-4ef9-8d5d-a94b0de7a33d	361491048	\N	$2b$10$2RzC/AX4fVJw/Z1wK1/JDO.W58S9eL0N.67hTIK7AvHb6Di0YZnFW	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 07:20:55.823974	2026-01-09 07:20:55.823974	\N	361491048	f	f	\N	\N	0	\N	user_d5e61a5b	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cadb52ef-24e5-4b17-83ec-40dcc068476f	656930850	\N	$2b$10$uvJUCb8k1cGvXVJ5zXcPiunxljfzywnou0uxLcDxF6qw4aBujvCdm	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 07:21:23.841384	2026-01-09 07:21:23.841384	\N	656930850	f	f	\N	\N	0	\N	user_cadb52ef	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
4047f725-5fa8-4fe8-a5e7-1978c4839ffd	187703423	\N	$2b$10$BbWSykNhM4hViyyHyGqL.uzP7VsNgIOHAyoOT5jq5rROmVr.Nobse	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 07:45:36.159496	2026-01-09 07:45:36.159496	\N	187703423	f	f	\N	\N	0	\N	user_4047f725	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e00d5698-1e15-4c46-8e6d-adfac213cafa	819822485	\N	$2b$10$LYzp32yk6R2VQI/jtttd0O2CuURh7si4EKb8MtjMJn6fcNXd.XYYK	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 08:24:34.459901	2026-01-09 08:24:34.459901	\N	819822485	f	f	\N	\N	0	\N	user_e00d5698	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0d66dde2-10d5-4c2b-9c4b-a50c216d5350	813552552	\N	$2b$10$9UuQYHBy2Y7SgSSJL/G0zOFTZCCMPrcZlo5fDQmUa3Kkx5rGeFfPu	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 08:38:17.662413	2026-01-09 08:38:17.662413	\N	813552552	f	f	\N	\N	0	\N	user_0d66dde2	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
8a4f2766-7127-4bce-990d-9a00ff266dae	453928995	\N	$2b$10$sKdEzxT8qpRdD6ud7zuJz.F18zvl0W.8KhxkVOzHmXiah0kujTQjC	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-09 10:30:49.007011	2026-01-09 10:30:49.007011	\N	453928995	f	f	\N	\N	0	\N	user_8a4f2766	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
32595d29-4360-4faf-b772-6fd25e799437	658789630	\N	$2b$10$bgNKSCyR/FFYWtSilMCNn.OaSXvtbN5uRltsqPCTZLpnF7IUWWcNy	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-10 12:41:26.267087	2026-01-10 12:41:26.267087	\N	658789630	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
8b4dc410-4133-465c-8a2c-a34eb0e0bd0f	972868800	\N	$2b$10$Xnv2a4bx61favF1xn7Pn2.iXGuoSV4ixKoXxrl4iUZ1smyf/OAgCS	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-10 12:43:38.51377	2026-01-10 12:43:38.51377	\N	972868800	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d960f328-1d84-4cd3-a49c-754f06811cf7	266002375	\N	$2b$10$q/hOt6HaW61jZ2yACNEOWOvcJgDpy1mjqLz1zs7lPJ2608fTEFEhW	player	active	\N	\N	\N	1221011.00	0.00	0.00	0.00	0.00	0	\N	2026-01-10 12:44:26.006297	2026-01-10 12:52:09.77	\N	266002375	f	f	\N	\N	0	\N	Hager	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
5a758612-b4ee-4735-b497-ee2504cecced	265112303	\N	$2b$10$iAS.O5SCLrwjC8FKp0YHper3ONMUZIB3/EPIKrmiSB46Xyb5tKo7W	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-10 13:16:44.06855	2026-01-10 13:16:50.794	\N	265112303	f	f	\N	\N	0	\N	يقلقلقسلسل	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6c42c595-593c-438a-9353-ed051ceae603	791160551	\N	$2b$10$wJlpbFZqIUemjvV4kQzSJuNk1lm6jm6FGomgCOB8uI328v5tT5fiK	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-10 13:35:14.212392	2026-01-10 13:35:57.644	\N	791160551	f	f	\N	\N	0	\N	dfhdfdfg	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	t	2026-01-10 13:35:57.644	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cc5ad47b-6d28-479d-a714-c3f600013846	495618658	\N	$2b$10$yZUGhuTT9QT8yencrebu8OWRXtpIqY5qPY8N4umlZ4fX1PC7pe5Hu	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-10 16:51:56.270471	2026-01-10 16:52:04.526	\N	495618658	f	f	\N	\N	0	\N	sam	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
3b7b23cf-b458-46b6-96f6-818f5ca923df	239097117	\N	$2b$10$AlEg8Aw8t99pbHzpTXrOtOX.jrXD3CbiXGTbAqlTxwdEfuwPQUPpm	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-13 11:38:51.868725	2026-01-13 11:39:01.249	\N	239097117	f	f	\N	\N	0	\N	vixوو	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b949cb81-a7ab-42c6-899f-cb4c420241f3	306698776	\N	$2b$10$eP9FYHZ.x2YTEw0LeXCFpOjzqSH5f5YB9SyaqEXIDNVDkaPMzERza	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-13 12:04:20.171572	2026-01-13 12:04:27.319	\N	306698776	f	f	\N	\N	0	\N	vixيس	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
5b1105fe-732d-4d98-871b-1092dd8a8223	135249435	\N	$2b$10$xQvA/cnV..kvYvHTQOVwg./37a9uYY9JszHCZThOjpBYC6DOjKp2G	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-14 16:45:49.716467	2026-01-14 16:45:54.181	\N	135249435	f	f	\N	\N	0	\N	ءؤرءرء	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b60adb8a-e0b1-4bc1-95b1-8b01e51e4187	771446076	\N	$2b$10$BWwoBJt/fVlL6xEwvDqPJOpbqRlJD6tYA66Rc3fAXhY8qvwrpuHpi	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-14 21:09:31.986034	2026-01-14 21:09:42.47	\N	771446076	f	f	\N	\N	0	\N	بببببببب	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0e1192c2-ce12-4acd-9937-e9c56a3cffc8	401827192	\N	$2b$10$BZV87oJix1uNhXgHjaTjdO6ZW1CRcrqLKIJwkSo3qs4NuT7Pwy9US	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 18:23:20.025167	2026-01-16 18:23:20.025167	\N	401827192	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
461f7139-ed02-4e6f-83e4-8031da57798a	conn_test_1768590064325	conn_test_1768590064325@test.com	$2b$10$ERJRCKoEkPzK.JAiea6iFe4sRUvwAC5XKlCRtYTB9OxMXXSl9bDuS	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:01:04.504431	2026-01-16 19:01:04.504431	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
743d1c29-8363-4606-94ba-657396364190	conn_test_1768590094334	conn_test_1768590094334@test.com	$2b$10$3LpxYe9FHPBnbI/fnEwkm.akWwF6/bh/pJ8G.xALnEbqGRWb1zfY.	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:01:34.500114	2026-01-16 19:01:34.500114	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
25f58bd5-714f-47d4-8ece-d0c7b3acd333	conn_test_1768590136361	conn_test_1768590136361@test.com	$2b$10$DezOREZ3utZC9vLadhoyBeyYP/AZp8JADSEb4vCGDbCtYfY68GPIG	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:02:16.517798	2026-01-16 19:02:16.517798	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
01a3a574-7f97-49a5-b165-be3631bb26f6	testplayer1_1_1768592257526	test1_1_1768592257526@test.com	$2b$10$CYSuIyogJHiTt2t703uMg.4gYuJQcqXMudmBrXlnbWVDAOr2JLlp.	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:37.804652	2026-01-16 19:37:37.804652	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
88405ac1-36b4-494d-9c5b-46616577d924	testplayer2_1_1768592257526	test2_1_1768592257526@test.com	$2b$10$T2X0m9Rts3TvzeJW5EjbouguBFbOUsf9b9dbSTMPrWcu/jPj3EA4q	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:38.410574	2026-01-16 19:37:38.410574	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6e7da5f4-43a3-4969-bad9-6feccd645b85	testplayer1_2_1768592258492	test1_2_1768592258492@test.com	$2b$10$q6sqHpCW6m6o5q4U7ra5rOAj6Ty6wuT.bNCKVBzv.vWZ8DPfrk3sm	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:38.59814	2026-01-16 19:37:38.59814	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
f2c45c36-73ea-410f-ba91-19e31b6e5868	testplayer2_2_1768592258492	test2_2_1768592258492@test.com	$2b$10$wGV72W7Kh5o9v8tMfs6CK.5fEXhL4.jVJNWM6p2Ya3GyJsY/z6n5y	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:38.706356	2026-01-16 19:37:38.706356	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
377916e5-004e-4b35-babb-dce8f6175da6	testplayer1_3_1768592258729	test1_3_1768592258729@test.com	$2b$10$3UD36m.EbKJtiqfCNmCebun4YP/ekx09YtVg3Z2QSorq2wSBJ/84q	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:38.838698	2026-01-16 19:37:38.838698	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ff9e0a9b-7607-4843-b15b-ace7aef28c3e	testplayer2_3_1768592258729	test2_3_1768592258729@test.com	$2b$10$nFsrnERgekGqjuCfYV3Q7eNKqx0ceN1bUsN.CRdHh2pIJrO12BzGq	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:38.95032	2026-01-16 19:37:38.95032	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b788eb6a-438a-4983-9fd6-527b20cfee5f	testplayer1_4_1768592258973	test1_4_1768592258973@test.com	$2b$10$BAGMpecHyYYGvdXBeZYz5eII4s9lXKm1UQEsry4.PyRhGZtYmE.26	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:39.071976	2026-01-16 19:37:39.071976	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e1cc63d7-58be-4de8-b245-1e92db6cc4e8	testplayer2_4_1768592258973	test2_4_1768592258973@test.com	$2b$10$WjHXI/051D9OgjnQs2YUv.Ii.dBprENoMf4c4Mf0xPoC8e.BMatGy	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:39.184455	2026-01-16 19:37:39.184455	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
2094744c-0070-40fa-9682-6b1390f40429	testplayer1_5_1768592259202	test1_5_1768592259202@test.com	$2b$10$TO4W7pR0oqZLHaCtqHQhIuK4EX27MOx6TWy0fM/KVlrBKJN5ORqmm	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:39.302635	2026-01-16 19:37:39.302635	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
604f980a-5ac6-4aca-9618-7f81db15965e	testplayer2_5_1768592259202	test2_5_1768592259202@test.com	$2b$10$ZNIDMRokXdLPEPc0gJ8Bi.ry79rKAilWZTyrTyfpoHpL8l6xqiZO.	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:37:39.407443	2026-01-16 19:37:39.407443	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
09a4c959-7c39-4705-87b1-443a0ca9a4ba	test_1768594251086_ly0j0fbr	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.086888	2026-01-16 20:10:51.102	\N	test_1768594251086_ly0j0fbr	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
bfce38d1-1a17-4fcb-a63d-281c593ae87c	test_1768594405324_b960517m	\N	test-password-hash	player	active	\N	\N	\N	1200.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.325528	2026-01-16 20:13:25.585	\N	test_1768594405324_b960517m	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e62bc3fb-fdaa-485b-a977-0bab3f604328	testplayer1_shared_1768592890721	test1_shared_1768592890721@test.com	$2b$10$F1BsOWMQqCUKkcwckNzZZusGkosdfE5w0ALTzj.aMHroMUWPn9.3e	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:48:10.828316	2026-01-16 19:48:12.366	2026-01-16 19:48:12.366	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
31ed322f-ae77-41bf-b40a-5edd20d82a99	testplayer1_shared_1768592813719	test1_shared_1768592813719@test.com	$2b$10$XN25ZN/D1yGWzR7qXPNPr.3t78Izewp/K.g6C4ozLguEqF0o6BcEq	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:46:53.83428	2026-01-16 19:46:55.517	2026-01-16 19:46:55.517	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
558d03ae-4a4c-469d-8a61-12586e1a677c	testplayer2_shared_1768592813719	test2_shared_1768592813719@test.com	$2b$10$ZKjJLkjNRte702IsQYjIs.twysCe49xnihcZNiVQX368.Wi017IHS	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:46:53.990907	2026-01-16 19:46:55.619	2026-01-16 19:46:55.619	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
4d14b71d-8c9b-4f19-b0b0-e6e9abb014a4	testplayer1_shared_1768592383922	test1_shared_1768592383922@test.com	$2b$10$UFFeWBWNd22rUjyRGnv2uOLKJUKYVPEd3BXGoYpv517dqF2/HxWjq	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:39:44.040043	2026-01-16 19:39:45.285	2026-01-16 19:39:45.285	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e8d2e602-8ac8-4fb2-b597-228ade337c63	testplayer2_shared_1768592383922	test2_shared_1768592383922@test.com	$2b$10$ecMyn3d7CxSWzZZwS1SZNu8aJK2ro/HAexpjuNBNm9GUbGhXeg4Hu	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:39:44.221251	2026-01-16 19:39:45.389	2026-01-16 19:39:45.389	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
36b25b32-3bc9-4b47-bc04-74638d6fe716	testplayer1_shared_1768592765318	test1_shared_1768592765318@test.com	$2b$10$RXoSly67blNgwMOGugGm/.90oLNSZtoQltYBpEjvT5Qai5K7nozrG	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:46:05.479774	2026-01-16 19:46:06.774	2026-01-16 19:46:06.774	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cbfc1673-2d88-4823-8afc-a3dfd3b2f1c0	testplayer2_shared_1768592765318	test2_shared_1768592765318@test.com	$2b$10$JNWnPaQcIKJLCE2qvuwooOxBayVWY/DJyrCHMDlNlkdaB.vtn9YJC	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:46:05.62549	2026-01-16 19:46:06.886	2026-01-16 19:46:06.886	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
8e5b8186-7d37-419c-b3a5-3de4661fa666	testplayer2_shared_1768592403776	test2_shared_1768592403776@test.com	$2b$10$kcdDGEQgVSnrW21w/5DjcuaSVAQtk9Bu/p26240lwIz0NpNCRXw5y	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:40:03.979999	2026-01-16 19:40:04.478	2026-01-16 19:40:04.478	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
747fa743-e259-40e9-b365-1e99ccb46643	testplayer1_shared_1768592403776	test1_shared_1768592403776@test.com	$2b$10$wgROMUe.0sxbZYQUtDnupOfnQzIAqKaPU.cW02SIaer57wSxzkw8C	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:40:03.871032	2026-01-16 19:40:04.603	2026-01-16 19:40:04.603	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
123dff37-4b6c-4d0e-8a6b-aab402acefbf	testplayer2_shared_1768592890721	test2_shared_1768592890721@test.com	$2b$10$llCJkEK.GuI5MSfcwmoVX.CXyIAAYTpqVNPHBmk/2MrTzvi6NyzNa	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 19:48:10.945403	2026-01-16 19:48:12.467	2026-01-16 19:48:12.467	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
1e6449a1-1d1a-4b8a-a07b-6f2ddf9ce7ff	test_1768594250434_nqzhcowp	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:50.461005	2026-01-16 20:10:50.461005	\N	test_1768594250434_nqzhcowp	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ff7b0431-dda5-4433-8912-8e6114144ecf	750358619	\N	$2b$10$jFE104xX90Gp64oeWEFQhujIEfqnmw9DwSaX9k9vaCjcBrQcm5LRS	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 10:50:53.430512	2026-01-17 10:51:02.481	\N	750358619	f	f	\N	\N	0	\N	يبيلا	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ab30cdb9-7220-4345-96c0-fad6ff6d5017	664993820	\N	$2b$10$JNd8tqFCTMBNUOYNj9.qEeSTxwdBQZwJmBL3Fg8l/gd9GXguPC462	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:22:11.004231	2026-01-17 17:22:15.32	\N	664993820	f	f	\N	\N	0	\N	wdeafa	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
1fd88a1e-738b-4162-881c-11fc0620246b	testflow_gaev	testflow@test.com	$2b$10$sk74iM7k2XuVpsCRJCGVgOQGV5LEBFKECrd5EYBosQLOw93qX2iFO	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 10:52:01.143734	2026-01-18 10:52:01.272	2026-01-18 10:52:01.272	105797902	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
1a06eb5f-8fca-4c3d-8264-339f3d9a8cda	436743378	\N	$2b$10$R9Wqngw3Gzflx9/5mvTMrOmbh2s.ldqt2c.uS/hRx7bDaQMvWI6Na	player	active	\N	\N	\N	45331245.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:35:00.083537	2026-01-20 00:35:48.701	\N	436743378	f	f	\N	\N	0	\N	Dbdbdhdhfff	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
9cb99646-539e-4ab1-a673-c48685bf5236	test_1768594250811_61otbxv8	\N	test-password-hash	player	active	\N	\N	\N	1050.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:50.813643	2026-01-16 20:10:51.08	\N	test_1768594250811_61otbxv8	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
2f9b5593-e9a7-4fef-8e75-27dd68e7c6a3	api_2aAzV5_user_spec_api_p1	api_2aAzV5_user_spec_api_p1@test.com	$2b$10$HptOGlvu5UfFrYE8ykPF2eG54Wb43t2/HAnXuqMQWaQK3lEiKBUri	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:32.322469	2026-01-17 17:30:32.667	2026-01-17 17:30:32.667	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
bab291d9-b2d0-4d10-b0aa-a803febba3e3	bot_GR_P0-X7	bot_GR_P0-X7@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	فهد		\N	2299.69	38951.34	5307.81	42221.31	78297.96	2	\N	2026-01-18 11:03:49.462205	2026-01-18 11:03:49.462205	\N	440484826	t	f	\N	\N	0	\N	فهد_السعيدي	https://api.dicebear.com/7.x/avataaars/svg?seed=bot6	4.58	15	41	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	137	62	73	13	33	27	65	23	32	29	25	24	48	20	4	11	{}	{}	\N	t
fd1b585b-3a65-464c-8de9-38dbc3b97211	678998762	\N	$2b$10$K/cix8a3jczAc6gwl4pPnObOXXbdO1x51bPwQeTe5BSlZB9YysWDu	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 13:56:36.287988	2026-01-17 14:04:35.129	\N	678998762	f	f	\N	\N	0	\N	بيلبليلب	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABWQAAANfCAYAAABe4NTlAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAGYUSURBVHhe7P15nN5lYe//v+9ZM5OEbANhC5sgRNkFTFyAorhUUX5IKVBRIj1Cq9Ye/cZzOMcgBVu+R46eKrUVv0VQW6AcpBG0LlgEFMFA2SEIlC2gEQIJmWSS2X9/zHbPJ5N98mEyeT4fZ3pyX9fn3u90mhfXfX0q01tm9gYAAAAAgG2upjgAAAAAAMC2IcgCAAAAAJREkAUAAAAAKIkgCwAAAABQEkEWAAAAAKAkgiwAAAAAQEkEWQAAAACAkgiyAAAAAAAlEWQBAAAAAEoiyAIAAAAAlESQBQAAAAAoiSALAAAAAFASQRYAAAAAoCSCLAAAAABASQRZAAAAAICSCLIAAAAAACURZAEAAAAASiLIAgAAAACURJAFAAAAACiJIAsAAAAAUBJBFgAAAACgJIIsAAAAAEBJBFkAAAAAgJIIsgAAAAAAJRFkAQAAAABKIsgCAAAAAJREkAUAAAAAKIkgCwAAAABQEkEWAAAAAKAkgiwAAAAAQEkEWQAAAACAkgiyAAAAAAAlEWQBAAAAAEoiyAIAAAAAlESQBQAAAAAoiSALAAAAAFASQRYAAAAAoCSCLAAAAABASQRZAAAAAICSCLIAAAAAACURZAEAAAAASiLIAgAAAACURJAFAAAAACiJIAsAAAAAUBJBFgAAAACgJIIsAAAAAEBJBFkAAAAAgJIIsgAAAAAAJRFkAQAAAABKIsgCAAAAAJREkAUAAAAAKIkgCwAAAABQEkEWAAAAAKAkgiwAAAAAQEkEWQAAAACAkgiyAAAAAAAlEWQBAAAAAEoiyAIAAAAAlESQBQAAAAAoiSALAAAAAFASQRYAAAAAoCSCLAAAAABASQRZAAAAAICSCLIAAAAAACURZAEAAAAASiLIAgAAAACURJAFAAAAACiJIAsAAAAAUBJBFgAAAACgJIIsAAAAAEBJBFkAAAAAgJIIsgAAAAAAJRFkAQAAAABKIsgCAAAAAJREkAUAAAAAKIkgCwAAAABQEkEWAAAAAKAkgiwAAAAAQEkEWQAAAACAkgiyAAAAAAAlEWQBAAAAAEoiyAIAAAAAlESQBQAAAAAoiSALAAAAAFASQRYAAAAAoCSCLAAAAABASQRZAAAAAICSCLIAAAAAACURZAEAAAAASiLIAgAAAACURJAFAAAAACiJIAsAAAAAUBJBFgAAAACgJIIsAAAAAEBJBFkAAAAAgJIIsgAAAAAAJRFkAQAAAABKIsgCAAAAAJREkAUAAAAAKIkgCwAAAABQEkEWAAAAAKAkgiwAAAAAQEkEWQAAAACAkgiyAAAAAAAlEWQBAAAAAEoiyAIAAAAAlESQBQAAAAAoiSALAAAAAFASQRYAAAAAoCSCLAAAAABASQRZAAAAAICSCLIAAAAAACURZAEAAAAASiLIAgAAAACURJAFAAAAACiJIAsAAAAAUBJBFgAAAACgJIIsAAAAAEBJBFkAAAAAgJIIsgAAAAAAJRFkAQAAAABKIsgCAAAAAJREkAUAAAAAKIkgCwAAAABQEkEWAAAAAKAkgiwAAAAAQEkEWQAAAACAkgiyAAAAAAAlEWQBAAAAAEoiyAIAAAAAlESQBQAAAAAoiSALAAAAAFASQRYAAAAAoCSCLAAAAABASQRZAAAAAICSCLIAAAAAACURZAEAAAAASiLIAgAAAACURJAFAAAAACiJIAsAAAAAUBJBFgAAAACgJIIsAAAAAEBJBFkAAAAAgJIIsgAAAAAAJRFkAQAAAABKIsgCAAAAAJREkAUAAAAAKIkgCwAAAABQEkEWAAAAAKAkgiwAAAAAQEkEWQAAAACAkgiyAAAAAAAlEWQBAAAAAEoiyAIAAAAAlESQBQAAAAAoiSALAAAAAFASQRYAAAAAoCSCLAAAAABASQRZAAAAAICSCLIAAAAAACURZAEAAAAASiLIAgAAAACURJAFAAAAACiJIAsAAAAAUBJBFgAAAACgJIIsAAAAAEBJBFkAAAAAgJIIsgAAAAAAJRFkAQAAAABKIsgCAAAAAJREkAUAAAAAKIkgCwAAAABQEkEWAAAAAKAkgiwAAAAAQEkEWQAAAACAkgiyAAAAAAAlEWQBAAAAAEoiyAIAAAAAlESQBQAAAAAoiSALAAAAAFASQRYAAAAAoCSCLAAAAABASQRZAAAAAICSCLIAAAAAACURZAEAAAAASiLIAgAAAACURJAFAAAAACiJIAsAAAAAUBJBFgAAAACgJIIsAAAAAEBJBFkAAAAAgJIIsgAAAAAAJRFkAQAAAABKIsgCAAAAAJREkAUA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M0mS+mOPTdM55yRNTUmS7oceyuqLLx48tum881J/wgl9F7q60r5wYdqvu25wfmMGrt/7yivpXbEiaWhI+8KFaTrnnHTeeWfWfOMbxatsc/XHHpsJH/lIOn7609QdeGBq9tgja/7u79L18MObdczmGHidB55z9etafM03ZuKCBVv9eLZUmfc9ccGCVKZNy6rPfGad16/6c9u7enUqdXXpvOOOrfo81R18cJo++cl03X//Jt3OwOMb+Dx3P/10avfdN6mv3+y/J+zY9rv/oSRJpZIklcFxK2QBAABgO1R34IHpXrw4K087bfBnIMbWHXxwJpx5ZrqffDIrTzsta/7u71K7//5pOu+8pD/m1s+dm/brr8/K005L5+23p/F970v9sccW7mVkdQcfnLrDD0/3Qw+l9bzz0rt6dfGQHVbt61+f7oceysrTTtusGJskqy++OK3nnbfNg+hY0nn77Vn50Y8OhtK6N7whvWvWpO2ii9I6b15WnnXWJkXUbaln6dKs/OhH0714cernzClOw2azQhYAAAC2WvkrZCd95SvpfvzxEWNV03nnpX7u3Ky54op03n57UliVOOkrX0mSYQG3egXhxlZLFlc1Dtz22m99KxPOPTedv/hF2q+7bp1VutUreCcuWJDKxImp2W23pKkpnbfcktrXvz69q1en9nWvS5K0L1yY7kcfTdMnP5nK9Onr3Ebjaael/u1vT5LUzJyZ3ldeSerq0vHTn6Zm+vTUvv71WfWZzwx7PpXp0wdXyFYfU1xxXFzdOnHBgtQe0v/eVq0oHniOXY89ltq99x58nFmzZtjrP2Bjr0n161692rb3lVfS29mZdHYOPqfKLrukUl8/eJ+b+phTfBxdXel5+eVU6uvX+55v6PXZ2HOqfp97ly9PZdq0pP85dd5+exre/e503nlnanbeeejxJul+9NHU7rvvsBXXk77yldTsuWffAVWv8cBnePD173+M7f/6r8PGBx538fjeV14ZfO7r+zwX3x/YGCtkAQAAYJyoO/jgpL4+9XPnZqfrrstO1103GFmTpGbnndO7Zk1foOzX89JLqZkxIxPOPDOV5ub0Ll8+ONf18MPpbWtL7etfn2zBSs2el14aur3OzvQsXTos2q487bS0XXRRKs3NmbhgweD1avbaK+0//GHfKt7+4Fa7115Z841vZOWZZw7G2N62tmG3Mey5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	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6720dee6-705c-4e42-9919-857da4418bef	test_1768670985437_1eh0bnpc	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:45.484316	2026-01-17 17:29:45.484316	\N	test_1768670985437_1eh0bnpc	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
00d893bf-c7cc-4c5a-b65d-77f97985d3de	179761046	\N	$2b$10$lhXwoDvxt3VRWPWMwEDL4eDqN.M.5vgykerlqP0pT8FxQ1Aoi2H2e	player	active	\N	\N	\N	5624145.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:42:28.187397	2026-01-20 00:43:28.18	\N	179761046	f	f	\N	\N	0	\N	Dbdbdhdhfffss	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
7fbfb7bd-321f-4305-b358-8072b268ddca	test_1768594251109_4u9eft5i	\N	test-password-hash	player	active	\N	\N	\N	1200.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.111011	2026-01-16 20:10:51.391	\N	test_1768594251109_4u9eft5i	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
4698f81b-13df-408b-b469-f8d547b67e86	test_1768670986086_v2d8rz43	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.088085	2026-01-17 17:29:46.107	\N	test_1768670986086_v2d8rz43	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
f6bd803e-6a65-4f50-8685-b7cd2da69169	challenge_tester_1_1768671035329	challenge_tester_1_1768671035329@test.com	$2b$10$Dbb8rV3lcBRljveim5E7Q.Od8QQJiMRKh5EITJniVoaaDhsHwoc3S	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:35.507021	2026-01-17 17:30:35.507021	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
722d9f43-d1fe-471a-b864-b9fa464f1cf7	challenge_tester_3_1768671036409	challenge_tester_3_1768671036409@test.com	$2b$10$JhgfzKs.vubGBW/fjQzIYOvAMq6aVg6zLDBFPDH.GrcqlbD86dWZ6	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:36.518687	2026-01-17 17:30:36.518687	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
7a6489dc-f512-4822-8115-3ad9eab5eb41	test_1768594405593_4l5qm705	\N	test-password-hash	player	active	\N	\N	\N	550.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.594685	2026-01-16 20:13:25.68	\N	test_1768594405593_4l5qm705	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
dc1ec030-d8a5-4972-8e1e-20f01abaee69	905717759	\N	$2b$10$.pGnwTVxU/85QDI1BCL8XuNsm4hvg7gMfv36Q3sVT.b21TcfTPmUS	player	active	\N	\N	\N	1563122623.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:42:27.158979	2026-01-20 00:43:36.621	\N	905717759	f	f	\N	\N	0	\N	Csggt4dsfg	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a4dd661f-cc83-4e13-9f43-51a7a97912df	challenge_tester_2_1768671036275	challenge_tester_2_1768671036275@test.com	$2b$10$EMRXW4kli7NodIU.saFkXOIybd0AsrVBgVd88CbtHgEtPxb6jNPdi	player	active	\N	\N	\N	9850.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:36.387624	2026-01-17 17:30:36.387624	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6d983ba7-6634-4f08-ac41-2623c9b39e3c	558315548	\N	$2b$10$/fH822qrBCFllJ.qL/wGLOa6HArXOvb5DsiDwduPNXKTW/OHZdc9q	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:56:15.351325	2026-01-19 18:56:15.351325	\N	558315548	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
238aba79-7799-42df-94d5-8aa205bfe690	test_1768670985849_yt01w94m	\N	test-password-hash	player	active	\N	\N	\N	1050.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:45.850999	2026-01-17 17:29:46.08	\N	test_1768670985849_yt01w94m	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0dce26a9-ff06-4823-91af-875a1eded7fb	test_1768594251398_3wzy1445	\N	test-password-hash	player	active	\N	\N	\N	550.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.399253	2026-01-16 20:10:51.484	\N	test_1768594251398_3wzy1445	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e6092a9c-04aa-48d2-8617-202ff5a62c50	652361677	\N	$2b$10$Zsrg9GwMZh5TRtQrUBGGcuAdl0HXrvVG5w1t5JJCYZS.OW4M15oda	player	active	\N	\N	\N	5456456.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 01:15:57.535548	2026-01-20 01:16:42.266	\N	652361677	f	f	\N	\N	0	\N	Fjdjhddhdhdhdh	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
47146896-d6eb-4ffe-8a44-dd1346a5a908	641006697	\N	$2b$10$r5FPkgrFqJITnIVlKZ7LxeXOFm2kO3te9B1FtTlIvTID3SbdikWXG	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:55:44.403423	2026-01-19 18:55:44.403423	\N	641006697	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6beed496-b444-491f-aa82-d806cf365496	613710781	\N	$2b$10$icge9qHf5EUzVJqOgJM6CugAXNkISyQMtvuXu1UrKkOexSHxiTmVi	player	active	\N	\N	\N	5345243.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 01:16:02.663468	2026-01-20 01:16:57.851	\N	613710781	f	f	\N	\N	0	\N	Dbdndhshshsh	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
459e828e-ee4f-4ca2-a778-4729c42070f6	bot_NbSzu--5	bot_NbSzu--5@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Peyton	Champ	\N	1411.24	21609.20	1763.85	22892.45	40383.29	0	\N	2026-01-18 11:03:49.34999	2026-01-18 11:03:49.34999	\N	539063387	t	f	\N	\N	0	\N	PeytonLegend84	https://api.dicebear.com/7.x/avataaars/svg?seed=bot5	4.88	20	33	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	138	59	78	11	41	44	69	5	28	7	57	33	58	12	7	21	{}	{}	\N	t
5955c883-e5a0-41eb-989a-0f118bdc9e9a	bot_vWkjL35a	bot_vWkjL35a@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	حسن		\N	10413.93	38507.48	2166.92	67330.96	13100.98	1	\N	2026-01-18 11:03:49.225654	2026-01-18 11:03:49.225654	\N	912884498	t	f	\N	\N	0	\N	حسن_الشهري	https://api.dicebear.com/7.x/avataaars/svg?seed=bot4	4.32	26	14	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	381	240	139	19	78	11	78	48	21	13	0	14	31	25	9	22	{}	{}	\N	t
a332523a-16d0-4f15-acdd-d529decb8800	test_1768594251490_7onuzzkm	\N	test-password-hash	player	active	\N	\N	\N	1030.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.49316	2026-01-16 20:10:51.559	\N	test_1768594251490_7onuzzkm	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0a66d9b4-9985-4fe7-a322-4fc59524df11	challenge_tester_1_1768602658395	challenge_tester_1_1768602658395@test.com	$2b$10$032sZ9tLzU1dLsWrDzgCRe/Vqj4FBl1VWMlhT1wwq9.npY4tNMjTW	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:30:58.828007	2026-01-16 22:30:58.828007	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
feb746f1-da58-4f06-a48e-e0b9d7026a92	challenge_tester_2_1768602659879	challenge_tester_2_1768602659879@test.com	$2b$10$CDvYX6z1bB9WP9V9hZ0GuuDL4USHBoSe.WG/ZAzwzFgpY.dbggdu.	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:30:59.990129	2026-01-16 22:30:59.990129	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b8e9427e-7625-4f10-966a-1176c5f0d727	test_1768594405686_g4v0l4fl	\N	test-password-hash	player	active	\N	\N	\N	950.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.688615	2026-01-16 20:13:25.78	\N	test_1768594405686_g4v0l4fl	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ac52de32-a239-4459-9da3-d06254edca70	challenge_tester_3_1768602660120	challenge_tester_3_1768602660120@test.com	$2b$10$OjbSXVZX.JPQCJ/J1P4RC.EkErmlMNSmX/4laY92yorhdN68pt4w.	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:31:00.222289	2026-01-16 22:31:00.222289	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
1c8ac38e-41d8-4537-9279-fb9c5c94b575	challenge_tester_1_1768602717896	challenge_tester_1_1768602717896@test.com	$2b$10$tAkMZfEZR4jqkBBNDwIdguLlVV0GptJur30esTy/bOOJcfN0RSwHy	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:31:58.035167	2026-01-16 22:31:58.035167	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a6131658-56f0-4bab-bf6f-6c400a0a561b	challenge_tester_2_1768602718766	challenge_tester_2_1768602718766@test.com	$2b$10$8oHn2qKrZtLD5J7oXXvA1.X1kkVCs92m1.AdQr95WCmLldAuoTn9.	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:31:58.862363	2026-01-16 22:31:58.862363	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
4933407d-7003-4666-a17e-3da3b8be7e29	challenge_tester_3_1768602718885	challenge_tester_3_1768602718885@test.com	$2b$10$Zyox19uWBGHXrT0IOE9Fcu2.KzBph3/Xnj.kGrnNjZzl961OSv5zS	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:31:58.987874	2026-01-16 22:31:58.987874	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
11b9b449-05e3-4ffc-a405-441d9d92a74b	test_1768670986994_rrdlleux	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.994997	2026-01-17 17:29:47.012	\N	test_1768670986994_rrdlleux	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a129c1da-c105-4f09-ba5e-cf9d3ee92b0c	438942880	\N	$2b$10$27pcN/isZdNGCG40HoQyhuOESPHL2PsTltQiJ3uwartaf0HKSa1t.	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 03:47:35.464525	2026-01-19 03:47:48.379	\N	438942880	f	f	\N	\N	0	\N	vixووا	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
51562a86-ea47-4fdd-a24c-63542d9f561b	test_1768670986114_av64v4p1	\N	test-password-hash	player	active	\N	\N	\N	1200.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.115914	2026-01-17 17:29:46.426	\N	test_1768670986114_av64v4p1	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ce4c9224-30fd-45b7-9e11-d601855b0d8c	test_1768670987019_1g5p1vcr	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:47.020078	2026-01-17 17:29:47.029	\N	test_1768670987019_1g5p1vcr	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e4f54c5c-d848-4f98-9464-ea5e94d85b5c	test_1768670986649_h3j0vi4m	\N	test-password-hash	player	active	\N	\N	\N	400.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.649695	2026-01-17 17:29:46.659	\N	test_1768670986649_h3j0vi4m	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
61d5c5b8-87dc-4216-bf66-cde1dd5fb92b	test_1768670986646_fxxlgfqs	\N	test-password-hash	player	active	\N	\N	\N	600.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.646808	2026-01-17 17:29:46.666	\N	test_1768670986646_fxxlgfqs	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0f3855e6-bb9a-462a-932b-3e096a93fb10	payout_test_winner_1768606469240	\N	test123	player	active	\N	\N	\N	75.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:34:29.296371	2026-01-16 23:34:29.343	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	25.00	1	1	0	0	1	1	0	0	0	0	0	0	0	0	1	1	{}	{}	\N	f
9ef70f00-7c3e-427c-b658-fd47a2234b0a	payout_test_loser_1768606469315	\N	test123	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:34:29.31699	2026-01-16 23:34:29.347	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	1	0	1	0	1	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
5052ad2a-b4a1-4ddc-a602-682677cfd367	test_1768670986673_7ix424il	\N	test-password-hash	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.673734	2026-01-17 17:29:46.975	\N	test_1768670986673_7ix424il	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
32feca4d-e9c5-4027-a8c3-4f7a21e0eca6	bot_2AGlcFMA	bot_2AGlcFMA@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Jordan	Master	\N	5603.70	32856.69	16506.71	35672.35	29215.87	0	\N	2026-01-18 11:03:49.580304	2026-01-18 11:03:49.580304	\N	899524690	t	f	\N	\N	0	\N	JordanHero92	https://api.dicebear.com/7.x/avataaars/svg?seed=bot18	4.66	46	2	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	120	64	55	12	82	43	36	14	28	46	64	32	79	32	5	25	{}	{}	\N	t
7461fe2f-1e55-4903-9c6e-adc860b9a69b	test_1768670986676_2ie9eomx	\N	test-password-hash	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.677272	2026-01-17 17:29:46.986	\N	test_1768670986676_2ie9eomx	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cb6220fd-5c02-4e9d-bb6e-1bfc73d0a3f9	test_1768670986998_rf3xawc1	\N	test-password-hash	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.999404	2026-01-17 17:29:46.999404	\N	test_1768670986998_rf3xawc1	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
fa1143d9-759a-435c-84fe-727016a35664	986270048	\N	$2b$10$87kfyxadIFousHsHB81ImOHOhOfdWdDa6f849PA5fAQfldhovNLKG	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:45:29.764004	2026-01-19 18:45:29.764004	\N	986270048	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b684a576-04af-4caa-8ccb-c52339356cc3	634654623	\N	$2b$10$Q1iU1t65KxJ9ku4F8cgVUuwbSFa0Bjj3HHSmLw.gzvTd2IS4Lws96	player	active	\N	\N	\N	48978646.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:42:32.807568	2026-01-20 00:43:21.234	\N	634654623	f	f	\N	\N	0	\N	Gsgbddbfddg	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
f065b93a-0a3e-408b-964a-8759f618e683	bot_w453lTpV	bot_w453lTpV@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	سلطان		\N	1574.74	16618.03	4825.71	14716.72	62104.13	2	\N	2026-01-18 11:03:49.56267	2026-01-18 11:03:49.56267	\N	105390161	t	f	\N	\N	0	\N	سلطان_التميمي	https://api.dicebear.com/7.x/avataaars/svg?seed=bot15	4.09	39	1	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	379	160	218	1	49	30	8	22	49	22	37	30	21	32	2	21	{}	{}	\N	t
ccdbdb8f-f5f9-4b9b-aec5-db61dd771226	397526840	\N	$2b$10$kaiHbWbBhbo6KW7fMBNu2.uOTQ7COxIMx323IXwtvHXbW3EWBdQS6	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:57:35.532701	2026-01-19 18:57:57.872	\N	397526840	f	f	\N	\N	0	\N	TestUser123	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
945728dd-35d7-43df-be06-ce805f04ea34	test_1768594251490_1bqx31en	\N	test-password-hash	player	active	\N	\N	\N	990.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.492873	2026-01-16 20:10:51.563	\N	test_1768594251490_1bqx31en	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
15aef056-44e5-4e3e-9c4e-0829da10e567	test_1768594251490_qor9qb2r	\N	test-password-hash	player	active	\N	\N	\N	980.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.492283	2026-01-16 20:10:51.573	\N	test_1768594251490_qor9qb2r	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
047292c6-d028-4259-a9b3-69171a3afaf5	challenge_tester_1_1768602762733	challenge_tester_1_1768602762733@test.com	$2b$10$o12WFix0IW0eCrfLVFGgrOGQ9TO7uc42nHEKPUSMbrSjdfh.ImC2a	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:32:42.892345	2026-01-16 22:32:42.892345	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
42c5e95a-86bc-4daf-a2ad-f0f018a6f356	test_1768594405686_c7fvrvbe	\N	test-password-hash	player	active	\N	\N	\N	1010.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.688788	2026-01-16 20:13:25.781	\N	test_1768594405686_c7fvrvbe	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a89ad087-d359-49eb-ab5d-493f8dc16e11	challenge_tester_2_1768602763547	challenge_tester_2_1768602763547@test.com	$2b$10$hItACIzggMmDTRfBE13mLeR7tSpd/y1c3Zcyi4fhERyFxKsLA5x8.	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:32:43.662959	2026-01-16 22:32:43.662959	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c76d8fcb-f5fe-44aa-b628-0cca73968af4	challenge_tester_3_1768602763683	challenge_tester_3_1768602763683@test.com	$2b$10$xr2gMKHvAf4kAC4n0cXXlOTnVUPSufZXOg3p7yLcE/0nk5Iw4gL8.	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 22:32:43.780107	2026-01-16 22:32:43.780107	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b154aeba-0034-4e32-9643-49e1d094fe67	bot_v0kmFREO	bot_v0kmFREO@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Emerson	Top	\N	7697.04	24898.02	3094.83	30767.30	74200.68	1	\N	2026-01-18 11:03:48.759268	2026-01-18 11:03:48.759268	\N	614209303	t	f	\N	\N	0	\N	EmersonChampion86	https://api.dicebear.com/7.x/avataaars/svg?seed=bot1	4.25	35	3	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	276	138	137	0	41	6	86	30	55	30	29	31	49	23	7	19	{}	{}	\N	t
b838ed7e-5905-4cec-8669-32ca4586674a	api_stress_user_api_creator	api_stress_user_api_creator@test.com	$2b$10$30sTGbyBy9shn9tVDQG7xuqaUNNqhQd0C0xKFT69../v1GXOnMepu	player	active	\N	\N	\N	50000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:28.622434	2026-01-16 23:02:28.808	2026-01-16 23:02:28.808	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
8a59f138-4ca9-4bc6-8c17-d9762250574b	442760150	\N	$2b$10$dgWyLWD/SUHCo3wQb9Me3OtLuy0wX7jV7Deh8Ltg7bOsw.vn1T8l6	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:50:15.09253	2026-01-19 18:50:15.09253	\N	442760150	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
7de1ffff-37d1-4569-89ae-97b757a12331	testuser123	test@example.com	$2b$10$QUXqAnTMUV6InvDXi1yCdOhfm7I1IsrRh8UcK29usUNvOPTf/dMD2	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:50:29.118488	2026-01-19 18:50:29.118488	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d0680e30-a37f-4856-a6ca-7e571a6dfdd4	578063543	\N	$2b$10$ygkEQm2vOQV5IEul4Sx0WO10/MvAGLpMVJWDJOiX3iTL.g4TDZsta	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:57:27.492044	2026-01-19 18:57:27.492044	\N	578063543	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e7b44580-f2e1-46df-a59b-0bf1c4c423a3	test_1768670986434_2vz02zwo	\N	test-password-hash	player	active	\N	\N	\N	550.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.43537	2026-01-17 17:29:46.521	\N	test_1768670986434_2vz02zwo	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
dc06a6de-1f5d-4507-b18e-bd89905cbfa1	payout_test_winner_conc_1768606469864	\N	test123	player	active	\N	\N	\N	130.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:34:29.866071	2026-01-16 23:34:30.051	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	30.00	3	3	0	0	3	3	0	0	0	0	0	0	0	0	3	3	{}	{}	\N	f
73ca4c4a-a051-4a21-b3dd-1b7e96b480e0	payout_test_loser_conc_1768606469878	\N	test123	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:34:29.879599	2026-01-16 23:34:30.053	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	3	0	3	0	3	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
978946cb-9458-451c-9a4f-2f908966ec3a	bot_Ar-dAyII	bot_Ar-dAyII@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	عبدالله		\N	604.94	17867.42	3215.53	5692.83	17186.96	1	\N	2026-01-18 11:03:49.188159	2026-01-18 11:03:49.188159	\N	961685517	t	f	\N	\N	0	\N	عبدالله_الزهراني	https://api.dicebear.com/7.x/avataaars/svg?seed=bot3	4.22	16	2	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	398	262	135	5	65	38	6	28	59	31	50	12	42	6	5	19	{}	{}	\N	t
35c6c1a7-1bbc-43db-aa96-9476e6ed98d7	test_1768594251490_s3btpqvp	\N	test-password-hash	player	active	\N	\N	\N	990.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.492778	2026-01-16 20:10:51.568	\N	test_1768594251490_s3btpqvp	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
16f88787-d31b-46ec-8b20-72a216f82bd5	test_1768594405686_9ui126uh	\N	test-password-hash	player	active	\N	\N	\N	1020.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.689075	2026-01-16 20:13:25.807	\N	test_1768594405686_9ui126uh	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d9cf6c09-6b8a-4874-89cb-070d18def00d	479179361	\N	$2b$10$/fr8av/TDSX5rxZcgbRh1urJg68vw1mBfC6dndYmZbZ.O02SrQvUK	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:59:33.814084	2026-01-19 18:59:44.684	\N	479179361	f	f	\N	\N	0	\N	sfdfeww	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
4635bbee-9ed0-43cb-a950-4ed351be9489	test_1768670987033_b3xyiirv	\N	test-password-hash	player	active	\N	\N	\N	100050.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:47.0344	2026-01-17 17:29:47.64	\N	test_1768670987033_b3xyiirv	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
171e3120-af06-4bf8-a27f-840e2fad2cbc	987781931	\N	$2b$10$Mcf0jUArhgBm9uD7f8MzxuHGMkPvCzJnkppEbgIeEVBSr0s7/9x7K	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:41:54.376874	2026-01-17 17:42:22.987	\N	987781931	f	f	\N	\N	0	\N	vixووddd	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
bb8f2e91-2abb-46fd-acaf-accfeb674c9b	api_6iQV4D_user_api_creator	api_6iQV4D_user_api_creator@test.com	$2b$10$7qJtvDldpg.xZRyrQNniY.VS7XXnZWE8/J1uPn9wTyDRr5XaSDTBi	player	active	\N	\N	\N	50000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:23.915422	2026-01-16 23:04:24.058	2026-01-16 23:04:24.058	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
274013ee-b272-4cc0-bf69-f06ecfec224e	api_6iQV4D_user_query_user	api_6iQV4D_user_query_user@test.com	$2b$10$rlNng4Z1Pp9/E4QFaFre.OJayiL5ug/0yUPKoSQ1/MCZkat8cCLBq	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:24.255795	2026-01-16 23:04:24.371	2026-01-16 23:04:24.371	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
06e65c15-f90c-415e-a390-94abab4f12d7	api_6iQV4D_user_race_api_creator	api_6iQV4D_user_race_api_creator@test.com	$2b$10$clKUVofRksNHNApnnD9XP.0l0Rqy.Mj87ZbedM8aJ2woOLAWJ/yhG	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:24.539572	2026-01-16 23:04:24.839	2026-01-16 23:04:24.839	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c2b70c3f-4bc5-4649-b19e-0306c4c019ec	api_6iQV4D_user_race_api_joiner1	api_6iQV4D_user_race_api_joiner1@test.com	$2b$10$njEHf4RXrUdrEDFJ9dN5VuqF3BYS1mjO4hVj1UZTrhZS7t1UMMytK	player	active	\N	\N	\N	9900.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:24.640226	2026-01-16 23:04:24.939	2026-01-16 23:04:24.939	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
832970ed-abf4-43f6-a8ee-b3f10d1d1765	api_6iQV4D_user_race_api_joiner2	api_6iQV4D_user_race_api_joiner2@test.com	$2b$10$8usXCAjqIT9/DI5mXj0o/OaPWHYES8l4eJ/LEaE8VSDMotF1Ic/ae	player	active	\N	\N	\N	9900.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:24.742017	2026-01-16 23:04:25.042	2026-01-16 23:04:25.042	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
dd07d35f-11ee-4016-8b9a-a03e043b4507	api_6iQV4D_user_self_join_api	api_6iQV4D_user_self_join_api@test.com	$2b$10$5cGANdlKjZBcgqi9AoBxZe5vWFO1eoYaS7xv7sLGdeg.d3CJFKtz2	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:25.156439	2026-01-16 23:04:25.249	2026-01-16 23:04:25.249	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
f74567bd-d96e-4d70-a865-ad4595a85bb4	api_6iQV4D_user_insuf_api_creator	api_6iQV4D_user_insuf_api_creator@test.com	$2b$10$n8qQjCndbTCVYExyLieHbeTRuvPP8rLbv84BiurESjDOEUUVw4YaO	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:25.368302	2026-01-16 23:04:25.583	2026-01-16 23:04:25.583	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c79871bd-c9ad-49b6-88e3-d2cd50d74fd6	api_6iQV4D_user_insuf_api_joiner	api_6iQV4D_user_insuf_api_joiner@test.com	$2b$10$Etcn7ZT8570k1mvm7QzIeexO1MS1qo60TcOj61YLUDF9JhDO2Rz.u	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:25.468799	2026-01-16 23:04:25.681	2026-01-16 23:04:25.681	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b7a1375d-faf8-4b91-84fa-f80510f0a8d9	api_6iQV4D_user_deduct_api_creator	api_6iQV4D_user_deduct_api_creator@test.com	$2b$10$3SjDaeBQT/.o8iHK6b9TyO/OhzOccHYMppDIG/3QElzoqhvc6k8Ey	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:25.799278	2026-01-16 23:04:26.006	2026-01-16 23:04:26.006	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
bd09669e-410e-4533-ba99-d3034612dbd5	223093182	\N	$2b$10$CeTbYdr9RtD1h1u6pWH9IuYHjaaFxgdQECO9C7vZddIosCB/p8XcK	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 08:33:06.647567	2026-01-18 08:33:06.647567	\N	223093182	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
19a5e8df-c063-4e5d-9fec-6b8196e3d718	api_6iQV4D_user_deduct_api_joiner	api_6iQV4D_user_deduct_api_joiner@test.com	$2b$10$VzfrTALl/Ux9HYxqXdDyKeEXujm4i0K1XscSKhYN15Uhbx7AAauG.	player	active	\N	\N	\N	900.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:25.90421	2026-01-16 23:04:26.121	2026-01-16 23:04:26.121	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
2c32b6d2-1d27-4449-b22c-6be176fbc1a2	api_6iQV4D_user_conc_api_creator	api_6iQV4D_user_conc_api_creator@test.com	$2b$10$tIn/pulKnPIxz4f1Z8t55uMYsRDG/OLefL4MDFSMEoCV3FqZcN4Ei	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:26.233774	2026-01-16 23:04:26.329	2026-01-16 23:04:26.329	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
7038f0e0-8fab-4306-86a0-10f0ece1e758	api_6iQV4D_user_spec_api_p2	api_6iQV4D_user_spec_api_p2@test.com	$2b$10$SX9nl66t2hlGdulDcXvOwejP/68FUWvn1Ie6bKf72r1.bz/UCMluK	player	active	\N	\N	\N	9950.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:26.804622	2026-01-16 23:04:27.106	2026-01-16 23:04:27.106	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
20c0f052-379e-4ddf-a756-dbcd0a3358da	api_6iQV4D_user_mixed_api_user	api_6iQV4D_user_mixed_api_user@test.com	$2b$10$x6XWoomxxJDGmvhiIBGmeueDqtCpLemVUZwygTYq.OgvpfwceCQ9G	player	active	\N	\N	\N	50000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:27.227322	2026-01-16 23:04:27.318	2026-01-16 23:04:27.318	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
684bbf61-bb95-48ab-956e-3ed13c1ac743	api_6iQV4D_user_conc_api_joiner	api_6iQV4D_user_conc_api_joiner@test.com	$2b$10$yZ9a1dOXInrvbPgzdvMP/OICV8B1iYPaZ9j8k8d6C7TSCQ5m.Du6S	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:26.448611	2026-01-16 23:04:26.552	2026-01-16 23:04:26.552	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c33498c2-0ded-4ec7-b4f9-3997264bb085	api_6iQV4D_user_spec_api_watcher	api_6iQV4D_user_spec_api_watcher@test.com	$2b$10$yCMeWc5RBI9vDgEYIrQJseb52Htk3HbN1BfTUc4WNXalRrRWp43Xy	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:26.909052	2026-01-16 23:04:26.909052	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
3992efaa-b958-4086-919e-dc229b3f539d	api_6iQV4D_user_spec_api_p1	api_6iQV4D_user_spec_api_p1@test.com	$2b$10$y6hilQlWCajbxS4slSN.2e.rAe2xIys1CDzQBx7PoV4Awh5yQo2jK	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:04:26.707327	2026-01-16 23:04:27.008	2026-01-16 23:04:27.008	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
2ce87eed-2726-43fd-926b-29e71354d865	117215897	duxexch@gmail.com	$2b$10$SF/uJ9K3lDpsVMTiaBa2AOkhrvUgIWQ75SWuL3ylOZsgjWwuDEr/e	player	active	sdfsdd	dfsdfsd	+201211780776	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 10:14:19.897898	2026-01-18 10:38:03.272	\N	117215897	f	f	\N	\N	0	\N	sdfsdfsd	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b24f8171-46a3-4b74-99d3-ea54d7f5cb80	test_1768594251490_ckawzf26	\N	test-password-hash	player	active	\N	\N	\N	1010.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.492068	2026-01-16 20:10:51.574	\N	test_1768594251490_ckawzf26	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
93bf51f2-9da0-4124-a345-f5913ac1a6bc	test_1768594251589_443mfwro	\N	test-password-hash	player	active	\N	\N	\N	400.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.590315	2026-01-16 20:10:51.6	\N	test_1768594251589_443mfwro	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ebedf66f-b2c1-4302-a2e7-98846cdb4f11	test_1768594251585_5yo6tpxg	\N	test-password-hash	player	active	\N	\N	\N	600.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.586305	2026-01-16 20:10:51.608	\N	test_1768594251585_5yo6tpxg	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6c7960c5-8d38-48b4-9485-0d8e2d9c4b17	test_1768594251616_h3ib61lr	\N	test-password-hash	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.617704	2026-01-16 20:10:51.927	\N	test_1768594251616_h3ib61lr	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ad86bef1-f341-4b9d-915c-e44f36e3a8f8	test_1768594251620_a2inbw8z	\N	test-password-hash	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.620712	2026-01-16 20:10:51.942	\N	test_1768594251620_a2inbw8z	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cb94ee59-2d10-4653-b0f2-71382fac65ba	test_1768594251954_mzr4ypot	\N	test-password-hash	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.956657	2026-01-16 20:10:51.956657	\N	test_1768594251954_mzr4ypot	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e402383f-8a74-4ac2-bfcb-c4cd25e4e509	api_stress_user_self_join_api	api_stress_user_self_join_api@test.com	$2b$10$8YaaaXcubxBXcRhfbfCd7eJtah0yWfAwSYMY7/cLOXTnrrzW5YXbu	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:58.165845	2026-01-16 23:02:58.269	2026-01-16 23:02:58.269	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
806f59bb-c5ed-4234-8ac9-a8f8a3b4a4c7	test_1768594251949_yexlxxul	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.951073	2026-01-16 20:10:51.976	\N	test_1768594251949_yexlxxul	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
66684b92-8bde-48b8-ad69-062b45617a82	test_1768594405686_owkb9cqy	\N	test-password-hash	player	active	\N	\N	\N	1010.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.689502	2026-01-16 20:13:25.788	\N	test_1768594405686_owkb9cqy	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c364813f-1fbd-4481-873a-3200b26114d4	test_1768594251986_31yjds18	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:51.987517	2026-01-16 20:10:51.997	\N	test_1768594251986_31yjds18	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d3bf9b80-dc71-4e72-9ccc-faefa0fcb6a8	test_1768594406746_0xkz7qzd	\N	test-password-hash	player	active	\N	\N	\N	500.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:26.747425	2026-01-16 20:13:26.747425	\N	test_1768594406746_0xkz7qzd	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6afff146-196b-46b8-bb0a-70ab0c0f0849	api_stress_user_query_user	api_stress_user_query_user@test.com	$2b$10$6kxjAXBFD0NTRoi0beukOuLYQ.FwWFZPnRPwHbw452PnSTfBdI2mK	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:56.967451	2026-01-16 23:02:57.098	2026-01-16 23:02:57.098	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cdb746f6-1376-4302-a637-136cb48338f8	api_stress_user_race_api_creator	api_stress_user_race_api_creator@test.com	$2b$10$AalzNLsGnRPq50.NiLIVveeno9/qFYI9wZVRCF/nse/picEXSs3eO	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:57.347541	2026-01-16 23:02:57.651	2026-01-16 23:02:57.651	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
7b0ed86a-dc2d-4e77-a8a2-b09f6022202b	api_stress_user_race_api_joiner1	api_stress_user_race_api_joiner1@test.com	$2b$10$GE4i0/2vZ72UmFJ66Jl1KOic7ekxOJN.5ITkyl1lM1yeBgmpiELbS	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:57.445997	2026-01-16 23:02:57.788	2026-01-16 23:02:57.788	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e564935e-0fc3-41fc-bbb6-0d964f2d8e75	api_stress_user_race_api_joiner2	api_stress_user_race_api_joiner2@test.com	$2b$10$S7n1aUiccr7MuKnsNlRGGuCsrhhZ5cBaLGJfdqnPnPv2S5KWAzVKe	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:57.545674	2026-01-16 23:02:57.978	2026-01-16 23:02:57.978	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6c43b5c9-c124-4447-a3bb-321bca6436c5	api_stress_user_insuf_api_creator	api_stress_user_insuf_api_creator@test.com	$2b$10$LdtYmBYtGOzkgMTpNvXT/.hs8R4vnK0uXAnlHk1AgsBiQAngg.xVe	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:58.407475	2026-01-16 23:02:58.63	2026-01-16 23:02:58.63	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c6d47057-4a4a-4942-9834-0e77d3d73a3a	api_stress_user_insuf_api_joiner	api_stress_user_insuf_api_joiner@test.com	$2b$10$DK5XjYXFGdoK1jEr44PgI.Y6xFG2PbJXwItWBd7xDZkWE1.ua4krO	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:58.524789	2026-01-16 23:02:58.748	2026-01-16 23:02:58.748	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6d286f7f-d527-4b4a-9b25-c1a904a96742	api_stress_user_deduct_api_creator	api_stress_user_deduct_api_creator@test.com	$2b$10$G9bgIJ.5qzQmDa/GTHvW8ekr2H80PV2lOdnd/U/ty759maA/U9PbW	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:58.88269	2026-01-16 23:02:59.128	2026-01-16 23:02:59.128	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
10d9a122-b54b-46ed-acd7-e79f5fec1568	api_stress_user_deduct_api_joiner	api_stress_user_deduct_api_joiner@test.com	$2b$10$.yydvCW2WjNcpzKYN6j0SO4jQmMDrP9/siVw9SwJz5NBZja8IxNdW	player	active	\N	\N	\N	1000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:58.990574	2026-01-16 23:02:59.276	2026-01-16 23:02:59.276	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6e092951-4f9f-49f7-83d1-468fffa39883	api_stress_user_conc_api_creator	api_stress_user_conc_api_creator@test.com	$2b$10$bgnujEcGf2F/ABrLZoIROOO3OHNfnoE/9w5U2uYoWsENjlmkKZTKK	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:59.397	2026-01-16 23:02:59.515	2026-01-16 23:02:59.515	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
7d3a527e-213d-4bdf-99dc-d232e74a3c7c	api_stress_user_conc_api_joiner	api_stress_user_conc_api_joiner@test.com	$2b$10$uDm96IZSFkUEjXbJ.0mQz.4uaDpV0AHqb22LPOVsggt1IsA35TlQi	player	active	\N	\N	\N	300.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:59.660264	2026-01-16 23:02:59.765	2026-01-16 23:02:59.765	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
662bef24-920f-49c0-9196-d4677190efba	api_stress_user_spec_api_watcher	api_stress_user_spec_api_watcher@test.com	$2b$10$pmwP2pGqBpQJ.hNB1jZ5K.Vv8Dv/8S79yfSeaA.BP7WH8xw9BAVa.	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:03:00.141036	2026-01-16 23:03:00.141036	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
31b1ab14-cd5a-4620-96ef-56f7c903087a	api_stress_user_spec_api_p1	api_stress_user_spec_api_p1@test.com	$2b$10$QE50vZ7vT/HW8awP9G8qG.MaVMYnwRgFHuFOb4GBZBDxc6cjuIFIm	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:02:59.904579	2026-01-16 23:03:00.276	2026-01-16 23:03:00.276	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
240531f5-e6e5-46bf-90a6-2314eaf07c7b	api_stress_user_spec_api_p2	api_stress_user_spec_api_p2@test.com	$2b$10$BxvK5WNngN.yvv0jNP/NV.czrhoGLNqcJtvKJo/2LW0zNVKS1Aypm	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:03:00.006306	2026-01-16 23:03:00.472	2026-01-16 23:03:00.472	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
33c531e3-c267-4464-8541-03122409d94d	api_stress_user_mixed_api_user	api_stress_user_mixed_api_user@test.com	$2b$10$jCUoj1kelaupwDOitALSVuVXYrACY1NvxpHm0J/rCc8b0qDJr43mK	player	active	\N	\N	\N	50000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:03:00.651848	2026-01-16 23:03:00.768	2026-01-16 23:03:00.768	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
bfb5ae54-28c0-4bbf-af2d-9d8859fa5379	api_piXYGb_user_api_creator	api_piXYGb_user_api_creator@test.com	$2b$10$stc3XAbs9eb7F7CFf7Sz5ulKZ34cnq0yegDLJniK3iP66psFJPAsW	player	active	\N	\N	\N	50000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:33.98714	2026-01-16 23:05:34.127	2026-01-16 23:05:34.127	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
9b615429-ec17-4911-8e65-e7db2c524574	api_piXYGb_user_query_user	api_piXYGb_user_query_user@test.com	$2b$10$CJ5jmJMEzruGH/ASQxN5w.pqFSOJLXdGMsyZ8KEXMaHjQpaVt5Z/K	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:34.3155	2026-01-16 23:05:34.409	2026-01-16 23:05:34.409	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e6afbaa3-c0a0-4ca8-b467-eeb2d3aaf505	api_piXYGb_user_race_api_joiner1	api_piXYGb_user_race_api_joiner1@test.com	$2b$10$rrhe8s/44.jONqvU/CyL5ewybAqL9PfVvUMuFoCDidAVPtuGrBey.	player	active	\N	\N	\N	9900.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:34.677463	2026-01-16 23:05:35.008	2026-01-16 23:05:35.008	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
40156ea1-14f1-4026-9800-efe20e23aed4	test_1768594252006_3aua1f0b	\N	test-password-hash	player	active	\N	\N	\N	100050.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:52.008366	2026-01-16 20:10:52.508	\N	test_1768594252006_3aua1f0b	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
3154ceeb-cfe9-4b13-b5b2-5489475751d8	test_1768594252513_k4wtxo6k	\N	test-password-hash	player	active	\N	\N	\N	600.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:10:52.515272	2026-01-16 20:10:52.523	\N	test_1768594252513_k4wtxo6k	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
25c1dfc7-3fbc-4c08-aeeb-a9b5c81c8e1c	test_1768594272908_yarptnw9	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:12.933107	2026-01-16 20:11:12.933107	\N	test_1768594272908_yarptnw9	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ff684bcd-97f9-4c2d-ab75-e053be0a60c1	api_2aAzV5_user_api_creator	api_2aAzV5_user_api_creator@test.com	$2b$10$fNBcpMrpSsCdoTx2nYDY6.o2LXKtJgetCOCVN21v8d0iwr646GynS	player	active	\N	\N	\N	50000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:28.796053	2026-01-17 17:30:28.998	2026-01-17 17:30:28.998	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
743e5bbe-4096-4821-a1cb-b93ed0c5187e	api_piXYGb_user_conc_api_creator	api_piXYGb_user_conc_api_creator@test.com	$2b$10$dbTaqevp2w/TaO8PDMYPDOMjwOktzh8ljq/oXmX1/rrIbceetjQ1W	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:36.312417	2026-01-16 23:05:36.406	2026-01-16 23:05:36.406	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
87a9fd0e-08a4-49ae-a554-69343bad01c1	api_piXYGb_user_mixed_api_user	api_piXYGb_user_mixed_api_user@test.com	$2b$10$l3Pk2tkrJYiCvwzMW5aNfuAFwClW4/YmIVA/GtYTGr7kcfr6MB1Ra	player	active	\N	\N	\N	50000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:37.49469	2026-01-16 23:05:37.696	2026-01-16 23:05:37.696	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
aacdbc0e-57f0-42ce-8203-83e4117b8ae3	test_1768594405686_l2ovvlit	\N	test-password-hash	player	active	\N	\N	\N	1010.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.689815	2026-01-16 20:13:25.806	\N	test_1768594405686_l2ovvlit	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b3900e08-ca51-4ba7-97dd-92798aa4bc3c	api_piXYGb_user_race_api_joiner2	api_piXYGb_user_race_api_joiner2@test.com	$2b$10$lU.SDID0fZ5tNQ0CiPaeuedHmt8tsVn3r9m9Fv.iC80SpTFciy.6e	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:34.791632	2026-01-16 23:05:35.114	2026-01-16 23:05:35.114	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
46e32f3d-2333-4739-92d6-69afa4cadfdd	api_piXYGb_user_self_join_api	api_piXYGb_user_self_join_api@test.com	$2b$10$ha4xc2GXddAOx/Jz6duuQ.M6fkDsOrWnucn1B/Djv01YUaZFFfY6S	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:35.23996	2026-01-16 23:05:35.334	2026-01-16 23:05:35.334	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a02e5c31-6d32-43ed-8d41-8f2aefe5fc2b	test_1768594272947_beh86ouy	\N	test-password-hash	player	active	\N	\N	\N	1050.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:12.948844	2026-01-16 20:11:13.056	\N	test_1768594272947_beh86ouy	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b12504c6-b116-40e4-b5bf-ef902b718746	api_piXYGb_user_insuf_api_creator	api_piXYGb_user_insuf_api_creator@test.com	$2b$10$nUilj7yZesOcEEjpGgqtlewkTE6ssAs0zg8zl7FPME4wDOBBoE4jm	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:35.437862	2026-01-16 23:05:35.663	2026-01-16 23:05:35.663	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
48ed60ef-2ae3-40a1-8d7e-1f615f9b1dd1	test_1768594273062_9vmxf8lt	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.063386	2026-01-16 20:11:13.077	\N	test_1768594273062_9vmxf8lt	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0cb917e5-be92-4e23-b267-1f7160584d36	api_piXYGb_user_insuf_api_joiner	api_piXYGb_user_insuf_api_joiner@test.com	$2b$10$TPUca.7Txbd/CFv.sL/JcOp9oszx3.O0OXVUmIWJX8srbheVW2NPK	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:35.535947	2026-01-16 23:05:35.772	2026-01-16 23:05:35.772	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
77144dae-3ab8-42e9-ac41-c21ce54f26ba	api_piXYGb_user_deduct_api_creator	api_piXYGb_user_deduct_api_creator@test.com	$2b$10$l6TMKmopv9ShxSBCGiLEQOENPThZaS46YHltWYQZKKcZ2PJkUjtLq	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:35.897303	2026-01-16 23:05:36.087	2026-01-16 23:05:36.087	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
bed43532-9f93-4594-9de6-5bdfa1d3df0c	api_2aAzV5_user_query_user	api_2aAzV5_user_query_user@test.com	$2b$10$hxqb5U4vc5/czjQxCYZdKekFX8MobyleOCi.DN5G2i8NgTWI/cpeS	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:29.287769	2026-01-17 17:30:29.441	2026-01-17 17:30:29.44	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
33cef31b-cec5-497f-acf7-e286a2d4a8b7	api_piXYGb_user_deduct_api_joiner	api_piXYGb_user_deduct_api_joiner@test.com	$2b$10$gmI.WiysPwgA8pGWgiD84uAFwgqqTFO7NXQlD6a.Ae5eKlFKjCxly	player	active	\N	\N	\N	900.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:35.99117	2026-01-16 23:05:36.2	2026-01-16 23:05:36.2	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0fd14e17-b8c1-4be1-809b-c3d579701252	api_piXYGb_user_conc_api_joiner	api_piXYGb_user_conc_api_joiner@test.com	$2b$10$TM5pOyD6iIiHLoRw5J6tqOFkzKG89eKnIi8p8UPjzKxcomWKiBZQK	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:36.511906	2026-01-16 23:05:36.612	2026-01-16 23:05:36.612	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0455237a-d556-45bf-a83a-a5c1f212d5e1	api_piXYGb_user_spec_api_p1	api_piXYGb_user_spec_api_p1@test.com	$2b$10$nJ49CJrVlJG2TFyLSOjL7OFsOGps3G.QS3BH4uVNjCm63Xk5wDkFS	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:36.787886	2026-01-16 23:05:37.131	2026-01-16 23:05:37.131	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
026743b1-d1bc-4d3d-b7ac-fc4d4382b768	api_piXYGb_user_spec_api_watcher	api_piXYGb_user_spec_api_watcher@test.com	$2b$10$v4btMOOnITbiW7dD6x.Jcek/e7x.C7VGCosQ32H5z4f0fpChXWWsK	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:37.025086	2026-01-16 23:05:37.369	2026-01-16 23:05:37.369	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
39ac6f59-3898-42c1-907a-065782df5fe9	api_piXYGb_user_spec_api_p2	api_piXYGb_user_spec_api_p2@test.com	$2b$10$6O51cpoZohsfnSSBZgAi.eKCBHhuO7NZ37zk5KwqFHFZdgIQscbnG	player	active	\N	\N	\N	9950.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:36.90465	2026-01-16 23:05:37.265	2026-01-16 23:05:37.265	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
fab46662-7109-435a-b6a4-e736b7704e7f	test_1768670986526_zgx1v4g1	\N	test-password-hash	player	active	\N	\N	\N	1030.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.528725	2026-01-17 17:29:46.598	\N	test_1768670986526_zgx1v4g1	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c18ab9f3-6a8e-4101-addb-913fc0bbbffa	api_2aAzV5_user_race_api_creator	api_2aAzV5_user_race_api_creator@test.com	$2b$10$/wJOEiEbBVh02SsXgeK15OcoACze.SSLfCVsJckS9EJ2672AB8QUC	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:29.729931	2026-01-17 17:30:30.11	2026-01-17 17:30:30.11	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
7838c21b-911a-4db9-8ef1-7eb4e5191b59	api_2aAzV5_user_self_join_api	api_2aAzV5_user_self_join_api@test.com	$2b$10$.90t1iKnsRwETGG5G5KWMegxPzI0Y1UCv95GSEOpHBGjjYfwTdB5K	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:30.574939	2026-01-17 17:30:30.717	2026-01-17 17:30:30.717	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
da9637fe-ac95-4eb9-b614-a9a3113c35f2	api_2aAzV5_user_race_api_joiner2	api_2aAzV5_user_race_api_joiner2@test.com	$2b$10$/LCxH.Kvv6nwCYT.s7O3eON5UpG1ajxKuSi1HdPcqu2wO9ui0ovCa	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:29.957977	2026-01-17 17:30:30.393	2026-01-17 17:30:30.393	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
fc408a15-c0ea-48af-9552-418315e55cfc	api_2aAzV5_user_race_api_joiner1	api_2aAzV5_user_race_api_joiner1@test.com	$2b$10$bWM0rHpAurtaYEsT6U5POOVoSFWDAkd9zSV0LuU1z7g857OmW92Ri	player	active	\N	\N	\N	9900.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:29.845814	2026-01-17 17:30:30.244	2026-01-17 17:30:30.244	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c986e5cc-f872-48bc-805a-f52b96b20d44	test_1768594273461_sxfrhxh6	\N	test-password-hash	player	active	\N	\N	\N	1020.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.464021	2026-01-16 20:11:13.582	\N	test_1768594273461_sxfrhxh6	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d9a5bb48-c020-491c-9412-a3a146e8ed1f	test_1768594273461_6kpmedx3	\N	test-password-hash	player	active	\N	\N	\N	1010.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.464172	2026-01-16 20:11:13.583	\N	test_1768594273461_6kpmedx3	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0b7cf5af-aa22-47c0-9128-af0e25544f83	test_1768594273596_gejqq8t2	\N	test-password-hash	player	active	\N	\N	\N	400.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.597247	2026-01-16 20:11:13.605	\N	test_1768594273596_gejqq8t2	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
20a61ceb-0c59-4c55-a62b-f2fdcbb057f6	test_1768594273593_01ffr4et	\N	test-password-hash	player	active	\N	\N	\N	600.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.594138	2026-01-16 20:11:13.611	\N	test_1768594273593_01ffr4et	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
f90466eb-6fac-4f5f-b215-a8aac73e3ca4	test_1768594273082_2kty3kn6	\N	test-password-hash	player	active	\N	\N	\N	1200.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.083679	2026-01-16 20:11:13.37	\N	test_1768594273082_2kty3kn6	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
747d93b8-185c-411f-b82a-3d94e5d46ecc	test_1768594405821_ae8v77ia	\N	test-password-hash	player	active	\N	\N	\N	400.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.821611	2026-01-16 20:13:25.83	\N	test_1768594405821_ae8v77ia	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a57c756c-e3fa-4e3e-a12a-e71b7584ac7e	test_1768594405818_j63dobf6	\N	test-password-hash	player	active	\N	\N	\N	600.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.818644	2026-01-16 20:13:25.837	\N	test_1768594405818_j63dobf6	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d9a9b156-260d-4d0e-89ea-3ed0226ba5d5	test_1768670986526_4wdewlet	\N	test-password-hash	player	active	\N	\N	\N	970.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.529078	2026-01-17 17:29:46.635	\N	test_1768670986526_4wdewlet	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a311105a-bdb8-40ba-b54f-654b1e11fc30	test_1768670987644_opi2zsot	\N	test-password-hash	player	active	\N	\N	\N	500.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:47.644956	2026-01-17 17:29:47.644956	\N	test_1768670987644_opi2zsot	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
9e1f9d00-1939-499c-86cb-82255590ad63	api_piXYGb_user_race_api_creator	api_piXYGb_user_race_api_creator@test.com	$2b$10$K2a8YZayB3htIqweK0BKUOfDmP10S/Ih7i/ftgMURA0zmcZ6qq1lK	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 23:05:34.580378	2026-01-16 23:05:34.9	2026-01-16 23:05:34.9	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
3e8d9d96-4fd5-4eb7-9483-fa409e041b2d	api_2aAzV5_user_insuf_api_joiner	api_2aAzV5_user_insuf_api_joiner@test.com	$2b$10$vKofn7fFtEk/qq6AMiY22urDTl6QzAgcp.Sdbm/nq1JljW0Dz8rgC	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:30.952355	2026-01-17 17:30:31.185	2026-01-17 17:30:31.185	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6b9cd200-55ad-4f52-84d3-37c7a4e1cd63	test_1768594273616_2vjwub8n	\N	test-password-hash	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.616749	2026-01-16 20:11:14.006	\N	test_1768594273616_2vjwub8n	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a830d6f9-1c86-47ed-bcfc-02b82fa941fc	test_1768594273618_csjou8mh	\N	test-password-hash	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.619511	2026-01-16 20:11:14.014	\N	test_1768594273618_csjou8mh	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cfd09055-2563-4c66-9770-18fb522f6e06	test_1768594273376_3lz0g168	\N	test-password-hash	player	active	\N	\N	\N	550.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.377679	2026-01-16 20:11:13.454	\N	test_1768594273376_3lz0g168	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
571fb00a-18b2-4c96-b4d6-7e1e64d4d842	api_2aAzV5_user_deduct_api_creator	api_2aAzV5_user_deduct_api_creator@test.com	$2b$10$BrKF528EuG.r3QROwCvQ6eyq5Bn8yONnSJZYrGXOaWAnUXA.6ZbY6	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:31.301548	2026-01-17 17:30:31.533	2026-01-17 17:30:31.532	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
13708628-1506-4cd5-bf9e-23703050ed40	test_1768594405844_t6ij6f97	\N	test-password-hash	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.844951	2026-01-16 20:13:26.152	\N	test_1768594405844_t6ij6f97	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
9199b094-6b82-4b72-80f1-5d3e72e04f05	test_1768594274023_y57nokso	\N	test-password-hash	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:14.023963	2026-01-16 20:11:14.023963	\N	test_1768594274023_y57nokso	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
31fda6cf-306e-4a78-aad6-8acd070641f8	test_1768594405847_fx6s8lu7	\N	test-password-hash	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:25.848146	2026-01-16 20:13:26.161	\N	test_1768594405847_fx6s8lu7	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
37cb3b4d-bb0d-4ac7-8bcd-bd44e11efb34	test_1768594274019_4ppgr3o0	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:14.020696	2026-01-16 20:11:14.035	\N	test_1768594274019_4ppgr3o0	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
fca9e294-2a28-4b28-974c-d56d2ebbb7cb	test_1768594274040_qin3iiam	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:14.040984	2026-01-16 20:11:14.056	\N	test_1768594274040_qin3iiam	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
a8b5b267-6208-4dbb-b028-f5f6d9398c6b	test_1768594406170_f32xelf3	\N	test-password-hash	player	active	\N	\N	\N	50.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:26.170668	2026-01-16 20:13:26.170668	\N	test_1768594406170_f32xelf3	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
0fa69c59-23b7-4db7-ab89-ec350665a534	test_1768594406166_sw15xo4x	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:26.16747	2026-01-16 20:13:26.183	\N	test_1768594406166_sw15xo4x	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
d65c0e67-0979-4b75-a69c-ce5bf01e59a4	test_1768670986526_kan6a7h0	\N	test-password-hash	player	active	\N	\N	\N	1040.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.528112	2026-01-17 17:29:46.629	\N	test_1768670986526_kan6a7h0	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
05e45256-2e89-47dc-99ec-d04f38ab5e06	api_2aAzV5_user_conc_api_creator	api_2aAzV5_user_conc_api_creator@test.com	$2b$10$UYOMwldM.W5EPA4niEVi6uOdhaST9XZwWGCXywHNadt8sXmUZ73Su	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:31.813438	2026-01-17 17:30:31.921	2026-01-17 17:30:31.921	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6baf88f1-558c-482f-8d2a-50428be6fbc0	api_2aAzV5_user_deduct_api_joiner	api_2aAzV5_user_deduct_api_joiner@test.com	$2b$10$JzEMVDVvpura62sj4SguBeRhcCR27NyBMhbIypsOOUm8jVnuZsR2i	player	active	\N	\N	\N	900.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:31.408989	2026-01-17 17:30:31.657	2026-01-17 17:30:31.657	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
575a5c22-b585-495e-8893-9a20616f8436	test_1768594406189_a1cvs6vs	\N	test-password-hash	player	active	\N	\N	\N	100.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:26.189969	2026-01-16 20:13:26.199	\N	test_1768594406189_a1cvs6vs	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
55dfd29c-e602-4c38-8b73-f46a71b38e8c	api_2aAzV5_user_spec_api_p2	api_2aAzV5_user_spec_api_p2@test.com	$2b$10$q8v9HTnieRjR/o9lk8k.4ekdcu1ZY1RGJhUJTgpLK5NkoXlNW4/la	player	active	\N	\N	\N	9950.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:32.418946	2026-01-17 17:30:32.788	2026-01-17 17:30:32.788	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
702d451a-d75a-4606-9c76-a242b1ad4696	test_1768594273461_77ru9ca4	\N	test-password-hash	player	active	\N	\N	\N	990.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.465654	2026-01-16 20:11:13.572	\N	test_1768594273461_77ru9ca4	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
31a99215-8779-4849-9a4b-a685c2e55c97	test_1768594273461_32z2t1ze	\N	test-password-hash	player	active	\N	\N	\N	950.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.464937	2026-01-16 20:11:13.581	\N	test_1768594273461_32z2t1ze	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
07a74298-098e-4610-8fa6-983863ae7cd6	test_1768594273461_kkj4sdkl	\N	test-password-hash	player	active	\N	\N	\N	1030.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:13.465383	2026-01-16 20:11:13.582	\N	test_1768594273461_kkj4sdkl	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
6665c31c-84bb-485d-aa15-b54c3f021ac1	test_1768670986526_44vo6a6u	\N	test-password-hash	player	active	\N	\N	\N	980.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.529291	2026-01-17 17:29:46.61	\N	test_1768670986526_44vo6a6u	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
5f20ee37-3674-4edf-a9f7-1b6129a7373b	api_2aAzV5_user_insuf_api_creator	api_2aAzV5_user_insuf_api_creator@test.com	$2b$10$V7bDrsBMx6AdZjkaWZftSe4XPNBxDsdOmLL.jYEtTl9y/7CKPe.MK	player	active	\N	\N	\N	10000.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:30.83587	2026-01-17 17:30:31.069	2026-01-17 17:30:31.069	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
c8c370ed-e8a0-4d38-a298-3d1c36d34aa2	newuser_a3vu	newuser@example.com	$2b$10$Y7z6ct4KlFpDbmPYYMmgju3JkysYpSWT8VKIa5gISkP41hCS63o9q	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 08:47:37.574561	2026-01-18 08:47:59.017	\N	690604313	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	t
6982329c-1f84-4198-9703-4fbbd3f0c584	user_3acdblb8	\N	$2b$10$nbc9dF1Erqz/cu2m3EuNieRJ5c8ymfaSmSKj9kBwm9YuvOElPpfP.	player	active	\N	\N	+1555999888	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 10:27:17.964126	2026-01-18 10:27:17.964126	\N	249620320	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
4d358b24-397b-4020-87f3-de6acaf35864	bot_7oiKkRGM	bot_7oiKkRGM@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	لينا		\N	870.17	9931.73	9253.64	100183.75	6690.55	4	\N	2026-01-18 11:03:49.567507	2026-01-18 11:03:49.567507	\N	496132911	t	f	\N	\N	0	\N	لينا_الحسيني	https://api.dicebear.com/7.x/avataaars/svg?seed=bot16	4.65	21	11	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	482	332	148	1	75	19	1	23	69	24	55	25	35	0	2	5	{}	{}	\N	t
6527a6ca-91b1-43af-a759-d818e64e2d71	test_1768594406203_viekjuaw	\N	test-password-hash	player	active	\N	\N	\N	100050.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:13:26.204063	2026-01-16 20:13:26.742	\N	test_1768594406203_viekjuaw	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
31139c83-685b-41a9-a5f8-30e85aeadee8	test_1768670986526_n9qov1ie	\N	test-password-hash	player	active	\N	\N	\N	980.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:29:46.528347	2026-01-17 17:29:46.636	\N	test_1768670986526_n9qov1ie	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
4160d62e-5f36-4868-8c1e-3816cfc76407	api_2aAzV5_user_conc_api_joiner	api_2aAzV5_user_conc_api_joiner@test.com	$2b$10$llqM7Pg.TiflCF.eh4dE5uyCGt8XgJCdX0ttPOb6gJrXr3agfAgtm	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-17 17:30:32.04914	2026-01-17 17:30:32.157	2026-01-17 17:30:32.157	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
e340a4e0-50d4-4f58-a3b2-f892946f4499	testuser999	test999@test.com	$2b$10$xZTZ483XpyXs7VWRuCfarOy4ZSWY5kkMkPsWMSx7i0ei2Fbpn3ajG	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-21 15:24:09.150001	2026-01-21 15:24:09.150001	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ecf6ca87-9caf-4fbc-ba21-e75baf4a5504	test_1768594274061_bsyx0hv0	\N	test-password-hash	player	active	\N	\N	\N	100050.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:14.062041	2026-01-16 20:11:14.616	\N	test_1768594274061_bsyx0hv0	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
2151b666-646a-45f1-9c94-a097927ee87f	bot_PsqyBX-a	bot_PsqyBX-a@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Winter	Legend	\N	6813.18	11399.58	15265.86	80658.55	34925.26	2	\N	2026-01-18 11:03:49.552402	2026-01-18 11:03:49.552402	\N	472005970	t	f	\N	\N	0	\N	WinterChief35	https://api.dicebear.com/7.x/avataaars/svg?seed=bot13	4.32	22	2	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	137	76	61	8	22	33	0	6	44	44	43	22	38	26	7	22	{}	{}	\N	t
3ff9473e-b024-4544-817b-9158beb5de84	test_1768594274620_5v4t6b9e	\N	test-password-hash	player	active	\N	\N	\N	600.00	0.00	0.00	0.00	0.00	0	\N	2026-01-16 20:11:14.621478	2026-01-16 20:11:14.627	\N	test_1768594274620_5v4t6b9e	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
1f2400d8-f7dc-498c-a2dc-4d35f1a0be1c	spectator_test	spectator@test.com	$2b$10$tL7ls/6YUUGlDJq8re5IjemQb.2q746V8szLdMok4RKnUYhI6aWAW	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 12:15:05.413176	2026-01-18 12:15:05.413176	\N	\N	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
f37b8e41-a6ed-41bd-9ab2-cc88ebc89049	orkoagent_dvqx	orkoagent@gmail.com	$2b$10$0ZZCm6TTLzfsey2cS0/BcOq7c1Y45okU/1P6XP4gCKgc5tF62YS0C	player	active	\N	\N	\N	242422.00	0.00	0.00	0.00	0.00	0	\N	2026-01-18 10:45:34.8036	2026-01-18 22:27:50.423	2026-01-18 22:27:50.423	322742253	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
2e7732d2-a184-411e-a433-e4fded1ade6f	bot_aauTFp01	bot_aauTFp01@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	فهد		\N	5227.04	9823.48	7929.64	53722.40	20197.02	2	\N	2026-01-18 11:03:49.537779	2026-01-18 11:03:49.537779	\N	452134198	t	f	\N	\N	0	\N	فهد_الشمري	https://api.dicebear.com/7.x/avataaars/svg?seed=bot10	4.22	3	36	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	207	131	76	5	13	10	96	6	2	33	42	18	50	11	4	9	{}	{}	\N	t
e949ad28-20ef-49fe-b91b-f340e0ee30dd	bot_aLFW9b_-	bot_aLFW9b_-@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Alex	Boss	\N	2226.92	46267.26	16715.50	91102.83	62370.18	0	\N	2026-01-18 11:03:49.548344	2026-01-18 11:03:49.548344	\N	145866004	t	f	\N	\N	0	\N	AlexElite49	https://api.dicebear.com/7.x/avataaars/svg?seed=bot12	4.53	28	27	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	439	260	177	4	25	23	35	24	65	24	38	34	57	2	2	24	{}	{}	\N	t
655d723f-16f5-4711-b795-4c5acf35890d	bot_0ML3f-8s	bot_0ML3f-8s@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Emerson	Supreme	\N	4638.24	38260.00	17877.60	94481.89	16878.17	3	\N	2026-01-18 11:03:49.58798	2026-01-18 11:03:49.58798	\N	986739294	t	f	\N	\N	0	\N	EmersonWinner86	https://api.dicebear.com/7.x/avataaars/svg?seed=bot19	4.07	5	28	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	328	138	189	13	65	27	35	7	80	28	67	24	74	38	5	22	{}	{}	\N	t
e87885fb-aa52-49e2-92e9-9ad265fca46c	bot_vXo0KFSS	bot_vXo0KFSS@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Finley	Champ	\N	3939.91	16779.06	3180.87	75775.19	6663.19	2	\N	2026-01-18 11:03:48.866537	2026-01-18 11:03:48.866537	\N	362715648	t	f	\N	\N	0	\N	FinleyLegend16	https://api.dicebear.com/7.x/avataaars/svg?seed=bot2	4.42	42	16	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	381	261	119	7	75	27	31	41	51	43	12	5	15	13	0	29	{}	{}	\N	t
8c56493e-4777-406b-bbf0-a47203630997	448990618	\N	$2b$10$Jtx.DLGChf1Upx2g6Aii3.GNefhKcepQnQVSgBjAd/Z1W06viQETe	player	active	\N	\N	\N	2222.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 20:18:17.351792	2026-01-19 20:19:07.883	\N	448990618	f	f	\N	\N	0	\N	2121212	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
da6f34a0-2e4c-4b95-92af-c77488d71838	929076605	\N	$2b$10$vZ32SZ.8OXMviFskannWSOE7Xxnm9JBv5HUVK/BXvR2rD53z5AnNq	player	active	\N	\N	\N	53453131.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:03:57.940536	2026-01-20 00:04:37.447	\N	929076605	f	f	\N	\N	0	\N	Dbdbdhdh	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
4a6ae42d-5986-4816-9e52-e9ad5ccd4c49	316922826	\N	$2b$10$mfEt7hpNcpjrv8oHmdNRc.PDkNF7MCzNxSmaG2guZD90JermoIaRO	player	active	\N	\N	\N	0.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 18:53:08.954233	2026-01-19 18:53:08.954233	\N	316922826	f	f	\N	\N	0	\N	\N	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
074689ad-b8ce-44b8-a015-daed296f5281	830967818	\N	$2b$10$xljSsso643fXjDvDa3QoWejVIO9vbeFxovrIU4bQWsnY0ghw1mwMi	player	active	\N	\N	\N	515451521.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 20:09:57.512643	2026-01-19 20:10:46.105	\N	830967818	f	f	\N	\N	0	\N	vixب	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
7d8e1972-80e7-4e00-abc8-84f726c204b6	210935235	\N	$2b$10$1.aoNyX.jbZga4qjLj53AepXlcpPUddfnLC9loqEJeDX7SkDZJ4PC	player	active	\N	\N	\N	7564534.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:01:55.357644	2026-01-20 00:05:06.657	\N	210935235	f	f	\N	\N	0	\N	Gsgbddb	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
983b8c71-03c9-45c9-b4b9-4fb1f4c3c89e	bot_6GGgZ2r0	bot_6GGgZ2r0@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Skyler	Legend	\N	9759.72	48408.57	10329.32	100202.62	75877.87	0	\N	2026-01-18 11:03:49.543135	2026-01-18 11:03:49.543135	\N	916156003	t	f	\N	\N	0	\N	SkylerTop47	https://api.dicebear.com/7.x/avataaars/svg?seed=bot11	4.71	20	35	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	459	268	190	3	57	8	77	30	59	1	34	21	15	26	7	11	{}	{}	\N	t
377adf3b-56b3-4d0d-922b-3a6ddb3fb524	879347856	\N	$2b$10$WaavplNqtBAuMkDZUIKPpeHnNHcRNrkjhBqnULLbhfO8OEm0iQxjO	player	active	\N	\N	\N	7589179876.00	0.00	0.00	0.00	0.00	0	\N	2026-01-19 20:30:40.888687	2026-01-20 00:04:05.654	\N	879347856	f	f	\N	\N	0	\N	ليبليبل	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
ad92f2f2-89e3-47ed-a10e-6ed23626e440	bot_nmHDbXY5	bot_nmHDbXY5@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	زياد		\N	4284.34	22571.49	11142.87	61750.49	57932.19	0	\N	2026-01-18 11:03:49.491162	2026-01-18 11:03:49.491162	\N	964545867	t	f	\N	\N	0	\N	زياد_السعيدي	https://api.dicebear.com/7.x/avataaars/svg?seed=bot8	4.52	26	34	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	429	287	141	19	15	31	35	21	56	17	77	7	67	3	2	23	{}	{}	\N	t
fd1e958c-afc3-49bc-a229-a1049ff601e3	738822008	\N	$2b$10$2CLNEIMnXaR2mtkTVH0yDumkxc4COwjeDc4Ytds2EVS9WcbObLBM2	player	active	\N	\N	\N	45345242.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:01:56.544485	2026-01-20 00:04:28.998	\N	738822008	f	f	\N	\N	0	\N	Csggt4	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
3091265b-af8d-4bf0-af19-c36a8301a6b2	362876226	\N	$2b$10$opfZsh4IeL9qqG.3hH4lgumpC9zHP.gr/dtSSWsiJTNIIw1HFVJpi	player	active	\N	\N	\N	5798677.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:56:39.202839	2026-01-20 00:59:06.983	\N	362876226	f	f	\N	\N	0	\N	Rrurjdhsgbshd	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
cdaf32f9-3a37-4c86-85bc-03929da172d7	391946309	\N	$2b$10$VkiLRksp6O/ESFvIYMWoRusLi4B1OT1nylwRt6qDQJ.A9KEhdSW.K	player	active	\N	\N	\N	499080346.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:56:38.11891	2026-01-20 00:58:50.404	\N	391946309	f	f	\N	\N	0	\N	Dbdbfmfjnffjag	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
07d181cd-5c5f-48ef-9176-a8bde979da32	252333974	\N	$2b$10$uFKSyZQx9OkY3GMIPhVWBuK0HLYzhPTRHcQ9gIHyA2RaQ02gKJnZu	player	active	\N	\N	\N	546989579.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 00:56:34.636338	2026-01-20 00:58:28.973	\N	252333974	f	f	\N	\N	0	\N	Zxjcjfncncfj	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
b8d9bf67-623e-4147-9d94-cc85dc9b5851	bot_BIYGIHUj	bot_BIYGIHUj@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	وليد		\N	4371.62	29928.48	15575.50	37369.26	15227.48	4	\N	2026-01-18 11:03:49.557346	2026-01-18 11:03:49.557346	\N	232977170	t	f	\N	\N	0	\N	وليد_الشمري	https://api.dicebear.com/7.x/avataaars/svg?seed=bot14	4.14	6	0	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	154	77	75	16	5	30	75	23	59	45	2	37	73	17	1	8	{}	{}	\N	t
4c22629a-ae59-4cc3-828e-8bfeb868dfba	bot_6iy3kglg	bot_6iy3kglg@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Riley	Ace	\N	6653.19	1768.93	4440.53	89994.42	73695.57	0	\N	2026-01-18 11:03:49.51003	2026-01-18 11:03:49.51003	\N	902421970	t	f	\N	\N	0	\N	RileyAce48	https://api.dicebear.com/7.x/avataaars/svg?seed=bot9	4.15	39	1	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	255	125	130	3	24	11	53	1	76	35	7	33	67	27	8	12	{}	{}	\N	t
703b875c-e673-4382-97c9-524e0463898a	bot__JZovm_U	bot__JZovm_U@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	Harper	Hero	\N	6304.85	2572.15	10626.00	15864.24	6116.22	0	\N	2026-01-18 11:03:49.592389	2026-01-18 11:03:49.592389	\N	756809356	t	f	\N	\N	0	\N	HarperPro33	https://api.dicebear.com/7.x/avataaars/svg?seed=bot20	4.01	12	42	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	473	328	144	18	61	7	63	45	87	13	25	17	77	15	7	13	{}	{}	\N	t
9d753bee-0ae8-4ddf-9339-f2346874c163	593275233	\N	$2b$10$N5XPI3NlKFy61W9mATBgSOq7mY/l3TIT.5rysXZfZTo81AVsUDUxC	player	active	\N	\N	\N	545243.00	0.00	0.00	0.00	0.00	0	\N	2026-01-20 01:15:19.3566	2026-01-20 01:16:50.236	\N	593275233	f	f	\N	\N	0	\N	Fjfddhdjdbdn	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
5bbefd70-91b3-4631-a5ee-79c68522b3f5	513456121	\N	$2b$10$h.mZoKzu8QTXWaq3Cbja2eivwCmbOFiP5.YE9JtVd.zWTAktyfxOa	player	active	\N	\N	\N	5454545130.00	0.00	0.00	0.00	0.00	0	\N	2026-01-21 20:21:44.755467	2026-01-21 20:22:12.412	\N	513456121	f	f	\N	\N	0	\N	ececreecwweewew	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
986a9ace-9937-49a2-bd90-c66c64d71789	322830463	\N	$2b$10$TVSoV8przLKwV4MXtToCKezONob8DRlNuzfJIGxkH2RfDkU/iQOu.	player	active	\N	\N	\N	5445540216.00	0.00	0.00	0.00	0.00	0	\N	2026-01-21 20:21:22.86347	2026-01-21 20:22:21.724	\N	322830463	f	f	\N	\N	0	\N	ertvvttvvttv	\N	5.00	0	0	\N	\N	\N	\N	\N	\N	f	f	f	\N	f	0.00	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	0	{}	{}	\N	f
3f7d7f25-80fd-4402-a898-dee310faf409	bot_zLao5CtA	bot_zLao5CtA@vix.bot	$2b$10$kBIhjV1URAvUxK8/n/3Ps.0koIu2bl7m6q76UDwMvj11PELakR0qO	player	active	هدى		\N	5155.01	50268.52	15212.10	89687.14	36517.15	0	\N	2026-01-18 11:03:49.472112	2026-01-18 11:03:49.472112	\N	160161240	t	f	\N	\N	0	\N	هدى_الحربي	https://api.dicebear.com/7.x/avataaars/svg?seed=bot7	4.67	35	21	\N	\N	\N	\N	\N	\N	f	t	f	2026-01-21 16:46:55.103	f	0.00	156	96	58	9	60	27	11	16	8	16	26	10	47	1	3	5	{}	{}	\N	t
\.


--
-- Name: achievements achievements_key_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_key_unique UNIQUE (key);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: admin_alerts admin_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.admin_alerts
    ADD CONSTRAINT admin_alerts_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: advertisements advertisements_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.advertisements
    ADD CONSTRAINT advertisements_pkey PRIMARY KEY (id);


--
-- Name: affiliates affiliates_affiliate_code_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.affiliates
    ADD CONSTRAINT affiliates_affiliate_code_unique UNIQUE (affiliate_code);


--
-- Name: affiliates affiliates_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.affiliates
    ADD CONSTRAINT affiliates_pkey PRIMARY KEY (id);


--
-- Name: agent_payment_methods agent_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.agent_payment_methods
    ADD CONSTRAINT agent_payment_methods_pkey PRIMARY KEY (id);


--
-- Name: agents agents_agent_code_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_agent_code_unique UNIQUE (agent_code);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: announcement_views announcement_views_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.announcement_views
    ADD CONSTRAINT announcement_views_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_key_unique UNIQUE (key);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backgammon_moves backgammon_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.backgammon_moves
    ADD CONSTRAINT backgammon_moves_pkey PRIMARY KEY (id);


--
-- Name: badge_catalog badge_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.badge_catalog
    ADD CONSTRAINT badge_catalog_pkey PRIMARY KEY (id);


--
-- Name: broadcast_notifications broadcast_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.broadcast_notifications
    ADD CONSTRAINT broadcast_notifications_pkey PRIMARY KEY (id);


--
-- Name: card_game_bids card_game_bids_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.card_game_bids
    ADD CONSTRAINT card_game_bids_pkey PRIMARY KEY (id);


--
-- Name: card_game_plays card_game_plays_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.card_game_plays
    ADD CONSTRAINT card_game_plays_pkey PRIMARY KEY (id);


--
-- Name: challenge_chat_messages challenge_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_chat_messages
    ADD CONSTRAINT challenge_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: challenge_follow_notifications challenge_follow_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_follow_notifications
    ADD CONSTRAINT challenge_follow_notifications_pkey PRIMARY KEY (id);


--
-- Name: challenge_follows challenge_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_follows
    ADD CONSTRAINT challenge_follows_pkey PRIMARY KEY (id);


--
-- Name: challenge_game_sessions challenge_game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_game_sessions
    ADD CONSTRAINT challenge_game_sessions_pkey PRIMARY KEY (id);


--
-- Name: challenge_gifts challenge_gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_gifts
    ADD CONSTRAINT challenge_gifts_pkey PRIMARY KEY (id);


--
-- Name: challenge_points_ledger challenge_points_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_points_ledger
    ADD CONSTRAINT challenge_points_ledger_pkey PRIMARY KEY (id);


--
-- Name: challenge_ratings challenge_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_ratings
    ADD CONSTRAINT challenge_ratings_pkey PRIMARY KEY (id);


--
-- Name: challenge_ratings challenge_ratings_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_ratings
    ADD CONSTRAINT challenge_ratings_user_id_unique UNIQUE (user_id);


--
-- Name: challenge_spectator_bets challenge_spectator_bets_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_spectator_bets
    ADD CONSTRAINT challenge_spectator_bets_pkey PRIMARY KEY (id);


--
-- Name: challenge_spectators challenge_spectators_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_spectators
    ADD CONSTRAINT challenge_spectators_pkey PRIMARY KEY (id);


--
-- Name: challenger_follows challenger_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenger_follows
    ADD CONSTRAINT challenger_follows_pkey PRIMARY KEY (id);


--
-- Name: challenges challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_settings chat_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chat_settings
    ADD CONSTRAINT chat_settings_key_unique UNIQUE (key);


--
-- Name: chat_settings chat_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chat_settings
    ADD CONSTRAINT chat_settings_pkey PRIMARY KEY (id);


--
-- Name: chess_moves chess_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chess_moves
    ADD CONSTRAINT chess_moves_pkey PRIMARY KEY (id);


--
-- Name: complaint_attachments complaint_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaint_attachments
    ADD CONSTRAINT complaint_attachments_pkey PRIMARY KEY (id);


--
-- Name: complaint_messages complaint_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaint_messages
    ADD CONSTRAINT complaint_messages_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_ticket_number_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_ticket_number_unique UNIQUE (ticket_number);


--
-- Name: country_payment_methods country_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.country_payment_methods
    ADD CONSTRAINT country_payment_methods_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_code_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_code_unique UNIQUE (code);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: deposit_requests deposit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.deposit_requests
    ADD CONSTRAINT deposit_requests_pkey PRIMARY KEY (id);


--
-- Name: domino_moves domino_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.domino_moves
    ADD CONSTRAINT domino_moves_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_key_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_key_unique UNIQUE (key);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);


--
-- Name: financial_limits financial_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.financial_limits
    ADD CONSTRAINT financial_limits_pkey PRIMARY KEY (id);


--
-- Name: game_chat_messages game_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_chat_messages
    ADD CONSTRAINT game_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: game_matches game_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_matches
    ADD CONSTRAINT game_matches_pkey PRIMARY KEY (id);


--
-- Name: game_moves game_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_moves
    ADD CONSTRAINT game_moves_pkey PRIMARY KEY (id);


--
-- Name: game_sections game_sections_key_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_sections
    ADD CONSTRAINT game_sections_key_unique UNIQUE (key);


--
-- Name: game_sections game_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_sections
    ADD CONSTRAINT game_sections_pkey PRIMARY KEY (id);


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: game_spectators game_spectators_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_spectators
    ADD CONSTRAINT game_spectators_pkey PRIMARY KEY (id);


--
-- Name: gameplay_emojis gameplay_emojis_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gameplay_emojis
    ADD CONSTRAINT gameplay_emojis_pkey PRIMARY KEY (id);


--
-- Name: gameplay_messages gameplay_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gameplay_messages
    ADD CONSTRAINT gameplay_messages_pkey PRIMARY KEY (id);


--
-- Name: gameplay_settings gameplay_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gameplay_settings
    ADD CONSTRAINT gameplay_settings_key_unique UNIQUE (key);


--
-- Name: gameplay_settings gameplay_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gameplay_settings
    ADD CONSTRAINT gameplay_settings_pkey PRIMARY KEY (id);


--
-- Name: games games_name_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_name_unique UNIQUE (name);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: gift_catalog gift_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gift_catalog
    ADD CONSTRAINT gift_catalog_pkey PRIMARY KEY (id);


--
-- Name: gift_items gift_items_name_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gift_items
    ADD CONSTRAINT gift_items_name_unique UNIQUE (name);


--
-- Name: gift_items gift_items_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gift_items
    ADD CONSTRAINT gift_items_pkey PRIMARY KEY (id);


--
-- Name: languages languages_code_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.languages
    ADD CONSTRAINT languages_code_unique UNIQUE (code);


--
-- Name: languages languages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.languages
    ADD CONSTRAINT languages_pkey PRIMARY KEY (id);


--
-- Name: link_analytics link_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.link_analytics
    ADD CONSTRAINT link_analytics_pkey PRIMARY KEY (id);


--
-- Name: live_game_sessions live_game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_pkey PRIMARY KEY (id);


--
-- Name: login_history login_history_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_pkey PRIMARY KEY (id);


--
-- Name: login_method_configs login_method_configs_method_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.login_method_configs
    ADD CONSTRAINT login_method_configs_method_unique UNIQUE (method);


--
-- Name: login_method_configs login_method_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.login_method_configs
    ADD CONSTRAINT login_method_configs_pkey PRIMARY KEY (id);


--
-- Name: managed_languages managed_languages_code_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.managed_languages
    ADD CONSTRAINT managed_languages_code_unique UNIQUE (code);


--
-- Name: managed_languages managed_languages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.managed_languages
    ADD CONSTRAINT managed_languages_pkey PRIMARY KEY (id);


--
-- Name: matched_supports matched_supports_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matched_supports
    ADD CONSTRAINT matched_supports_pkey PRIMARY KEY (id);


--
-- Name: matchmaking_queue matchmaking_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matchmaking_queue
    ADD CONSTRAINT matchmaking_queue_pkey PRIMARY KEY (id);


--
-- Name: multiplayer_games multiplayer_games_key_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.multiplayer_games
    ADD CONSTRAINT multiplayer_games_key_unique UNIQUE (key);


--
-- Name: multiplayer_games multiplayer_games_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.multiplayer_games
    ADD CONSTRAINT multiplayer_games_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: otp_verifications otp_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.otp_verifications
    ADD CONSTRAINT otp_verifications_pkey PRIMARY KEY (id);


--
-- Name: p2p_badge_definitions p2p_badge_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_badge_definitions
    ADD CONSTRAINT p2p_badge_definitions_pkey PRIMARY KEY (id);


--
-- Name: p2p_badge_definitions p2p_badge_definitions_slug_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_badge_definitions
    ADD CONSTRAINT p2p_badge_definitions_slug_unique UNIQUE (slug);


--
-- Name: p2p_dispute_evidence p2p_dispute_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_dispute_evidence
    ADD CONSTRAINT p2p_dispute_evidence_pkey PRIMARY KEY (id);


--
-- Name: p2p_dispute_messages p2p_dispute_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_dispute_messages
    ADD CONSTRAINT p2p_dispute_messages_pkey PRIMARY KEY (id);


--
-- Name: p2p_dispute_rules p2p_dispute_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_dispute_rules
    ADD CONSTRAINT p2p_dispute_rules_pkey PRIMARY KEY (id);


--
-- Name: p2p_disputes p2p_disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_disputes
    ADD CONSTRAINT p2p_disputes_pkey PRIMARY KEY (id);


--
-- Name: p2p_escrow p2p_escrow_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_escrow
    ADD CONSTRAINT p2p_escrow_pkey PRIMARY KEY (id);


--
-- Name: p2p_offers p2p_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_offers
    ADD CONSTRAINT p2p_offers_pkey PRIMARY KEY (id);


--
-- Name: p2p_prewritten_responses p2p_prewritten_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_prewritten_responses
    ADD CONSTRAINT p2p_prewritten_responses_pkey PRIMARY KEY (id);


--
-- Name: p2p_settings p2p_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_settings
    ADD CONSTRAINT p2p_settings_pkey PRIMARY KEY (id);


--
-- Name: p2p_trade_messages p2p_trade_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trade_messages
    ADD CONSTRAINT p2p_trade_messages_pkey PRIMARY KEY (id);


--
-- Name: p2p_trader_badges p2p_trader_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_badges
    ADD CONSTRAINT p2p_trader_badges_pkey PRIMARY KEY (id);


--
-- Name: p2p_trader_metrics p2p_trader_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_metrics
    ADD CONSTRAINT p2p_trader_metrics_pkey PRIMARY KEY (id);


--
-- Name: p2p_trader_metrics p2p_trader_metrics_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_metrics
    ADD CONSTRAINT p2p_trader_metrics_user_id_unique UNIQUE (user_id);


--
-- Name: p2p_trader_payment_methods p2p_trader_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_payment_methods
    ADD CONSTRAINT p2p_trader_payment_methods_pkey PRIMARY KEY (id);


--
-- Name: p2p_trader_profiles p2p_trader_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_profiles
    ADD CONSTRAINT p2p_trader_profiles_pkey PRIMARY KEY (id);


--
-- Name: p2p_trader_profiles p2p_trader_profiles_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_profiles
    ADD CONSTRAINT p2p_trader_profiles_user_id_unique UNIQUE (user_id);


--
-- Name: p2p_trader_ratings p2p_trader_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_ratings
    ADD CONSTRAINT p2p_trader_ratings_pkey PRIMARY KEY (id);


--
-- Name: p2p_trades p2p_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trades
    ADD CONSTRAINT p2p_trades_pkey PRIMARY KEY (id);


--
-- Name: p2p_transaction_logs p2p_transaction_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_transaction_logs
    ADD CONSTRAINT p2p_transaction_logs_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_unique UNIQUE (token);


--
-- Name: project_currency_conversions project_currency_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_conversions
    ADD CONSTRAINT project_currency_conversions_pkey PRIMARY KEY (id);


--
-- Name: project_currency_ledger project_currency_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_ledger
    ADD CONSTRAINT project_currency_ledger_pkey PRIMARY KEY (id);


--
-- Name: project_currency_settings project_currency_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_settings
    ADD CONSTRAINT project_currency_settings_pkey PRIMARY KEY (id);


--
-- Name: project_currency_wallets project_currency_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_wallets
    ADD CONSTRAINT project_currency_wallets_pkey PRIMARY KEY (id);


--
-- Name: project_currency_wallets project_currency_wallets_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_wallets
    ADD CONSTRAINT project_currency_wallets_user_id_unique UNIQUE (user_id);


--
-- Name: promo_code_usages promo_code_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.promo_code_usages
    ADD CONSTRAINT promo_code_usages_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_unique UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: scheduled_config_changes scheduled_config_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.scheduled_config_changes
    ADD CONSTRAINT scheduled_config_changes_pkey PRIMARY KEY (id);


--
-- Name: season_rewards season_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.season_rewards
    ADD CONSTRAINT season_rewards_pkey PRIMARY KEY (id);


--
-- Name: seasonal_stats seasonal_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.seasonal_stats
    ADD CONSTRAINT seasonal_stats_pkey PRIMARY KEY (id);


--
-- Name: seasons seasons_number_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_number_unique UNIQUE (number);


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);


--
-- Name: social_platforms social_platforms_name_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.social_platforms
    ADD CONSTRAINT social_platforms_name_unique UNIQUE (name);


--
-- Name: social_platforms social_platforms_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.social_platforms
    ADD CONSTRAINT social_platforms_pkey PRIMARY KEY (id);


--
-- Name: spectator_gifts spectator_gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_gifts
    ADD CONSTRAINT spectator_gifts_pkey PRIMARY KEY (id);


--
-- Name: spectator_supports spectator_supports_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_supports
    ADD CONSTRAINT spectator_supports_pkey PRIMARY KEY (id);


--
-- Name: support_contacts support_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.support_contacts
    ADD CONSTRAINT support_contacts_pkey PRIMARY KEY (id);


--
-- Name: support_settings support_settings_game_type_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.support_settings
    ADD CONSTRAINT support_settings_game_type_unique UNIQUE (game_type);


--
-- Name: support_settings support_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.support_settings
    ADD CONSTRAINT support_settings_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (key);


--
-- Name: system_settings system_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_key_unique UNIQUE (key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: themes themes_name_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT themes_name_unique UNIQUE (name);


--
-- Name: themes themes_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.themes
    ADD CONSTRAINT themes_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_gift_inventory user_gift_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_gift_inventory
    ADD CONSTRAINT user_gift_inventory_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_unique UNIQUE (user_id);


--
-- Name: user_relationships user_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_relationships
    ADD CONSTRAINT user_relationships_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_session_token_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_session_token_unique UNIQUE (session_token);


--
-- Name: users users_account_id_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_account_id_unique UNIQUE (account_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_nickname_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_nickname_unique UNIQUE (nickname);


--
-- Name: users users_phone_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_unique UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: idx_achievements_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_achievements_category ON public.achievements USING btree (category);


--
-- Name: idx_achievements_game_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_achievements_game_type ON public.achievements USING btree (game_type);


--
-- Name: idx_achievements_rarity; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_achievements_rarity ON public.achievements USING btree (rarity);


--
-- Name: idx_admin_alerts_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_admin_alerts_created_at ON public.admin_alerts USING btree (created_at);


--
-- Name: idx_admin_alerts_is_read; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_admin_alerts_is_read ON public.admin_alerts USING btree (is_read);


--
-- Name: idx_admin_alerts_severity; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_admin_alerts_severity ON public.admin_alerts USING btree (severity);


--
-- Name: idx_admin_alerts_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_admin_alerts_type ON public.admin_alerts USING btree (type);


--
-- Name: idx_admin_audit_logs_action; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_admin_audit_logs_action ON public.admin_audit_logs USING btree (action);


--
-- Name: idx_admin_audit_logs_admin; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_admin_audit_logs_admin ON public.admin_audit_logs USING btree (admin_id);


--
-- Name: idx_admin_audit_logs_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_admin_audit_logs_created_at ON public.admin_audit_logs USING btree (created_at);


--
-- Name: idx_advertisements_active; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_advertisements_active ON public.advertisements USING btree (is_active);


--
-- Name: idx_advertisements_sort; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_advertisements_sort ON public.advertisements USING btree (sort_order);


--
-- Name: idx_affiliates_code; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_affiliates_code ON public.affiliates USING btree (affiliate_code);


--
-- Name: idx_affiliates_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE UNIQUE INDEX idx_affiliates_user_id ON public.affiliates USING btree (user_id);


--
-- Name: idx_agent_payment_methods_agent_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_agent_payment_methods_agent_id ON public.agent_payment_methods USING btree (agent_id);


--
-- Name: idx_agents_is_active; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_agents_is_active ON public.agents USING btree (is_active);


--
-- Name: idx_agents_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE UNIQUE INDEX idx_agents_user_id ON public.agents USING btree (user_id);


--
-- Name: idx_announcement_views_announcement_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_announcement_views_announcement_id ON public.announcement_views USING btree (announcement_id);


--
-- Name: idx_announcement_views_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_announcement_views_user_id ON public.announcement_views USING btree (user_id);


--
-- Name: idx_announcements_published_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_announcements_published_at ON public.announcements USING btree (published_at);


--
-- Name: idx_announcements_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_announcements_status ON public.announcements USING btree (status);


--
-- Name: idx_announcements_target; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_announcements_target ON public.announcements USING btree (target);


--
-- Name: idx_app_settings_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_app_settings_category ON public.app_settings USING btree (category);


--
-- Name: idx_app_settings_key; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_app_settings_key ON public.app_settings USING btree (key);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_backgammon_moves_player; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_backgammon_moves_player ON public.backgammon_moves USING btree (player_id);


--
-- Name: idx_backgammon_moves_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_backgammon_moves_session ON public.backgammon_moves USING btree (session_id);


--
-- Name: idx_badge_catalog_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_badge_catalog_category ON public.badge_catalog USING btree (category);


--
-- Name: idx_badge_catalog_is_active; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_badge_catalog_is_active ON public.badge_catalog USING btree (is_active);


--
-- Name: idx_broadcast_notifications_sent_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_broadcast_notifications_sent_at ON public.broadcast_notifications USING btree (sent_at);


--
-- Name: idx_broadcast_notifications_target_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_broadcast_notifications_target_type ON public.broadcast_notifications USING btree (target_type);


--
-- Name: idx_card_bids_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_card_bids_session ON public.card_game_bids USING btree (session_id);


--
-- Name: idx_card_plays_player; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_card_plays_player ON public.card_game_plays USING btree (player_id);


--
-- Name: idx_card_plays_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_card_plays_session ON public.card_game_plays USING btree (session_id);


--
-- Name: idx_challenge_gifts_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenge_gifts_challenge ON public.challenge_gifts USING btree (challenge_id);


--
-- Name: idx_challenge_gifts_recipient; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenge_gifts_recipient ON public.challenge_gifts USING btree (recipient_id);


--
-- Name: idx_challenge_gifts_sender; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenge_gifts_sender ON public.challenge_gifts USING btree (sender_id);


--
-- Name: idx_challenge_ratings_rank; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenge_ratings_rank ON public.challenge_ratings USING btree (rank);


--
-- Name: idx_challenge_ratings_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenge_ratings_user ON public.challenge_ratings USING btree (user_id);


--
-- Name: idx_challenge_spectators_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenge_spectators_challenge ON public.challenge_spectators USING btree (challenge_id);


--
-- Name: idx_challenge_spectators_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenge_spectators_user ON public.challenge_spectators USING btree (user_id);


--
-- Name: idx_challenger_follows_followed; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenger_follows_followed ON public.challenger_follows USING btree (followed_id);


--
-- Name: idx_challenger_follows_follower; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenger_follows_follower ON public.challenger_follows USING btree (follower_id);


--
-- Name: idx_challenges_player1; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenges_player1 ON public.challenges USING btree (player1_id);


--
-- Name: idx_challenges_player2; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenges_player2 ON public.challenges USING btree (player2_id);


--
-- Name: idx_challenges_player3; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenges_player3 ON public.challenges USING btree (player3_id);


--
-- Name: idx_challenges_player4; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenges_player4 ON public.challenges USING btree (player4_id);


--
-- Name: idx_challenges_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenges_status ON public.challenges USING btree (status);


--
-- Name: idx_challenges_visibility; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_challenges_visibility ON public.challenges USING btree (visibility);


--
-- Name: idx_chat_messages_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_chat_messages_created_at ON public.chat_messages USING btree (created_at);


--
-- Name: idx_chat_messages_receiver_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_chat_messages_receiver_id ON public.chat_messages USING btree (receiver_id);


--
-- Name: idx_chat_messages_sender; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_chat_messages_sender ON public.challenge_chat_messages USING btree (sender_id);


--
-- Name: idx_chat_messages_sender_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_chat_messages_sender_id ON public.chat_messages USING btree (sender_id);


--
-- Name: idx_chat_messages_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_chat_messages_session ON public.challenge_chat_messages USING btree (session_id);


--
-- Name: idx_chat_settings_key; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_chat_settings_key ON public.chat_settings USING btree (key);


--
-- Name: idx_chess_moves_player; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_chess_moves_player ON public.chess_moves USING btree (player_id);


--
-- Name: idx_chess_moves_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_chess_moves_session ON public.chess_moves USING btree (session_id);


--
-- Name: idx_complaint_attachments_complaint_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_complaint_attachments_complaint_id ON public.complaint_attachments USING btree (complaint_id);


--
-- Name: idx_complaint_messages_complaint_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_complaint_messages_complaint_id ON public.complaint_messages USING btree (complaint_id);


--
-- Name: idx_complaints_assigned_agent_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_complaints_assigned_agent_id ON public.complaints USING btree (assigned_agent_id);


--
-- Name: idx_complaints_priority; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_complaints_priority ON public.complaints USING btree (priority);


--
-- Name: idx_complaints_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_complaints_status ON public.complaints USING btree (status);


--
-- Name: idx_complaints_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_complaints_user_id ON public.complaints USING btree (user_id);


--
-- Name: idx_country_payment_methods_country; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_country_payment_methods_country ON public.country_payment_methods USING btree (country_code);


--
-- Name: idx_currency_conversions_date; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_conversions_date ON public.project_currency_conversions USING btree (created_at);


--
-- Name: idx_currency_conversions_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_conversions_status ON public.project_currency_conversions USING btree (status);


--
-- Name: idx_currency_conversions_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_conversions_user ON public.project_currency_conversions USING btree (user_id);


--
-- Name: idx_currency_ledger_date; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_ledger_date ON public.project_currency_ledger USING btree (created_at);


--
-- Name: idx_currency_ledger_reference; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_ledger_reference ON public.project_currency_ledger USING btree (reference_id, reference_type);


--
-- Name: idx_currency_ledger_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_ledger_type ON public.project_currency_ledger USING btree (type);


--
-- Name: idx_currency_ledger_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_ledger_user ON public.project_currency_ledger USING btree (user_id);


--
-- Name: idx_currency_ledger_wallet; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_ledger_wallet ON public.project_currency_ledger USING btree (wallet_id);


--
-- Name: idx_currency_wallets_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_currency_wallets_user ON public.project_currency_wallets USING btree (user_id);


--
-- Name: idx_deposit_requests_agent_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_deposit_requests_agent_id ON public.deposit_requests USING btree (assigned_agent_id);


--
-- Name: idx_deposit_requests_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_deposit_requests_status ON public.deposit_requests USING btree (status);


--
-- Name: idx_deposit_requests_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_deposit_requests_user_id ON public.deposit_requests USING btree (user_id);


--
-- Name: idx_domino_moves_player; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_domino_moves_player ON public.domino_moves USING btree (player_id);


--
-- Name: idx_domino_moves_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_domino_moves_session ON public.domino_moves USING btree (session_id);


--
-- Name: idx_feature_flags_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_feature_flags_category ON public.feature_flags USING btree (category);


--
-- Name: idx_feature_flags_key; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_feature_flags_key ON public.feature_flags USING btree (key);


--
-- Name: idx_follow_notif_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_follow_notif_challenge ON public.challenge_follow_notifications USING btree (challenge_id);


--
-- Name: idx_follow_notif_follower; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_follow_notif_follower ON public.challenge_follow_notifications USING btree (follower_id);


--
-- Name: idx_follows_followed; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_follows_followed ON public.challenge_follows USING btree (followed_id);


--
-- Name: idx_follows_follower; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_follows_follower ON public.challenge_follows USING btree (follower_id);


--
-- Name: idx_game_chat_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_chat_session ON public.game_chat_messages USING btree (session_id);


--
-- Name: idx_game_chat_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_chat_user ON public.game_chat_messages USING btree (user_id);


--
-- Name: idx_game_matches_game_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_matches_game_id ON public.game_matches USING btree (game_id);


--
-- Name: idx_game_matches_player1_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_matches_player1_id ON public.game_matches USING btree (player1_id);


--
-- Name: idx_game_matches_player2_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_matches_player2_id ON public.game_matches USING btree (player2_id);


--
-- Name: idx_game_matches_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_matches_status ON public.game_matches USING btree (status);


--
-- Name: idx_game_sessions_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_sessions_challenge ON public.challenge_game_sessions USING btree (challenge_id);


--
-- Name: idx_game_sessions_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_sessions_created_at ON public.game_sessions USING btree (created_at);


--
-- Name: idx_game_sessions_game_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_sessions_game_id ON public.game_sessions USING btree (game_id);


--
-- Name: idx_game_sessions_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_sessions_status ON public.challenge_game_sessions USING btree (status);


--
-- Name: idx_game_sessions_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_game_sessions_user_id ON public.game_sessions USING btree (user_id);


--
-- Name: idx_gameplay_messages_match; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gameplay_messages_match ON public.gameplay_messages USING btree (match_id);


--
-- Name: idx_gameplay_messages_sender; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gameplay_messages_sender ON public.gameplay_messages USING btree (sender_id);


--
-- Name: idx_gameplay_settings_key; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gameplay_settings_key ON public.gameplay_settings USING btree (key);


--
-- Name: idx_games_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_games_category ON public.games USING btree (category);


--
-- Name: idx_games_game_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_games_game_type ON public.games USING btree (game_type);


--
-- Name: idx_games_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_games_status ON public.games USING btree (status);


--
-- Name: idx_gift_catalog_active; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gift_catalog_active ON public.gift_catalog USING btree (is_active);


--
-- Name: idx_gift_catalog_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gift_catalog_category ON public.gift_catalog USING btree (category);


--
-- Name: idx_gift_inventory_gift; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gift_inventory_gift ON public.user_gift_inventory USING btree (gift_id);


--
-- Name: idx_gift_inventory_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gift_inventory_user ON public.user_gift_inventory USING btree (user_id);


--
-- Name: idx_gift_items_active; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gift_items_active ON public.gift_items USING btree (is_active);


--
-- Name: idx_gifts_recipient; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gifts_recipient ON public.spectator_gifts USING btree (recipient_id);


--
-- Name: idx_gifts_sender; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gifts_sender ON public.spectator_gifts USING btree (sender_id);


--
-- Name: idx_gifts_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_gifts_session ON public.spectator_gifts USING btree (session_id);


--
-- Name: idx_link_analytics_affiliate_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_link_analytics_affiliate_id ON public.link_analytics USING btree (affiliate_id);


--
-- Name: idx_link_analytics_clicked_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_link_analytics_clicked_at ON public.link_analytics USING btree (clicked_at);


--
-- Name: idx_live_sessions_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_live_sessions_challenge ON public.live_game_sessions USING btree (challenge_id);


--
-- Name: idx_live_sessions_game; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_live_sessions_game ON public.live_game_sessions USING btree (game_id);


--
-- Name: idx_live_sessions_player1; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_live_sessions_player1 ON public.live_game_sessions USING btree (player1_id);


--
-- Name: idx_live_sessions_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_live_sessions_status ON public.live_game_sessions USING btree (status);


--
-- Name: idx_login_history_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_login_history_created_at ON public.login_history USING btree (created_at);


--
-- Name: idx_login_history_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_login_history_user_id ON public.login_history USING btree (user_id);


--
-- Name: idx_login_method_configs_method; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_login_method_configs_method ON public.login_method_configs USING btree (method);


--
-- Name: idx_managed_languages_code; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_managed_languages_code ON public.managed_languages USING btree (code);


--
-- Name: idx_managed_languages_is_active; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_managed_languages_is_active ON public.managed_languages USING btree (is_active);


--
-- Name: idx_matched_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_matched_challenge ON public.matched_supports USING btree (challenge_id);


--
-- Name: idx_matched_support1; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_matched_support1 ON public.matched_supports USING btree (support1_id);


--
-- Name: idx_matched_support2; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_matched_support2 ON public.matched_supports USING btree (support2_id);


--
-- Name: idx_matchmaking_queue_game_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_matchmaking_queue_game_id ON public.matchmaking_queue USING btree (game_id);


--
-- Name: idx_matchmaking_queue_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_matchmaking_queue_status ON public.matchmaking_queue USING btree (status);


--
-- Name: idx_matchmaking_queue_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_matchmaking_queue_user_id ON public.matchmaking_queue USING btree (user_id);


--
-- Name: idx_moves_number; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_moves_number ON public.game_moves USING btree (session_id, move_number);


--
-- Name: idx_moves_player; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_moves_player ON public.game_moves USING btree (player_id);


--
-- Name: idx_moves_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_moves_session ON public.game_moves USING btree (session_id);


--
-- Name: idx_multiplayer_games_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_multiplayer_games_category ON public.multiplayer_games USING btree (category);


--
-- Name: idx_multiplayer_games_is_active; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_multiplayer_games_is_active ON public.multiplayer_games USING btree (is_active);


--
-- Name: idx_multiplayer_games_key; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_multiplayer_games_key ON public.multiplayer_games USING btree (key);


--
-- Name: idx_multiplayer_games_sort_order; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_multiplayer_games_sort_order ON public.multiplayer_games USING btree (sort_order);


--
-- Name: idx_multiplayer_games_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_multiplayer_games_status ON public.multiplayer_games USING btree (status);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_otp_expires_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_otp_expires_at ON public.otp_verifications USING btree (expires_at);


--
-- Name: idx_otp_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_otp_user_id ON public.otp_verifications USING btree (user_id);


--
-- Name: idx_p2p_dispute_evidence_dispute_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_dispute_evidence_dispute_id ON public.p2p_dispute_evidence USING btree (dispute_id);


--
-- Name: idx_p2p_dispute_evidence_uploader_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_dispute_evidence_uploader_id ON public.p2p_dispute_evidence USING btree (uploader_id);


--
-- Name: idx_p2p_dispute_messages_dispute_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_dispute_messages_dispute_id ON public.p2p_dispute_messages USING btree (dispute_id);


--
-- Name: idx_p2p_dispute_messages_sender_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_dispute_messages_sender_id ON public.p2p_dispute_messages USING btree (sender_id);


--
-- Name: idx_p2p_dispute_rules_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_dispute_rules_category ON public.p2p_dispute_rules USING btree (category);


--
-- Name: idx_p2p_disputes_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_disputes_status ON public.p2p_disputes USING btree (status);


--
-- Name: idx_p2p_disputes_trade_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_disputes_trade_id ON public.p2p_disputes USING btree (trade_id);


--
-- Name: idx_p2p_escrow_trade_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_escrow_trade_id ON public.p2p_escrow USING btree (trade_id);


--
-- Name: idx_p2p_offers_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_offers_status ON public.p2p_offers USING btree (status);


--
-- Name: idx_p2p_offers_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_offers_type ON public.p2p_offers USING btree (type);


--
-- Name: idx_p2p_offers_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_offers_user_id ON public.p2p_offers USING btree (user_id);


--
-- Name: idx_p2p_prewritten_responses_category; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_prewritten_responses_category ON public.p2p_prewritten_responses USING btree (category);


--
-- Name: idx_p2p_trade_messages_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trade_messages_created_at ON public.p2p_trade_messages USING btree (created_at);


--
-- Name: idx_p2p_trade_messages_sender_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trade_messages_sender_id ON public.p2p_trade_messages USING btree (sender_id);


--
-- Name: idx_p2p_trade_messages_trade_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trade_messages_trade_id ON public.p2p_trade_messages USING btree (trade_id);


--
-- Name: idx_p2p_trader_badges_slug; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_badges_slug ON public.p2p_trader_badges USING btree (badge_slug);


--
-- Name: idx_p2p_trader_badges_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_badges_user_id ON public.p2p_trader_badges USING btree (user_id);


--
-- Name: idx_p2p_trader_metrics_completion_rate; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_metrics_completion_rate ON public.p2p_trader_metrics USING btree (completion_rate);


--
-- Name: idx_p2p_trader_metrics_total_trades; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_metrics_total_trades ON public.p2p_trader_metrics USING btree (total_trades);


--
-- Name: idx_p2p_trader_metrics_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_metrics_user_id ON public.p2p_trader_metrics USING btree (user_id);


--
-- Name: idx_p2p_trader_payment_methods_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_payment_methods_user_id ON public.p2p_trader_payment_methods USING btree (user_id);


--
-- Name: idx_p2p_trader_profiles_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_profiles_user_id ON public.p2p_trader_profiles USING btree (user_id);


--
-- Name: idx_p2p_trader_profiles_verification; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_profiles_verification ON public.p2p_trader_profiles USING btree (verification_level);


--
-- Name: idx_p2p_trader_ratings_rated_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_ratings_rated_user ON public.p2p_trader_ratings USING btree (rated_user_id);


--
-- Name: idx_p2p_trader_ratings_trade_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trader_ratings_trade_id ON public.p2p_trader_ratings USING btree (trade_id);


--
-- Name: idx_p2p_trades_buyer_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trades_buyer_id ON public.p2p_trades USING btree (buyer_id);


--
-- Name: idx_p2p_trades_offer_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trades_offer_id ON public.p2p_trades USING btree (offer_id);


--
-- Name: idx_p2p_trades_seller_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trades_seller_id ON public.p2p_trades USING btree (seller_id);


--
-- Name: idx_p2p_trades_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_trades_status ON public.p2p_trades USING btree (status);


--
-- Name: idx_p2p_transaction_logs_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_transaction_logs_created_at ON public.p2p_transaction_logs USING btree (created_at);


--
-- Name: idx_p2p_transaction_logs_dispute_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_transaction_logs_dispute_id ON public.p2p_transaction_logs USING btree (dispute_id);


--
-- Name: idx_p2p_transaction_logs_trade_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_p2p_transaction_logs_trade_id ON public.p2p_transaction_logs USING btree (trade_id);


--
-- Name: idx_password_reset_tokens_token; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);


--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_points_ledger_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_points_ledger_challenge ON public.challenge_points_ledger USING btree (challenge_id);


--
-- Name: idx_points_ledger_target; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_points_ledger_target ON public.challenge_points_ledger USING btree (target_player_id);


--
-- Name: idx_points_ledger_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_points_ledger_user ON public.challenge_points_ledger USING btree (user_id);


--
-- Name: idx_promo_code_usages_promo_code_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_promo_code_usages_promo_code_id ON public.promo_code_usages USING btree (promo_code_id);


--
-- Name: idx_promo_code_usages_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_promo_code_usages_user_id ON public.promo_code_usages USING btree (user_id);


--
-- Name: idx_promo_codes_affiliate_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_promo_codes_affiliate_id ON public.promo_codes USING btree (affiliate_id);


--
-- Name: idx_promo_codes_code; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_promo_codes_code ON public.promo_codes USING btree (code);


--
-- Name: idx_scheduled_changes_game_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_scheduled_changes_game_id ON public.scheduled_config_changes USING btree (game_id);


--
-- Name: idx_scheduled_changes_scheduled_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_scheduled_changes_scheduled_at ON public.scheduled_config_changes USING btree (scheduled_at);


--
-- Name: idx_scheduled_changes_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_scheduled_changes_status ON public.scheduled_config_changes USING btree (status);


--
-- Name: idx_season_rewards_season; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_season_rewards_season ON public.season_rewards USING btree (season_id);


--
-- Name: idx_seasonal_stats_earnings; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_seasonal_stats_earnings ON public.seasonal_stats USING btree (season_id, total_earnings);


--
-- Name: idx_seasonal_stats_games_won; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_seasonal_stats_games_won ON public.seasonal_stats USING btree (season_id, games_won);


--
-- Name: idx_seasonal_stats_season; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_seasonal_stats_season ON public.seasonal_stats USING btree (season_id);


--
-- Name: idx_seasonal_stats_streak; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_seasonal_stats_streak ON public.seasonal_stats USING btree (season_id, longest_win_streak);


--
-- Name: idx_seasonal_stats_user_season; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE UNIQUE INDEX idx_seasonal_stats_user_season ON public.seasonal_stats USING btree (user_id, season_id);


--
-- Name: idx_seasons_dates; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_seasons_dates ON public.seasons USING btree (start_date, end_date);


--
-- Name: idx_seasons_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_seasons_status ON public.seasons USING btree (status);


--
-- Name: idx_social_platforms_enabled; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_social_platforms_enabled ON public.social_platforms USING btree (is_enabled);


--
-- Name: idx_social_platforms_sort; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_social_platforms_sort ON public.social_platforms USING btree (sort_order);


--
-- Name: idx_spectator_bets_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_spectator_bets_challenge ON public.challenge_spectator_bets USING btree (challenge_id);


--
-- Name: idx_spectator_bets_spectator; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_spectator_bets_spectator ON public.challenge_spectator_bets USING btree (spectator_id);


--
-- Name: idx_spectators_session; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_spectators_session ON public.game_spectators USING btree (session_id);


--
-- Name: idx_spectators_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_spectators_user ON public.game_spectators USING btree (user_id);


--
-- Name: idx_supports_challenge; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_supports_challenge ON public.spectator_supports USING btree (challenge_id);


--
-- Name: idx_supports_matched; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_supports_matched ON public.spectator_supports USING btree (matched_support_id);


--
-- Name: idx_supports_player; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_supports_player ON public.spectator_supports USING btree (supported_player_id);


--
-- Name: idx_supports_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_supports_status ON public.spectator_supports USING btree (status);


--
-- Name: idx_supports_supporter; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_supports_supporter ON public.spectator_supports USING btree (supporter_id);


--
-- Name: idx_transactions_created_at; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_transactions_created_at ON public.transactions USING btree (created_at);


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);


--
-- Name: idx_transactions_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);


--
-- Name: idx_transactions_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_transactions_user_id ON public.transactions USING btree (user_id);


--
-- Name: idx_user_achievement_unique; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE UNIQUE INDEX idx_user_achievement_unique ON public.user_achievements USING btree (user_id, achievement_id);


--
-- Name: idx_user_achievements_unlocked; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_achievements_unlocked ON public.user_achievements USING btree (unlocked_at);


--
-- Name: idx_user_achievements_user; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_achievements_user ON public.user_achievements USING btree (user_id);


--
-- Name: idx_user_badges_badge_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_badges_badge_id ON public.user_badges USING btree (badge_id);


--
-- Name: idx_user_badges_user_badge_unique; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE UNIQUE INDEX idx_user_badges_user_badge_unique ON public.user_badges USING btree (user_id, badge_id);


--
-- Name: idx_user_badges_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_badges_user_id ON public.user_badges USING btree (user_id);


--
-- Name: idx_user_preferences_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_preferences_user_id ON public.user_preferences USING btree (user_id);


--
-- Name: idx_user_relationships_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_relationships_status ON public.user_relationships USING btree (status);


--
-- Name: idx_user_relationships_target_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_relationships_target_user_id ON public.user_relationships USING btree (target_user_id);


--
-- Name: idx_user_relationships_type; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_relationships_type ON public.user_relationships USING btree (type);


--
-- Name: idx_user_relationships_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_relationships_user_id ON public.user_relationships USING btree (user_id);


--
-- Name: idx_user_sessions_is_active; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_sessions_is_active ON public.user_sessions USING btree (is_active);


--
-- Name: idx_user_sessions_token; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_sessions_token ON public.user_sessions USING btree (session_token);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_users_backgammon_won; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_backgammon_won ON public.users USING btree (backgammon_won);


--
-- Name: idx_users_baloot_won; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_baloot_won ON public.users USING btree (baloot_won);


--
-- Name: idx_users_chess_won; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_chess_won ON public.users USING btree (chess_won);


--
-- Name: idx_users_domino_won; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_domino_won ON public.users USING btree (domino_won);


--
-- Name: idx_users_games_won; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_games_won ON public.users USING btree (games_won);


--
-- Name: idx_users_longest_win_streak; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_longest_win_streak ON public.users USING btree (longest_win_streak);


--
-- Name: idx_users_referred_by; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_referred_by ON public.users USING btree (referred_by);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_tarneeb_won; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_tarneeb_won ON public.users USING btree (tarneeb_won);


--
-- Name: idx_users_total_earnings; Type: INDEX; Schema: public; Owner: vex_user
--

CREATE INDEX idx_users_total_earnings ON public.users USING btree (total_earnings);


--
-- Name: admin_alerts admin_alerts_read_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.admin_alerts
    ADD CONSTRAINT admin_alerts_read_by_users_id_fk FOREIGN KEY (read_by) REFERENCES public.users(id);


--
-- Name: admin_audit_logs admin_audit_logs_admin_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_id_users_id_fk FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- Name: advertisements advertisements_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.advertisements
    ADD CONSTRAINT advertisements_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: affiliates affiliates_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.affiliates
    ADD CONSTRAINT affiliates_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: agent_payment_methods agent_payment_methods_agent_id_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.agent_payment_methods
    ADD CONSTRAINT agent_payment_methods_agent_id_agents_id_fk FOREIGN KEY (agent_id) REFERENCES public.agents(id);


--
-- Name: agents agents_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: announcement_views announcement_views_announcement_id_announcements_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.announcement_views
    ADD CONSTRAINT announcement_views_announcement_id_announcements_id_fk FOREIGN KEY (announcement_id) REFERENCES public.announcements(id);


--
-- Name: announcement_views announcement_views_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.announcement_views
    ADD CONSTRAINT announcement_views_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: announcements announcements_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: app_settings app_settings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: backgammon_moves backgammon_moves_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.backgammon_moves
    ADD CONSTRAINT backgammon_moves_player_id_users_id_fk FOREIGN KEY (player_id) REFERENCES public.users(id);


--
-- Name: backgammon_moves backgammon_moves_session_id_challenge_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.backgammon_moves
    ADD CONSTRAINT backgammon_moves_session_id_challenge_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.challenge_game_sessions(id);


--
-- Name: broadcast_notifications broadcast_notifications_sent_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.broadcast_notifications
    ADD CONSTRAINT broadcast_notifications_sent_by_users_id_fk FOREIGN KEY (sent_by) REFERENCES public.users(id);


--
-- Name: card_game_bids card_game_bids_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.card_game_bids
    ADD CONSTRAINT card_game_bids_player_id_users_id_fk FOREIGN KEY (player_id) REFERENCES public.users(id);


--
-- Name: card_game_bids card_game_bids_session_id_challenge_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.card_game_bids
    ADD CONSTRAINT card_game_bids_session_id_challenge_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.challenge_game_sessions(id);


--
-- Name: card_game_plays card_game_plays_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.card_game_plays
    ADD CONSTRAINT card_game_plays_player_id_users_id_fk FOREIGN KEY (player_id) REFERENCES public.users(id);


--
-- Name: card_game_plays card_game_plays_session_id_challenge_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.card_game_plays
    ADD CONSTRAINT card_game_plays_session_id_challenge_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.challenge_game_sessions(id);


--
-- Name: challenge_chat_messages challenge_chat_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_chat_messages
    ADD CONSTRAINT challenge_chat_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: challenge_chat_messages challenge_chat_messages_session_id_challenge_game_sessions_id_f; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_chat_messages
    ADD CONSTRAINT challenge_chat_messages_session_id_challenge_game_sessions_id_f FOREIGN KEY (session_id) REFERENCES public.challenge_game_sessions(id);


--
-- Name: challenge_follow_notifications challenge_follow_notifications_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_follow_notifications
    ADD CONSTRAINT challenge_follow_notifications_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: challenge_follow_notifications challenge_follow_notifications_challenger_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_follow_notifications
    ADD CONSTRAINT challenge_follow_notifications_challenger_id_users_id_fk FOREIGN KEY (challenger_id) REFERENCES public.users(id);


--
-- Name: challenge_follow_notifications challenge_follow_notifications_follower_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_follow_notifications
    ADD CONSTRAINT challenge_follow_notifications_follower_id_users_id_fk FOREIGN KEY (follower_id) REFERENCES public.users(id);


--
-- Name: challenge_follows challenge_follows_followed_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_follows
    ADD CONSTRAINT challenge_follows_followed_id_users_id_fk FOREIGN KEY (followed_id) REFERENCES public.users(id);


--
-- Name: challenge_follows challenge_follows_follower_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_follows
    ADD CONSTRAINT challenge_follows_follower_id_users_id_fk FOREIGN KEY (follower_id) REFERENCES public.users(id);


--
-- Name: challenge_game_sessions challenge_game_sessions_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_game_sessions
    ADD CONSTRAINT challenge_game_sessions_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: challenge_game_sessions challenge_game_sessions_current_turn_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_game_sessions
    ADD CONSTRAINT challenge_game_sessions_current_turn_users_id_fk FOREIGN KEY (current_turn) REFERENCES public.users(id);


--
-- Name: challenge_game_sessions challenge_game_sessions_winner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_game_sessions
    ADD CONSTRAINT challenge_game_sessions_winner_id_users_id_fk FOREIGN KEY (winner_id) REFERENCES public.users(id);


--
-- Name: challenge_gifts challenge_gifts_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_gifts
    ADD CONSTRAINT challenge_gifts_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: challenge_gifts challenge_gifts_gift_id_gift_catalog_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_gifts
    ADD CONSTRAINT challenge_gifts_gift_id_gift_catalog_id_fk FOREIGN KEY (gift_id) REFERENCES public.gift_catalog(id);


--
-- Name: challenge_gifts challenge_gifts_recipient_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_gifts
    ADD CONSTRAINT challenge_gifts_recipient_id_users_id_fk FOREIGN KEY (recipient_id) REFERENCES public.users(id);


--
-- Name: challenge_gifts challenge_gifts_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_gifts
    ADD CONSTRAINT challenge_gifts_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: challenge_points_ledger challenge_points_ledger_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_points_ledger
    ADD CONSTRAINT challenge_points_ledger_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: challenge_points_ledger challenge_points_ledger_target_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_points_ledger
    ADD CONSTRAINT challenge_points_ledger_target_player_id_users_id_fk FOREIGN KEY (target_player_id) REFERENCES public.users(id);


--
-- Name: challenge_points_ledger challenge_points_ledger_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_points_ledger
    ADD CONSTRAINT challenge_points_ledger_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: challenge_ratings challenge_ratings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_ratings
    ADD CONSTRAINT challenge_ratings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: challenge_spectator_bets challenge_spectator_bets_backed_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_spectator_bets
    ADD CONSTRAINT challenge_spectator_bets_backed_player_id_users_id_fk FOREIGN KEY (backed_player_id) REFERENCES public.users(id);


--
-- Name: challenge_spectator_bets challenge_spectator_bets_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_spectator_bets
    ADD CONSTRAINT challenge_spectator_bets_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: challenge_spectator_bets challenge_spectator_bets_spectator_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_spectator_bets
    ADD CONSTRAINT challenge_spectator_bets_spectator_id_users_id_fk FOREIGN KEY (spectator_id) REFERENCES public.users(id);


--
-- Name: challenge_spectators challenge_spectators_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_spectators
    ADD CONSTRAINT challenge_spectators_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: challenge_spectators challenge_spectators_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenge_spectators
    ADD CONSTRAINT challenge_spectators_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: challenger_follows challenger_follows_followed_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenger_follows
    ADD CONSTRAINT challenger_follows_followed_id_users_id_fk FOREIGN KEY (followed_id) REFERENCES public.users(id);


--
-- Name: challenger_follows challenger_follows_follower_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenger_follows
    ADD CONSTRAINT challenger_follows_follower_id_users_id_fk FOREIGN KEY (follower_id) REFERENCES public.users(id);


--
-- Name: challenges challenges_player1_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_player1_id_users_id_fk FOREIGN KEY (player1_id) REFERENCES public.users(id);


--
-- Name: challenges challenges_player2_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_player2_id_users_id_fk FOREIGN KEY (player2_id) REFERENCES public.users(id);


--
-- Name: challenges challenges_player3_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_player3_id_users_id_fk FOREIGN KEY (player3_id) REFERENCES public.users(id);


--
-- Name: challenges challenges_player4_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_player4_id_users_id_fk FOREIGN KEY (player4_id) REFERENCES public.users(id);


--
-- Name: challenges challenges_winner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_winner_id_users_id_fk FOREIGN KEY (winner_id) REFERENCES public.users(id);


--
-- Name: chat_messages chat_messages_receiver_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_receiver_id_users_id_fk FOREIGN KEY (receiver_id) REFERENCES public.users(id);


--
-- Name: chat_messages chat_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: chat_settings chat_settings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chat_settings
    ADD CONSTRAINT chat_settings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: chess_moves chess_moves_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chess_moves
    ADD CONSTRAINT chess_moves_player_id_users_id_fk FOREIGN KEY (player_id) REFERENCES public.users(id);


--
-- Name: chess_moves chess_moves_session_id_challenge_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.chess_moves
    ADD CONSTRAINT chess_moves_session_id_challenge_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.challenge_game_sessions(id);


--
-- Name: complaint_attachments complaint_attachments_complaint_id_complaints_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaint_attachments
    ADD CONSTRAINT complaint_attachments_complaint_id_complaints_id_fk FOREIGN KEY (complaint_id) REFERENCES public.complaints(id);


--
-- Name: complaint_attachments complaint_attachments_uploaded_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaint_attachments
    ADD CONSTRAINT complaint_attachments_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: complaint_messages complaint_messages_complaint_id_complaints_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaint_messages
    ADD CONSTRAINT complaint_messages_complaint_id_complaints_id_fk FOREIGN KEY (complaint_id) REFERENCES public.complaints(id);


--
-- Name: complaint_messages complaint_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaint_messages
    ADD CONSTRAINT complaint_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: complaints complaints_assigned_agent_id_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_assigned_agent_id_agents_id_fk FOREIGN KEY (assigned_agent_id) REFERENCES public.agents(id);


--
-- Name: complaints complaints_escalated_to_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_escalated_to_users_id_fk FOREIGN KEY (escalated_to) REFERENCES public.users(id);


--
-- Name: complaints complaints_transaction_id_transactions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_transaction_id_transactions_id_fk FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: complaints complaints_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: country_payment_methods country_payment_methods_currency_id_currencies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.country_payment_methods
    ADD CONSTRAINT country_payment_methods_currency_id_currencies_id_fk FOREIGN KEY (currency_id) REFERENCES public.currencies(id);


--
-- Name: deposit_requests deposit_requests_assigned_agent_id_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.deposit_requests
    ADD CONSTRAINT deposit_requests_assigned_agent_id_agents_id_fk FOREIGN KEY (assigned_agent_id) REFERENCES public.agents(id);


--
-- Name: deposit_requests deposit_requests_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.deposit_requests
    ADD CONSTRAINT deposit_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: domino_moves domino_moves_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.domino_moves
    ADD CONSTRAINT domino_moves_player_id_users_id_fk FOREIGN KEY (player_id) REFERENCES public.users(id);


--
-- Name: domino_moves domino_moves_session_id_challenge_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.domino_moves
    ADD CONSTRAINT domino_moves_session_id_challenge_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.challenge_game_sessions(id);


--
-- Name: feature_flags feature_flags_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: game_chat_messages game_chat_messages_session_id_live_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_chat_messages
    ADD CONSTRAINT game_chat_messages_session_id_live_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.live_game_sessions(id);


--
-- Name: game_chat_messages game_chat_messages_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_chat_messages
    ADD CONSTRAINT game_chat_messages_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: game_matches game_matches_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_matches
    ADD CONSTRAINT game_matches_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: game_matches game_matches_player1_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_matches
    ADD CONSTRAINT game_matches_player1_id_users_id_fk FOREIGN KEY (player1_id) REFERENCES public.users(id);


--
-- Name: game_matches game_matches_player2_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_matches
    ADD CONSTRAINT game_matches_player2_id_users_id_fk FOREIGN KEY (player2_id) REFERENCES public.users(id);


--
-- Name: game_matches game_matches_winner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_matches
    ADD CONSTRAINT game_matches_winner_id_users_id_fk FOREIGN KEY (winner_id) REFERENCES public.users(id);


--
-- Name: game_moves game_moves_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_moves
    ADD CONSTRAINT game_moves_player_id_users_id_fk FOREIGN KEY (player_id) REFERENCES public.users(id);


--
-- Name: game_moves game_moves_session_id_live_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_moves
    ADD CONSTRAINT game_moves_session_id_live_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.live_game_sessions(id);


--
-- Name: game_sessions game_sessions_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: game_sessions game_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: game_spectators game_spectators_session_id_live_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_spectators
    ADD CONSTRAINT game_spectators_session_id_live_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.live_game_sessions(id);


--
-- Name: game_spectators game_spectators_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.game_spectators
    ADD CONSTRAINT game_spectators_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: gameplay_messages gameplay_messages_emoji_id_gameplay_emojis_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gameplay_messages
    ADD CONSTRAINT gameplay_messages_emoji_id_gameplay_emojis_id_fk FOREIGN KEY (emoji_id) REFERENCES public.gameplay_emojis(id);


--
-- Name: gameplay_messages gameplay_messages_match_id_game_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gameplay_messages
    ADD CONSTRAINT gameplay_messages_match_id_game_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.game_matches(id);


--
-- Name: gameplay_messages gameplay_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gameplay_messages
    ADD CONSTRAINT gameplay_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: gameplay_settings gameplay_settings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.gameplay_settings
    ADD CONSTRAINT gameplay_settings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: games games_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: link_analytics link_analytics_affiliate_id_affiliates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.link_analytics
    ADD CONSTRAINT link_analytics_affiliate_id_affiliates_id_fk FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id);


--
-- Name: link_analytics link_analytics_registered_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.link_analytics
    ADD CONSTRAINT link_analytics_registered_user_id_users_id_fk FOREIGN KEY (registered_user_id) REFERENCES public.users(id);


--
-- Name: live_game_sessions live_game_sessions_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: live_game_sessions live_game_sessions_current_turn_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_current_turn_users_id_fk FOREIGN KEY (current_turn) REFERENCES public.users(id);


--
-- Name: live_game_sessions live_game_sessions_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: live_game_sessions live_game_sessions_player1_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_player1_id_users_id_fk FOREIGN KEY (player1_id) REFERENCES public.users(id);


--
-- Name: live_game_sessions live_game_sessions_player2_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_player2_id_users_id_fk FOREIGN KEY (player2_id) REFERENCES public.users(id);


--
-- Name: live_game_sessions live_game_sessions_player3_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_player3_id_users_id_fk FOREIGN KEY (player3_id) REFERENCES public.users(id);


--
-- Name: live_game_sessions live_game_sessions_player4_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_player4_id_users_id_fk FOREIGN KEY (player4_id) REFERENCES public.users(id);


--
-- Name: live_game_sessions live_game_sessions_winner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.live_game_sessions
    ADD CONSTRAINT live_game_sessions_winner_id_users_id_fk FOREIGN KEY (winner_id) REFERENCES public.users(id);


--
-- Name: login_history login_history_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: login_method_configs login_method_configs_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.login_method_configs
    ADD CONSTRAINT login_method_configs_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: matched_supports matched_supports_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matched_supports
    ADD CONSTRAINT matched_supports_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: matched_supports matched_supports_support1_id_spectator_supports_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matched_supports
    ADD CONSTRAINT matched_supports_support1_id_spectator_supports_id_fk FOREIGN KEY (support1_id) REFERENCES public.spectator_supports(id);


--
-- Name: matched_supports matched_supports_support2_id_spectator_supports_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matched_supports
    ADD CONSTRAINT matched_supports_support2_id_spectator_supports_id_fk FOREIGN KEY (support2_id) REFERENCES public.spectator_supports(id);


--
-- Name: matched_supports matched_supports_winner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matched_supports
    ADD CONSTRAINT matched_supports_winner_id_users_id_fk FOREIGN KEY (winner_id) REFERENCES public.users(id);


--
-- Name: matched_supports matched_supports_winner_support_id_spectator_supports_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matched_supports
    ADD CONSTRAINT matched_supports_winner_support_id_spectator_supports_id_fk FOREIGN KEY (winner_support_id) REFERENCES public.spectator_supports(id);


--
-- Name: matchmaking_queue matchmaking_queue_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matchmaking_queue
    ADD CONSTRAINT matchmaking_queue_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: matchmaking_queue matchmaking_queue_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.matchmaking_queue
    ADD CONSTRAINT matchmaking_queue_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: otp_verifications otp_verifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.otp_verifications
    ADD CONSTRAINT otp_verifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: p2p_dispute_evidence p2p_dispute_evidence_dispute_id_p2p_disputes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_dispute_evidence
    ADD CONSTRAINT p2p_dispute_evidence_dispute_id_p2p_disputes_id_fk FOREIGN KEY (dispute_id) REFERENCES public.p2p_disputes(id);


--
-- Name: p2p_dispute_evidence p2p_dispute_evidence_uploader_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_dispute_evidence
    ADD CONSTRAINT p2p_dispute_evidence_uploader_id_users_id_fk FOREIGN KEY (uploader_id) REFERENCES public.users(id);


--
-- Name: p2p_dispute_evidence p2p_dispute_evidence_verified_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_dispute_evidence
    ADD CONSTRAINT p2p_dispute_evidence_verified_by_users_id_fk FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: p2p_dispute_messages p2p_dispute_messages_dispute_id_p2p_disputes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_dispute_messages
    ADD CONSTRAINT p2p_dispute_messages_dispute_id_p2p_disputes_id_fk FOREIGN KEY (dispute_id) REFERENCES public.p2p_disputes(id);


--
-- Name: p2p_dispute_messages p2p_dispute_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_dispute_messages
    ADD CONSTRAINT p2p_dispute_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: p2p_disputes p2p_disputes_initiator_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_disputes
    ADD CONSTRAINT p2p_disputes_initiator_id_users_id_fk FOREIGN KEY (initiator_id) REFERENCES public.users(id);


--
-- Name: p2p_disputes p2p_disputes_resolved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_disputes
    ADD CONSTRAINT p2p_disputes_resolved_by_users_id_fk FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- Name: p2p_disputes p2p_disputes_respondent_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_disputes
    ADD CONSTRAINT p2p_disputes_respondent_id_users_id_fk FOREIGN KEY (respondent_id) REFERENCES public.users(id);


--
-- Name: p2p_disputes p2p_disputes_trade_id_p2p_trades_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_disputes
    ADD CONSTRAINT p2p_disputes_trade_id_p2p_trades_id_fk FOREIGN KEY (trade_id) REFERENCES public.p2p_trades(id);


--
-- Name: p2p_disputes p2p_disputes_winner_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_disputes
    ADD CONSTRAINT p2p_disputes_winner_user_id_users_id_fk FOREIGN KEY (winner_user_id) REFERENCES public.users(id);


--
-- Name: p2p_escrow p2p_escrow_trade_id_p2p_trades_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_escrow
    ADD CONSTRAINT p2p_escrow_trade_id_p2p_trades_id_fk FOREIGN KEY (trade_id) REFERENCES public.p2p_trades(id);


--
-- Name: p2p_offers p2p_offers_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_offers
    ADD CONSTRAINT p2p_offers_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: p2p_trade_messages p2p_trade_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trade_messages
    ADD CONSTRAINT p2p_trade_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: p2p_trade_messages p2p_trade_messages_trade_id_p2p_trades_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trade_messages
    ADD CONSTRAINT p2p_trade_messages_trade_id_p2p_trades_id_fk FOREIGN KEY (trade_id) REFERENCES public.p2p_trades(id);


--
-- Name: p2p_trader_badges p2p_trader_badges_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_badges
    ADD CONSTRAINT p2p_trader_badges_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: p2p_trader_metrics p2p_trader_metrics_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_metrics
    ADD CONSTRAINT p2p_trader_metrics_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: p2p_trader_payment_methods p2p_trader_payment_methods_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_payment_methods
    ADD CONSTRAINT p2p_trader_payment_methods_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: p2p_trader_profiles p2p_trader_profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_profiles
    ADD CONSTRAINT p2p_trader_profiles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: p2p_trader_ratings p2p_trader_ratings_rated_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_ratings
    ADD CONSTRAINT p2p_trader_ratings_rated_user_id_users_id_fk FOREIGN KEY (rated_user_id) REFERENCES public.users(id);


--
-- Name: p2p_trader_ratings p2p_trader_ratings_rater_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_ratings
    ADD CONSTRAINT p2p_trader_ratings_rater_id_users_id_fk FOREIGN KEY (rater_id) REFERENCES public.users(id);


--
-- Name: p2p_trader_ratings p2p_trader_ratings_trade_id_p2p_trades_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trader_ratings
    ADD CONSTRAINT p2p_trader_ratings_trade_id_p2p_trades_id_fk FOREIGN KEY (trade_id) REFERENCES public.p2p_trades(id);


--
-- Name: p2p_trades p2p_trades_buyer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trades
    ADD CONSTRAINT p2p_trades_buyer_id_users_id_fk FOREIGN KEY (buyer_id) REFERENCES public.users(id);


--
-- Name: p2p_trades p2p_trades_offer_id_p2p_offers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trades
    ADD CONSTRAINT p2p_trades_offer_id_p2p_offers_id_fk FOREIGN KEY (offer_id) REFERENCES public.p2p_offers(id);


--
-- Name: p2p_trades p2p_trades_seller_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_trades
    ADD CONSTRAINT p2p_trades_seller_id_users_id_fk FOREIGN KEY (seller_id) REFERENCES public.users(id);


--
-- Name: p2p_transaction_logs p2p_transaction_logs_dispute_id_p2p_disputes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_transaction_logs
    ADD CONSTRAINT p2p_transaction_logs_dispute_id_p2p_disputes_id_fk FOREIGN KEY (dispute_id) REFERENCES public.p2p_disputes(id);


--
-- Name: p2p_transaction_logs p2p_transaction_logs_trade_id_p2p_trades_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_transaction_logs
    ADD CONSTRAINT p2p_transaction_logs_trade_id_p2p_trades_id_fk FOREIGN KEY (trade_id) REFERENCES public.p2p_trades(id);


--
-- Name: p2p_transaction_logs p2p_transaction_logs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.p2p_transaction_logs
    ADD CONSTRAINT p2p_transaction_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: project_currency_conversions project_currency_conversions_approved_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_conversions
    ADD CONSTRAINT project_currency_conversions_approved_by_id_users_id_fk FOREIGN KEY (approved_by_id) REFERENCES public.users(id);


--
-- Name: project_currency_conversions project_currency_conversions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_conversions
    ADD CONSTRAINT project_currency_conversions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: project_currency_ledger project_currency_ledger_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_ledger
    ADD CONSTRAINT project_currency_ledger_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: project_currency_ledger project_currency_ledger_wallet_id_project_currency_wallets_id_f; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_ledger
    ADD CONSTRAINT project_currency_ledger_wallet_id_project_currency_wallets_id_f FOREIGN KEY (wallet_id) REFERENCES public.project_currency_wallets(id);


--
-- Name: project_currency_wallets project_currency_wallets_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.project_currency_wallets
    ADD CONSTRAINT project_currency_wallets_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: promo_code_usages promo_code_usages_promo_code_id_promo_codes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.promo_code_usages
    ADD CONSTRAINT promo_code_usages_promo_code_id_promo_codes_id_fk FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id);


--
-- Name: promo_code_usages promo_code_usages_transaction_id_transactions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.promo_code_usages
    ADD CONSTRAINT promo_code_usages_transaction_id_transactions_id_fk FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: promo_code_usages promo_code_usages_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.promo_code_usages
    ADD CONSTRAINT promo_code_usages_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: promo_codes promo_codes_affiliate_id_affiliates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_affiliate_id_affiliates_id_fk FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id);


--
-- Name: scheduled_config_changes scheduled_config_changes_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.scheduled_config_changes
    ADD CONSTRAINT scheduled_config_changes_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: scheduled_config_changes scheduled_config_changes_game_id_multiplayer_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.scheduled_config_changes
    ADD CONSTRAINT scheduled_config_changes_game_id_multiplayer_games_id_fk FOREIGN KEY (game_id) REFERENCES public.multiplayer_games(id) ON DELETE CASCADE;


--
-- Name: season_rewards season_rewards_season_id_seasons_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.season_rewards
    ADD CONSTRAINT season_rewards_season_id_seasons_id_fk FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: seasonal_stats seasonal_stats_season_id_seasons_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.seasonal_stats
    ADD CONSTRAINT seasonal_stats_season_id_seasons_id_fk FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: seasonal_stats seasonal_stats_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.seasonal_stats
    ADD CONSTRAINT seasonal_stats_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: spectator_gifts spectator_gifts_gift_item_id_gift_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_gifts
    ADD CONSTRAINT spectator_gifts_gift_item_id_gift_items_id_fk FOREIGN KEY (gift_item_id) REFERENCES public.gift_items(id);


--
-- Name: spectator_gifts spectator_gifts_recipient_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_gifts
    ADD CONSTRAINT spectator_gifts_recipient_id_users_id_fk FOREIGN KEY (recipient_id) REFERENCES public.users(id);


--
-- Name: spectator_gifts spectator_gifts_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_gifts
    ADD CONSTRAINT spectator_gifts_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: spectator_gifts spectator_gifts_session_id_live_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_gifts
    ADD CONSTRAINT spectator_gifts_session_id_live_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.live_game_sessions(id);


--
-- Name: spectator_supports spectator_supports_challenge_id_challenges_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_supports
    ADD CONSTRAINT spectator_supports_challenge_id_challenges_id_fk FOREIGN KEY (challenge_id) REFERENCES public.challenges(id);


--
-- Name: spectator_supports spectator_supports_session_id_live_game_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_supports
    ADD CONSTRAINT spectator_supports_session_id_live_game_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.live_game_sessions(id);


--
-- Name: spectator_supports spectator_supports_supported_player_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_supports
    ADD CONSTRAINT spectator_supports_supported_player_id_users_id_fk FOREIGN KEY (supported_player_id) REFERENCES public.users(id);


--
-- Name: spectator_supports spectator_supports_supporter_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.spectator_supports
    ADD CONSTRAINT spectator_supports_supporter_id_users_id_fk FOREIGN KEY (supporter_id) REFERENCES public.users(id);


--
-- Name: system_config system_config_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: system_settings system_settings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: transactions transactions_processed_by_agents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_processed_by_agents_id_fk FOREIGN KEY (processed_by) REFERENCES public.agents(id);


--
-- Name: transactions transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_achievements user_achievements_achievement_id_achievements_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_achievements_id_fk FOREIGN KEY (achievement_id) REFERENCES public.achievements(id);


--
-- Name: user_achievements user_achievements_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_badges user_badges_badge_id_badge_catalog_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_badge_catalog_id_fk FOREIGN KEY (badge_id) REFERENCES public.badge_catalog(id);


--
-- Name: user_badges user_badges_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_gift_inventory user_gift_inventory_gift_id_gift_catalog_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_gift_inventory
    ADD CONSTRAINT user_gift_inventory_gift_id_gift_catalog_id_fk FOREIGN KEY (gift_id) REFERENCES public.gift_catalog(id);


--
-- Name: user_gift_inventory user_gift_inventory_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_gift_inventory
    ADD CONSTRAINT user_gift_inventory_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_preferences user_preferences_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_relationships user_relationships_target_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_relationships
    ADD CONSTRAINT user_relationships_target_user_id_users_id_fk FOREIGN KEY (target_user_id) REFERENCES public.users(id);


--
-- Name: user_relationships user_relationships_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_relationships
    ADD CONSTRAINT user_relationships_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_sessions user_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users users_referred_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: vex_user
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_users_id_fk FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict eg4Ap50ajAwUUMOTh7m6tdrSIud0ozJFPlVB1eQwbz7LvavXHT5DkXcXFsrdQU9


