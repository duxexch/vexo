import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { ChessBoard } from '@/components/games/ChessBoard';
import { ChessTimer } from '@/components/games/chess/ChessTimer';
import { ChessMoveList } from '@/components/games/chess/ChessMoveList';
import { ChessControls, DrawOfferDialog } from '@/components/games/chess/ChessControls';
import { ChessChat } from '@/components/games/chess/ChessChat';
import { ChessCapturedPieces } from '@/components/games/chess/ChessCapturedPieces';
import { ChessThemeSelector } from '@/components/games/chess/ChessThemeSelector';
import { ChessThemeProvider } from '@/components/games/chess/ChessThemeContext';
import { GameFullscreenActionDock, type GameFullscreenActionItem } from '@/components/games/GameFullscreenActionDock';
import { GiftAnimation } from '@/components/games/GiftAnimation';
import { GameStartCinematic } from '@/components/games/GameStartCinematic';
import { useGameFullscreen } from '@/hooks/use-game-fullscreen';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Wifi, WifiOff, Users, ArrowLeft, Share2, AlertCircle, Swords, Trophy, Frown, HandshakeIcon, Maximize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { loadSavedTheme, type BoardTheme } from '@/lib/chess-themes';
import { chessSounds } from '@/lib/chess-sounds';


interface ChessPiece {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  color: 'w' | 'b';
}

function fenToPosition(fen: string): Record<string, ChessPiece> {
  const position: Record<string, ChessPiece> = {};
  const [boardPart] = fen.split(' ');
  const ranks = boardPart.split('/');

  const pieceMap: Record<string, { type: ChessPiece['type']; color: ChessPiece['color'] }> = {
    'P': { type: 'p', color: 'w' }, 'N': { type: 'n', color: 'w' },
    'B': { type: 'b', color: 'w' }, 'R': { type: 'r', color: 'w' },
    'Q': { type: 'q', color: 'w' }, 'K': { type: 'k', color: 'w' },
    'p': { type: 'p', color: 'b' }, 'n': { type: 'n', color: 'b' },
    'b': { type: 'b', color: 'b' }, 'r': { type: 'r', color: 'b' },
    'q': { type: 'q', color: 'b' }, 'k': { type: 'k', color: 'b' },
  };

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  ranks.forEach((rank, rankIndex) => {
    let fileIndex = 0;
    for (const char of rank) {
      if (isNaN(parseInt(char))) {
        const square = `${files[fileIndex]}${8 - rankIndex}`;
        const piece = pieceMap[char];
        if (piece) {
          position[square] = piece;
        }
        fileIndex++;
      } else {
        fileIndex += parseInt(char);
      }
    }
  });

  return position;
}

function useAuthoritativeTimer(timeMs: number, lastUpdateAt: number | undefined, isActive: boolean, serverNow?: number): number {
  const [now, setNow] = useState(Date.now());
  const clockOffsetRef = useRef(0);

  useEffect(() => {
    if (typeof serverNow === 'number') {
      clockOffsetRef.current = Date.now() - serverNow;
    }
    setNow(Date.now());
  }, [timeMs, lastUpdateAt, isActive, serverNow]);

  useEffect(() => {
    if (!isActive) return;

    let frame = 0;
    const loop = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isActive]);

  if (!isActive) return timeMs;
  if (!lastUpdateAt) return timeMs;

  const correctedNow = now - clockOffsetRef.current;
  const elapsed = correctedNow - lastUpdateAt;
  return Math.max(0, Math.min(timeMs, timeMs - elapsed));
}

export default function ChessGame() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language, dir } = useI18n();

  // Cinematic intro
  const [showCinematic, setShowCinematic] = useState(true);

  // Board theme
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(() => loadSavedTheme());
  const [showThemes, setShowThemes] = useState(false);

  const {
    containerRef: fullscreenContainerRef,
    isFullscreen: isGameFullscreen,
    toggleFullscreen,
    exitFullscreen,
  } = useGameFullscreen();

  // Sound effect tracking
  const prevMoveCountRef = useRef(0);
  const gameStartSounded = useRef(false);

  const {
    connectionStatus,
    gameType,
    gameState,
    playerColor,
    opponent,
    chatMessages,
    spectatorCount,
    isSpectator,
    canPlayActions,
    drawOffered,
    drawOfferReceived,
    gameResult,
    error,
    makeMove,
    sendChat,
    resign,
    offerDraw,
    respondDraw,
    forceReconnect,
    lastGift,
    clearLastGift
  } = useGameWebSocket(sessionId || null);

  const chessState = gameState as import('../../hooks/useGameWebSocket').ChessGameState | null;
  const serverNow = chessState?.lastUpdateAt;

  const isValidChessState = useMemo(() => {
    if (!chessState) return false;
    return typeof chessState.fen === 'string' &&
      typeof chessState.currentTurn === 'string' &&
      Array.isArray(chessState.validMoves) &&
      typeof chessState.whiteTime === 'number' &&
      typeof chessState.blackTime === 'number';
  }, [chessState]);

  const position = useMemo(() => {
    if (!chessState?.fen || !isValidChessState) return {};
    return fenToPosition(chessState.fen);
  }, [chessState?.fen, isValidChessState]);

  const isGameActive = !gameResult && gameState && isValidChessState &&
    !chessState?.isCheckmate && !chessState?.isStalemate && !chessState?.isDraw;

  const whiteTimeBaseMs = (chessState?.whiteTime ?? 0) * 1000;
  const blackTimeBaseMs = (chessState?.blackTime ?? 0) * 1000;
  const lastUpdateAt = chessState?.lastUpdateAt;

  const tickingWhiteTime = useAuthoritativeTimer(
    whiteTimeBaseMs,
    lastUpdateAt,
    !!isGameActive && chessState?.currentTurn === 'w',
    serverNow
  );
  const tickingBlackTime = useAuthoritativeTimer(
    blackTimeBaseMs,
    lastUpdateAt,
    !!isGameActive && chessState?.currentTurn === 'b',
    serverNow
  );

  const [isMovePending, setIsMovePending] = useState(false);
  const currentLastMove = chessState?.lastMove;

  useEffect(() => {
    setIsMovePending(false);
  }, [currentLastMove?.from, currentLastMove?.to]);

  useEffect(() => {
    if (!isMovePending) return;
    const timeout = setTimeout(() => {
      setIsMovePending(false);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [isMovePending]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log({
        now: Date.now(),
        lastUpdateAt,
      });
      (window as unknown as { __CHESS_DEBUG__?: Record<string, unknown> }).__CHESS_DEBUG__ = {
        state: chessState,
        lastMove: chessState?.lastMove,
        validMoves: chessState?.validMoves,
        timers: {
          whiteTime: chessState?.whiteTime,
          blackTime: chessState?.blackTime,
          lastUpdateAt: chessState?.lastUpdateAt,
        },
      };
    }
  }, [chessState, lastUpdateAt]);

  // ── Sound effects ──
  useEffect(() => {
    if (!chessState || !isValidChessState) return;
    const moves = chessState.moveHistory || [];
    const currentCount = moves.length;

    // Game start sound
    if (!gameStartSounded.current && currentCount === 0 && isGameActive) {
      chessSounds.gameStart();
      gameStartSounded.current = true;
    }

    // New move happened — play move sounds (but NOT game-end sounds, those are in gameResult effect)
    if (currentCount > prevMoveCountRef.current && prevMoveCountRef.current > 0) {
      const lastMoveEntry = moves[moves.length - 1];
      const notation = lastMoveEntry?.notation || '';

      if (chessState.isCheckmate || chessState.isStalemate || chessState.isDraw) {
        // Game-end sounds handled by the gameResult useEffect below
      } else if (chessState.isCheck) {
        chessSounds.check();
      } else if (notation.includes('x')) {
        chessSounds.capture();
      } else if (notation === 'O-O' || notation === 'O-O-O') {
        chessSounds.castle();
      } else if (notation.includes('=')) {
        chessSounds.promote();
      } else {
        chessSounds.move();
      }
    }

    prevMoveCountRef.current = currentCount;
  }, [chessState?.moveHistory?.length, chessState?.isCheck, chessState?.isCheckmate, isValidChessState]);

  // Game over sound
  useEffect(() => {
    if (!gameResult) return;
    if (gameResult.winner === user?.id) {
      chessSounds.checkmate();
    } else if (gameResult.winner === null) {
      chessSounds.draw();
    } else {
      chessSounds.defeat();
    }
  }, [gameResult?.winner]);

  const handleMove = useCallback((move: { from: string; to: string; promotion?: string }) => {
    if (!canPlayActions) {
      return;
    }
    makeMove(move.from, move.to, move.promotion);
  }, [makeMove, canPlayActions]);

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: t('chess.title'), text: t('chess.title'), url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: t('common.success'), description: t('chess.share') });
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  };

  const fullscreenActions = useMemo<GameFullscreenActionItem[]>(() => {
    const actions: GameFullscreenActionItem[] = [
      {
        id: 'back-games',
        icon: ArrowLeft,
        label: t('common.back'),
        onClick: () => setLocation('/games'),
        tone: 'outline',
      },
      {
        id: 'share-match',
        icon: Share2,
        label: t('chess.share'),
        onClick: () => {
          void handleShare();
        },
        tone: 'primary',
      },
    ];

    if (canPlayActions && isGameActive) {
      actions.push({
        id: 'resign',
        icon: Frown,
        label: t('chess.resign'),
        onClick: resign,
        tone: 'destructive',
      });
    }

    return actions;
  }, [t, setLocation, canPlayActions, isGameActive, resign, handleShare]);

  // ── Error / Loading states ──
  if (!sessionId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t('chess.invalidSession')}</p>
      </div>
    );
  }

  if (gameType && gameType !== 'chess') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-3 text-center">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-destructive font-medium">{t('chess.wrongGameType')}</p>
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={() => setLocation('/games')} data-testid="button-back-games">{t('common.back')}</Button>
      </div>
    );
  }

  if (gameState && !isValidChessState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-3 text-center">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-destructive font-medium">{t('chess.invalidGameState')}</p>
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={forceReconnect} data-testid="button-retry">{t('common.retry')}</Button>
      </div>
    );
  }

  if (connectionStatus === 'connecting' || connectionStatus === 'reconnecting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {connectionStatus === 'reconnecting' ? t('chess.reconnecting') : t('chess.connecting')}
        </p>
      </div>
    );
  }

  if (connectionStatus === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-3 text-center">
        <WifiOff className="w-12 h-12 text-destructive" />
        <p className="text-destructive font-medium">{error || t('chess.connectionError')}</p>
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={forceReconnect} data-testid="button-retry">{t('common.retry')}</Button>
      </div>
    );
  }

  // ── Determine player info for display ──
  const opponentColor = playerColor === 'w' ? 'b' : 'w';
  const capturedByMe = playerColor === 'w'
    ? (chessState?.capturedPieces?.white || [])
    : (chessState?.capturedPieces?.black || []);
  const capturedByOpponent = opponentColor === 'w'
    ? (chessState?.capturedPieces?.white || [])
    : (chessState?.capturedPieces?.black || []);

  return (
    <ChessThemeProvider theme={boardTheme}>
      <div
        ref={fullscreenContainerRef}
        className={`vex-arcade-stage container mx-auto min-h-[100svh] max-w-7xl px-3 sm:px-4 pt-3 sm:pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${isGameFullscreen ? 'vex-game-fullscreen-shell !mx-0 !w-screen !max-w-none !px-2 sm:!px-3 !pt-[max(0.5rem,env(safe-area-inset-top))]' : ''}`}
      >
        {/* ── Cinematic Game Start ── */}
        {showCinematic && !gameResult && (
          <GameStartCinematic
            gameType="chess"
            player={{ id: String(user?.id || ''), username: user?.username || '' }}
            opponent={opponent ? { id: opponent.id, username: opponent.username } : undefined}
            playerSide={playerColor as 'w' | 'b'}
            spectatorCount={spectatorCount}
            onComplete={() => setShowCinematic(false)}
          />
        )}

        {/* ── Header ── */}
        <div className={`vex-arcade-header mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 sm:px-4 sm:py-3 ${isGameFullscreen ? 'hidden' : ''}`}>
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/games')}
              aria-label="Go back"
              data-testid="button-back"
              className="vex-arcade-btn vex-arcade-btn--icon shrink-0 min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <Swords className="w-5 h-5 text-primary shrink-0" />
                {t('chess.title')}
              </h1>
              {opponent && (
                <p className="text-muted-foreground text-sm truncate">
                  vs {opponent.username}
                </p>
              )}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Badge
              variant={connectionStatus === 'connected' ? 'default' : 'secondary'}
              className="gap-1"
              role="status"
              aria-live="polite"
            >
              {connectionStatus === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{connectionStatus === 'connected' ? t('common.live') : t('common.offline')}</span>
            </Badge>
            <Badge variant={isSpectator ? 'outline' : 'default'}>
              {isSpectator
                ? (language === 'ar' ? 'مشاهد' : 'Spectator')
                : (language === 'ar' ? 'لاعب' : 'Player')}
            </Badge>
            {spectatorCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <Users className="w-3 h-3" />
                {spectatorCount}
              </Badge>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                void toggleFullscreen();
              }}
              aria-label={t('common.view')}
              className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]"
              data-testid="button-toggle-fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare} data-testid="button-share" className="vex-arcade-btn hidden sm:flex">
              <Share2 className="w-4 h-4 me-1.5" />
              {t('chess.share')}
            </Button>
          </div>
        </div>

        {/* ── Game Result Banner ── */}
        {gameResult && (
          <div className={`vex-arcade-panel mb-4 p-4 rounded-xl border-2 text-center ${gameResult.winner === user?.id
            ? 'bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-yellow-500/50'
            : gameResult.winner === null
              ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-500/50'
              : 'bg-gradient-to-r from-red-500/10 to-rose-500/10 border-red-500/50'
            }`}>
            <div className="flex items-center justify-center gap-2 mb-1">
              {gameResult.winner === user?.id ? (
                <Trophy className="w-6 h-6 text-yellow-500" />
              ) : gameResult.winner === null ? (
                <HandshakeIcon className="w-6 h-6 text-blue-500" />
              ) : (
                <Frown className="w-6 h-6 text-red-500" />
              )}
              <h2 className="text-xl font-bold">
                {gameResult.winner === user?.id
                  ? t('chess.youWon')
                  : gameResult.winner === null
                    ? t('chess.draw')
                    : t('chess.youLost')}
              </h2>
            </div>
            <p className="text-muted-foreground text-sm">{gameResult.reason}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="vex-arcade-btn w-full sm:w-auto"
                onClick={() => setLocation('/games')}
                data-testid="button-back-to-games"
              >
                <ArrowLeft className="w-4 h-4 me-1.5" />
                {t('chess.backToGames')}
              </Button>
            </div>
          </div>
        )}

        {/* ── Main Layout ── */}
        <div className={isGameFullscreen ? 'flex flex-col gap-4 items-center' : 'grid lg:grid-cols-[1fr_280px] gap-4 lg:gap-6'}>
          {/* Left: Board area */}
          <div className="flex flex-col items-center">
            {/* Opponent info bar */}
            {gameState && playerColor && (
              <div className="w-full max-w-[560px] flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${opponentColor === 'w'
                    ? 'bg-gradient-to-b from-white to-gray-200 text-gray-900 shadow-sm'
                    : 'bg-gradient-to-b from-gray-700 to-gray-900 text-white shadow-sm'
                    }`}>
                    {opponentColor === 'w' ? '♔' : '♚'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{opponent?.username || (opponentColor === 'w' ? t('chess.white') : t('chess.black'))}</p>
                    <ChessCapturedPieces captured={capturedByOpponent} color={opponentColor} compact opponentCaptured={capturedByMe} />
                  </div>
                </div>
                {chessState && (
                  <div className={`font-mono text-lg font-bold px-3 py-1 rounded-lg ${chessState.currentTurn === opponentColor && isGameActive
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'text-muted-foreground'
                    }`}>
                    {formatTimerBrief(opponentColor === 'w' ? tickingWhiteTime : tickingBlackTime)}
                  </div>
                )}
              </div>
            )}

            {/* Board */}
            {gameState && playerColor && (
              <ChessBoard
                gameState={chessState?.fen}
                currentTurn={chessState?.currentTurn}
                myColor={playerColor === 'w' ? 'white' : 'black'}
                isMyTurn={!!isGameActive && chessState!.currentTurn === playerColor && canPlayActions}
                isSpectator={isSpectator}
                authoritativeValidMoves={chessState?.validMoves}
                onMove={handleMove}
                status={gameResult ? "finished" : chessState!.isCheckmate || chessState!.isStalemate || chessState!.isDraw ? "finished" : "active"}
              />
            )}

            {/* Player info bar */}
            {gameState && playerColor && (
              <div className="w-full max-w-[560px] flex items-center justify-between mt-2 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${playerColor === 'w'
                    ? 'bg-gradient-to-b from-white to-gray-200 text-gray-900 shadow-sm'
                    : 'bg-gradient-to-b from-gray-700 to-gray-900 text-white shadow-sm'
                    }`}>
                    {playerColor === 'w' ? '♔' : '♚'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-1">
                      {user?.username || (playerColor === 'w' ? t('chess.white') : t('chess.black'))}
                    </p>
                    <ChessCapturedPieces captured={capturedByMe} color={playerColor} compact opponentCaptured={capturedByOpponent} />
                  </div>
                </div>
                {chessState && (
                  <div className={`font-mono text-lg font-bold px-3 py-1 rounded-lg ${chessState.currentTurn === playerColor && isGameActive
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'text-muted-foreground'
                    }`}>
                    {formatTimerBrief(playerColor === 'w' ? tickingWhiteTime : tickingBlackTime)}
                  </div>
                )}
              </div>
            )}

            {/* Controls */}
            <div className="mt-3">
              <ChessControls
                onResign={resign}
                onOfferDraw={offerDraw}
                drawOffered={drawOffered}
                isGameActive={!!isGameActive}
                canPlayActions={canPlayActions}
                onOpenThemes={() => setShowThemes(true)}
              />
            </div>
          </div>

          {/* Right: Sidebar */}
          {!isGameFullscreen && (
            <div className="space-y-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto">
              {/* Timer cards for desktop */}
              {gameState && playerColor && (
                <ChessTimer
                  whiteTime={tickingWhiteTime}
                  blackTime={tickingBlackTime}
                  currentTurn={chessState!.currentTurn}
                  isGameActive={!!isGameActive}
                  playerColor={playerColor}
                />
              )}

              {/* Move list */}
              {gameState && (
                <ChessMoveList
                  moves={(chessState?.moveHistory || []).map((m) => ({
                    moveNumber: m.moveNumber,
                    notation: m.notation,
                    player: m.player
                  }))}
                />
              )}

              {/* Chat */}
              {user && (
                <ChessChat
                  messages={chatMessages}
                  onSendMessage={sendChat}
                  currentUserId={user.id}
                />
              )}
            </div>
          )}
        </div>

        <GameFullscreenActionDock
          active={isGameFullscreen}
          actions={fullscreenActions}
          onExit={() => {
            void exitFullscreen();
          }}
          exitLabel={t('common.close')}
          dir={dir}
        />

        {/* ── Modals ── */}
        <DrawOfferDialog
          isOpen={canPlayActions && drawOfferReceived}
          onAccept={() => respondDraw(true)}
          onDecline={() => respondDraw(false)}
          opponentName={opponent?.username || 'Opponent'}
        />

        <GiftAnimation
          gift={lastGift ? { id: Date.now().toString(), ...lastGift } : null}
          onComplete={clearLastGift}
        />

        {showThemes && (
          <ChessThemeSelector
            currentTheme={boardTheme}
            onSelectTheme={(theme) => {
              setBoardTheme(theme);
              setShowThemes(false);
            }}
            onClose={() => setShowThemes(false)}
          />
        )}
      </div>
    </ChessThemeProvider>
  );
}

function formatTimerBrief(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
