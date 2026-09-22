# Jobiest for Android

Native Android client (Kotlin + Jetpack Compose, Material 3) for the Jobiest
career agent. It talks to the same production API as the website
(https://jobiest.com/api) using the native-client Bearer auth path, so every
server-side gate (approvals, entitlements, rate limits, audit, MFA) applies
unchanged.

## What is in v0.1

- Email + password sign-in, sign-up with the website's rules (full name,
  E.164 phone, password policy, email verification), TOTP MFA verification
  and enrollment, sign-out.
- Dashboard: greeting, mode-aware banner, the four numbers, drafts awaiting
  approval, board deep links, the automatic-submission on/off control.
- Applications: list with filters, detail with package documents, timeline,
  approve / reject / withdraw / send-with-agent; job-link intake and manual
  tracking.
- Documents: master CV upload (PDF), generation, generated-document viewer
  with share.
- Billing: plan cards from /api/plans (single source of truth with the
  website), checkout via the website's Paystack page in a browser tab.
- Settings: automatic submission, agent pause/resume, two-factor manager,
  password reset, support, legal, sign out.
- The ten free career tools open on the website (custom tab) in v0.1;
  native tool screens are a later release.

## Build

Requirements: JDK 17, Android SDK (platform 35, build-tools). Then:

    ./gradlew :app:testDebugUnitTest
    ./gradlew :app:assembleDebug

The debug APK lands in `app/build/outputs/apk/debug/app-debug.apk`.

## CI

`.github/workflows/android.yml` runs unit tests and builds a debug APK on
every push that touches `mobile/`. The APK is attached to the run as an
artifact named `jobiest-debug-apk` (GitHub run page, Artifacts section):
download, unzip, install on a phone. Release signing (Play App Signing)
happens when the Play developer account exists.

## Architecture notes

- Single :app module, single activity, Compose navigation, one bottom bar.
- No DI framework: `AppContainer` in `JobiestApp.kt` holds two clients.
- `core/AuthClient.kt` speaks to Supabase GoTrue REST directly (password
  grant, refresh, TOTP challenge/verify/enroll). No SDK, no surprises.
- `core/ApiClient.kt` speaks to the website API with the Bearer token, one
  silent refresh-and-retry on 401, typed MFA_REQUIRED signal.
- `core/BoardLinks.kt` is a faithful port of the website's
  lib/boardlinks.ts with mirrored tests.
- Package id `com.jobiest.app` (matches the published assetlinks.json).
