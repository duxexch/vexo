import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatViewerListPayload } from "../shared/socketio-events";

// Task #109: integration coverage for the casual gameplay surface
// (`InGameChat` in client/src/pages/play.tsx). The pill on that surface
// is fed by `chat:viewer_count` / `chat:viewer_list` events from the
// server, but the broadcast helpers used to early-return for any room
// id that didn't start with `challenge:`. After Task #109, casual
// matches subscribe to `match:<gameMatchId>` instead, so both helpers
// must also broadcast for that prefix — otherwise the pill would never
// appear regardless of how many spectators were watching.
//
// These tests deliberately mirror the structure of
// `chat-viewer-list-broadcast.test.ts` so the casual-room contract is
// exercised end-to-end against the real bridge module (mocks only the
// DB, Redis, and storage edges).

type BlockListsCacheLoader = (
  userId: string,
) => Promise<{ blockedUsers: string[]; mutedUsers: string[] } | null>;
type GetCachedBlockLists = (
  userId: string,
  loader: BlockListsCacheLoader,
) => Promise<{ blockedUsers: string[]; mutedUsers: string[] }>;
type StorageGetUser = (id: string) => Promise<unknown>;
type DbWhereStub = (...args: unknown[]) => Promise<
  Array<{ id: string; username: string | null; profilePicture: string | null }>
>;

const mockGetCachedUserBlockLists =
  vi.fn<Parameters<GetCachedBlockLists>, ReturnType<GetCachedBlockLists>>();
const mockStorageGetUser =
  vi.fn<Parameters<StorageGetUser>, ReturnType<StorageGetUser>>();
const mockDbWhere = vi.fn<Parameters<DbWhereStub>, ReturnType<DbWhereStub>>();

vi.mock("../server/lib/redis", () => ({
  getCachedUserBlockLists: (
    userId: string,
    loader: BlockListsCacheLoader,
  ) => mockGetCachedUserBlockLists(userId, loader),
}));

vi.mock("../server/storage", () => ({
  storage: { getUser: (id: string) => mockStorageGetUser(id) },
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => mockDbWhere(...args),
      }),
    }),
  },
}));

vi.mock("../server/lib/word-filter", () => ({
  filterMessage: (s: string) => s,
}));
vi.mock("../server/lib/input-security", () => ({
  sanitizePlainText: (s: string) => s,
}));

const {
  broadcastChallengeViewerCount,
  broadcastChallengeViewerList,
} = await import("../server/socketio/challenge-chat-bridge");

interface FakeSocket {
  data: { userId: string; spectatorRoomIds?: string[] };
  emit: ReturnType<typeof vi.fn>;
}

interface FakeNamespace {
  in(room: string): { fetchSockets(): Promise<FakeSocket[]> };
  to(room: string): { emit: ReturnType<typeof vi.fn> };
}

function makeNamespace(sockets: FakeSocket[]): {
  ns: FakeNamespace;
  roomEmit: ReturnType<typeof vi.fn>;
} {
  const roomEmit = vi.fn();
  const ns: FakeNamespace = {
    in: () => ({ fetchSockets: async () => sockets }),
    to: () => ({ emit: roomEmit }),
  };
  return { ns, roomEmit };
}

function callList(ns: FakeNamespace, room: string): Promise<void> {
  return broadcastChallengeViewerList(
    ns as unknown as Parameters<typeof broadcastChallengeViewerList>[0],
    room,
  );
}

function callCount(ns: FakeNamespace, room: string): Promise<void> {
  return broadcastChallengeViewerCount(
    ns as unknown as Parameters<typeof broadcastChallengeViewerCount>[0],
    room,
  );
}

describe("Task #109 — casual gameplay match: viewer broadcasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("broadcastChallengeViewerCount emits chat:viewer_count for `match:` rooms (was previously gated to `challenge:` only)", async () => {
    const player: FakeSocket = {
      data: { userId: "p1", spectatorRoomIds: [] },
      emit: vi.fn(),
    };
    const spectator: FakeSocket = {
      data: { userId: "s1", spectatorRoomIds: ["match:gm-7"] },
      emit: vi.fn(),
    };
    const { ns, roomEmit } = makeNamespace([player, spectator]);

    await callCount(ns, "match:gm-7");

    expect(roomEmit).toHaveBeenCalledTimes(1);
    const [evt, payload] = roomEmit.mock.calls[0] as [
      string,
      { roomId: string; count: number },
    ];
    expect(evt).toBe("chat:viewer_count");
    expect(payload.roomId).toBe("match:gm-7");
    expect(payload.count).toBe(1);
  });

  it("broadcastChallengeViewerList emits chat:viewer_list for `match:` rooms with the same per-recipient block-filtering as challenge rooms", async () => {
    const player: FakeSocket = {
      data: { userId: "p1", spectatorRoomIds: [] },
      emit: vi.fn(),
    };
    const spectator: FakeSocket = {
      data: { userId: "s1", spectatorRoomIds: ["match:gm-7"] },
      emit: vi.fn(),
    };
    const { ns } = makeNamespace([player, spectator]);

    mockDbWhere.mockResolvedValue([
      { id: "s1", username: "specone", profilePicture: "https://cdn/s1.png" },
    ]);
    mockGetCachedUserBlockLists.mockResolvedValue({
      blockedUsers: [],
      mutedUsers: [],
    });

    await callList(ns, "match:gm-7");

    // Per-recipient emit (mirrors challenge: behavior — see
    // chat-viewer-list-broadcast.test.ts for the parallel assertions).
    expect(player.emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = player.emit.mock.calls[0] as [
      string,
      ChatViewerListPayload,
    ];
    expect(evt).toBe("chat:viewer_list");
    expect(payload.roomId).toBe("match:gm-7");
    expect(payload.viewers).toEqual([
      {
        userId: "s1",
        username: "specone",
        avatarUrl: "https://cdn/s1.png",
      },
    ]);
    expect(payload.totalCount).toBe(1);
  });

  it("broadcastChallengeViewerList still skips DM rooms (no spectator concept there) — defends the explicit prefix allowlist", async () => {
    const a: FakeSocket = {
      data: { userId: "a", spectatorRoomIds: ["dm:a:b"] },
      emit: vi.fn(),
    };
    const b: FakeSocket = {
      data: { userId: "b", spectatorRoomIds: [] },
      emit: vi.fn(),
    };
    const { ns, roomEmit } = makeNamespace([a, b]);

    await callList(ns, "dm:a:b");
    await callCount(ns, "dm:a:b");

    // Helpers must early-return for `dm:` — no per-recipient OR
    // room-wide emits should fire.
    expect(a.emit).not.toHaveBeenCalled();
    expect(b.emit).not.toHaveBeenCalled();
    expect(roomEmit).not.toHaveBeenCalled();
  });
});
