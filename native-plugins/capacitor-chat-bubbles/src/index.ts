import { registerPlugin } from "@capacitor/core";

import type { ChatBubblesPlugin } from "./definitions";
import { ChatBubblesWeb } from "./web";

const ChatBubbles = registerPlugin<ChatBubblesPlugin>("ChatBubbles", {
  web: () => new ChatBubblesWeb(),
});

export * from "./definitions";
export { ChatBubbles };
