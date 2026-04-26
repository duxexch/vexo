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
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
    // Task #89: Messenger-style floating chat bubbles. The plugin has
    // no runtime configuration knobs; the empty block keeps it
    // discoverable to the Capacitor CLI sync step.
    ChatBubbles: {},
    NativeCallUI: {
      // Display name shown for the call provider in the OS UI (CallKit
      // settings / Android phone account picker). Localization is wired
      // through the JS layer when present.
      providerName: 'VEX',
      supportsVideo: true,
      includesCallsInRecents: true,
      // Drop the audio session back to the app after a call ends so we
      // don't keep the phone speaker pinned to "in-call" routing.
      ringtoneSound: 'notification.wav',
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
    // Release-signing is owned by gradle, NOT by `cap build`.
    // `android/app/build.gradle` reads
    //   System.getenv("ANDROID_KEYSTORE_PATH")
    //   System.getenv("ANDROID_KEY_ALIAS")
    //   System.getenv("ANDROID_KEYSTORE_PASSWORD")
    //   System.getenv("ANDROID_KEY_PASSWORD")
    // directly from the process environment when assembling release.
    // Passwords are never written to capacitor.config.ts, never written
    // to a properties file, never put on a command line. The canonical
    // gradle snippet to paste into `android/app/build.gradle` after
    // `npx cap add android` lives at
    //   docs/mobile/android-signing-gradle-snippet.md
    // and the keystore metadata (alias, fingerprints) is in
    //   replit.md § "Android Release Signing".
  },
};

export default config;
