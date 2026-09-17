# JOBIEST — Android Execution Status

> Persistent execution log. Updated after every milestone. Never marks unfinished work complete.
> Legend: **VERIFIED** (run/inspected and confirmed) · **IMPLEMENTED, NOT TESTED** (code written, unverified) · **BLOCKED** · **NOT STARTED**

---

## 0. Session header

| Field | Value |
| --- | --- |
| Report time (UTC) | 2026-09-17 |
| Agent workspace root | `/home/user/moderndayjob` |
| Actual application project root | `/home/user/moderndayjob/ai-career-agent-coding-agent/ai-career-agent-coding-agent` (double-nested) |
| Working branch | `arena/01a0aef5-moderndayjob` (off `main` @ `bc0ca35`) |
| Pull request | **#1** → `main` — CI (gitleaks · typecheck · 620+ tests · `next build`) **passing** |
| Stack detected | Next.js App Router + TypeScript + Supabase (Auth/Postgres/Storage) + Upstash Redis + Resend + Flutterwave |
| Mobile app | **new**: Flutter at `apps/jobiest-mobile` (native, no WebView) |
| Pre-existing Android shell | Capacitor WebView at `apps/mobile` — left untouched |
| APK | **not built yet — blocked on one repository permission (section 6)** |

---

## 1. PART 2 step 1 — workspace inspection (VERIFIED)

| Area | Actual condition | Evidence |
| --- | --- | --- |
| Repository structure | nested Next.js app + `apps/mobile` (Capacitor) + `packages/*` + `workers/*` | `find`, `ls apps/mobile` |
| Flutter project | **did not exist** (no `pubspec.yaml` anywhere) | repo-wide find |
| Existing Android artifact | Capacitor 7 shell, `com.jobiest.app`, MainActivity.java, brand launcher icons | `apps/mobile/android/**` |
| Backend | 69 route handlers | `find app/api -name route.ts \| wc -l` → 69 |
| Auth provider | **Supabase Auth (GoTrue)**; native Bearer contract already shipped in `bc0ca35` | `lib/auth.ts` (`bearerToken`, `bearerAuthContext`), `middleware.ts` |
| Email verification | **not a real flow here**: `POST /api/auth/signup` sets `email_confirm: true` and sends the branded welcome mail immediately | `app/api/auth/signup/route.ts` |
| Tests | 620+ vitest tests, plus Playwright; both green on `main` | CI runs `35205373119` |
| CI triggers | `ci.yml` on push/PR to `main`; `android-build.yml` on `v*`/`android` tags — **manual dispatch returns 403 for the automation account** | `gh run list`, `gh workflow run` |
| Secrets in repo | none; gitleaks passes on every run including this branch | run `35212852902` |

---

## 2. PART 2 step 2 — local build condition (VERIFIED, this sandbox)

```
$ flutter --version   → command not found        $ dart --version  → command not found
$ java -version       → command not found        $ $ANDROID_HOME   → (empty)
$ curl pub.dev / storage.googleapis.com / dl.google.com / services.gradle.org /
  repo.maven.apache.org / flutter.dev / cdn.jsdelivr.net / mirrors.* → SSL_ERROR_SYSCALL (blocked)
$ reachable: github.com, registry.npmjs.org, pypi.org
```

**Consequence:** a Flutter/Android build cannot be executed inside this sandbox —
not for lack of code, but because the toolchain cannot be downloaded. The build
must run on GitHub's runners (unrestricted network, Android SDK preinstalled).

---

## 3. What was delivered

### 3.1 Native Flutter app — `apps/jobiest-mobile` (**IMPLEMENTED, NOT COMPILED**)

47 Dart files, ~8.4k lines.

| Layer | Files |
| --- | --- |
| core | `config/app_config.dart`, `config/runtime_config.dart`, `network/api_client.dart`, `network/api_exception.dart`, `storage/secure_session_store.dart`, `theme/app_theme.dart`, `util/formatters.dart`, `widgets/state_views.dart` |
| models | `json`, `job`, `application`, `account` (profile, career, entitlements, completeness, preferences, documents), `resume` |
| auth | GoTrue REST client (password/refresh grants, logout, TOTP factors, password change), backend signup/forgot-password client, `AuthController` (session owner) |
| screens | Home · Jobs (search/filter/detail/saved) · AI Agent · Applications (list/detail/manual tracking) · Resume Studio · Career Score · Profile · Edit profile · Preferences · Security (TOTP MFA + password) · Support · Getting-started guide · sign-in / sign-up / reset / MFA challenge |
| android | real Gradle module, `com.jobiest.app`, brand launcher icons, HTTPS-only network security config, `tool/bootstrap_android.sh` for the binary Gradle wrapper |
| tests | `test/models_test.dart` (parsing + error mapping), `test/widget_test.dart` (state widgets) |

Every screen talks to an existing backend route. There is no hardcoded content
presented as server data, no fake auth, no placeholder job listings, and no
simulated payments.

### 3.2 Backend addition — one file (**VERIFIED in CI**)

`app/api/mobile/config/route.ts` (+ `tests/mobile-config-route.test.ts`) returns
the *public* client configuration so an installed APK always matches the
deployment:

```json
{ "apiBaseUrl": "...", "supabaseUrl": "...", "supabaseAnonKey": "...",
  "supportEmail": "support@jobiest.com", "minSupportedVersionCode": 1 }
```

The anon key is the same public value the website ships to browsers; the test
asserts no service-role/API/email/payment secret appears in the response. The
deny-by-default endpoint registry (`tests/security-baseline.test.ts`) lists it
as intentionally public with the reason recorded inline.

### 3.3 CI template (**BLOCKED — needs one owner action**)

`.github/workflows/flutter-android.yml` cannot be pushed by the automation
account: GitHub rejects any ref update touching `.github/workflows/**` from an
App without the `workflows` permission (verified twice — git push and the
Contents API both answered `Resource not accessible by integration`).

The identical file is committed as an installable template at
**`apps/jobiest-mobile/ci/flutter-android.workflow.yml`** with a one-command
install in `apps/jobiest-mobile/ci/README.md`. Once installed it runs
`flutter pub get` → `tool/bootstrap_android.sh` → `flutter analyze` →
`flutter test` → `flutter build apk --release`, asserts the APK file exists, and
uploads it as the `jobiest-android-apk` artifact.

---

## 4. Verification actually performed

| Check | Result |
| --- | --- |
| `gh run view 35212852902` (PR #1 CI) | **PASS** — gitleaks · typecheck · full vitest suite (incl. the new `mobile-config-route.test.ts`) · `next build` |
| First CI attempt | **FAIL**, correctly caught by the repo's own security guardrail (`routes without a server auth marker: /api/mobile/config`) — fixed by registering the route on the reviewed allowlist with its justification |
| Dart import resolution (script over all 47 files) | **PASS** — every relative and `package:jobiest_mobile/…` import resolves |
| Delimiter balance (comments/strings stripped) | **PASS** — balanced in every file |
| Provider coverage | **PASS** — every `context.read/watch<T>()` type is provided in `app.dart` |
| `flutter analyze` / `flutter test` / `flutter build apk` | **NOT RUN** — no toolchain, no reachable download host (section 2) |
| APK file | **does not exist yet** |

---

## 5. Milestones

| # | Milestone | Status |
| --- | --- | --- |
| 0 | Recovery and audit | **VERIFIED** — blocker found with evidence, log created |
| 1 | Flutter Android foundation | **IMPLEMENTED, NOT TESTED** — project, Gradle module, app entry, navigation, theme, error handling all written; compile pending |
| 2 | Backend and authentication | **IMPLEMENTED, NOT TESTED on device** — client + repositories written against the shipped Bearer contract; the *backend half* is verified by CI |
| 3 | Core Jobiest experience | **IMPLEMENTED, NOT TESTED** — full journey implemented (open → sign in → home → jobs → detail → track → applications → profile → sign out) |
| 4 | Resume, Career Score, AI Agent | **IMPLEMENTED, NOT TESTED** — real endpoints only (`/api/resume-studio/*`, `/api/profile/completeness`, `/api/ai/*`, `/api/ats/scan`) |
| 5 | Onboarding, security, support | **IMPLEMENTED, NOT TESTED** — guide, support intake, TOTP MFA, password change, sign-out |
| 6 | QA and release build | **BLOCKED** — see section 6 |

---

## 6. Exact blocker for the APK

1. No Flutter/Java/Android SDK in the sandbox **and** the sandbox network refuses
   every host that serves them (§2). A local build is impossible, not merely slow.
2. The build therefore has to run in GitHub Actions, but the automation account
   **cannot write `.github/workflows/**`** (`workflows` permission missing) and
   cannot dispatch workflows (`gh workflow run` → HTTP 403).

### Owner action (either one unblocks the APK)

* **A0 —** Reconnect GitHub in Arena with an account/token that carries the
  `workflow` scope. (Tokens pasted into chat are not accepted or stored — the
  connection has to be made through Arena's own GitHub integration.)
* **A —** Grant the installed GitHub App the *Workflows: Read and write*
  permission (Settings → GitHub Apps → Configure → Repository permissions), then
  tell me; I will push the workflow, watch the run and download the artifact.
* **B —** Install the template yourself (30 seconds):
  ```bash
  cp apps/jobiest-mobile/ci/flutter-android.workflow.yml .github/workflows/flutter-android.yml
  git add .github/workflows/flutter-android.yml && git commit -m "ci: build the Flutter APK" && git push
  ```
  It runs automatically on the next push/PR; the APK lands as the
  `jobiest-android-apk` artifact.

Notes on signing: no keystore is configured anywhere, so the workflow produces a
**debug-key-signed release APK** (installable, not Play-Store-uploadable). Signing
material is deliberately not invented; `android/app/build.gradle` reads
`ANDROID_KEYSTORE_FILE`/`ANDROID_KEYSTORE_PASSWORD`/`ANDROID_KEY_ALIAS`/
`ANDROID_KEY_PASSWORD` from the environment when the owner supplies them.

---

## 7. Not done / not claimed

* **Google sign-in in the app** — not implemented. The web flow redirects to a
  browser callback (`jobiest://auth/callback` is allow-listed server-side), which
  needs a deep-link handler plugin; email + password and TOTP MFA are fully
  implemented instead. No dead "Continue with Google" button was added.
* **PDF export / resume generation from the device** — the app creates and edits
  the server-side Resume Studio draft and calls the assistant; generation and PDF
  export remain on the web workflow and the screen says so.
* **Billing/payment flows** — the app shows real plan entitlements and links to
  `jobiest.com/billing`; no payment UI was invented.
* **Device/emulator test run** — impossible here (no emulator, no APK yet).
* **Vercel preview check on PR #1 reports failure (0s)** while the GitHub Actions
  build of the same commit passes. The Vercel log needs their CLI
  (`npx vercel inspect dpl_G2MKxpheQBnsof6Nm1997P2ErCPH --logs`); no Vercel
  credential is available in this session. Not caused by the app code as far as
  the evidence shows (typecheck + tests + `next build` all pass).

---

## 8. Next concrete action

Awaiting the owner's choice in §6. On either path the next step is identical:
trigger the Flutter build, verify the artifact with
`gh run download <run-id> -n jobiest-android-apk`, record the APK's path, size and
SHA-256 here, and then close out signals that still need a device (launch,
sign-in, sign-out, jobs journey).
