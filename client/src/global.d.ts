// Browser compatibility type extensions

interface Window {
  /** Safari legacy AudioContext */
  webkitAudioContext: typeof AudioContext;
}

interface Navigator {
  /** iOS standalone mode flag */
  standalone?: boolean;
}

/**
 * Build-time application version string, injected by Vite via `define`
 * from `package.json#version`. Always defined in production builds; in
 * dev/SSR/test contexts it may fall back to "0.0.0". The release-update
 * banner uses this as the canonical "current bundle version" baseline so
 * a banner only fires when the server advertises a *strictly newer*
 * semver — never on transient server-side version churn.
 */
declare const __APP_VERSION__: string;
