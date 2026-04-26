/**
 * Shared, framework-agnostic helper that classifies a tournament's
 * registration window into one of four explicit states. Both the client
 * UI and any future server-side renderer can use it so the displayed
 * call-to-action is always consistent with the gating logic in
 * `isTournamentRegistrationOpen`.
 */

export type TournamentRegistrationState =
  | "open"
  | "opens-soon"
  | "closed"
  | "full";

export interface TournamentRegistrationStateInput {
  status: string;
  registrationStartsAt?: string | Date | null;
  registrationEndsAt?: string | Date | null;
  startsAt?: string | Date | null;
  participantCount?: number | null;
  maxPlayers?: number | null;
}

function toMillis(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(millis) ? null : millis;
}

export function getTournamentRegistrationState(
  tournament: TournamentRegistrationStateInput,
  now: number = Date.now(),
): TournamentRegistrationState {
  const status = String(tournament.status || "").toLowerCase();

  // Parity guard with the server's `isTournamentRegistrationOpen` gate:
  // only `registration` and `upcoming` are sign-up eligible. Any other
  // status (in_progress, completed, cancelled, future unknown values) is
  // surfaced as 'closed' so the UI never advertises a state the server
  // would refuse.
  if (status !== "registration" && status !== "upcoming") {
    return "closed";
  }

  const startsAtMillis = toMillis(tournament.startsAt ?? null);
  if (startsAtMillis !== null && now >= startsAtMillis) {
    return "closed";
  }

  const opensAtMillis = toMillis(tournament.registrationStartsAt ?? null);
  if (opensAtMillis !== null && now < opensAtMillis) {
    return "opens-soon";
  }

  const closesAtMillis = toMillis(tournament.registrationEndsAt ?? null);
  if (closesAtMillis !== null && now > closesAtMillis) {
    return "closed";
  }

  const participantCount = typeof tournament.participantCount === "number"
    ? tournament.participantCount
    : null;
  const maxPlayers = typeof tournament.maxPlayers === "number" ? tournament.maxPlayers : null;
  if (participantCount !== null && maxPlayers !== null && maxPlayers > 0 && participantCount >= maxPlayers) {
    return "full";
  }

  return "open";
}

export function isTournamentRegistrationStateOpen(
  state: TournamentRegistrationState,
): boolean {
  return state === "open";
}
