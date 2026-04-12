import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface BackgammonBoardProps {
  board: number[];
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };
  dice: number[];
  diceUsed: boolean[];
  currentTurn: 'white' | 'black';
  playerColor: 'white' | 'black' | 'spectator';
  validMoves: Array<{ type: string; from: string; to: string }>;
  mustRoll: boolean;
  onMove: (from: number, to: number) => void;
  onRoll: () => void;
  onDouble?: () => void;
  onAcceptDouble?: () => void;
  onDeclineDouble?: () => void;
  doublingCube?: number;
  cubeOwner?: 'white' | 'black' | null;
  cubeOffered?: boolean;
  cubeOfferedBy?: 'white' | 'black' | null;
  disabled?: boolean;
  turnTimeLimit?: number;
}

const CHECKER_COLORS = {
  white: 'backgammon-checker--white',
  black: 'backgammon-checker--black'
};

const DIE_PIP_CELLS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function BackgammonBoard({
  board,
  bar,
  borneOff,
  dice,
  diceUsed,
  currentTurn,
  playerColor,
  validMoves,
  mustRoll,
  onMove,
  onRoll,
  onDouble,
  onAcceptDouble,
  onDeclineDouble,
  doublingCube = 1,
  cubeOwner = null,
  cubeOffered = false,
  cubeOfferedBy = null,
  disabled = false,
  turnTimeLimit = 30,
}: BackgammonBoardProps) {
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [highlightedPoints, setHighlightedPoints] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(turnTimeLimit);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutAutoActionRef = useRef<string | null>(null);
  const { t } = useI18n();

  const isPlayerTurn = playerColor !== 'spectator' && currentTurn === playerColor;
  const flipped = playerColor === 'black';

  const barPosition = playerColor === 'white' ? -1 : 24;
  const bearOffPosition = playerColor === 'white' ? 24 : -1;

  const timeoutActionKey = useMemo(() => {
    const moveKey = validMoves.map((move) => `${move.type}:${move.from}:${move.to}`).join('|');
    return `${currentTurn}:${mustRoll ? 1 : 0}:${cubeOffered ? 1 : 0}:${moveKey}`;
  }, [currentTurn, mustRoll, cubeOffered, validMoves]);

  const selectTimeoutMove = useCallback(() => {
    if (cubeOffered && cubeOfferedBy !== playerColor) {
      return { type: 'accept_double' };
    }

    if (mustRoll) {
      return { type: 'roll' };
    }

    const scoredMoves = validMoves
      .filter((move) => move.type === 'move')
      .map((move) => {
        const from = Number.parseInt(move.from, 10);
        const to = Number.parseInt(move.to, 10);
        const target = Number.isFinite(to) && to >= 0 && to <= 23 ? board[to] : 0;
        const hitsBlot = playerColor === 'white' ? target === -1 : target === 1;
        const makesPoint = playerColor === 'white' ? target === 1 : target === -1;

        let score = 0;
        if (to === bearOffPosition) score += 120;
        if (from === barPosition) score += 70;
        if (hitsBlot) score += 60;
        if (makesPoint) score += 24;
        if (Number.isFinite(from) && Number.isFinite(to)) {
          score += playerColor === 'white' ? (to - from) * 3 : (from - to) * 3;
        }

        return { move, score };
      })
      .sort((a, b) => b.score - a.score);

    return scoredMoves[0]?.move ?? validMoves[0] ?? null;
  }, [cubeOffered, cubeOfferedBy, playerColor, mustRoll, validMoves, board, bearOffPosition, barPosition]);

  useEffect(() => {
    setTimeLeft(turnTimeLimit);
    timeoutAutoActionRef.current = null;
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    if (turnTimeLimit <= 0 || !currentTurn) return;

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
  }, [currentTurn, mustRoll, turnTimeLimit, dice, diceUsed]);

  useEffect(() => {
    if (timeLeft !== 0 || !isPlayerTurn || disabled) return;
    if (timeoutAutoActionRef.current === timeoutActionKey) return;

    timeoutAutoActionRef.current = timeoutActionKey;
    const autoMove = selectTimeoutMove();
    if (!autoMove) return;

    if (autoMove.type === 'accept_double') {
      onAcceptDouble?.();
      return;
    }

    if (autoMove.type === 'roll') {
      onRoll();
      return;
    }

    if (autoMove.type === 'move' && 'from' in autoMove && 'to' in autoMove) {
      const from = Number.parseInt(String(autoMove.from), 10);
      const to = Number.parseInt(String(autoMove.to), 10);
      if (Number.isFinite(from) && Number.isFinite(to)) {
        onMove(from, to);
      }
    }
  }, [timeLeft, isPlayerTurn, disabled, timeoutActionKey, selectTimeoutMove, onAcceptDouble, onRoll, onMove]);

  // Calculate pip counts for both colors
  const pipCounts = useMemo(() => {
    let whitePips = 0;
    let blackPips = 0;
    for (let i = 0; i < 24; i++) {
      if (board[i] > 0) whitePips += board[i] * (24 - i); // white bears off at 24
      if (board[i] < 0) blackPips += Math.abs(board[i]) * (i + 1); // black bears off at -1
    }
    whitePips += bar.white * 25;
    blackPips += bar.black * 25;
    return { white: whitePips, black: blackPips };
  }, [board, bar]);

  const getValidMovesForPoint = useCallback((point: number): number[] => {
    return validMoves
      .filter(move => parseInt(move.from) === point)
      .map(move => parseInt(move.to));
  }, [validMoves]);

  const handlePointClick = useCallback((point: number) => {
    if (disabled || !isPlayerTurn || mustRoll) return;

    const checkerValue = point === barPosition ? (playerColor === 'white' ? bar.white : bar.black) :
      point >= 0 && point <= 23 ? board[point] : 0;

    const hasOwnChecker = point === barPosition ? checkerValue > 0 :
      playerColor === 'white' ? checkerValue > 0 : checkerValue < 0;

    if (selectedPoint !== null) {
      if (highlightedPoints.includes(point)) {
        onMove(selectedPoint, point);
        setSelectedPoint(null);
        setHighlightedPoints([]);
      } else if (hasOwnChecker) {
        setSelectedPoint(point);
        setHighlightedPoints(getValidMovesForPoint(point));
      } else {
        setSelectedPoint(null);
        setHighlightedPoints([]);
      }
    } else {
      if (hasOwnChecker) {
        const moves = getValidMovesForPoint(point);
        if (moves.length > 0) {
          setSelectedPoint(point);
          setHighlightedPoints(moves);
        }
      }
    }
  }, [disabled, isPlayerTurn, mustRoll, selectedPoint, highlightedPoints, playerColor, bar, board, barPosition, onMove, getValidMovesForPoint]);

  const renderChecker = (color: 'white' | 'black', count: number, stackIndex: number) => {
    const maxVisible = 5;
    const displayed = Math.min(count, maxVisible);
    const showCount = count > maxVisible;

    return (
      <div className="flex flex-col items-center gap-0.5">
        {Array.from({ length: displayed }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "backgammon-checker rounded-full border transition-transform",
              CHECKER_COLORS[color],
              stackIndex === displayed - 1 && showCount && "relative"
            )}
          >
            {i === displayed - 1 && showCount && (
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                {count}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderPoint = (pointIndex: number, isTop: boolean) => {
    const checkerCount = board[pointIndex];
    const color = checkerCount > 0 ? 'white' : checkerCount < 0 ? 'black' : null;
    const count = Math.abs(checkerCount);
    const isSelected = selectedPoint === pointIndex;
    const isHighlighted = highlightedPoints.includes(pointIndex);
    const isEven = pointIndex % 2 === 0;

    const displayIndex = flipped ? 23 - pointIndex : pointIndex;
    const triangleTone = isEven ? 'backgammon-point-light' : 'backgammon-point-dark';
    const pointDirectionClass = isTop ? 'backgammon-point-top' : 'backgammon-point-bottom';

    const pointLabel = color
      ? t('backgammon.pointLabel', { point: displayIndex + 1, color, count })
      : t('backgammon.pointEmpty', { point: displayIndex + 1 });

    return (
      <div
        key={pointIndex}
        data-testid={`backgammon-point-${pointIndex}`}
        role="button"
        tabIndex={0}
        aria-label={pointLabel}
        className={cn(
          "relative flex-1 flex items-center cursor-pointer transition-all",
          isTop ? "flex-col-reverse pb-2" : "flex-col pt-2",
          isSelected && "ring-2 ring-primary ring-inset",
          isHighlighted && "ring-2 ring-green-500 ring-inset bg-green-500/20"
        )}
        onClick={() => handlePointClick(pointIndex)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePointClick(pointIndex); } }}
      >
        <div
          className={cn(
            "absolute w-full backgammon-point-cap",
            isTop ? "bottom-0" : "top-0",
            triangleTone,
            pointDirectionClass,
          )}
          style={{
            height: '80%',
            clipPath: isTop
              ? 'polygon(50% 100%, 0% 0%, 100% 0%)'
              : 'polygon(50% 0%, 0% 100%, 100% 100%)'
          }}
        />
        <div className={cn(
          "relative z-10 flex gap-0.5",
          isTop ? "flex-col" : "flex-col-reverse"
        )}>
          {color && renderChecker(color, count, count - 1)}
        </div>
        <span className={cn(
          "absolute text-xs text-muted-foreground font-medium",
          isTop ? "top-1" : "bottom-1"
        )}>
          {displayIndex + 1}
        </span>
      </div>
    );
  };

  const renderBar = () => {
    const whiteOnBar = bar.white;
    const blackOnBar = bar.black;
    const canClickBar = isPlayerTurn && !mustRoll && (
      (playerColor === 'white' && whiteOnBar > 0) ||
      (playerColor === 'black' && blackOnBar > 0)
    );
    const isSelected = selectedPoint === barPosition;

    return (
      <div
        data-testid="backgammon-bar"
        role="region"
        aria-label={t('backgammon.bar', { white: whiteOnBar, black: blackOnBar })}
        className={cn(
          "backgammon-bar-slot w-[clamp(34px,6.2vw,56px)] flex flex-col items-center justify-center gap-4 py-4",
          canClickBar && "cursor-pointer hover-elevate",
          isSelected && "ring-2 ring-primary"
        )}
        onClick={() => canClickBar && handlePointClick(barPosition)}
      >
        {whiteOnBar > 0 && (
          <div className="flex flex-col items-center">
            {renderChecker('white', whiteOnBar, whiteOnBar - 1)}
          </div>
        )}
        {blackOnBar > 0 && (
          <div className="flex flex-col items-center">
            {renderChecker('black', blackOnBar, blackOnBar - 1)}
          </div>
        )}
      </div>
    );
  };

  const renderBearOff = (color: 'white' | 'black') => {
    const count = borneOff[color];
    const isHighlighted = highlightedPoints.includes(color === 'white' ? 24 : -1);

    return (
      <div
        data-testid={`backgammon-bearoff-${color}`}
        role="region"
        aria-label={t('backgammon.bearOffArea', { color, count })}
        className={cn(
          "backgammon-bearoff-tray w-[clamp(34px,5.4vw,48px)] flex flex-col items-center justify-center gap-1 py-2 rounded-md border border-stone-700/60",
          isHighlighted && "ring-2 ring-green-500 bg-green-500/20 cursor-pointer"
        )}
        onClick={() => isHighlighted && onMove(selectedPoint!, color === 'white' ? 24 : -1)}
      >
        <span className="text-xs text-muted-foreground">{t('backgammon.off')}</span>
        <span className="text-lg font-bold">{count}</span>
        <div className={cn("backgammon-checker rounded-full border scale-90", CHECKER_COLORS[color])} />
      </div>
    );
  };

  const renderDice = () => {
    if (dice.length === 0) return null;

    return (
      <div className="flex gap-2 items-center justify-center" role="status" aria-live="polite" aria-label={t('backgammon.diceResult', { dice: dice.join(', ') })}>
        {dice.map((die, index) => (
          <div
            key={index}
            data-testid={`backgammon-die-${index}`}
            aria-label={`${t('backgammon.die')} ${index + 1}: ${die}${diceUsed[index] ? ` (${t('backgammon.used')})` : ''}`}
            className={cn(
              "backgammon-die-shell",
              diceUsed[index] && "opacity-30",
              !diceUsed[index] && "animate-dice-roll"
            )}
          >
            {Array.from({ length: 9 }).map((_, pipIndex) => {
              const showPip = DIE_PIP_CELLS[die]?.includes(pipIndex);
              return (
                <span
                  key={pipIndex}
                  className={cn("backgammon-die-pip", !showPip && "opacity-0")}
                  aria-hidden="true"
                />
              );
            })}
            <span className="sr-only">{die}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderDoublingCube = () => {
    const isSpectator = (playerColor as string) === 'spectator';
    const canOffer = isPlayerTurn && mustRoll && !cubeOffered &&
      (cubeOwner === null || cubeOwner === playerColor) &&
      !isSpectator;
    const mustRespond = cubeOffered && cubeOfferedBy !== playerColor && !isSpectator;

    return (
      <div className="flex flex-col items-center gap-2">
        {/* Cube display */}
        <div
          data-testid="doubling-cube"
          role="status"
          aria-label={t('backgammon.doublingCubeValue', { value: doublingCube })}
          className={cn(
            "backgammon-cube-shell w-10 h-10 rounded-lg border border-amber-500/70",
            "flex items-center justify-center text-lg font-bold",
            cubeOwner === playerColor && "ring-2 ring-primary"
          )}
          title={cubeOwner ? `${t('backgammon.cubeOwner')}: ${cubeOwner}` : t('backgammon.cubeCenter')}
        >
          {doublingCube}
        </div>

        {/* Offer double button */}
        {canOffer && onDouble && (
          <button
            data-testid="button-offer-double"
            onClick={onDouble}
            disabled={disabled}
            className="px-3 py-1 bg-amber-500 text-white rounded-md text-xs font-medium hover:bg-amber-600 transition-colors"
          >
            {t('backgammon.double')}
          </button>
        )}

        {/* Accept/Decline double */}
        {mustRespond && (
          <div className="flex gap-1">
            {onAcceptDouble && (
              <button
                data-testid="button-accept-double"
                onClick={onAcceptDouble}
                className="px-2 py-1 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700"
              >
                {t('backgammon.accept')}
              </button>
            )}
            {onDeclineDouble && (
              <button
                data-testid="button-decline-double"
                onClick={onDeclineDouble}
                className="px-2 py-1 bg-red-600 text-white rounded-md text-xs font-medium hover:bg-red-700"
              >
                {t('backgammon.decline')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const topPoints = flipped
    ? Array.from({ length: 12 }, (_, i) => i)
    : Array.from({ length: 12 }, (_, i) => 12 + i);

  const bottomPoints = flipped
    ? Array.from({ length: 12 }, (_, i) => 23 - i)
    : Array.from({ length: 12 }, (_, i) => 11 - i);

  const spectatorTurnLabel = currentTurn === 'white'
    ? `⚪ ${t('backgammon.white')}`
    : `⚫ ${t('backgammon.black')}`;
  const isActiveTurnForPlayer = playerColor !== 'spectator' && currentTurn === playerColor;
  const turnStatusLabel = playerColor === 'spectator'
    ? spectatorTurnLabel
    : (isActiveTurnForPlayer ? t('backgammon.yourTurn') : t('backgammon.opponentTurn'));

  return (
    <div className="flex flex-col gap-3 sm:gap-4 max-w-[min(920px,100vw)] mx-auto w-full overflow-hidden px-1 sm:px-2 [--bg-checker-size:clamp(18px,3.2vw,32px)]" data-testid="backgammon-board">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {renderBearOff('black')}
          <span className="text-xs text-muted-foreground font-mono">
            {t('backgammon.pip')}: {pipCounts.black}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {renderDice()}
          {renderDoublingCube()}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-semibold font-mono shadow-sm",
              timeLeft <= 10
                ? "border-red-500/60 bg-red-500/15 text-red-600"
                : isPlayerTurn
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-muted/70 text-foreground"
            )}
          >
            {timeLeft}s
          </span>
          {mustRoll && isPlayerTurn && (
            <button
              data-testid="button-roll-dice"
              onClick={onRoll}
              disabled={disabled}
              className={cn(
                "px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium",
                "hover-elevate active-elevate-2",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {t('backgammon.rollDice')}
            </button>
          )}
        </div>
      </div>

      <div
        className="backgammon-shell relative flex bg-game-felt rounded-[18px] overflow-hidden border-2 border-[#5b3a22]/80 shadow-xl min-h-[clamp(260px,56vw,500px)]"
        style={{ touchAction: 'manipulation' }}
      >
        <div className="backgammon-felt-lane flex-1 flex flex-col">
          <div className="flex-1 flex">
            {topPoints.slice(6).reverse().map(i => renderPoint(i, true))}
          </div>
          <div className="flex-1 flex">
            {bottomPoints.slice(0, 6).map(i => renderPoint(i, false))}
          </div>
        </div>

        {renderBar()}

        <div className="backgammon-felt-lane flex-1 flex flex-col">
          <div className="flex-1 flex">
            {topPoints.slice(0, 6).reverse().map(i => renderPoint(i, true))}
          </div>
          <div className="flex-1 flex">
            {bottomPoints.slice(6).map(i => renderPoint(i, false))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {renderBearOff('white')}
          <span className="text-xs text-muted-foreground font-mono">
            {t('backgammon.pip')}: {pipCounts.white}
          </span>
        </div>
        <div className="text-center">
          <span className={cn(
            "text-sm font-medium px-3 py-1 rounded-full",
            isActiveTurnForPlayer ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {turnStatusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
