import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useGameAudio } from "@/hooks/use-game-audio";
import { useGameSpeedMultiplier } from "@/lib/game-speed";
import { useChessTheme } from "@/components/games/chess/ChessThemeContext";

interface ChessBoardProps {
  gameState?: string;
  currentTurn?: string;
  myColor: "white" | "black";
  isMyTurn: boolean;
  isSpectator: boolean;
  authoritativeValidMoves?: unknown;
  lastMove?: { from: string; to: string; capture?: boolean; check?: boolean; promotion?: string } | null;
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

type ChessValidMoves = Record<string, string[]>;

interface AuthoritativeMove {
  from: string;
  to: string;
  promotion?: string;
}

interface BoardState {
  board: string[][];
  castling: string;
  enPassant: string;
}

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

function parseFEN(fen: string): BoardState {
  const parts = fen.split(" ");
  const rows = (parts[0] || "").split("/");
  const board: string[][] = [];

  for (const row of rows) {
    const boardRow: string[] = [];
    for (const char of row) {
      const digit = Number(char);
      if (Number.isFinite(digit)) {
        for (let i = 0; i < digit; i += 1) boardRow.push("");
      } else {
        boardRow.push(char);
      }
    }
    board.push(boardRow);
  }

  return {
    board,
    castling: parts[2] || "-",
    enPassant: parts[3] || "-",
  };
}

function coordsToSquare(row: number, col: number): string {
  return `${FILES[col]}${RANKS[row]}`;
}

function squareToCoords(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - Number.parseInt(square[1], 10);
  return [rank, file];
}

function isWhitePiece(piece: string): boolean {
  return piece === piece.toUpperCase() && piece !== "";
}

function getPieceColor(piece: string): "white" | "black" | null {
  if (!piece) return null;
  return isWhitePiece(piece) ? "white" : "black";
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

function normalizeLastMove(lastMove?: { from: string; to: string; capture?: boolean; check?: boolean; promotion?: string } | null) {
  if (!lastMove) return null;
  return { from: lastMove.from.toLowerCase(), to: lastMove.to.toLowerCase(), capture: lastMove.capture, check: lastMove.check, promotion: lastMove.promotion };
}

export function ChessBoard({
  gameState,
  currentTurn,
  myColor,
  isMyTurn,
  isSpectator,
  authoritativeValidMoves,
  lastMove,
  onMove,
  status,
  turnTimeLimit = 30,
  compactTopArea = false,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [showPromotion, setShowPromotion] = useState<{ from: string; to: string } | null>(null);
  const [animSquare, setAnimSquare] = useState<string | null>(null);
  const [animDelta, setAnimDelta] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [captureFx, setCaptureFx] = useState<{ square: string; piece: string } | null>(null);

  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenLastMoveRef = useRef<string | null>(null);

  const speedMultiplier = useGameSpeedMultiplier();
  const animationsDisabled = speedMultiplier === 0;
  const chessMoveAnimMs = animationsDisabled ? 0 : Math.max(1, Math.round(360 * speedMultiplier));
  const chessCaptureAnimMs = animationsDisabled ? 0 : Math.max(1, Math.round(290 * speedMultiplier));
  const chessCaptureRingAnimMs = animationsDisabled ? 0 : Math.max(1, Math.round(320 * speedMultiplier));
  const slideAnimationMs = animationsDisabled ? 0 : chessMoveAnimMs + 10;
  const captureFxMs = animationsDisabled ? 0 : Math.max(chessCaptureAnimMs, chessCaptureRingAnimMs) + 10;

  const { language } = useI18n();
  const theme = useChessTheme();
  const audio = useGameAudio();

  const boardState = useMemo(() => {
    if (!gameState) return parseFEN(INITIAL_FEN);
    const raw = gameState.trim();

    if (looksLikeFen(raw)) return parseFEN(raw);

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" && looksLikeFen(parsed)) return parseFEN(parsed);
      if (parsed && typeof parsed === "object") {
        const maybeFen = (parsed as { fen?: unknown }).fen;
        if (typeof maybeFen === "string" && looksLikeFen(maybeFen)) return parseFEN(maybeFen);
      }
    } catch {
      // fallback below
    }

    return parseFEN(INITIAL_FEN);
  }, [gameState]);

  const board = boardState.board;

  // ⚠️ CRITICAL ARCHITECTURE NOTE:
  // This board is fully server-authoritative.
  // Do NOT reintroduce local move generation or board-diff inference.
  // All gameplay logic must come from server.validMoves and server.lastMove.
  const authoritativeMoves = useMemo(() => parseAuthoritativeMoves(authoritativeValidMoves as ChessValidMoves), [authoritativeValidMoves]);

  const validMoveMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const move of authoritativeMoves) {
      const list = map.get(move.from) || [];
      list.push(move.to);
      map.set(move.from, list);
    }
    return map;
  }, [authoritativeMoves]);

  const authoritativeMoveSet = useMemo(() => new Set(authoritativeMoves.map((move) => `${move.from}:${move.to}`)), [authoritativeMoves]);

  const [timeLeft, setTimeLeft] = useState(turnTimeLimit);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTimeLeft(turnTimeLimit);
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    if (status === "finished" || turnTimeLimit <= 0 || !currentTurn) return;

    turnTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [currentTurn, status, turnTimeLimit]);

  const normalizedLastMove = useMemo(() => normalizeLastMove(lastMove), [lastMove]);

  useEffect(() => {
    if (!normalizedLastMove) return;

    const lastMoveKey = `${normalizedLastMove.from}:${normalizedLastMove.to}`;
    if (lastMoveKey === seenLastMoveRef.current) return;
    seenLastMoveRef.current = lastMoveKey;

    const [fromRow, fromCol] = squareToCoords(normalizedLastMove.from);
    const [toRow, toCol] = squareToCoords(normalizedLastMove.to);
    const fromVisual = myColor === "black" ? { row: 7 - fromRow, col: 7 - fromCol } : { row: fromRow, col: fromCol };
    const toVisual = myColor === "black" ? { row: 7 - toRow, col: 7 - toCol } : { row: toRow, col: toCol };

    if (!animationsDisabled) {
      setAnimDelta({ dx: fromVisual.col - toVisual.col, dy: fromVisual.row - toVisual.row });
      setAnimSquare(normalizedLastMove!.to);

      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      animTimerRef.current = setTimeout(() => setAnimSquare(null), slideAnimationMs);
    }

    const movingPiece = board[toRow]?.[toCol] || "";
    if (normalizedLastMove.capture) {
      audio.play("capture");
    } else if (normalizedLastMove.promotion || (movingPiece.toLowerCase() === "p" && (normalizedLastMove.to.endsWith("1") || normalizedLastMove.to.endsWith("8")))) {
      audio.play("promote");
    } else if (normalizedLastMove.check) {
      audio.play("check");
    } else {
      audio.play("move");
    }
  }, [animationsDisabled, audio, board, myColor, normalizedLastMove, slideAnimationMs]);

  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, []);

  const triggerCaptureEffect = useCallback((square: string, capturedPiece?: string) => {
    if (!capturedPiece || animationsDisabled) return;
    setCaptureFx({ square, piece: capturedPiece });
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    captureTimerRef.current = setTimeout(() => setCaptureFx(null), captureFxMs);
  }, [animationsDisabled, captureFxMs]);

  const canMove = useCallback((from: string, to: string) => {
    return authoritativeMoveSet.has(`${from}:${to}`);
  }, [authoritativeMoveSet]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (isSpectator || !isMyTurn || status === "finished") return;

    const actualRow = myColor === "black" ? 7 - row : row;
    const actualCol = myColor === "black" ? 7 - col : col;
    const square = coordsToSquare(actualRow, actualCol);
    const piece = board[actualRow]?.[actualCol];

    if (!selectedSquare) {
      if (!validMoveMap.has(square)) return;
      if (piece && getPieceColor(piece) !== myColor) return;
      setSelectedSquare(square);
      return;
    }

    if (canMove(selectedSquare, square)) {
      const fromCoords = squareToCoords(selectedSquare);
      const movingPiece = board[fromCoords[0]]?.[fromCoords[1]] || "";
      const targetPiece = piece || undefined;
      const isPromotion = movingPiece.toLowerCase() === "p" && (square.endsWith("1") || square.endsWith("8"));
      const promotion = isPromotion ? "q" : undefined;

      if (isPromotion) {
        setShowPromotion({ from: selectedSquare, to: square });
      } else {
        onMove({
          from: selectedSquare,
          to: square,
          piece: movingPiece.toUpperCase(),
          captured: targetPiece,
          promotion,
        });
      }

      setSelectedSquare(null);
      return;
    }

    if (piece && getPieceColor(piece) === myColor) {
      setSelectedSquare(square);
      return;
    }

    setSelectedSquare(null);
  }, [board, canMove, isMyTurn, isSpectator, myColor, onMove, selectedSquare, status, validMoveMap]);

  const handlePromotion = (promotionPiece: string) => {
    if (!showPromotion) return;
    const fromCoords = squareToCoords(showPromotion.from);
    const toCoords = squareToCoords(showPromotion.to);
    const capturedPiece = board[toCoords[0]][toCoords[1]];
    const fromPiece = board[fromCoords[0]][fromCoords[1]];

    onMove({
      from: showPromotion.from,
      to: showPromotion.to,
      piece: fromPiece ? fromPiece.toUpperCase() : "P",
      captured: capturedPiece || undefined,
      promotion: promotionPiece.toLowerCase(),
    });

    if (capturedPiece) triggerCaptureEffect(showPromotion.to, capturedPiece);
    setShowPromotion(null);
  };

  const flippedBoard = useMemo(() => {
    if (myColor === "black") return board.map((row) => [...row].reverse()).reverse();
    return board;
  }, [board, myColor]);

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
                  : "border-border/60 bg-muted/70 text-foreground",
            )}
          >
            {timeLeft}s
          </div>
        </div>
      )}

      <div className="relative">
        <div
          className="grid grid-cols-8 w-full aspect-square border-2 rounded-lg overflow-hidden shadow-lg chess-board-frame"
          style={{
            borderColor: theme.borderColor,
            background: theme.boardBg,
          }}
        >
          {flippedBoard.map((rowPieces, row) =>
            rowPieces.map((piece, col) => {
              const actualRow = myColor === "black" ? 7 - row : row;
              const actualCol = myColor === "black" ? 7 - col : col;
              const square = coordsToSquare(actualRow, actualCol);
              const isLight = (row + col) % 2 === 0;
              const isValidMove = Boolean(selectedSquare && validMoveMap.get(selectedSquare)?.includes(square));
              const isSelected = selectedSquare === square;
              const isLastMove = Boolean(normalizedLastMove?.from === square || normalizedLastMove?.to === square);

              const squareStateStyle: CSSProperties = isSelected
                ? { backgroundColor: theme.selectedBg }
                : isLastMove
                  ? { backgroundColor: theme.lastMoveBg }
                  : { backgroundColor: isLight ? theme.lightSquare : theme.darkSquare };

              return (
                <div
                  key={`${row}-${col}`}
                  className={cn(
                    "w-full h-full min-w-0 min-h-0 aspect-square flex items-center justify-center cursor-pointer relative transition-colors",
                    isMyTurn && !isSpectator && "hover:brightness-110",
                  )}
                  style={squareStateStyle}
                  onClick={() => handleSquareClick(row, col)}
                  data-testid={`chess-square-${square}`}
                >
                  {piece && (
                    <span
                      className={cn(
                        "text-[clamp(1.3rem,5.4vw,2.25rem)] select-none chess-piece",
                        isWhitePiece(piece) ? "chess-piece-white" : "chess-piece-black",
                        animSquare === square && !animationsDisabled && "animate-chess-move chess-piece-moving",
                      )}
                      style={(animSquare === square
                        ? {
                          "--move-from-col": `${animDelta.dx}`,
                          "--move-from-row": `${animDelta.dy}`,
                          animationDuration: animationsDisabled ? undefined : `${chessMoveAnimMs}ms`,
                          filter: theme.pieceFilter,
                        }
                        : { filter: theme.pieceFilter }) as CSSProperties}
                    >
                      {PIECE_SYMBOLS[piece]}
                    </span>
                  )}

                  {captureFx?.square === square && !animationsDisabled && (
                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                      <span
                        className={cn(
                          "text-[clamp(1.3rem,5.4vw,2.25rem)] select-none chess-piece animate-chess-capture",
                          isWhitePiece(captureFx.piece) ? "chess-piece-white" : "chess-piece-black",
                        )}
                        style={{ animationDuration: `${chessCaptureAnimMs}ms`, filter: theme.pieceFilter }}
                      >
                        {PIECE_SYMBOLS[captureFx.piece]}
                      </span>
                      <span
                        className="absolute inset-1 rounded-full animate-chess-capture-ring"
                        style={{ animationDuration: `${chessCaptureRingAnimMs}ms`, borderColor: theme.captureRing }}
                      />
                    </div>
                  )}

                  {isValidMove && !piece && <div className="absolute w-3 h-3 rounded-full" style={{ backgroundColor: theme.legalMoveDot }} />}
                  {isValidMove && piece && <div className="absolute inset-0 border-4 rounded-full" style={{ borderColor: theme.legalMoveDot }} />}

                  {isSelected && <div className="absolute inset-0 ring-2" style={{ boxShadow: `inset 0 0 0 2px ${theme.selectedBg}` }} />}
                  {isLastMove && <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 0 2px ${theme.lastMoveBg}` }} />}

                  {col === 0 && (
                    <span className="absolute top-0.5 start-0.5 text-xs font-bold" style={{ color: theme.labelDark }}>
                      {myColor === "black" ? row + 1 : 8 - row}
                    </span>
                  )}
                  {row === 7 && (
                    <span className="absolute bottom-0.5 end-0.5 text-xs font-bold" style={{ color: theme.labelLight }}>
                      {myColor === "black" ? FILES[7 - col] : FILES[col]}
                    </span>
                  )}
                </div>
              );
            }),
          )}
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
                    : "border-border/60 bg-muted/75 text-foreground",
              )}
            >
              {timeLeft}s
            </div>
          </div>
        )}
      </div>

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
                  {PIECE_SYMBOLS[p]}
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
