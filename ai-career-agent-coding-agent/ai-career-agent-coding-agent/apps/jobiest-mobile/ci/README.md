# CI workflow template

GitHub only runs workflows that live in `.github/workflows/`, and the automation
account that authored this branch does **not** hold the `workflows` permission
for this repository, so the file in this folder is a template that needs one
copy step by a maintainer.

## Install (one command)

```bash
cp apps/jobiest-mobile/ci/flutter-android.workflow.yml .github/workflows/flutter-android.yml
git add .github/workflows/flutter-android.yml
git commit -m "ci: build the Flutter Android APK"
git push
```

After that, `.github/workflows/flutter-android.yml` runs on pushes and pull
requests that touch the app, and on `app-v*` tags. It runs

```
flutter pub get
./tool/bootstrap_android.sh      # restores the binary Gradle wrapper
flutter analyze --no-fatal-infos
flutter test
flutter build apk --release
```

and uploads the APK as the `jobiest-android-apk` workflow artifact. Download it
from the run page, or with `gh run download <run-id> -n jobiest-android-apk`.

## Alternative

Grant the installed GitHub App the **Workflows** permission
(Settings → GitHub Apps → configure → Permissions → Workflows: Read and write),
and the file can be pushed directly instead.
