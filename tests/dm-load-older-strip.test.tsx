/**
 * Task #112 — Catch chat scroll-jump regressions when older messages
 * load: dedicated coverage for the "Loading older messages…" strip
 * (visibility, en/ar copy, layout-neutrality) that complements the
 * y-pinning coverage already locked by
 * `tests/dm-scroll-anchor-prepend.test.tsx`.
 *
 * Why a separate file
 * -------------------
 * `dm-scroll-anchor-prepend.test.tsx` already mounts the real
 * `useScrollAnchorOnPrepend` hook in jsdom and asserts the first
 * visible message stays pinned (delta < 4 px) across every prepend
 * scenario the task spec calls for — single page, concurrent
 * bottom-arriving message, three consecutive deep-history seeks,
 * empty/dedup'd response, scrollTop=0. Re-implementing those
 * assertions here would duplicate the harness without adding signal.
 *
 * What this file locks instead
 * ----------------------------
 * Task #112's "Done looks like" calls out a SECOND guarantee that
 * nothing currently asserts:
 *
 *   "The same test asserts the 'Loading older messages…' strip
 *    appears while the request is in flight and disappears
 *    afterward, in both English and Arabic locales."
 *
 * A future refactor of the strip's wiring (drop the testid, swap
 * `t('chat.loadingOlderMessages')` for a hard-coded English string,
 * remove the `aria-live`/`role=status` accessibility hooks, or —
 * worst of all — drop the `sticky top-0 -mb-9 h-9` layout-neutral
 * trick that keeps the strip from displacing messages and silently
 * breaking scroll anchoring) would be invisible to TypeScript and
 * to the existing y-pinning test (which renders no strip at all).
 *
 * This file covers that contract in three layers:
 *
 *   1) Locale invariants — load the REAL `client/src/locales/en.ts`
 *      and `ar.ts` modules and assert both export a non-empty
 *      `chat.loadingOlderMessages` string. If a future change drops
 *      the key from one locale, players in that language would see a
 *      blank strip.
 *
 *   2) Strip behaviour — render a faithful copy of the production
 *      strip JSX (visibility, accessibility, layout) inside a tiny
 *      React harness driven by a `loadingMore` boolean and a `t()`
 *      function bound to the real locale dictionary. Assertions:
 *        - When `loadingMore=true`: the strip is opacity-100,
 *          `aria-hidden=false`, and reads the locale's
 *          `chat.loadingOlderMessages` text exactly.
 *        - When `loadingMore=false`: the strip is opacity-0,
 *          `aria-hidden=true`, and the visible text collapses to
 *          empty (no stale "Loading…" string lingers).
 *      Re-asserts the full lifecycle — `false → true → false` —
 *      against the EN dictionary and again against the AR
 *      dictionary, so a regression in either locale fails loudly.
 *
 *   3) Call-site lock on `client/src/pages/chat.tsx` — re-read the
 *      production strip block and verify every shape invariant the
 *      harness depends on still matches the page:
 *        - The `chat-loading-older-messages` testid is present.
 *        - The strip's visibility class set is gated on `loadingMore`
 *          (opacity-100 / opacity-0).
 *        - `aria-hidden={!loadingMore}` is wired (so screen readers
 *          stop announcing the strip when it disappears).
 *        - The text is read through `t('chat.loadingOlderMessages')`
 *          — never a hard-coded English string.
 *        - The layout-neutral `sticky top-0 -mb-9 h-9` trick is in
 *          place. Without it the strip pushes content down on every
 *          render, which would breaking the y-pinning invariant
 *          locked by `dm-scroll-anchor-prepend.test.tsx` in
 *          production even though the unit test still passes in
 *          isolation.
 *        - The strip exposes `role="status"` and `aria-live="polite"`
 *          (assistive-tech contract).
 *
 * Together with `dm-scroll-anchor-prepend.test.tsx`, this file
 * satisfies both invariants Task #112 asks for: the first visible
 * message stays pinned (covered there) AND the loading strip
 * appears/disappears with the right localized copy (covered here).
 */

import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, act, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load the REAL locale dictionaries — not a mock — so a future
// rename or copy edit fails this test instead of silently shipping.
import enLocale from "@/locales/en";
import arLocale from "@/locales/ar";

// ---------------------------------------------------------------------------
// 1) Locale invariants
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

    it("English copy includes 'Loading' (sanity — guards against an empty/placeholder commit)", () => {
        const value = (enLocale as Record<string, string>)[
            "chat.loadingOlderMessages"
        ];
        expect(value).toMatch(/Loading/i);
    });

    it("Arabic copy contains the Arabic verb 'جاري' (sanity — guards against accidentally pasting English copy into ar.ts)", () => {
        const value = (arLocale as Record<string, string>)[
            "chat.loadingOlderMessages"
        ];
        expect(value).toMatch(/جاري/);
    });
});

// ---------------------------------------------------------------------------
// 2) Strip behaviour — faithful copy of the production JSX driven by
//    a `loadingMore` boolean and a real-locale `t()` function.
// ---------------------------------------------------------------------------

interface StripHarnessHandle {
    setLoadingMore: (next: boolean) => void;
    container: HTMLElement;
}

/**
 * Mirrors the strip JSX at `client/src/pages/chat.tsx` lines
 * ~1604-1617 verbatim. The call-site lock at the bottom of this file
 * pins the production strip's shape so this harness stays in sync —
 * any divergence breaks both tests, surfacing the regression at
 * exactly the line that drifted.
 *
 * The Loader2 spinner is replaced by a non-Lucide stub here because
 * mounting lucide-react in jsdom is irrelevant to the test (we
 * assert visibility/text/aria, not the spinner glyph itself).
 */
function mountStrip(
    locale: Record<string, string>,
    initialLoadingMore: boolean,
): { handle: StripHarnessHandle; unmount: () => void } {
    const t = (key: string): string => locale[key] ?? key;

    const handle: Partial<StripHarnessHandle> = {};

    function StripHarness() {
        const [loadingMore, setLoadingMore] = useState(initialLoadingMore);
        handle.setLoadingMore = setLoadingMore;
        return (
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
        );
    }

    const result = render(<StripHarness />);
    handle.container = result.container;
    return { handle: handle as StripHarnessHandle, unmount: result.unmount };
}

/** Read the visible state of the strip in one shot. */
function readStrip(container: HTMLElement): {
    opacityClass: "opacity-100" | "opacity-0" | "unknown";
    ariaHidden: string | null;
    role: string | null;
    ariaLive: string | null;
    visibleText: string;
} {
    const strip = within(container).getByTestId(
        "chat-loading-older-messages",
    );
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

describe("Loading-older-messages strip lifecycle (en + ar)", () => {
    /**
     * Drives the full `false -> true -> false` lifecycle the user
     * actually sees during a pagination cycle, against a given locale
     * dictionary. Asserts every transition snapshot exposes the right
     * visibility, accessibility, and copy.
     */
    function assertLifecycle(
        locale: Record<string, string>,
        expectedCopy: string,
        label: string,
    ): void {
        const { handle, unmount } = mountStrip(locale, false);
        try {
            // Initial: not loading -> hidden, empty text.
            const initial = readStrip(handle.container);
            expect(initial.opacityClass, `${label}: initial opacity`).toBe(
                "opacity-0",
            );
            expect(initial.ariaHidden, `${label}: initial aria-hidden`).toBe(
                "true",
            );
            expect(initial.visibleText, `${label}: initial text`).toBe("");
            expect(initial.role, `${label}: role`).toBe("status");
            expect(initial.ariaLive, `${label}: aria-live`).toBe("polite");

            // Pagination starts -> visible, copy from the locale.
            act(() => handle.setLoadingMore(true));
            const loading = readStrip(handle.container);
            expect(loading.opacityClass, `${label}: loading opacity`).toBe(
                "opacity-100",
            );
            expect(loading.ariaHidden, `${label}: loading aria-hidden`).toBe(
                "false",
            );
            expect(loading.visibleText, `${label}: loading text`).toBe(
                expectedCopy,
            );
            // The accessibility contract must persist through state changes.
            expect(loading.role, `${label}: role still 'status'`).toBe("status");
            expect(loading.ariaLive, `${label}: aria-live still 'polite'`).toBe(
                "polite",
            );

            // Older page lands -> hidden again, text collapses to empty
            // (guards against a stale "Loading…" string lingering in the
            // DOM after the spinner fades out).
            act(() => handle.setLoadingMore(false));
            const finalState = readStrip(handle.container);
            expect(finalState.opacityClass, `${label}: final opacity`).toBe(
                "opacity-0",
            );
            expect(finalState.ariaHidden, `${label}: final aria-hidden`).toBe(
                "true",
            );
            expect(finalState.visibleText, `${label}: final text`).toBe("");
        } finally {
            unmount();
        }
    }

    it("English: strip appears with EN copy during the request and disappears afterward", () => {
        const en = enLocale as Record<string, string>;
        assertLifecycle(en, en["chat.loadingOlderMessages"]!, "en");
    });

    it("Arabic: strip appears with AR copy during the request and disappears afterward", () => {
        const ar = arLocale as Record<string, string>;
        assertLifecycle(ar, ar["chat.loadingOlderMessages"]!, "ar");
    });
});

// ---------------------------------------------------------------------------
// 3) Call-site lock on chat.tsx — keeps the harness above honest by
//    pinning the real strip's shape.
// ---------------------------------------------------------------------------

describe("Loading strip wiring in chat.tsx", () => {
    const chatSrc = readFileSync(
        resolve(__dirname, "..", "client", "src", "pages", "chat.tsx"),
        "utf8",
    );

    /**
     * Slice the EXACT JSX opening tag that carries the strip's
     * data-testid out of chat.tsx, so each guard reads a tight scope
     * containing only the element's attributes — not the surrounding
     * comments. The comment block immediately above the element
     * literally documents the `sticky top-0 -mb-9 h-9` layout-neutral
     * trick, so a broad text window would falsely "pass" a regression
     * that strips those classes from the className itself but leaves
     * the comment intact (architect feedback). By scoping to
     * `<div ... data-testid="chat-loading-older-messages" ...>`, the
     * className-token guards below assert the LIVE element's classes.
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
        // Walk back to the nearest `<div` that opens this element.
        const openIdx = chatSrc.lastIndexOf("<div", idx);
        if (openIdx === -1) {
            throw new Error(
                "chat.tsx: could not find the strip's opening <div",
            );
        }
        // Walk forward to the `>` that closes this opening tag,
        // counting brace depth so we skip over JSX expressions like
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
        // This one looks at the file as a whole — purely a presence check
        // for the testid the harness depends on; comments are not a
        // confounder here because the testid string itself isn't in any
        // comment.
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

    it("strip uses the layout-neutral `sticky top-0 -mb-9 h-9` trick on the LIVE element (so it does not displace messages and break scroll anchoring)", () => {
        // The y-pinning invariant locked by
        // dm-scroll-anchor-prepend.test.tsx assumes the strip never
        // contributes to the message container's scroll content height.
        // The `-mb-9 h-9` pair cancels out exactly; the `sticky top-0`
        // keeps it visible without flow-displacing siblings. Removing
        // any of these would break anchoring in production while the
        // hook unit test still passes in isolation — exactly the
        // failure mode this guard exists to catch.
        //
        // We assert on the EXACT opening tag (extracted by
        // getStripOpeningTag) — not a wide source window — because the
        // comment block immediately above the element documents these
        // same class tokens verbatim. A broad-window match would
        // falsely pass even if the className was stripped of those
        // tokens entirely (architect feedback during code review).
        const tag = getStripOpeningTag();
        // All four tokens MUST live inside the live className (the
        // comment is excluded by construction), and they must be
        // explicit — not interpolated via a variable that could be
        // changed elsewhere.
        expect(tag).toMatch(/className=\{`[^`]*\bsticky\b[^`]*`/);
        expect(tag).toMatch(/className=\{`[^`]*\btop-0\b[^`]*`/);
        expect(tag).toMatch(/className=\{`[^`]*-mb-9\b[^`]*`/);
        expect(tag).toMatch(/className=\{`[^`]*\bh-9\b[^`]*`/);
    });

    it("text content collapses to empty when not loading (no stale 'Loading…' lingers in DOM)", () => {
        // The strip text is rendered in a child <span> of the wrapper,
        // so we look at the chat source within a tight window AFTER the
        // opening tag — but constrained to the next 800 characters
        // (well within the strip block, well outside the comment above).
        const idx = chatSrc.indexOf(
            'data-testid="chat-loading-older-messages"',
        );
        const after = chatSrc.slice(idx, idx + 800);
        // Matches: `loadingMore ? t('chat.loadingOlderMessages') : ''`
        expect(after).toMatch(
            /loadingMore\s*\?\s*t\(\s*['"]chat\.loadingOlderMessages['"]\s*\)\s*:\s*['"]['"]/,
        );
    });
});
