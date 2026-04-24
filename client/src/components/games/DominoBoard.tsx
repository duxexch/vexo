import { useState, useEffect, useMemo, useRef, memo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useDominoSpeedMultiplier } from "@/lib/domino-speed";
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
  // C19-F1: Direction the chain was flowing when this tile was placed. Needed
  // to decide whether the visual halves must be swapped so the matching pip
  // sits on the edge that touches the previous tile (e.g. a tile placed
  // leftward of the anchor needs its matching pip on the RIGHT, not the LEFT).
  direction: DominoDirection;
  layoutScale: number;
}

export interface DominoRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface DominoPlacementResult {
  placements: DominoPathPlacement[];
  layoutScale: number;
  telemetry: DominoLayoutTelemetry;
}

export interface DominoLayoutTelemetry {
  tilesCount: number;
  iterationsUsed: number;
  shrinkSteps: number;
  failedAttempts: number;
  overflowed: boolean;
}

const LAYOUT_QUANTIZATION = 1000;

const shouldLogDominoLayoutTelemetry =
  typeof window !== "undefined"
  && (window as Window & { __VEX_DEBUG_DOMINO_LAYOUT__?: boolean }).__VEX_DEBUG_DOMINO_LAYOUT__ === true;

class LayoutOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutOverflowError";
  }
}

function createBaseTelemetry(tilesCount: number): DominoLayoutTelemetry {
  return {
    tilesCount,
    iterationsUsed: 0,
    shrinkSteps: 0,
    failedAttempts: 0,
    overflowed: false,
  };
}

function serializeLayoutTilesForHash(tiles: Array<{ key: string; x: number; y: number; renderRotation: number; layoutScale: number }>): string {
  return JSON.stringify(tiles);
}

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashDominoLayoutTiles(
  tiles: Array<{ key: string; x: number; y: number; renderRotation: number; layoutScale: number }>,
): Promise<string> {
  const serialized = serializeLayoutTilesForHash(tiles);

  if (typeof TextEncoder === "undefined") {
    return fnv1aHash(serialized);
  }

  const encoded = new TextEncoder().encode(serialized);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
    return bytesToHex(new Uint8Array(digest));
  }

  return fnv1aHash(serialized);
}

export async function hashDominoLayoutOutput(output: LayoutOutput): Promise<string> {
  return hashDominoLayoutTiles(output.tiles);
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

  const boardTilesRaw = (Array.isArray(rawState.boardTiles) ? rawState.boardTiles : [])
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

  const boardTiles: { tile: DominoTile; rotation: number }[] = [];
  const seenBoardTiles = new Set<string>();
  for (const entry of boardTilesRaw) {
    const key = tileSignature(entry.tile);
    if (seenBoardTiles.has(key)) {
      continue;
    }
    seenBoardTiles.add(key);
    boardTiles.push(entry);
  }

  // C19-F1: Dev-only sanity check. The server guarantees the chain invariant
  // `board[i].right === board[i+1].left` (engine.ts flips tiles on placement
  // to maintain this). If we ever receive a board that violates it, the
  // visual flip rule will produce nonsense — surface a console warning so
  // the bug is caught instead of silently rendering misaligned tiles.
  if (import.meta.env?.DEV && boardTiles.length > 1) {
    for (let i = 0; i < boardTiles.length - 1; i += 1) {
      const current = boardTiles[i].tile;
      const next = boardTiles[i + 1].tile;
      if (current.right !== next.left) {
        console.warn(
          `[DominoBoard] Chain invariant violated at index ${i}: ` +
            `board[${i}].right=${current.right} but board[${i + 1}].left=${next.left}. ` +
            `Server should flip tiles to maintain board[i].right === board[i+1].left.`,
        );
        break; // Single warning per render is enough; no point spamming.
      }
    }
  }

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

/**
 * C19-F1: Returns true when a board placement's visual halves must be swapped
 * so the matching pip sits on the edge that touches the previous tile in the
 * chain. Without this swap, a tile placed with a chain direction opposite to
 * its natural left→right reading order would render with its pips on the
 * wrong sides — e.g. a [3,0] tile played leftward of the anchor would show
 * the blank on the LEFT (matching pip 3 ends up on the right, away from the
 * connection), instead of showing 3 on the right (next to the anchor).
 *
 * Rule:
 *  - Tiles placed on the right side of the anchor (`side === "right"`) have
 *    their matching pip = `tile.left`. Their natural rendering puts left
 *    first, so they only need a flip when the chain folded back leftward
 *    (direction "left") or upward (direction "up").
 *  - Tiles placed on the left side of the anchor (`side === "left"`) come
 *    from the reversed left-slice of the board, so their matching pip =
 *    `tile.right`. They flip when flowing rightward or downward.
 *
 * Doubles (`tile.left === tile.right`) are visually symmetric so the flip is
 * a no-op for them; it is still safe to apply.
 */
export function shouldFlipDominoHalves(
  side: "left" | "right",
  direction: DominoDirection,
): boolean {
  if (side === "right") {
    return direction === "left" || direction === "up";
  }
  return direction === "right" || direction === "down";
}

function resolveBoardRenderRotation(tile: DominoTile, rotation?: number): number {
  if (tile.left === tile.right) {
    // Doubles keep a locked baseline orientation; snake placements enforce perpendicular rotation.
    return 0;
  }

  return Number.isFinite(rotation)
    ? (rotation as number)
    : 90;
}

function resolvePlacementRotation(tile: DominoTile, direction: DominoDirection, previousRotation?: number): number {
  const flowRotation = direction === "left" || direction === "right" ? 90 : 0;

  if (tile.left === tile.right) {
    // Strict rule for doubles: perpendicular to the immediately previous placed tile when possible.
    if (typeof previousRotation === "number" && Number.isFinite(previousRotation)) {
      const normalizedPrev = ((previousRotation % 180) + 180) % 180;
      return normalizedPrev === 90 ? 0 : 90;
    }
    return flowRotation === 90 ? 0 : 90;
  }

  return flowRotation;
}

function getDirectionSign(direction: DominoDirection): number {
  return direction === "left" || direction === "up" ? -1 : 1;
}

function getTileFootprint(renderRotation: number, compact: boolean, layoutScale = 1) {
  const long = compact ? 56 : 80;
  const short = compact ? 28 : 40;
  const normalizedRotation = ((renderRotation % 360) + 360) % 360;
  const isSideways = normalizedRotation === 90 || normalizedRotation === 270;
  return {
    halfWidth: ((isSideways ? long : short) * layoutScale) / 2,
    halfHeight: ((isSideways ? short : long) * layoutScale) / 2,
  };
}

function getPlacementRect(
  x: number,
  y: number,
  renderRotation: number,
  compact: boolean,
  layoutScale: number,
): DominoRect {
  const footprint = getTileFootprint(renderRotation, compact, layoutScale);
  return {
    left: x - footprint.halfWidth,
    right: x + footprint.halfWidth,
    top: y - footprint.halfHeight,
    bottom: y + footprint.halfHeight,
  };
}

function computeLayoutEpsilon(compact: boolean, layoutScale: number): number {
  const tileLong = compact ? 56 : 80;
  return Math.max(0.5, 0.01 * tileLong * layoutScale);
}

function isRectWithinBounds(rect: DominoRect, bounds: DominoRect, epsilon: number): boolean {
  return (
    rect.left >= bounds.left - epsilon
    && rect.right <= bounds.right + epsilon
    && rect.top >= bounds.top - epsilon
    && rect.bottom <= bounds.bottom + epsilon
  );
}

function isRectIntersectingAny(rect: DominoRect, placedRects: DominoRect[], epsilon: number): boolean {
  return placedRects.some((placedRect) => !(
    rect.right <= placedRect.left + epsilon
    || rect.left >= placedRect.right - epsilon
    || rect.bottom <= placedRect.top + epsilon
    || rect.top >= placedRect.bottom - epsilon
  ));
}

function unionDominoRect(a: DominoRect | null, b: DominoRect): DominoRect {
  if (!a) {
    return b;
  }

  return {
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
    top: Math.min(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

function quantizeCoordinate(value: number): number {
  return Math.round(value * LAYOUT_QUANTIZATION) / LAYOUT_QUANTIZATION;
}

function quantizeLayoutScale(scale: number): number {
  return Math.round(scale * LAYOUT_QUANTIZATION) / LAYOUT_QUANTIZATION;
}

function getDirectionPriority(side: "left" | "right", verticalStart: "up" | "down"): DominoDirection[] {
  const primaryHorizontal: DominoDirection = side === "left" ? "left" : "right";
  const secondaryHorizontal: DominoDirection = side === "left" ? "right" : "left";
  const secondaryVertical: DominoDirection = verticalStart === "up" ? "down" : "up";
  return [primaryHorizontal, verticalStart, secondaryHorizontal, secondaryVertical];
}

const OPPOSITE_DIRECTION: Record<DominoDirection, DominoDirection> = {
  left: "right",
  right: "left",
  up: "down",
  down: "up",
};

/**
 * Compute the per-tile direction priority used by the snake-fold solver.
 *
 * Real-table domino chains follow a serpentine pattern: they flow horizontally
 * until they reach the edge of the playing area, perform a 90° elbow into the
 * vertical direction with the most remaining room, run one or two tile-lengths
 * perpendicular, then a second 90° elbow rotates the chain back into the
 * opposite horizontal direction. We anticipate that fold here by inspecting the
 * remaining room in the previous direction *before* attempting placement —
 * unlike the older "try primary, then fall back" strategy, this proactively
 * rotates the chain so it never collides with the safe bound and never has to
 * be shrunk just to fit one more tile.
 */
function getAdaptiveDirectionPriority(
  side: "left" | "right",
  verticalStart: "up" | "down",
  previousDirection: DominoDirection,
  headRect: DominoRect,
  safeBounds: DominoRect,
  previousFootprint: { halfWidth: number; halfHeight: number },
): DominoDirection[] {
  const primaryHorizontal: DominoDirection = side === "left" ? "left" : "right";
  const oppositeHorizontal: DominoDirection = side === "left" ? "right" : "left";
  const oppositeVertical: DominoDirection = verticalStart === "up" ? "down" : "up";

  const tileLong = Math.max(previousFootprint.halfWidth, previousFootprint.halfHeight) * 2;
  // Need ~1.5 tile-lengths of room to keep flowing in the same direction.
  // Below that we plan an elbow into a perpendicular direction.
  const turnThreshold = tileLong * 1.5;

  // Room is measured from the **head of the chain** (the last placed tile),
  // not from the global bounding box. Using the global bbox makes the planner
  // think it's near the edge as soon as ANY tile is — which causes premature
  // turns once the chain has folded back, even though the head still has
  // plenty of room in front of it.
  const roomMap: Record<DominoDirection, number> = {
    right: safeBounds.right - headRect.right,
    left: headRect.left - safeBounds.left,
    down: safeBounds.bottom - headRect.bottom,
    up: headRect.top - safeBounds.top,
  };

  const continueRoom = roomMap[previousDirection];
  const opposite = OPPOSITE_DIRECTION[previousDirection];

  // Plenty of room to keep flowing in the current direction.
  if (continueRoom >= turnThreshold) {
    const fallback: DominoDirection[] = [
      previousDirection,
      verticalStart,
      oppositeVertical,
      previousDirection === primaryHorizontal ? oppositeHorizontal : primaryHorizontal,
    ];
    return fallback.filter((d, i, arr) => arr.indexOf(d) === i);
  }

  // We're approaching the edge — plan an elbow into the perpendicular direction
  // with the most available room. This is the snake fold.
  const isPrevHorizontal = previousDirection === "left" || previousDirection === "right";
  let perpendicularPair: DominoDirection[];
  if (isPrevHorizontal) {
    perpendicularPair = roomMap.down >= roomMap.up ? ["down", "up"] : ["up", "down"];
    // Tiebreaker: honor the deterministic verticalStart hint when both are similar.
    if (Math.abs(roomMap.down - roomMap.up) < tileLong * 0.5) {
      perpendicularPair = [verticalStart, oppositeVertical];
    }
  } else {
    perpendicularPair = roomMap.right >= roomMap.left ? ["right", "left"] : ["left", "right"];
  }

  // After the perpendicular run, the natural fold-back is the opposite of the
  // previous direction. Continuing the previous direction stays last as a
  // last-ditch fallback (only happens if the perpendicular and fold-back also
  // collide — extremely rare on a normal-sized lane).
  const ordered: DominoDirection[] = [...perpendicularPair, opposite, previousDirection];
  return ordered.filter((d, i, arr) => arr.indexOf(d) === i);
}

type PlacementAttempt = {
  placements: DominoPathPlacement[];
  isComplete: boolean;
};

function placeDominoEntriesAtScale(
  entries: BoardRowEntry[],
  side: "left" | "right",
  compact: boolean,
  anchorRenderRotation: number,
  safeBounds: DominoRect,
  verticalStart: "up" | "down",
  layoutScale: number,
  iterationGuard: { count: number; max: number },
  telemetry: DominoLayoutTelemetry,
): PlacementAttempt {
  if (entries.length === 0) {
    return { placements: [], isComplete: true };
  }

  const seamSpacing = (compact ? 0 : 2) * layoutScale;
  const epsilon = computeLayoutEpsilon(compact, layoutScale);

  const anchorRect = getPlacementRect(0, 0, anchorRenderRotation, compact, layoutScale);
  const placedRects: DominoRect[] = [anchorRect];
  let headRect: DominoRect = anchorRect;

  let previousX = 0;
  let previousY = 0;
  let previousRotation = anchorRenderRotation;
  let previousDirection: DominoDirection = side === "left" ? "left" : "right";

  const placements: DominoPathPlacement[] = [];

  type Candidate = {
    direction: DominoDirection;
    x: number;
    y: number;
    renderRotation: number;
    rect: DominoRect;
    priorityIndex: number;
  };

  const tryDirection = (
    direction: DominoDirection,
    fromX: number,
    fromY: number,
    fromRotation: number,
    fromDirection: DominoDirection,
    fromFootprint: { halfWidth: number; halfHeight: number },
    extraRects: DominoRect[],
    tile: { left: number; right: number },
  ): Omit<Candidate, "priorityIndex"> | null => {
    const renderRotation = resolvePlacementRotation(tile, direction, fromRotation);
    const nextFootprint = getTileFootprint(renderRotation, compact, layoutScale);
    const delta = getConnectedTileDelta(
      fromDirection,
      direction,
      fromFootprint,
      nextFootprint,
      seamSpacing,
    );
    const x = quantizeCoordinate(fromX + delta.dx);
    const y = quantizeCoordinate(fromY + delta.dy);
    const rect = getPlacementRect(x, y, renderRotation, compact, layoutScale);

    if (!isRectWithinBounds(rect, safeBounds, epsilon)) {
      return null;
    }
    if (isRectIntersectingAny(rect, placedRects, epsilon)) {
      return null;
    }
    if (extraRects.length > 0 && isRectIntersectingAny(rect, extraRects, epsilon)) {
      return null;
    }
    return { direction, x, y, renderRotation, rect };
  };

  for (let entryIdx = 0; entryIdx < entries.length; entryIdx += 1) {
    const entry = entries[entryIdx];
    const previousFootprint = getTileFootprint(previousRotation, compact, layoutScale);
    const adaptivePriority = getAdaptiveDirectionPriority(
      side,
      verticalStart,
      previousDirection,
      headRect,
      safeBounds,
      previousFootprint,
    );

    // Collect every viable candidate, then either accept the first that has a
    // viable next-step (1-step lookahead) or fall back to the highest-priority
    // viable candidate. This avoids the "first-viable dead-end" trap where a
    // locally-valid but globally-poor choice paints the chain into a corner.
    const candidates: Candidate[] = [];
    for (let i = 0; i < adaptivePriority.length; i += 1) {
      iterationGuard.count += 1;
      telemetry.iterationsUsed += 1;
      if (iterationGuard.count > iterationGuard.max) {
        throw new LayoutOverflowError(
          `Domino layout exceeded iteration budget (${iterationGuard.max}).`,
        );
      }
      const direction = adaptivePriority[i];
      const candidate = tryDirection(
        direction,
        previousX,
        previousY,
        previousRotation,
        previousDirection,
        previousFootprint,
        [],
        entry.item.tile,
      );
      if (candidate) {
        candidates.push({ ...candidate, priorityIndex: i });
      } else {
        telemetry.failedAttempts += 1;
      }
    }

    if (candidates.length === 0) {
      // No viable placement for this tile — return what we got so far. The
      // orchestrator will decide whether to retry at a smaller scale or
      // accept this partial result as the best available.
      return { placements, isComplete: false };
    }

    let chosen: Candidate | null = null;
    const nextEntry = entries[entryIdx + 1];
    if (nextEntry) {
      // Pick the first candidate (in priority order) whose next placement is
      // also viable. This is a single-step lookahead: cheap, deterministic, and
      // sufficient to escape the common one-tile-too-greedy traps.
      for (const candidate of candidates) {
        const nextFootprint = getTileFootprint(candidate.renderRotation, compact, layoutScale);
        const nextPriority = getAdaptiveDirectionPriority(
          side,
          verticalStart,
          candidate.direction,
          candidate.rect,
          safeBounds,
          nextFootprint,
        );
        let nextViable = false;
        for (const nextDirection of nextPriority) {
          iterationGuard.count += 1;
          telemetry.iterationsUsed += 1;
          if (iterationGuard.count > iterationGuard.max) {
            throw new LayoutOverflowError(
              `Domino layout exceeded iteration budget (${iterationGuard.max}).`,
            );
          }
          const probe = tryDirection(
            nextDirection,
            candidate.x,
            candidate.y,
            candidate.renderRotation,
            candidate.direction,
            nextFootprint,
            [candidate.rect],
            nextEntry.item.tile,
          );
          if (probe) {
            nextViable = true;
            break;
          }
        }
        if (nextViable) {
          chosen = candidate;
          break;
        }
      }
    }

    // Fallback: no candidate's lookahead succeeded (or this is the last tile).
    // Take the highest-priority viable candidate so we still place this tile.
    if (!chosen) {
      chosen = candidates[0];
    }

    placements.push({
      ...entry,
      x: chosen.x,
      y: chosen.y,
      renderRotation: chosen.renderRotation,
      direction: chosen.direction,
      layoutScale,
    });

    previousX = chosen.x;
    previousY = chosen.y;
    previousRotation = chosen.renderRotation;
    previousDirection = chosen.direction;
    headRect = chosen.rect;
    placedRects.push(chosen.rect);
  }

  return { placements, isComplete: true };
}

function getConnectedTileDelta(
  direction: DominoDirection,
  nextDirection: DominoDirection,
  currentFootprint: { halfWidth: number; halfHeight: number },
  nextFootprint: { halfWidth: number; halfHeight: number },
  seamSpacing: number,
) {
  if (direction === nextDirection) {
    if (direction === "left" || direction === "right") {
      return {
        dx: getDirectionSign(direction) * (currentFootprint.halfWidth + nextFootprint.halfWidth + seamSpacing),
        dy: 0,
      };
    }

    return {
      dx: 0,
      dy: getDirectionSign(direction) * (currentFootprint.halfHeight + nextFootprint.halfHeight + seamSpacing),
    };
  }

  const cornerSpacing = 0;

  if (direction === "left" || direction === "right") {
    return {
      dx: getDirectionSign(direction) * (currentFootprint.halfWidth + nextFootprint.halfWidth + cornerSpacing),
      dy: getDirectionSign(nextDirection) * (currentFootprint.halfHeight + nextFootprint.halfHeight + cornerSpacing),
    };
  }

  return {
    dx: getDirectionSign(nextDirection) * (currentFootprint.halfWidth + nextFootprint.halfWidth + cornerSpacing),
    dy: getDirectionSign(direction) * (currentFootprint.halfHeight + nextFootprint.halfHeight + cornerSpacing),
  };
}

// Robust, standards-compliant domino snake arrangement
function buildDominoPlacements(
  entries: BoardRowEntry[],
  side: "left" | "right",
  compact: boolean,
  anchorRenderRotation: number,
  safeBounds: DominoRect,
  verticalStart: "up" | "down",
  forcedScale?: number,
): DominoPlacementResult {
  const telemetry = createBaseTelemetry(entries.length);

  if (entries.length === 0) {
    return { placements: [], layoutScale: forcedScale ?? 1, telemetry };
  }

  const maxLayoutEntries = 300;
  const maxShrinkSteps = 10;
  const minLayoutScale = 0.55;
  const shrinkFactor = 0.92;

  if (entries.length > maxLayoutEntries) {
    throw new LayoutOverflowError(
      `Domino layout tile count ${entries.length} exceeded max supported ${maxLayoutEntries}.`,
    );
  }

  // Each entry may probe up to 4 candidate directions, and for each candidate
  // the lookahead in placeDominoEntriesAtScale probes another up-to-4 next-step
  // directions — so the worst-case per-entry attempt count is 4 * (1 + 4) = 20.
  // Multiply by the full shrink-step ladder so the budget is never the limiting
  // factor for genuinely solvable layouts.
  const maxAttemptsPerEntry = 4 * (1 + 4);
  const maxTotalIterations = Math.max(
    1,
    entries.length * maxAttemptsPerEntry * (maxShrinkSteps + 1),
  );
  const iterationGuard = {
    count: 0,
    max: maxTotalIterations,
  };

  const scalesToTry = typeof forcedScale === "number"
    ? [quantizeLayoutScale(Math.max(minLayoutScale, forcedScale))]
    : Array.from({ length: maxShrinkSteps + 1 }, (_, index) => {
      const rawScale = Math.pow(shrinkFactor, index);
      return quantizeLayoutScale(Math.max(minLayoutScale, rawScale));
    });

  // Track the best partial we have ever seen so that, even if no scale fits
  // every tile, we can still surface as many tiles as possible — far better
  // than collapsing to an empty board on long chains.
  let bestPartial: { placements: DominoPathPlacement[]; layoutScale: number } | null = null;

  for (let scaleIndex = 0; scaleIndex < scalesToTry.length; scaleIndex += 1) {
    const scale = scalesToTry[scaleIndex];
    const attempt = placeDominoEntriesAtScale(
      entries,
      side,
      compact,
      anchorRenderRotation,
      safeBounds,
      verticalStart,
      scale,
      iterationGuard,
      telemetry,
    );

    if (attempt.isComplete) {
      return {
        placements: attempt.placements,
        layoutScale: scale,
        telemetry,
      };
    }

    if (
      !bestPartial ||
      attempt.placements.length > bestPartial.placements.length
    ) {
      bestPartial = { placements: attempt.placements, layoutScale: scale };
    }

    const hasNextScale = scaleIndex < scalesToTry.length - 1;
    if (hasNextScale) {
      telemetry.shrinkSteps += 1;
    }
  }

  // No scale produced a complete layout. Use the partial with the most tiles
  // placed so the board still shows the player's chain progress.
  if (bestPartial && bestPartial.placements.length > 0) {
    return {
      placements: bestPartial.placements,
      layoutScale: bestPartial.layoutScale,
      telemetry,
    };
  }

  return {
    placements: [],
    layoutScale: scalesToTry[scalesToTry.length - 1] ?? minLayoutScale,
    telemetry,
  };
}

function safelyBuildDominoPlacements(
  entries: BoardRowEntry[],
  side: "left" | "right",
  compact: boolean,
  anchorRenderRotation: number,
  safeBounds: DominoRect,
  verticalStart: "up" | "down",
  forcedScale?: number,
): DominoPlacementResult {
  try {
    return buildDominoPlacements(
      entries,
      side,
      compact,
      anchorRenderRotation,
      safeBounds,
      verticalStart,
      forcedScale,
    );
  } catch (error) {
    const telemetry = createBaseTelemetry(entries.length);
    telemetry.overflowed = true;

    if (error instanceof LayoutOverflowError) {
      console.error("[DominoLayout]", error.message);
    } else {
      console.error("[DominoLayout] Unexpected solver error", error);
    }

    return {
      placements: [],
      layoutScale: forcedScale ?? 1,
      telemetry,
    };
  }
}

export interface DominoLayoutSnapshotTile {
  left: number;
  right: number;
  id?: string;
}

export interface LayoutInput {
  chain: DominoLayoutSnapshotTile[];
  viewport: {
    side: "left" | "right";
    compact: boolean;
    anchorRenderRotation: number;
    verticalStart: "up" | "down";
  };
  safeArea: DominoRect;
  forcedScale?: number;
}

export interface LayoutOutput {
  tiles: Array<{
    key: string;
    x: number;
    y: number;
    renderRotation: number;
    direction: DominoDirection;
    layoutScale: number;
  }>;
  scale: number;
  telemetry: DominoLayoutTelemetry;
}

export interface DominoLayoutSnapshotInput {
  side: "left" | "right";
  compact: boolean;
  anchorRenderRotation: number;
  verticalStart: "up" | "down";
  safeBounds: DominoRect;
  forcedScale?: number;
  tiles: DominoLayoutSnapshotTile[];
}

export interface DominoLayoutSnapshotOutput {
  layoutScale: number;
  placements: Array<{
    key: string;
    x: number;
    y: number;
    renderRotation: number;
    direction: DominoDirection;
    layoutScale: number;
  }>;
  telemetry: DominoLayoutTelemetry;
}

export function solveDominoLayout(input: LayoutInput): LayoutOutput {
  const entries: BoardRowEntry[] = input.chain.map((tile, index) => ({
    item: {
      tile: {
        left: tile.left,
        right: tile.right,
        id: tile.id,
      },
      rotation: tile.left === tile.right ? 0 : 90,
    },
    index,
    sequenceIndex: index,
  }));

  const result = safelyBuildDominoPlacements(
    entries,
    input.viewport.side,
    input.viewport.compact,
    input.viewport.anchorRenderRotation,
    input.safeArea,
    input.viewport.verticalStart,
    input.forcedScale,
  );

  return {
    scale: result.layoutScale,
    tiles: result.placements.map((placement) => ({
      key: tileSignature(placement.item.tile),
      x: quantizeCoordinate(placement.x),
      y: quantizeCoordinate(placement.y),
      renderRotation: placement.renderRotation,
      direction: placement.direction,
      layoutScale: placement.layoutScale,
    })),
    telemetry: result.telemetry,
  };
}

export function buildDominoLayoutSnapshot(input: DominoLayoutSnapshotInput): DominoLayoutSnapshotOutput {
  const result = solveDominoLayout({
    chain: input.tiles,
    viewport: {
      side: input.side,
      compact: input.compact,
      anchorRenderRotation: input.anchorRenderRotation,
      verticalStart: input.verticalStart,
    },
    safeArea: input.safeBounds,
    forcedScale: input.forcedScale,
  });

  return {
    layoutScale: result.scale,
    placements: result.tiles,
    telemetry: result.telemetry,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDominoPlacementBounds(
  placements: Array<{ x: number; y: number; renderRotation: number; layoutScale?: number }>,
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
    const { halfWidth, halfHeight } = getTileFootprint(
      placement.renderRotation,
      compact,
      placement.layoutScale ?? 1,
    );

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
  flipHalves = false,
}: {
  tile: DominoTile;
  isSelected?: boolean;
  onClick?: () => void;
  isPlayable?: boolean;
  size?: DominoTileSize;
  rotation?: number;
  /**
   * C19-F1: When true, render the right pip in the first slot and the left
   * pip in the second slot. Used for board placements whose chain direction
   * runs opposite to the natural left→right reading order so the matching
   * pip lands on the edge facing the previous tile. The underlying `tile`
   * data, testid, and aria-label remain canonical.
   */
  flipHalves?: boolean;
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
              // "Drilled" pip: dark warm radial center with a subtle highlight rim
              // and an inset shadow that mimics a circular well in real bone.
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
              "bg-[radial-gradient(circle_at_32%_30%,#5c3a1c_0%,#1f110a_55%,#000_100%)]",
              "shadow-[inset_0_1px_1.5px_rgba(255,225,170,0.35),inset_0_-1px_1px_rgba(0,0,0,0.55),0_0.5px_0.5px_rgba(255,255,255,0.45)]",
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
        "domino-tile-shell relative overflow-hidden rounded-lg border-[1.5px] flex select-none transition-all duration-200",
        // Carved-bone surface: warm ivory at the top, deepening to amber at the
        // bottom for a subtle dimensional feel that reads even at small scale.
        "border-[#5a4326] bg-[linear-gradient(176deg,#fbf6e6_0%,#f3e8cd_48%,#e1cba2_100%)]",
        // Outer drop + inner highlight + inner amber rim form the bevel.
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-1px_0_rgba(120,82,40,0.35),0_6px_12px_rgba(35,24,14,0.4)]",
        isSelected
          ? "domino-tile-selected border-[#d08f2d] ring-2 ring-[#d9a34a]/75 scale-[1.08] z-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(160,108,42,0.45),0_14px_22px_rgba(132,79,24,0.42)]"
          : "",
        isPlayable
          ? "domino-tile-can-play hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(120,82,40,0.4),0_12px_18px_rgba(35,24,14,0.4)]"
          : "opacity-85",
        isPlayable && !isSelected ? "domino-tile-playable" : "",
        onClick ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background" : "",
        onClick && isPlayable ? "cursor-pointer" : "cursor-default",
        isSideways ? "flex-row" : "flex-col"
      )}
      data-testid={`domino-tile-${tile.left}-${tile.right}`}
    >
      {/* Top sheen — fakes a polished bone reflection */}
      <div className="pointer-events-none absolute inset-x-1 top-[2px] h-[3px] rounded-full bg-gradient-to-b from-white/70 to-transparent" />
      {/* Engraved center divider — dark line + light line, like real bone tiles */}
      <div className={cn(
        "pointer-events-none absolute",
        isSideways
          ? "inset-y-1.5 left-1/2 w-[2px] -translate-x-1/2 bg-[linear-gradient(90deg,rgba(58,40,18,0.55),rgba(255,250,235,0.55))]"
          : "inset-x-2 top-1/2 h-[2px] -translate-y-1/2 bg-[linear-gradient(180deg,rgba(58,40,18,0.55),rgba(255,250,235,0.55))]"
      )} />
      {/* Side bevel highlights — vertical edges only when upright */}
      <div className="pointer-events-none absolute inset-y-1 left-[1px] w-[1px] rounded-full bg-[#2e271f]/15" />
      <div className="pointer-events-none absolute inset-y-1 right-[1px] w-[1px] rounded-full bg-white/30" />
      <div className={cn(
        "flex-1 flex items-center justify-center"
      )}>
        {renderDots(flipHalves ? tile.right : tile.left)}
      </div>
      <div className="flex-1 flex items-center justify-center">
        {renderDots(flipHalves ? tile.left : tile.right)}
      </div>
    </div>
  );
});

// C8-F7: Compact placeholder — shows count badge + mini tile stack (max 3 icons)
// Carved-bone face-down preview that matches the in-hand DominoTileComponent so
// opponent tile counts and challenge previews share the same warm visual language.
function PlaceholderTile({ count }: { count: number }) {
  const visibleCount = Math.min(count, 3);
  return (
    <div className="flex items-end gap-1" data-testid="placeholder-tile-stack">
      {Array.from({ length: visibleCount }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "relative w-6 h-12 rounded-md border-[1.5px] border-[#5a4326] overflow-hidden",
            // Same warm-ivory → amber gradient as the live tile face.
            "bg-[linear-gradient(176deg,#fbf6e6_0%,#f3e8cd_48%,#e1cba2_100%)]",
            // Outer drop + inner light highlight + inner amber rim form the bevel.
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-1px_0_rgba(120,82,40,0.35),0_4px_8px_rgba(35,24,14,0.4)]",
          )}
          style={{ transform: `translateX(${-i * 5}px)`, zIndex: visibleCount - i }}
        >
          {/* Top sheen — fakes a polished bone reflection */}
          <div className="pointer-events-none absolute inset-x-1 top-[2px] h-[2px] rounded-full bg-gradient-to-b from-white/70 to-transparent" />
          {/* Engraved center divider — matches DominoTileComponent */}
          <div className="pointer-events-none absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2 bg-[linear-gradient(180deg,rgba(58,40,18,0.55),rgba(255,250,235,0.55))]" />
          {/* Side bevel highlights */}
          <div className="pointer-events-none absolute inset-y-1 left-[1px] w-[1px] rounded-full bg-[#2e271f]/15" />
          <div className="pointer-events-none absolute inset-y-1 right-[1px] w-[1px] rounded-full bg-white/30" />
        </div>
      ))}
      {count > 3 && (
        <span className="text-xs font-semibold text-[#5a4326] bg-[#f3e8cd]/90 rounded-full px-1.5 py-0.5 border border-[#5a4326]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          x{count}
        </span>
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

  // Game-speed multiplier (Normal/Fast/Turbo + reduced-motion). Returns 0 when
  // the OS reports prefers-reduced-motion so animations effectively disappear.
  const speedMultiplier = useDominoSpeedMultiplier();
  const animationsDisabled = speedMultiplier === 0;
  const placeTransitionMs = Math.max(0, Math.round(180 * speedMultiplier));
  const placeSpringStiffness = Math.round(360 / Math.max(speedMultiplier, 0.25));
  const drawSpringStiffness = Math.round(420 / Math.max(speedMultiplier, 0.25));
  const lastPlayedGlowMs = Math.max(0, Math.round(800 * speedMultiplier));
  const perTileStaggerMs = Math.max(0, Math.round(30 * speedMultiplier));
  const placeTransition = animationsDisabled
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: placeSpringStiffness, damping: 26, mass: 0.62 };
  const drawTransition = animationsDisabled
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: drawSpringStiffness, damping: 26, mass: 0.55 };

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

  // Production rule: when no playable move exists, draw immediately until a playable tile appears.
  useEffect(() => {
    if (isSpectator || !isMyTurn || status === 'finished') return;
    if (playableTiles.length > 0) return;
    if (!canAutoDraw) return;
    if (drawPending || movePending || passPending) return;

    handleDraw();
  }, [
    isSpectator,
    isMyTurn,
    status,
    playableTiles.length,
    canAutoDraw,
    drawPending,
    movePending,
    passPending,
  ]);

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
  const leftEntries = useMemo(
    () => (anchorTileIndex > 0 ? [...boardEntries.slice(0, anchorTileIndex)].reverse() : []),
    [boardEntries, anchorTileIndex],
  );
  const rightEntries = useMemo(
    () => (anchorTileIndex >= 0 ? boardEntries.slice(anchorTileIndex + 1) : []),
    [boardEntries, anchorTileIndex],
  );
  const anchorEntry = useMemo(
    () => (anchorTileIndex >= 0 ? boardEntries[anchorTileIndex] : undefined),
    [boardEntries, anchorTileIndex],
  );
  const anchorRenderRotation = useMemo(() => {
    if (!anchorEntry) {
      return 90;
    }

    const isAnchorDouble = anchorEntry.item.tile.left === anchorEntry.item.tile.right;
    if (isAnchorDouble) {
      const laneWidth = boardLaneSize.width > 0 ? boardLaneSize.width : (isCompactMobile ? 320 : 760);
      const laneHeight = boardLaneSize.height > 0 ? boardLaneSize.height : (isCompactMobile ? 360 : 520);
      // Center double follows board aspect to stay natural after screen rotation.
      return laneWidth >= laneHeight ? 90 : 0;
    }

    return resolveBoardRenderRotation(anchorEntry.item.tile, anchorEntry.item.rotation);
  }, [anchorEntry, boardLaneSize.width, boardLaneSize.height, isCompactMobile]);

  const laneMetrics = useMemo(() => {
    const laneWidth = boardLaneSize.width > 0
      ? boardLaneSize.width
      : (isCompactMobile ? 320 : 760);
    const laneHeight = boardLaneSize.height > 0
      ? boardLaneSize.height
      : (isCompactMobile ? 360 : 520);
    return { laneWidth, laneHeight };
  }, [boardLaneSize.width, boardLaneSize.height, isCompactMobile]);

  const sideSafeBounds = useMemo<{ left: DominoRect; right: DominoRect }>(() => {
    const horizontalInset = isCompactMobile ? 20 : 28;
    const verticalInset = isCompactMobile ? 22 : 30;
    const centerGap = isCompactMobile ? 18 : 24;
    const halfWidth = Math.max(120, laneMetrics.laneWidth / 2 - horizontalInset);
    const halfHeight = Math.max(140, laneMetrics.laneHeight / 2 - verticalInset);

    return {
      left: {
        left: -halfWidth,
        right: -centerGap,
        top: -halfHeight,
        bottom: halfHeight,
      },
      right: {
        left: centerGap,
        right: halfWidth,
        top: -halfHeight,
        bottom: halfHeight,
      },
    };
  }, [laneMetrics.laneWidth, laneMetrics.laneHeight, isCompactMobile]);

  const verticalStart = useMemo<"up" | "down">(() => {
    const keySource = anchorTileKey ?? "anchor";
    const hash = keySource.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return hash % 2 === 0 ? "up" : "down";
  }, [anchorTileKey]);

  const leftPlacementPlan = useMemo(
    () => safelyBuildDominoPlacements(
      leftEntries,
      "left",
      isCompactMobile,
      anchorRenderRotation,
      sideSafeBounds.left,
      verticalStart,
    ),
    [leftEntries, isCompactMobile, anchorRenderRotation, sideSafeBounds.left, verticalStart],
  );

  const rightPlacementPlan = useMemo(
    () => safelyBuildDominoPlacements(
      rightEntries,
      "right",
      isCompactMobile,
      anchorRenderRotation,
      sideSafeBounds.right,
      verticalStart,
    ),
    [rightEntries, isCompactMobile, anchorRenderRotation, sideSafeBounds.right, verticalStart],
  );

  const boardLayoutScale = useMemo(() => quantizeLayoutScale(Math.min(
    leftPlacementPlan.layoutScale,
    rightPlacementPlan.layoutScale,
  )), [leftPlacementPlan.layoutScale, rightPlacementPlan.layoutScale]);

  const leftResolvedPlan = useMemo(
    () => safelyBuildDominoPlacements(
      leftEntries,
      "left",
      isCompactMobile,
      anchorRenderRotation,
      sideSafeBounds.left,
      verticalStart,
      boardLayoutScale,
    ),
    [
      leftEntries,
      isCompactMobile,
      anchorRenderRotation,
      sideSafeBounds.left,
      verticalStart,
      boardLayoutScale,
    ],
  );

  const rightResolvedPlan = useMemo(
    () => safelyBuildDominoPlacements(
      rightEntries,
      "right",
      isCompactMobile,
      anchorRenderRotation,
      sideSafeBounds.right,
      verticalStart,
      boardLayoutScale,
    ),
    [
      rightEntries,
      isCompactMobile,
      anchorRenderRotation,
      sideSafeBounds.right,
      verticalStart,
      boardLayoutScale,
    ],
  );

  const leftPlacements = leftResolvedPlan.placements;
  const rightPlacements = rightResolvedPlan.placements;

  const boardLayoutTelemetry = useMemo<DominoLayoutTelemetry>(() => ({
    tilesCount:
      leftResolvedPlan.telemetry.tilesCount
      + rightResolvedPlan.telemetry.tilesCount
      + (anchorEntry ? 1 : 0),
    iterationsUsed:
      leftPlacementPlan.telemetry.iterationsUsed
      + rightPlacementPlan.telemetry.iterationsUsed
      + leftResolvedPlan.telemetry.iterationsUsed
      + rightResolvedPlan.telemetry.iterationsUsed,
    shrinkSteps:
      leftPlacementPlan.telemetry.shrinkSteps
      + rightPlacementPlan.telemetry.shrinkSteps
      + leftResolvedPlan.telemetry.shrinkSteps
      + rightResolvedPlan.telemetry.shrinkSteps,
    failedAttempts:
      leftPlacementPlan.telemetry.failedAttempts
      + rightPlacementPlan.telemetry.failedAttempts
      + leftResolvedPlan.telemetry.failedAttempts
      + rightResolvedPlan.telemetry.failedAttempts,
    overflowed:
      leftPlacementPlan.telemetry.overflowed
      || rightPlacementPlan.telemetry.overflowed
      || leftResolvedPlan.telemetry.overflowed
      || rightResolvedPlan.telemetry.overflowed,
  }), [
    leftResolvedPlan.telemetry,
    rightResolvedPlan.telemetry,
    anchorEntry,
    leftPlacementPlan.telemetry,
    rightPlacementPlan.telemetry,
  ]);

  useEffect(() => {
    if (!shouldLogDominoLayoutTelemetry) {
      return;
    }

    console.debug("[DominoLayout][telemetry]", boardLayoutTelemetry);
  }, [boardLayoutTelemetry]);

  const boardBounds = useMemo(() => {
    const placementsForBounds = [
      ...leftPlacements,
      ...(anchorEntry ? [{ x: 0, y: 0, renderRotation: anchorRenderRotation, layoutScale: boardLayoutScale }] : []),
      ...rightPlacements,
    ];
    return getDominoPlacementBounds(placementsForBounds, isCompactMobile);
  }, [leftPlacements, anchorEntry, rightPlacements, isCompactMobile, anchorRenderRotation, boardLayoutScale]);

  const boardHeight = useMemo(() => {
    const minHeight = isCompactMobile
      ? (isSpectator ? 320 : 380)
      : (isSpectator ? 420 : 520);
    const verticalPadding = isCompactMobile ? 84 : 104;
    const requiredHeight = Math.ceil(boardBounds.height + verticalPadding);
    const readableZoomFloor = isCompactMobile ? 0.30 : 0.38;
    const readableHeight = Math.ceil(boardBounds.height * readableZoomFloor + verticalPadding);
    return Math.max(minHeight, requiredHeight, readableHeight);
  }, [boardBounds.height, isCompactMobile, isSpectator]);

  const boardZoom = useMemo(() => {
    const safePadding = isCompactMobile ? 48 : 64;
    const fallbackWidth = Math.max(boardBounds.width + safePadding * 2, isCompactMobile ? 320 : 760);
    const fallbackHeight = Math.max(boardBounds.height + safePadding * 2, boardHeight);
    const laneWidth = boardLaneSize.width > 0 ? boardLaneSize.width : fallbackWidth;
    const laneHeight = boardLaneSize.height > 0 ? boardLaneSize.height : fallbackHeight;
    const availableWidth = Math.max(140, laneWidth - safePadding * 2);
    const availableHeight = Math.max(120, laneHeight - safePadding * 2);
    const fitWidthZoom = availableWidth / Math.max(boardBounds.width, 1);
    const fitHeightZoom = availableHeight / Math.max(boardBounds.height, 1);
    const fitZoom = Math.min(1, fitWidthZoom, fitHeightZoom);
    // Never exceed fit-zoom to guarantee every tile remains inside the board lane.
    return Math.max(0.12, Math.floor(fitZoom * 1000) / 1000);
  }, [isCompactMobile, boardBounds.width, boardBounds.height, boardLaneSize.width, boardLaneSize.height, boardHeight]);

  const boardRenderScale = useMemo(
    () => boardZoom * boardLayoutScale,
    [boardZoom, boardLayoutScale],
  );

  const boardHeightCssValue = useMemo(() => {
    if (isCompactMobile) {
      return `min(${boardHeight}px, 64svh)`;
    }

    return `min(${boardHeight}px, 76svh)`;
  }, [boardHeight, isCompactMobile]);

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

  const growthBiasShiftX = useMemo(() => {
    if (leftPlacements.length === 0 && rightPlacements.length === 0) {
      return 0;
    }

    const leftReach = leftPlacements.reduce((max, placement) => {
      const footprint = getTileFootprint(placement.renderRotation, isCompactMobile, placement.layoutScale);
      return Math.max(max, Math.abs(placement.x) + footprint.halfWidth);
    }, 0);
    const rightReach = rightPlacements.reduce((max, placement) => {
      const footprint = getTileFootprint(placement.renderRotation, isCompactMobile, placement.layoutScale);
      return Math.max(max, Math.abs(placement.x) + footprint.halfWidth);
    }, 0);

    const imbalance = rightReach - leftReach;
    const totalReach = Math.max(1, rightReach + leftReach);
    const imbalanceRatio = Math.abs(imbalance) / totalReach;

    if (imbalanceRatio < 0.2) {
      return 0;
    }

    const safePadding = isCompactMobile ? 48 : 64;
    const laneWidth = boardLaneSize.width > 0
      ? boardLaneSize.width
      : Math.max(boardBounds.width + safePadding * 2, isCompactMobile ? 320 : 760);
    const availableWidth = Math.max(140, laneWidth - safePadding * 2);
    const logicalVisibleWidth = availableWidth / Math.max(boardZoom, 0.001);
    const slackX = Math.max(0, (logicalVisibleWidth - boardBounds.width) / 2);
    const preferredShift = -0.25 * imbalance;
    return clamp(preferredShift, -slackX, slackX);
  }, [leftPlacements, rightPlacements, isCompactMobile, boardLaneSize.width, boardBounds.width, boardZoom]);

  const effectiveOffsetX = boardOffset.offsetX + growthBiasShiftX;
  const lastActionTileKey = state.lastAction?.tile ? tileSignature(state.lastAction.tile) : null;

  const leftPreviewPlacement = useMemo(() => {
    if (!leftGhostTile || !leftEndSelectable) {
      return null;
    }

    if (state.boardTiles.length === 0) {
      const initialRotation = leftGhostTile.left === leftGhostTile.right ? 0 : 90;
      const initialRect = getPlacementRect(
        0,
        0,
        initialRotation,
        isCompactMobile,
        boardLayoutScale,
      );
      const epsilon = computeLayoutEpsilon(isCompactMobile, boardLayoutScale);
      if (!isRectWithinBounds(initialRect, sideSafeBounds.left, epsilon)) {
        return null;
      }

      return {
        x: 0,
        y: 0,
        renderRotation: initialRotation,
        layoutScale: boardLayoutScale,
      };
    }

    const previewEntries = [
      ...leftEntries,
      {
        item: {
          tile: leftGhostTile,
          rotation: 0,
        },
        index: -1,
        sequenceIndex: -1,
      },
    ];

    const previewPlacements = safelyBuildDominoPlacements(
      previewEntries,
      "left",
      isCompactMobile,
      anchorRenderRotation,
      sideSafeBounds.left,
      verticalStart,
      boardLayoutScale,
    ).placements;

    return previewPlacements[previewPlacements.length - 1] ?? null;
  }, [
    leftGhostTile,
    leftEndSelectable,
    state.boardTiles.length,
    leftEntries,
    isCompactMobile,
    anchorRenderRotation,
    sideSafeBounds.left,
    verticalStart,
    boardLayoutScale,
  ]);

  const rightPreviewPlacement = useMemo(() => {
    if (!rightGhostTile || !rightEndSelectable) {
      return null;
    }

    if (state.boardTiles.length === 0) {
      const initialRotation = rightGhostTile.left === rightGhostTile.right ? 0 : 90;
      const initialRect = getPlacementRect(
        0,
        0,
        initialRotation,
        isCompactMobile,
        boardLayoutScale,
      );
      const epsilon = computeLayoutEpsilon(isCompactMobile, boardLayoutScale);
      if (!isRectWithinBounds(initialRect, sideSafeBounds.right, epsilon)) {
        return null;
      }

      return {
        x: 0,
        y: 0,
        renderRotation: initialRotation,
        layoutScale: boardLayoutScale,
      };
    }

    const previewEntries = [
      ...rightEntries,
      {
        item: {
          tile: rightGhostTile,
          rotation: 0,
        },
        index: -1,
        sequenceIndex: -1,
      },
    ];

    const previewPlacements = safelyBuildDominoPlacements(
      previewEntries,
      "right",
      isCompactMobile,
      anchorRenderRotation,
      sideSafeBounds.right,
      verticalStart,
      boardLayoutScale,
    ).placements;

    return previewPlacements[previewPlacements.length - 1] ?? null;
  }, [
    rightGhostTile,
    rightEndSelectable,
    state.boardTiles.length,
    rightEntries,
    isCompactMobile,
    anchorRenderRotation,
    sideSafeBounds.right,
    verticalStart,
    boardLayoutScale,
  ]);

  const leftGhostScreenPosition = useMemo(() => {
    if (!leftPreviewPlacement) {
      return null;
    }

    return {
      x: (leftPreviewPlacement.x + effectiveOffsetX) * boardZoom,
      y: (leftPreviewPlacement.y + boardOffset.offsetY) * boardZoom,
      rotation: leftPreviewPlacement.renderRotation,
    };
  }, [leftPreviewPlacement, boardOffset.offsetY, boardZoom, effectiveOffsetX]);

  const rightGhostScreenPosition = useMemo(() => {
    if (!rightPreviewPlacement) {
      return null;
    }

    return {
      x: (rightPreviewPlacement.x + effectiveOffsetX) * boardZoom,
      y: (rightPreviewPlacement.y + boardOffset.offsetY) * boardZoom,
      rotation: rightPreviewPlacement.renderRotation,
    };
  }, [rightPreviewPlacement, boardOffset.offsetY, boardZoom, effectiveOffsetX]);

  const renderBoardTile = (
    entry: BoardRowEntry,
    rowId: string,
    forcedRotation?: number,
    chainSide?: "left" | "right",
  ) => {
    const boardTile = entry.item.tile;
    const renderRotation = typeof forcedRotation === "number"
      ? forcedRotation
      : resolveBoardRenderRotation(boardTile, entry.item.rotation);
    const tileKey = tileSignature(entry.item.tile);
    const isLastActionTile = lastActionTileKey !== null && tileSignature(entry.item.tile) === lastActionTileKey;

    // C19-F1: Snake placements provide a `direction`. Combined with whether
    // the tile sits on the LEFT or RIGHT half of the chain (relative to the
    // anchor), we compute whether the visual halves must be swapped so the
    // matching pip touches the previous tile. The anchor itself never flips.
    const placementDirection = (entry as Partial<DominoPathPlacement>).direction;
    const flipHalves = chainSide && placementDirection
      ? shouldFlipDominoHalves(chainSide, placementDirection)
      : false;

    return (
      <motion.div
        key={`${rowId}-${tileKey}`}
        initial={isLastActionTile ? { opacity: 0, y: -10, scale: 0.9, rotate: -4 } : false}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0.2 }}
        transition={placeTransition}
        className={cn(
          "shrink-0",
          isLastActionTile && !animationsDisabled ? "animate-domino-place" : "opacity-95",
        )}
        style={
          isLastActionTile
            ? {
                transition: `transform ${placeTransitionMs}ms ease-out`,
                filter:
                  "drop-shadow(0 0 6px rgba(255, 184, 92, 0.85)) drop-shadow(0 0 14px rgba(255, 138, 32, 0.55))",
                animation: lastPlayedGlowMs > 0
                  ? `domino-last-played-glow ${lastPlayedGlowMs}ms ease-out 1`
                  : undefined,
              }
            : { transition: `transform ${placeTransitionMs}ms ease-out` }
        }
      >
        <DominoTileComponent
          tile={boardTile}
          size={boardTileSize}
          rotation={renderRotation}
          flipHalves={flipHalves}
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
          <div className="space-y-1">
            {turnTimeLimit > 0 && status !== 'finished' && (
              <div className="flex justify-center">
                <span
                  className={cn(
                    "inline-flex min-w-[72px] items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums shadow-sm",
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
              </div>
            )}

            <div className={cn("flex flex-wrap items-center justify-center", isCompactMobile ? "gap-1.5" : "gap-2")}>

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
          </div>
        )}

        <div
          className={cn(
            "domino-board-depth relative overflow-hidden rounded-2xl border border-[#1d4f3b]/70 bg-game-felt flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_18px_28px_rgba(8,26,19,0.4)]",
            isCompactMobile ? "p-1" : "p-2 sm:p-3",
            isTurnLive ? "domino-board-turn-live" : ""
          )}
          style={{ height: boardHeightCssValue }}
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
                    <div
                      className="opacity-50 saturate-110"
                      style={{ transform: `scale(${boardRenderScale})`, transformOrigin: "center center" }}
                    >
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
                    <div
                      className="opacity-50 saturate-110"
                      style={{ transform: `scale(${boardRenderScale})`, transformOrigin: "center center" }}
                    >
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
            <div ref={boardLaneRef} className="domino-board-lane relative h-full w-full max-w-full px-0 py-1 sm:px-0 sm:py-2">
              {anchorEntry && (
                <>
                  {leftPlacements.map((placement) => (
                    <div
                      key={`left-${tileSignature(placement.item.tile)}`}
                      className="absolute left-1/2 top-1/2"
                      style={{
                        transform: `translate(calc(-50% + ${(placement.x + effectiveOffsetX) * boardZoom}px), calc(-50% + ${(placement.y + boardOffset.offsetY) * boardZoom}px)) scale(${boardRenderScale})`,
                        transformOrigin: "center center",
                      }}
                    >
                      {renderBoardTile(placement, "left-snake", placement.renderRotation, "left")}
                    </div>
                  ))}

                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      transform: `translate(calc(-50% + ${effectiveOffsetX * boardZoom}px), calc(-50% + ${boardOffset.offsetY * boardZoom}px)) scale(${boardRenderScale})`,
                      transformOrigin: "center center",
                    }}
                  >
                    {renderBoardTile(anchorEntry, "anchor")}
                  </div>

                  {rightPlacements.map((placement) => (
                    <div
                      key={`right-${tileSignature(placement.item.tile)}`}
                      className="absolute left-1/2 top-1/2"
                      style={{
                        transform: `translate(calc(-50% + ${(placement.x + effectiveOffsetX) * boardZoom}px), calc(-50% + ${(placement.y + boardOffset.offsetY) * boardZoom}px)) scale(${boardRenderScale})`,
                        transformOrigin: "center center",
                      }}
                    >
                      {renderBoardTile(placement, "right-snake", placement.renderRotation, "right")}
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
                    key={tile.id ?? tileSignature(tile)}
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
                    transition={drawTransition}
                    className={isNewTile && !animationsDisabled ? "animate-domino-draw" : ""}
                    style={isNewTile && !animationsDisabled ? { animationDelay: `${(index - prevHandLenRef.current) * perTileStaggerMs}ms` } : undefined}
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
