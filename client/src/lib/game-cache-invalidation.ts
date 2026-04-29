import { queryClient } from "@/lib/queryClient";

export const GAME_CACHE_QUERY_KEYS = {
  publicMultiplayer: "/api/multiplayer-games",
  publicSinglePlayer: "/api/games",
  publicExternal: "/api/external-games",
  publicAvailable: "/api/games/available",
  publicMostPlayed: "/api/games/most-played",
  publicSections: "/api/game-sections",
  publicSeo: "/api/public/games",

  adminMultiplayer: "/api/admin/multiplayer-games",
  adminSinglePlayer: "/api/admin/games",
  adminExternal: "/api/admin/external-games",
  adminSections: "/api/admin/game-sections",

  configVersion: "/api/config-version/multiplayer_games_version",
} as const;

export function invalidateAllGameCaches() {
  for (const key of Object.values(GAME_CACHE_QUERY_KEYS)) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function invalidatePublicGameCaches() {
  queryClient.invalidateQueries({ queryKey: [GAME_CACHE_QUERY_KEYS.publicMultiplayer] });
  queryClient.invalidateQueries({ queryKey: [GAME_CACHE_QUERY_KEYS.publicSinglePlayer] });
  queryClient.invalidateQueries({ queryKey: [GAME_CACHE_QUERY_KEYS.publicExternal] });
  queryClient.invalidateQueries({ queryKey: [GAME_CACHE_QUERY_KEYS.publicAvailable] });
  queryClient.invalidateQueries({ queryKey: [GAME_CACHE_QUERY_KEYS.publicMostPlayed] });
  queryClient.invalidateQueries({ queryKey: [GAME_CACHE_QUERY_KEYS.publicSections] });
  queryClient.invalidateQueries({ queryKey: [GAME_CACHE_QUERY_KEYS.publicSeo] });
  queryClient.invalidateQueries({ queryKey: [GAME_CACHE_QUERY_KEYS.configVersion] });
}
