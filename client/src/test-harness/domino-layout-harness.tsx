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

function buildGameState(length: number) {
  const tiles = buildChain(length);
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

function App() {
  const params = new URLSearchParams(window.location.search);
  const length = Math.max(0, Number(params.get("length") ?? "14"));
  const compact = params.get("compact") === "true";

  const containerWidth = compact ? 380 : 900;
  const containerHeight = compact ? 460 : 560;

  const gameState = React.useMemo(() => buildGameState(length), [length]);

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

(window as Window & { __HARNESS_READY__?: boolean }).__HARNESS_READY__ = true;
