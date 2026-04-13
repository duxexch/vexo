import { useMemo, useState, useRef, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { BackgammonBoard } from '@/components/games/backgammon/BackgammonBoard';
import { GiftAnimation } from '@/components/games/GiftAnimation';
import { GameStartCinematic } from '@/components/games/GameStartCinematic';
import { useGameWebSocket, type BackgammonGameState } from '@/hooks/useGameWebSocket';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Wifi, WifiOff, Users, ArrowLeft, Share2, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { backgammonSounds } from '@/lib/game-sounds';

export default function BackgammonGame() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language } = useI18n();

  const {
    connectionStatus,
    gameType,
    gameState,
    playerColor,
    opponent,
    spectatorCount,
    gameResult,
    error,
    moveError,
    moveErrorKey,
    isSpectator,
    canPlayActions,
    makeMove,
    forceReconnect,
    lastGift,
    clearLastGift,
    clearMoveError
  } = useGameWebSocket(sessionId || null);

  const bgState = gameState as BackgammonGameState | null;
  const [showCinematic, setShowCinematic] = useState(true);

  const isValidBackgammonState = useMemo(() => {
    if (!bgState) return false;
    return Array.isArray(bgState.board) &&
      bgState.board.length === 24 &&
      typeof bgState.currentTurn === 'string' &&
      bgState.bar !== undefined &&
      bgState.borneOff !== undefined;
  }, [bgState]);

  const mappedPlayerColor = useMemo(() => {
    if (!bgState?.myColor) return 'spectator';
    return bgState.myColor as 'white' | 'black' | 'spectator';
  }, [bgState?.myColor]);

  const isGameActive = !gameResult && bgState && isValidBackgammonState &&
    bgState.gamePhase !== 'finished';

  // ─── Sound Effects ─────────────────────────────────────────────
  const gameStartSounded = useRef(false);
  const prevDice = useRef<number[]>([]);
  const prevBorneOff = useRef({ white: 0, black: 0 });
  const prevBar = useRef({ white: 0, black: 0 });
  const prevCubeOffered = useRef(false);
  const prevBoardSignature = useRef('');

  // Game start sound
  useEffect(() => {
    if (!gameStartSounded.current && isValidBackgammonState && isGameActive) {
      backgammonSounds.gameStart();
      gameStartSounded.current = true;
    }
  }, [isValidBackgammonState, isGameActive]);

  // Dice roll sound
  useEffect(() => {
    const dice = bgState?.dice || [];
    if (dice.length > 0 && dice.length !== prevDice.current.length) {
      backgammonSounds.diceRoll();
    }
    prevDice.current = dice;
  }, [bgState?.dice]);

  // Bear off sound
  useEffect(() => {
    const borneOff = bgState?.borneOff || { white: 0, black: 0 };
    if (borneOff.white > prevBorneOff.current.white || borneOff.black > prevBorneOff.current.black) {
      backgammonSounds.bearOff();
    }
    prevBorneOff.current = borneOff;
  }, [bgState?.borneOff]);

  // Move and hit sounds
  useEffect(() => {
    if (!bgState || !isGameActive) return;

    const bar = bgState.bar || { white: 0, black: 0 };
    const boardSignature = JSON.stringify(bgState.board || []);

    if (!prevBoardSignature.current) {
      prevBar.current = bar;
      prevBoardSignature.current = boardSignature;
      return;
    }

    const isHit = bar.white > prevBar.current.white || bar.black > prevBar.current.black;
    const boardChanged = boardSignature !== prevBoardSignature.current;

    if (isHit) {
      backgammonSounds.hit();
    } else if (boardChanged) {
      backgammonSounds.move();
    }

    prevBar.current = bar;
    prevBoardSignature.current = boardSignature;
  }, [bgState?.board, bgState?.bar, isGameActive]);

  // Double offer sound
  useEffect(() => {
    const cubeOffered = Boolean(bgState?.cubeOffered);
    if (cubeOffered && !prevCubeOffered.current) {
      backgammonSounds.doubleOffer();
    }
    prevCubeOffered.current = cubeOffered;
  }, [bgState?.cubeOffered]);

  // Game over sound
  useEffect(() => {
    if (!gameResult) return;
    if (gameResult.winner === String(user?.id)) {
      backgammonSounds.victory();
    } else if (gameResult.winner === null) {
      // draw is rare in backgammon but handle it
    } else {
      backgammonSounds.defeat();
    }
  }, [gameResult?.winner]);

  // Surface move validation errors from server as localized toasts.
  useEffect(() => {
    if (!moveError && !moveErrorKey) {
      return;
    }

    const translated = moveErrorKey ? t(moveErrorKey) : '';
    const description = moveErrorKey && translated && translated !== moveErrorKey
      ? translated
      : (moveError || translated);

    if (description) {
      toast({
        title: t('common.error'),
        description,
        variant: 'destructive'
      });
    }

    clearMoveError();
  }, [moveError, moveErrorKey, t, toast, clearMoveError]);

  const handleRoll = () => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }

    makeMove({ type: 'roll' });
  };

  const handleMove = (from: number, to: number) => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }

    makeMove({ type: 'move', from: from.toString(), to: to.toString() });
  };

  const handleDouble = () => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }

    makeMove({ type: 'double' });
  };

  const handleAcceptDouble = () => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }

    makeMove({ type: 'accept_double' });
  };

  const handleDeclineDouble = () => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }

    makeMove({ type: 'decline_double' });
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: t('backgammon.title'),
          text: t('backgammon.shareText'),
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: t('common.success'),
          description: t('backgammon.linkCopied')
        });
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  };

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t('backgammon.invalidSession')}</p>
      </div>
    );
  }

  if (error) {
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

  if (connectionStatus === 'connecting' || connectionStatus === 'reconnecting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {connectionStatus === 'reconnecting'
            ? t('backgammon.reconnecting')
            : t('backgammon.connecting')}
        </p>
      </div>
    );
  }

  if (!gameState || !bgState || !isValidBackgammonState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('backgammon.loadingGame')}</p>
      </div>
    );
  }

  return (
    <div className="vex-arcade-stage container max-w-6xl mx-auto min-h-[100svh] px-3 sm:px-4 pt-4 sm:pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* ── Cinematic Game Start ── */}
      {showCinematic && !gameResult && (
        <GameStartCinematic
          gameType="backgammon"
          player={{ id: String(user?.id || ''), username: user?.username || '' }}
          opponent={opponent ? { id: opponent.id, username: opponent.username } : undefined}
          playerSide={mappedPlayerColor === 'white' ? 'white' : 'black'}
          spectatorCount={spectatorCount}
          onComplete={() => setShowCinematic(false)}
        />
      )}

      <div className="vex-arcade-header mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/challenges')}
            aria-label="Go back"
            data-testid="button-back"
            className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg sm:text-2xl font-bold">{t('backgammon.title')}</h1>
          <Badge variant={isSpectator ? 'outline' : 'default'}>
            {isSpectator
              ? (language === 'ar' ? 'مشاهد' : 'Spectator')
              : (language === 'ar' ? 'لاعب' : 'Player')}
          </Badge>
          <Badge variant={connectionStatus === 'connected' ? 'default' : 'destructive'} role="status" aria-live="polite">
            {connectionStatus === 'connected' ? (
              <><Wifi className="w-3 h-3 me-1" />{t('common.connected')}</>
            ) : (
              <><WifiOff className="w-3 h-3 me-1" />{t('common.disconnected')}</>
            )}
          </Badge>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Badge variant="outline">
            <Users className="w-3 h-3 me-1" />
            {spectatorCount} {t('common.spectators')}
          </Badge>
          <Button variant="outline" size="icon" onClick={handleShare} aria-label="Share game" data-testid="button-share" className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]">
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="vex-arcade-panel">
            <CardContent className="p-4">
              <BackgammonBoard
                board={bgState.board}
                bar={bgState.bar}
                borneOff={bgState.borneOff}
                dice={bgState.dice || []}
                diceUsed={bgState.diceUsed || []}
                currentTurn={bgState.currentTurn}
                playerColor={mappedPlayerColor}
                validMoves={bgState.validMoves || []}
                mustRoll={bgState.mustRoll || false}
                onMove={handleMove}
                onRoll={handleRoll}
                onDouble={handleDouble}
                onAcceptDouble={handleAcceptDouble}
                onDeclineDouble={handleDeclineDouble}
                doublingCube={bgState.doublingCube ?? 1}
                cubeOwner={bgState.cubeOwner ?? null}
                cubeOffered={Boolean(bgState.cubeOffered)}
                cubeOfferedBy={bgState.cubeOfferedBy ?? null}
                disabled={!isGameActive || mappedPlayerColor === 'spectator' || !canPlayActions}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="vex-arcade-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{t('backgammon.gameInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {isSpectator
                    ? (language === 'ar' ? 'المشاهد' : 'Viewer')
                    : t('backgammon.you')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{user?.username}</span>
                  {isSpectator ? (
                    <Badge variant="outline">{language === 'ar' ? 'مشاهد' : 'Spectator'}</Badge>
                  ) : (
                    <Badge variant={mappedPlayerColor === 'white' ? 'default' : 'secondary'}>
                      {mappedPlayerColor === 'white' ? t('backgammon.white') : t('backgammon.black')}
                    </Badge>
                  )}
                </div>
              </div>

              {opponent && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t('backgammon.opponent')}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{opponent.username}</span>
                    <Badge variant={mappedPlayerColor === 'white' ? 'secondary' : 'default'}>
                      {mappedPlayerColor === 'white' ? t('backgammon.black') : t('backgammon.white')}
                    </Badge>
                  </div>
                </div>
              )}

              <div className="border-t pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{t('backgammon.borneOff')}</span>
                </div>
                <div className="flex justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-amber-100 border border-amber-300" />
                    <span>{bgState.borneOff?.white || 0}/15</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-stone-800 border border-stone-600" />
                    <span>{bgState.borneOff?.black || 0}/15</span>
                  </div>
                </div>
              </div>

              {(bgState.bar?.white > 0 || bgState.bar?.black > 0) && (
                <div className="border-t pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('backgammon.onBar')}</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-amber-100 border border-amber-300" />
                      <span>{bgState.bar?.white || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-stone-800 border border-stone-600" />
                      <span>{bgState.bar?.black || 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {gameResult && (
            <Card className="vex-arcade-panel border-2 border-primary/30 bg-card/80 backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{t('backgammon.gameOver')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium">
                  {gameResult.winner === null
                    ? t('profile.draw')
                    : isSpectator
                      ? (language === 'ar' ? 'انتهت المباراة' : 'Match finished')
                      : gameResult.winner === user?.id
                        ? t('backgammon.youWon')
                        : t('backgammon.youLost')}
                </p>
                {gameResult.reason && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {gameResult.reason === 'backgammon' && t('backgammon.byBackgammon')}
                    {gameResult.reason === 'gammon' && t('backgammon.byGammon')}
                    {gameResult.reason === 'normal' && t('backgammon.byNormal')}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLocation('/challenges')} className="vex-arcade-btn w-full sm:w-auto">
                    <ArrowLeft className="w-4 h-4 me-1.5" />
                    {t('common.back')}
                  </Button>
                  <Button size="sm" onClick={() => setLocation('/challenges?game=backgammon')} className="vex-arcade-btn w-full sm:w-auto">
                    <RefreshCw className="w-4 h-4 me-1.5" />
                    {t('common.playAgain')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <GiftAnimation
        gift={lastGift ? { id: Date.now().toString(), ...lastGift } : null}
        onComplete={clearLastGift}
      />
    </div>
  );
}
