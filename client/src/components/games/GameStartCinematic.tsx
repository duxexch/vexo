import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { cinematicSounds } from '@/lib/cinematic-sounds';
import { Swords, Crown, Users, Eye } from 'lucide-react';
import { GameConfigIcon } from '@/components/GameConfigIcon';
import { buildGameConfig, FALLBACK_GAME_CONFIG, resolveGameConfigEntry, getGameIconSurfaceClass, getGameIconToneClass, type MultiplayerGameFromAPI } from '@/lib/game-config';

// ── Types ──

interface PlayerInfo {
  id: string;
  username: string;
  avatarUrl?: string;
  vipLevel?: number;
  gamesWon?: number;
  gamesPlayed?: number;
}

interface GameStartCinematicProps {
  /** Game type identifier */
  gameType: 'chess' | 'backgammon' | 'domino' | 'tarneeb' | 'baloot';
  /** Current player */
  player: PlayerInfo;
  /** Opponent (for 2-player games) */
  opponent?: PlayerInfo;
  /** All players (for 4-player games — Tarneeb/Baloot) */
  players?: PlayerInfo[];
  /** Team assignments for 4-player games [team1, team2] each with 2 players */
  teams?: [PlayerInfo[], PlayerInfo[]];
  /** Player's color/side (chess/backgammon) */
  playerSide?: 'w' | 'b' | 'white' | 'black';
  /** Number of spectators watching */
  spectatorCount?: number;
  /** Called when cinematic finishes */
  onComplete: () => void;
}

// ── Phases ──
type Phase = 'enter' | 'vs' | 'countdown' | 'go' | 'done';

// ── Particle System ──
interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  angle: number;
}

function generateParticles(count: number): Particle[] {
  const colors = [
    'rgba(255, 215, 0, 0.8)',   // gold
    'rgba(59, 130, 246, 0.8)',  // blue
    'rgba(168, 85, 247, 0.8)',  // purple
    'rgba(34, 197, 94, 0.8)',   // green
    'rgba(239, 68, 68, 0.7)',   // red
    'rgba(255, 255, 255, 0.6)', // white
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 2,
    duration: Math.random() * 3 + 2,
    angle: Math.random() * 360,
  }));
}

// ── Win rate helper ──
function getWinRate(p: PlayerInfo): string {
  if (!p.gamesPlayed || p.gamesPlayed === 0) return '—';
  return `${Math.round(((p.gamesWon || 0) / p.gamesPlayed) * 100)}%`;
}

// ── Avatar Component ──
function PlayerAvatar({ player, size = 'lg', side }: { player: PlayerInfo; size?: 'sm' | 'lg'; side?: 'left' | 'right' }) {
  const sizeClass = size === 'lg' ? 'w-20 h-20 text-3xl' : 'w-14 h-14 text-xl';
  const initial = (player.username || 'P').charAt(0).toUpperCase();

  return (
    <div className={cn(
      "relative rounded-full flex items-center justify-center font-bold shadow-2xl border-2 border-white/20",
      sizeClass,
      "bg-gradient-to-br from-primary/80 to-primary/40"
    )}>
      {player.avatarUrl ? (
        <img src={player.avatarUrl} alt={player.username} className="w-full h-full rounded-full object-cover" />
      ) : (
        <span className="text-white drop-shadow-lg">{initial}</span>
      )}
      {/* VIP badge */}
      {(player.vipLevel ?? 0) > 0 && (
        <div className={cn(
          "absolute -bottom-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
          "bg-gradient-to-r from-amber-500 to-yellow-400 text-black shadow-lg",
          side === 'right' ? '-left-2' : '-right-2'
        )}>
          <Crown className="w-2.5 h-2.5" />
          {player.vipLevel}
        </div>
      )}
    </div>
  );
}

// ── Player Card ──
function PlayerCard({
  player, side, phase, isTeamGame
}: {
  player: PlayerInfo; side: 'left' | 'right'; phase: Phase; isTeamGame?: boolean
}) {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const enterFrom = side === 'left' ? '-translate-x-[120%]' : 'translate-x-[120%]';
  const isVisible = phase !== 'enter' || false;

  return (
    <div
      className={cn(
        "flex items-center gap-3 transition-all duration-700 ease-out",
        side === 'right' && 'flex-row-reverse',
        // Animation
        phase === 'enter' ? enterFrom : 'translate-x-0',
        phase === 'enter' ? 'opacity-0 scale-90' : 'opacity-100 scale-100'
      )}
      style={{
        transitionDelay: side === 'right' ? '150ms' : '0ms',
      }}
    >
      <PlayerAvatar player={player} size={isTeamGame ? 'sm' : 'lg'} side={side} />
      <div className={cn("min-w-0", side === 'right' && 'text-end')}>
        <p className={cn(
          "font-bold truncate max-w-[140px] sm:max-w-[180px]",
          isTeamGame ? 'text-base' : 'text-lg sm:text-xl'
        )}>
          {player.username}
        </p>
        <div className={cn(
          "flex items-center gap-2 text-xs text-white/60",
          side === 'right' && 'justify-end'
        )}>
          <span>{isAr ? 'فوز' : 'Win'}: {getWinRate(player)}</span>
          {player.gamesPlayed != null && player.gamesPlayed > 0 && (
            <span className="text-white/40">({player.gamesPlayed})</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──
export function GameStartCinematic({
  gameType,
  player,
  opponent,
  players,
  teams,
  playerSide,
  spectatorCount = 0,
  onComplete,
}: GameStartCinematicProps) {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const [phase, setPhase] = useState<Phase>('enter');
  const [countdownNum, setCountdownNum] = useState(3);
  const completedRef = useRef(false);
  const particles = useMemo(() => generateParticles(40), []);

  const { data: multiplayerGames = [] } = useQuery<MultiplayerGameFromAPI[]>({
    queryKey: ['/api/multiplayer-games'],
    staleTime: 60000,
  });

  const multiplayerGameConfig = useMemo(
    () => ({ ...FALLBACK_GAME_CONFIG, ...buildGameConfig(multiplayerGames) }),
    [multiplayerGames],
  );

  const isTeamGame = gameType === 'tarneeb' || gameType === 'baloot';
  const gameInfo = resolveGameConfigEntry(multiplayerGameConfig, gameType) || multiplayerGameConfig.chess;

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhase('done');
    setTimeout(onComplete, 300);
  }, [onComplete]);

  // Phase machine
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase 1: enter → cards slide in (0ms start, lasts 800ms)
    cinematicSounds.whoosh();

    // Phase 2: vs → VS appears (800ms)
    timers.push(setTimeout(() => {
      setPhase('vs');
      cinematicSounds.vsImpact();
    }, 800));

    // Phase 3: countdown starts (2000ms)
    timers.push(setTimeout(() => {
      setPhase('countdown');
      setCountdownNum(3);
      cinematicSounds.countdownTick();
    }, 2000));

    // Countdown 2 (2800ms)
    timers.push(setTimeout(() => {
      setCountdownNum(2);
      cinematicSounds.countdownTick();
    }, 2800));

    // Countdown 1 (3600ms)
    timers.push(setTimeout(() => {
      setCountdownNum(1);
      cinematicSounds.countdownTick();
    }, 3600));

    // GO! (4400ms)
    timers.push(setTimeout(() => {
      setPhase('go');
      cinematicSounds.gameStartFanfare();
    }, 4400));

    // Done (5200ms)
    timers.push(setTimeout(finish, 5200));

    return () => timers.forEach(clearTimeout);
  }, [finish]);

  // Allow skip on click/tap
  const handleSkip = useCallback(() => {
    finish();
  }, [finish]);

  if (phase === 'done') return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center overflow-hidden cursor-pointer select-none",
        "transition-opacity duration-300 opacity-100"
      )}
      onClick={handleSkip}
      role="presentation"
      aria-label="Game starting"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950" />

      {/* Radial glow */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(59,130,246,0.3) 0%, rgba(168,85,247,0.15) 40%, transparent 70%)',
        }}
      />

      {/* Animated grid lines */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          animation: 'cinematicGridMove 8s linear infinite',
        }}
      />

      {/* Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `cinematicFloat ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
            transform: `rotate(${p.angle}deg)`,
          }}
        />
      ))}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-4 w-full max-w-2xl">

        {/* Game badge */}
        <div className={cn(
          "flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm",
          "transition-all duration-500",
          phase === 'enter' ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'
        )}>
          <span className={cn("inline-flex items-center justify-center rounded-xl border p-2", getGameIconSurfaceClass(gameInfo))}>
            <GameConfigIcon
              config={gameInfo}
              fallbackIcon={gameInfo.icon}
              className={cn('h-6 w-6', !gameInfo.iconUrl && getGameIconToneClass(gameInfo.color))}
              decorative={false}
              alt={isAr ? gameInfo.nameAr : gameInfo.name}
            />
          </span>
          <span className="text-sm font-medium text-white/80">
            {isAr ? gameInfo.nameAr : gameInfo.name}
          </span>
        </div>

        {/* ── 2-Player Layout (Chess, Backgammon, Domino) ── */}
        {!isTeamGame && (
          <div className="flex items-center justify-center gap-4 sm:gap-8 w-full">
            {/* Left player */}
            <div className="flex-1 flex justify-end">
              <PlayerCard player={player} side="left" phase={phase} />
            </div>

            {/* VS badge */}
            <div className={cn(
              "relative flex items-center justify-center transition-all duration-500",
              phase === 'enter' ? 'scale-0 opacity-0' : '',
              phase === 'vs' ? 'scale-125 opacity-100' : '',
              phase === 'countdown' || phase === 'go' ? 'scale-100 opacity-100' : ''
            )}>
              <div className={cn(
                "w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center",
                "bg-gradient-to-br from-amber-500/90 to-red-500/90",
                "shadow-[0_0_40px_rgba(245,158,11,0.5)]",
                "border-2 border-amber-400/50",
                phase === 'vs' && 'animate-pulse'
              )}>
                <Swords className="w-7 h-7 sm:w-9 sm:h-9 text-white drop-shadow-lg" />
              </div>
              {/* Expanding ring */}
              {phase === 'vs' && (
                <div
                  className="absolute inset-0 rounded-full border-2 border-amber-400/40"
                  style={{ animation: 'cinematicRingExpand 0.8s ease-out forwards' }}
                />
              )}
            </div>

            {/* Right player (opponent) */}
            <div className="flex-1 flex justify-start">
              {opponent && <PlayerCard player={opponent} side="right" phase={phase} />}
            </div>
          </div>
        )}

        {/* ── 4-Player Team Layout (Tarneeb, Baloot) ── */}
        {isTeamGame && teams && (
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Team 1 */}
            <div className={cn(
              "flex items-center justify-center gap-6 px-6 py-3 rounded-2xl",
              "bg-gradient-to-r from-blue-500/15 to-cyan-500/15 border border-blue-500/20",
              "transition-all duration-700",
              phase === 'enter' ? '-translate-y-10 opacity-0' : 'translate-y-0 opacity-100'
            )}>
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                {isAr ? 'الفريق ١' : 'Team 1'}
              </span>
              <div className="flex items-center gap-4">
                {teams[0].map((p, i) => (
                  <PlayerCard key={p.id} player={p} side={i === 0 ? 'left' : 'right'} phase={phase} isTeamGame />
                ))}
              </div>
            </div>

            {/* VS */}
            <div className={cn(
              "relative flex items-center justify-center transition-all duration-500",
              phase === 'enter' ? 'scale-0 opacity-0' : '',
              phase === 'vs' ? 'scale-125 opacity-100' : 'scale-100 opacity-100'
            )}>
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center",
                "bg-gradient-to-br from-amber-500/90 to-red-500/90",
                "shadow-[0_0_30px_rgba(245,158,11,0.4)]",
                "border-2 border-amber-400/50",
                phase === 'vs' && 'animate-pulse'
              )}>
                <Swords className="w-6 h-6 text-white drop-shadow-lg" />
              </div>
              {phase === 'vs' && (
                <div
                  className="absolute inset-0 rounded-full border-2 border-amber-400/40"
                  style={{ animation: 'cinematicRingExpand 0.8s ease-out forwards' }}
                />
              )}
            </div>

            {/* Team 2 */}
            <div className={cn(
              "flex items-center justify-center gap-6 px-6 py-3 rounded-2xl",
              "bg-gradient-to-r from-red-500/15 to-orange-500/15 border border-red-500/20",
              "transition-all duration-700",
              phase === 'enter' ? 'translate-y-10 opacity-0' : 'translate-y-0 opacity-100'
            )}
              style={{ transitionDelay: '150ms' }}
            >
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                {isAr ? 'الفريق ٢' : 'Team 2'}
              </span>
              <div className="flex items-center gap-4">
                {teams[1].map((p, i) => (
                  <PlayerCard key={p.id} player={p} side={i === 0 ? 'left' : 'right'} phase={phase} isTeamGame />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Countdown / GO ── */}
        <div className="h-24 flex items-center justify-center">
          {phase === 'countdown' && (
            <div
              key={countdownNum}
              className="text-7xl sm:text-8xl font-black text-white"
              style={{
                animation: 'cinematicCountdown 0.7s ease-out forwards',
                textShadow: '0 0 40px rgba(59,130,246,0.6), 0 0 80px rgba(59,130,246,0.3)',
              }}
            >
              {countdownNum}
            </div>
          )}
          {phase === 'go' && (
            <div
              className="text-5xl sm:text-7xl font-black uppercase tracking-wider"
              style={{
                animation: 'cinematicGoFlash 0.8s ease-out forwards',
                background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #ef4444)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 0 30px rgba(245,158,11,0.5))',
              }}
            >
              {isAr ? '!ابدأ' : 'GO!'}
            </div>
          )}
        </div>

        {/* Spectator count */}
        {spectatorCount > 0 && (
          <div className={cn(
            "flex items-center gap-1.5 text-xs text-white/40 transition-opacity duration-500",
            phase === 'enter' ? 'opacity-0' : 'opacity-100'
          )}>
            <Eye className="w-3.5 h-3.5" />
            <span>{spectatorCount} {isAr ? 'مشاهد' : 'watching'}</span>
          </div>
        )}

        {/* Skip hint */}
        <p className={cn(
          "text-[11px] text-white/20 transition-opacity duration-1000",
          phase === 'enter' ? 'opacity-0' : 'opacity-100'
        )}>
          {isAr ? 'اضغط للتخطي' : 'Tap to skip'}
        </p>
      </div>

      {/* CSS Keyframes — injected as inline style tag */}
      <style>{`
        @keyframes cinematicFloat {
          0% { transform: translateY(0px) scale(1); opacity: 0.6; }
          100% { transform: translateY(-30px) scale(1.3); opacity: 0.1; }
        }
        @keyframes cinematicGridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(40px, 40px); }
        }
        @keyframes cinematicRingExpand {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes cinematicCountdown {
          0% { transform: scale(2); opacity: 0; }
          30% { transform: scale(1); opacity: 1; }
          80% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }
        @keyframes cinematicGoFlash {
          0% { transform: scale(0.5); opacity: 0; }
          30% { transform: scale(1.2); opacity: 1; }
          60% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
