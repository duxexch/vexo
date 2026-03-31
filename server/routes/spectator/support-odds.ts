import type { Express, Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware";
import { calculateOdds, type PlayerStats } from "../../lib/odds-calculator";
import { getErrorMessage } from "../helpers";
import {
  getChallengeOpposingParticipantIds,
  getChallengeParticipantIds,
  getChallengeReadAccess,
  getChallengeSameSideParticipantIds,
} from "../challenges/helpers";

function buildPlayerStats(player: {
  gamesWon?: number | null;
  gamesLost?: number | null;
  gamesPlayed?: number | null;
  currentWinStreak?: number | null;
  longestWinStreak?: number | null;
  chessWon?: number | null;
  chessPlayed?: number | null;
  backgammonWon?: number | null;
  backgammonPlayed?: number | null;
  dominoWon?: number | null;
  dominoPlayed?: number | null;
  tarneebWon?: number | null;
  tarneebPlayed?: number | null;
  balootWon?: number | null;
  balootPlayed?: number | null;
}): PlayerStats {
  return {
    gamesWon: player.gamesWon || 0,
    gamesLost: player.gamesLost || 0,
    gamesPlayed: player.gamesPlayed || 0,
    currentWinStreak: player.currentWinStreak || 0,
    longestWinStreak: player.longestWinStreak || 0,
    chessWon: player.chessWon || 0,
    chessPlayed: player.chessPlayed || 0,
    backgammonWon: player.backgammonWon || 0,
    backgammonPlayed: player.backgammonPlayed || 0,
    dominoWon: player.dominoWon || 0,
    dominoPlayed: player.dominoPlayed || 0,
    tarneebWon: player.tarneebWon || 0,
    tarneebPlayed: player.tarneebPlayed || 0,
    balootWon: player.balootWon || 0,
    balootPlayed: player.balootPlayed || 0,
  };
}

type NormalizedPlayerStats = Required<
  Pick<
    PlayerStats,
    | "gamesWon"
    | "gamesLost"
    | "gamesPlayed"
    | "currentWinStreak"
    | "longestWinStreak"
    | "chessWon"
    | "chessPlayed"
    | "backgammonWon"
    | "backgammonPlayed"
    | "dominoWon"
    | "dominoPlayed"
    | "tarneebWon"
    | "tarneebPlayed"
    | "balootWon"
    | "balootPlayed"
  >
>;

function aggregatePlayerStats(players: PlayerStats[]): PlayerStats {
  if (players.length === 0) {
    return {
      gamesWon: 0,
      gamesLost: 0,
      gamesPlayed: 0,
      currentWinStreak: 0,
      longestWinStreak: 0,
      chessWon: 0,
      chessPlayed: 0,
      backgammonWon: 0,
      backgammonPlayed: 0,
      dominoWon: 0,
      dominoPlayed: 0,
      tarneebWon: 0,
      tarneebPlayed: 0,
      balootWon: 0,
      balootPlayed: 0,
    };
  }

  const zeroStats: NormalizedPlayerStats = {
    gamesWon: 0,
    gamesLost: 0,
    gamesPlayed: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    chessWon: 0,
    chessPlayed: 0,
    backgammonWon: 0,
    backgammonPlayed: 0,
    dominoWon: 0,
    dominoPlayed: 0,
    tarneebWon: 0,
    tarneebPlayed: 0,
    balootWon: 0,
    balootPlayed: 0,
  };

  const total = players.reduce<NormalizedPlayerStats>((acc, item) => {
    acc.gamesWon += item.gamesWon;
    acc.gamesLost += item.gamesLost;
    acc.gamesPlayed += item.gamesPlayed;
    acc.currentWinStreak += item.currentWinStreak;
    acc.longestWinStreak += item.longestWinStreak || 0;
    acc.chessWon += item.chessWon || 0;
    acc.chessPlayed += item.chessPlayed || 0;
    acc.backgammonWon += item.backgammonWon || 0;
    acc.backgammonPlayed += item.backgammonPlayed || 0;
    acc.dominoWon += item.dominoWon || 0;
    acc.dominoPlayed += item.dominoPlayed || 0;
    acc.tarneebWon += item.tarneebWon || 0;
    acc.tarneebPlayed += item.tarneebPlayed || 0;
    acc.balootWon += item.balootWon || 0;
    acc.balootPlayed += item.balootPlayed || 0;
    return acc;
  }, zeroStats);

  const count = players.length;
  return {
    gamesWon: Math.round(total.gamesWon / count),
    gamesLost: Math.round(total.gamesLost / count),
    gamesPlayed: Math.round(total.gamesPlayed / count),
    currentWinStreak: Math.round(total.currentWinStreak / count),
    longestWinStreak: Math.round(total.longestWinStreak / count),
    chessWon: Math.round(total.chessWon / count),
    chessPlayed: Math.round(total.chessPlayed / count),
    backgammonWon: Math.round(total.backgammonWon / count),
    backgammonPlayed: Math.round(total.backgammonPlayed / count),
    dominoWon: Math.round(total.dominoWon / count),
    dominoPlayed: Math.round(total.dominoPlayed / count),
    tarneebWon: Math.round(total.tarneebWon / count),
    tarneebPlayed: Math.round(total.tarneebPlayed / count),
    balootWon: Math.round(total.balootWon / count),
    balootPlayed: Math.round(total.balootPlayed / count),
  };
}

function formatSideName(players: Array<{ username: string }>, fallbackName: string): string {
  if (players.length === 0) {
    return fallbackName;
  }

  if (players.length === 1) {
    return players[0].username;
  }

  return players.map((player) => player.username).join(" + ");
}

export function registerSupportOddsRoutes(app: Express): void {

  // Get supports for a challenge
  app.get("/api/challenges/:challengeId/supports", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { challenges } = await import("@shared/schema");
      const [challenge] = await db.select().from(challenges).where(eq(challenges.id, req.params.challengeId));

      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const access = getChallengeReadAccess(challenge, req.user!.id);
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.error });
      }

      const supports = await storage.getSpectatorSupportsByChallenge(req.params.challengeId);
      res.json(supports);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get odds for a challenge
  app.get("/api/challenges/:challengeId/odds", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { challenges } = await import("@shared/schema");
      const [challenge] = await db.select().from(challenges).where(eq(challenges.id, req.params.challengeId));
      
      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const access = getChallengeReadAccess(challenge, req.user!.id);
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.error });
      }

      const participantIds = getChallengeParticipantIds(challenge);
      const participantUsers = await Promise.all(participantIds.map((id) => storage.getUser(id)));
      const participantMap = new Map(
        participantUsers
          .filter((player): player is NonNullable<typeof player> => Boolean(player))
          .map((player) => [player.id, player]),
      );

      const player1 = participantMap.get(challenge.player1Id);
      if (!player1) {
        return res.status(404).json({ error: "Player 1 not found" });
      }
      
      const settings = await storage.getSupportSettings(challenge.gameType);

      const team1Ids = getChallengeSameSideParticipantIds(challenge, challenge.player1Id);
      const team2Ids = getChallengeOpposingParticipantIds(challenge, challenge.player1Id);

      const team1Users = team1Ids
        .map((id) => participantMap.get(id))
        .filter((player): player is NonNullable<typeof player> => Boolean(player));

      const team2Users = team2Ids
        .map((id) => participantMap.get(id))
        .filter((player): player is NonNullable<typeof player> => Boolean(player));

      const player2AnchorId = challenge.player2Id || team2Users[0]?.id || null;
      const player2Anchor = player2AnchorId ? participantMap.get(player2AnchorId) || team2Users[0] || null : null;

      const isTeamMode = Number(challenge.requiredPlayers || 2) >= 4;

      const player1Stats = aggregatePlayerStats(team1Users.map((player) => buildPlayerStats(player)));
      const player2Stats = aggregatePlayerStats(team2Users.map((player) => buildPlayerStats(player)));
      const odds = calculateOdds(player1Stats, player2Stats, settings || undefined, challenge.gameType);

      const player1Label = isTeamMode
        ? formatSideName(team1Users.map((player) => ({ username: player.username })), player1.username)
        : player1.username;

      const player2Label = player2Anchor
        ? (isTeamMode
          ? formatSideName(team2Users.map((player) => ({ username: player.username })), player2Anchor.username)
          : player2Anchor.username)
        : null;

      const buildExtendedPlayerOdds = (playerId: string | null | undefined) => {
        if (!playerId) return null;
        const player = participantMap.get(playerId);
        if (!player) return null;

        const onTeam1 = team1Ids.includes(playerId);
        const playerOdds = onTeam1 ? odds.player1Odds : odds.player2Odds;
        const playerProbability = onTeam1 ? odds.player1Probability : odds.player2Probability;

        return {
          id: player.id,
          username: player.username,
          odds: playerOdds,
          probability: playerProbability,
        };
      };

      res.json({
        challengeId: challenge.id,
        gameType: challenge.gameType,
        player1: {
          id: player1.id,
          username: player1Label,
          odds: odds.player1Odds,
          probability: odds.player1Probability,
        },
        player2: player2Anchor ? {
          id: player2Anchor.id,
          username: player2Label || player2Anchor.username,
          odds: odds.player2Odds,
          probability: odds.player2Probability,
        } : null,
        player3: buildExtendedPlayerOdds(challenge.player3Id),
        player4: buildExtendedPlayerOdds(challenge.player4Id),
        teams: isTeamMode ? {
          team1: {
            playerIds: team1Ids,
            displayName: player1Label,
            odds: odds.player1Odds,
            probability: odds.player1Probability,
          },
          team2: {
            playerIds: team2Ids,
            displayName: player2Label,
            odds: odds.player2Odds,
            probability: odds.player2Probability,
          },
        } : null,
        houseFeePercent: odds.houseFeePercent,
        instantMatchOdds: settings?.instantMatchOdds || "1.80",
        allowInstantMatch: settings?.allowInstantMatch ?? true,
        minSupportAmount: parseFloat(settings?.minSupportAmount || "1.00"),
        maxSupportAmount: parseFloat(settings?.maxSupportAmount || "1000.00"),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

}
