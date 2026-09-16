# Jobiest Native Apps - Production Requirements & Plan

Status date: 2026-09-16. Everything repo-side is done (Phase 0 + 1 below).
The remaining items are account creation, testing and store submission.

## What the app is

A Capacitor 8 native shell (Android today, iOS next) that renders
https://jobiest.com in a hardened WebView: native splash, styled status bar,
Android App Links (`jobiest.com` links open the app), session persistence,
product updates ship with the web deploy. No product logic lives in the shell.

- Package: `com.jobiest.app` · version 1.0.0 · minSdk 24 (Android 7+, ~99% devices)
- targetSdk **36** (meets Google's Aug-31-2026 requirement for new apps)
- Release keystore: generated, custody with the operator (NOT in the repo)
- App Links verification file deployed at `/.well-known/assetlinks.json`

## Requirements

### 1. Accounts (the only paid items - your action)

| Account | Cost | Needed for | Notes |
| --- | --- | --- | --- |
| Google Play Console | $25 once | Android release | New personal accounts must run a **closed test with 12+ testers for 14 consecutive days** before production access. Identity verification at signup. |
| Apple Developer Program | $99/year | iOS release | Requires a Mac for certificate/profile + Xcode builds. Can be deferred; Android ships first. |

### 2. Hardware / software

- **Android:** nothing to buy. Builds run free on GitHub Actions (workflow committed:
  `.github/workflows/android-build.yml`). Testing needs any Android phone.
- **iOS:** a Mac with current Xcode, or a cloud Mac (~$1/hr on MacStadium/MacinCloud)
  for the few hours of certificate setup + build. The `ios/` platform is generated
  with one command on the Mac (`npx cap add ios`).

### 3. Tester recruitment (Android gating requirement)

12 real people with Google accounts, opted in continuously for 14 days.
Friends/family/the product's early users work; emulators and duplicate
accounts do not count. They install via an opt-in link and just use the app.

### 4. Store listing assets (I can produce all of these on request)

- Screenshots: Google wants phone (min 2) + optionally 7" and 10" tablet sets;
  Apple wants 6.9"/6.5" iPhone sets (+ iPad if enabled). I can generate them
  from the live site with the mobile audit kit.
- Feature graphic 1024x500 (Google), app icon 512x512 (have).
- Descriptions (short + full), category (Business/Productivity), tags.
- Privacy policy URL: https://jobiest.com/privacy (exists).
- Google **Data safety** form + Apple **App Privacy** answers (I draft them:
  the app is a browser for jobiest.com; data collected = account + profile +
  documents, all declared by the site already).
- Content rating questionnaire (everyone / low).

### 5. QA checklist (before any submission) - on a real device

- [ ] Cold start: splash shows, site loads logged-out
- [ ] Sign in persists across app restarts (WebView storage)
- [ ] CV upload (file picker opens, PDF accepted)
- [ ] Document export/download lands on the device
- [ ] Outbound job-board links open in the system browser, return works
- [ ] Android back button navigates site history, exits from home
- [ ] Keyboard doesn't cover inputs; notch/safe areas respected
- [ ] Offline: airplane mode shows the offline fallback, recovers on reconnect
- [ ] `jobiest.com` link in Gmail/WhatsApp opens the app (App Links)

### 6. Review-policy risk (honest)

Apple guideline 4.2 ("minimum functionality") can reject pure website
wrappers. Mitigations already in: native splash, App Links, standalone
identity. If Apple still rejects, options: add a native share-sheet/notification
surface, or ship Android + PWA only (PWA installs on iOS Safari already work).

## Implementation plan

### Phase 0 - done (previous session)
Shell project, icons, splash, capacitor config, README.

### Phase 1 - done (today, all free)
- Upgraded to Capacitor 8 (v6 was end-of-support), Node 22 toolchain
- `android/` platform project committed: targetSdk 36, minSdk 24
- 105 icon/splash assets generated into `android/app/src/main/res/`
- Release keystore generated (25-year, PKCS12) + signing wired into Gradle
- Android App Links: intent filter + `/.well-known/assetlinks.json` on the site
- GitHub Actions workflow: debug APK (no secrets) + signed release AAB

### Phase 2 - you, ~1 hour + verification wait
1. Create the Google Play Console account ($25): https://play.google.com/console
2. Create app: name "Jobiest - AI Career Agent", default language English,
   app/game, free
3. Add the 4 GitHub secrets (values are in the operator's keystore file):
   `ANDROID_KEYSTORE_B64` (base64 of the keystore file), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
4. Run the Actions workflow, download the signed AAB, upload to Play Console
   (internal testing track first)

### Phase 3 - 14 days (the long pole, starts the moment testers join)
Closed test with 12+ opted-in testers. Recruit on day 1; they need to open the
app a few times over the period. Track opt-ins in Play Console; the 14-day
clock only completes with 12 continuously opted-in.

### Phase 4 - parallel during Phase 3 (me, on request)
Store listing: screenshots, feature graphic, descriptions, data-safety form
draft, content rating. I prepare everything; you paste into the consoles.

### Phase 5 - after day 14
Apply for production access (short form about the test), staged rollout
(10% -> 50% -> 100%), watch crash/vitals dashboards.

### Phase 6 - iOS track (whenever the Apple account exists)
1. Apple Developer enrollment ($99/yr)
2. On a Mac: `cd apps/mobile && npm ci && npx cap add ios`, open Xcode,
   set the team, add associated-domains entitlement (jobiest.com)
3. TestFlight beta -> App Store review -> release
Estimated 1-2 weeks after account + Mac access, most of it review waiting.

## Timeline (Android)

| Step | Duration |
| --- | --- |
| Account + first upload (Phase 2) | 1 day (identity verification may add 1-3 days) |
| Closed testing (Phase 3) | 14 days, fixed |
| Production application + review | 1-3 days |
| **Total to Play Store** | **~3 weeks, mostly the mandatory test** |

## Costs

$25 once (Google) + $99/yr (Apple, optional/deferred). Everything else
(CI builds, store assets, listings) is $0.
