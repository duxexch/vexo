import { useCallback, useEffect, useRef, useState } from "react";

const BODY_FULLSCREEN_FLAG = "data-vex-game-fullscreen";
const FULLSCREEN_HISTORY_GUARD_KEY = "__vex_game_fullscreen_guard__";

function asHistoryStateObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    return value as Record<string, unknown>;
}

function isContainerInFullscreen(container: HTMLDivElement | null): boolean {
    if (typeof document === "undefined") return false;
    if (!container || !document.fullscreenElement) return false;

    return (
        document.fullscreenElement === container ||
        container.contains(document.fullscreenElement)
    );
}

export function useGameFullscreen() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
    const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false);
    const hasHistoryGuardRef = useRef(false);
    const skipNextPopstateRef = useRef(false);

    const syncNativeFullscreenState = useCallback(() => {
        setIsNativeFullscreen(isContainerInFullscreen(containerRef.current));
    }, []);

    useEffect(() => {
        if (typeof document === "undefined") return;

        syncNativeFullscreenState();

        const handleFullscreenChange = () => {
            syncNativeFullscreenState();
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, [syncNativeFullscreenState]);

    useEffect(() => {
        if (isNativeFullscreen) {
            setIsFallbackFullscreen(false);
        }
    }, [isNativeFullscreen]);

    useEffect(() => {
        if (!isFallbackFullscreen || typeof window === "undefined") return;

        const handleKeydown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsFallbackFullscreen(false);
            }
        };

        window.addEventListener("keydown", handleKeydown);
        return () => {
            window.removeEventListener("keydown", handleKeydown);
        };
    }, [isFallbackFullscreen]);

    const enterFullscreen = useCallback(async () => {
        const element = containerRef.current;
        if (!element || typeof document === "undefined") {
            return;
        }

        const requestFullscreen = element.requestFullscreen?.bind(element);
        if (requestFullscreen && (document.fullscreenEnabled ?? true)) {
            try {
                await requestFullscreen();
                setIsFallbackFullscreen(false);
                return;
            } catch {
                // Fall back to fixed immersive mode below.
            }
        }

        setIsFallbackFullscreen(true);
    }, []);

    const exitFullscreen = useCallback(async () => {
        setIsFallbackFullscreen(false);

        if (typeof document === "undefined") return;
        if (!document.fullscreenElement) return;

        try {
            await document.exitFullscreen();
        } catch {
            // No-op: keep UI responsive even if browser rejects exit request.
        }
    }, []);

    const isFullscreen = isNativeFullscreen || isFallbackFullscreen;

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handlePopstate = () => {
            if (skipNextPopstateRef.current) {
                skipNextPopstateRef.current = false;
                return;
            }

            if (!isFullscreen) return;

            void exitFullscreen();
        };

        window.addEventListener("popstate", handlePopstate);
        return () => {
            window.removeEventListener("popstate", handlePopstate);
        };
    }, [exitFullscreen, isFullscreen]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const currentState = asHistoryStateObject(window.history.state);

        if (isFullscreen) {
            if (!currentState[FULLSCREEN_HISTORY_GUARD_KEY]) {
                try {
                    window.history.pushState(
                        {
                            ...currentState,
                            [FULLSCREEN_HISTORY_GUARD_KEY]: true,
                        },
                        "",
                        window.location.href,
                    );
                } catch {
                    // Ignore browser history restrictions and keep fullscreen usable.
                }
            }

            hasHistoryGuardRef.current = true;
            return;
        }

        if (!hasHistoryGuardRef.current) {
            return;
        }

        const stateAfterExit = asHistoryStateObject(window.history.state);
        if (stateAfterExit[FULLSCREEN_HISTORY_GUARD_KEY]) {
            skipNextPopstateRef.current = true;
            window.history.back();
        }

        hasHistoryGuardRef.current = false;
    }, [isFullscreen]);

    const toggleFullscreen = useCallback(async () => {
        if (isFullscreen) {
            await exitFullscreen();
            return;
        }

        await enterFullscreen();
    }, [enterFullscreen, exitFullscreen, isFullscreen]);

    useEffect(() => {
        if (typeof document === "undefined") return;

        if (isFullscreen) {
            document.body.setAttribute(BODY_FULLSCREEN_FLAG, "on");
        } else {
            document.body.removeAttribute(BODY_FULLSCREEN_FLAG);
        }

        return () => {
            document.body.removeAttribute(BODY_FULLSCREEN_FLAG);
        };
    }, [isFullscreen]);

    return {
        containerRef,
        isFullscreen,
        isNativeFullscreen,
        supportsNativeFullscreen:
            typeof document !== "undefined" &&
            typeof document.exitFullscreen === "function",
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen,
    };
}
