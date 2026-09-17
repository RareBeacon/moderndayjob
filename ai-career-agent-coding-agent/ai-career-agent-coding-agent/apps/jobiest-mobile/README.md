# Jobiest for Android (Flutter)

Native Flutter client for the Jobiest career platform. It talks to the **existing**
Jobiest backend (`https://jobiest.com`) — the same Next.js API routes the website
uses — with the Bearer-token contract already implemented server-side in
`lib/auth.ts`. There is no WebView and no PWA wrapper.

```
lib/
  core/            config, HTTP client, secure storage, theme, shared widgets
  models/          typed API models (job, application, resume, account…)
  features/
    auth/          sign-in, sign-up, password reset, TOTP MFA
    home/          home tab
    jobs/          search, list, detail, saved jobs
    agent/         AI Agent (real endpoints only)
    applications/  application tracking
    resume/        Resume Studio
    career/        Career Score (profile readiness + ATS scan)
    profile/       profile, settings, subscription, security
    support/       support intake
    guide/         getting-started guide
```

## Requirements

* Flutter 3.27.x (stable) — pinned in `.github/workflows/flutter-android.yml`
* JDK 17
* Android SDK with platform 35 (GitHub's `ubuntu-latest` runners ship it)

## Build

```bash
flutter pub get
./tool/bootstrap_android.sh        # fetches gradle-wrapper.jar (binary, not committed)
flutter analyze
flutter test
flutter build apk --release
```

Output: `build/app/outputs/flutter-apk/app-release.apk`

### Configuration (all optional — sane defaults are used)

| Define | Default | Purpose |
| --- | --- | --- |
| `JOBIEST_API_BASE_URL` | `https://jobiest.com` | Backend origin |
| `JOBIEST_SUPABASE_URL` | fetched from `/api/mobile/config` | Auth provider |
| `JOBIEST_SUPABASE_ANON_KEY` | fetched from `/api/mobile/config` | Auth provider (public key) |

```bash
flutter build apk --release --dart-define=JOBIEST_API_BASE_URL=http://10.0.2.2:3000
```

### Secrets

No API keys, service-role keys or passwords are stored in this project or shipped
in the APK. The only credential the app holds is the Supabase **anon** key, which
is a public client key already shipped to every browser by the website; it is
fetched at runtime from `GET /api/mobile/config`. User sessions are stored with
`flutter_secure_storage` (Android Keystore-backed encrypted preferences) and are
never logged.

## Signing

Release builds are signed with the debug key unless CI provides
`ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and
`ANDROID_KEY_PASSWORD`. Signing material is never invented or committed.
