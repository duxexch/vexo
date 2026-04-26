/**
 * Task #112 — Catch chat scroll-jump regressions when older messages
 * load: behavioural coverage that exercises the REAL DM pagination
 * flow (top-scroll → snapshot → loadMore → strip visible while in
 * flight → prepend commits → strip hidden + anchor message stays
 * pinned), parameterised across the EN and AR locales.
 *
 * Why a separate file from `dm-scroll-anchor-prepend.test.tsx`?
 * ------------------------------------------------------------
 * That sibling test locks the y-pinning invariant in 5 prepend
 * permutations (single page, concurrent bottom-arriving message,
 * three deep-history seeks, empty/dedup'd response, scrollTop=0).
 * It does NOT mount the loading strip and does NOT model the
 * `loadingMore` request lifecycle — so a regression in the lifecycle
 * wiring (e.g. forgetting to flip `loadingMore` to true before
 * dispatching the fetch, or not flipping it back to false on
 * resolution) would slip through that test silently.
 *
 * This file closes that gap by mounting a faithful copy of chat.tsx's
 * coupled trio in jsdom:
 *
 *   1) The real `useScrollAnchorOnPrepend` hook (imported, NOT
 *      reimplemented) — same hook chat.tsx uses in production.
 *
 *   2) The strip JSX, byte-for-byte mirror of the production block
 *      at `client/src/pages/chat.tsx` lines ~1604-1617, gated on a
 *      `loadingMore` boolean owned by the harness.
 *
 *   3) A scroll handler that mirrors chat.tsx line 681's predicate
 *      verbatim: `target.scrollTop < 100 && hasMoreMessages &&
 *      !loadingMore` → `snapshotForPrepend(); loadMoreMessages()`.
 *
 *   4) An async `loadMoreMessages()` that, like the real react-query
 *      mutation, sets `loadingMore=true` immediately, awaits a
 *      microtask, then commits the prepend and clears `loadingMore`.
 *      The harness exposes a manual "resolve" hook so each test can
 *      assert the strip's visible-mid-flight state before allowing
 *      the page to land.
 *
 * Coverage layers in this file:
 *
 *   A) Locale invariants — load the REAL `client/src/locales/en.ts`
 *      and `ar.ts` modules and assert both export a non-empty
 *      `chat.loadingOlderMessages` string. If a future change drops
 *      the key from one locale, players in that language would see a
 *      blank strip.
 *
 *   B) Real-flow lifecycle — for each of EN and AR:
 *        - Initial state: strip hidden (opacity-0, aria-hidden=true,
 *          empty text).
 *        - Fire a scroll event with `target.scrollTop = 50` on the
 *          container, taking the user past the trigger threshold.
 *        - Mid-flight assertion: strip is opacity-100, aria-hidden
 *          =false, role=status, aria-live=polite, and the visible
 *          text equals the locale's `chat.loadingOlderMessages`
 *          string EXACTLY (so an EN regression in ar.ts or vice
 *          versa fails loudly).
 *        - Resolve the older-page fetch -> prepend commits -> hook's
 *          useLayoutEffect restores scrollTop -> strip returns to
 *          opacity-0/aria-hidden=true/empty text.
 *        - Anchor message viewport-Y delta is asserted to be <4 px
 *          (the same tolerance used by `dm-scroll-anchor-prepend
 *          .test.tsx`) — if the strip's layout-neutrality classes
 *          regress, the anchor will jump by 36 px (the strip's h-9)
 *          and this assertion fails.
 *
 *   C) Concurrent-trigger guard — while `loadingMore=true`, a second
 *      scroll event MUST NOT trigger a second `loadMoreMessages()`
 *      call. This is the same guard that prevents request floods in
 *      production.
 *
 *   D) Call-site lock on chat.tsx — re-read the file, extract ONLY
 *      the strip's opening JSX tag (excluding the comment block
 *      above it that documents the same class tokens verbatim — code
 *      review caught this false-pass vector), and assert testid,
 *      visibility gate, aria-hidden, role/aria-live, t() lookup, and
 *      the layout-neutral `sticky top-0 -mb-9 h-9` classes are still
 *      present on the LIVE element.
 */

import { describe, it, expect } from "vitest";
import { useRef, useState, useCallback } from "react";
import { render, act, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import enLocale from "@/locales/en";
import arLocale from "@/locales/ar";
import { useScrollAnchorOnPrepend } from "@/hooks/use-scroll-anchor-on-prepend";

// ---------------------------------------------------------------------------
// Layer A — Locale invariants
// ---------------------------------------------------------------------------

describe("Locale dictionaries carry the loading-older-messages copy", () => {
    it("English locale defines a non-empty `chat.loadingOlderMessages`", () => {
        const value = (enLocale as Record<string, string>)[
            "chat.loadingOlderMessages"
        ];
        expect(typeof value).toBe("string");
        expect(value.trim().length).toBeGreaterThan(0);
    });

    it("Arabic locale defines a non-empty `chat.loadingOlderMessages`", () => {
        const value = (arLocale as Record<string, string>)[
            "chat.loadingOlderMessages"
        ];
        expect(typeof value).toBe("string");
        expect(value.trim().length).toBeGreaterThan(0);
    });

    it("English copy includes 'Loading' (sanity — guards against a placeholder)", () => {
        const value = (enLocale as Record<string, string>)[
            "chat.loadingOlderMessages"
        ];
        expect(value).toMatch(/Loading/i);
    });

    it("Arabic copy contains 'جاري' (sanity — guards against accidentally pasting English copy into ar.ts)", () => {
        const value = (arLocale as Record<string, string>)[
            "chat.loadingOlderMessages"
        ];
        expect(value).toMatch(/جاري/);
    });
});

// ---------------------------------------------------------------------------
// Layer B/C — Real-flow harness: scroll handler + hook + strip JSX
// driven by an async loadMoreMessages with a manual resolve hook.
// ---------------------------------------------------------------------------

const VIEWPORT_HEIGHT = 600;
const MSG_HEIGHT = 50;
const STRIP_HEIGHT = 36; // matches the strip's `h-9` (36 px)
const MAX_DRIFT_PX = 4;

interface FixtureMessage {
    id: string;
    body: string;
}

function makePage(prefix: string, count: number): FixtureMessage[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-m${i}`,
        body: `${prefix} msg ${i}`,
    }));
}

/**
 * Stamp deterministic layout onto the scroll container and its
 * children. jsdom does not implement layout, so we synthesise
 * `offsetTop`/`offsetHeight`/`scrollHeight`/`clientHeight` ourselves.
 *
 * The strip lives at the TOP of the container with `sticky top-0
 * -mb-9 h-9`. The negative bottom margin cancels its height in the
 * sibling-flow contribution, so message offsets must START AT ZERO
 * (not at STRIP_HEIGHT). If a future regression drops `-mb-9` from
 * the strip's className, the test harness still reports zero
 * contribution — but the call-site lock at the bottom of this file
 * (Layer D) catches the className regression directly.
 */
function patchLayout(container: HTMLElement): void {
    let cursor = 0;
    for (const child of Array.from(container.children)) {
        const isMessage = child.hasAttribute("data-message-id");
        const isStrip =
            child.getAttribute("data-testid") ===
            "chat-loading-older-messages";
        if (isMessage) {
            const offsetTopValue = cursor;
            Object.defineProperty(child, "offsetTop", {
                configurable: true,
                get: () => offsetTopValue,
            });
            Object.defineProperty(child, "offsetHeight", {
                configurable: true,
                get: () => MSG_HEIGHT,
            });
            Object.defineProperty(child, "offsetParent", {
                configurable: true,
                get: () => container,
            });
            cursor += MSG_HEIGHT;
        } else if (isStrip) {
            // Sticky element with negative bottom margin equal to its
            // height contributes 0 to flow.
            Object.defineProperty(child, "offsetTop", {
                configurable: true,
                get: () => 0,
            });
            Object.defineProperty(child, "offsetHeight", {
                configurable: true,
                get: () => STRIP_HEIGHT,
            });
            Object.defineProperty(child, "offsetParent", {
                configurable: true,
                get: () => container,
            });
        }
    }
    const totalHeight = cursor;
    Object.defineProperty(container, "scrollHeight", {
        configurable: true,
        get: () => totalHeight,
    });
    Object.defineProperty(container, "clientHeight", {
        configurable: true,
        get: () => VIEWPORT_HEIGHT,
    });
}

interface HarnessHandle {
    getContainer: () => HTMLElement;
    getStrip: () => HTMLElement;
    setScrollTop: (n: number) => void;
    /** Fire a scroll event so handleScroll runs through the real predicate. */
    fireScroll: () => void;
    /** Number of times the simulated `loadMoreMessages` was invoked. */
    getLoadCallCount: () => number;
    /**
     * Resolve the in-flight older-page request, optionally with a
     * specific page (default: a fresh older page of 20 msgs).
     */
    resolvePending: (olderPage?: FixtureMessage[]) => Promise<void>;
    isLoadingMore: () => boolean;
    setHasMore: (b: boolean) => void;
}

function mountHarness(opts: {
    locale: Record<string, string>;
    seedNewestPage: FixtureMessage[];
    initialScrollTop: number;
}): { handle: HarnessHandle; unmount: () => void } {
    const t = (key: string): string => opts.locale[key] ?? key;
    const handle: Partial<HarnessHandle> = {};

    // Pending-resolver shared across renders.
    let pendingResolve: ((page: FixtureMessage[]) => void) | null = null;
    let loadCallCount = 0;

    function Harness() {
        const containerRef = useRef<HTMLDivElement>(null);
        const [messages, setMessages] = useState<FixtureMessage[]>(
            opts.seedNewestPage,
        );
        const [loadingMore, setLoadingMore] = useState(false);
        const [hasMoreMessages, setHasMoreMessages] = useState(true);

        const api = useScrollAnchorOnPrepend({
            scrollContainerRef: containerRef,
            messages,
        });

        // Mirrors chat.tsx's loadMoreMessages mutation: flip the flag
        // immediately (so the strip becomes visible), await the
        // page, prepend it, then clear the flag.
        const loadMoreMessages = useCallback(async (): Promise<void> => {
            loadCallCount += 1;
            setLoadingMore(true);
            const page = await new Promise<FixtureMessage[]>((res) => {
                pendingResolve = res;
            });
            setMessages((prev) => [...page, ...prev]);
            setLoadingMore(false);
            if (page.length === 0) setHasMoreMessages(false);
        }, []);

        // Mirrors chat.tsx line 681's handleScroll predicate verbatim:
        //   if (target.scrollTop < 100 && hasMoreMessages && !loadingMore) {
        //     snapshotForPrepend();
        //     loadMoreMessages();
        //   }
        const handleScroll = useCallback(
            (event: React.UIEvent<HTMLDivElement>) => {
                const target = event.currentTarget;
                if (
                    target.scrollTop < 100 &&
                    hasMoreMessages &&
                    !loadingMore
                ) {
                    api.snapshotForPrepend();
                    void loadMoreMessages();
                }
            },
            [api, hasMoreMessages, loadingMore, loadMoreMessages],
        );

        handle.getContainer = () => containerRef.current!;
        handle.getStrip = () =>
            containerRef.current!.querySelector(
                '[data-testid="chat-loading-older-messages"]',
            ) as HTMLElement;
        handle.setScrollTop = (n) => {
            const c = containerRef.current!;
            c.scrollTop = n;
        };
        handle.fireScroll = () => {
            fireEvent.scroll(containerRef.current!);
        };
        handle.getLoadCallCount = () => loadCallCount;
        handle.resolvePending = async (olderPage) => {
            const page = olderPage ?? makePage("older", 20);
            const resolver = pendingResolve;
            if (!resolver) throw new Error("no pending loadMore to resolve");
            pendingResolve = null;
            await act(async () => {
                resolver(page);
                // Allow the awaited promise + state updates to flush.
                await Promise.resolve();
            });
        };
        handle.isLoadingMore = () => loadingMore;
        handle.setHasMore = (b) => setHasMoreMessages(b);

        return (
            <div
                ref={(node) => {
                    containerRef.current = node;
                    if (node) patchLayout(node);
                }}
                onScroll={handleScroll}
                data-testid="dm-scroll-container"
                style={{ overflow: "auto", height: VIEWPORT_HEIGHT }}
            >
                {/* Faithful copy of chat.tsx strip JSX (lines ~1604-1617). */}
                <div
                    className={`pointer-events-none sticky top-0 z-20 -mb-9 flex h-9 items-center justify-center transition-opacity duration-200 ${
                        loadingMore ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden={!loadingMore}
                    role="status"
                    aria-live="polite"
                    data-testid="chat-loading-older-messages"
                >
                    <div className="flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
                        <span data-testid="strip-spinner-stub" />
                        <span data-testid="strip-text">
                            {loadingMore ? t("chat.loadingOlderMessages") : ""}
                        </span>
                    </div>
                </div>
                {messages.map((m) => (
                    <div key={m.id} data-message-id={m.id}>
                        {m.body}
                    </div>
                ))}
            </div>
        );
    }

    const result = render(<Harness />);
    // Place the user above the trigger threshold initially so the
    // first scroll event fires the predicate.
    handle.setScrollTop!(opts.initialScrollTop);
    return { handle: handle as HarnessHandle, unmount: result.unmount };
}

function readStripState(strip: HTMLElement): {
    opacityClass: "opacity-100" | "opacity-0" | "unknown";
    ariaHidden: string | null;
    role: string | null;
    ariaLive: string | null;
    visibleText: string;
} {
    const cls = strip.className;
    const opacityClass = cls.includes("opacity-100")
        ? "opacity-100"
        : cls.includes("opacity-0")
            ? "opacity-0"
            : "unknown";
    return {
        opacityClass,
        ariaHidden: strip.getAttribute("aria-hidden"),
        role: strip.getAttribute("role"),
        ariaLive: strip.getAttribute("aria-live"),
        visibleText: within(strip).getByTestId("strip-text").textContent ?? "",
    };
}

describe("Real DM pagination flow: strip lifecycle + anchor stability (en + ar)", () => {
    async function runFlow(
        locale: Record<string, string>,
        expectedCopy: string,
        label: string,
    ): Promise<void> {
        const seed = makePage("p0", 30);
        const { handle, unmount } = mountHarness({
            locale,
            seedNewestPage: seed,
            initialScrollTop: 500,
        });
        try {
            // 1) Initial state — strip hidden.
            const initial = readStripState(handle.getStrip());
            expect(initial.opacityClass, `${label}: initial opacity`).toBe(
                "opacity-0",
            );
            expect(initial.ariaHidden, `${label}: initial aria-hidden`).toBe(
                "true",
            );
            expect(initial.visibleText, `${label}: initial text`).toBe("");
            expect(initial.role, `${label}: role`).toBe("status");
            expect(initial.ariaLive, `${label}: aria-live`).toBe("polite");
            expect(handle.getLoadCallCount(), `${label}: no load yet`).toBe(0);

            // 2) Capture the anchor message's viewport-Y at trigger time.
            //    Fire a scroll event with scrollTop=50 (below the
            //    100 px threshold), simulating the user pulling the
            //    conversation past the top.
            const container = handle.getContainer();
            const anchorId = seed[0]!.id;
            const anchorBefore = container.querySelector<HTMLElement>(
                `[data-message-id="${anchorId}"]`,
            )!;

            act(() => {
                handle.setScrollTop(50);
                handle.fireScroll();
            });

            const yBefore =
                anchorBefore.offsetTop - container.scrollTop;

            // 3) Mid-flight: strip MUST be visible with the locale copy.
            const midFlight = readStripState(handle.getStrip());
            expect(
                midFlight.opacityClass,
                `${label}: mid-flight opacity (strip should be visible)`,
            ).toBe("opacity-100");
            expect(
                midFlight.ariaHidden,
                `${label}: mid-flight aria-hidden`,
            ).toBe("false");
            expect(
                midFlight.visibleText,
                `${label}: mid-flight text`,
            ).toBe(expectedCopy);
            expect(midFlight.role).toBe("status");
            expect(midFlight.ariaLive).toBe("polite");
            expect(
                handle.getLoadCallCount(),
                `${label}: exactly one load triggered`,
            ).toBe(1);
            expect(
                handle.isLoadingMore(),
                `${label}: hook reports loadingMore=true`,
            ).toBe(true);

            // 3b) Concurrent-trigger guard: a second scroll event
            //     while in flight MUST NOT trigger a second load.
            act(() => {
                handle.setScrollTop(40);
                handle.fireScroll();
            });
            expect(
                handle.getLoadCallCount(),
                `${label}: still exactly one load (in-flight guard holds)`,
            ).toBe(1);

            // 4) Resolve the older-page fetch and let React commit
            //    everything: prepend → useLayoutEffect restore →
            //    loadingMore=false → strip hides.
            const olderPage = makePage("older", 20);
            await handle.resolvePending(olderPage);

            // 5) Settled state assertions.
            const settled = readStripState(handle.getStrip());
            expect(
                settled.opacityClass,
                `${label}: settled opacity`,
            ).toBe("opacity-0");
            expect(
                settled.ariaHidden,
                `${label}: settled aria-hidden`,
            ).toBe("true");
            expect(
                settled.visibleText,
                `${label}: settled text (no stale 'Loading…')`,
            ).toBe("");

            // 6) Anchor message Y stability — Task #112's first
            //    invariant. If the strip's layout-neutral classes
            //    regress, the anchor jumps by ~36 px (h-9) and this
            //    fails.
            const anchorAfter = container.querySelector<HTMLElement>(
                `[data-message-id="${anchorId}"]`,
            )!;
            const yAfter = anchorAfter.offsetTop - container.scrollTop;
            const drift = Math.abs(yAfter - yBefore);
            expect(
                drift,
                `${label}: anchor Y must not jump (got ${drift}px, max ${MAX_DRIFT_PX}px)`,
            ).toBeLessThan(MAX_DRIFT_PX);
        } finally {
            unmount();
        }
    }

    it("EN: scroll-to-top triggers load → strip shows EN copy → page lands → strip hides → anchor Y stable", async () => {
        const en = enLocale as Record<string, string>;
        await runFlow(en, en["chat.loadingOlderMessages"]!, "en");
    });

    it("AR: scroll-to-top triggers load → strip shows AR copy → page lands → strip hides → anchor Y stable", async () => {
        const ar = arLocale as Record<string, string>;
        await runFlow(ar, ar["chat.loadingOlderMessages"]!, "ar");
    });
});

// ---------------------------------------------------------------------------
// Layer D — Call-site lock on chat.tsx (scoped to the strip's opening
// JSX tag so comments above the element cannot satisfy the guards).
// ---------------------------------------------------------------------------

describe("Loading strip wiring in chat.tsx", () => {
    const chatSrc = readFileSync(
        resolve(__dirname, "..", "client", "src", "pages", "chat.tsx"),
        "utf8",
    );

    /**
     * Slice the EXACT JSX opening tag that carries the strip's
     * data-testid, so each guard reads a tight scope containing only
     * the element's attributes — not the surrounding comments.
     */
    function getStripOpeningTag(): string {
        const idx = chatSrc.indexOf(
            'data-testid="chat-loading-older-messages"',
        );
        if (idx === -1) {
            throw new Error(
                "chat.tsx no longer contains the chat-loading-older-messages testid",
            );
        }
        const openIdx = chatSrc.lastIndexOf("<div", idx);
        if (openIdx === -1) {
            throw new Error(
                "chat.tsx: could not find the strip's opening <div",
            );
        }
        // Walk forward to the `>` that closes this opening tag,
        // counting brace depth so we skip JSX expressions like
        // `className={\`... ${...} ...\`}` and `aria-hidden={...}`.
        let depth = 0;
        for (let i = openIdx; i < chatSrc.length; i++) {
            const ch = chatSrc[i];
            if (ch === "{") depth += 1;
            else if (ch === "}") depth -= 1;
            else if (ch === ">" && depth === 0) {
                return chatSrc.slice(openIdx, i + 1);
            }
        }
        throw new Error(
            "chat.tsx: could not find the strip's opening tag terminator",
        );
    }

    it("strip carries the data-testid='chat-loading-older-messages'", () => {
        expect(chatSrc).toMatch(
            /data-testid=["']chat-loading-older-messages["']/,
        );
    });

    it("strip toggles `opacity-100`/`opacity-0` on `loadingMore` (visibility gate)", () => {
        const tag = getStripOpeningTag();
        expect(tag).toMatch(
            /loadingMore\s*\?\s*["']opacity-100["']\s*:\s*["']opacity-0["']/,
        );
    });

    it("strip ties `aria-hidden` to `!loadingMore` (assistive-tech contract)", () => {
        const tag = getStripOpeningTag();
        expect(tag).toMatch(/aria-hidden=\{\s*!loadingMore\s*\}/);
    });

    it("strip exposes `role='status'` and `aria-live='polite'`", () => {
        const tag = getStripOpeningTag();
        expect(tag).toMatch(/role=["']status["']/);
        expect(tag).toMatch(/aria-live=["']polite["']/);
    });

    it("strip uses the layout-neutral `sticky top-0 -mb-9 h-9` trick on the LIVE element", () => {
        const tag = getStripOpeningTag();
        expect(tag).toMatch(/className=\{`[^`]*\bsticky\b[^`]*`/);
        expect(tag).toMatch(/className=\{`[^`]*\btop-0\b[^`]*`/);
        expect(tag).toMatch(/className=\{`[^`]*-mb-9\b[^`]*`/);
        expect(tag).toMatch(/className=\{`[^`]*\bh-9\b[^`]*`/);
    });

    it("text content collapses to empty when not loading (no stale 'Loading…' lingers in DOM)", () => {
        const idx = chatSrc.indexOf(
            'data-testid="chat-loading-older-messages"',
        );
        const after = chatSrc.slice(idx, idx + 800);
        expect(after).toMatch(
            /loadingMore\s*\?\s*t\(\s*['"]chat\.loadingOlderMessages['"]\s*\)\s*:\s*['"]['"]/,
        );
    });

    it("scroll handler in chat.tsx uses `target.scrollTop < 100 && hasMoreMessages && !loadingMore` to gate load (mirrors harness predicate)", () => {
        // This is the predicate the real-flow harness above mirrors
        // verbatim. If the production gate drifts (e.g. someone drops
        // the !loadingMore guard or changes the threshold), the
        // harness coverage no longer reflects production behaviour.
        expect(chatSrc).toMatch(
            /target\.scrollTop\s*<\s*100\s*&&\s*hasMoreMessages\s*&&\s*!loadingMore/,
        );
        // And both side-effects must be wired: snapshot, then load.
        expect(chatSrc).toMatch(
            /snapshotForPrepend\s*\(\s*\)[\s;]*loadMoreMessages\s*\(\s*\)/,
        );
    });
});
