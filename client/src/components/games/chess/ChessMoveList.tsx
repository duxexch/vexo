import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/lib/i18n';

interface Move {
  moveNumber: number;
  notation: string;
  player: 'w' | 'b';
}

interface ChessMoveListProps {
  moves: Move[];
}

export function ChessMoveList({ moves }: ChessMoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length]);

  const movePairs: { number: number; white?: string; black?: string }[] = [];
  
  for (const move of moves) {
    const pairIndex = move.moveNumber - 1;
    if (!movePairs[pairIndex]) {
      movePairs[pairIndex] = { number: move.moveNumber };
    }
    if (move.player === 'w') {
      movePairs[pairIndex].white = move.notation;
    } else {
      movePairs[pairIndex].black = move.notation;
    }
  }

  return (
    <div className="bg-card rounded-lg border p-3">
      <h3 className="font-semibold mb-2 text-sm">{t('chess.moves')}</h3>
      <ScrollArea className="max-h-[180px] sm:max-h-[250px]" ref={scrollRef}>
        <div className="space-y-1">
          {movePairs.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('chess.noMoves')}</p>
          ) : (
            movePairs.map((pair, index) => (
              <div 
                key={pair.number}
                data-testid={`move-pair-${pair.number}`}
                className={cn(
                  "grid grid-cols-[2rem_1fr_1fr] gap-2 text-sm py-1 px-2 rounded",
                  index % 2 === 0 ? "bg-muted/30" : ""
                )}
              >
                <span className="text-muted-foreground font-mono">{pair.number}.</span>
                <span className={cn(
                  "font-medium",
                  index === movePairs.length - 1 && !pair.black && "text-primary"
                )}>
                  {pair.white || '...'}
                </span>
                <span className={cn(
                  "font-medium",
                  index === movePairs.length - 1 && pair.black && "text-primary"
                )}>
                  {pair.black || ''}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
