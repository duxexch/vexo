import React from "react";
import { createRoot } from "react-dom/client";

import { DominoBoard } from "@/components/games/DominoBoard";
import { I18nProvider } from "@/lib/i18n";

interface HarnessTile {
  left: number;
  right: number;
  id: string;
}

function buildChain(length: number): HarnessTile[] {
  return Array.from({ length }, (_, index) => {
    const left = index % 7;
    const right = (index + 2) % 7;
    return { left, right, id: `t-${index}-${left}-${right}` };
  });
}

function parseExplicitChain(raw: string | null): HarnessTile[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const tiles: HarnessTile[] = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const pair = parsed[i];
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const left = Number(pair[0]);
    const right = Number(pair[1]);
    if (!Number.isInteger(left) || !Number.isInteger(right)) return null;
    if (left < 0 || left > 6 || right < 0 || right > 6) return null;
    tiles.push({ left, right, id: `t-${i}-${left}-${right}` });
  }
  return tiles;
}

function parseAnchorIndex(raw: string | null, chainLength: number): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value >= chainLength) return null;
  return value;
}

function buildGameState(tiles: HarnessTile[]) {
  const boardTiles = tiles.map((tile) => ({
    tile,
    rotation: tile.left === tile.right ? 0 : 90,
  }));

  const leftEnd = tiles[0]?.left ?? -1;
  const rightEnd = tiles[tiles.length - 1]?.right ?? -1;

  return {
    myHand: [],
    opponentTileCount: 0,
    opponentTileCounts: { p2: 0 },
    boardTiles,
    leftEnd,
    rightEnd,
    boneyard: 0,
    playerOrder: ["p1", "p2"],
    playerCount: 2,
  };
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const length = Math.max(0, Number(params.get("length") ?? "14"));
  const compact = params.get("compact") === "true";
  const explicitChain = parseExplicitChain(params.get("chain"));

  const tiles = React.useMemo(
    () => explicitChain ?? buildChain(length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [length, params.get("chain")],
  );

  // The DominoBoard's anchor effect latches onto `state.boardTiles[0]` the
  // first time it sees a non-empty board, then leaves the anchor alone for
  // the rest of the round. To simulate a real game where the anchor sits in
  // the middle of the chain (with tiles played on BOTH sides of it), we
  // mount in two phases when `anchorIndex` is requested:
  //
  //   1. Render only `tiles[anchorIndex]` so the board's anchor effect
  //      latches onto that tile's signature.
  //   2. Expand to the full chain. The anchor effect's `stillExists` guard
  //      keeps the latched anchor in place, so the chain visually splits
  //      around the requested middle tile (leftEntries flow leftward, the
  //      remaining tiles flow rightward) — matching real-game geometry on
  //      the compact mobile lane.
  //
  // Without this, the harness mounts the entire chain on a single side of
  // the anchor, which forces the layout solver into a tight C-shape on
  // mobile and breaks the spatially-closest-half assertions used by
  // `scripts/smoke-domino-playthrough-pips.ts`.
  const anchorIndex = parseAnchorIndex(params.get("anchorIndex"), tiles.length);
  const needsTwoPhase = anchorIndex !== null && tiles.length > 1;

  const [phase, setPhase] = React.useState<"seed" | "full">(
    needsTwoPhase ? "seed" : "full",
  );

  React.useEffect(() => {
    if (phase !== "seed") {
      return;
    }
    // Defer to a fresh macrotask so React fully commits the seed render —
    // including the DominoBoard's anchor-latching `useEffect` — before the
    // chain expands. Without the yield, React batches both state updates
    // into the same commit and the anchor latches on `tiles[0]` instead of
    // the requested tile.
    const id = window.setTimeout(() => setPhase("full"), 0);
    return () => window.clearTimeout(id);
  }, [phase]);

  const visibleTiles = React.useMemo(() => {
    if (phase === "seed" && anchorIndex !== null) {
      return [tiles[anchorIndex]];
    }
    return tiles;
  }, [tiles, phase, anchorIndex]);

  // Harness container size — `?harnessWidth=` and `?harnessHeight=` URL
  // overrides let the new 28-tile fit smoke probe realistic phone/desktop
  // surfaces (the legacy 380×460 mobile box is tighter than a real phone
  // viewport). Defaults are unchanged so existing snapshot smokes stay
  // byte-for-byte identical.
  const containerWidth = parsePositiveInt(
    params.get("harnessWidth"),
    compact ? 380 : 900,
  );
  const containerHeight = parsePositiveInt(
    params.get("harnessHeight"),
    compact ? 460 : 560,
  );

  const gameState = React.useMemo(() => buildGameState(visibleTiles), [visibleTiles]);

  React.useEffect(() => {
    (window as Window & { __HARNESS_CHAIN__?: HarnessTile[] }).__HARNESS_CHAIN__ = visibleTiles;
  }, [visibleTiles]);

  // `__HARNESS_READY__` is the gate the smoke runner waits on before
  // measuring. Hold it until we have rendered the FULL chain, so two-phase
  // mounts don't race the smoke into measuring the seed (single-tile)
  // state.
  React.useEffect(() => {
    if (phase === "full") {
      (window as Window & { __HARNESS_READY__?: boolean }).__HARNESS_READY__ = true;
    }
  }, [phase]);

  return (
    <div
      data-testid="harness-frame"
      style={{
        width: containerWidth,
        height: containerHeight,
        background: "#222",
        border: "1px solid #444",
        position: "relative",
      }}
    >
      <DominoBoard
        gameState={gameState}
        currentTurn="p2"
        isMyTurn={false}
        isSpectator={true}
        onMove={() => {
          /* noop in harness */
        }}
        status="playing"
        turnTimeLimit={0}
      />
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Test harness root element missing");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
