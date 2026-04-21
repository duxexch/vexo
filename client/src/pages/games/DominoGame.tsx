import { useMemo, useState, useRef, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  DominoChallengeContainer,
  type DominoEndgameSummary,
  type DominoScoreRow,
  type DominoTimelineEntry,
} from '@/components/games/DominoChallengeContainer';
import { GameFullscreenActionDock, type GameFullscreenActionItem } from '@/components/games/GameFullscreenActionDock';
import { GiftAnimation } from '@/components/games/GiftAnimation';
import { GameStartCinematic } from '@/components/games/GameStartCinematic';
import { useGameFullscreen } from '@/hooks/use-game-fullscreen';
import { useGameWebSocket, type DominoGameState } from '@/hooks/useGameWebSocket';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Wifi, WifiOff, Users, ArrowLeft, Share2, AlertCircle, RefreshCw, Maximize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { dominoSounds } from '@/lib/game-sounds';

/** C9-F8: Compute max draws per turn on client (mirrors server getMaxDrawsPerTurn) */
function getMaxDrawsForUI(playerCount: number): number {
  return Math.max(28 - playerCount * 7, 0); // C11-F12: 4p has 0 boneyard
}

export default function DominoGame() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language } = useI18n();

  const {
    connectionStatus,
    gameState,
    spectatorCount,
    gameResult,
    error,
    moveError,
    moveErrorKey,
    isSpectator: hookIsSpectator,
    canPlayActions,
    makeMove,
    forceReconnect,
    lastGift,
    clearLastGift,
    clearMoveError,
    opponent
  } = useGameWebSocket(sessionId || null);

  const dominoState = gameState as DominoGameState | null;
  const [showCinematic, setShowCinematic] = useState(true);
  const gameOverSoundPlayedRef = useRef(false);

  const {
    containerRef: fullscreenContainerRef,
    isFullscreen: isGameFullscreen,
    toggleFullscreen,
    exitFullscreen,
  } = useGameFullscreen();

  const isValidDominoState = useMemo(() => {
    if (!dominoState) return false;
    // C11-F7: hand is undefined for spectators — only require board + currentTurn
    return dominoState.board !== undefined &&
      dominoState.currentTurn !== undefined;
  }, [dominoState]);

  const isSpectator = hookIsSpectator;
  const isMyTurn = canPlayActions && (dominoState?.isMyTurn || false);
  const dominoResyncing = connectionStatus === 'reconnecting' || connectionStatus === 'syncing';
  const isGameActive = !gameResult && dominoState && isValidDominoState &&
    dominoState.gamePhase !== 'finished';

  // C11-F8: In 4p team mode, winner's teammate should also see victory
  const isWinner = (() => {
    if (!gameResult || gameResult.isDraw || !gameResult.winner) return false;
    const myId = String(user?.id);
    if (gameResult.winner === myId) return true;
    const order = dominoState?.playerOrder;
    if (order && order.length === 4) {
      const wIdx = order.indexOf(gameResult.winner);
      const mIdx = order.indexOf(myId);
      return wIdx !== -1 && mIdx !== -1 && (wIdx + 2) % 4 === mIdx;
    }
    return false;
  })();

  // ─── Sound Effects ─────────────────────────────────────────────
  // C13-F12: Consolidated previous-value refs into a single ref object
  const prevVals = useRef({ gameStartSounded: false, boardLen: 0, isMyTurn: false, handLen: null as number | null, lastActionKey: null as string | null });

  useEffect(() => {
    if (!prevVals.current.gameStartSounded && isValidDominoState && isGameActive) {
      dominoSounds.gameStart();
      prevVals.current.gameStartSounded = true;
    }
  }, [isValidDominoState, isGameActive]);

  // Tile placed sound
  useEffect(() => {
    const boardLen = dominoState?.board?.length || 0;
    if (boardLen > prevVals.current.boardLen && prevVals.current.boardLen > 0) {
      dominoSounds.placeTile();
    }
    prevVals.current.boardLen = boardLen;
  }, [dominoState?.board?.length]);

  // C10-F7: Your turn notification sound
  useEffect(() => {
    if (isMyTurn && !prevVals.current.isMyTurn && isGameActive) {
      dominoSounds.yourTurn();
    }
    prevVals.current.isMyTurn = isMyTurn;
  }, [isMyTurn, isGameActive]);

  // F8: Draw tile sound
  useEffect(() => {
    const handLen = dominoState?.hand?.length || 0;
    if (prevVals.current.handLen !== null && handLen > prevVals.current.handLen && prevVals.current.handLen > 0) {
      dominoSounds.drawTile();
    }
    prevVals.current.handLen = handLen;
  }, [dominoState?.hand?.length]);

  // Game over sound
  useEffect(() => {
    if (!gameResult) {
      gameOverSoundPlayedRef.current = false;
      return;
    }
    if (gameOverSoundPlayedRef.current) return;
    gameOverSoundPlayedRef.current = true;

    // C14-F12: Removed blocked branch — losers hear defeat even on blocked games
    if (gameResult.isDraw) {
      dominoSounds.blocked();
    } else if (isWinner) {
      dominoSounds.victory();
    } else {
      dominoSounds.defeat();
    }
  }, [gameResult, isWinner]); // C14-F3: isWinner dep — may resolve after gameResult

  // F7: Pass sound effect — play when any player passes
  useEffect(() => {
    const action = dominoState?.lastAction;
    if (!action) return;
    const actionKey = `${action.type}-${action.playerId}`;
    if (actionKey !== prevVals.current.lastActionKey && action.type === 'pass') {
      dominoSounds.pass();
    }
    prevVals.current.lastActionKey = actionKey;
  }, [dominoState?.lastAction]);

  const boardState = useMemo(() => {
    if (!dominoState) return null;

    const boardTiles = (dominoState.board || []).map((tile: { left: number; right: number; id?: string }) => ({
      tile: { left: tile.left, right: tile.right, id: tile.id }, // C7-F12: preserve tile ID
      rotation: tile.left === tile.right ? 0 : 90
    }));

    return {
      myHand: dominoState.hand || [],
      // C13-F10: Compute fallback inline only when needed — avoids summing every render
      opponentTileCount: dominoState.otherHandCounts
        ? Object.values(dominoState.otherHandCounts as Record<string, number>).reduce((sum: number, count: number) => sum + count, 0)
        : 0,
      opponentTileCounts: (dominoState.otherHandCounts as Record<string, number>) || {},
      boardTiles,
      leftEnd: dominoState.leftEnd ?? -1,
      rightEnd: dominoState.rightEnd ?? -1,
      boneyard: dominoState.boneyardCount ?? 0,
      lastAction: dominoState.lastAction,
      scores: dominoState.scores,
      canDraw: dominoState.canDraw,
      playerOrder: dominoState.playerOrder,
      validMoves: dominoState.validMoves, // C7-F3: server-provided valid moves
      passCount: dominoState.passCount ?? 0, // C7-F9: blocked-game warning
      playerCount: dominoState.playerOrder?.length ?? 2, // C7-F9: player count for warning
      drawsThisTurn: dominoState.drawsThisTurn ?? 0, // C9-F8: expose draws count for UI
      maxDraws: getMaxDrawsForUI(dominoState.playerOrder?.length ?? 2), // C9-F8: max draws
    };
  }, [dominoState]);

  const getMoveErrorText = (errorText: string, errorKey?: string | null): string => {
    if (errorKey && errorKey.startsWith('domino.')) return t(errorKey);
    const message = (errorText || '').toLowerCase();
    if (message.includes('not your turn')) return t('domino.notYourTurn');
    if (message.includes('cannot pass')) return t('domino.cannotPass');
    if (message.includes('must draw')) return t('domino.mustDraw');
    if (message.includes('cannot draw')) return t('domino.cannotDraw');
    if (message.includes('boneyard is empty')) return t('domino.boneyardEmpty');
    if (message.includes('invalid')) return t('domino.invalidMoveType');
    return errorText;
  };

  const getPlayerLabel = (pid: string): string => {
    const playerIdx = dominoState?.playerOrder?.indexOf(pid) ?? -1;
    const playerNo = Math.max(1, playerIdx + 1);
    if (pid === String(user?.id)) return t('domino.you');
    if (opponent && pid === opponent.id) return opponent.username;
    if (pid.startsWith('bot-')) return `${t('domino.bot')} ${playerNo}`;
    return `${t('domino.player')} ${playerNo}`;
  };

  const dominoTimeline = useMemo<DominoTimelineEntry[]>(() => {
    const action = dominoState?.lastAction;
    if (!action) return [];

    const actor = getPlayerLabel(action.playerId);
    let text: string;

    if (action.type === 'pass') {
      text = `${actor} ${t('domino.passedTurn')}`;
    } else if (action.type === 'draw') {
      text = `${actor} ${t('domino.drewTile')}`;
    } else if (action.type === 'play' && action.tile) {
      text = `${actor} ${t('domino.played')} ${action.tile.left}|${action.tile.right}`;
    } else {
      text = `${actor} ${action.type}`;
    }

    return [{
      id: `${action.type}-${action.playerId}-${action.tile?.id ?? `${action.tile?.left ?? 'x'}-${action.tile?.right ?? 'y'}`}`,
      text,
      moveNumber: dominoState?.board?.length,
    }];
  }, [dominoState?.lastAction, dominoState?.board?.length, dominoState?.playerOrder, opponent, user?.id, t]);

  const dominoScoreRows = useMemo<DominoScoreRow[]>(() => {
    const scores = dominoState?.scores as Record<string, number> | undefined;
    if (!scores || typeof scores !== 'object') {
      return [];
    }

    return Object.entries(scores)
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
      .map(([playerId, score], index) => ({
        id: playerId,
        label: getPlayerLabel(playerId) || `${t('domino.player')} ${index + 1}`,
        score,
      }))
      .sort((a, b) => b.score - a.score);
  }, [dominoState?.scores, dominoState?.playerOrder, opponent, user?.id, t]);

  const dominoEndgameSummary = useMemo<DominoEndgameSummary>(() => {
    const winnerLabel = gameResult?.winner
      ? getPlayerLabel(gameResult.winner)
      : undefined;

    return {
      isFinished: Boolean(gameResult) || dominoState?.gamePhase === 'finished',
      isDraw: Boolean(gameResult?.isDraw),
      reason: gameResult?.reason,
      winnerLabel,
      lowestPips: gameResult?.lowestPips,
      winningTeamPips: gameResult?.winningTeamPips,
    };
  }, [gameResult, dominoState?.gamePhase, dominoState?.playerOrder, opponent, user?.id, t]);

  const dominoMoveError = useMemo(() => {
    if (!moveError) {
      return null;
    }

    return getMoveErrorText(moveError, moveErrorKey);
  }, [moveError, moveErrorKey, t]);

  const handleMove = (move: { tileLeft: number; tileRight: number; placedEnd: 'left' | 'right'; isPassed: boolean }) => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }

    clearMoveError();
    // F5: Clear move type dispatch — draw, pass, or play
    if (move.tileLeft === -1 && move.tileRight === -1) {
      // Draw signal: tileLeft=-1, tileRight=-1
      const sent = makeMove({ type: 'draw' });
      if (!sent) toast({ title: t('common.error'), description: t('common.retry') });
    } else if (move.isPassed) {
      // Pass signal: isPassed=true
      const sent = makeMove({ type: 'pass' });
      if (!sent) toast({ title: t('common.error'), description: t('common.retry') });
    } else {
      // C9-F6: Find tile in hand by value to use server-assigned ID (not reconstructed)
      const handTile = dominoState?.hand?.find(t =>
        (t.left === move.tileLeft && t.right === move.tileRight) ||
        (t.left === move.tileRight && t.right === move.tileLeft)
      );
      const lo = Math.min(move.tileLeft, move.tileRight);
      const hi = Math.max(move.tileLeft, move.tileRight);
      const tile = { left: move.tileLeft, right: move.tileRight, id: handTile?.id ?? `${lo}-${hi}` };
      const sent = makeMove({
        type: 'play',
        tile,
        end: move.placedEnd
      });
      if (!sent) toast({ title: t('common.error'), description: t('common.retry') });
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: t('domino.title'),
          text: t('domino.shareText'),
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: t('common.success'),
          description: t('domino.linkCopied')
        });
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  };

  const fullscreenActions = useMemo<GameFullscreenActionItem[]>(() => ([
    {
      id: 'back-challenges',
      icon: ArrowLeft,
      label: t('common.back'),
      onClick: () => setLocation('/challenges'),
      tone: 'outline',
    },
    {
      id: 'share-match',
      icon: Share2,
      label: t('domino.shareGame'),
      onClick: () => {
        void handleShare();
      },
      tone: 'primary',
    },
  ]), [t, setLocation, handleShare]);

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t('domino.invalidSession')}</p>
      </div>
    );
  }

  if (error && !dominoState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-3 text-center">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-destructive">{error}</p>
        <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <Button className="min-h-[44px] w-full sm:w-auto" variant="outline" onClick={() => setLocation('/challenges')} data-testid="button-back-challenges">
            <ArrowLeft className="w-4 h-4 me-2" />
            {t('common.back')}
          </Button>
          <Button className="min-h-[44px] w-full sm:w-auto" onClick={forceReconnect} data-testid="button-reconnect">
            <RefreshCw className="w-4 h-4 me-2" />
            {t('common.reconnect')}
          </Button>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {t('domino.connecting')}
        </p>
      </div>
    );
  }

  if (!gameState || !dominoState || !isValidDominoState || !boardState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('domino.loadingGame')}</p>
      </div>
    );
  }

  return (
    <div
      ref={fullscreenContainerRef}
      className={`vex-arcade-stage container mx-auto max-w-none min-h-[100svh] px-3 sm:px-4 pt-4 sm:pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] ${isGameFullscreen ? 'vex-game-fullscreen-shell !mx-0 !w-screen !max-w-none !px-2 sm:!px-3 !pt-[max(0.5rem,env(safe-area-inset-top))]' : ''}`}
    >
      {/* ── Cinematic Game Start ── */}
      {showCinematic && !gameResult && (
        <GameStartCinematic
          gameType="domino"
          player={{ id: String(user?.id || ''), username: user?.username || '' }}
          opponent={dominoState?.playerOrder && dominoState.playerOrder.length === 2
            ? { id: dominoState.playerOrder.find(id => id !== String(user?.id)) || '', username: t('domino.opponent') }
            : undefined}
          spectatorCount={spectatorCount}
          onComplete={() => setShowCinematic(false)}
        />
      )}

      <div className="flex flex-col gap-4">
        <div className={`vex-arcade-header flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 sm:px-4 sm:py-3 ${isGameFullscreen ? 'hidden' : ''}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                // C18-F8: Confirm before leaving an active game
                if (isGameActive && !window.confirm(t('common.leaveConfirm') || 'Leave the game?')) return;
                setLocation('/challenges');
              }}
              aria-label={t('common.back')}
              data-testid="button-back"
              className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg sm:text-2xl font-bold">{t('domino.title')}</h1>
            <Badge variant={isSpectator ? 'outline' : 'default'}>
              {isSpectator
                ? (language === 'ar' ? 'مشاهد' : 'Spectator')
                : (language === 'ar' ? 'لاعب' : 'Player')}
            </Badge>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {spectatorCount > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {spectatorCount}
              </Badge>
            )}
            <Badge
              variant={connectionStatus === 'connected' ? 'default' : 'secondary'}
              className="flex items-center gap-1"
              role="status"
              aria-live="polite"
            >
              {connectionStatus === 'connected' ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
            </Badge>
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
            <Button variant="outline" size="icon" onClick={handleShare} aria-label={t('domino.shareGame')} data-testid="button-share" className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <DominoChallengeContainer
          boardState={boardState}
          currentTurn={dominoState.currentTurn}
          isMyTurn={isMyTurn}
          isSpectator={isSpectator}
          onMove={handleMove}
          status={dominoState.gamePhase}
          dominoResyncing={dominoResyncing}
          dominoMoveError={dominoMoveError}
          timeline={dominoTimeline}
          scoreRows={dominoScoreRows}
          endgameSummary={dominoEndgameSummary}
        />

        {dominoMoveError && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={clearMoveError} className="vex-arcade-btn">
              {t('common.close')}
            </Button>
          </div>
        )}

        {gameResult && (
          <div className="vex-arcade-panel rounded-2xl border-2 border-primary/30 bg-card/80 p-4 text-center backdrop-blur sm:p-5">
            <h2 className="text-xl font-bold sm:text-2xl">{t('domino.gameOver')}</h2>
            <p className={`mt-2 text-base sm:text-lg ${isSpectator ? 'text-blue-500' : gameResult.isDraw ? 'text-blue-500' : isWinner ? 'text-green-500' : 'text-red-500'}`}>
              {gameResult.isDraw
                ? t('domino.draw')
                : isSpectator
                  ? (language === 'ar' ? 'انتهت المباراة' : 'Match finished')
                  : (isWinner ? t('domino.youWon') : t('domino.youLost'))}
            </p>
            {gameResult.reason && !gameResult.isDraw && (
              <p className="mt-1 text-sm text-muted-foreground">{gameResult.reason}</p>
            )}
          </div>
        )}

        {gameResult && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation('/challenges')} className="vex-arcade-btn w-full sm:w-auto">
              <ArrowLeft className="w-4 h-4 me-1.5" />
              {t('common.back')}
            </Button>
            <Button size="sm" onClick={() => setLocation('/challenges?game=domino')} className="vex-arcade-btn w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 me-1.5" />
              {t('common.playAgain')}
            </Button>
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
        dir={language === 'ar' ? 'rtl' : 'ltr'}
      />

      <GiftAnimation
        gift={lastGift ? { id: Date.now().toString(), ...lastGift } : null}
        onComplete={clearLastGift}
      />
    </div>
  );
}
