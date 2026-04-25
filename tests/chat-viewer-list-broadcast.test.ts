import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatViewerListPayload } from "../shared/socketio-events";

// ---- Typed minimal fakes ----
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

const { broadcastChallengeViewerList } = await import(
  "../server/socketio/challenge-chat-bridge"
);

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

// The SUT signature requires the socket.io ChatNamespace type, which
// our minimal fake intentionally does not implement. Cast through
// `unknown` at call-site so the helper itself stays typed.
function callBroadcast(ns: FakeNamespace, room: string): Promise<void> {
  return broadcastChallengeViewerList(
    ns as unknown as Parameters<typeof broadcastChallengeViewerList>[0],
    room,
  );
}

describe("broadcastChallengeViewerList — Task #75 fail-closed contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits viewers:[] (fail-closed) but preserves totalCount when a block-list lookup throws", async () => {
    const recipient: FakeSocket = {
      data: { userId: "host-user", spectatorRoomIds: [] },
      emit: vi.fn(),
    };
    const spectator: FakeSocket = {
      data: {
        userId: "spec-user",
        spectatorRoomIds: ["challenge:room-1"],
      },
      emit: vi.fn(),
    };
    const { ns } = makeNamespace([recipient, spectator]);

    mockDbWhere.mockResolvedValue([
      { id: "spec-user", username: "spec", profilePicture: null },
    ]);
    mockGetCachedUserBlockLists.mockImplementation(async (id) => {
      if (id === "spec-user") throw new Error("redis down");
      return { blockedUsers: [], mutedUsers: [] };
    });

    await callBroadcast(ns, "challenge:room-1");

    expect(recipient.emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = recipient.emit.mock.calls[0] as [
      string,
      ChatViewerListPayload,
    ];
    expect(evt).toBe("chat:viewer_list");
    expect(payload.roomId).toBe("challenge:room-1");
    expect(payload.viewers).toEqual([]);
    expect(payload.totalCount).toBe(1);
  });

  it("emits the filtered viewer list when block-list lookups succeed", async () => {
    const recipient: FakeSocket = {
      data: { userId: "host-user", spectatorRoomIds: [] },
      emit: vi.fn(),
    };
    const spectator: FakeSocket = {
      data: {
        userId: "spec-user",
        spectatorRoomIds: ["challenge:room-1"],
      },
      emit: vi.fn(),
    };
    const { ns } = makeNamespace([recipient, spectator]);

    mockDbWhere.mockResolvedValue([
      {
        id: "spec-user",
        username: "spec",
        profilePicture: "https://cdn/spec.png",
      },
    ]);
    mockGetCachedUserBlockLists.mockResolvedValue({
      blockedUsers: [],
      mutedUsers: [],
    });

    await callBroadcast(ns, "challenge:room-1");

    expect(recipient.emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = recipient.emit.mock.calls[0] as [
      string,
      ChatViewerListPayload,
    ];
    expect(evt).toBe("chat:viewer_list");
    expect(payload.viewers).toEqual([
      {
        userId: "spec-user",
        username: "spec",
        avatarUrl: "https://cdn/spec.png",
      },
    ]);
    expect(payload.totalCount).toBe(1);
  });

  it("hides a viewer that the recipient has blocked", async () => {
    const recipient: FakeSocket = {
      data: { userId: "host-user", spectatorRoomIds: [] },
      emit: vi.fn(),
    };
    const spectator: FakeSocket = {
      data: {
        userId: "spec-user",
        spectatorRoomIds: ["challenge:room-1"],
      },
      emit: vi.fn(),
    };
    const { ns } = makeNamespace([recipient, spectator]);

    mockDbWhere.mockResolvedValue([
      { id: "spec-user", username: "spec", profilePicture: null },
    ]);
    mockGetCachedUserBlockLists.mockImplementation(async (id) => {
      if (id === "host-user") {
        return { blockedUsers: ["spec-user"], mutedUsers: [] };
      }
      return { blockedUsers: [], mutedUsers: [] };
    });

    await callBroadcast(ns, "challenge:room-1");

    const [, payload] = recipient.emit.mock.calls[0] as [
      string,
      ChatViewerListPayload,
    ];
    expect(payload.viewers).toEqual([]);
    expect(payload.totalCount).toBe(1);
  });

  it("hides a viewer who has blocked the recipient (reverse direction)", async () => {
    const recipient: FakeSocket = {
      data: { userId: "host-user", spectatorRoomIds: [] },
      emit: vi.fn(),
    };
    const spectator: FakeSocket = {
      data: {
        userId: "spec-user",
        spectatorRoomIds: ["challenge:room-1"],
      },
      emit: vi.fn(),
    };
    const { ns } = makeNamespace([recipient, spectator]);

    mockDbWhere.mockResolvedValue([
      { id: "spec-user", username: "spec", profilePicture: null },
    ]);
    mockGetCachedUserBlockLists.mockImplementation(async (id) => {
      if (id === "spec-user") {
        return { blockedUsers: ["host-user"], mutedUsers: [] };
      }
      return { blockedUsers: [], mutedUsers: [] };
    });

    await callBroadcast(ns, "challenge:room-1");

    const [, payload] = recipient.emit.mock.calls[0] as [
      string,
      ChatViewerListPayload,
    ];
    expect(payload.viewers).toEqual([]);
    expect(payload.totalCount).toBe(1);
  });

  it("emits an empty room-wide payload when the user-summary DB query fails (clears stale identities)", async () => {
    const recipient: FakeSocket = {
      data: { userId: "host-user", spectatorRoomIds: [] },
      emit: vi.fn(),
    };
    const spectator: FakeSocket = {
      data: {
        userId: "spec-user",
        spectatorRoomIds: ["challenge:room-1"],
      },
      emit: vi.fn(),
    };
    const { ns, roomEmit } = makeNamespace([recipient, spectator]);

    mockDbWhere.mockRejectedValue(new Error("db down"));
    mockGetCachedUserBlockLists.mockResolvedValue({
      blockedUsers: [],
      mutedUsers: [],
    });

    await callBroadcast(ns, "challenge:room-1");

    // Per-recipient emits must NOT happen — instead the room-level
    // namespace emit clears identities for everyone in one call.
    expect(recipient.emit).not.toHaveBeenCalled();
    expect(roomEmit).toHaveBeenCalledTimes(1);
    const [evt, payload] = roomEmit.mock.calls[0] as [
      string,
      ChatViewerListPayload,
    ];
    expect(evt).toBe("chat:viewer_list");
    expect(payload.viewers).toEqual([]);
    expect(payload.totalCount).toBe(1);
  });
});
