// Browser compatibility type extensions

interface Window {
  /** Safari legacy AudioContext */
  webkitAudioContext: typeof AudioContext;
}

interface Navigator {
  /** iOS standalone mode flag */
  standalone?: boolean;
}
