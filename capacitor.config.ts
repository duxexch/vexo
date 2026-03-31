import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'click.vixo.app',
  appName: 'VEX',
  webDir: 'dist/public',

  server: {
    // Production: load from the live server URL
    url: 'https://vixo.click',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow navigation to these domains
    allowNavigation: [
      'vixo.click',
      '*.vixo.click',
      'accounts.google.com',
      'www.facebook.com',
      'appleid.apple.com',
      'discord.com',
      'github.com',
      'api.twitter.com',
      'telegram.org',
    ],
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      launchFadeOutDuration: 600,
      backgroundColor: '#0f1419',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      // iOS splash storyboard
      iosSpinnerStyle: 'small',
      layoutName: 'launch_screen',
      useDialog: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0f1419',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_notification',
      iconColor: '#f5a524',
      sound: 'notification.wav',
    },
    // Deep links for OAuth callbacks
    App: {
      appUrlOpen: true,
    },
    Haptics: {
      // Enable haptic feedback for game interactions
    },
    Browser: {
      // External browser for links
    },
    Network: {
      // Network status monitoring
    },
  },

  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0f1419',
    scheme: 'vexapp',
    // iOS App Store metadata
    limitsNavigationsToAppBoundDomains: true,
  },

  android: {
    backgroundColor: '#0f1419',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // Themed splash & navigation bars
    useLegacyBridge: false,
    // App Links verification for trusted installs
    buildOptions: {
      keystorePath: 'vex-release-key.jks',
      keystoreAlias: 'vex',
    },
  },
};

export default config;
