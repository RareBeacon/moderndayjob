# Jobiest native apps (Android + iOS)

The product is the web app at **https://jobiest.com**. These are native shells
built with [Capacitor 6](https://capacitorjs.com): the app opens the site in a
hardened in-app WebView with a native splash screen, styled status bar and
safe-area handling. Product updates ship with the web deploy; the store binary
only changes when the shell itself changes.

## What is in here

```
apps/mobile/
  capacitor.config.ts    shell config (loads https://jobiest.com)
  package.json           Capacitor 6 + splash/status-bar/browser plugins
  www/index.html         offline-first-open fallback
  assets/                app icon set + 2732px splash (navy, gold mark)
```

## Build the Android app (debug APK in ~15 minutes, free)

Requirements: Android Studio (free), JDK 17.

```bash
cd apps/mobile
npm install
npx cap add android
# icons: copy assets into the android res folders
npx cap sync android
npx cap open android          # opens Android Studio -> Run  (or:)
cd android && ./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease       # app.aab for Google Play
```

The debug APK installs directly on any Android phone (enable install from
unknown sources). Distributing via **Google Play** requires a one-time $25
developer account and a release keystore.

## Build the iOS app

Requirements: macOS with Xcode 15+, Apple ID (free for on-device testing).

```bash
cd apps/mobile
npm install
npx cap add ios
npx cap sync ios
npx cap open ios    # Xcode: set your team, pick your device, Run
```

Running on your own device works with a free Apple ID. **App Store**
distribution requires the $99/year Apple Developer Program.

## Store listing notes

- App name: Jobiest - AI Career Agent
- Category: Business / Productivity
- The app renders the jobiest.com web product; no account is needed to browse.
- Privacy policy: https://jobiest.com/privacy

## Why a wrapper and not a separate React Native app

One product surface, one source of truth. The web app already handles mobile
layouts, auth, payments and the agent pipeline; a second native UI would
double the surface area for no user gain at this stage. If a fully offline
native experience is ever needed, Capacitor can also bundle a static export,
and the shell can be extended feature by feature without a rewrite.
