import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useGameAudio } from "@/hooks/use-game-audio";
import { useGameSpeedMultiplier } from "@/lib/game-speed";

interface ChessBoardProps {
  gameState?: string;
  currentTurn?: string;
  myColor: "white" | "black";
  isMyTurn: boolean;
  isSpectator: boolean;
  authoritativeValidMoves?: unknown;
  onMove: (move: ChessMove) => void;
  status?: string;
  turnTimeLimit?: number;
  compactTopArea?: boolean;
}

interface ChessMove {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
}

interface Square {
  row: number;
  col: number;
  piece: string | null;
  color: "white" | "black";
}

interface AuthoritativeMove {
  from: string;
  to: string;
  promotion?: string;
}

interface BoardDiffSquare {
  row: number;
  col: number;
  piece: string;
  previousPiece?: string;
}

interface BoardMoveDelta {
  from: string;
  to: string;
  capturedPiece?: string;
  captureSquare?: string;
}

type PieceType = "K" | "Q" | "R" | "B" | "N" | "P" | "k" | "q" | "r" | "b" | "n" | "p";

const PIECE_SYMBOLS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

function looksLikeFen(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes("/")) return false;
  return /^[prnbqkPRNBQK1-8\/]+(?:\s+[wb])?/.test(trimmed);
}

function parseFEN(fen: string): { board: string[][]; activeColor: string; castling: string; enPassant: string } {
  const parts = fen.split(" ");
  const [position] = parts;
  const rows = position.split("/");
  const board: string[][] = [];

  for (const row of rows) {
    const boardRow: string[] = [];
    for (const char of row) {
      if (isNaN(parseInt(char))) {
        boardRow.push(char);
      } else {
        for (let i = 0; i < parseInt(char); i++) {
          boardRow.push("");
        }
      }
    }
    board.push(boardRow);
  }

  return {
    board,
    activeColor: parts[1] || "w",
    castling: parts[2] || "-",
    enPassant: parts[3] || "-",
  };
}

function squareToCoords(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - parseInt(square[1]);
  return [rank, file];
}

function coordsToSquare(row: number, col: number): string {
  return FILES[col] + RANKS[row];
}

function isWhitePiece(piece: string): boolean {
  return piece === piece.toUpperCase() && piece !== "";
}

function getPieceColor(piece: string): "white" | "black" | null {
  if (!piece) return null;
  return isWhitePiece(piece) ? "white" : "black";
}

// Check if a specific square is attacked by the given color
function isSquareAttacked(board: string[][], row: number, col: number, byColor: "white" | "black"): boolean {
  const isAttacker = byColor === "white" ? isWhitePiece : (p: string) => p !== "" && !isWhitePiece(p);

  // Check knight attacks
  const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  for (const [dr, dc] of knightMoves) {
    const r = row + dr, c = col + dc;
    if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
      const p = board[r][c];
      if (p && isAttacker(p) && p.toUpperCase() === "N") return true;
    }
  }

  // Check pawn attacks
  const pawnDir = byColor === "white" ? 1 : -1; // white pawns attack upward (decreasing row)
  for (const dc of [-1, 1]) {
    const r = row + pawnDir, c = col + dc;
    if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
      const p = board[r][c];
      if (p && isAttacker(p) && p.toUpperCase() === "P") return true;
    }
  }

  // Check king attacks
  for (const dr of [-1, 0, 1]) {
    for (const dc of [-1, 0, 1]) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
        const p = board[r][c];
        if (p && isAttacker(p) && p.toUpperCase() === "K") return true;
      }
    }
  }

  // Check sliding pieces (bishop/queen diagonals, rook/queen straights)
  const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diags) {
    for (let i = 1; i < 8; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r > 7 || c < 0 || c > 7) break;
      const p = board[r][c];
      if (p) {
        if (isAttacker(p) && (p.toUpperCase() === "B" || p.toUpperCase() === "Q")) return true;
        break;
      }
    }
  }

  const straights = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of straights) {
    for (let i = 1; i < 8; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r > 7 || c < 0 || c > 7) break;
      const p = board[r][c];
      if (p) {
        if (isAttacker(p) && (p.toUpperCase() === "R" || p.toUpperCase() === "Q")) return true;
        break;
      }
    }
  }

  return false;
}

// Find king position for a given color
function findKing(board: string[][], color: "white" | "black"): [number, number] | null {
  const king = color === "white" ? "K" : "k";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === king) return [r, c];
    }
  }
  return null;
}

// Check if moving a piece would leave own king in check
function wouldLeaveInCheck(board: string[][], fromRow: number, fromCol: number, toRow: number, toCol: number, color: "white" | "black"): boolean {
  // Simulate the move
  const newBoard = board.map(row => [...row]);
  newBoard[toRow][toCol] = newBoard[fromRow][fromCol];
  newBoard[fromRow][fromCol] = "";

  const enemyColor = color === "white" ? "black" : "white";
  const kingPos = findKing(newBoard, color);
  if (!kingPos) return true;

  return isSquareAttacked(newBoard, kingPos[0], kingPos[1], enemyColor);
}

function getRawMoves(board: string[][], row: number, col: number, piece: string, castling: string, enPassant: string): string[] {
  const moves: string[] = [];
  const isWhite = isWhitePiece(piece);
  const pieceType = piece.toUpperCase();

  const addMoveIfValid = (r: number, c: number, canCapture = true, mustCapture = false): boolean => {
    if (r < 0 || r > 7 || c < 0 || c > 7) return false;
    const target = board[r][c];
    if (!target) {
      if (!mustCapture) moves.push(coordsToSquare(r, c));
      return true;
    }
    if (canCapture && getPieceColor(target) !== (isWhite ? "white" : "black")) {
      if (!mustCapture || target) moves.push(coordsToSquare(r, c));
    }
    return false;
  };

  const addLineMoves = (dr: number, dc: number) => {
    for (let i = 1; i < 8; i++) {
      if (!addMoveIfValid(row + dr * i, col + dc * i)) break;
      if (board[row + dr * i]?.[col + dc * i]) break;
    }
  };

  switch (pieceType) {
    case "P": {
      const dir = isWhite ? -1 : 1;
      const startRow = isWhite ? 6 : 1;

      // Forward moves
      if (!board[row + dir]?.[col]) {
        moves.push(coordsToSquare(row + dir, col));
        if (row === startRow && !board[row + dir * 2]?.[col]) {
          moves.push(coordsToSquare(row + dir * 2, col));
        }
      }

      // Normal captures
      [-1, 1].forEach(dc => {
        const target = board[row + dir]?.[col + dc];
        if (target && getPieceColor(target) !== (isWhite ? "white" : "black")) {
          moves.push(coordsToSquare(row + dir, col + dc));
        }
      });

      // En passant
      if (enPassant !== "-") {
        const [epRow, epCol] = squareToCoords(enPassant);
        if (epRow === row + dir && Math.abs(epCol - col) === 1) {
          moves.push(enPassant);
        }
      }
      break;
    }
    case "N":
      [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
        addMoveIfValid(row + dr, col + dc);
      });
      break;
    case "B":
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => addLineMoves(dr, dc));
      break;
    case "R":
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => addLineMoves(dr, dc));
      break;
    case "Q":
      [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => addLineMoves(dr, dc));
      break;
    case "K": {
      // Normal king moves
      [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => {
        addMoveIfValid(row + dr, col + dc);
      });

      // Castling
      const baseRow = isWhite ? 7 : 0;
      const enemyColor = isWhite ? "black" : "white";
      if (row === baseRow && col === 4) {
        // Kingside castling
        const kingSideRight = isWhite ? castling.includes("K") : castling.includes("k");
        if (kingSideRight && !board[baseRow][5] && !board[baseRow][6] &&
          !isSquareAttacked(board, baseRow, 4, enemyColor) &&
          !isSquareAttacked(board, baseRow, 5, enemyColor) &&
          !isSquareAttacked(board, baseRow, 6, enemyColor)) {
          moves.push(coordsToSquare(baseRow, 6));
        }

        // Queenside castling
        const queenSideRight = isWhite ? castling.includes("Q") : castling.includes("q");
        if (queenSideRight && !board[baseRow][3] && !board[baseRow][2] && !board[baseRow][1] &&
          !isSquareAttacked(board, baseRow, 4, enemyColor) &&
          !isSquareAttacked(board, baseRow, 3, enemyColor) &&
          !isSquareAttacked(board, baseRow, 2, enemyColor)) {
          moves.push(coordsToSquare(baseRow, 2));
        }
      }
      break;
    }
  }

  return moves;
}

// Get valid moves with check/pin filtering
function getValidMoves(board: string[][], row: number, col: number, piece: string, castling: string, enPassant: string): string[] {
  const raw = getRawMoves(board, row, col, piece, castling, enPassant);
  const color = getPieceColor(piece)!;

  // Filter out moves that leave own king in check
  return raw.filter(moveSquare => {
    const [toRow, toCol] = squareToCoords(moveSquare);
    return !wouldLeaveInCheck(board, row, col, toRow, toCol, color);
  });
}

function parseAuthoritativeMoves(input: unknown): AuthoritativeMove[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((entry) => {
    if (typeof entry === "string") {
      const text = entry.trim().toLowerCase();
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(text)) return [];
      return [{ from: text.slice(0, 2), to: text.slice(2, 4), promotion: text.slice(4) || undefined }];
    }

    if (entry && typeof entry === "object") {
      const maybeMove = entry as { from?: unknown; to?: unknown; promotion?: unknown };
      if (typeof maybeMove.from !== "string" || typeof maybeMove.to !== "string") return [];
      const from = maybeMove.from.toLowerCase();
      const to = maybeMove.to.toLowerCase();
      if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return [];
      const promotion = typeof maybeMove.promotion === "string" ? maybeMove.promotion.toLowerCase() : undefined;
      return [{ from, to, promotion }];
    }

    return [];
  });
}

function detectBoardMoveDelta(previousBoard: string[][], nextBoard: string[][]): BoardMoveDelta | null {
  const removed: BoardDiffSquare[] = [];
  const added: BoardDiffSquare[] = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const previousPiece = previousBoard[row]?.[col] || "";
      const nextPiece = nextBoard[row]?.[col] || "";

      if (previousPiece === nextPiece) continue;

      if (previousPiece) {
        removed.push({ row, col, piece: previousPiece });
      }

      if (nextPiece) {
        added.push({ row, col, piece: nextPiece, previousPiece: previousPiece || undefined });
      }
    }
  }

  if (removed.length === 0 || added.length === 0) return null;

  const prioritizeKingMove = (entry: BoardDiffSquare) => (entry.piece.toUpperCase() === "K" ? 0 : 1);
  const orderedAdded = [...added].sort((a, b) => prioritizeKingMove(a) - prioritizeKingMove(b));

  for (const candidate of orderedAdded) {
    const fromCandidates = removed.filter((entry) => {
      if (entry.piece !== candidate.piece) return false;
      return entry.row !== candidate.row || entry.col !== candidate.col;
    });

    if (fromCandidates.length === 0) continue;

    const from = fromCandidates.sort((a, b) => {
      const aDistance = Math.abs(a.row - candidate.row) + Math.abs(a.col - candidate.col);
      const bDistance = Math.abs(b.row - candidate.row) + Math.abs(b.col - candidate.col);
      return aDistance - bDistance;
    })[0];

    const movedPieceColor = getPieceColor(candidate.piece);
    const destinationPreviousColor = getPieceColor(candidate.previousPiece || "");
    let capturedPiece: string | undefined;
    let captureSquare: string | undefined;

    if (candidate.previousPiece && movedPieceColor && destinationPreviousColor && destinationPreviousColor !== movedPieceColor) {
      capturedPiece = candidate.previousPiece;
      captureSquare = coordsToSquare(candidate.row, candidate.col);
    } else {
      const sideCapture = removed.find((entry) => {
        if (entry.row === from.row && entry.col === from.col) return false;
        const removedColor = getPieceColor(entry.piece);
        return Boolean(removedColor && movedPieceColor && removedColor !== movedPieceColor);
      });

      if (sideCapture) {
        capturedPiece = sideCapture.piece;
        captureSquare = coordsToSquare(sideCapture.row, sideCapture.col);
      }
    }

    return {
      from: coordsToSquare(from.row, from.col),
      to: coordsToSquare(candidate.row, candidate.col),
      capturedPiece,
      captureSquare,
    };
  }

  return null;
}

export function ChessBoard({
  gameState,
  currentTurn,
  myColor,
  isMyTurn,
  isSpectator,
  authoritativeValidMoves,
  onMove,
  status,
  turnTimeLimit = 30,
  compactTopArea = false,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [showPromotion, setShowPromotion] = useState<{ from: string; to: string } | null>(null);
  const [animSquare, setAnimSquare] = useState<string | null>(null);
  const [animDelta, setAnimDelta] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [captureFx, setCaptureFx] = useState<{ square: string; piece: string } | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Game-speed multiplier (Normal/Fast/Turbo + reduced-motion). Returns 0
  // when the OS reports prefers-reduced-motion so animations effectively
  // disappear. Each derived duration mirrors the matching CSS keyframe in
  // client/src/index.css so the React-side cleanup timers stay in lockstep
  // with the visual animation length.
  const speedMultiplier = useGameSpeedMultiplier();
  const animationsDisabled = speedMultiplier === 0;
  const chessMoveAnimMs = animationsDisabled ? 0 : Math.max(1, Math.round(360 * speedMultiplier));
  const chessCaptureAnimMs = animationsDisabled ? 0 : Math.max(1, Math.round(290 * speedMultiplier));
  const chessCaptureRingAnimMs = animationsDisabled ? 0 : Math.max(1, Math.round(320 * speedMultiplier));
  // Cleanup fires just after the longest concurrent animation so state
  // clears without stranding the visual on screen.
  const slideAnimationMs = animationsDisabled ? 0 : chessMoveAnimMs + 10;
  const captureFxMs = animationsDisabled
    ? 0
    : Math.max(chessCaptureAnimMs, chessCaptureRingAnimMs) + 10;
  const prevBoardRef = useRef<string[][] | null>(null);
  const prevCheckRef = useRef<string | null>(null);
  const prevStatusRef = useRef<string | undefined>(undefined);
  const { language } = useI18n();
  const audio = useGameAudio();
  const playMoveSound = useCallback(
    (captured?: string | null, isPromotion = false, isCastle = false) => {
      if (isPromotion) {
        audio.play("promote");
        return;
      }
      if (isCastle) {
        audio.play("castle");
        return;
      }
      if (captured) {
        audio.play("capture");
        return;
      }
      audio.play("move");
    },
    [audio],
  );

  const fenData = useMemo(() => {
    if (!gameState) {
      return parseFEN(INITIAL_FEN);
    }

    const rawState = gameState.trim();

    // Accept direct FEN strings (used by watch/spectator flows).
    if (looksLikeFen(rawState)) {
      return parseFEN(rawState);
    }

    try {
      const parsed = JSON.parse(rawState);

      if (typeof parsed === "string" && looksLikeFen(parsed)) {
        return parseFEN(parsed);
      }

      if (parsed && typeof parsed === "object") {
        const maybeFen = (parsed as { fen?: unknown }).fen;
        if (typeof maybeFen === "string" && looksLikeFen(maybeFen)) {
          return parseFEN(maybeFen);
        }
      }
    } catch {
      // Fall through to initial board if payload is malformed.
    }

    return parseFEN(INITIAL_FEN);
  }, [gameState]);

  const board = fenData.board;
  const castling = fenData.castling;
  const enPassant = fenData.enPassant;
  const authoritativeMoves = useMemo(
    () => parseAuthoritativeMoves(authoritativeValidMoves),
    [authoritativeValidMoves]
  );
  const [timeLeft, setTimeLeft] = useState(turnTimeLimit);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutAutoMoveRef = useRef<string | null>(null);

  const toVisualCoords = useCallback((row: number, col: number) => {
    if (myColor === "black") {
      return { row: 7 - row, col: 7 - col };
    }
    return { row, col };
  }, [myColor]);

  const animateMoveBetweenSquares = useCallback((fromSquare: string, toSquare: string) => {
    if (animationsDisabled) return;
    const [fromRow, fromCol] = squareToCoords(fromSquare);
    const [toRow, toCol] = squareToCoords(toSquare);
    const fromVisual = toVisualCoords(fromRow, fromCol);
    const toVisual = toVisualCoords(toRow, toCol);

    setAnimDelta({
      dx: fromVisual.col - toVisual.col,
      dy: fromVisual.row - toVisual.row,
    });
    setAnimSquare(toSquare);

    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setAnimSquare(null), slideAnimationMs);
  }, [toVisualCoords, slideAnimationMs, animationsDisabled]);

  const triggerCaptureEffect = useCallback((square: string, capturedPiece?: string) => {
    if (!capturedPiece) return;
    if (animationsDisabled) return;

    setCaptureFx({ square, piece: capturedPiece });
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    captureTimerRef.current = setTimeout(() => setCaptureFx(null), captureFxMs);
  }, [captureFxMs, animationsDisabled]);

  const fallbackMoves = useMemo(() => {
    const moves: AuthoritativeMove[] = [];

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = board[row]?.[col];
        if (!piece || getPieceColor(piece) !== myColor) continue;

        const from = coordsToSquare(row, col);
        const destinations = getValidMoves(board, row, col, piece, castling, enPassant);
        for (const to of destinations) {
          moves.push({
            from,
            to,
            promotion: piece.toUpperCase() === "P" && (to.endsWith("1") || to.endsWith("8")) ? "q" : undefined,
          });
        }
      }
    }

    return moves;
  }, [board, myColor, castling, enPassant]);

  const timeoutActionKey = useMemo(() => {
    const sourceMoves = authoritativeMoves.length > 0 ? authoritativeMoves : fallbackMoves;
    return `${currentTurn ?? 'no-turn'}:${sourceMoves.map((move) => `${move.from}${move.to}${move.promotion ?? ''}`).join('|')}`;
  }, [currentTurn, authoritativeMoves, fallbackMoves]);

  const selectAutoMove = useCallback((): AuthoritativeMove | null => {
    const sourceMoves = authoritativeMoves.length > 0 ? authoritativeMoves : fallbackMoves;
    if (sourceMoves.length === 0) return null;

    const pieceValues: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    const centerSquares = new Set(["c4", "d4", "e4", "f4", "c5", "d5", "e5", "f5"]);

    const scoredMoves = sourceMoves
      .map((move) => {
        const [fromRow, fromCol] = squareToCoords(move.from);
        const [toRow, toCol] = squareToCoords(move.to);
        const movingPiece = board[fromRow]?.[fromCol] || "";
        const capturedPiece = board[toRow]?.[toCol] || "";

        let score = 0;
        if (capturedPiece) {
          score += (pieceValues[capturedPiece.toLowerCase()] ?? 0) + 120;
        }
        if (move.promotion) {
          score += move.promotion === "q" ? 320 : 220;
        }
        if (centerSquares.has(move.to)) {
          score += 24;
        }
        if (movingPiece.toLowerCase() === "n" || movingPiece.toLowerCase() === "b") {
          score += 12;
        }
        if (movingPiece.toLowerCase() === "p" && (move.to.endsWith("4") || move.to.endsWith("5"))) {
          score += 8;
        }

        return { move, score };
      })
      .sort((a, b) => b.score - a.score);

    return scoredMoves[0]?.move ?? sourceMoves[0] ?? null;
  }, [authoritativeMoves, fallbackMoves, board]);

  useEffect(() => {
    setTimeLeft(turnTimeLimit);
    timeoutAutoMoveRef.current = null;
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    if (status === "finished" || turnTimeLimit <= 0 || !currentTurn) return;

    turnTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (turnTimerRef.current) clearInterval(turnTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [currentTurn, status, turnTimeLimit]);

  useEffect(() => {
    if (timeLeft !== 0 || !isMyTurn || isSpectator || status === "finished") return;
    if (timeoutAutoMoveRef.current === timeoutActionKey) return;

    timeoutAutoMoveRef.current = timeoutActionKey;
    const autoMove = selectAutoMove();
    if (!autoMove) return;

    const [fromRow, fromCol] = squareToCoords(autoMove.from);
    const [toRow, toCol] = squareToCoords(autoMove.to);
    const movingPiece = board[fromRow]?.[fromCol];
    if (!movingPiece) return;

    const capturedPiece = board[toRow]?.[toCol] || undefined;
    onMove({
      from: autoMove.from,
      to: autoMove.to,
      piece: movingPiece.toUpperCase(),
      captured: capturedPiece,
      promotion: autoMove.promotion,
    });
    playMoveSound(capturedPiece, !!autoMove.promotion);
    if (capturedPiece) {
      triggerCaptureEffect(autoMove.to, capturedPiece);
    }
    setLastMove({ from: autoMove.from, to: autoMove.to });
    setSelectedSquare(null);
    setValidMoves([]);
  }, [timeLeft, isMyTurn, isSpectator, status, timeoutActionKey, selectAutoMove, board, onMove, triggerCaptureEffect]);

  // Trigger slide animation when lastMove changes (local move)
  useEffect(() => {
    if (!lastMove) return;
    animateMoveBetweenSquares(lastMove.from, lastMove.to);
  }, [lastMove, animateMoveBetweenSquares]);

  // Detect opponent moves via board diff
  useEffect(() => {
    const prev = prevBoardRef.current;
    prevBoardRef.current = board;
    if (!prev) return;
    const moveDelta = detectBoardMoveDelta(prev, board);
    if (!moveDelta) return;

    const isSameAsLastMove =
      lastMove &&
      lastMove.from === moveDelta.from &&
      lastMove.to === moveDelta.to;

    if (isSameAsLastMove) return;

    if (moveDelta.capturedPiece) {
      triggerCaptureEffect(moveDelta.captureSquare || moveDelta.to, moveDelta.capturedPiece);
    }
    playMoveSound(moveDelta.capturedPiece);
    setLastMove({ from: moveDelta.from, to: moveDelta.to });
  }, [board, lastMove, triggerCaptureEffect, playMoveSound]);

  useEffect(() => {
    return () => {
      if (animTimerRef.current) {
        clearTimeout(animTimerRef.current);
      }
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
      }
    };
  }, []);

  // Compute captured pieces by comparing current board with full starting set
  const capturedPieces = useMemo(() => {
    const startingWhite = ["K", "Q", "R", "R", "B", "B", "N", "N", "P", "P", "P", "P", "P", "P", "P", "P"];
    const startingBlack = ["k", "q", "r", "r", "b", "b", "n", "n", "p", "p", "p", "p", "p", "p", "p", "p"];
    const onBoard: string[] = [];
    for (const row of board) {
      for (const p of row) {
        if (p) onBoard.push(p);
      }
    }
    const removeFirst = (arr: string[], val: string) => {
      const idx = arr.indexOf(val);
      if (idx >= 0) arr.splice(idx, 1);
    };
    const whiteRemaining = [...startingWhite];
    const blackRemaining = [...startingBlack];
    for (const p of onBoard) {
      if (p === p.toUpperCase()) removeFirst(whiteRemaining, p);
      else removeFirst(blackRemaining, p);
    }
    // whiteRemaining = white pieces that are NOT on board (captured by black)
    // blackRemaining = black pieces that are NOT on board (captured by white)
    return { capturedByWhite: blackRemaining, capturedByBlack: whiteRemaining };
  }, [board]);

  // Check if king is in check
  const kingInCheck = useMemo(() => {
    const color = myColor;
    const kingPos = findKing(board, color);
    if (!kingPos) return null;
    const enemyColor = color === "white" ? "black" : "white";
    if (isSquareAttacked(board, kingPos[0], kingPos[1], enemyColor)) {
      return coordsToSquare(kingPos[0], kingPos[1]);
    }
    return null;
  }, [board, myColor]);

  // Audio: play "check" sound when king first enters check
  useEffect(() => {
    if (kingInCheck && kingInCheck !== prevCheckRef.current) {
      audio.play("check");
    }
    prevCheckRef.current = kingInCheck;
  }, [kingInCheck, audio]);

  // Audio: play game-end sound on status transition to "finished"
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev !== "finished" && status === "finished") {
      audio.play(kingInCheck ? "gameLose" : "gameWin");
    }
  }, [status, kingInCheck, audio]);

  const flippedBoard = useMemo(() => {
    if (myColor === "black") {
      return board.map(row => [...row].reverse()).reverse();
    }
    return board;
  }, [board, myColor]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (isSpectator || !isMyTurn || status === "finished") return;

    const actualRow = myColor === "black" ? 7 - row : row;
    const actualCol = myColor === "black" ? 7 - col : col;
    const square = coordsToSquare(actualRow, actualCol);
    const piece = board[actualRow][actualCol];

    if (selectedSquare) {
      const selectedAuthMoves = authoritativeMoves.filter(m => m.from === selectedSquare);
      const hasAuthoritativeMoves = selectedAuthMoves.length > 0;
      const destinationAllowedByAuthority = selectedAuthMoves.some(m => m.to === square);

      if (validMoves.includes(square) && (!hasAuthoritativeMoves || destinationAllowedByAuthority)) {
        const fromPiece = board[squareToCoords(selectedSquare)[0]][squareToCoords(selectedSquare)[1]];
        const isPawn = fromPiece.toUpperCase() === "P";
        const isPromotionRank = isPawn && (actualRow === 0 || actualRow === 7);
        const requiresPromotion = hasAuthoritativeMoves
          ? selectedAuthMoves.some(m => m.to === square && !!m.promotion)
          : isPromotionRank;

        if (requiresPromotion) {
          setShowPromotion({ from: selectedSquare, to: square });
        } else {
          const move: ChessMove = {
            from: selectedSquare,
            to: square,
            piece: fromPiece.toUpperCase(),
            captured: piece || undefined,
          };
          onMove(move);
          const isCastleMove =
            fromPiece.toUpperCase() === "K" &&
            Math.abs(squareToCoords(selectedSquare)[1] - squareToCoords(square)[1]) === 2;
          playMoveSound(piece, false, isCastleMove);
          if (piece) {
            triggerCaptureEffect(square, piece);
          }
          setLastMove({ from: selectedSquare, to: square });
        }
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (piece && getPieceColor(piece) === myColor) {
        setSelectedSquare(square);
        const squareAuthoritativeMoves = authoritativeMoves.filter(m => m.from === square).map(m => m.to);
        setValidMoves(squareAuthoritativeMoves.length > 0
          ? Array.from(new Set(squareAuthoritativeMoves))
          : getValidMoves(board, actualRow, actualCol, piece, castling, enPassant));
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      if (piece && getPieceColor(piece) === myColor) {
        setSelectedSquare(square);
        const squareAuthoritativeMoves = authoritativeMoves.filter(m => m.from === square).map(m => m.to);
        setValidMoves(squareAuthoritativeMoves.length > 0
          ? Array.from(new Set(squareAuthoritativeMoves))
          : getValidMoves(board, actualRow, actualCol, piece, castling, enPassant));
      }
    }
  }, [selectedSquare, validMoves, board, myColor, isMyTurn, isSpectator, onMove, status, castling, enPassant, authoritativeMoves, triggerCaptureEffect]);

  const handlePromotion = (promotionPiece: string) => {
    if (!showPromotion) return;
    const fromCoords = squareToCoords(showPromotion.from);
    const fromPiece = board[fromCoords[0]][fromCoords[1]];
    const toCoords = squareToCoords(showPromotion.to);
    const capturedPiece = board[toCoords[0]][toCoords[1]];

    const move: ChessMove = {
      from: showPromotion.from,
      to: showPromotion.to,
      piece: "P",
      captured: capturedPiece || undefined,
      promotion: promotionPiece.toLowerCase(),
    };
    onMove(move);
    playMoveSound(capturedPiece, true);
    if (capturedPiece) {
      triggerCaptureEffect(showPromotion.to, capturedPiece);
    }
    setLastMove({ from: showPromotion.from, to: showPromotion.to });
    setShowPromotion(null);
  };

  const getSquareColor = (row: number, col: number): string => {
    const actualRow = myColor === "black" ? 7 - row : row;
    const actualCol = myColor === "black" ? 7 - col : col;
    const square = coordsToSquare(actualRow, actualCol);

    const isLight = (row + col) % 2 === 0;
    let className = isLight ? "chess-square chess-square-light" : "chess-square chess-square-dark";

    if (selectedSquare === square) {
      className = "chess-square chess-square-selected";
    } else if (kingInCheck === square) {
      className = "chess-square chess-square-check";
    } else if (validMoves.includes(square)) {
      className = isLight ? "chess-square chess-square-valid-light" : "chess-square chess-square-valid-dark";
    } else if (lastMove && (lastMove.from === square || lastMove.to === square)) {
      className = isLight ? "chess-square chess-square-last-light" : "chess-square chess-square-last-dark";
    }

    return className;
  };

  // Pieces captured by this player (enemy pieces) shown at top, opponent's captures at bottom
  const topCaptures = myColor === "white" ? capturedPieces.capturedByWhite : capturedPieces.capturedByBlack;
  const bottomCaptures = myColor === "white" ? capturedPieces.capturedByBlack : capturedPieces.capturedByWhite;

  return (
    <div className="relative">
      {status !== "finished" && currentTurn && !compactTopArea && (
        <div className="mb-2 flex justify-center">
          <div
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold font-mono shadow-sm",
              timeLeft <= 10
                ? "border-red-500/60 bg-red-500/15 text-red-600"
                : isMyTurn
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-muted/70 text-foreground"
            )}
          >
            {timeLeft}s
          </div>
        </div>
      )}

      {/* Opponent's captures (pieces they took from us) */}
      {bottomCaptures.length > 0 && (
        <div className="mb-0.5 flex items-center gap-0.5">
          {bottomCaptures.map((p, i) => (
            <span key={i} className="chess-piece-captured">{PIECE_SYMBOLS[p]}</span>
          ))}
        </div>
      )}
      <div className="relative">
        <div className="grid grid-cols-8 w-full aspect-square border-2 rounded-lg overflow-hidden shadow-lg chess-board-frame">
          {flippedBoard.map((rowPieces, row) => (
            rowPieces.map((piece, col) => {
              const actualRow = myColor === "black" ? 7 - row : row;
              const actualCol = myColor === "black" ? 7 - col : col;
              const square = coordsToSquare(actualRow, actualCol);
              const isValidMove = validMoves.includes(square);

              return (
                <div
                  key={`${row}-${col}`}
                  className={cn(
                    "w-full h-full min-w-0 min-h-0 aspect-square flex items-center justify-center cursor-pointer relative transition-colors",
                    getSquareColor(row, col),
                    isMyTurn && !isSpectator && "hover:brightness-110",
                    kingInCheck === square && "animate-chess-check"
                  )}
                  onClick={() => handleSquareClick(row, col)}
                  data-testid={`chess-square-${square}`}
                >
                  {piece && (
                    <span
                      className={cn(
                        "text-[clamp(1.3rem,5.4vw,2.25rem)] select-none chess-piece",
                        isWhitePiece(piece) ? "chess-piece-white" : "chess-piece-black",
                        animSquare === square && !animationsDisabled && "animate-chess-move chess-piece-moving"
                      )}
                      style={animSquare === square ? {
                        "--move-from-col": `${animDelta.dx}`,
                        "--move-from-row": `${animDelta.dy}`,
                        animationDuration: animationsDisabled ? undefined : `${chessMoveAnimMs}ms`,
                      } as React.CSSProperties : undefined}
                    >
                      {PIECE_SYMBOLS[piece]}
                    </span>
                  )}
                  {captureFx?.square === square && !animationsDisabled && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                      <span
                        className={cn(
                          "text-[clamp(1.3rem,5.4vw,2.25rem)] select-none chess-piece animate-chess-capture",
                          isWhitePiece(captureFx.piece) ? "chess-piece-white" : "chess-piece-black"
                        )}
                        style={{ animationDuration: `${chessCaptureAnimMs}ms` }}
                      >
                        {PIECE_SYMBOLS[captureFx.piece]}
                      </span>
                      <span
                        className="absolute inset-1 rounded-full border border-red-500/50 animate-chess-capture-ring"
                        style={{ animationDuration: `${chessCaptureRingAnimMs}ms` }}
                      />
                    </div>
                  )}
                  {isValidMove && !piece && (
                    <div className="absolute w-3 h-3 rounded-full bg-green-500/50" />
                  )}
                  {isValidMove && piece && (
                    <div className="absolute inset-0 border-4 border-green-500/50 rounded-full" />
                  )}
                  {col === 0 && (
                    <span className="absolute top-0.5 start-0.5 text-xs font-bold text-amber-900/70">
                      {myColor === "black" ? row + 1 : 8 - row}
                    </span>
                  )}
                  {row === 7 && (
                    <span className="absolute bottom-0.5 end-0.5 text-xs font-bold text-amber-900/70">
                      {myColor === "black" ? FILES[7 - col] : FILES[col]}
                    </span>
                  )}
                </div>
              );
            })
          ))}
        </div>

        {status !== "finished" && currentTurn && compactTopArea && (
          <div className="pointer-events-none absolute start-1/2 top-2 z-20 -translate-x-1/2">
            <div
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono shadow-sm",
                timeLeft <= 10
                  ? "border-red-500/60 bg-red-500/15 text-red-600"
                  : isMyTurn
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/75 text-foreground"
              )}
            >
              {timeLeft}s
            </div>
          </div>
        )}
      </div>

      {/* Our captures (pieces we took from opponent) */}
      {topCaptures.length > 0 && (
        <div className="mt-0.5 flex items-center gap-0.5">
          {topCaptures.map((p, i) => (
            <span key={i} className="chess-piece-captured">{PIECE_SYMBOLS[p]}</span>
          ))}
        </div>
      )}

      {showPromotion && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-4 rounded-lg shadow-xl">
            <p className="text-center mb-3 font-medium">{language === "ar" ? "اختر الترقية:" : "Choose promotion:"}</p>
            <div className="flex gap-2">
              {["Q", "R", "B", "N"].map((p) => (
                <button
                  key={p}
                  onClick={() => handlePromotion(p)}
                  className="w-14 h-14 rounded-lg flex items-center justify-center text-3xl chess-promotion-btn"
                  data-testid={`promotion-${p}`}
                >
                  {PIECE_SYMBOLS[myColor === "white" ? p : p.toLowerCase()]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {status === "finished" && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <span className="text-2xl font-bold text-white drop-shadow-lg">{language === "ar" ? "انتهت اللعبة" : "Game Over"}</span>
        </div>
      )}
    </div>
  );
}
