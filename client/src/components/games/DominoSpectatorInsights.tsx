import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useI18n } from "@/lib/i18n";
import type { DominoEndgameSummary, DominoScoreRow, DominoTimelineEntry } from "@/components/games/DominoChallengeContainer";
import { Activity, Crown, Eye, Hourglass, Trophy } from "lucide-react";

interface PlayerInfo {
    id: string;
    username: string;
    avatarUrl?: string;
}

interface DominoSpectatorInsightsProps {
    spectatorCount: number;
    totalMoves?: number;
    currentTurn?: string;
    gameStatus?: string;
    boardState?: Record<string, unknown>;
    player1?: PlayerInfo;
    player2?: PlayerInfo;
    timeline: DominoTimelineEntry[];
    scoreRows: DominoScoreRow[];
    endgameSummary: DominoEndgameSummary;
    dominoResyncing: boolean;
    dominoMoveError: string | null;
}

export function DominoSpectatorInsights({
    spectatorCount,
    totalMoves,
    currentTurn,
    gameStatus,
    boardState,
    player1,
    player2,
    timeline,
    scoreRows,
    endgameSummary,
    dominoResyncing,
    dominoMoveError,
}: DominoSpectatorInsightsProps) {
    const { t, language } = useI18n();

    const boardTilesCount = useMemo(() => {
        const boardTiles = boardState?.boardTiles;
        return Array.isArray(boardTiles) ? boardTiles.length : 0;
    }, [boardState]);

    const activePlayerId = currentTurn || "";
    const topScores = scoreRows.slice(0, 4);
    const leader = topScores[0];
    const runnerUp = topScores[1];
    const scoreGap = leader && runnerUp ? Math.max(0, leader.score - runnerUp.score) : 0;
    const latestTimeline = timeline.slice(0, 6);

    const playerCards: PlayerInfo[] = [player1, player2].filter((player): player is PlayerInfo => Boolean(player));

    return (
        <div className="domino-spectator-insights border-b border-border/70 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.14),transparent_52%),linear-gradient(165deg,rgba(255,255,255,0.6),rgba(15,23,42,0.06))] p-3">
            <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/70 bg-background/75 px-2 py-1.5 text-center shadow-sm">
                    <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        <span>{language === "ar" ? "المشاهدون" : "Viewers"}</span>
                    </div>
                    <div className="text-sm font-semibold">{spectatorCount}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/75 px-2 py-1.5 text-center shadow-sm">
                    <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Hourglass className="h-3 w-3" />
                        <span>{language === "ar" ? "الحركات" : "Moves"}</span>
                    </div>
                    <div className="text-sm font-semibold">{totalMoves ?? 0}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/75 px-2 py-1.5 text-center shadow-sm">
                    <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Activity className="h-3 w-3" />
                        <span>{t("domino.tiles")}</span>
                    </div>
                    <div className="text-sm font-semibold">{boardTilesCount}</div>
                </div>
            </div>

            {playerCards.length > 0 && (
                <div className="mb-3 grid grid-cols-1 gap-2">
                    {playerCards.map((player) => {
                        const isActive = activePlayerId === player.id && gameStatus === "playing";
                        return (
                            <div
                                key={player.id}
                                className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/75 px-2.5 py-2 shadow-sm"
                            >
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={player.avatarUrl} />
                                    <AvatarFallback>{player.username?.[0]?.toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{player.username}</p>
                                </div>
                                {isActive && (
                                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <ScrollArea className="max-h-56 lg:max-h-[30vh] pr-1">
                <div className="space-y-2.5">
                    <Card className="border-border/70 bg-card/85 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs flex items-center gap-1.5">
                                <Crown className="h-3.5 w-3.5 text-amber-500" />
                                {t("domino.score")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {topScores.length > 0 ? (
                                topScores.map((row, index) => {
                                    const scaleBase = leader?.score || 1;
                                    const width = `${Math.max(10, Math.min(100, (row.score / scaleBase) * 100))}%`;
                                    return (
                                        <div key={row.id} className="rounded-lg border border-border/60 bg-background/70 px-2 py-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate text-xs text-muted-foreground">{row.label}</span>
                                                <span className="text-xs font-semibold">{row.score}</span>
                                            </div>
                                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                                                <div
                                                    className="h-full rounded-full bg-[linear-gradient(90deg,rgba(59,130,246,0.6),rgba(14,165,233,0.95))] transition-all duration-500"
                                                    style={{ width }}
                                                />
                                            </div>
                                            {index === 0 && scoreGap > 0 && (
                                                <div className="mt-1 text-[10px] text-primary">+{scoreGap}</div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-xs text-muted-foreground">{t("domino.score")}</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-card/85 shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs flex items-center gap-1.5">
                                <Activity className="h-3.5 w-3.5" />
                                {t("domino.recentActivity")}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1.5">
                            {latestTimeline.length > 0 ? (
                                latestTimeline.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1.5">
                                        <span className="line-clamp-1 text-xs text-foreground/90">{entry.text}</span>
                                        {typeof entry.moveNumber === "number" && entry.moveNumber > 0 && (
                                            <Badge variant="outline" className="h-4 text-[10px]">{entry.moveNumber}</Badge>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-muted-foreground">{t("domino.lastMove")}</p>
                            )}
                        </CardContent>
                    </Card>

                    {(dominoResyncing || dominoMoveError || endgameSummary.isFinished) && (
                        <Card className="border-border/70 bg-card/85 shadow-sm">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs flex items-center gap-1.5">
                                    <Trophy className="h-3.5 w-3.5" />
                                    {t("domino.gameOver")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1.5 text-xs">
                                {dominoResyncing && <div className="text-primary">{t("common.reconnecting")}</div>}
                                {dominoMoveError && <div className="text-destructive">{dominoMoveError}</div>}
                                {endgameSummary.isFinished && (
                                    <>
                                        <div className="font-medium">
                                            {endgameSummary.isDraw ? t("domino.itsADraw") : endgameSummary.winnerLabel}
                                        </div>
                                        {endgameSummary.reason === "blocked" && (
                                            <div className="text-muted-foreground">{t("domino.blocked")}</div>
                                        )}
                                        {typeof endgameSummary.winningTeamPips === "number" && (
                                            <div className="text-muted-foreground">{t("domino.score")}: {endgameSummary.winningTeamPips}</div>
                                        )}
                                        {typeof endgameSummary.lowestPips === "number" && typeof endgameSummary.winningTeamPips !== "number" && (
                                            <div className="text-muted-foreground">{t("domino.score")}: {endgameSummary.lowestPips}</div>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
