import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Module mocks must be declared BEFORE importing the SUT ----
const mockGetCachedUserBlockLists = vi.fn();
const mockStorageGetUser = vi.fn();
const mockDbWhere = vi.fn();

vi.mock("../server/lib/redis", () => ({
  getCachedUserBlockLists: (...args: any[]) =>
    mockGetCachedUserBlockLists(...args),
}));

vi.mock("../server/storage", () => ({
  storage: { getUser: (...args: any[]) => mockStorageGetUser(...args) },
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: any[]) => mockDbWhere(...args),
      }),
    }),
  },
}));

// Stub the rest of the bridge's import surface so the SUT loads.
vi.mock("../server/lib/word-filter", () => ({ filterMessage: (s: string) => s }));
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

function makeNamespace(sockets: FakeSocket[]) {
  return {
    in: (_room: string) => ({ fetchSockets: async () => sockets }),
    to: (_room: string) => ({ emit: vi.fn() }),
  } as any;
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
    const ns = makeNamespace([recipient, spectator]);

    mockDbWhere.mockResolvedValue([
      { id: "spec-user", username: "spec", profilePicture: null },
    ]);
    // Recipient lookup OK; viewer lookup throws → flips fail-closed flag.
    mockGetCachedUserBlockLists.mockImplementation(async (id: string) => {
      if (id === "spec-user") throw new Error("redis down");
      return { blockedUsers: [], mutedUsers: [] };
    });

    await broadcastChallengeViewerList(ns, "challenge:room-1");

    expect(recipient.emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = recipient.emit.mock.calls[0];
    expect(evt).toBe("chat:viewer_list");
    expect(payload.roomId).toBe("challenge:room-1");
    // Privacy contract: identities suppressed, count still authoritative.
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
    const ns = makeNamespace([recipient, spectator]);

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

    await broadcastChallengeViewerList(ns, "challenge:room-1");

    expect(recipient.emit).toHaveBeenCalledTimes(1);
    const [evt, payload] = recipient.emit.mock.calls[0];
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
    const ns = makeNamespace([recipient, spectator]);

    mockDbWhere.mockResolvedValue([
      { id: "spec-user", username: "spec", profilePicture: null },
    ]);
    mockGetCachedUserBlockLists.mockImplementation(async (id: string) => {
      if (id === "host-user") {
        return { blockedUsers: ["spec-user"], mutedUsers: [] };
      }
      return { blockedUsers: [], mutedUsers: [] };
    });

    await broadcastChallengeViewerList(ns, "challenge:room-1");

    const [, payload] = recipient.emit.mock.calls[0];
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
    const ns = makeNamespace([recipient, spectator]);

    mockDbWhere.mockResolvedValue([
      { id: "spec-user", username: "spec", profilePicture: null },
    ]);
    mockGetCachedUserBlockLists.mockImplementation(async (id: string) => {
      if (id === "spec-user") {
        return { blockedUsers: ["host-user"], mutedUsers: [] };
      }
      return { blockedUsers: [], mutedUsers: [] };
    });

    await broadcastChallengeViewerList(ns, "challenge:room-1");

    const [, payload] = recipient.emit.mock.calls[0];
    expect(payload.viewers).toEqual([]);
    expect(payload.totalCount).toBe(1);
  });
});
