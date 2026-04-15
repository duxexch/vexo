import type { LucideIcon } from "lucide-react";
import { Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface GameFullscreenActionItem {
    id: string;
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    tone?: "primary" | "outline" | "destructive";
    badge?: string | number | null;
}

interface GameFullscreenActionDockProps {
    active: boolean;
    actions: GameFullscreenActionItem[];
    onExit: () => void;
    exitLabel: string;
    dir: "ltr" | "rtl";
}

function resolveActionClassName(tone: GameFullscreenActionItem["tone"]) {
    if (tone === "primary") {
        return "vex-arcade-fab border-primary/50";
    }

    if (tone === "destructive") {
        return "border-destructive/45 bg-destructive/15 text-destructive hover:bg-destructive/20";
    }

    return "vex-arcade-fab-outline border-primary/35 bg-background/90";
}

export function GameFullscreenActionDock({
    active,
    actions,
    onExit,
    exitLabel,
    dir,
}: GameFullscreenActionDockProps) {
    if (!active) {
        return null;
    }

    return (
        <>
            <div
                className={cn(
                    "pointer-events-none fixed top-[max(0.6rem,env(safe-area-inset-top))] z-[130]",
                    dir === "rtl" ? "left-3" : "right-3",
                )}
            >
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={onExit}
                    className="pointer-events-auto h-11 w-11 rounded-full vex-arcade-fab-outline border-primary/35 bg-background/90"
                    data-testid="button-game-fullscreen-exit"
                    title={exitLabel}
                >
                    <Minimize2 className="h-4 w-4" />
                    <span className="sr-only">{exitLabel}</span>
                </Button>
            </div>

            <div className="pointer-events-none fixed bottom-[max(0.8rem,env(safe-area-inset-bottom))] left-1/2 z-[125] w-[min(96vw,34rem)] -translate-x-1/2 px-2 sm:px-3">
                <div className="vex-game-fullscreen-dock pointer-events-auto flex items-center gap-2 overflow-x-auto rounded-2xl border border-primary/30 bg-background/75 px-2 py-2 shadow-xl backdrop-blur-xl">
                    {actions.map((action) => {
                        const ActionIcon = action.icon;
                        return (
                            <Button
                                key={action.id}
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={action.onClick}
                                disabled={action.disabled}
                                className={cn(
                                    "relative h-11 w-11 shrink-0 rounded-full p-0",
                                    resolveActionClassName(action.tone),
                                )}
                                data-testid={`button-game-fullscreen-action-${action.id}`}
                                title={action.label}
                            >
                                <ActionIcon className="h-4 w-4" />
                                <span className="sr-only">{action.label}</span>
                                {action.badge !== null &&
                                    action.badge !== undefined &&
                                    String(action.badge).length > 0 && (
                                        <span className="absolute -end-1 -top-1 min-w-[1.1rem] rounded-full bg-primary px-1 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                                            {action.badge}
                                        </span>
                                    )}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
