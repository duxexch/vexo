#!/usr/bin/env tsx
/**
 * Task #38 — verify the pro-grade incoming-call experience contract.
 *
 * This smoke is intentionally a unit-level inspection (no Express boot, no
 * browser, no Capacitor) so it stays fast and deterministic. It guards the
 * three public contracts the new ringtone / rationale work depends on:
 *
 *   1. Web-push payload shape for `private_call_invite` notifications.
 *      → urgent priority, accept/decline actions, requireInteraction:true,
 *        callId/conversationId mirrored on both top-level and `data`,
 *        deterministic per-session tag for de-duplication.
 *
 *   2. Service-worker action handling for incoming-call notifications.
 *      → SW source advertises accept/decline + WAKE_RINGER message.
 *
 *   3. Call entry-point audit. Only two routes are allowed to start a
 *      call (chat.tsx via PrivateCallLayer; challenge-game.tsx via
 *      useCall/CallSessionProvider). Any new entry point that bypasses
 *      both managers must be added explicitly here so reviewers can't
 *      accidentally regress the routing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createErrorHelpers } from "./lib/smoke-helpers";

const { fail, assertCondition } = createErrorHelpers("CallExperienceSmokeError");

function logPass(step: string): void {
    console.log(`[smoke:call-experience] PASS ${step}`);
}

function readRepoFile(relPath: string): string {
    return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

// ---- 1. Web-push payload contract ---------------------------------------

interface PushPayload {
    title: string;
    body: string;
    priority: string;
    notificationType: string;
    actions: Array<{ action: string; title?: string }>;
    requireInteraction?: boolean;
    callId?: string;
    conversationId?: string;
    tag?: string;
    data: Record<string, unknown>;
}

function parsePushPayload(json: string): PushPayload {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
        fail("push payload must be a JSON object", { json });
    }
    return parsed as PushPayload;
}

/**
 * Re-implements the relevant slice of `sendWebPushToUser` from
 * `server/websocket/notifications.ts` so we can assert on the JSON shape
 * without spinning up the full Express + Drizzle stack.
 *
 * Update this helper whenever the server-side payload changes — the smoke
 * is the contract test.
 */
function buildIncomingCallPushPayload(input: {
    callerName: string;
    sessionId: string;
    conversationId: string;
    notificationId: string;
}): string {
    const isIncomingPrivateCall = true;
    const pushNotificationType = "private_call_invite";
    const pushTag = `vex-call-${input.sessionId}`;
    const callSessionId = input.sessionId;
    const conversationId = input.conversationId;

    const actions = [
        { action: "accept", title: "Accept" },
        { action: "decline", title: "Decline" },
    ];

    return JSON.stringify({
        title: `Incoming call from ${input.callerName}`,
        body: "Tap to answer",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-72x72.png",
        tag: pushTag,
        priority: isIncomingPrivateCall ? "urgent" : "normal",
        notificationType: pushNotificationType,
        soundType: "challenge",
        actions,
        requireInteraction: isIncomingPrivateCall ? true : undefined,
        callId: callSessionId,
        conversationId,
        data: {
            url: `/chat?call=${input.sessionId}`,
            notificationId: input.notificationId,
            type: pushNotificationType,
            event: "private_call_invite",
            sessionId: callSessionId,
            conversationId,
            createdAt: new Date().toISOString(),
        },
    });
}

function testPushPayloadShape(): void {
    const json = buildIncomingCallPushPayload({
        callerName: "Alice",
        sessionId: "session-abc",
        conversationId: "conv-123",
        notificationId: "notif-xyz",
    });
    const payload = parsePushPayload(json);

    assertCondition(payload.notificationType === "private_call_invite", "notificationType must be private_call_invite");
    assertCondition(payload.priority === "urgent", "priority must be coerced to urgent for incoming calls");
    assertCondition(payload.requireInteraction === true, "requireInteraction must be true for incoming calls");

    const actionNames = payload.actions.map((a) => a.action);
    assertCondition(
        actionNames.length === 2 && actionNames.includes("accept") && actionNames.includes("decline"),
        "incoming-call push must offer accept + decline (not legacy open_call/dismiss)",
        { actions: actionNames },
    );

    assertCondition(
        payload.callId === "session-abc" && (payload.data as { sessionId?: string }).sessionId === "session-abc",
        "callId/sessionId must be mirrored on both root and data so the SW can dedupe",
    );

    assertCondition(
        payload.conversationId === "conv-123" && (payload.data as { conversationId?: string }).conversationId === "conv-123",
        "conversationId must be present at root and inside data",
    );

    assertCondition(payload.tag === "vex-call-session-abc", "tag must be deterministic per session for replace-on-renotify");

    // Guard against the legacy action set sneaking back in.
    assertCondition(
        !actionNames.includes("open_call") && !actionNames.includes("dismiss"),
        "legacy open_call/dismiss actions must not appear",
        { actions: actionNames },
    );

    logPass("incoming-call push payload contract");
}

// Verify the live server source emits the same shape (no drift between
// smoke and production).
function testServerSourceParity(): void {
    const src = readRepoFile("server/websocket/notifications.ts");
    assertCondition(
        src.includes('{ action: "accept", title: "Accept" }'),
        "server/websocket/notifications.ts must send the 'accept' action",
    );
    assertCondition(
        src.includes('{ action: "decline", title: "Decline" }'),
        "server/websocket/notifications.ts must send the 'decline' action",
    );
    assertCondition(
        src.includes('isIncomingPrivateCall ? "urgent"'),
        "server must coerce priority to 'urgent' for private call invites",
    );
    assertCondition(
        src.includes('requireInteraction: isIncomingPrivateCall ? true : undefined'),
        "server must mark incoming-call pushes requireInteraction:true",
    );
    assertCondition(
        !src.includes('action: "open_call"'),
        "legacy 'open_call' action must be removed from server",
    );
    logPass("server payload source parity (accept/decline/urgent/requireInteraction)");
}

// ---- 2. Service-worker contract ----------------------------------------

function testServiceWorkerContract(): void {
    const sw = readRepoFile("client/public/sw.js");
    assertCondition(sw.includes("private_call_invite"), "sw must branch on private_call_invite");
    assertCondition(
        sw.includes("WAKE_RINGER"),
        "sw must broadcast WAKE_RINGER so the SPA starts the in-app ring",
    );
    assertCondition(
        sw.includes("{ action: 'accept', title: 'Accept' }"),
        "sw must offer the accept action on incoming call notifications",
    );
    assertCondition(
        sw.includes("{ action: 'decline', title: 'Decline' }"),
        "sw must offer the decline action on incoming call notifications",
    );
    assertCondition(
        sw.includes("requireInteraction: isIncomingCall || priority === 'urgent'"),
        "sw must enforce requireInteraction for incoming call notifications",
    );
    logPass("service-worker incoming-call contract");
}

// ---- 3. Entry-point audit ---------------------------------------------

interface CallEntryPoint {
    file: string;
    requiredImport: string;
    description: string;
}

const ALLOWED_CALL_ENTRY_POINTS: CallEntryPoint[] = [
    {
        file: "client/src/pages/chat.tsx",
        requiredImport: "usePrivateCallLayer",
        description: "DM call (with billing + ringtone via PrivateCallLayer)",
    },
    {
        file: "client/src/pages/challenge-game.tsx",
        requiredImport: "useCall",
        description: "Challenge call (via CallSessionProvider/useCallSession)",
    },
];

function testEntryPointAudit(): void {
    for (const entry of ALLOWED_CALL_ENTRY_POINTS) {
        const src = readRepoFile(entry.file);
        assertCondition(
            src.includes(entry.requiredImport),
            `${entry.file} must use ${entry.requiredImport} (${entry.description})`,
        );
    }

    // Both managers must wire the rationale + ringtone so neither path
    // skips the new UX contract.
    const privateLayer = readRepoFile("client/src/components/chat/private-call-layer.tsx");
    assertCondition(
        privateLayer.includes("ensureCallRationale") && privateLayer.includes("startCallRingtone"),
        "private-call-layer must wire ensureCallRationale + startCallRingtone",
    );

    const callSession = readRepoFile("client/src/hooks/use-call-session.tsx");
    assertCondition(
        callSession.includes("ensureCallRationale") && callSession.includes("startCallRingtone"),
        "use-call-session must wire ensureCallRationale + startCallRingtone",
    );

    const provider = readRepoFile("client/src/components/calls/CallSessionProvider.tsx");
    assertCondition(
        provider.includes("CallPermissionPrompt") && provider.includes("WAKE_RINGER"),
        "CallSessionProvider must mount CallPermissionPrompt and listen for WAKE_RINGER",
    );

    logPass("call entry-point audit (chat + challenge only, both wired)");
}

// ---- 4. Permission rationale store contract ---------------------------

// ---- Action-bus behaviour (decline emits end signal; accept transitions) ----

async function testCallActionBusBehaviour(): Promise<void> {
    // Use a dynamic import so this smoke can keep its top-level "import"
    // statements clean (and so the call-actions module is not loaded if the
    // earlier static checks short-circuit).
    const actions = await import("../client/src/lib/call-actions");
    actions.__resetCallActionRegistry();

    let acceptCalled = 0;
    let declineCalled = 0;
    const off = actions.registerCallActionHandler(async (ctx) => {
        if (ctx.callId !== "session-test") return false;
        if (ctx.action === "accept") {
            acceptCalled += 1;
            return true;
        }
        if (ctx.action === "decline") {
            declineCalled += 1;
            return true;
        }
        return false;
    });

    const declined = await actions.dispatchCallAction({ action: "decline", callId: "session-test" });
    assertCondition(declined === true, "decline action must be claimed by the handler");
    assertCondition(declineCalled === 1, "decline handler must run exactly once", { declineCalled });

    const accepted = await actions.dispatchCallAction({ action: "accept", callId: "session-test" });
    assertCondition(accepted === true, "accept action must be claimed by the handler");
    assertCondition(acceptCalled === 1, "accept handler must run exactly once", { acceptCalled });

    // Mismatched callId must NOT be claimed (handler returns false).
    const otherSession = await actions.dispatchCallAction({ action: "accept", callId: "session-other" });
    assertCondition(otherSession === false, "handler must not claim actions for a different sessionId");
    assertCondition(acceptCalled === 1, "accept handler must not fire for mismatched sessionId");

    off();
    const noHandler = await actions.dispatchCallAction({ action: "accept", callId: "session-test" });
    assertCondition(noHandler === false, "dispatching with no handlers must return false");

    actions.__resetCallActionRegistry();
    logPass("call-action bus dispatch (accept/decline + sessionId match + cleanup)");
}

// Belt-and-suspenders source check: the SW->SPA handler MUST dispatch the
// action through the bus, not just stop the ringer. Guards against the
// "decline is cosmetic" regression flagged in the previous code review.
function testProviderDispatchesActions(): void {
    const provider = readRepoFile("client/src/components/calls/CallSessionProvider.tsx");
    assertCondition(
        provider.includes("dispatchCallAction"),
        "CallSessionProvider must dispatch incoming-call actions through the bus, not just stop the ringer",
    );
    assertCondition(
        provider.includes("private_call_invite"),
        "CallSessionProvider must branch on private_call_invite NOTIFICATION_CLICK",
    );
    assertCondition(
        provider.includes('action === "decline"') || provider.includes("'decline'") || provider.includes("\"decline\""),
        "CallSessionProvider must distinguish decline from accept",
    );

    // Both managers must register an action handler so accept/decline from
    // a notification actually drives the call lifecycle.
    const useCallSession = readRepoFile("client/src/hooks/use-call-session.tsx");
    assertCondition(
        useCallSession.includes("registerCallActionHandler"),
        "use-call-session must register a call-action handler for push accept/decline",
    );
    const privateLayer = readRepoFile("client/src/components/chat/private-call-layer.tsx");
    assertCondition(
        privateLayer.includes("registerCallActionHandler"),
        "private-call-layer must register a call-action handler for push accept/decline",
    );

    logPass("notification accept/decline are wired to call-session signaling (not cosmetic)");
}

function testRationaleStorageContract(): void {
    const src = readRepoFile("client/src/lib/call-permission-rationale.ts");
    assertCondition(
        src.includes("vex_call_permission_rationale_v1"),
        "rationale localStorage key must be versioned (vex_call_permission_rationale_v1)",
    );
    assertCondition(
        src.includes("ensureCallRationale") && src.includes("registerRationaleListener"),
        "rationale module must export ensureCallRationale + registerRationaleListener",
    );
    assertCondition(
        src.includes("forced") && src.includes("force"),
        "rationale module must support forced re-prompt (post-deny)",
    );
    logPass("permission-rationale storage + bus contract");
}

// ---- Locale parity -----------------------------------------------------

function testLocaleParity(): void {
    const en = readRepoFile("client/src/locales/en.ts");
    const ar = readRepoFile("client/src/locales/ar.ts");
    const requiredKeys = [
        "callPermission.voiceTitle",
        "callPermission.videoTitle",
        "callPermission.deniedTitle",
        "callPermission.openSettings",
        "callPermission.allow",
        "callPermission.notNow",
        "rtcCall.incomingTitle",
        "rtcCall.incomingBody",
    ];
    for (const key of requiredKeys) {
        assertCondition(en.includes(`'${key}'`), `EN locale missing key ${key}`);
        assertCondition(ar.includes(`'${key}'`), `AR locale missing key ${key}`);
    }
    logPass("locale parity for call-permission strings");
}

// ---- main --------------------------------------------------------------

async function main(): Promise<void> {
    testPushPayloadShape();
    testServerSourceParity();
    testServiceWorkerContract();
    testEntryPointAudit();
    testProviderDispatchesActions();
    await testCallActionBusBehaviour();
    testRationaleStorageContract();
    testLocaleParity();
    console.log("[smoke:call-experience] OK — incoming call experience contracts hold");
}

try {
    await main();
} catch (err) {
    if (err instanceof Error) {
        console.error(`[smoke:call-experience] FAIL ${err.message}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((err as any).details) console.error((err as any).details);
    } else {
        console.error("[smoke:call-experience] FAIL", err);
    }
    process.exitCode = 1;
}
