import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Clock, Send, Trophy } from "lucide-react";

interface LanguageDuelBoardProps {
    playerView: Record<string, unknown> | null;
    isSpectator: boolean;
    canPlay: boolean;
    onSubmitAnswer?: (answerText: string, responseMs: number) => void;
}

function toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export default function LanguageDuelBoard({
    playerView,
    isSpectator,
    canPlay,
    onSubmitAnswer,
}: LanguageDuelBoardProps) {
    const { t } = useI18n();
    const [answerText, setAnswerText] = useState("");
    const turnStartRef = useRef<number>(Date.now());

    const roundNumber = toNumber(playerView?.roundNumber, 1);
    const pointsToWin = toNumber(playerView?.pointsToWin, 10);
    const mode = typeof playerView?.mode === "string" ? playerView.mode : "mixed";
    const modeLabel = mode === "typed"
        ? t("languageduel.mode.typed")
        : mode === "spoken"
            ? t("languageduel.mode.spoken")
            : t("languageduel.mode.mixed");
    const isMyTurn = Boolean(playerView?.isMyTurn) && canPlay && !isSpectator;
    const prompt = (playerView?.prompt && typeof playerView.prompt === "object")
        ? playerView.prompt as { id?: unknown; word?: unknown }
        : undefined;
    const promptId = typeof prompt?.id === "string" ? prompt.id : "";
    const promptWord = typeof prompt?.word === "string" ? prompt.word : "";
    const nativeLanguageCode = typeof playerView?.nativeLanguageCode === "string" ? playerView.nativeLanguageCode : "ar";
    const targetLanguageCode = typeof playerView?.targetLanguageCode === "string" ? playerView.targetLanguageCode : "en";

    const scoreRows = useMemo(() => {
        const scores = playerView?.scores;
        if (!scores || typeof scores !== "object") {
            return [] as Array<{ playerId: string; score: number }>;
        }

        return Object.entries(scores as Record<string, unknown>)
            .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
            .map(([playerId, score]) => ({ playerId, score: Number(score) }))
            .sort((a, b) => b.score - a.score);
    }, [playerView?.scores]);

    const mySubmission = playerView?.mySubmission && typeof playerView.mySubmission === "object"
        ? playerView.mySubmission as { accuracy?: unknown; responseMs?: unknown; timedOut?: unknown }
        : null;

    const opponentSubmission = playerView?.opponentSubmission && typeof playerView.opponentSubmission === "object"
        ? playerView.opponentSubmission as { accuracy?: unknown; responseMs?: unknown; timedOut?: unknown }
        : null;

    useEffect(() => {
        setAnswerText("");
        turnStartRef.current = Date.now();
    }, [promptId, roundNumber, playerView?.currentTurn]);

    const handleSubmit = () => {
        if (!isMyTurn || !onSubmitAnswer) {
            return;
        }

        const trimmed = answerText.trim();
        if (!trimmed) {
            return;
        }

        const elapsedMs = Math.max(0, Date.now() - turnStartRef.current);
        onSubmitAnswer(trimmed, elapsedMs);
        setAnswerText("");
    };

    return (
        <Card className="w-full max-w-lg border-primary/20 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{t("languageduel.title")}</CardTitle>
                    <Badge variant={isMyTurn ? "default" : "secondary"}>
                        {isMyTurn ? t("domino.yourTurn") : (isSpectator ? t("catalog.spectators") : t("challenge.waitingResponse"))}
                    </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{t("tarneeb.round")} #{roundNumber}</span>
                    <span>•</span>
                    <span>{t("baloot.targetPoints")}: {pointsToWin}</span>
                    <span>•</span>
                    <span>{t("languageduel.mode")}: {modeLabel}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{t("settings.language")}: {nativeLanguageCode}</span>
                    <span>→</span>
                    <span>{t("admin.announcements.columnTarget")}: {targetLanguageCode}</span>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="rounded-xl border bg-muted/25 p-3">
                    <p className="text-xs text-muted-foreground">{t("languageduel.currentPrompt")}</p>
                    <p className="mt-1 text-xl font-semibold">{promptWord || "—"}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {scoreRows.map((row) => (
                        <div key={row.playerId} className="rounded-lg border bg-card px-3 py-2">
                            <p className="truncate text-[11px] text-muted-foreground">{row.playerId}</p>
                            <p className="mt-1 flex items-center gap-1 text-base font-semibold">
                                <Trophy className="h-4 w-4 text-amber-500" />
                                {row.score}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="rounded-lg border bg-card/60 p-3 text-sm">
                    {mySubmission ? (
                        <div className="space-y-1">
                            <p className="font-medium">{t("languageduel.yourSubmission")}</p>
                            <p className="text-xs text-muted-foreground">
                                {t("languageduel.accuracy")}: {toNumber(mySubmission.accuracy)}% •
                                {" "}
                                <Clock className="inline h-3 w-3" /> {Math.round(toNumber(mySubmission.responseMs) / 1000)}s
                            </p>
                        </div>
                    ) : (
                        <p className="text-muted-foreground">{t("challenge.waitingResponse")}</p>
                    )}

                    {opponentSubmission && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t("languageduel.opponentSubmissionAvailable")}
                        </p>
                    )}
                </div>

                {!isSpectator && (
                    <div className="flex items-center gap-2">
                        <Input
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                            placeholder={t("chat.typeMessage")}
                            disabled={!isMyTurn}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                        />
                        <Button type="button" onClick={handleSubmit} disabled={!isMyTurn || !answerText.trim()}>
                            <Send className="h-4 w-4 me-1" />
                            {t("common.submit")}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
