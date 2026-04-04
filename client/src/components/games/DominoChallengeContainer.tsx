import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DominoBoard } from "@/components/games/DominoBoard";
import { useI18n } from "@/lib/i18n";
import { Activity, AlertTriangle, BarChart3, Clock3, RefreshCw, Trophy } from "lucide-react";

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
    onMove: (move: DominoBoardMove) => void;
    dominoResyncing: boolean;
    dominoMoveError: string | null;
    timeline: DominoTimelineEntry[];
    scoreRows: DominoScoreRow[];
    endgameSummary: DominoEndgameSummary;
}

export function DominoChallengeContainer({
    boardState,
    currentTurn,
    isMyTurn,
    isSpectator,
    status,
    onMove,
    dominoResyncing,
    dominoMoveError,
    timeline,
    scoreRows,
    endgameSummary,
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

    const strongestScore = useMemo(() => {
        const maxScore = scoreRows.reduce((max, row) => Math.max(max, row.score), 0);
        return maxScore > 0 ? maxScore : 1;
    }, [scoreRows]);
    const boardStats = useMemo(() => {
        const safeState = boardState && typeof boardState === "object" ? (boardState as Record<string, unknown>) : null;
        const rawTiles = safeState?.boardTiles;
        const rawBoneyard = safeState?.boneyard;

        const boardTileCount = Array.isArray(rawTiles) ? rawTiles.length : 0;
        const boneyardCount = typeof rawBoneyard === "number" ? rawBoneyard : Array.isArray(rawBoneyard) ? rawBoneyard.length : 0;

        return { boardTileCount, boneyardCount };
    }, [boardState]);

    return (
        <div className={`relative w-full max-w-5xl mx-auto overflow-hidden rounded-2xl border border-border/60 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.55),transparent_50%),radial-gradient(circle_at_85%_82%,rgba(59,130,246,0.08),transparent_52%),linear-gradient(175deg,rgba(255,255,255,0.35),rgba(15,23,42,0.06))] ${isCompactViewport ? "p-2" : "p-2.5 sm:p-3.5"} shadow-[0_22px_40px_rgba(15,23,42,0.16)]`}>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.2),transparent_35%,transparent_65%,rgba(0,0,0,0.08))]" />
            <div className="pointer-events-none absolute -top-16 -left-14 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-16 h-44 w-44 rounded-full bg-amber-500/10 blur-3xl" />

            <div className={`relative ${isCompactViewport ? "space-y-2" : "space-y-4"}`}>
                {!isCompactViewport && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="grid grid-cols-3 gap-2"
                    >
                        <div className="domino-kpi-pill rounded-xl border border-border/65 bg-background/75 px-2 py-1.5 text-center animate-domino-chip-rise">
                            <div className="text-[10px] sm:text-xs text-muted-foreground">{t("domino.tiles")}</div>
                            <div className="text-sm sm:text-base font-semibold">{boardStats.boardTileCount}</div>
                        </div>
                        <div className="domino-kpi-pill rounded-xl border border-primary/25 bg-primary/10 px-2 py-1.5 text-center animate-domino-chip-rise [animation-delay:70ms]">
                            <div className="text-[10px] sm:text-xs text-primary/80">{t("domino.draw")}</div>
                            <div className="text-sm sm:text-base font-semibold text-primary">{boardStats.boneyardCount}</div>
                        </div>
                        <div className="domino-kpi-pill rounded-xl border border-border/65 bg-background/75 px-2 py-1.5 text-center animate-domino-chip-rise [animation-delay:140ms]">
                            <div className="text-[10px] sm:text-xs text-muted-foreground">{t("domino.recentActivity")}</div>
                            <div className="text-sm sm:text-base font-semibold">{timeline.length}</div>
                        </div>
                    </motion.div>
                )}

                <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.995 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                    className="domino-board-shell rounded-2xl border border-border/45 bg-background/55 p-1 backdrop-blur-sm"
                >
                    <DominoBoard
                        gameState={boardState}
                        currentTurn={currentTurn}
                        isMyTurn={isMyTurn}
                        isSpectator={isSpectator}
                        onMove={onMove}
                        status={status}
                    />
                </motion.div>

                {(dominoResyncing || dominoMoveError) && (
                    <div className="w-full max-w-lg mx-auto space-y-2">
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

                {isCompactViewport ? (
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-border/65 bg-background/70 px-2 py-1 text-center">
                            <p className="text-[10px] text-muted-foreground">{t("domino.recentActivity")}</p>
                            <p className="text-xs font-semibold">{timeline.length}</p>
                        </div>
                        <div className="rounded-xl border border-border/65 bg-background/70 px-2 py-1 text-center">
                            <p className="text-[10px] text-muted-foreground">{t("domino.score")}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{scoreRows[0]?.label || "-"}</p>
                            <p className="text-xs font-semibold">{scoreRows[0]?.score ?? "-"}</p>
                        </div>
                        <div className="rounded-xl border border-border/65 bg-background/70 px-2 py-1 text-center">
                            <p className="text-[10px] text-muted-foreground">{t("domino.tiles")}</p>
                            <p className="text-xs font-semibold">{boardStats.boardTileCount}</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.24, delay: 0.08 }}
                        >
                            <Card className="domino-insight-card border-muted/60 bg-card/80 shadow-[0_14px_26px_rgba(15,23,42,0.13)] backdrop-blur-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <Activity className="h-4 w-4" />
                                        {t("domino.recentActivity")}
                                        <Badge variant="outline" className="ms-auto text-[10px] h-5 border-primary/25 bg-primary/5">
                                            {timeline.length}
                                        </Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {timeline.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">{t("domino.lastMove")}</p>
                                    ) : (
                                        timeline.map((entry, index) => (
                                            <motion.div
                                                key={entry.id}
                                                initial={{ opacity: 0, x: -6 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.2, delay: index * 0.03 }}
                                                className="domino-timeline-row group flex items-center justify-between rounded-xl border border-border/65 bg-background/65 px-3 py-2 animate-domino-fade-in transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
                                            >
                                                <span className="text-xs sm:text-sm text-foreground/90 group-hover:text-foreground">{entry.text}</span>
                                                {typeof entry.moveNumber === "number" && entry.moveNumber > 0 && (
                                                    <Badge variant="outline" className="text-[10px] h-5 border-primary/30 bg-primary/5">
                                                        <Clock3 className="h-3 w-3 me-1" />
                                                        {entry.moveNumber}
                                                    </Badge>
                                                )}
                                            </motion.div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.24, delay: 0.12 }}
                        >
                            <Card className="domino-insight-card border-muted/60 bg-card/80 shadow-[0_14px_26px_rgba(15,23,42,0.13)] backdrop-blur-sm">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <BarChart3 className="h-4 w-4" />
                                        {t("domino.score")}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2.5">
                                    {endgameSummary.isFinished && (
                                        <div className="space-y-1.5 rounded-xl border border-border/65 bg-background/60 px-3 py-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <Badge variant="secondary" className="text-xs">
                                                    {t("domino.gameOver")}
                                                </Badge>
                                                <Trophy className="h-4 w-4 text-amber-500" />
                                            </div>
                                            <div className="text-xs sm:text-sm font-medium">
                                                {endgameSummary.isDraw ? t("domino.itsADraw") : endgameSummary.winnerLabel}
                                            </div>
                                            {endgameSummary.reason === "blocked" && (
                                                <div className="text-xs text-muted-foreground">{t("domino.blocked")}</div>
                                            )}
                                            {typeof endgameSummary.winningTeamPips === "number" && (
                                                <div className="text-xs text-muted-foreground">
                                                    {t("domino.score")}: {endgameSummary.winningTeamPips}
                                                </div>
                                            )}
                                            {typeof endgameSummary.lowestPips === "number" && typeof endgameSummary.winningTeamPips !== "number" && (
                                                <div className="text-xs text-muted-foreground">
                                                    {t("domino.score")}: {endgameSummary.lowestPips}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {scoreRows.length > 0 ? (
                                        scoreRows.map((row, index) => {
                                            const relativeWidth = `${Math.max(10, Math.min(100, (row.score / strongestScore) * 100))}%`;
                                            return (
                                                <motion.div
                                                    key={row.id}
                                                    initial={{ opacity: 0, x: 8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ duration: 0.22, delay: index * 0.04 }}
                                                    className="domino-score-row space-y-1.5 rounded-xl border border-border/65 bg-background/65 px-3 py-2 animate-domino-fade-in"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs sm:text-sm text-muted-foreground">{row.label}</span>
                                                        <span className="text-xs sm:text-sm font-semibold">{row.score}</span>
                                                    </div>
                                                    <div className="h-1.5 w-full rounded-full bg-muted/80 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-[linear-gradient(90deg,rgba(59,130,246,0.55),rgba(14,165,233,0.85))] shadow-[0_0_8px_rgba(14,165,233,0.45)] transition-all duration-500"
                                                            style={{ width: relativeWidth }}
                                                        />
                                                    </div>
                                                </motion.div>
                                            );
                                        })
                                    ) : (
                                        <p className="text-xs text-muted-foreground">{t("domino.score")}</p>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                )}
            </div>
        </div>
    );
}
