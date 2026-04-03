import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DominoBoard } from "@/components/games/DominoBoard";
import { useI18n } from "@/lib/i18n";
import { Activity, BarChart3, Clock3 } from "lucide-react";

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

    return (
        <div className="w-full max-w-5xl mx-auto space-y-3">
            <DominoBoard
                gameState={boardState}
                currentTurn={currentTurn}
                isMyTurn={isMyTurn}
                isSpectator={isSpectator}
                onMove={onMove}
                status={status}
            />

            {(dominoResyncing || dominoMoveError) && (
                <div className="w-full max-w-lg mx-auto space-y-2">
                    {dominoResyncing && (
                        <div className="text-xs text-center text-muted-foreground">
                            {t("common.reconnecting")}
                        </div>
                    )}
                    {dominoMoveError && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
                            {dominoMoveError}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Card className="border-muted/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            {t("domino.recentActivity")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {timeline.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t("domino.lastMove")}</p>
                        ) : (
                            timeline.map((entry) => (
                                <div key={entry.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                                    <span className="text-xs sm:text-sm text-foreground/90">{entry.text}</span>
                                    {typeof entry.moveNumber === "number" && entry.moveNumber > 0 && (
                                        <Badge variant="outline" className="text-[10px] h-5">
                                            <Clock3 className="h-3 w-3 me-1" />
                                            {entry.moveNumber}
                                        </Badge>
                                    )}
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="border-muted/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            {t("domino.score")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {endgameSummary.isFinished && (
                            <div className="space-y-1">
                                <Badge variant="secondary" className="text-xs">
                                    {t("domino.gameOver")}
                                </Badge>
                                <div className="text-xs sm:text-sm">
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
                            scoreRows.map((row) => (
                                <div key={row.id} className="flex items-center justify-between rounded-md border px-2 py-1.5">
                                    <span className="text-xs sm:text-sm text-muted-foreground">{row.label}</span>
                                    <span className="text-xs sm:text-sm font-semibold">{row.score}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-muted-foreground">{t("domino.score")}</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
