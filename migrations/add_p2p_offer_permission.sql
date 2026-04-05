-- Add explicit admin-controlled permission for posting P2P ads
ALTER TABLE p2p_trader_profiles
ADD COLUMN IF NOT EXISTS can_create_offers boolean NOT NULL DEFAULT false;
