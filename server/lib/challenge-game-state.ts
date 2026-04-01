export function normalizeChallengeGameState(rawState: unknown): string | null {
    if (typeof rawState === "string") {
        const trimmed = rawState.trim();
        if (!trimmed) return null;

        try {
            const parsed = JSON.parse(trimmed);

            if (typeof parsed === "string") {
                const nested = parsed.trim();
                if (!nested || (nested[0] !== "{" && nested[0] !== "[")) {
                    return null;
                }

                JSON.parse(nested);
                return nested;
            }

            if (parsed && typeof parsed === "object") {
                return JSON.stringify(parsed);
            }

            return null;
        } catch {
            return null;
        }
    }

    if (rawState && typeof rawState === "object") {
        try {
            return JSON.stringify(rawState);
        } catch {
            return null;
        }
    }

    return null;
}

export function isChallengeSessionPlayableStatus(status: unknown): boolean {
    const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
    return normalized === "playing" || normalized === "in_progress" || normalized === "active";
}

export function isChallengeSessionFinalStatus(status: unknown): boolean {
    const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
    return normalized === "finished" || normalized === "completed" || normalized === "cancelled" || normalized === "abandoned";
}
