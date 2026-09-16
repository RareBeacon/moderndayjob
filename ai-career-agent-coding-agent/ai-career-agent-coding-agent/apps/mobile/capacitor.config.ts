import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Jobiest native shell configuration.
 *
 * Architecture: thin wrapper. The product is the web app at jobiest.com
 * (Next.js, server-rendered); the native shells render it in a hardened
 * WebView with native splash screen, status bar styling and safe-area
 * handling. No product logic lives in the shell, so every app update
 * ships the moment the site deploys - no store review for content.
 *
 * app store ids are filled in when the store listings are created.
 */
const config: CapacitorConfig = {
  appId: 'com.jobiest.app',
  appName: 'Jobiest',
  webDir: 'www',
  server: {
    url: 'https://jobiest.com',
    cleartext: false,
    allowNavigation: ['jobiest.com', '*.jobiest.com'],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#111C35',
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#111C35',
    limitsNavigationsToAppDomains: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#111C35',
      androidSplashResourceName: 'splash',
      iosSpinnerColor: '#F8D64D',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#111C35',
      overlaysWebView: false,
    },
  },
};

export default config;
