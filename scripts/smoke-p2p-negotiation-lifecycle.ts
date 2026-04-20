#!/usr/bin/env tsx

import crypto from "node:crypto";
import { pool, closePool } from "../server/db";
import {
    createP2POfferNegotiation,
    createP2POffer,
    getP2POffer,
    getP2POfferNegotiation,
    updateP2POffer,
    updateP2POfferNegotiation,
} from "../server/storage/p2p/crud";
import { createP2PTradeAtomic } from "../server/storage/p2p/trade-create-atomic";
import { createErrorHelpers } from "./lib/smoke-helpers";

const { fail, assertCondition } = createErrorHelpers("P2PNegotiationLifecycleSmokeError");

interface CliOptions {
    keepData: boolean;
}

interface ScenarioIds {
    sellerId: string;
    buyerId: string;
    adminId: string;
    privateOfferId: string;
    publicOfferId: string;
    tradeId: string | null;
    negotiationRound1Id: string;
    negotiationRound2Id: string;
}

function parseArgs(argv: string[]): CliOptions {
    return {
        keepData: argv.includes("--keep-data"),
    };
}

function toNumber(value: unknown): number {
    const parsed = Number.parseFloat(String(value ?? "0"));
    if (!Number.isFinite(parsed)) {
        fail("Failed to parse number", { value });
    }
    return parsed;
}

async function safeDelete(query: string, values: unknown[]): Promise<void> {
    try {
        await pool.query(query, values);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("does not exist")) {
            return;
        }
        throw error;
    }
}

async function createUser(id: string, username: string): Promise<void> {
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance)
     VALUES ($1, $2, $3, 'player', 'active', 'username', '100.00')`,
        [id, username, "smoke-local-password-hash"],
    );
}

async function createAdminUser(id: string, username: string): Promise<void> {
    await pool.query(
        `INSERT INTO users (id, username, password, role, status, registration_type, balance)
     VALUES ($1, $2, $3, 'admin', 'active', 'username', '100.00')`,
        [id, username, "smoke-local-password-hash"],
    );
}

async function createTraderProfile(userId: string): Promise<void> {
    await pool.query(
        `INSERT INTO p2p_trader_profiles (user_id, can_create_offers, can_trade_p2p, bypass_p2p_verification, monthly_trade_limit)
     VALUES ($1, true, true, false, '100000.00')
     ON CONFLICT (user_id) DO UPDATE SET
       can_create_offers = EXCLUDED.can_create_offers,
       can_trade_p2p = EXCLUDED.can_trade_p2p,
       monthly_trade_limit = EXCLUDED.monthly_trade_limit,
       updated_at = NOW()`,
        [userId],
    );
}

async function getUserBalance(userId: string): Promise<number> {
    const result = await pool.query(`SELECT balance FROM users WHERE id = $1`, [userId]);
    assertCondition(result.rowCount === 1, "Expected user balance row", { userId });
    return toNumber(result.rows[0].balance);
}

async function setupScenario(ids: ScenarioIds): Promise<void> {
    await createUser(ids.sellerId, `smoke_p2p_seller_${ids.sellerId.slice(0, 8)}`);
    await createUser(ids.buyerId, `smoke_p2p_buyer_${ids.buyerId.slice(0, 8)}`);
    await createAdminUser(ids.adminId, `smoke_p2p_admin_${ids.adminId.slice(0, 8)}`);

    await createTraderProfile(ids.sellerId);
    await createTraderProfile(ids.buyerId);

    await createP2POffer({
        userId: ids.sellerId,
        type: "sell",
        status: "active",
        visibility: "private_friend",
        dealKind: "digital_product",
        digitalProductType: "gift_card",
        exchangeOffered: "Steam Wallet 50",
        exchangeRequested: "USDT transfer",
        supportMediationRequested: true,
        requestedAdminFeePercentage: "0.0100",
        targetUserId: ids.buyerId,
        cryptoCurrency: "USDT",
        fiatCurrency: "USD",
        price: "1.00",
        availableAmount: "10.00000000",
        minLimit: "1.00",
        maxLimit: "1000.00",
        paymentMethods: ["bank_transfer"],
        paymentTimeLimit: 30,
        terms: "Initial private terms",
        autoReply: "Please pay within time window",
    });

    await createP2POffer({
        userId: ids.sellerId,
        type: "sell",
        status: "pending_approval",
        visibility: "public",
        dealKind: "digital_product",
        digitalProductType: "gift_card",
        exchangeOffered: "PlayStation Gift Card 100",
        exchangeRequested: "USDT transfer",
        supportMediationRequested: false,
        requestedAdminFeePercentage: "0.0150",
        targetUserId: null,
        cryptoCurrency: "USDT",
        fiatCurrency: "USD",
        price: "1.00",
        availableAmount: "20.00000000",
        minLimit: "1.00",
        maxLimit: "1000.00",
        paymentMethods: ["bank_transfer"],
        paymentTimeLimit: 20,
        terms: "Public offer terms",
        autoReply: null,
    });

    const privateOfferRow = await pool.query(
        `SELECT id FROM p2p_offers WHERE user_id = $1 AND visibility = 'private_friend' ORDER BY created_at DESC LIMIT 1`,
        [ids.sellerId],
    );
    const publicOfferRow = await pool.query(
        `SELECT id FROM p2p_offers WHERE user_id = $1 AND visibility = 'public' ORDER BY created_at DESC LIMIT 1`,
        [ids.sellerId],
    );

    assertCondition(privateOfferRow.rowCount === 1, "Private offer was not created");
    assertCondition(publicOfferRow.rowCount === 1, "Public offer was not created");

    ids.privateOfferId = String(privateOfferRow.rows[0].id);
    ids.publicOfferId = String(publicOfferRow.rows[0].id);
}

async function runNegotiationAndTradeFlow(ids: ScenarioIds): Promise<void> {
    const round1 = await createP2POfferNegotiation({
        offerId: ids.privateOfferId,
        offerOwnerId: ids.sellerId,
        counterpartyUserId: ids.buyerId,
        proposerId: ids.sellerId,
        previousNegotiationId: null,
        status: "pending",
        exchangeOffered: "Steam Wallet 50",
        exchangeRequested: "USDT transfer",
        proposedTerms: "Pay within 20 minutes and send proof.",
        supportMediationRequested: true,
        adminFeePercentage: "0.0100",
        rejectionReason: null,
        respondedBy: null,
        respondedAt: null,
    });

    ids.negotiationRound1Id = round1.id;

    const round1Rejected = await updateP2POfferNegotiation(round1.id, {
        status: "rejected",
        rejectionReason: "Need a lower fee and faster completion guarantee.",
        respondedBy: ids.buyerId,
        respondedAt: new Date(),
    });

    assertCondition(round1Rejected?.status === "rejected", "Round 1 was not rejected", round1Rejected);
    assertCondition(
        String(round1Rejected?.rejectionReason || "").includes("lower fee"),
        "Reject reason was not persisted",
        round1Rejected,
    );

    const round2 = await createP2POfferNegotiation({
        offerId: ids.privateOfferId,
        offerOwnerId: ids.sellerId,
        counterpartyUserId: ids.buyerId,
        proposerId: ids.buyerId,
        previousNegotiationId: round1.id,
        status: "pending",
        exchangeOffered: "Steam Wallet 50",
        exchangeRequested: "USDT transfer",
        proposedTerms: "Fee 0.5% and delivery confirmation within 10 minutes.",
        supportMediationRequested: true,
        adminFeePercentage: "0.0050",
        rejectionReason: null,
        respondedBy: null,
        respondedAt: null,
    });

    ids.negotiationRound2Id = round2.id;

    const round2Accepted = await updateP2POfferNegotiation(round2.id, {
        status: "accepted",
        rejectionReason: null,
        respondedBy: ids.sellerId,
        respondedAt: new Date(),
    });

    assertCondition(round2Accepted?.status === "accepted", "Counter round was not accepted", round2Accepted);

    const sellerBefore = await getUserBalance(ids.sellerId);

    const tradeResult = await createP2PTradeAtomic({
        offerId: ids.privateOfferId,
        buyerId: ids.buyerId,
        sellerId: ids.sellerId,
        amount: "2.00000000",
        fiatAmount: "2.00",
        price: "1.00",
        paymentMethod: "bank_transfer",
        platformFee: "0.01000000",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        dealKind: "digital_product",
        digitalProductType: "gift_card",
        exchangeOffered: round2.exchangeOffered,
        exchangeRequested: round2.exchangeRequested,
        negotiatedTerms: round2.proposedTerms,
        supportMediationRequested: round2.supportMediationRequested,
        negotiatedAdminFeePercentage: round2.adminFeePercentage,
        negotiationId: round2.id,
    });

    assertCondition(tradeResult.success, "Failed to open trade after accepted negotiation", tradeResult);
    assertCondition(tradeResult.trade, "Trade object missing after success", tradeResult);

    const trade = tradeResult.trade!;
    ids.tradeId = trade.id;

    assertCondition(trade.negotiationId === round2.id, "Trade not linked to accepted negotiation", {
        tradeNegotiationId: trade.negotiationId,
        expected: round2.id,
    });

    const sellerAfter = await getUserBalance(ids.sellerId);
    const escrowHold = sellerBefore - sellerAfter;
    assertCondition(Math.abs(escrowHold - 2) < 0.0001, "Escrow hold amount mismatch", {
        sellerBefore,
        sellerAfter,
        escrowHold,
    });

    const escrowTxResult = await pool.query(
        `SELECT id, type, status, amount, description
     FROM transactions
     WHERE user_id = $1
       AND type = 'withdrawal'
       AND status = 'completed'
       AND description LIKE $2
     ORDER BY created_at DESC
     LIMIT 1`,
        [ids.sellerId, `%${trade.id}%escrow hold%`],
    );

    assertCondition(escrowTxResult.rowCount === 1, "Escrow hold transaction log not found", { tradeId: trade.id });

    const offerAfterOpen = await getP2POffer(ids.privateOfferId);
    assertCondition(Boolean(offerAfterOpen), "Private offer not found after trade open");
    assertCondition(
        Math.abs(toNumber(offerAfterOpen!.availableAmount) - 8) < 0.0001,
        "Offer available amount was not decremented",
        { availableAmount: offerAfterOpen!.availableAmount },
    );

    const loadedRound2 = await getP2POfferNegotiation(round2.id);
    assertCondition(loadedRound2?.status === "accepted", "Accepted round not persisted", loadedRound2);

    console.log("[smoke:p2p-negotiation-lifecycle] PASS reject reason -> counter round -> accept/open -> escrow hold");
}

async function runModerationFlow(ids: ScenarioIds): Promise<void> {
    const publicOffer = await getP2POffer(ids.publicOfferId);
    assertCondition(publicOffer?.visibility === "public", "Expected public offer", publicOffer);
    assertCondition(publicOffer?.status === "pending_approval", "Public offer should start pending_approval", publicOffer);

    const rejected = await updateP2POffer(ids.publicOfferId, {
        status: "rejected",
        moderationReason: "Missing clear delivery SLA in terms.",
        reviewedBy: ids.adminId,
        reviewedAt: new Date(),
        approvedAt: null,
        rejectedAt: new Date(),
    });

    assertCondition(rejected?.status === "rejected", "Public moderation reject failed", rejected);
    assertCondition(
        String(rejected?.moderationReason || "").includes("delivery SLA"),
        "Public reject reason not persisted",
        rejected,
    );

    const resubmitted = await updateP2POffer(ids.publicOfferId, {
        status: "pending_approval",
        counterResponse: "Updated SLA and added refund fallback terms.",
        reviewedBy: null,
        reviewedAt: null,
        approvedAt: null,
        rejectedAt: null,
    });

    assertCondition(resubmitted?.status === "pending_approval", "Public offer resubmit failed", resubmitted);
    assertCondition(
        String(resubmitted?.counterResponse || "").includes("refund fallback"),
        "Public resubmit counter response missing",
        resubmitted,
    );

    const approved = await updateP2POffer(ids.publicOfferId, {
        status: "active",
        moderationReason: null,
        reviewedBy: ids.adminId,
        reviewedAt: new Date(),
        approvedAt: new Date(),
        rejectedAt: null,
    });

    assertCondition(approved?.status === "active", "Public moderation approve failed", approved);

    const privateOffer = await getP2POffer(ids.privateOfferId);
    assertCondition(privateOffer?.visibility === "private_friend", "Expected private_friend offer", privateOffer);
    assertCondition(privateOffer?.status === "active", "Private friend offer should stay active", privateOffer);

    console.log("[smoke:p2p-negotiation-lifecycle] PASS public reject/resubmit/approve and private moderation gating");
}

async function cleanup(ids: ScenarioIds): Promise<void> {
    const userIds = [ids.sellerId, ids.buyerId, ids.adminId].filter(Boolean);
    const offerIds = [ids.privateOfferId, ids.publicOfferId].filter(Boolean);
    const negotiationIds = [ids.negotiationRound1Id, ids.negotiationRound2Id].filter(Boolean);
    const tradeIds = [ids.tradeId].filter((v): v is string => Boolean(v));

    if (tradeIds.length > 0) {
        await safeDelete(`DELETE FROM p2p_transaction_logs WHERE trade_id = ANY($1::text[])`, [tradeIds]);
        await safeDelete(`DELETE FROM p2p_trade_messages WHERE trade_id = ANY($1::text[])`, [tradeIds]);
        await safeDelete(`DELETE FROM p2p_dispute_messages WHERE dispute_id IN (SELECT id FROM p2p_disputes WHERE trade_id = ANY($1::text[]))`, [tradeIds]);
        await safeDelete(`DELETE FROM p2p_disputes WHERE trade_id = ANY($1::text[])`, [tradeIds]);
        await safeDelete(`DELETE FROM p2p_escrow WHERE trade_id = ANY($1::text[])`, [tradeIds]);
        await safeDelete(`DELETE FROM p2p_trades WHERE id = ANY($1::text[])`, [tradeIds]);
    }

    if (offerIds.length > 0) {
        await safeDelete(`DELETE FROM p2p_offer_negotiations WHERE offer_id = ANY($1::text[])`, [offerIds]);
        await safeDelete(`DELETE FROM p2p_offers WHERE id = ANY($1::text[])`, [offerIds]);
    }

    if (negotiationIds.length > 0) {
        await safeDelete(`DELETE FROM p2p_offer_negotiations WHERE id = ANY($1::text[])`, [negotiationIds]);
    }

    if (userIds.length > 0) {
        await safeDelete(`DELETE FROM transactions WHERE user_id = ANY($1::text[])`, [userIds]);
        await safeDelete(`DELETE FROM p2p_trader_profiles WHERE user_id = ANY($1::text[])`, [userIds]);
        await safeDelete(`DELETE FROM users WHERE id = ANY($1::text[])`, [userIds]);
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv);
    const ids: ScenarioIds = {
        sellerId: crypto.randomUUID(),
        buyerId: crypto.randomUUID(),
        adminId: crypto.randomUUID(),
        privateOfferId: "",
        publicOfferId: "",
        tradeId: null,
        negotiationRound1Id: "",
        negotiationRound2Id: "",
    };

    try {
        await setupScenario(ids);
        await runNegotiationAndTradeFlow(ids);
        await runModerationFlow(ids);

        console.log("[smoke:p2p-negotiation-lifecycle] PASS full scenario");
    } catch (error) {
        console.error("[smoke:p2p-negotiation-lifecycle] FAIL", error);
        throw error;
    } finally {
        try {
            if (!options.keepData) {
                await cleanup(ids);
            }
        } finally {
            await closePool();
        }
    }
}

main().catch((error) => {
    const details = error && typeof error === "object" && "details" in error
        ? (error as { details?: unknown }).details
        : undefined;

    if (details !== undefined) {
        console.error("[smoke:p2p-negotiation-lifecycle] details", details);
    }

    process.exit(1);
});
