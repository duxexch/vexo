import { useState, useEffect, useMemo, useRef, memo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { motion } from "framer-motion";
import { Clock3 } from "lucide-react";

type DominoTileSize = "xs" | "sm" | "md" | "lg";

interface DominoBoardProps {
  gameState?: string | Record<string, unknown>;
  currentTurn?: string;
  isMyTurn: boolean;
  isSpectator: boolean;
  onMove: (move: DominoMove) => void;
  status?: string;
  turnTimeLimit?: number; // seconds per turn (0 = no limit)
  turnStartedAtMs?: number;
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

interface DominoPathPlacement extends BoardRowEntry {
  x: number;
  y: number;
  renderRotation: number;
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

function orientPlacementTile(
  tile: DominoTile,
  end: "left" | "right",
  leftEnd: number,
  rightEnd: number,
): DominoTile {
  if (end === "left") {
    if (tile.right === leftEnd) return tile;
    if (tile.left === leftEnd) return flipTile(tile);
    return tile;
  }

  if (tile.left === rightEnd) return tile;
  if (tile.right === rightEnd) return flipTile(tile);
  return tile;
}

type DominoDirection = "left" | "right" | "up" | "down";

function resolveBoardRenderRotation(tile: DominoTile, rotation?: number): number {
  return Number.isFinite(rotation)
    ? (rotation as number)
    : (tile.left === tile.right ? 0 : 90);
}

function resolvePlacementRotation(tile: DominoTile, direction: DominoDirection): number {
  const flowRotation = direction === "left" || direction === "right" ? 90 : 0;
  return tile.left === tile.right ? (flowRotation === 90 ? 0 : 90) : flowRotation;
}

function getDirectionSign(direction: DominoDirection): number {
  return direction === "left" || direction === "up" ? -1 : 1;
}

function getTileFootprint(renderRotation: number, compact: boolean) {
  const long = compact ? 56 : 80;
  const short = compact ? 28 : 40;
  const normalizedRotation = ((renderRotation % 360) + 360) % 360;
  const isSideways = normalizedRotation === 90 || normalizedRotation === 270;
  return {
    halfWidth: (isSideways ? long : short) / 2,
    halfHeight: (isSideways ? short : long) / 2,
  };
}

function getConnectedTileDelta(
  direction: DominoDirection,
  nextDirection: DominoDirection,
  currentFootprint: { halfWidth: number; halfHeight: number },
  nextFootprint: { halfWidth: number; halfHeight: number },
  seamOverlap: number,
) {
  if (direction === nextDirection) {
    if (direction === "left" || direction === "right") {
      return {
        dx: getDirectionSign(direction) * Math.max(0, currentFootprint.halfWidth + nextFootprint.halfWidth - seamOverlap),
        dy: 0,
      };
    }

    return {
      dx: 0,
      dy: getDirectionSign(direction) * Math.max(0, currentFootprint.halfHeight + nextFootprint.halfHeight - seamOverlap),
    };
  }

  const cornerOverlap = seamOverlap / 2;

  if (direction === "left" || direction === "right") {
    return {
      dx: getDirectionSign(direction) * Math.max(0, currentFootprint.halfWidth - cornerOverlap),
      dy: getDirectionSign(nextDirection) * Math.max(0, nextFootprint.halfHeight - cornerOverlap),
    };
  }

  return {
    dx: getDirectionSign(nextDirection) * Math.max(0, nextFootprint.halfWidth - cornerOverlap),
    dy: getDirectionSign(direction) * Math.max(0, currentFootprint.halfHeight - cornerOverlap),
  };
}

function buildDominoSnakePlacements(
  entries: BoardRowEntry[],
  side: "left" | "right",
  compact: boolean,
  anchorRenderRotation: number,
  horizontalRunOverride?: number,
): DominoPathPlacement[] {
  if (entries.length === 0) return [];

  const seamOverlap = compact ? 1.15 : 1.65;
  const defaultHorizontalRun = compact ? 3 : 4;
  const horizontalRun = Math.max(3, horizontalRunOverride ?? defaultHorizontalRun);
  const verticalRun = compact ? 1 : 2;
  const directions = side === "left"
    ? (["left", "down", "right", "up"] as const)
    : (["right", "up", "left", "down"] as const);

  const firstDirection = directions[0];
  const firstRotation = resolvePlacementRotation(entries[0].item.tile, firstDirection);
  const anchorFootprint = getTileFootprint(anchorRenderRotation, compact);
  const firstFootprint = getTileFootprint(firstRotation, compact);
  const firstGap = Math.max(0, anchorFootprint.halfWidth + firstFootprint.halfWidth - seamOverlap);

  let x = side === "left" ? -firstGap : firstGap;
  let y = 0;
  let directionIndex = 0;
  let segmentRemaining = horizontalRun;

  return entries.map((entry, index) => {
    const direction = directions[directionIndex % directions.length];
    const nextDirection = segmentRemaining === 1
      ? directions[(directionIndex + 1) % directions.length]
      : direction;
    const renderRotation = resolvePlacementRotation(entry.item.tile, direction);

    const placement: DominoPathPlacement = {
      ...entry,
      x,
      y,
      renderRotation,
    };

    const nextEntry = entries[index + 1];
    if (nextEntry) {
      const nextRenderRotation = resolvePlacementRotation(nextEntry.item.tile, nextDirection);
      const currentFootprint = getTileFootprint(renderRotation, compact);
      const nextFootprint = getTileFootprint(nextRenderRotation, compact);
      const delta = getConnectedTileDelta(direction, nextDirection, currentFootprint, nextFootprint, seamOverlap);
      x += delta.dx;
      y += delta.dy;
    }

    segmentRemaining -= 1;
    if (segmentRemaining <= 0) {
      directionIndex += 1;
      const upcomingDirection = directions[directionIndex % directions.length];
      segmentRemaining = upcomingDirection === "left" || upcomingDirection === "right"
        ? horizontalRun
        : verticalRun;
    }

    return placement;
  });
}

function getDominoPlacementBounds(
  placements: Array<{ x: number; y: number; renderRotation: number }>,
  compact: boolean,
) {
  if (placements.length === 0) {
    return { offsetX: 0, offsetY: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const placement of placements) {
    const { halfWidth, halfHeight } = getTileFootprint(placement.renderRotation, compact);

    minX = Math.min(minX, placement.x - halfWidth);
    maxX = Math.max(maxX, placement.x + halfWidth);
    minY = Math.min(minY, placement.y - halfHeight);
    maxY = Math.max(maxY, placement.y + halfHeight);
  }

  return {
    offsetX: -((minX + maxX) / 2),
    offsetY: -((minY + maxY) / 2),
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
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
  turnStartedAtMs,
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
  const prevHandLenRef = useRef<number>(0); // F8: Track previous hand length for animation
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [anchorTileKey, setAnchorTileKey] = useState<string | null>(null);
  const boardLaneRef = useRef<HTMLDivElement | null>(null);
  const [boardLaneSize, setBoardLaneSize] = useState({ width: 0, height: 0 });

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
      setIsNarrowViewport(window.innerWidth < 768);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const laneElement = boardLaneRef.current;
    if (!laneElement || typeof ResizeObserver === "undefined") {
      return;
    }

    const measure = () => {
      const rect = laneElement.getBoundingClientRect();
      const nextWidth = Math.max(0, Math.round(rect.width));
      const nextHeight = Math.max(0, Math.round(rect.height));
      setBoardLaneSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    measure();

    const observer = new ResizeObserver(() => {
      measure();
    });

    observer.observe(laneElement);

    return () => {
      observer.disconnect();
    };
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

    // Keep the first placed tile anchored at center for the whole round.
    const nextAnchorKey = tileSignature(state.boardTiles[0].tile);

    if (nextAnchorKey !== anchorTileKey) {
      setAnchorTileKey(nextAnchorKey);
    }
  }, [state.boardTiles, anchorTileKey]);

  // Server-aligned timer display: render countdown from authoritative turn start.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (turnTimeLimit <= 0) {
      setTimeLeft(0);
      return;
    }

    const computeRemaining = () => {
      if (!isMyTurn || isSpectator || status === "finished") {
        return turnTimeLimit;
      }

      if (typeof turnStartedAtMs !== "number" || !Number.isFinite(turnStartedAtMs)) {
        return turnTimeLimit;
      }

      const elapsedSec = Math.floor((Date.now() - turnStartedAtMs) / 1000);
      return Math.max(0, turnTimeLimit - Math.max(0, elapsedSec));
    };

    setTimeLeft(computeRemaining());

    if (!isMyTurn || isSpectator || status === "finished") {
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(computeRemaining());
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentTurn, isMyTurn, isSpectator, status, turnStartedAtMs, turnTimeLimit]);

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

    if (playable.ends.length === 1) {
      submitTileMove(index, playable.ends[0]);
    }
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
  const selectedTileData = selectedTile !== null ? state.myHand[selectedTile] : undefined;
  const leftGhostTile = selectedTileData && leftEndSelectable
    ? orientPlacementTile(selectedTileData, "left", state.leftEnd, state.rightEnd)
    : null;
  const rightGhostTile = selectedTileData && rightEndSelectable
    ? orientPlacementTile(selectedTileData, "right", state.leftEnd, state.rightEnd)
    : null;
  const isTurnLive = isMyTurn && !isSpectator && status !== 'finished';
  const isCompactMobile = isNarrowViewport;
  const boardTileSize: DominoTileSize = isCompactMobile ? "sm" : "md";

  const anchorTileIndex = useMemo(() => {
    if (state.boardTiles.length === 0) {
      return -1;
    }

    if (!anchorTileKey) return 0;

    const index = state.boardTiles.findIndex((entry) => tileSignature(entry.tile) === anchorTileKey);
    return index >= 0 ? index : 0;
  }, [state.boardTiles, anchorTileKey]);

  const boardEntries = useMemo<BoardRowEntry[]>(
    () => state.boardTiles.map((item, index) => ({ item, index, sequenceIndex: index })),
    [state.boardTiles],
  );
  const anchorEntry = useMemo(
    () => (anchorTileIndex >= 0 ? boardEntries[anchorTileIndex] : undefined),
    [boardEntries, anchorTileIndex],
  );
  const anchorRenderRotation = useMemo(
    () => (anchorEntry ? resolveBoardRenderRotation(anchorEntry.item.tile, anchorEntry.item.rotation) : 90),
    [anchorEntry],
  );

  const snakeHorizontalRun = useMemo(() => {
    const laneWidth = boardLaneSize.width > 0
      ? boardLaneSize.width
      : (isCompactMobile ? 320 : 760);
    const tileLongSide = isCompactMobile ? 56 : 80;
    const seamOverlap = isCompactMobile ? 1.15 : 1.65;
    const rawRun = Math.floor((laneWidth - 26) / Math.max(1, tileLongSide - seamOverlap));
    const minRun = isCompactMobile ? 3 : 4;
    const maxRun = isCompactMobile ? 5 : 7;
    return Math.max(minRun, Math.min(maxRun, rawRun));
  }, [boardLaneSize.width, isCompactMobile]);

  const leftPlacements = useMemo(
    () => buildDominoSnakePlacements(
      anchorTileIndex > 0 ? [...boardEntries.slice(0, anchorTileIndex)].reverse() : [],
      "left",
      isCompactMobile,
      anchorRenderRotation,
      snakeHorizontalRun,
    ),
    [boardEntries, anchorTileIndex, isCompactMobile, anchorRenderRotation, snakeHorizontalRun],
  );

  const rightPlacements = useMemo(
    () => buildDominoSnakePlacements(
      anchorTileIndex >= 0 ? boardEntries.slice(anchorTileIndex + 1) : [],
      "right",
      isCompactMobile,
      anchorRenderRotation,
      snakeHorizontalRun,
    ),
    [boardEntries, anchorTileIndex, isCompactMobile, anchorRenderRotation, snakeHorizontalRun],
  );

  const boardBounds = useMemo(() => {
    const placementsForBounds = [
      ...leftPlacements,
      ...(anchorEntry ? [{ x: 0, y: 0, renderRotation: anchorRenderRotation }] : []),
      ...rightPlacements,
    ];
    return getDominoPlacementBounds(placementsForBounds, isCompactMobile);
  }, [leftPlacements, anchorEntry, rightPlacements, isCompactMobile, anchorRenderRotation]);

  const boardHeight = useMemo(() => {
    const minHeight = isCompactMobile
      ? (isSpectator ? 244 : 278)
      : (isSpectator ? 338 : 392);
    const verticalPadding = isCompactMobile ? 48 : 72;
    const requiredHeight = Math.ceil(boardBounds.height + verticalPadding);
    return Math.max(minHeight, requiredHeight);
  }, [boardBounds.height, isCompactMobile, isSpectator]);

  const boardZoom = useMemo(() => {
    const safePadding = isCompactMobile ? 24 : 40;
    const fallbackWidth = Math.max(boardBounds.width + safePadding * 2, isCompactMobile ? 320 : 760);
    const fallbackHeight = Math.max(boardBounds.height + safePadding * 2, boardHeight);
    const laneWidth = boardLaneSize.width > 0 ? boardLaneSize.width : fallbackWidth;
    const laneHeight = boardLaneSize.height > 0 ? boardLaneSize.height : fallbackHeight;
    const availableWidth = Math.max(140, laneWidth - safePadding * 2);
    const availableHeight = Math.max(120, laneHeight - safePadding * 2);
    const fitWidthZoom = availableWidth / Math.max(boardBounds.width, 1);
    const fitHeightZoom = availableHeight / Math.max(boardBounds.height, 1);
    const fitZoom = Math.min(1, fitWidthZoom, fitHeightZoom);
    const minReadableZoom = isCompactMobile ? 0.86 : 0.9;
    return Math.max(minReadableZoom, fitZoom);
  }, [isCompactMobile, boardBounds.width, boardBounds.height, boardLaneSize.width, boardLaneSize.height, boardHeight]);

  const turnFlowHint = useMemo(() => {
    if (!isTurnLive) {
      return null;
    }

    if (playableTiles.length > 0) {
      return `${t('domino.play')} - ${t('domino.selectEnd')}`;
    }

    if (canAutoDraw) {
      return `${t('domino.draw')} -> ${t('domino.play')}`;
    }

    if (canPass) {
      return `${t('domino.pass')} -> ${t('domino.opponentTurn')}`;
    }

    return null;
  }, [isTurnLive, playableTiles.length, canAutoDraw, canPass, t]);

  const boardOffset = useMemo(() => ({
    offsetX: boardBounds.offsetX,
    offsetY: boardBounds.offsetY,
  }), [boardBounds.offsetX, boardBounds.offsetY]);
  const lastActionTileKey = state.lastAction?.tile ? tileSignature(state.lastAction.tile) : null;

  const leftPreviewPlacement = useMemo(() => {
    if (!leftGhostTile || !leftEndSelectable) {
      return null;
    }

    if (state.boardTiles.length === 0) {
      return {
        x: 0,
        y: 0,
        renderRotation: leftGhostTile.left === leftGhostTile.right ? 0 : 90,
      };
    }

    const previewEntries = [
      ...(anchorTileIndex > 0 ? [...boardEntries.slice(0, anchorTileIndex)].reverse() : []),
      {
        item: {
          tile: leftGhostTile,
          rotation: 0,
        },
        index: -1,
        sequenceIndex: -1,
      },
    ];

    const previewPlacements = buildDominoSnakePlacements(
      previewEntries,
      "left",
      isCompactMobile,
      anchorRenderRotation,
      snakeHorizontalRun,
    );

    return previewPlacements[previewPlacements.length - 1] ?? null;
  }, [
    leftGhostTile,
    leftEndSelectable,
    state.boardTiles.length,
    anchorTileIndex,
    boardEntries,
    isCompactMobile,
    anchorRenderRotation,
    snakeHorizontalRun,
  ]);

  const rightPreviewPlacement = useMemo(() => {
    if (!rightGhostTile || !rightEndSelectable) {
      return null;
    }

    if (state.boardTiles.length === 0) {
      return {
        x: 0,
        y: 0,
        renderRotation: rightGhostTile.left === rightGhostTile.right ? 0 : 90,
      };
    }

    const previewEntries = [
      ...(anchorTileIndex >= 0 ? boardEntries.slice(anchorTileIndex + 1) : []),
      {
        item: {
          tile: rightGhostTile,
          rotation: 0,
        },
        index: -1,
        sequenceIndex: -1,
      },
    ];

    const previewPlacements = buildDominoSnakePlacements(
      previewEntries,
      "right",
      isCompactMobile,
      anchorRenderRotation,
      snakeHorizontalRun,
    );

    return previewPlacements[previewPlacements.length - 1] ?? null;
  }, [
    rightGhostTile,
    rightEndSelectable,
    state.boardTiles.length,
    anchorTileIndex,
    boardEntries,
    isCompactMobile,
    anchorRenderRotation,
    snakeHorizontalRun,
  ]);

  const leftGhostScreenPosition = useMemo(() => {
    if (!leftPreviewPlacement) {
      return null;
    }

    return {
      x: (leftPreviewPlacement.x + boardOffset.offsetX) * boardZoom,
      y: (leftPreviewPlacement.y + boardOffset.offsetY) * boardZoom,
      rotation: leftPreviewPlacement.renderRotation,
    };
  }, [leftPreviewPlacement, boardOffset.offsetX, boardOffset.offsetY, boardZoom]);

  const rightGhostScreenPosition = useMemo(() => {
    if (!rightPreviewPlacement) {
      return null;
    }

    return {
      x: (rightPreviewPlacement.x + boardOffset.offsetX) * boardZoom,
      y: (rightPreviewPlacement.y + boardOffset.offsetY) * boardZoom,
      rotation: rightPreviewPlacement.renderRotation,
    };
  }, [rightPreviewPlacement, boardOffset.offsetX, boardOffset.offsetY, boardZoom]);

  const renderBoardTile = (entry: BoardRowEntry, rowId: string, forcedRotation?: number) => {
    const boardTile = entry.item.tile;
    const renderRotation = typeof forcedRotation === "number"
      ? forcedRotation
      : resolveBoardRenderRotation(boardTile, entry.item.rotation);
    const tileKey = `${tileSignature(entry.item.tile)}-${entry.index}`;
    const isLastActionTile = lastActionTileKey !== null && tileSignature(entry.item.tile) === lastActionTileKey;

    return (
      <motion.div
        key={`${rowId}-${tileKey}`}
        initial={isLastActionTile ? { opacity: 0, y: -10, scale: 0.9, rotate: -4 } : false}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0.2 }}
        transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.72 }}
        className={cn(
          "shrink-0 transition-transform duration-300",
          isLastActionTile ? "animate-domino-place" : "opacity-95",
        )}
      >
        <DominoTileComponent
          tile={boardTile}
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

      <div className={cn("relative flex flex-col", isCompactMobile ? (isSpectator ? "gap-2" : "gap-2.5") : "gap-5")}>
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

        {(turnTimeLimit > 0 || (state.scores && Object.values(state.scores).some((s) => s >= 0)) || (state.passCount != null && state.passCount > 0)) && (
          <div className={cn("flex flex-wrap items-center justify-center", isCompactMobile ? "gap-1.5" : "gap-2")}>
            {turnTimeLimit > 0 && status !== 'finished' && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm",
                  timeLeft <= 5
                    ? "border-rose-500/45 bg-rose-500/12 text-rose-600 animate-pulse"
                    : isTurnLive
                      ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-600"
                      : "border-border/60 bg-background/75 text-muted-foreground",
                )}
                aria-live={isTurnLive ? "polite" : undefined}
              >
                <Clock3 className="h-3.5 w-3.5" />
                <span>{Math.max(0, timeLeft)}s</span>
              </span>
            )}

            {state.passCount != null && state.passCount > 0 && status !== 'finished' && (
              <span className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                state.passCount >= (state.playerCount ?? 2) - 1
                  ? "border-amber-500/40 bg-amber-500/18 text-amber-600"
                  : "border-border/60 bg-background/75 text-muted-foreground"
              )}>
                {t('domino.pass')}: {state.passCount}/{state.playerCount ?? 2}
              </span>
            )}

            {turnFlowHint && (
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                {turnFlowHint}
              </span>
            )}

            {state.scores && Object.entries(state.scores).length > 0 && Object.entries(state.scores).map(([pid, score]) => {
              const label = getPlayerLabel(pid);
              return (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-2.5 py-1 text-[11px] text-foreground shadow-sm"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">{score}</span>
                </span>
              );
            })}
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

          {selectedTileData && (leftGhostTile || rightGhostTile) && (
            <>
              {leftGhostTile && leftGhostScreenPosition && (
                <button
                  type="button"
                  onClick={() => handlePlaceTile("left")}
                  className={cn(
                    "absolute left-1/2 top-1/2 z-20 transition-transform",
                    leftEndSelectable ? "cursor-pointer" : "cursor-default",
                  )}
                  style={{
                    transform: `translate(calc(-50% + ${leftGhostScreenPosition.x}px), calc(-50% + ${leftGhostScreenPosition.y}px))`,
                  }}
                  aria-label={t('domino.placeLeft')}
                >
                  <div className="rounded-lg border border-dashed border-primary/70 bg-primary/15 p-1 shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
                    <div className="opacity-50 saturate-110">
                      <DominoTileComponent
                        tile={leftGhostTile}
                        size={boardTileSize}
                        rotation={leftGhostScreenPosition.rotation}
                        isPlayable
                      />
                    </div>
                  </div>
                </button>
              )}

              {rightGhostTile && rightGhostScreenPosition && (
                <button
                  type="button"
                  onClick={() => handlePlaceTile("right")}
                  className={cn(
                    "absolute left-1/2 top-1/2 z-20 transition-transform",
                    rightEndSelectable ? "cursor-pointer" : "cursor-default",
                  )}
                  style={{
                    transform: `translate(calc(-50% + ${rightGhostScreenPosition.x}px), calc(-50% + ${rightGhostScreenPosition.y}px))`,
                  }}
                  aria-label={t('domino.placeRight')}
                >
                  <div className="rounded-lg border border-dashed border-primary/70 bg-primary/15 p-1 shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
                    <div className="opacity-50 saturate-110">
                      <DominoTileComponent
                        tile={rightGhostTile}
                        size={boardTileSize}
                        rotation={rightGhostScreenPosition.rotation}
                        isPlayable
                      />
                    </div>
                  </div>
                </button>
              )}
            </>
          )}

          {state.boardTiles.length === 0 ? (
            <p className="relative text-white/80 text-base sm:text-lg font-medium">
              {isSpectator ? t('domino.board') : t('domino.placeFirst')}
            </p>
          ) : (
            <div ref={boardLaneRef} className="domino-board-lane relative h-full w-full max-w-full px-3 py-2 sm:px-5 sm:py-4">
              {anchorEntry && (
                <>
                  {leftPlacements.map((placement) => (
                    <div
                      key={`left-${placement.index}`}
                      className="absolute left-1/2 top-1/2"
                      style={{
                        transform: `translate(calc(-50% + ${(placement.x + boardOffset.offsetX) * boardZoom}px), calc(-50% + ${(placement.y + boardOffset.offsetY) * boardZoom}px)) scale(${boardZoom})`,
                        transformOrigin: "center center",
                      }}
                    >
                      {renderBoardTile(placement, "left-snake", placement.renderRotation)}
                    </div>
                  ))}

                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      transform: `translate(calc(-50% + ${boardOffset.offsetX * boardZoom}px), calc(-50% + ${boardOffset.offsetY * boardZoom}px)) scale(${boardZoom})`,
                      transformOrigin: "center center",
                    }}
                  >
                    {renderBoardTile(anchorEntry, "anchor")}
                  </div>

                  {rightPlacements.map((placement) => (
                    <div
                      key={`right-${placement.index}`}
                      className="absolute left-1/2 top-1/2"
                      style={{
                        transform: `translate(calc(-50% + ${(placement.x + boardOffset.offsetX) * boardZoom}px), calc(-50% + ${(placement.y + boardOffset.offsetY) * boardZoom}px)) scale(${boardZoom})`,
                        transformOrigin: "center center",
                      }}
                    >
                      {renderBoardTile(placement, "right-snake", placement.renderRotation)}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {!isSpectator && (
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
                      y: selectedTile === index ? -8 : 0,
                      rotate: 0,
                      scale: selectedTile === index ? 1.08 : 1,
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
        )}

        {/* F5: Button container — use server canDraw for draw eligibility */}
        {!isSpectator && (
          <div className={cn("flex justify-center flex-wrap animate-domino-fade-in", isCompactMobile ? "gap-2" : "gap-3")}>
            {canChooseEnd && selectedPlayable && selectedPlayable.ends.length > 1 && (
              <p className="w-full text-center text-[11px] font-medium text-muted-foreground">
                {t('domino.selectEnd')}
              </p>
            )}

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
        )}
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
