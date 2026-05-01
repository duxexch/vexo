'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Share2, Maximize2, Minimize2, Trophy, Frown, Wifi, WifiOff } from 'lucide-react';
import { useGameFullscreen } from '@/hooks/use-game-fullscreen';
import { useGameWebSocket } from '@/hooks/useGameWebSocket';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { GiftAnimation } from '@/components/games/GiftAnimation';
import { useToast } from '@/hooks/use-toast';

interface AimTarget {
    id: string;
    x: number;
    y: number;
    radius: number;
    spawnAtMs: number;
    expireAtMs: number;
}

interface AimPlayerStats {
    playerId: string;
    hits: number;
    misses: number;
    accuracy: number;
    lastHitAtMs: number;
}

interface AimGameState {
    phase: 'waiting' | 'countdown' | 'active' | 'finished';
    playerStats: AimPlayerStats;
    allStats: { [playerId: string]: AimPlayerStats };
    remainingMs: number;
    currentTarget: AimTarget | null;
    targetSequence: AimTarget[];
    playerOrder: string[];
    difficulty: 'normal' | 'hard';
}

export default function AimTrainerGame() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const [, setLocation] = useLocation();
    const { user } = useAuth();
    const { toast } = useToast();
    const { t } = useI18n();

    const arenaRef = useRef<HTMLDivElement>(null);
    const {
        connectionStatus,
        gameState: rawGameState,
        gameResult,
        lastGift,
        clearLastGift,
        makeMove
    } = useGameWebSocket(sessionId || '');

    const { isFullscreen, toggleFullscreen, containerRef } = useGameFullscreen();

    const aimState = useMemo(() => {
        if (!rawGameState) return null;
        try {
            return rawGameState as unknown as AimGameState;
        } catch {
            return null;
        }
    }, [rawGameState]);

    const handleArenaClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!arenaRef.current || !aimState || aimState.phase !== 'active' || !aimState.currentTarget) return;

            const rect = arenaRef.current.getBoundingClientRect();
            const clickX = ((e.clientX - rect.left) / rect.width) * 100;
            const clickY = ((e.clientY - rect.top) / rect.height) * 100;

            const targetX = aimState.currentTarget.x;
            const targetY = aimState.currentTarget.y;
            const radiusPercent = (aimState.currentTarget.radius / Math.min(rect.width, rect.height)) * 100;

            const distance = Math.sqrt(Math.pow(clickX - targetX, 2) + Math.pow(clickY - targetY, 2));
            const isHit = distance <= radiusPercent;

            makeMove({
                type: 'click',
                targetId: aimState.currentTarget.id,
                x: clickX,
                y: clickY,
                clickTimestampMs: Date.now(),
                isHit
            });
        },
        [aimState, makeMove]
    );

    if (!aimState) {
        return (
            <div className="container mx-auto max-w-xl min-h-[100svh] px-4 py-8 flex items-center justify-center">
                <Card className="p-6 text-center">
                    <p className="text-slate-400">{t('common.loading') || 'Loading...'}</p>
                </Card>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={`vex-arcade-stage container mx-auto max-w-xl min-h-[100svh] px-3 sm:px-4 pt-4 sm:pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] ${isFullscreen ? 'vex-game-fullscreen-shell !mx-0 !w-screen !max-w-none !px-2 sm:!px-3 !pt-[max(0.5rem,env(safe-area-inset-top))]' : ''}`}>
            {/* Header */}
            <div className={`vex-arcade-header flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 sm:px-4 sm:py-3 ${isFullscreen ? 'hidden' : ''}`}>
                <div className="flex items-center gap-2">
                    <Badge variant="outline">{t('aim.title') || 'Aim Trainer'}</Badge>
                    {connectionStatus === 'connected' ? (
                        <Wifi className="h-4 w-4 text-green-500" />
                    ) : (
                        <WifiOff className="h-4 w-4 text-red-500" />
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={toggleFullscreen}>
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setLocation('/games')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="vex-stats mt-4 flex gap-3 text-center">
                <div className="vex-stat flex-1">
                    <div className="vex-stat-label text-xs sm:text-sm">{t('aim.hits') || 'Hits'}</div>
                    <div className="vex-stat-value text-lg sm:text-2xl text-red-500">{aimState.playerStats.hits}</div>
                </div>
                <div className="vex-stat flex-1">
                    <div className="vex-stat-label text-xs sm:text-sm">{t('aim.accuracy') || 'Accuracy'}</div>
                    <div className="vex-stat-value text-lg sm:text-2xl">{aimState.playerStats.accuracy}%</div>
                </div>
                <div className="vex-stat flex-1">
                    <div className="vex-stat-label text-xs sm:text-sm">{t('aim.time') || 'Time'}</div>
                    <div className="vex-stat-value text-lg sm:text-2xl text-emerald-500">{Math.ceil(aimState.remainingMs / 1000)}s</div>
                </div>
            </div>

            {/* Arena */}
            <div
                ref={arenaRef}
                onClick={handleArenaClick}
                className="relative mt-4 w-full aspect-square max-w-sm mx-auto bg-gradient-to-b from-slate-900 to-black border-2 border-red-500/50 rounded-2xl overflow-hidden cursor-crosshair"
                style={{
                    boxShadow: '0 0 40px rgba(239, 68, 68, 0.3), inset 0 0 40px rgba(0, 0, 0, 0.5)'
                }}
            >
                {/* Reticle/Scope */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-red-500/30" />
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-1 bg-red-500/30" />
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 border border-red-500/40 rounded-full" />
                </div>

                {/* Time Bar */}
                {aimState && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800 z-0">
                        <div
                            className={`h-full transition-colors ${aimState.remainingMs > 10000 ? 'bg-green-500' : aimState.remainingMs > 5000 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                            style={{ width: `${(aimState.remainingMs / (aimState.difficulty === 'hard' ? 30000 : 30000)) * 100}%` }}
                        />
                    </div>
                )}

                {/* Targets */}
                {aimState.targetSequence.map(target => (
                    <div
                        key={target.id}
                        className="absolute pointer-events-none"
                        style={{
                            left: `${target.x}%`,
                            top: `${target.y}%`,
                            transform: 'translate(-50%, -50%)',
                            opacity: 0.9
                        }}
                    >
                        <div
                            className="bg-red-500 rounded-full border-2 border-red-300 relative"
                            style={{
                                width: `${target.radius * 2}px`,
                                height: `${target.radius * 2}px`,
                                boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)'
                            }}
                        >
                            <div className="absolute inset-8 bg-yellow-300 rounded-full" />
                        </div>
                    </div>
                ))}

                {/* Start Curtain */}
                {aimState.phase === 'waiting' && (
                    <div className="absolute inset-0 grid place-items-center bg-black/80 backdrop-blur z-10">
                        <div className="text-center">
                            <div className="text-4xl font-bold text-red-500 mb-2">{t('aim.ready') || 'Ready?'}</div>
                            <div className="text-sm text-slate-400 mb-4">30 {t('aim.seconds') || 'seconds'}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Game Over Modal */}
            {gameResult && aimState.phase === 'finished' && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
                    <Card className="w-full max-w-sm p-6 text-center">
                        <div className={`h-12 w-12 mx-auto mb-4 ${gameResult.winner === user?.id ? 'text-yellow-500' : 'text-slate-500'}`}>
                            {gameResult.winner === user?.id ? <Trophy className="h-12 w-12" /> : <Frown className="h-12 w-12" />}
                        </div>
                        <h2 className="text-2xl font-bold mb-2">
                            {gameResult.winner === user?.id ? t('aim.victory') : t('aim.gameOver')}
                        </h2>
                        <div className="space-y-2 mb-4">
                            <p className="text-sm">{t('aim.hits')}: {aimState.playerStats.hits}</p>
                            <p className="text-sm">{t('aim.accuracy')}: {aimState.playerStats.accuracy}%</p>
                        </div>
                        <Button onClick={() => setLocation('/games')} className="w-full">
                            {t('common.back')}
                        </Button>
                    </Card>
                </div>
            )}

            {/* Gifts Animation */}
            {lastGift && <GiftAnimation gift={{ ...lastGift, id: `gift_${Date.now()}` } as any} onComplete={clearLastGift} />}
        </div>
    );
}
