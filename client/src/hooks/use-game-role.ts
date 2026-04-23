import { useMemo } from "react";
import { useAuth } from "@/lib/auth";

export type GameRole = "player" | "spectator" | "guest" | "unknown";

export interface GameRoleCapabilities {
  role: GameRole;
  isResolved: boolean;
  isPlayer: boolean;
  isSpectator: boolean;
  isGuest: boolean;
  isUnknown: boolean;
  canMove: boolean;
  canChat: boolean;
  canTip: boolean;
  canGift: boolean;
  canEmote: boolean;
  canSpectate: boolean;
  canLeave: boolean;
}

interface ParticipantLike {
  userId?: string | null;
  id?: string | null;
}

interface UseGameRoleArgs {
  participants?: Array<ParticipantLike | string | null | undefined>;
  /** Hard override: if provided, takes precedence (e.g. server-confirmed role from match payload). */
  overrideRole?: GameRole;
  /**
   * Whether the participants list has been resolved from the server.
   * Defaults to `participants !== undefined`. When false, role is "unknown"
   * and capabilities are conservative (everything disabled) to prevent
   * premature exposure during websocket-authoritative bootstrapping.
   */
  resolved?: boolean;
}

function normalizeId(p: ParticipantLike | string | null | undefined): string | undefined {
  if (!p) return undefined;
  if (typeof p === "string") return p;
  return (p.userId ?? p.id ?? undefined) || undefined;
}

export function useGameRole(args: UseGameRoleArgs = {}): GameRoleCapabilities {
  const { participants, overrideRole, resolved } = args;
  const { user } = useAuth();
  const meId = user?.id;
  const isResolved = resolved ?? participants !== undefined;

  return useMemo(() => {
    let role: GameRole;
    if (overrideRole) {
      role = overrideRole;
    } else if (!isResolved) {
      role = "unknown";
    } else if (!meId) {
      role = "guest";
    } else {
      const participantIds = (participants ?? []).map(normalizeId).filter((v): v is string => Boolean(v));
      role = participantIds.includes(meId) ? "player" : "spectator";
    }

    const isPlayer = role === "player";
    const isSpectator = role === "spectator";
    const isGuest = role === "guest";
    const isUnknown = role === "unknown";

    // While role is unknown, lock all capabilities to prevent premature exposure
    // during websocket-authoritative bootstrapping.
    return {
      role,
      isResolved: !isUnknown,
      isPlayer,
      isSpectator,
      isGuest,
      isUnknown,
      canMove: isPlayer,
      canChat: !isGuest && !isUnknown,
      canTip: isSpectator,
      canGift: !isGuest && !isUnknown,
      canEmote: isPlayer,
      canSpectate: !isGuest && !isUnknown,
      canLeave: !isGuest && !isUnknown,
    };
  }, [meId, participants, overrideRole, isResolved]);
}
