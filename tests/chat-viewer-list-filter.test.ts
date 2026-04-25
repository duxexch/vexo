import { describe, it, expect } from "vitest";
import { pickViewerListForRecipient } from "../server/socketio/challenge-chat-bridge";
import {
  MAX_VIEWER_LIST_PAYLOAD_SIZE,
  type ChatViewerSummary,
} from "../shared/socketio-events";

const v = (id: string, name: string, avatar: string | null = null): ChatViewerSummary => ({
  userId: id,
  username: name,
  avatarUrl: avatar,
});

describe("pickViewerListForRecipient — Task #75 block-list & cap", () => {
  it("returns the input as-is when the recipient has no blocks", () => {
    const viewers = [v("a", "alice"), v("b", "bob"), v("c", "carol")];
    const out = pickViewerListForRecipient(viewers, {
      recipientBlockedUserIds: [],
    });
    expect(out.map((x) => x.userId)).toEqual(["a", "b", "c"]);
  });

  it("hides viewers the recipient has blocked", () => {
    const viewers = [v("a", "alice"), v("b", "bob"), v("c", "carol")];
    const out = pickViewerListForRecipient(viewers, {
      recipientBlockedUserIds: ["b"],
    });
    expect(out.map((x) => x.userId)).toEqual(["a", "c"]);
  });

  it("hides viewers who have blocked the recipient (symmetric privacy)", () => {
    const viewers = [v("a", "alice"), v("b", "bob"), v("c", "carol")];
    const out = pickViewerListForRecipient(viewers, {
      recipientBlockedUserIds: [],
      blockingRecipientUserIds: ["a", "c"],
    });
    expect(out.map((x) => x.userId)).toEqual(["b"]);
  });

  it("dedups by userId so duplicate entries collapse to one", () => {
    const viewers = [v("a", "alice"), v("a", "alice-clone"), v("b", "bob")];
    const out = pickViewerListForRecipient(viewers, {
      recipientBlockedUserIds: [],
    });
    expect(out.map((x) => x.userId)).toEqual(["a", "b"]);
  });

  it("drops malformed rows missing userId or username", () => {
    const viewers = [
      v("", "noid"),
      { userId: "x", username: "", avatarUrl: null },
      v("a", "alice"),
    ];
    const out = pickViewerListForRecipient(viewers, {
      recipientBlockedUserIds: [],
    });
    expect(out.map((x) => x.userId)).toEqual(["a"]);
  });

  it("caps the result at the configured maximum", () => {
    const many: ChatViewerSummary[] = Array.from({ length: 30 }, (_, i) =>
      v(`u${i}`, `user${i}`),
    );
    const out = pickViewerListForRecipient(many, {
      recipientBlockedUserIds: [],
      max: 5,
    });
    expect(out).toHaveLength(5);
    expect(out.map((x) => x.userId)).toEqual(["u0", "u1", "u2", "u3", "u4"]);
  });

  it("uses MAX_VIEWER_LIST_PAYLOAD_SIZE as the default cap", () => {
    const many: ChatViewerSummary[] = Array.from(
      { length: MAX_VIEWER_LIST_PAYLOAD_SIZE + 5 },
      (_, i) => v(`u${i}`, `user${i}`),
    );
    const out = pickViewerListForRecipient(many, {
      recipientBlockedUserIds: [],
    });
    expect(out).toHaveLength(MAX_VIEWER_LIST_PAYLOAD_SIZE);
  });

  it("preserves avatarUrl values verbatim (including null)", () => {
    const viewers = [
      v("a", "alice", "https://cdn.example/alice.png"),
      v("b", "bob", null),
    ];
    const out = pickViewerListForRecipient(viewers, {
      recipientBlockedUserIds: [],
    });
    expect(out[0].avatarUrl).toBe("https://cdn.example/alice.png");
    expect(out[1].avatarUrl).toBeNull();
  });

  it("combines recipient-blocked and blocking-recipient sets", () => {
    const viewers = [v("a", "alice"), v("b", "bob"), v("c", "carol"), v("d", "dan")];
    const out = pickViewerListForRecipient(viewers, {
      recipientBlockedUserIds: ["b"],
      blockingRecipientUserIds: ["d"],
    });
    expect(out.map((x) => x.userId)).toEqual(["a", "c"]);
  });
});
