import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { DominoBoard } from "@/components/games/DominoBoard";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";

export interface DominoBoardMove {
    tileLeft: number;
    tileRight: number;
    placedEnd: "left" | "right";
    isPassed: boolean;
}

export interface DominoTimelineEntry {
    id: string;
    text: string;
    moveNumber?: number;
}

export interface DominoScoreRow {
    id: string;
    label: string;
    score: number;
}

export interface DominoEndgameSummary {
    isFinished: boolean;
    isDraw: boolean;
    reason?: string;
    winnerLabel?: string;
    lowestPips?: number;
    winningTeamPips?: number;
}

interface DominoChallengeContainerProps {
    boardState?: Record<string, unknown>;
    currentTurn?: string;
    isMyTurn: boolean;
    isSpectator: boolean;
    status?: string;
    turnTimeLimitSeconds?: number;
    turnStartedAtMs?: number;
    onMove: (move: DominoBoardMove) => void;
    dominoResyncing: boolean;
    dominoMoveError: string | null;
    timeline: DominoTimelineEntry[];
    scoreRows: DominoScoreRow[];
    endgameSummary: DominoEndgameSummary;
    /** Forwarded to <DominoBoard />; controls the table surface skin. */
    tableStyleId?: string;
}

export function DominoChallengeContainer({
    boardState,
    currentTurn,
    isMyTurn,
    isSpectator,
    status,
    turnTimeLimitSeconds,
    turnStartedAtMs,
    onMove,
    dominoResyncing,
    dominoMoveError,
    tableStyleId,
}: DominoChallengeContainerProps) {
    const { t } = useI18n();
    const [isCompactViewport, setIsCompactViewport] = useState(false);

    useEffect(() => {
        const updateViewport = () => {
            setIsCompactViewport(window.innerWidth < 768);
        };

        updateViewport();
        window.addEventListener("resize", updateViewport);
        return () => window.removeEventListener("resize", updateViewport);
    }, []);

    return (
        <div className={`relative w-full max-w-none mx-auto overflow-hidden rounded-2xl border border-border/60 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.55),transparent_50%),radial-gradient(circle_at_85%_82%,rgba(59,130,246,0.08),transparent_52%),linear-gradient(175deg,rgba(255,255,255,0.35),rgba(15,23,42,0.06))] ${isCompactViewport ? "p-1.5" : "p-2 sm:p-2.5"} shadow-[0_22px_40px_rgba(15,23,42,0.16)]`}>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.2),transparent_35%,transparent_65%,rgba(0,0,0,0.08))]" />
            <div className="pointer-events-none absolute -top-16 -left-14 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-16 h-44 w-44 rounded-full bg-amber-500/10 blur-3xl" />

            <div className={cn(
                "relative mx-auto grid w-full max-w-5xl grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3",
                isCompactViewport ? "items-start" : "items-stretch",
            )}>

                <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.995 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                        "domino-board-shell rounded-2xl border border-border/45 bg-background/55 p-0.5 backdrop-blur-sm",
                        dominoResyncing || dominoMoveError ? "lg:col-span-1" : "lg:col-span-2",
                    )}
                >
                    <DominoBoard
                        gameState={boardState}
                        currentTurn={currentTurn}
                        isMyTurn={isMyTurn}
                        isSpectator={isSpectator}
                        onMove={onMove}
                        status={status}
                        turnTimeLimit={turnTimeLimitSeconds}
                        turnStartedAtMs={turnStartedAtMs}
                        tableStyleId={tableStyleId}
                    />
                </motion.div>

                {(dominoResyncing || dominoMoveError) && (
                    <div className="w-full max-w-lg mx-auto space-y-2 lg:max-w-none lg:self-start">
                        {dominoResyncing && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-center text-primary animate-pulse shadow-[0_8px_16px_rgba(59,130,246,0.16)]"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    {t("common.reconnecting")}
                                </span>
                            </motion.div>
                        )}
                        {dominoMoveError && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive text-center shadow-[0_8px_16px_rgba(239,68,68,0.12)]"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {dominoMoveError}
                                </span>
                            </motion.div>
                        )}
                    </div>
                )}

                {/* Keep one unified board surface for play/watch; details are rendered in the shared side rails. */}
            </div>
        </div>
    );
}
