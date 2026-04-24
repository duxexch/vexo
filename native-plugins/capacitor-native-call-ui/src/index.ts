import { registerPlugin } from "@capacitor/core";

import type { NativeCallUIPlugin } from "./definitions";
import { NativeCallUIWeb } from "./web";

const NativeCallUI = registerPlugin<NativeCallUIPlugin>("NativeCallUI", {
  web: () => new NativeCallUIWeb(),
});

export * from "./definitions";
export { NativeCallUI };
