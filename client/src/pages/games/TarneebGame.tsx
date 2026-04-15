import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { TarneebBoard } from '@/components/games/TarneebBoard';
import type { TarneebState } from '@/components/games/TarneebBoard';
import { GameFullscreenActionDock, type GameFullscreenActionItem } from '@/components/games/GameFullscreenActionDock';
import { GiftAnimation } from '@/components/games/GiftAnimation';
import { GameStartCinematic } from '@/components/games/GameStartCinematic';
import { GameChat } from '@/components/games/GameChat';
import { useGameFullscreen } from '@/hooks/use-game-fullscreen';
import { useGameWebSocket, type CardGameState } from '@/hooks/useGameWebSocket';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Wifi, WifiOff, Users, ArrowLeft, Share2, AlertCircle, RefreshCw, Maximize2, Flag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cardSounds } from '@/lib/game-sounds';

export default function TarneebGame() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const isAr = language === 'ar';

  const {
    connectionStatus,
    gameState,
    spectatorCount,
    gameResult,
    error,
    isSpectator,
    canPlayActions,
    makeMove,
    resign,
    sendChat,
    chatMessages,
    forceReconnect,
    lastGift,
    clearLastGift
  } = useGameWebSocket(sessionId || null);

  const tarneebState = gameState as CardGameState | null;
  const [showCinematic, setShowCinematic] = useState(true);

  const {
    containerRef: fullscreenContainerRef,
    isFullscreen: isGameFullscreen,
    toggleFullscreen,
    exitFullscreen,
  } = useGameFullscreen();

  const isValidTarneebState = useMemo(() => {
    if (!tarneebState) return false;
    return tarneebState.hand !== undefined &&
      tarneebState.gamePhase !== undefined &&
      tarneebState.currentTurn !== undefined;
  }, [tarneebState]);

  const playerPosition = useMemo(() => {
    if (!user?.id || !tarneebState?.playerOrder) return 0;
    const pos = tarneebState.playerOrder.indexOf(String(user.id));
    return pos >= 0 ? pos : 0;
  }, [tarneebState?.playerOrder, user?.id]);

  const viewerPlayerId = isSpectator ? "__spectator__" : String(user?.id || "");

  // ─── Sound Effects ─────────────────────────────────────────────────
  const gameStartSounded = useRef(false);
  const prevTrickCount = useRef(0);
  const prevRound = useRef(0);
  const prevIsMyTurn = useRef(false);

  useEffect(() => {
    if (!gameStartSounded.current && isValidTarneebState && !gameResult) {
      cardSounds.gameStart();
      gameStartSounded.current = true;
    }
  }, [isValidTarneebState, gameResult]);

  // Your-turn sound (#16)
  useEffect(() => {
    const isMyTurn = tarneebState?.isMyTurn ?? false;
    if (isMyTurn && !prevIsMyTurn.current && gameStartSounded.current) {
      cardSounds.yourTurn();
    }
    prevIsMyTurn.current = isMyTurn;
  }, [tarneebState?.isMyTurn]);

  // Trick won sound
  useEffect(() => {
    const tricks = (tarneebState?.tricksWon?.team0 || 0) + (tarneebState?.tricksWon?.team1 || 0);
    if (tricks > prevTrickCount.current && prevTrickCount.current > 0) {
      cardSounds.trickWon();
    }
    prevTrickCount.current = tricks;
  }, [tarneebState?.tricksWon]);

  // Round end sound (#17)
  useEffect(() => {
    const round = tarneebState?.roundNumber ?? 1;
    if (round > prevRound.current && prevRound.current > 0) {
      cardSounds.roundEnd();
    }
    prevRound.current = round;
  }, [tarneebState?.roundNumber]);

  // Game over sound — use team-based check (fixes partner hearing defeat sound)
  useEffect(() => {
    if (!gameResult) return;
    const myTeamIdx = tarneebState?.myTeam ?? (playerPosition % 2);
    const winnerId = gameResult.winner;
    // Determine winning team: check if winner is on our team
    let isMyTeamWin = false;
    if (winnerId && tarneebState?.playerOrder) {
      const winnerIdx = tarneebState.playerOrder.indexOf(winnerId);
      isMyTeamWin = (winnerIdx % 2) === myTeamIdx;
    } else {
      isMyTeamWin = winnerId === String(user?.id);
    }
    if (isMyTeamWin) {
      cardSounds.victory();
    } else {
      cardSounds.defeat();
    }
  }, [gameResult?.winner]);

  // ─── Build player names map ────────────────────────────────────────
  const playerNames = useMemo(() => {
    const names: { [id: string]: string } = {};
    if (tarneebState?.playerOrder) {
      for (const pid of tarneebState.playerOrder) {
        if (pid === String(user?.id)) {
          names[pid] = user?.username || '';
        } else if (tarneebState.botPlayers?.includes(pid)) {
          names[pid] = pid.endsWith('-1') ? (isAr ? 'بوت ١' : 'Bot 1') : (isAr ? 'بوت ٢' : 'Bot 2');
        } else {
          names[pid] = `P${pid.slice(-4)}`;
        }
      }
    }
    return names;
  }, [tarneebState?.playerOrder, tarneebState?.botPlayers, user?.id, user?.username, isAr]);

  const boardState = useMemo(() => {
    if (!tarneebState) return null;

    const hands: { [playerId: string]: { suit: string; rank: string; value: number; hidden?: boolean }[] } = {};
    if (user?.id && tarneebState.hand) {
      hands[String(user.id)] = tarneebState.hand;
    }
    if (tarneebState.otherHandCounts) {
      for (const [pid, count] of Object.entries(tarneebState.otherHandCounts)) {
        hands[pid] = Array(count as number).fill({ suit: 'spades', rank: 'X', value: 0, hidden: true });
      }
    }

    const serverTricksWon = tarneebState.tricksWon || { team0: 0, team1: 0 };
    const serverScores = tarneebState.totalScores || { team0: 0, team1: 0 };

    return {
      phase: (tarneebState.gamePhase === 'bidding' ? 'bidding' :
        tarneebState.gamePhase === 'finished' ? 'finished' : 'playing') as "bidding" | "playing" | "finished",
      hands,
      hand: tarneebState.hand,
      otherHandCounts: tarneebState.otherHandCounts,
      currentTrick: tarneebState.currentTrick || [],
      trumpSuit: (tarneebState.trumpSuit || null) as "hearts" | "diamonds" | "clubs" | "spades" | null,
      currentPlayer: tarneebState.currentTurn || '',
      currentTurn: tarneebState.currentTurn || '',
      isMyTurn: tarneebState.isMyTurn,
      gamePhase: tarneebState.gamePhase,
      bids: tarneebState.bids || [],
      highestBid: tarneebState.highestBid || null,
      biddingTeam: tarneebState.biddingTeam ?? null,
      tricksWon: { team0: serverTricksWon.team0, team1: serverTricksWon.team1 },
      scores: { team0: serverScores.team0, team1: serverScores.team1 },
      totalScores: tarneebState.totalScores,
      roundScores: tarneebState.roundScores,
      dealerId: tarneebState.dealerId || tarneebState.playerOrder?.[0] || '',
      myTeam: tarneebState.myTeam,
      partner: tarneebState.partner,
      playerOrder: tarneebState.playerOrder,
      trickLeader: tarneebState.trickLeader,
      roundNumber: tarneebState.roundNumber,
      targetScore: tarneebState.targetScore,
      lastTrickWinner: tarneebState.lastTrickWinner,
      validMoves: tarneebState.validMoves,
      lastCompletedTrick: tarneebState.lastCompletedTrick,
      botPlayers: tarneebState.botPlayers,
      redealCount: tarneebState.redealCount,
      lastRoundScores: tarneebState.lastRoundScores,
      lastBidValue: tarneebState.lastBidValue,
      lastBiddingTeam: tarneebState.lastBiddingTeam,
      lastBiddingTeamMade: tarneebState.lastBiddingTeamMade,
      lastIsKaboot: tarneebState.lastIsKaboot,
      // F10-cycle8: Prefer server-provided winningTeam (avoids fragile index math)
      winningTeam: (tarneebState as any).winningTeam ?? (tarneebState.winner && tarneebState.playerOrder
        ? (tarneebState.playerOrder.indexOf(tarneebState.winner) % 2)
        : undefined)
    };
  }, [tarneebState, user?.id]);

  const handleBid = (bid: number) => {
    if (!canPlayActions) {
      toast({
        title: isAr ? 'وضع المشاهدة' : 'Spectator mode',
        description: isAr ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }
    cardSounds.bid();
    makeMove({ type: 'bid', bid });
  };

  const handlePass = () => {
    if (!canPlayActions) {
      toast({
        title: isAr ? 'وضع المشاهدة' : 'Spectator mode',
        description: isAr ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }
    cardSounds.bidPass();
    makeMove({ type: 'bid', bid: null });
  };

  const handlePlayCard = (card: object) => {
    if (!canPlayActions) {
      toast({
        title: isAr ? 'وضع المشاهدة' : 'Spectator mode',
        description: isAr ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }
    cardSounds.playCard();
    makeMove({ type: 'playCard', card });
  };

  // BUG #1 fix: handleSetTrump was missing — game froze after bidding winner
  const handleSetTrump = useCallback((suit: string) => {
    if (!canPlayActions) {
      toast({
        title: isAr ? 'وضع المشاهدة' : 'Spectator mode',
        description: isAr ? 'هذا الإجراء متاح للاعبين فقط.' : 'This action is available to players only.',
        variant: 'destructive'
      });
      return;
    }
    cardSounds.trumpSelected();
    makeMove({ type: 'setTrump', suit });
  }, [makeMove, canPlayActions, toast, isAr]);

  const handleResign = useCallback(() => {
    if (!canPlayActions) {
      return;
    }
    resign();
  }, [resign, canPlayActions]);

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: t('tarneeb.title'),
          text: t('tarneeb.shareText'),
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: t('common.success'),
          description: t('tarneeb.linkCopied')
        });
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  };

  const fullscreenActions = useMemo<GameFullscreenActionItem[]>(() => {
    const actions: GameFullscreenActionItem[] = [
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
    ];

    if (canPlayActions && !gameResult) {
      actions.push({
        id: 'resign',
        icon: Flag,
        label: t('challenge.resign'),
        onClick: handleResign,
        tone: 'destructive',
      });
    }

    return actions;
  }, [t, setLocation, handleShare, canPlayActions, gameResult, handleResign]);

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t('tarneeb.invalidSession')}</p>
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
            : t('tarneeb.connecting')}
        </p>
      </div>
    );
  }

  if (!gameState || !tarneebState || !isValidTarneebState || !boardState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('tarneeb.loadingGame')}</p>
      </div>
    );
  }

  // BUG #2 fix: use 0-based team index (team0=positions 0,2; team1=positions 1,3)
  const myTeam = tarneebState.myTeam ?? (playerPosition % 2);
  const winnerTeam = (gameResult as { winner: string | null; reason: string; winningTeam?: number } | null)?.winningTeam ?? boardState.winningTeam;

  return (
    <div
      ref={fullscreenContainerRef}
      className={`vex-arcade-stage container mx-auto max-w-6xl min-h-[100svh] px-3 sm:px-4 pt-4 sm:pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] ${isGameFullscreen ? 'vex-game-fullscreen-shell !mx-0 !w-screen !max-w-none !px-2 sm:!px-3 !pt-[max(0.5rem,env(safe-area-inset-top))]' : ''}`}
    >
      {/* ── Cinematic Game Start ── */}
      {showCinematic && !gameResult && tarneebState?.playerOrder && (
        <GameStartCinematic
          gameType="tarneeb"
          player={{ id: String(user?.id || ''), username: user?.username || '' }}
          teams={[
            tarneebState.playerOrder
              .filter((_, i) => i % 2 === 0)
              .map(id => ({ id, username: id === String(user?.id) ? (user?.username || '') : `P${id.slice(-3)}` })),
            tarneebState.playerOrder
              .filter((_, i) => i % 2 === 1)
              .map(id => ({ id, username: id === String(user?.id) ? (user?.username || '') : `P${id.slice(-3)}` }))
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
              aria-label="Go back"
              data-testid="button-back"
              className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg sm:text-2xl font-bold">{t('tarneeb.title')}</h1>
            <Badge variant={isSpectator ? 'outline' : 'default'}>
              {isSpectator ? (isAr ? 'مشاهد' : 'Spectator') : (isAr ? 'لاعب' : 'Player')}
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
            <Button variant="outline" size="icon" onClick={handleShare} aria-label="Share game" data-testid="button-share" className="vex-arcade-btn vex-arcade-btn--icon min-h-[44px] min-w-[44px]">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {gameResult && (
          <Card className="vex-arcade-panel border-2 border-primary/30 bg-card/80 backdrop-blur">
            <CardContent className="pt-6">
              <div className="text-center">
                <h2 className="mb-2 text-xl font-bold sm:text-2xl">
                  {t('tarneeb.gameOver')}
                </h2>
                <p className={`text-lg ${isSpectator ? 'text-blue-500' : winnerTeam === myTeam ? 'text-green-500' : 'text-red-500'}`}>
                  {isSpectator
                    ? (isAr ? 'انتهت المباراة' : 'Match finished')
                    : (winnerTeam === myTeam ? t('tarneeb.youWon') : t('tarneeb.youLost'))}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLocation('/challenges')} className="vex-arcade-btn w-full sm:w-auto">
                    <ArrowLeft className="w-4 h-4 me-1.5" />
                    {t('common.back')}
                  </Button>
                  <Button size="sm" onClick={() => setLocation('/challenges?game=tarneeb')} className="vex-arcade-btn w-full sm:w-auto">
                    <RefreshCw className="w-4 h-4 me-1.5" />
                    {t('common.playAgain')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <TarneebBoard
          sessionId={sessionId}
          gameState={boardState as TarneebState}
          playerId={viewerPlayerId}
          playerPosition={playerPosition}
          playerNames={playerNames}
          onPlayCard={canPlayActions ? handlePlayCard : () => { }}
          onBid={canPlayActions ? handleBid : () => { }}
          onPass={canPlayActions ? handlePass : () => { }}
          onSetTrump={canPlayActions ? handleSetTrump : () => { }}
          onResign={canPlayActions ? handleResign : undefined}
        />

        {/* Chat bubble (#11) */}
        <GameChat
          messages={(chatMessages || []).map((m) => ({
            id: String(m.timestamp),
            senderId: m.userId || m.username || '',
            senderName: m.userId ? (playerNames[m.userId] || m.username || m.userId.slice(-4)) : m.username,
            message: m.message,
            createdAt: new Date(typeof m.timestamp === 'number' ? m.timestamp : Date.now()).toISOString(),
          }))}
          onSendMessage={(msg: string) => sendChat(msg)}
          quickMessages={[
            { key: 'good_game', en: 'Good game!', ar: 'لعبة حلوة!' },
            { key: 'well_played', en: 'Well played!', ar: 'أحسنت!' },
            { key: 'my_bad', en: 'My bad', ar: 'غلطتي' },
            { key: 'thanks', en: 'Thanks', ar: 'شكراً' },
            { key: 'nice_bid', en: 'Nice bid!', ar: 'مزايدة ممتازة!' },
            { key: 'good_trump', en: 'Good trump!', ar: 'حكم ممتاز!' },
            { key: 'hurry_up', en: 'Hurry up!', ar: 'أسرع!' },
            { key: 'wow', en: 'Wow!', ar: 'واو!' },
            { key: 'haha', en: '😂', ar: '😂' },
            { key: 'no_way', en: 'No way!', ar: 'مستحيل!' },
          ]}
          language={isAr ? 'ar' : 'en'}
          currentUserId={String(user?.id || '')}
        />
      </div>

      <GameFullscreenActionDock
        active={isGameFullscreen}
        actions={fullscreenActions}
        onExit={() => {
          void exitFullscreen();
        }}
        exitLabel={t('common.close')}
        dir={isAr ? 'rtl' : 'ltr'}
      />

      <GiftAnimation
        gift={lastGift ? { id: Date.now().toString(), ...lastGift } : null}
        onComplete={clearLastGift}
      />
    </div>
  );
}
