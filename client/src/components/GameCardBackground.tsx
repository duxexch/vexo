import { cn } from "@/lib/utils";
import type { GameConfigItem } from "@/lib/game-config";

type GameCardBackgroundProps = {
  config?: Pick<GameConfigItem, "thumbnailUrl" | "gradient"> | null;
  /**
   * `lobby` (default) — soft top-down overlay used on lobby/catalog cards so the
   * thumbnail is decorative and content stays readable.
   * `solid` — fully opaque gradient when no thumbnail (used on simple cards).
   */
  variant?: "lobby" | "solid";
  /** Optional opacity override for the gradient when no thumbnail is available */
  gradientOpacityClass?: string;
  className?: string;
};

/**
 * Shared background layer for any card that represents a game.
 *
 * Renders the admin-uploaded `thumbnailUrl` as a full-bleed image with a
 * darkened overlay, or falls back to the configured `gradient`. Keeps the
 * thumbnail+overlay convention identical across lobby, catalog, and any
 * future surface that displays a game card. Always render this BEFORE the
 * card content (siblings, not children) so it sits behind the foreground.
 *
 * Intended placement: inside a `relative overflow-hidden` parent.
 */
export function GameCardBackground({
  config,
  variant = "lobby",
  gradientOpacityClass,
  className,
}: GameCardBackgroundProps) {
  const thumbnailUrl = config?.thumbnailUrl;
  const gradient = config?.gradient || "from-muted/20 to-muted/10";
  const fallbackOpacity =
    gradientOpacityClass || (variant === "solid" ? "opacity-60" : "opacity-50");

  return (
    <>
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            className,
          )}
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "absolute inset-0",
          thumbnailUrl
            ? "bg-gradient-to-t from-background/90 via-background/55 to-background/20"
            : `bg-gradient-to-br ${gradient} ${fallbackOpacity}`,
        )}
      />
    </>
  );
}
