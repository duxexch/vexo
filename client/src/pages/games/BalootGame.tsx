import { useMemo, useState, useRef, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { BalootBoard } from '@/components/games/BalootBoard';
import type { BalootState } from '@/components/games/BalootBoard';
import { GameFullscreenActionDock, type GameFullscreenActionItem } from '@/components/games/GameFullscreenActionDock';
import { GiftAnimation } from '@/components/games/GiftAnimation';
import { GameStartCinematic } from '@/components/games/GameStartCinematic';
import { useGameFullscreen } from '@/hooks/use-game-fullscreen';
import { useGameWebSocket, type CardGameState } from '@/hooks/useGameWebSocket';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Wifi, WifiOff, Users, ArrowLeft, Share2, AlertCircle, RefreshCw, Maximize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cardSounds } from '@/lib/game-sounds';

export default function BalootGame() {
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
    isSpectator,
    canPlayActions,
    makeMove,
    forceReconnect,
    lastGift,
    clearLastGift
  } = useGameWebSocket(sessionId || null);

  const balootState = gameState as CardGameState | null;
  const [showCinematic, setShowCinematic] = useState(true);

  const {
    containerRef: fullscreenContainerRef,
    isFullscreen: isGameFullscreen,
    toggleFullscreen,
    exitFullscreen,
  } = useGameFullscreen();

  const isValidBalootState = useMemo(() => {
    if (!balootState) return false;
    return balootState.hand !== undefined &&
      balootState.gamePhase !== undefined &&
      balootState.currentTurn !== undefined;
  }, [balootState]);

  const playerPosition = useMemo(() => {
    if (!user?.id || !balootState?.playerOrder) return 0;
    const pos = balootState.playerOrder.indexOf(String(user.id));
    return pos >= 0 ? pos : 0;
  }, [balootState?.playerOrder, user?.id]);

  const viewerPlayerId = isSpectator ? "__spectator__" : String(user?.id || '');

  // ─── Player Names (for bots and real players) ──────────────────────
  const playerNames = useMemo(() => {
    const names: { [id: string]: string } = {};
    if (balootState?.playerOrder) {
      for (const pid of balootState.playerOrder) {
        if (pid === String(user?.id)) {
          names[pid] = user?.username || '';
        } else if (pid.startsWith('bot-')) {
          names[pid] = t('common.bot') || 'Bot';
        } else {
          names[pid] = `P${pid.slice(-3)}`;
        }
      }
    }
    return names;
  }, [balootState?.playerOrder, user?.id, user?.username]);

  // ─── Sound Effects ─────────────────────────────────────────────────
  const gameStartSounded = useRef(false);
  const prevTrickCount = useRef(0);
  const prevRound = useRef(1);
  const prevKabootRound = useRef(0);
  const prevProjectCount = useRef(0);

  useEffect(() => {
    if (!gameStartSounded.current && isValidBalootState && !gameResult) {
      cardSounds.gameStart();
      gameStartSounded.current = true;
    }
  }, [isValidBalootState, gameResult]);

  // Trick won sound
  useEffect(() => {
    const tricks = (balootState?.tricksWon?.team0 || 0) + (balootState?.tricksWon?.team1 || 0);
    if (tricks > prevTrickCount.current && prevTrickCount.current > 0) {
      cardSounds.trickWon();
    }
    prevTrickCount.current = tricks;
  }, [balootState?.tricksWon]);

  // Kaboot sound — only play once per round (prevent repeat on reconnect)
  useEffect(() => {
    const round = (balootState as unknown as Record<string, unknown>)?.roundNumber as number || 1;
    if ((balootState as unknown as Record<string, unknown>)?.lastRoundKaboot && round > prevKabootRound.current) {
      cardSounds.kaboot();
      prevKabootRound.current = round;
    }
  }, [(balootState as unknown as Record<string, unknown>)?.lastRoundKaboot, (balootState as unknown as Record<string, unknown>)?.roundNumber]);

  // New round sound
  useEffect(() => {
    const round = (balootState as unknown as Record<string, unknown>)?.roundNumber as number || 1;
    if (round > prevRound.current) {
      cardSounds.trumpSelected();
    }
    prevRound.current = round;
  }, [(balootState as unknown as Record<string, unknown>)?.roundNumber]);

  // Project announcement sound
  useEffect(() => {
    const projects = (balootState as unknown as Record<string, unknown>)?.projects as unknown[];
    const count = projects?.length || 0;
    if (count > 0 && count > prevProjectCount.current) {
      cardSounds.trickWon();
    }
    prevProjectCount.current = count;
  }, [(balootState as unknown as Record<string, unknown>)?.projects]);

  // Game over sound
  useEffect(() => {
    if (!gameResult) return;
    const myTeamIdx = balootState?.myTeam ?? (playerPosition % 2 === 0 ? 0 : 1);
    const resultObj = gameResult as { winner: string | null; reason: string; winningTeam?: number };
    if (resultObj.winningTeam === myTeamIdx) {
      cardSounds.victory();
    } else {
      cardSounds.defeat();
    }
  }, [gameResult]);

  const boardState = useMemo((): BalootState | null => {
    if (!balootState) return null;

    const hands: BalootState['hands'] = {};
    if (user?.id && balootState.hand) {
      hands[String(user.id)] = balootState.hand as BalootState['hands'][string];
    }
    if (balootState.otherHandCounts) {
      for (const [pid, count] of Object.entries(balootState.otherHandCounts)) {
        hands[pid] = Array(count as number).fill({ suit: 'spades' as const, rank: 'X', value: 0 });
      }
    }

    const serverTricksWon = balootState.tricksWon || { team0: 0, team1: 0 };
    const serverPoints = balootState.totalPoints || { team0: 0, team1: 0 };
    const serverRoundPoints = balootState.roundPoints || { team0: 0, team1: 0 };
    const extra = balootState as unknown as Record<string, unknown>;

    return {
      phase: (balootState.gamePhase === 'choosing' ? 'choosing' :
        balootState.gamePhase === 'finished' ? 'finished' : 'playing') as "choosing" | "playing" | "finished",
      hands,
      hand: balootState.hand,
      otherHandCounts: balootState.otherHandCounts,
      currentTrick: balootState.currentTrick || [],
      lastCompletedTrick: extra.lastCompletedTrick as BalootState['lastCompletedTrick'],
      gameType: (balootState.gameType || null) as "sun" | "hokm" | null,
      trumpSuit: balootState.trumpSuit || null,
      currentPlayer: balootState.currentTurn || '',
      currentTurn: balootState.currentTurn,
      isMyTurn: balootState.isMyTurn,
      gamePhase: balootState.gamePhase,
      choosingPlayer: balootState.choosingPlayer || balootState.playerOrder?.[0] || '',
      playerOrder: balootState.playerOrder,
      myTeam: balootState.myTeam,
      partner: balootState.partner,
      tricksWon: { team0: serverTricksWon.team0, team1: serverTricksWon.team1 },
      totalPoints: { team0: serverPoints.team0, team1: serverPoints.team1 },
      roundPoints: { team0: serverRoundPoints.team0, team1: serverRoundPoints.team1 },
      projects: (balootState.projects || []) as BalootState['projects'],
      dealerId: extra.dealerId as string || balootState.playerOrder?.[0] || '',
      winningTeam: extra.winningTeam as number | undefined,
      validMoves: extra.validMoves as BalootState['validMoves'],
      trickLeader: balootState.trickLeader,
      roundNumber: extra.roundNumber as number | undefined,
      targetPoints: extra.targetPoints as number | undefined,
      lastTrickWinner: extra.lastTrickWinner as string | undefined,
      passRound: extra.passRound as number | undefined,
      lastRoundPoints: extra.lastRoundPoints as BalootState['lastRoundPoints'],
      lastRoundGameType: extra.lastRoundGameType as BalootState['lastRoundGameType'],
      lastRoundKaboot: extra.lastRoundKaboot as boolean | undefined,
      lastRoundProjects: extra.lastRoundProjects as BalootState['lastRoundProjects'],
      passCount: extra.passCount as number | undefined,
      lastChoice: extra.lastChoice as BalootState['lastChoice'],
      lastTrickPoints: extra.lastTrickPoints as number | undefined,
    };
  }, [balootState, user?.id]);

  const handleChooseTrump = (type: 'sun' | 'hokm', suit?: string) => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }
    cardSounds.trumpSelected();
    makeMove({ type: 'choose', gameType: type, trumpSuit: suit });
  };

  const handlePass = () => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }
    cardSounds.bidPass();
    makeMove({ type: 'pass' });
  };

  const handlePlayCard = (card: object) => {
    if (!canPlayActions) {
      toast({
        title: language === 'ar' ? 'وضع المشاهدة' : 'Spectator mode',
        description: language === 'ar' ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }
    // Sound triggered by BalootBoard trick-length effect (avoids double-play)
    makeMove({ type: 'playCard', card });
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: t('baloot.title'),
          text: t('baloot.shareText'),
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: t('common.success'),
          description: t('baloot.linkCopied')
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
      label: t('common.share'),
      onClick: () => {
        void handleShare();
      },
      tone: 'primary',
    },
  ]), [t, setLocation, handleShare]);

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t('baloot.invalidSession')}</p>
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
            ? t('common.reconnecting')
            : t('baloot.connecting')}
        </p>
      </div>
    );
  }

  if (!gameState || !balootState || !isValidBalootState || !boardState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('baloot.loadingGame')}</p>
      </div>
    );
  }

  const myTeam = balootState.myTeam ?? (playerPosition % 2 === 0 ? 0 : 1);
  const winnerTeam = (gameResult as { winner: string | null; reason: string; winningTeam?: number } | null)?.winningTeam ?? boardState.winningTeam;

  return (
    <div
      ref={fullscreenContainerRef}
      className={`vex-arcade-stage container mx-auto max-w-6xl min-h-[100svh] px-3 sm:px-4 pt-4 sm:pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] ${isGameFullscreen ? 'vex-game-fullscreen-shell !mx-0 !w-screen !max-w-none !px-2 sm:!px-3 !pt-[max(0.5rem,env(safe-area-inset-top))]' : ''}`}
    >
      {/* ── Cinematic Game Start ── */}
      {showCinematic && !gameResult && balootState?.playerOrder && (
        <GameStartCinematic
          gameType="baloot"
          player={{ id: String(user?.id || ''), username: user?.username || '' }}
          teams={[
            balootState.playerOrder
              .filter((_, i) => i % 2 === 0)
              .map(id => ({ id, username: id === String(user?.id) ? (user?.username || '') : (playerNames[id] || `P${id.slice(-3)}`) })),
            balootState.playerOrder
              .filter((_, i) => i % 2 === 1)
              .map(id => ({ id, username: id === String(user?.id) ? (user?.username || '') : (playerNames[id] || `P${id.slice(-3)}`) }))
          ]}
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
              onClick={() => setLocation('/challenges')}
              aria-label={t('common.back')}
              data-testid="button-back"
              className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg sm:text-2xl font-bold">{t('baloot.title')}</h1>
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
            <Button variant="outline" size="icon" onClick={handleShare} aria-label={t('common.share') || 'Share game'} data-testid="button-share" className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {gameResult && (
          <Card className="vex-arcade-panel border-2 border-primary/30 bg-card/80 backdrop-blur">
            <CardContent className="pt-6">
              <div className="text-center">
                <h2 className="mb-2 text-xl font-bold sm:text-2xl">
                  {t('baloot.gameOver')}
                </h2>
                <p className={`text-lg ${isSpectator ? 'text-blue-500' : winnerTeam === myTeam ? 'text-green-500' : 'text-red-500'}`}>
                  {isSpectator
                    ? (language === 'ar' ? 'انتهت المباراة' : 'Match finished')
                    : (winnerTeam === myTeam ? t('baloot.youWon') : t('baloot.youLost'))}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLocation('/challenges')} className="vex-arcade-btn w-full sm:w-auto">
                    <ArrowLeft className="w-4 h-4 me-1.5" />
                    {t('common.back')}
                  </Button>
                  <Button size="sm" onClick={() => setLocation('/challenges?game=baloot')} className="vex-arcade-btn w-full sm:w-auto">
                    <RefreshCw className="w-4 h-4 me-1.5" />
                    {t('common.playAgain')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <BalootBoard
          gameState={boardState}
          playerId={viewerPlayerId}
          playerPosition={playerPosition}
          onPlayCard={canPlayActions ? handlePlayCard : () => { }}
          onChooseTrump={canPlayActions ? handleChooseTrump : () => { }}
          onPass={canPlayActions ? handlePass : () => { }}
          playerNames={playerNames}
        />
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
