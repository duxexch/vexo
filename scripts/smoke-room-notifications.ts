/**
 * Smoke checks for room (challenge / game-room) chat fan-out + per-recipient
 * suppression — Task #30.
 *
 * Why a smoke instead of a unit-test framework: this project doesn't run
 * jest/vitest. The `quality:smoke:*` pattern (see
 * `scripts/smoke-dm-notifications.ts`) keeps these checks runnable from
 * `verify:fast` / `quality:gate:phase-e` with no extra tooling.
 *
 * What's covered (mirrors the DM smoke layout):
 *   1. Helper-level suppression rule:
 *      - allowed (no blocks/mutes)
 *      - sender blocked recipient → suppressed
 *      - recipient blocked sender → suppressed
 *      - recipient muted sender (mutedUsers) → suppressed
 *      - sender always receives their own echo
 *   2. Broadcast payload assembly: every required `ChatBroadcast`
 *      field is populated, optional flags omitted when falsy.
 *   3. Real-bridge integration via DI: a 4-socket room (sender + 3
 *      recipients with different suppression states) → assert exactly
 *      the right sockets received the emit AND every emit carried the
 *      same canonical broadcast payload (the room-chat equivalent of
 *      the DM "transport parity" guarantee — every recipient sees the
 *      same message).
 *
 * Stubs out DB / Redis / Socket.IO so it runs in milliseconds and
 * stays out of the way of the real database / push services.
 */

import {
  buildRoomChatBroadcast,
  shouldDeliverRoomChatToRecipient,
} from "../server/lib/room-chat-payload";
import {
  deliverRealtimeChallengeChat,
  type ChallengeChatDeps,
} from "../server/socketio/challenge-chat-bridge";
import { createErrorHelpers } from "./lib/smoke-helpers";

const { fail, assertCondition } = createErrorHelpers("RoomNotificationsSmokeError");

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    fail(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function logPass(message: string): void {
  console.log(`[smoke:room-notifications] PASS ${message}`);
}

// ---- 1. Per-recipient suppression rule ------------------------------------

function testSuppressionRule(): void {
  const SENDER = "u-sender";
  const RECIPIENT = "u-recipient";

  assertCondition(
    shouldDeliverRoomChatToRecipient({
      recipientId: RECIPIENT,
      senderId: SENDER,
      senderBlockedUsers: [],
      recipientBlockedUsers: [],
      recipientMutedUsers: [],
    }),
    "Allowed recipient must receive room-chat broadcast",
  );

  assertCondition(
    shouldDeliverRoomChatToRecipient({
      recipientId: SENDER,
      senderId: SENDER,
      senderBlockedUsers: [],
      recipientBlockedUsers: [],
      recipientMutedUsers: [],
    }),
    "Sender must always receive their own echo",
  );

  assertCondition(
    !shouldDeliverRoomChatToRecipient({
      recipientId: RECIPIENT,
      senderId: SENDER,
      senderBlockedUsers: [RECIPIENT],
      recipientBlockedUsers: [],
      recipientMutedUsers: [],
    }),
    "Sender-blocked recipient must NOT receive broadcast",
  );

  assertCondition(
    !shouldDeliverRoomChatToRecipient({
      recipientId: RECIPIENT,
      senderId: SENDER,
      senderBlockedUsers: [],
      recipientBlockedUsers: [SENDER],
      recipientMutedUsers: [],
    }),
    "Recipient-who-blocked-sender must NOT receive broadcast",
  );

  assertCondition(
    !shouldDeliverRoomChatToRecipient({
      recipientId: RECIPIENT,
      senderId: SENDER,
      senderBlockedUsers: [],
      recipientBlockedUsers: [],
      recipientMutedUsers: [SENDER],
    }),
    "Recipient-who-muted-sender (mutedUsers) must NOT receive broadcast",
  );

  logPass("suppression rule covers sender-block, recipient-block, recipient-mute, and self-echo");
}

// ---- 2. Broadcast payload assembly ---------------------------------------

function testBroadcastAssembly(): void {
  const baseTs = 1_700_000_000_000;

  // (a) Minimal text message — optional flags omitted.
  {
    const b = buildRoomChatBroadcast({
      roomId: "room-1",
      senderId: "u-1",
      senderUsername: "alice",
      text: "hello",
      ts: baseTs,
      isSpectator: false,
      isQuickMessage: false,
      wasFiltered: false,
    });
    assertEqual(b.roomId, "room-1", "broadcast.roomId");
    assertEqual(b.fromUserId, "u-1", "broadcast.fromUserId");
    assertEqual(b.fromUsername, "alice", "broadcast.fromUsername");
    assertEqual(b.text, "hello", "broadcast.text");
    assertEqual(b.ts, baseTs, "broadcast.ts");
    assertEqual(b.clientMsgId, undefined, "broadcast.clientMsgId omitted");
    assertEqual(b.isSpectator, false, "broadcast.isSpectator");
    assertEqual(b.isQuickMessage, undefined, "broadcast.isQuickMessage omitted when false");
    assertEqual(b.quickMessageKey, undefined, "broadcast.quickMessageKey omitted");
    assertEqual(b.wasFiltered, undefined, "broadcast.wasFiltered omitted when false");
    logPass("broadcast assembly: minimal text payload — optional flags omitted");
  }

  // (b) Quick message + spectator + filtered.
  {
    const b = buildRoomChatBroadcast({
      roomId: "room-2",
      senderId: "u-2",
      senderUsername: "bob",
      text: "***",
      ts: baseTs + 1,
      clientMsgId: "cmsg-9",
      isSpectator: true,
      isQuickMessage: true,
      quickMessageKey: "GG",
      wasFiltered: true,
    });
    assertEqual(b.clientMsgId, "cmsg-9", "broadcast.clientMsgId echoed");
    assertEqual(b.isSpectator, true, "broadcast.isSpectator true");
    assertEqual(b.isQuickMessage, true, "broadcast.isQuickMessage true");
    assertEqual(b.quickMessageKey, "GG", "broadcast.quickMessageKey echoed");
    assertEqual(b.wasFiltered, true, "broadcast.wasFiltered true");
    logPass("broadcast assembly: full payload (quick / spectator / filtered)");
  }
}

// ---- 3. Real-bridge integration via DI -----------------------------------
//
// Drives the real `deliverRealtimeChallengeChat` entry point with stub
// deps so we exercise the actual fan-out site. Sets up a 4-socket room
// (sender + 3 recipients in different suppression states) and asserts
// each socket was emitted to (or not) according to the rule, AND that
// every emit carried the same canonical broadcast payload.

interface CapturedEmit {
  recipientId: string;
  event: string;
  payload: unknown;
}

function makeRoomNs(socketUserIds: string[]): {
  ns: Parameters<typeof deliverRealtimeChallengeChat>[0]["chatNs"];
  emitted: CapturedEmit[];
} {
  const emitted: CapturedEmit[] = [];
  const sockets = socketUserIds.map((rid) => ({
    data: { userId: rid },
    emit: (event: string, payload: unknown) => {
      emitted.push({ recipientId: rid, event, payload });
    },
  }));
  const ns = {
    in(_room: string) {
      return {
        async fetchSockets() {
          return sockets;
        },
      };
    },
  } as unknown as Parameters<typeof deliverRealtimeChallengeChat>[0]["chatNs"];
  return { ns, emitted };
}

function makeChallengeDeps(opts: {
  // Per-recipient lists keyed by user id.
  lists: Record<
    string,
    { blockedUsers?: string[]; mutedUsers?: string[] }
  >;
}): ChallengeChatDeps {
  return {
    fetchChallengeSession: async () => ({ id: "session-1" }),
    fetchSender: async (senderId) => ({
      id: senderId,
      username: "alice",
      avatarUrl: null,
    }),
    insertChallengeChatMessage: async () => ({
      id: "ch-msg-1",
      createdAt: new Date(1_700_000_000_000),
    }),
    getCachedUserBlockLists: (async (id, fetcher) => {
      const u = await fetcher(id);
      return u ?? { blockedUsers: [], mutedUsers: [] };
    }) as ChallengeChatDeps["getCachedUserBlockLists"],
    getUser: (async (id: string) => {
      const lists = opts.lists[id] ?? {};
      return {
        id,
        username: id,
        blockedUsers: lists.blockedUsers ?? [],
        mutedUsers: lists.mutedUsers ?? [],
      } as unknown as Awaited<ReturnType<ChallengeChatDeps["getUser"]>>;
    }) as ChallengeChatDeps["getUser"],
  };
}

async function testBridgeIntegration(): Promise<void> {
  const SENDER = "u-sender";
  const ALLOWED = "u-allowed";
  const SENDER_BLOCKED = "u-sender-blocked"; // sender has them in blocked list
  const RECIPIENT_BLOCKED = "u-recipient-blocked"; // they have sender in blocked list
  const RECIPIENT_MUTED = "u-recipient-muted"; // they have sender in muted list

  const { ns, emitted } = makeRoomNs([
    SENDER,
    ALLOWED,
    SENDER_BLOCKED,
    RECIPIENT_BLOCKED,
    RECIPIENT_MUTED,
  ]);

  const deps = makeChallengeDeps({
    lists: {
      [SENDER]: { blockedUsers: [SENDER_BLOCKED], mutedUsers: [] },
      [ALLOWED]: { blockedUsers: [], mutedUsers: [] },
      [SENDER_BLOCKED]: { blockedUsers: [], mutedUsers: [] },
      [RECIPIENT_BLOCKED]: { blockedUsers: [SENDER], mutedUsers: [] },
      [RECIPIENT_MUTED]: { blockedUsers: [], mutedUsers: [SENDER] },
    },
  });

  const result = await deliverRealtimeChallengeChat(
    {
      challengeId: "ch-1",
      roomId: "challenge:ch-1",
      senderId: SENDER,
      senderUsernameFallback: "alice",
      text: "GG everyone!",
      isQuickMessage: false,
      isSpectator: false,
      clientMsgId: "cmsg-room-1",
      chatNs: ns,
    },
    deps,
  );
  assertCondition(result.ok, "Bridge delivery should succeed", result);

  const recipients = emitted.map((e) => e.recipientId).sort();
  // Sender always gets their echo; allowed peer gets it; the three
  // suppressed peers do NOT.
  assertEqual(
    recipients.join(","),
    [SENDER, ALLOWED].sort().join(","),
    "Bridge integration: only sender + allowed recipient receive the emit",
  );

  // Lock the wire event name — guards against accidental rename to
  // `chat:new` / `message` / etc. from a future refactor.
  for (const e of emitted) {
    assertEqual(e.event, "chat:message", "Bridge integration: emitted event name");
  }

  // Every emit must carry the same canonical broadcast payload (the
  // room-chat equivalent of the DM payload-parity check). Comparing
  // serialized payloads catches any per-recipient drift in fields
  // like ts / fromUsername / wasFiltered.
  const serialized = emitted.map((e) => JSON.stringify(e.payload));
  const uniquePayloads = new Set(serialized);
  assertEqual(
    uniquePayloads.size,
    1,
    "Bridge integration: every recipient must receive the same broadcast payload",
  );

  // Spot-check the canonical payload's required fields.
  const sample = emitted[0].payload as {
    roomId: string;
    fromUserId: string;
    fromUsername: string;
    text: string;
    clientMsgId?: string;
  };
  assertEqual(sample.roomId, "challenge:ch-1", "Bridge payload: roomId");
  assertEqual(sample.fromUserId, SENDER, "Bridge payload: fromUserId");
  assertEqual(sample.fromUsername, "alice", "Bridge payload: fromUsername");
  assertEqual(sample.text, "GG everyone!", "Bridge payload: text");
  assertEqual(sample.clientMsgId, "cmsg-room-1", "Bridge payload: clientMsgId echoed");

  logPass("bridge integration: 5-socket room — only sender + allowed peer receive identical payload");
}

async function testBridgeIgnoresAnonymousSocket(): Promise<void> {
  // Sockets with no `data.userId` (e.g. half-handshaked / disconnecting)
  // must be skipped entirely — emitting to them would NPE on the
  // recipient lookup. Guards the `if (!rid) continue;` short-circuit.
  const SENDER = "u-with-id";
  const emitted: CapturedEmit[] = [];
  const sockets = [
    {
      data: { userId: SENDER },
      emit: (event: string, payload: unknown) =>
        emitted.push({ recipientId: SENDER, event, payload }),
    },
    // Anonymous socket — no userId.
    {
      data: {},
      emit: (event: string, payload: unknown) =>
        emitted.push({ recipientId: "<anon>", event, payload }),
    },
  ];
  const ns = {
    in(_room: string) {
      return {
        async fetchSockets() {
          return sockets;
        },
      };
    },
  } as unknown as Parameters<typeof deliverRealtimeChallengeChat>[0]["chatNs"];

  const deps = makeChallengeDeps({ lists: { [SENDER]: {} } });
  const result = await deliverRealtimeChallengeChat(
    {
      challengeId: "ch-anon",
      roomId: "challenge:ch-anon",
      senderId: SENDER,
      senderUsernameFallback: "alice",
      text: "hello",
      isQuickMessage: false,
      isSpectator: false,
      chatNs: ns,
    },
    deps,
  );
  assertCondition(result.ok, "Anonymous-socket delivery should succeed", result);
  const recipients = emitted.map((e) => e.recipientId);
  assertCondition(
    !recipients.includes("<anon>"),
    "Anonymous (no-userId) socket must NOT receive an emit",
  );
  assertEqual(recipients.length, 1, "Only the identified sender socket should receive the echo");
  logPass("bridge integration: anonymous (no userId) socket skipped");
}

async function testBridgeEmptyRoomEdges(): Promise<void> {
  // Room with only the sender (no other peers) — sender still gets echo.
  {
    const SENDER = "u-only-sender";
    const { ns, emitted } = makeRoomNs([SENDER]);
    const deps = makeChallengeDeps({ lists: { [SENDER]: {} } });
    const result = await deliverRealtimeChallengeChat(
      {
        challengeId: "ch-2",
        roomId: "challenge:ch-2",
        senderId: SENDER,
        senderUsernameFallback: "alice",
        text: "anyone here?",
        isQuickMessage: false,
        isSpectator: false,
        chatNs: ns,
      },
      deps,
    );
    assertCondition(result.ok, "Solo-sender delivery should succeed", result);
    assertEqual(emitted.length, 1, "Solo-sender room: sender still gets their own echo");
    assertEqual(
      emitted[0].recipientId,
      SENDER,
      "Solo-sender room: echo addressed to sender",
    );
    logPass("bridge integration: solo-sender room — sender still receives echo");
  }

  // Empty/whitespace text → reason:"empty", no emit, no insert.
  {
    const SENDER = "u-empty";
    const { ns, emitted } = makeRoomNs([SENDER, "u-other"]);
    let inserted = false;
    const deps: ChallengeChatDeps = {
      ...makeChallengeDeps({ lists: {} }),
      insertChallengeChatMessage: async () => {
        inserted = true;
        return { id: "x", createdAt: new Date() };
      },
    };
    const result = await deliverRealtimeChallengeChat(
      {
        challengeId: "ch-3",
        roomId: "challenge:ch-3",
        senderId: SENDER,
        senderUsernameFallback: "alice",
        text: "   ",
        isQuickMessage: false,
        isSpectator: false,
        chatNs: ns,
      },
      deps,
    );
    assertCondition(!result.ok, "Empty text must NOT succeed");
    assertEqual(result.reason, "empty", "Empty text reason should be 'empty'");
    assertEqual(emitted.length, 0, "Empty text must NOT emit anything");
    assertCondition(!inserted, "Empty text must NOT persist a message");
    logPass("bridge integration: empty text — short-circuits without insert or emit");
  }
}

async function main(): Promise<void> {
  testSuppressionRule();
  testBroadcastAssembly();
  await testBridgeIntegration();
  await testBridgeIgnoresAnonymousSocket();
  await testBridgeEmptyRoomEdges();
  console.log("[smoke:room-notifications] OK — all checks passed");
}

main()
  .then(() => {
    // Importing the realtime bridge transitively pulls in `db` /
    // `storage`, which open long-lived DB pools. Exit explicitly so
    // the smoke ends after the last assertion (mirrors how
    // `smoke-dm-notifications.ts` ends).
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
