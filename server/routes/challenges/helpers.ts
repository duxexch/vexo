import { challenges as challengesTable } from "@shared/schema";

/** Safely extract error message from unknown catch value */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

type ChallengeParticipantsRow = Pick<
  typeof challengesTable.$inferSelect,
  "player1Id" | "player2Id" | "player3Id" | "player4Id"
>;

type ChallengeAccessRow = ChallengeParticipantsRow & Pick<typeof challengesTable.$inferSelect, "visibility">;

type ChallengeTeamsRow = Pick<
  typeof challengesTable.$inferSelect,
  "player1Id" | "player2Id" | "player3Id" | "player4Id" | "requiredPlayers"
>;

type FriendChallengeRow = Pick<
  typeof challengesTable.$inferSelect,
  "status" | "opponentType" | "friendAccountId" | "player2Id" | "currentPlayers"
>;

export type ChallengeAccessDecision =
  | { allowed: true }
  | { allowed: false; status: 403; error: string };

export function getChallengeParticipantIds(challenge: ChallengeParticipantsRow): string[] {
  return [challenge.player1Id, challenge.player2Id, challenge.player3Id, challenge.player4Id]
    .filter(Boolean) as string[];
}

export function isChallengeParticipant(challenge: ChallengeParticipantsRow, userId: string): boolean {
  return getChallengeParticipantIds(challenge).includes(userId);
}

export function getChallengeTeams(challenge: ChallengeTeamsRow): { team1Ids: string[]; team2Ids: string[] } {
  const requiredPlayers = Number(challenge.requiredPlayers || 2);

  if (requiredPlayers >= 4) {
    return {
      team1Ids: [challenge.player1Id, challenge.player3Id].filter(Boolean) as string[],
      team2Ids: [challenge.player2Id, challenge.player4Id].filter(Boolean) as string[],
    };
  }

  return {
    team1Ids: [challenge.player1Id].filter(Boolean) as string[],
    team2Ids: [challenge.player2Id].filter(Boolean) as string[],
  };
}

export function getChallengeSameSideParticipantIds(challenge: ChallengeTeamsRow, playerId: string): string[] {
  const { team1Ids, team2Ids } = getChallengeTeams(challenge);

  if (team1Ids.includes(playerId)) {
    return team1Ids;
  }

  if (team2Ids.includes(playerId)) {
    return team2Ids;
  }

  return [];
}

export function getChallengeOpposingParticipantIds(challenge: ChallengeTeamsRow, playerId: string): string[] {
  const { team1Ids, team2Ids } = getChallengeTeams(challenge);

  if (team1Ids.includes(playerId)) {
    return team2Ids;
  }

  if (team2Ids.includes(playerId)) {
    return team1Ids;
  }

  const participantIds = getChallengeParticipantIds(challenge);
  return participantIds.filter((id) => id !== playerId);
}

export function isFriendChallengePendingAcceptance(challenge: FriendChallengeRow): boolean {
  const status = String(challenge.status || "").toLowerCase();
  const opponentType = String(challenge.opponentType || "").toLowerCase();
  const currentPlayers = Number(challenge.currentPlayers || 0);

  return (
    status === "waiting" &&
    opponentType === "friend" &&
    Boolean(challenge.friendAccountId) &&
    challenge.player2Id === challenge.friendAccountId &&
    currentPlayers < 2
  );
}

/**
 * Public challenges are visible to all authenticated users.
 * Private challenges are visible only to challenge participants.
 */
export function getChallengeReadAccess(challenge: ChallengeAccessRow, userId: string): ChallengeAccessDecision {
  const visibility = String(challenge.visibility || "public").toLowerCase();
  if (visibility !== "private") {
    return { allowed: true };
  }

  if (isChallengeParticipant(challenge, userId)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 403,
    error: "Not authorized to access this private challenge",
  };
}

// In-memory lock for challenge joins to prevent race conditions
export const challengeJoinLocks = new Set<string>();
