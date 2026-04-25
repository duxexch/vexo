import { WebPlugin } from "@capacitor/core";

import type {
  BubblesSupport,
  ChatBubblesPlugin,
  ShowBubbleOptions,
} from "./definitions";

/**
 * Web stub. The browser cannot render OS-level chat bubbles, so every
 * method short-circuits with a no-op. The in-app `ChatBubblesLayer`
 * React component handles the visual fallback for web users.
 */
export class ChatBubblesWeb extends WebPlugin implements ChatBubblesPlugin {
  async isBubblesSupported(): Promise<BubblesSupport> {
    return { supported: false, mode: "none" };
  }

  async showBubble(_options: ShowBubbleOptions): Promise<{ shown: boolean }> {
    return { shown: false };
  }

  async hideBubble(_options: { peerId: string }): Promise<void> {
    /* no-op */
  }

  async hideAllBubbles(): Promise<void> {
    /* no-op */
  }
}
