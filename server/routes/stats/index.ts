import type { Express } from "express";
import { registerStatsProfileRoutes } from "./stats-profile";
import { registerLeaderboardRoutes } from "./stats-leaderboard";
import { registerAchievementsRoutes } from "./achievements";
import { registerSeasonsRoutes } from "./seasons";
import { registerDashboardStatsRoutes } from "./dashboard";

export function registerStatsRoutes(app: Express): void {
  registerStatsProfileRoutes(app);
  registerLeaderboardRoutes(app);
  registerAchievementsRoutes(app);
  registerSeasonsRoutes(app);
  registerDashboardStatsRoutes(app);
}
