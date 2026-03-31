import { useMemo } from 'react';

interface ChessCapturedPiecesProps {
  captured: string[]; // pieces captured by this player (opponent's pieces)
  color: 'w' | 'b';  // the player who captured them — opponent's piece color is the opposite
  compact?: boolean;
  opponentCaptured?: string[]; // pieces captured by the opponent (our pieces)
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const PIECE_UNICODE_WHITE: Record<string, string> = {
  p: '♙', n: '♘', b: '♗', r: '♖', q: '♕'
};
const PIECE_UNICODE_BLACK: Record<string, string> = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛'
};

export function ChessCapturedPieces({ captured, color, compact, opponentCaptured }: ChessCapturedPiecesProps) {
  // The captured array contains opponent pieces captured BY this player
  // Display them in the color of the opponent (pieces that were taken)
  const opponentColor = color === 'w' ? 'b' : 'w';
  const unicodeMap = opponentColor === 'w' ? PIECE_UNICODE_WHITE : PIECE_UNICODE_BLACK;

  const sorted = useMemo(() => {
    return [...captured].sort((a, b) => (PIECE_VALUE[b] || 0) - (PIECE_VALUE[a] || 0));
  }, [captured]);

  // Calculate relative material advantage (my captures - opponent's captures)
  const materialAdvantage = useMemo(() => {
    const myTotal = captured.reduce((sum, p) => sum + (PIECE_VALUE[p] || 0), 0);
    const oppTotal = (opponentCaptured || []).reduce((sum, p) => sum + (PIECE_VALUE[p] || 0), 0);
    return myTotal - oppTotal;
  }, [captured, opponentCaptured]);

  if (sorted.length === 0) return null;

  return (
    <div className={`flex items-center gap-0.5 flex-wrap ${compact ? 'text-sm' : 'text-base'}`}>
      {sorted.map((piece, idx) => (
        <span
          key={`${piece}-${idx}`}
          className={`leading-none ${
            opponentColor === 'w'
              ? 'text-gray-200 drop-shadow-[0_0_1px_rgba(0,0,0,0.8)]'
              : 'text-gray-700 drop-shadow-[0_0_1px_rgba(255,255,255,0.3)]'
          } ${compact ? 'text-base' : 'text-xl'}`}
        >
          {unicodeMap[piece] || piece}
        </span>
      ))}
      {materialAdvantage > 0 && (
        <span className="text-xs text-muted-foreground font-medium ms-1">
          +{materialAdvantage}
        </span>
      )}
    </div>
  );
}
