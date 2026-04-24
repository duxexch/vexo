import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { BoardTheme } from '@/lib/chess-themes';
import { getDefaultTheme } from '@/lib/chess-themes';
import { useGameSpeedMultiplier } from '@/lib/game-speed';

interface ChessPiece {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
}

interface ChessBoardProps {
  position: Record<string, ChessPiece>;
  currentTurn: 'w' | 'b';
  playerColor: 'w' | 'b';
  validMoves: string[];
  lastMove?: { from: string; to: string };
  isCheck: boolean;
  onMove: (from: string, to: string, promotion?: string) => void;
  disabled?: boolean;
  theme?: BoardTheme;
}

const PIECE_UNICODE: Record<string, string> = {
  'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟'
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export function ChessBoard({
  position,
  currentTurn,
  playerColor,
  validMoves,
  lastMove,
  isCheck,
  onMove,
  disabled = false,
  theme
}: ChessBoardProps) {
  const t_ = theme || getDefaultTheme();
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [highlightedMoves, setHighlightedMoves] = useState<string[]>([]);
  const [showPromotion, setShowPromotion] = useState<{ from: string; to: string } | null>(null);
  const [dragPiece, setDragPiece] = useState<{ square: string; piece: ChessPiece } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOverSquare, setDragOverSquare] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  // For slide animation
  const [animating, setAnimating] = useState<{ from: string; to: string; piece: ChessPiece } | null>(null);
  const prevPositionRef = useRef<Record<string, ChessPiece>>({});
  // Game-speed multiplier (Normal/Fast/Turbo + reduced-motion). Returns 0
  // when the OS reports prefers-reduced-motion so animations effectively
  // disappear. Floor each derived duration at 1ms so the cleanup timer
  // always fires on the next tick instead of being lost.
  const speedMultiplier = useGameSpeedMultiplier();
  const animationsDisabled = speedMultiplier === 0;
  const slideTransitionSec = animationsDisabled ? 0 : Math.max(0.001, 0.25 * speedMultiplier);
  const slideCleanupMs = animationsDisabled ? 0 : Math.max(1, Math.round(350 * speedMultiplier));

  const isPlayerTurn = currentTurn === playerColor;
  const flipped = playerColor === 'b';

  const displayRanks = useMemo(() => flipped ? [...RANKS].reverse() : RANKS, [flipped]);
  const displayFiles = useMemo(() => flipped ? [...FILES].reverse() : FILES, [flipped]);

  // Detect opponent moves for slide animation
  useEffect(() => {
    const prev = prevPositionRef.current;
    if (lastMove && Object.keys(prev).length > 0) {
      const movedPiece = position[lastMove.to];
      const wasAtFrom = prev[lastMove.from];
      if (movedPiece && wasAtFrom) {
        // Only animate opponent moves (not our own)
        if (movedPiece.color !== playerColor) {
          setAnimating({ from: lastMove.from, to: lastMove.to, piece: movedPiece });
          // Use rAF to trigger the transition — start offset, then resolve to 0
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setAnimating(null);
            });
          });
          // Fallback cleanup
          setTimeout(() => setAnimating(null), slideCleanupMs);
        }
      }
    }
    prevPositionRef.current = { ...position };
  }, [position, lastMove, playerColor, slideCleanupMs]);

  const getValidMovesForSquare = useCallback((square: string): string[] => {
    return validMoves
      .filter(move => move.startsWith(square))
      .map(move => move.slice(2, 4));
  }, [validMoves]);

  const isPromotionMove = useCallback((from: string, to: string): boolean => {
    const piece = position[from];
    if (!piece || piece.type !== 'p') return false;
    const rank = to[1];
    return (piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1');
  }, [position]);

  const tryMove = useCallback((from: string, to: string) => {
    if (isPromotionMove(from, to)) {
      setShowPromotion({ from, to });
    } else {
      onMove(from, to);
    }
    setSelectedSquare(null);
    setHighlightedMoves([]);
  }, [isPromotionMove, onMove]);

  const resetDragState = useCallback(() => {
    activePointerIdRef.current = null;
    setDragPiece(null);
    setDragPos(null);
    setDragOverSquare(null);
  }, []);

  useEffect(() => {
    // If turn changes (or board is disabled) while dragging, clean up transient state.
    if (disabled || !isPlayerTurn) {
      resetDragState();
      setSelectedSquare(null);
      setHighlightedMoves([]);
    }
  }, [disabled, isPlayerTurn, resetDragState]);

  useEffect(() => {
    const handleWindowBlur = () => {
      resetDragState();
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [resetDragState]);

  const handleSquareClick = useCallback((square: string) => {
    if (disabled || !isPlayerTurn) return;

    const piece = position[square];

    if (selectedSquare) {
      if (highlightedMoves.includes(square)) {
        tryMove(selectedSquare, square);
      } else if (piece && piece.color === playerColor) {
        setSelectedSquare(square);
        setHighlightedMoves(getValidMovesForSquare(square));
      } else {
        setSelectedSquare(null);
        setHighlightedMoves([]);
      }
    } else {
      if (piece && piece.color === playerColor) {
        setSelectedSquare(square);
        setHighlightedMoves(getValidMovesForSquare(square));
      }
    }
  }, [disabled, isPlayerTurn, selectedSquare, highlightedMoves, position, playerColor, tryMove, getValidMovesForSquare]);

  const handlePromotion = useCallback((promotionPiece: string) => {
    if (showPromotion) {
      onMove(showPromotion.from, showPromotion.to, promotionPiece);
      setShowPromotion(null);
      setSelectedSquare(null);
      setHighlightedMoves([]);
    }
  }, [showPromotion, onMove]);

  // ── Drag and Drop ──
  const getSquareFromCoords = useCallback((clientX: number, clientY: number): string | null => {
    if (!boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const sqSize = rect.width / 8;
    const col = Math.floor((clientX - rect.left) / sqSize);
    const row = Math.floor((clientY - rect.top) / sqSize);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const fileIdx = flipped ? 7 - col : col;
    const rankIdx = flipped ? 7 - row : row;
    return `${FILES[fileIdx]}${RANKS[rankIdx]}`;
  }, [flipped]);

  const handlePointerDown = useCallback((e: React.PointerEvent, square: string) => {
    if (disabled || !isPlayerTurn) return;
    if (activePointerIdRef.current !== null) return;

    const piece = position[square];
    if (!piece || piece.color !== playerColor) return;

    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;

    setDragPiece({ square, piece });
    setDragPos({ x: e.clientX, y: e.clientY });
    setDragOverSquare(square);
    setSelectedSquare(square);
    setHighlightedMoves(getValidMovesForSquare(square));
  }, [disabled, isPlayerTurn, position, playerColor, getValidMovesForSquare]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragPiece || activePointerIdRef.current !== e.pointerId) return;

    setDragPos({ x: e.clientX, y: e.clientY });
    setDragOverSquare(getSquareFromCoords(e.clientX, e.clientY));
  }, [dragPiece, getSquareFromCoords]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragPiece || activePointerIdRef.current !== e.pointerId) return;

    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }

    const targetSquare = dragOverSquare || getSquareFromCoords(e.clientX, e.clientY);
    if (targetSquare && targetSquare !== dragPiece.square && highlightedMoves.includes(targetSquare)) {
      tryMove(dragPiece.square, targetSquare);
    }

    resetDragState();
  }, [dragPiece, dragOverSquare, getSquareFromCoords, highlightedMoves, tryMove, resetDragState]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (activePointerIdRef.current !== e.pointerId) return;

    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }

    resetDragState();
  }, [resetDragState]);

  const findKingSquare = useCallback((color: 'w' | 'b'): string | null => {
    for (const [square, piece] of Object.entries(position)) {
      if (piece.type === 'k' && piece.color === color) return square;
    }
    return null;
  }, [position]);

  const kingInCheckSquare = isCheck ? findKingSquare(currentTurn) : null;

  // Calculate animation offset for sliding pieces
  const getAnimOffset = useCallback((square: string): { x: number; y: number } | null => {
    if (!animating || animating.to !== square) return null;
    const fromFile = FILES.indexOf(animating.from[0]);
    const fromRank = RANKS.indexOf(animating.from[1]);
    const toFile = FILES.indexOf(animating.to[0]);
    const toRank = RANKS.indexOf(animating.to[1]);
    const dx = (fromFile - toFile) * (flipped ? -1 : 1);
    const dy = (fromRank - toRank) * (flipped ? -1 : 1);
    return { x: dx * 100, y: dy * 100 };
  }, [animating, flipped]);

  const { t } = useI18n();

  return (
    <div className="relative w-[min(100vw-2rem,calc(100vh-200px))] sm:w-[min(80vw,560px)] max-w-[560px] mx-auto aspect-square select-none">
      <div
        ref={boardRef}
        className="grid grid-cols-8 rounded-xl overflow-hidden w-full h-full"
        style={{
          border: `3px solid ${t_.borderColor}`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.1)`,
          background: t_.boardBg || undefined,
          touchAction: 'none'
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {displayRanks.map((rank, rankIndex) =>
          displayFiles.map((file, fileIndex) => {
            const square = `${file}${rank}`;
            const isLight = (rankIndex + fileIndex) % 2 === 0;
            const piece = position[square];
            const isSelected = selectedSquare === square;
            const isValidMoveSq = highlightedMoves.includes(square);
            const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
            const isKingCheck = kingInCheckSquare === square;
            const isDragSource = dragPiece?.square === square;
            const isDragTarget = dragOverSquare === square && highlightedMoves.includes(square);
            const animOffset = getAnimOffset(square);

            let bgColor = isLight ? t_.lightSquare : t_.darkSquare;
            if (isLastMove) bgColor = 'transparent';
            if (isSelected) bgColor = 'transparent';

            return (
              <div
                key={square}
                data-testid={`square-${square}`}
                className="relative flex items-center justify-center"
                style={{
                  backgroundColor: bgColor,
                  backgroundImage: isSelected ? undefined
                    : isLastMove ? `linear-gradient(${isLight ? t_.lightSquare : t_.darkSquare}, ${isLight ? t_.lightSquare : t_.darkSquare})`
                    : undefined,
                  cursor: !disabled && isPlayerTurn && piece?.color === playerColor
                    ? (isDragSource ? 'grabbing' : 'grab')
                    : 'default',
                }}
                onClick={() => handleSquareClick(square)}
                onPointerDown={(e) => handlePointerDown(e, square)}
              >
                {/* Last move highlight overlay */}
                {isLastMove && (
                  <div className="absolute inset-0" style={{
                    backgroundColor: isLight ? t_.lightSquare : t_.darkSquare
                  }}>
                    <div className="absolute inset-0" style={{ backgroundColor: t_.lastMoveBg }} />
                  </div>
                )}

                {/* Selected square overlay */}
                {isSelected && (
                  <div className="absolute inset-0" style={{
                    backgroundColor: isLight ? t_.lightSquare : t_.darkSquare
                  }}>
                    <div className="absolute inset-0" style={{ backgroundColor: t_.selectedBg }} />
                  </div>
                )}

                {/* Check glow */}
                {isKingCheck && (
                  <div className="absolute inset-0 z-[1]" style={{ background: t_.checkGlow }} />
                )}

                {/* File/rank labels */}
                {fileIndex === 0 && (
                  <span
                    className="absolute top-[2px] start-[3px] text-[9px] sm:text-[11px] font-bold leading-none pointer-events-none z-10"
                    style={{ color: isLight ? t_.labelLight : t_.labelDark }}
                  >
                    {rank}
                  </span>
                )}
                {rankIndex === 7 && (
                  <span
                    className="absolute bottom-[1px] end-[3px] text-[9px] sm:text-[11px] font-bold leading-none pointer-events-none z-10"
                    style={{ color: isLight ? t_.labelLight : t_.labelDark }}
                  >
                    {file}
                  </span>
                )}

                {/* Legal move dot (empty square) */}
                {isValidMoveSq && !piece && (
                  <div
                    className="absolute w-[26%] h-[26%] rounded-full z-10 pointer-events-none"
                    style={{ backgroundColor: t_.legalMoveDot }}
                  />
                )}

                {/* Legal capture ring (occupied square) */}
                {isValidMoveSq && piece && (
                  <div
                    className="absolute inset-[4%] rounded-full z-10 pointer-events-none"
                    style={{
                      border: `5px solid ${t_.captureRing}`,
                    }}
                  />
                )}

                {isDragTarget && (
                  <div
                    className="absolute inset-[8%] rounded-lg z-10 pointer-events-none"
                    style={{ border: `2px solid ${t_.selectedBg}` }}
                  />
                )}

                {/* Piece */}
                {piece && !isDragSource && (
                  <span
                    className={cn(
                      "text-[min(4.5rem,12vw)] sm:text-5xl md:text-[3.5rem] select-none z-[2] leading-none",
                      piece.color === 'w'
                        ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]'
                        : 'text-gray-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.4)]'
                    )}
                    style={{
                      filter: t_.pieceFilter || undefined,
                      transition: animationsDisabled
                        ? 'none'
                        : `transform ${slideTransitionSec}s cubic-bezier(.2,.8,.3,1)`,
                      transform: animOffset
                        ? `translate(${animOffset.x}%, ${animOffset.y}%)`
                        : undefined,
                    }}
                  >
                    {PIECE_UNICODE[`${piece.color}${piece.type}`]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Dragged piece ghost */}
      {dragPiece && dragPos && (
        <span
          className={cn(
            "fixed pointer-events-none z-50 text-6xl sm:text-7xl select-none",
            dragPiece.piece.color === 'w'
              ? 'text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]'
              : 'text-gray-900 drop-shadow-[0_2px_4px_rgba(255,255,255,0.5)]'
          )}
          style={{
            left: dragPos.x,
            top: dragPos.y,
            transform: 'translate(-50%, -50%)',
            filter: t_.pieceFilter || undefined
          }}
        >
          {PIECE_UNICODE[`${dragPiece.piece.color}${dragPiece.piece.type}`]}
        </span>
      )}

      {/* Promotion dialog */}
      {showPromotion && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 rounded-xl">
          <div className="bg-card p-5 rounded-2xl shadow-2xl border-2" style={{ borderColor: t_.borderColor }}>
            <p className="text-center mb-4 font-semibold text-lg">{t('chess.choosePromotion')}</p>
            <div className="flex gap-3">
              {['q', 'r', 'b', 'n'].map((pc) => (
                <button
                  key={pc}
                  data-testid={`promote-${pc}`}
                  onClick={() => handlePromotion(pc)}
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-5xl transition-all hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: t_.lightSquare,
                    boxShadow: `0 2px 8px rgba(0,0,0,0.2)`,
                    border: `2px solid ${t_.borderColor}`
                  }}
                >
                  <span className={playerColor === 'w'
                    ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]'
                    : 'text-gray-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.4)]'
                  }>
                    {PIECE_UNICODE[`${playerColor}${pc}`]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
