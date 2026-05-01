import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import {
    agentTrafficRules,
    agentRequestAssignments,
    agents,
    type Agent,
    type AgentTrafficRule,
} from "@shared/schema";
import { db } from "../../db";
import { normalizeCurrencyCode } from "../../lib/p2p-currency-controls";

export interface AgentRoutingContext {
    requestType: "deposit" | "withdraw";
    currency?: string | null;
    country?: string | null;
}

export interface SelectedAgentRoute {
    agent: Agent;
    rule: AgentTrafficRule | null;
}

const DEFAULT_TRAFFIC_WEIGHT = 100;
const MAX_TRAFFIC_WEIGHT = 10_000;

function normalizeCountryCode(country: string | null | undefined): string | null {
    if (!country) return null;
    const code = country.trim().toUpperCase();
    if (!code) return null;
    return code.length <= 2 ? code : code.slice(0, 2);
}

function safeNumber(value: unknown, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function getAgentLoadScore(agent: Agent): number {
    const concurrent = Math.max(0, safeNumber(agent.maxConcurrentRequests, 5));
    const traffic = Math.max(0, safeNumber(agent.trafficWeight, DEFAULT_TRAFFIC_WEIGHT));
    const assigned = Math.max(0, safeNumber(agent.assignedCustomersCount, 0));
    const performance = Math.max(0, safeNumber(agent.performanceScore, 100));
    const balance = Math.max(0, safeNumber(agent.currentBalance, 0));
    const warn = Math.max(1, safeNumber(agent.balanceWarnThreshold, 150));

    const balanceHealth = Math.min(1, balance / warn);
    const capacityFactor = concurrent / (assigned + 1);
    const performanceFactor = performance / 100;

    return (traffic * 0.35) + (capacityFactor * 100 * 0.35) + (balanceHealth * 100 * 0.15) + (performanceFactor * 100 * 0.15);
}

async function countPendingAssignments(agentId: string, requestType: AgentRoutingContext["requestType"]): Promise<number> {
    const [row] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(agentRequestAssignments)
        .where(and(
            eq(agentRequestAssignments.agentId, agentId),
            eq(agentRequestAssignments.requestType, requestType),
            eq(agentRequestAssignments.responseAction, "pending"),
        ));

    return Number(row?.count ?? 0);
}

export async function listActiveAgentTrafficRules(): Promise<AgentTrafficRule[]> {
    return db.select().from(agentTrafficRules).where(eq(agentTrafficRules.isActive, true));
}

function ruleMatchesContext(rule: AgentTrafficRule, context: AgentRoutingContext): boolean {
    const normalizedCurrency = normalizeCurrencyCode(context.currency);
    const normalizedCountry = normalizeCountryCode(context.country);

    if (normalizedCurrency && normalizeCurrencyCode(rule.currency) !== normalizedCurrency) {
        return false;
    }

    if (rule.country !== "*" && normalizedCountry && rule.country.trim().toUpperCase() !== normalizedCountry) {
        return false;
    }

    if (rule.country !== "*" && !normalizedCountry) {
        return false;
    }

    return true;
}

async function getCandidateAgents(context: AgentRoutingContext): Promise<SelectedAgentRoute[]> {
    const rules = await listActiveAgentTrafficRules();

    const [allAgents] = await Promise.all([
        db.select().from(agents).where(eq(agents.isActive, true)),
    ]);

    const candidates: SelectedAgentRoute[] = [];
    for (const agent of allAgents) {
        if (!agent.isActive || agent.isOnline === false) {
            continue;
        }

        if (agent.awayMode) {
            continue;
        }

        const pendingCount = await countPendingAssignments(agent.id, context.requestType);
        if (pendingCount >= Math.max(1, safeNumber(agent.maxConcurrentRequests, 5))) {
            continue;
        }

        const matchingRule = rules.find((rule) => rule.agentId === agent.id && ruleMatchesContext(rule, context));
        if (matchingRule || rules.length === 0) {
            candidates.push({ agent, rule: matchingRule ?? null });
            continue;
        }

        // If there are rules configured globally but none for this agent, still
        // allow the agent when it is generally available so old deployments keep
        // functioning. The agent's own weight will keep it from dominating.
        if (rules.length > 0) {
            candidates.push({ agent, rule: null });
        }
    }

    return candidates;
}

function weightedPick(routes: SelectedAgentRoute[]): SelectedAgentRoute | null {
    if (routes.length === 0) return null;

    const pool = routes.map((route) => {
        const baseWeight = Math.max(1, safeNumber(route.agent.trafficWeight, DEFAULT_TRAFFIC_WEIGHT));
        const ruleWeight = route.rule ? Math.max(1, safeNumber(route.rule.weight, DEFAULT_TRAFFIC_WEIGHT)) : DEFAULT_TRAFFIC_WEIGHT;
        const loadScore = getAgentLoadScore(route.agent);
        const effectiveWeight = Math.max(
            1,
            Math.round((baseWeight * 0.6) + (ruleWeight * 0.4) - (loadScore * 0.15)),
        );
        return { route, effectiveWeight };
    });

    const total = pool.reduce((sum, entry) => sum + entry.effectiveWeight, 0);
    if (total <= 0) {
        return pool[0]?.route ?? null;
    }

    let cursor = Math.floor(Math.random() * total);
    for (const entry of pool) {
        cursor -= entry.effectiveWeight;
        if (cursor < 0) {
            return entry.route;
        }
    }

    return pool[0]?.route ?? null;
}

/**
 * Select a live agent for routing a request.
 * Preference order:
 * 1) Active + online + not away
 * 2) Matches traffic rules for the request's currency/country
 * 3) Lower pending queue / capacity pressure
 * 4) Higher configured traffic weight
 */
export async function selectAgentForRouting(context: AgentRoutingContext): Promise<SelectedAgentRoute | null> {
    const candidates = await getCandidateAgents(context);
    return weightedPick(candidates);
}
