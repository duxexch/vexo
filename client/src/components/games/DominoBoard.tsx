import { useState, useEffect, useMemo, useRef, memo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";

type DominoTileSize = "xs" | "sm" | "md" | "lg";

interface DominoBoardProps {
  gameState?: string | Record<string, unknown>;
  currentTurn?: string;
  isMyTurn: boolean;
  isSpectator: boolean;
  onMove: (move: DominoMove) => void;
  status?: string;
  turnTimeLimit?: number; // seconds per turn (0 = no limit)
}

interface DominoMove {
  tileLeft: number;
  tileRight: number;
  placedEnd: "left" | "right";
  isPassed: boolean;
}

interface DominoTile {
  left: number;
  right: number;
  id?: string; // C7-F12: unique tile ID from server
}

interface BoardRowEntry {
  item: GameState["boardTiles"][number];
  index: number;
  sequenceIndex: number;
}

interface AnchoredBoardRow {
  id: string;
  level: number;
  leftEntries: BoardRowEntry[];
  rightEntries: BoardRowEntry[];
  anchorEntry?: BoardRowEntry;
}

interface GameState {
  myHand: DominoTile[];
  opponentTileCount: number;
  opponentTileCounts: Record<string, number>;
  boardTiles: { tile: DominoTile; rotation: number }[];
  leftEnd: number;
  rightEnd: number;
  boneyard: number;
  lastAction?: { type: string; playerId: string; tile?: DominoTile; end?: string }; // C7-F11: includes played tile info
  scores?: Record<string, number>;
  canDraw?: boolean; // F5: server-computed draw eligibility
  playerOrder?: string[]; // F6/F7/F8: for readable player labels
  validMoves?: Array<{ type: string; tile?: { left: number; right: number; id?: string }; end?: string }>; // C7-F3: server-provided valid moves
  passCount?: number; // C7-F9: consecutive pass counter
  playerCount?: number; // C7-F9: total player count for blocked warning
  drawsThisTurn?: number; // C9-F8: draws taken this turn
  maxDraws?: number; // C9-F8: max draws per turn
}

const INITIAL_STATE: GameState = {
  myHand: [],
  opponentTileCount: 7,
  opponentTileCounts: {},
  boardTiles: [],
  leftEnd: -1,
  rightEnd: -1,
  boneyard: 0, // C13-F8: Safe default — actual value always comes from server
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeDominoTile(value: unknown): DominoTile | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const left = toFiniteNumber(value.left, NaN);
  const right = toFiniteNumber(value.right, NaN);

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }

  return {
    left,
    right,
    id: typeof value.id === "string" ? value.id : undefined,
  };
}

function tileSignature(tile: DominoTile): string {
  if (tile.id) {
    return tile.id;
  }

  const low = Math.min(tile.left, tile.right);
  const high = Math.max(tile.left, tile.right);
  return `${low}-${high}`;
}

function normalizeGameState(rawState: unknown): GameState {
  if (!isObjectRecord(rawState)) {
    return INITIAL_STATE;
  }

  const myHand = (Array.isArray(rawState.myHand) ? rawState.myHand : [])
    .map((tile) => normalizeDominoTile(tile))
    .filter((tile): tile is DominoTile => tile !== null);

  const boardTiles = (Array.isArray(rawState.boardTiles) ? rawState.boardTiles : [])
    .map((entry) => {
      if (!isObjectRecord(entry)) {
        return null;
      }

      const tile = normalizeDominoTile(entry.tile ?? entry);
      if (!tile) {
        return null;
      }

      return {
        tile,
        rotation: toFiniteNumber(entry.rotation, tile.left === tile.right ? 0 : 90),
      };
    })
    .filter((entry): entry is { tile: DominoTile; rotation: number } => entry !== null);

  const opponentTileCounts: Record<string, number> = {};
  if (isObjectRecord(rawState.opponentTileCounts)) {
    for (const [playerId, count] of Object.entries(rawState.opponentTileCounts)) {
      if (typeof playerId !== "string") {
        continue;
      }

      const normalizedCount = toFiniteNumber(count, NaN);
      if (Number.isFinite(normalizedCount) && normalizedCount >= 0) {
        opponentTileCounts[playerId] = normalizedCount;
      }
    }
  }

  const scores: Record<string, number> = {};
  if (isObjectRecord(rawState.scores)) {
    for (const [playerId, score] of Object.entries(rawState.scores)) {
      if (typeof playerId !== "string") {
        continue;
      }

      const normalizedScore = toFiniteNumber(score, NaN);
      if (Number.isFinite(normalizedScore)) {
        scores[playerId] = normalizedScore;
      }
    }
  }

  const playerOrder = (Array.isArray(rawState.playerOrder) ? rawState.playerOrder : [])
    .filter((entry): entry is string => typeof entry === "string");

  const validMoves: NonNullable<GameState["validMoves"]> = [];
  for (const move of (Array.isArray(rawState.validMoves) ? rawState.validMoves : [])) {
    if (!isObjectRecord(move) || typeof move.type !== "string") {
      continue;
    }

    const tile = normalizeDominoTile(move.tile);
    const end = move.end === "left" || move.end === "right" ? move.end : undefined;
    validMoves.push({
      type: move.type,
      tile: tile ?? undefined,
      end,
    });
  }

  let lastAction: GameState["lastAction"];
  if (isObjectRecord(rawState.lastAction)) {
    const type = typeof rawState.lastAction.type === "string" ? rawState.lastAction.type : "";
    const playerId = typeof rawState.lastAction.playerId === "string" ? rawState.lastAction.playerId : "";
    if (type && playerId) {
      const normalizedTile = normalizeDominoTile(rawState.lastAction.tile);
      const end = typeof rawState.lastAction.end === "string" ? rawState.lastAction.end : undefined;
      lastAction = {
        type,
        playerId,
        tile: normalizedTile ?? undefined,
        end,
      };
    }
  }

  const fallbackLeftEnd = boardTiles.length > 0 ? boardTiles[0].tile.left : -1;
  const fallbackRightEnd = boardTiles.length > 0 ? boardTiles[boardTiles.length - 1].tile.right : -1;

  const normalizedState: GameState = {
    myHand,
    opponentTileCount: toFiniteNumber(rawState.opponentTileCount, INITIAL_STATE.opponentTileCount),
    opponentTileCounts,
    boardTiles,
    leftEnd: toFiniteNumber(rawState.leftEnd, fallbackLeftEnd),
    rightEnd: toFiniteNumber(rawState.rightEnd, fallbackRightEnd),
    boneyard: toFiniteNumber(rawState.boneyard, INITIAL_STATE.boneyard),
  };

  if (lastAction) {
    normalizedState.lastAction = lastAction;
  }

  if (Object.keys(scores).length > 0) {
    normalizedState.scores = scores;
  }

  if (typeof rawState.canDraw === "boolean") {
    normalizedState.canDraw = rawState.canDraw;
  }

  if (playerOrder.length > 0) {
    normalizedState.playerOrder = playerOrder;
  }

  if (validMoves.length > 0) {
    normalizedState.validMoves = validMoves;
  }

  const passCount = toFiniteNumber(rawState.passCount, NaN);
  if (Number.isFinite(passCount) && passCount >= 0) {
    normalizedState.passCount = passCount;
  }

  const playerCount = toFiniteNumber(rawState.playerCount, NaN);
  if (Number.isFinite(playerCount) && playerCount > 0) {
    normalizedState.playerCount = playerCount;
  }

  const drawsThisTurn = toFiniteNumber(rawState.drawsThisTurn, NaN);
  if (Number.isFinite(drawsThisTurn) && drawsThisTurn >= 0) {
    normalizedState.drawsThisTurn = drawsThisTurn;
  }

  const maxDraws = toFiniteNumber(rawState.maxDraws, NaN);
  if (Number.isFinite(maxDraws) && maxDraws >= 0) {
    normalizedState.maxDraws = maxDraws;
  }

  return normalizedState;
}

// C13-F7: Hoisted to module scope — avoids re-creating on every render
const TILE_SIZES: Record<DominoTileSize, string> = {
  xs: "w-6 h-12 sm:w-7 sm:h-14",
  sm: "w-7 h-14 sm:w-8 sm:h-16",
  md: "w-10 h-20 sm:w-12 sm:h-24",
  lg: "w-14 h-28 sm:w-16 sm:h-32",
};

const TILE_SIZES_SIDEWAYS: Record<DominoTileSize, string> = {
  xs: "w-12 h-6 sm:w-14 sm:h-7",
  sm: "w-14 h-7 sm:w-16 sm:h-8",
  md: "w-20 h-10 sm:w-24 sm:h-12",
  lg: "w-28 h-14 sm:w-32 sm:h-16",
};

const PIP_SIZE_CLASSES: Record<DominoTileSize, string> = {
  xs: "h-1 w-1",
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

const PIP_LAYOUTS: Record<number, Array<{ x: number; y: number }>> = {
  1: [{ x: 50, y: 50 }],
  2: [{ x: 30, y: 30 }, { x: 70, y: 70 }],
  3: [{ x: 30, y: 30 }, { x: 50, y: 50 }, { x: 70, y: 70 }],
  4: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 30, y: 70 }, { x: 70, y: 70 }],
  5: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 50, y: 50 }, { x: 30, y: 70 }, { x: 70, y: 70 }],
  6: [{ x: 30, y: 24 }, { x: 70, y: 24 }, { x: 30, y: 50 }, { x: 70, y: 50 }, { x: 30, y: 76 }, { x: 70, y: 76 }],
};

function flipTile(tile: DominoTile): DominoTile {
  return { left: tile.right, right: tile.left, id: tile.id };
}

function tilesShareValue(a: DominoTile, b: DominoTile): boolean {
  return a.left === b.left || a.left === b.right || a.right === b.left || a.right === b.right;
}

function orientTileChain(tiles: DominoTile[], leftEnd: number, rightEnd: number): DominoTile[] {
  if (tiles.length === 0) {
    return [];
  }

  if (tiles.length === 1) {
    const single = tiles[0];
    if (leftEnd >= 0 && single.right === leftEnd) {
      return [flipTile(single)];
    }
    return [single];
  }

  const oriented: DominoTile[] = [];
  const first = tiles[0];
  const firstCandidates = [first, flipTile(first)];
  const second = tiles[1];

  let bestFirst = firstCandidates[0];
  let bestFirstScore = Number.NEGATIVE_INFINITY;
  for (const candidate of firstCandidates) {
    let score = 0;
    if (leftEnd >= 0 && candidate.left === leftEnd) score += 4;
    if (tilesShareValue(candidate, second) && (candidate.right === second.left || candidate.right === second.right)) score += 3;
    if (leftEnd >= 0 && candidate.right === leftEnd) score -= 2;
    if (score > bestFirstScore) {
      bestFirstScore = score;
      bestFirst = candidate;
    }
  }

  oriented.push(bestFirst);

  for (let i = 1; i < tiles.length; i += 1) {
    const current = tiles[i];
    const candidates = [current, flipTile(current)];
    const need = oriented[i - 1].right;
    const next = i + 1 < tiles.length ? tiles[i + 1] : null;

    let best = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      let score = 0;
      if (candidate.left === need) score += 6;
      if (candidate.right === need) score += 2;
      if (next && tilesShareValue(candidate, next)) score += 1;
      if (i === tiles.length - 1 && rightEnd >= 0 && candidate.right === rightEnd) score += 3;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    oriented.push(best);
  }

  const lastIndex = oriented.length - 1;
  const lastTile = oriented[lastIndex];
  if (rightEnd >= 0 && lastTile.right !== rightEnd && lastTile.left === rightEnd) {
    oriented[lastIndex] = flipTile(lastTile);
  }

  return oriented;
}

// C18-F9: Wrapped in memo to prevent re-renders when parent updates unrelated state
const DominoTileComponent = memo(function DominoTileComponent({
  tile,
  isSelected,
  onClick,
  isPlayable,
  size = "md",
  rotation = 0,
}: {
  tile: DominoTile;
  isSelected?: boolean;
  onClick?: () => void;
  isPlayable?: boolean;
  size?: DominoTileSize;
  rotation?: number;
}) {
  const { t } = useI18n();

  const renderDots = (value: number) => {
    if (value === 0) {
      return (
        <div className="relative h-full w-full">
          <span className="absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2f2a22]/35" />
        </div>
      );
    }

    const pips = PIP_LAYOUTS[value] || [];

    return (
      <div className="relative h-full w-full">
        {pips.map((pip, index) => (
          <span
            key={`${value}-${index}`}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#101010] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_1px_rgba(0,0,0,0.35)]",
              PIP_SIZE_CLASSES[size],
            )}
            style={{ left: `${pip.x}%`, top: `${pip.y}%` }}
          />
        ))}
      </div>
    );
  };

  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isSideways = normalizedRotation === 90 || normalizedRotation === 270;
  const tileSizeClass = isSideways ? TILE_SIZES_SIDEWAYS[size] : TILE_SIZES[size];

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={isSelected ? true : undefined}
      aria-label={`${t('domino.tile')} ${tile.left}-${tile.right}${isSelected ? `, ${t('domino.selected')}` : ''}${isPlayable ? `, ${t('domino.playable')}` : ''}`}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        tileSizeClass,
        "domino-tile-shell relative overflow-hidden rounded-lg border-[1.5px] flex flex-col select-none transition-all duration-200",
        "border-[#3a3227] bg-[linear-gradient(146deg,#f6f0de_0%,#eee2c4_52%,#e4d2ad_100%)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_6px_10px_rgba(35,24,14,0.35)]",
        isSelected
          ? "domino-tile-selected border-[#d08f2d] ring-2 ring-[#d9a34a]/75 scale-[1.08] z-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_12px_18px_rgba(132,79,24,0.36)]"
          : "",
        isPlayable
          ? "domino-tile-can-play hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_12px_16px_rgba(35,24,14,0.35)]"
          : "opacity-80",
        isPlayable && !isSelected ? "domino-tile-playable" : "",
        onClick ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background" : "",
        onClick && isPlayable ? "cursor-pointer" : "cursor-default",
        isSideways ? "flex-row" : "flex-col"
      )}
      data-testid={`domino-tile-${tile.left}-${tile.right}`}
    >
      <div className="pointer-events-none absolute inset-x-1 top-1 h-[2px] rounded-full bg-white/50" />
      <div className={cn(
        "pointer-events-none absolute bg-[#3a3227]/35",
        isSideways
          ? "inset-y-1.5 left-1/2 w-px -translate-x-1/2"
          : "inset-x-2 top-1/2 h-px -translate-y-1/2"
      )} />
      <div className="pointer-events-none absolute inset-y-1 left-[2px] w-[2px] rounded-full bg-[#2e271f]/10" />
      <div className="pointer-events-none absolute inset-y-1 right-[2px] w-[2px] rounded-full bg-white/22" />
      <div className={cn(
        "flex-1 flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.44),rgba(255,255,255,0.08))]",
        isSideways ? "border-r border-[#5f5547]/40" : "border-b border-[#5f5547]/40"
      )}>
        {renderDots(tile.left)}
      </div>
      <div className="flex-1 flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.14))]">
        {renderDots(tile.right)}
      </div>
    </div>
  );
});

// C8-F7: Compact placeholder — shows count badge + mini tile stack (max 3 icons)
function PlaceholderTile({ count }: { count: number }) {
  const visibleCount = Math.min(count, 3);
  return (
    <div className="flex items-end gap-1">
      {Array.from({ length: visibleCount }).map((_, i) => (
        <div
          key={i}
          className="relative w-6 h-12 rounded-md border border-slate-900/70 bg-[linear-gradient(170deg,#1e3a8a_0%,#12306f_52%,#0b1f49_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_4px_8px_rgba(2,6,23,0.45)]"
          style={{ transform: `translateX(${-i * 5}px)`, zIndex: visibleCount - i }}
        >
          <div className="absolute inset-x-1 top-1 h-[2px] rounded-full bg-white/35" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-blue-300/20 border border-blue-200/15" />
          </div>
        </div>
      ))}
      {count > 3 && (
        <span className="text-xs font-semibold text-muted-foreground bg-muted/80 rounded-full px-1.5 py-0.5 border border-border/60">x{count}</span>
      )}
    </div>
  );
}

export function DominoBoard({
  gameState,
  currentTurn,
  isMyTurn,
  isSpectator,
  onMove,
  status,
  turnTimeLimit = 30,
}: DominoBoardProps) {
  const { t } = useI18n();
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const selectedTileRef = useRef(selectedTile); // C11-F4: ref for stable Escape handler
  selectedTileRef.current = selectedTile;
  const [drawPending, setDrawPending] = useState(false); // F9: prevent duplicate draw clicks
  const [movePending, setMovePending] = useState(false); // C10-F11: prevent duplicate place clicks
  const [passPending, setPassPending] = useState(false); // C11-F11: prevent duplicate pass
  const [timeLeft, setTimeLeft] = useState(turnTimeLimit);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoActionKeyRef = useRef<string | null>(null);
  const prevHandLenRef = useRef<number>(0); // F8: Track previous hand length for animation
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [anchorTileKey, setAnchorTileKey] = useState<string | null>(null);

  const state = useMemo<GameState>(() => {
    try {
      if (gameState) {
        // FIX: Accept both string (from server) and object (from DominoGame)
        if (typeof gameState === 'string') {
          return normalizeGameState(JSON.parse(gameState));
        }
        return normalizeGameState(gameState);
      }
    } catch {
      // C12-F7: Log parse failures for debugging
      console.warn('[DominoBoard] Failed to parse gameState');
      return INITIAL_STATE;
    }
    return INITIAL_STATE;
  }, [gameState]);

  // C12-F12: Single useMemo — eliminates redundant useCallback+useMemo pair
  const playableTiles = useMemo(() => {
    // C7-F3: Prefer server-provided validMoves when available
    if (state.validMoves && state.validMoves.length > 0) {
      const playMoves = state.validMoves.filter(m => m.type === 'play' && m.tile);
      if (playMoves.length > 0) {
        const grouped = new Map<number, ("left" | "right")[]>();
        for (const move of playMoves) {
          const mt = move.tile!;
          const idx = state.myHand.findIndex(h =>
            (h.left === mt.left && h.right === mt.right) ||
            (h.left === mt.right && h.right === mt.left)
          );
          if (idx !== -1) {
            if (!grouped.has(idx)) grouped.set(idx, []);
            if (move.end) grouped.get(idx)!.push(move.end as "left" | "right");
          }
        }
        return Array.from(grouped.entries()).map(([index, ends]) => ({ index, ends }));
      }
    }

    // Fallback: local computation
    if (state.boardTiles.length === 0) {
      return state.myHand.map((_, i) => ({ index: i, ends: ["left"] as ("left" | "right")[] }));
    }

    const playable: { index: number; ends: ("left" | "right")[] }[] = [];
    state.myHand.forEach((tile, index) => {
      const ends: ("left" | "right")[] = [];
      if (tile.left === state.leftEnd || tile.right === state.leftEnd) ends.push("left");
      if (tile.left === state.rightEnd || tile.right === state.rightEnd) ends.push("right");
      if (ends.length > 0) playable.push({ index, ends });
    });
    return playable;
  }, [state]);

  // C12-F2: Derive canPass from server validMoves — avoids one-frame lag from useEffect
  const canPass = useMemo(() => {
    if (state.validMoves && state.validMoves.length > 0) {
      return state.validMoves.some(m => m.type === 'pass');
    }
    // C14-F11: Default false — consistent with draw button's ?? false
    return playableTiles.length === 0 && (state.boneyard === 0 || !(state.canDraw ?? false));
  }, [state.validMoves, playableTiles, state.boneyard, state.canDraw]);

  const canAutoDraw = useMemo(() => {
    if (state.validMoves && state.validMoves.length > 0) {
      return state.validMoves.some(m => m.type === 'draw');
    }
    return state.canDraw ?? false;
  }, [state.validMoves, state.canDraw]);

  // F12: Clear selected tile when turn changes to avoid stale selection
  // C18-F4: Also reset when hand length changes (after draw, indices shift)
  useEffect(() => {
    setSelectedTile(null);
  }, [isMyTurn, currentTurn, state.myHand.length]);

  useEffect(() => {
    if (selectedTile === null) {
      return;
    }

    if (!playableTiles.some((playable) => playable.index === selectedTile)) {
      setSelectedTile(null);
    }
  }, [selectedTile, playableTiles]);

  // C9-F9: Escape key deselects currently selected tile
  // C11-F4: Stable listener via ref — avoids re-registering on every selection change
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTileRef.current !== null) {
        setSelectedTile(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // F9: Reset draw/move pending when state changes (draw completed or turn advanced)
  useEffect(() => {
    setDrawPending(false);
    setMovePending(false); // C10-F11
    setPassPending(false); // C11-F11
  }, [state.myHand.length, state.boneyard, isMyTurn]);

  // F8: Update previous hand length AFTER render
  useEffect(() => {
    prevHandLenRef.current = state.myHand.length;
  }, [state.myHand.length]);

  useEffect(() => {
    const updateViewport = () => {
      setIsNarrowViewport(window.innerWidth < 640);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (state.boardTiles.length === 0) {
      if (anchorTileKey !== null) {
        setAnchorTileKey(null);
      }
      return;
    }

    if (anchorTileKey) {
      const stillExists = state.boardTiles.some((entry) => tileSignature(entry.tile) === anchorTileKey);
      if (stillExists) {
        return;
      }
    }

    const fallbackIndex = state.boardTiles.length === 1
      ? 0
      : Math.floor((state.boardTiles.length - 1) / 2);
    const nextAnchorKey = tileSignature(state.boardTiles[fallbackIndex].tile);

    if (nextAnchorKey !== anchorTileKey) {
      setAnchorTileKey(nextAnchorKey);
    }
  }, [state.boardTiles, anchorTileKey]);

  // F1: Timer — reset on turn change only
  // C18-F6: Removed myHand.length and boneyard from deps — draw shouldn't reset timer
  useEffect(() => {
    setTimeLeft(turnTimeLimit);
    autoActionKeyRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isMyTurn || isSpectator || status === 'finished' || turnTimeLimit <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isMyTurn, currentTurn, turnTimeLimit, isSpectator, status]);

  const timeoutActionKey = useMemo(() => {
    const playableKey = playableTiles
      .map((playable) => `${playable.index}:${playable.ends.slice().sort().join('')}`)
      .join('|');
    return `${currentTurn ?? 'no-turn'}:${state.myHand.length}:${state.boneyard}:${playableKey}:${canAutoDraw ? 1 : 0}:${canPass ? 1 : 0}`;
  }, [currentTurn, state.myHand.length, state.boneyard, playableTiles, canAutoDraw, canPass]);

  // Auto-play when timer hits 0
  useEffect(() => {
    if (timeLeft !== 0 || !isMyTurn || isSpectator || status === 'finished') return;
    if (autoActionKeyRef.current === timeoutActionKey) return;
    autoActionKeyRef.current = timeoutActionKey;

    // Timeout policy: play a random valid tile/end; if none, draw when allowed; otherwise pass.
    if (playableTiles.length > 0) {
      const randomPlayable = playableTiles.length > 1
        ? playableTiles[Math.floor(Math.random() * playableTiles.length)]
        : playableTiles[0];
      const randomTile = randomPlayable ? state.myHand[randomPlayable.index] : undefined;

      if (randomPlayable && randomTile) {
        const ends: Array<'left' | 'right'> = randomPlayable.ends.length > 0 ? randomPlayable.ends : ['left'];
        const randomEnd = ends[Math.floor(Math.random() * ends.length)] || 'left';
        onMove({ tileLeft: randomTile.left, tileRight: randomTile.right, placedEnd: randomEnd, isPassed: false });
        return;
      }
    }

    if (canAutoDraw) {
      onMove({ tileLeft: -1, tileRight: -1, placedEnd: 'left', isPassed: false });
      return;
    }

    onMove({ tileLeft: 0, tileRight: 0, placedEnd: 'left', isPassed: true });
  }, [timeLeft, isMyTurn, isSpectator, status, canAutoDraw, state.myHand, playableTiles, onMove, timeoutActionKey]);

  // C13-F4: Shared player label helper — eliminates 3x inline duplication
  const getPlayerLabel = (pid: string): string => {
    const playerIdx = state.playerOrder?.indexOf(pid) ?? -1;
    const playerNo = Math.max(1, playerIdx + 1);
    // C14-F6: Clamp to minimum 1 — prevents "Player 0" when player not in order
    return pid.startsWith('bot-') ? `${t('domino.bot')} ${playerNo}` : `${t('domino.player')} ${playerNo}`;
  };

  const submitTileMove = (tileIndex: number, end: "left" | "right") => {
    if (movePending || !isMyTurn || isSpectator || status === 'finished') {
      return;
    }

    const tile = state.myHand[tileIndex];
    if (!tile) {
      return;
    }

    setMovePending(true);
    onMove({
      tileLeft: tile.left,
      tileRight: tile.right,
      placedEnd: end,
      isPassed: false,
    });
    setSelectedTile(null);
  };

  const handleTileClick = (index: number) => {
    if (isSpectator || !isMyTurn || status === "finished") return;

    const playable = playableTiles.find((tile) => tile.index === index);
    if (!playable) return;

    if (selectedTile !== index) {
      setSelectedTile(index);
      return;
    }

    const ends: Array<"left" | "right"> = playable.ends.length > 0 ? playable.ends : ["left"];
    const randomEnd = ends[Math.floor(Math.random() * ends.length)] ?? "left";
    submitTileMove(index, randomEnd);
  };

  const handlePlaceTile = (end: "left" | "right") => {
    if (selectedTile === null) {
      return;
    }

    const playable = playableTiles.find((tile) => tile.index === selectedTile);
    if (!playable || !playable.ends.includes(end)) {
      return;
    }

    submitTileMove(selectedTile, end);
  };

  const handleEndCapClick = (end: "left" | "right") => {
    handlePlaceTile(end);
  };

  const handlePass = () => {
    if (!isMyTurn || isSpectator || status === 'finished' || !canPass) return;
    if (passPending) return; // C11-F11: prevent duplicate
    setPassPending(true);
    const move: DominoMove = {
      tileLeft: 0,
      tileRight: 0,
      placedEnd: "left",
      isPassed: true,
    };
    onMove(move);
  };

  const handleDraw = () => {
    if (!isMyTurn || isSpectator || status === 'finished' || !canAutoDraw) return;
    if (drawPending) return; // F9: prevent duplicate
    setDrawPending(true);
    onMove({
      tileLeft: -1,
      tileRight: -1,
      placedEnd: "left",
      isPassed: false,
    });
  };

  const selectedPlayable = selectedTile !== null ? playableTiles.find(p => p.index === selectedTile) : null;
  const canChooseEnd = Boolean(selectedPlayable) && isMyTurn && !isSpectator && status !== 'finished';
  const leftEndSelectable = canChooseEnd && Boolean(selectedPlayable?.ends.includes("left"));
  const rightEndSelectable = canChooseEnd && Boolean(selectedPlayable?.ends.includes("right"));
  const timerProgress = turnTimeLimit > 0 ? Math.max(0, Math.min(1, timeLeft / turnTimeLimit)) : 0;
  const timerRingStyle = turnTimeLimit > 0
    ? { background: `conic-gradient(hsl(var(--primary)) ${timerProgress * 360}deg, hsl(var(--muted)) 0deg)` }
    : undefined;
  const isTurnLive = isMyTurn && !isSpectator && status !== 'finished';
  const isCompactMobile = isNarrowViewport;
  const boardTileCount = state.boardTiles.length;
  const boardLayoutMode = boardTileCount >= 28 ? "compact" : boardTileCount >= 18 ? "dense" : "normal";
  const boardTileSize: DominoTileSize = isCompactMobile ? "xs" : "sm";
  const boardGapClass = boardLayoutMode === "compact" ? "gap-0.5" : boardLayoutMode === "dense" ? "gap-1" : "gap-1.5";
  const boardEndCapClass = isCompactMobile
    ? "h-6 w-6 text-[11px]"
    : boardLayoutMode === "compact"
      ? "h-7 w-7 text-xs"
      : "h-8 w-8 text-sm";
  const tilesPerRow = isCompactMobile
    ? 5
    : boardLayoutMode === "compact"
      ? 8
      : boardLayoutMode === "dense"
        ? 7
        : 6;
  const sideSlotsPerRow = Math.max(1, Math.floor((tilesPerRow - 1) / 2));

  const orientedBoardTiles = useMemo(
    () => orientTileChain(state.boardTiles.map((entry) => entry.tile), state.leftEnd, state.rightEnd),
    [state.boardTiles, state.leftEnd, state.rightEnd],
  );

  const anchorTileIndex = useMemo(() => {
    if (state.boardTiles.length === 0) {
      return -1;
    }

    if (!anchorTileKey) {
      return Math.floor((state.boardTiles.length - 1) / 2);
    }

    const index = state.boardTiles.findIndex((entry) => tileSignature(entry.tile) === anchorTileKey);
    return index >= 0 ? index : Math.floor((state.boardTiles.length - 1) / 2);
  }, [state.boardTiles, anchorTileKey]);

  const anchoredRows = useMemo<AnchoredBoardRow[]>(() => {
    if (state.boardTiles.length === 0) {
      return [];
    }

    const entries: BoardRowEntry[] = state.boardTiles.map((item, index) => ({ item, index, sequenceIndex: index }));
    const safeAnchorIndex = anchorTileIndex >= 0 ? anchorTileIndex : Math.floor((entries.length - 1) / 2);
    const anchorEntry = entries[safeAnchorIndex];

    if (!anchorEntry) {
      return [];
    }

    const leftBranch = entries.slice(0, safeAnchorIndex);
    const rightBranch = entries.slice(safeAnchorIndex + 1);
    const rowCount = Math.max(
      1,
      Math.ceil(leftBranch.length / sideSlotsPerRow),
      Math.ceil(rightBranch.length / sideSlotsPerRow),
    );

    const rows: AnchoredBoardRow[] = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const leftEnd = leftBranch.length - rowIndex * sideSlotsPerRow;
      const leftStart = Math.max(0, leftEnd - sideSlotsPerRow);
      const leftEntries = leftBranch.slice(leftStart, leftEnd);

      const rightStart = rowIndex * sideSlotsPerRow;
      const rightEntries = rightBranch.slice(rightStart, rightStart + sideSlotsPerRow);

      const level = rowIndex === 0
        ? 0
        : rowIndex % 2 === 1
          ? -Math.ceil(rowIndex / 2)
          : Math.ceil(rowIndex / 2);

      rows.push({
        id: `anchored-row-${rowIndex}`,
        level,
        leftEntries,
        rightEntries,
        anchorEntry: rowIndex === 0 ? anchorEntry : undefined,
      });
    }

    return rows.sort((a, b) => a.level - b.level);
  }, [state.boardTiles, anchorTileIndex, sideSlotsPerRow]);

  const boardRowSpacing = isCompactMobile
    ? 32
    : boardLayoutMode === "compact"
      ? 34
      : boardLayoutMode === "dense"
        ? 38
        : 44;
  const maxRowDepth = useMemo(
    () => anchoredRows.reduce((maxDepth, row) => Math.max(maxDepth, Math.abs(row.level)), 0),
    [anchoredRows],
  );
  const boardSlotClass = boardTileSize === "xs" ? "w-12 sm:w-14" : "w-14 sm:w-16";
  const boardHeight = useMemo(() => {
    const minHeight = isCompactMobile ? 200 : 280;
    const maxHeight = isCompactMobile ? 260 : 360;
    const neededHeight = 120 + maxRowDepth * boardRowSpacing * 2;
    return Math.min(maxHeight, Math.max(minHeight, neededHeight));
  }, [isCompactMobile, maxRowDepth, boardRowSpacing]);
  const lastActionTileKey = state.lastAction?.tile ? tileSignature(state.lastAction.tile) : null;

  const renderBoardTile = (entry: BoardRowEntry, rowId: string) => {
    const orientedTile = orientedBoardTiles[entry.sequenceIndex] || entry.item.tile;
    const renderRotation = orientedTile.left === orientedTile.right ? 0 : 90;
    const tileKey = `${tileSignature(entry.item.tile)}-${entry.index}`;
    const isLastActionTile = lastActionTileKey !== null && tileSignature(entry.item.tile) === lastActionTileKey;

    return (
      <motion.div
        key={`${rowId}-${tileKey}`}
        initial={isLastActionTile ? { opacity: 0, y: -10, scale: 0.9, rotate: -4 } : false}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: boardLayoutMode === "normal" ? 0.2 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.72 }}
        className={cn(
          "shrink-0 transition-transform duration-300",
          isLastActionTile ? "animate-domino-place" : "opacity-95",
        )}
      >
        <DominoTileComponent
          tile={orientedTile}
          size={boardTileSize}
          rotation={renderRotation}
        />
      </motion.div>
    );
  };

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-none overflow-hidden rounded-2xl border border-[#6d4d34]/40 bg-[radial-gradient(circle_at_18%_18%,rgba(255,228,184,0.3),transparent_52%),radial-gradient(circle_at_82%_84%,rgba(24,16,10,0.34),transparent_50%),linear-gradient(160deg,rgba(106,70,42,0.18),rgba(40,25,17,0.28))] shadow-[0_22px_42px_rgba(25,12,4,0.32)]",
        isCompactMobile ? "p-2" : "p-3 sm:p-4",
      )}
      style={{ touchAction: 'manipulation' }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(120deg,rgba(255,255,255,0.16),transparent_35%,transparent_65%,rgba(0,0,0,0.12))]" />

      <div className={cn("relative flex flex-col", isCompactMobile ? "gap-2.5" : "gap-5")}>
        {/* F8: Per-opponent tile counts with player labels */}
        <div className={cn(
          "rounded-2xl border border-border/60 bg-background/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-sm",
          isCompactMobile ? "px-2 py-1.5" : "px-3 py-2",
        )}>
          <p className={cn("text-muted-foreground text-center", isCompactMobile ? "mb-1 text-[11px]" : "mb-2 text-xs sm:text-sm")}>
            {t('domino.opponentTiles')}
          </p>
          {Object.keys(state.opponentTileCounts).length > 0 ? (
            <div className={cn("justify-center flex-wrap", isCompactMobile ? "flex gap-1.5" : "flex gap-4")}>
              {Object.entries(state.opponentTileCounts).map(([pid, count]) => {
                const label = getPlayerLabel(pid);
                return (
                  isCompactMobile ? (
                    <span
                      key={pid}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/65 px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      <span className="font-semibold text-foreground">{count}</span>
                      <span>{label}</span>
                    </span>
                  ) : (
                    <div key={pid} className="flex flex-col items-center gap-1 rounded-xl border border-border/50 bg-background/55 px-3 py-2">
                      <PlaceholderTile count={count} />
                      <span className="text-xs text-muted-foreground">{label} ({count})</span>
                    </div>
                  )
                );
              })}
            </div>
          ) : (
            <div className="flex justify-center">
              <PlaceholderTile count={state.opponentTileCount} />
            </div>
          )}
        </div>

        {isCompactMobile ? (
          <div className="w-full overflow-x-auto">
            <div className="flex min-w-max items-center gap-2 pb-0.5">
              {state.lastAction && (
                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {(() => {
                    const pid = state.lastAction!.playerId;
                    const label = getPlayerLabel(pid);
                    if (state.lastAction!.type === 'draw') return `${label} ${t('domino.drewTile')}`;
                    if (state.lastAction!.type === 'pass') return `${label} ${t('domino.passedTurn')}`;
                    const tile = state.lastAction!.tile;
                    return tile
                      ? `${label} ${t('domino.played')} [${tile.left}|${tile.right}]`
                      : `${label} ${t('domino.played')}`;
                  })()}
                </span>
              )}

              {status !== 'finished' && (
                <span className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-sm",
                  isMyTurn
                    ? "bg-primary/90 text-primary-foreground border-primary/60"
                    : "bg-muted/85 text-muted-foreground border-border/60"
                )}>
                  {isMyTurn ? t('domino.yourTurn') : t('domino.opponentTurn')}
                </span>
              )}

              {turnTimeLimit > 0 && isMyTurn && !isSpectator && status !== 'finished' && (
                <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full p-[3px] shadow-[0_0_0_1px_rgba(255,255,255,0.2)]" style={timerRingStyle}>
                  <span className={cn(
                    "inline-flex h-full w-full items-center justify-center rounded-full text-xs font-bold",
                    timeLeft <= 5
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : "bg-background text-foreground"
                  )}>
                    {timeLeft}
                  </span>
                </span>
              )}

              <span className="inline-flex items-center gap-1 rounded-lg border border-border/65 bg-background/70 px-2 py-0.5 text-[11px]">
                <span className="text-muted-foreground">{t('domino.tiles')}</span>
                <span className="font-semibold">{state.boardTiles.length}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                <span>{t('domino.playable')}</span>
                <span className="font-semibold">{playableTiles.length}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-border/65 bg-background/70 px-2 py-0.5 text-[11px]">
                <span className="text-muted-foreground">{t('domino.draw')}</span>
                <span className="font-semibold">{state.boneyard}</span>
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* C7-F11: Last action notification — includes play moves */}
            {state.lastAction && (
              <div className="text-center">
                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary animate-[pulse_2.3s_ease-in-out_infinite] shadow-[0_6px_14px_rgba(59,130,246,0.18)] sm:text-sm">
                  {(() => {
                    const pid = state.lastAction!.playerId;
                    const label = getPlayerLabel(pid);
                    if (state.lastAction!.type === 'draw') return `${label} ${t('domino.drewTile')}`;
                    if (state.lastAction!.type === 'pass') return `${label} ${t('domino.passedTurn')}`;
                    const tile = state.lastAction!.tile;
                    return tile
                      ? `${label} ${t('domino.played')} [${tile.left}|${tile.right}]`
                      : `${label} ${t('domino.played')}`;
                  })()}
                </span>
              </div>
            )}

            {/* Turn indicator + timer */}
            {status !== 'finished' && (
              <div className="flex items-center justify-center gap-3">
                <span className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border shadow-sm sm:text-sm",
                  isMyTurn
                    ? "bg-primary/90 text-primary-foreground border-primary/60 animate-pulse"
                    : "bg-muted/85 text-muted-foreground border-border/60"
                )}>
                  {isMyTurn ? t('domino.yourTurn') : t('domino.opponentTurn')}
                </span>
                {turnTimeLimit > 0 && isMyTurn && !isSpectator && (
                  <span className="relative inline-flex items-center justify-center rounded-full p-[3px] w-10 h-10 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]" style={timerRingStyle}>
                    <span className={cn(
                      "inline-flex items-center justify-center w-full h-full rounded-full text-sm font-bold",
                      timeLeft <= 5
                        ? "bg-destructive text-destructive-foreground animate-pulse"
                        : "bg-background text-foreground"
                    )}>
                      {timeLeft}
                    </span>
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-3">
              <div className="rounded-xl border border-border/65 bg-background/70 px-2.5 py-1.5 text-center animate-domino-chip-rise">
                <div className="text-[10px] sm:text-xs text-muted-foreground">{t('domino.tiles')}</div>
                <div className="text-sm sm:text-base font-semibold">{state.boardTiles.length}</div>
              </div>
              <div className="rounded-xl border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-center animate-domino-chip-rise [animation-delay:60ms]">
                <div className="text-[10px] sm:text-xs text-primary/80">{t('domino.playable')}</div>
                <div className="text-sm sm:text-base font-semibold text-primary">{playableTiles.length}</div>
              </div>
              <div className="rounded-xl border border-border/65 bg-background/70 px-2.5 py-1.5 text-center animate-domino-chip-rise [animation-delay:120ms]">
                <div className="text-[10px] sm:text-xs text-muted-foreground">{t('domino.draw')}</div>
                <div className="text-sm sm:text-base font-semibold">{state.boneyard}</div>
              </div>
            </div>
          </>
        )}

        {/* F7: Scores display with player identity */}
        {!isCompactMobile && state.scores && Object.values(state.scores).some(s => s > 0) && (
          <div className="flex justify-center gap-3 flex-wrap">
            {Object.entries(state.scores).map(([pid, score]) => {
              const label = getPlayerLabel(pid);
              return (
                <div key={pid} className="text-center px-3 py-1.5 rounded-xl border border-border/55 bg-background/70 shadow-sm">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="ms-1 text-sm font-semibold text-foreground">{score}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* C7-F9: Blocked-game proximity warning */}
        {!isCompactMobile && state.passCount != null && state.passCount > 0 && status !== 'finished' && (
          <div className="flex justify-center">
            <span className={cn(
              "inline-flex items-center px-2.5 py-1 rounded-full text-xs border",
              state.passCount >= (state.playerCount ?? 2) - 1
                ? "border-amber-500/40 bg-amber-500/18 text-amber-600 animate-pulse font-semibold"
                : "border-border/60 bg-muted/70 text-muted-foreground"
            )}>
              {t('domino.pass')}: {state.passCount}/{state.playerCount ?? 2}
            </span>
          </div>
        )}

        <div
          className={cn(
            "domino-board-depth relative overflow-hidden rounded-2xl border border-[#1d4f3b]/70 bg-game-felt flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_18px_28px_rgba(8,26,19,0.4)]",
            isCompactMobile ? "p-2" : "p-4 sm:p-6",
            isTurnLive ? "domino-board-turn-live" : ""
          )}
          style={{ height: `${boardHeight}px` }}
          role="region"
          aria-label={state.boardTiles.length === 0
            ? (isSpectator ? t('domino.board') : t('domino.placeFirst'))
            : `${t('domino.board')}: ${state.boardTiles.length} ${t('domino.tiles')}, ${t('domino.leftEnd')}: ${state.leftEnd}, ${t('domino.rightEnd')}: ${state.rightEnd}`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(255,255,255,0.18),transparent_50%),radial-gradient(circle_at_78%_74%,rgba(0,0,0,0.3),transparent_46%)]" />
          <div className="pointer-events-none absolute inset-x-4 top-3 h-px bg-white/25" />

          {state.boardTiles.length > 0 && (
            <>
              <div className="absolute left-2 top-1/2 -translate-y-1/2">
                <button
                  type="button"
                  onClick={() => handleEndCapClick("left")}
                  disabled={!leftEndSelectable}
                  className={cn(
                    "domino-end-cap inline-flex items-center justify-center rounded-full border font-semibold text-white shadow-[0_6px_10px_rgba(0,0,0,0.25)] transition-all",
                    boardEndCapClass,
                    leftEndSelectable
                      ? "border-primary/70 bg-primary/30 ring-2 ring-primary/40"
                      : "border-white/35 bg-white/15",
                  )}
                  aria-label={t('domino.placeLeft')}
                  data-testid="button-endcap-left"
                >
                  {state.leftEnd}
                </button>
              </div>
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <button
                  type="button"
                  onClick={() => handleEndCapClick("right")}
                  disabled={!rightEndSelectable}
                  className={cn(
                    "domino-end-cap inline-flex items-center justify-center rounded-full border font-semibold text-white shadow-[0_6px_10px_rgba(0,0,0,0.25)] transition-all",
                    boardEndCapClass,
                    rightEndSelectable
                      ? "border-primary/70 bg-primary/30 ring-2 ring-primary/40"
                      : "border-white/35 bg-white/15",
                  )}
                  aria-label={t('domino.placeRight')}
                  data-testid="button-endcap-right"
                >
                  {state.rightEnd}
                </button>
              </div>
            </>
          )}

          {state.boardTiles.length === 0 ? (
            <p className="relative text-white/80 text-base sm:text-lg font-medium">
              {isSpectator ? t('domino.board') : t('domino.placeFirst')}
            </p>
          ) : (
            <div className="domino-board-lane relative h-full w-full max-w-full px-1 py-1">
              {anchoredRows.map((row) => {
                const leftPadCount = Math.max(0, sideSlotsPerRow - row.leftEntries.length);
                const rightPadCount = Math.max(0, sideSlotsPerRow - row.rightEntries.length);

                return (
                  <div
                    key={row.id}
                    className={cn(
                      "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center",
                      boardGapClass,
                    )}
                    style={{ top: `calc(50% + ${row.level * boardRowSpacing}px)` }}
                  >
                    {Array.from({ length: leftPadCount }).map((_, index) => (
                      <span
                        key={`${row.id}-left-pad-${index}`}
                        className={cn("block shrink-0 opacity-0", boardSlotClass)}
                        aria-hidden
                      />
                    ))}

                    {row.leftEntries.map((entry) => renderBoardTile(entry, row.id))}

                    {row.anchorEntry ? (
                      renderBoardTile(row.anchorEntry, row.id)
                    ) : (
                      <span className={cn("block shrink-0 opacity-0", boardSlotClass)} aria-hidden />
                    )}

                    {row.rightEntries.map((entry) => renderBoardTile(entry, row.id))}

                    {Array.from({ length: rightPadCount }).map((_, index) => (
                      <span
                        key={`${row.id}-right-pad-${index}`}
                        className={cn("block shrink-0 opacity-0", boardSlotClass)}
                        aria-hidden
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedTile !== null && selectedPlayable && (
          <div className="flex justify-center gap-3 flex-wrap rounded-xl border border-border/60 bg-background/65 p-2 animate-domino-fade-in">
            {selectedPlayable.ends.includes("left") && (
              <Button
                onClick={() => handlePlaceTile("left")}
                className="shadow-md"
                aria-label={t('domino.placeLeft')}
                data-testid="button-place-left"
              >
                {t('domino.placeLeft')}
              </Button>
            )}
            {selectedPlayable.ends.includes("right") && (
              <Button
                onClick={() => handlePlaceTile("right")}
                className="shadow-md"
                aria-label={t('domino.placeRight')}
                data-testid="button-place-right"
              >
                {t('domino.placeRight')}
              </Button>
            )}
          </div>
        )}

        <div className={cn(
          "rounded-2xl border border-[#83603f]/35 bg-[linear-gradient(170deg,rgba(255,255,255,0.95),rgba(248,240,227,0.88))] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_14px_28px_rgba(66,46,27,0.22)]",
          isCompactMobile ? "p-2.5" : "p-4",
        )}>
          <div className={cn("flex items-center justify-center gap-2", isCompactMobile ? "mb-2" : "mb-3")}>
            <p className={cn("text-muted-foreground text-center", isCompactMobile ? "text-[11px]" : "text-xs sm:text-sm")}>
              {t('domino.yourTiles')} ({state.myHand.length})
            </p>
            <span className={cn(
              "inline-flex items-center rounded-full border border-primary/25 bg-primary/10 font-semibold text-primary",
              isCompactMobile ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
            )}>
              {playableTiles.length}
            </span>
          </div>

          <div className={cn("flex flex-wrap justify-center", isCompactMobile ? "gap-1" : "gap-2")}>
            {state.myHand.map((tile, index) => {
              const isPlayable = playableTiles.some(p => p.index === index);
              const canInteract = isMyTurn && isPlayable && !isSpectator;
              // F8: Only animate tiles that are newly added (index >= previous hand length)
              const isNewTile = index >= prevHandLenRef.current;
              return (
                <motion.div
                  key={tile.id ?? `${tile.left}-${tile.right}-${index}`}
                  initial={isNewTile ? {
                    opacity: 0,
                    x: -18,
                    y: 8,
                    rotate: -5,
                    scale: 0.92,
                  } : false}
                  animate={{
                    opacity: 1,
                    x: 0,
                    y: 0,
                    rotate: 0,
                    scale: selectedTile === index ? 1.05 : 1,
                  }}
                  whileHover={canInteract ? { y: -4, scale: 1.045 } : undefined}
                  transition={{ type: "spring", stiffness: 300, damping: 24, mass: 0.65 }}
                  className={isNewTile ? "animate-domino-draw" : ""}
                  style={isNewTile ? { animationDelay: `${(index - prevHandLenRef.current) * 60}ms` } : undefined}
                >
                  <DominoTileComponent
                    tile={tile}
                    isSelected={selectedTile === index}
                    onClick={canInteract ? () => handleTileClick(index) : undefined}
                    isPlayable={canInteract}
                    size={isCompactMobile ? "xs" : "sm"}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* F5: Button container — use server canDraw for draw eligibility */}
        <div className={cn("flex justify-center flex-wrap animate-domino-fade-in", isCompactMobile ? "gap-2" : "gap-3")}>
          {canAutoDraw && isMyTurn && !isSpectator && (
            <Button
              variant="secondary"
              onClick={handleDraw}
              disabled={drawPending}
              size={isCompactMobile ? "sm" : "default"}
              className="shadow-md border border-border/70"
              aria-label={`${t('domino.draw')} - ${state.boneyard} ${t('domino.tilesRemaining')}`}
              data-testid="button-draw"
            >
              {drawPending ? '...' : `${t('domino.draw')} (${state.boneyard})${state.maxDraws ? ` [${state.drawsThisTurn ?? 0}/${state.maxDraws}]` : ''}`}
            </Button>
          )}
          {canPass && isMyTurn && !isSpectator && (
            <Button
              variant="outline"
              onClick={handlePass}
              disabled={passPending}
              size={isCompactMobile ? "sm" : "default"}
              className="shadow-md border-border/80"
              aria-label={t('domino.pass')}
              data-testid="button-pass"
            >
              {passPending ? '...' : t('domino.pass')}
            </Button>
          )}
        </div>
      </div>

      {status === "finished" && (
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] flex items-center justify-center rounded-2xl">
          <span className="px-4 py-2 rounded-xl border border-white/30 bg-black/35 text-2xl font-bold text-white drop-shadow-lg">
            {t('domino.gameOver')}
          </span>
        </div>
      )}
    </div>
  );
}
