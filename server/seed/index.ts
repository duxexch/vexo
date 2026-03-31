import { seed, seedSocialPlatforms } from "./seed-main";

export { seed, seedSocialPlatforms } from "./seed-main";
export { seedGameSections } from "./seed-sections";
export { seedMultiplayerGames } from "./seed-multiplayer";
export { seedGiftCatalog, seedFreePlaySettings } from "./seed-extras";

// Auto-run main seed + social platforms when this module is loaded directly
seed().then(() => seedSocialPlatforms()).catch(console.error);
