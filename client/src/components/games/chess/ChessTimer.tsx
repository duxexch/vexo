import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { chessSounds } from '@/lib/chess-sounds';

interface ChessTimerProps {
  whiteTime: number;
  blackTime: number;
  currentTurn: 'w' | 'b';
  isGameActive: boolean;
  playerColor: 'w' | 'b';
}

/** Show tenths-of-seconds below 10s, else mm:ss */
function formatTime(totalSeconds: number, precise = false): string {
  if (totalSeconds <= 0) return '0:00';
  if (precise && totalSeconds < 10) {
    const secs = Math.min(totalSeconds, 9.9);
    return `0:0${secs.toFixed(1)}`;
  }
  const secs = Math.floor(totalSeconds);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins}:${s.toString().padStart(2, '0')}`;
}

export function ChessTimer({
  whiteTime,
  blackTime,
  currentTurn,
  isGameActive,
  playerColor
}: ChessTimerProps) {
  // Values are pre-ticked by the parent — just display them
  const lowTimeSounded = useRef(false);

  // Low-time warning sound once when player drops below 30s
  useEffect(() => {
    const myTime = playerColor === 'w' ? whiteTime : blackTime;
    if (myTime <= 30 && myTime > 0 && !lowTimeSounded.current && isGameActive) {
      chessSounds.lowTime();
      lowTimeSounded.current = true;
    }
    if (myTime > 30) lowTimeSounded.current = false;
  }, [whiteTime, blackTime, playerColor, isGameActive]);

  const isWhiteLow = whiteTime <= 30;
  const isBlackLow = blackTime <= 30;
  const isWhiteCritical = whiteTime <= 10;
  const isBlackCritical = blackTime <= 10;

  const topColor = playerColor === 'w' ? 'b' : 'w';
  const bottomColor = playerColor;

  const topTime = topColor === 'w' ? whiteTime : blackTime;
  const bottomTime = bottomColor === 'w' ? whiteTime : blackTime;
  const isTopActive = currentTurn === topColor && isGameActive;
  const isBottomActive = currentTurn === bottomColor && isGameActive;
  const isTopLow = topColor === 'w' ? isWhiteLow : isBlackLow;
  const isBottomLow = bottomColor === 'w' ? isWhiteLow : isBlackLow;
  const isTopCritical = topColor === 'w' ? isWhiteCritical : isBlackCritical;
  const isBottomCritical = bottomColor === 'w' ? isWhiteCritical : isBlackCritical;

  return (
    <div className="flex flex-col gap-4 w-full max-w-[110px]">
      <TimerDisplay
        time={topTime}
        isActive={isTopActive}
        isLow={isTopLow}
        isCritical={isTopCritical}
        color={topColor}
      />
      <div className="flex-1" />
      <TimerDisplay
        time={bottomTime}
        isActive={isBottomActive}
        isLow={isBottomLow}
        isCritical={isBottomCritical}
        color={bottomColor}
      />
    </div>
  );
}

interface TimerDisplayProps {
  time: number;
  isActive: boolean;
  isLow: boolean;
  isCritical: boolean;
  color: 'w' | 'b';
}

function TimerDisplay({ time, isActive, isLow, isCritical, color }: TimerDisplayProps) {
  const { t } = useI18n();
  const displayLabel = color === 'w' ? t('chess.white') : t('chess.black');
  
  return (
    <div
      data-testid={`timer-${color}`}
      className={cn(
        "p-3 rounded-xl transition-all",
        color === 'w'
          ? 'bg-gradient-to-b from-white to-gray-100 text-black shadow-md'
          : 'bg-gradient-to-b from-gray-800 to-gray-900 text-white shadow-md',
        isActive && 'ring-2 ring-primary shadow-lg shadow-primary/20',
        isLow && isActive && 'ring-red-500 shadow-red-500/25',
        isCritical && isActive && 'animate-pulse'
      )}
    >
      <div className="flex items-center gap-1.5 text-xs opacity-60 mb-1">
        <Clock className="w-3 h-3" />
        <span>{displayLabel}</span>
      </div>
      <div className={cn(
        'font-mono text-2xl font-bold tracking-tight',
        isCritical ? 'text-red-500' : isLow ? 'text-amber-500' : ''
      )}>
        {formatTime(time, isCritical)}
      </div>
    </div>
  );
}
