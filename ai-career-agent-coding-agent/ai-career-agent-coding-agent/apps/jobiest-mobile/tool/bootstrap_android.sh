#!/usr/bin/env bash
# Bootstrap the one binary file Gradle needs and that cannot be committed as
# text: android/gradle/wrapper/gradle-wrapper.jar.
#
# Everything else in android/ is version-controlled in this repository. Run
# this once on any machine (or CI runner) that has the Flutter SDK:
#
#   ./tool/bootstrap_android.sh
#
# It is idempotent: if the wrapper jar already exists it does nothing.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAR="$HERE/android/gradle/wrapper/gradle-wrapper.jar"

if [ -f "$JAR" ] && [ -f "$HERE/android/gradlew" ]; then
  echo "Gradle wrapper already present — nothing to do."
  exit 0
fi

if ! command -v flutter >/dev/null 2>&1; then
  echo "ERROR: flutter is not on PATH. Install Flutter first." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Generating a throwaway Flutter project to obtain a pristine wrapper jar..."
flutter create --platforms=android --org com.jobiest --project-name jobiest_mobile "$TMP/scaffold" >/dev/null

mkdir -p "$(dirname "$JAR")"
cp "$TMP/scaffold/android/gradle/wrapper/gradle-wrapper.jar" "$JAR"
# The wrapper scripts are optional in a Flutter project (flutter build drives
# Gradle itself) but they make `./android/gradlew` work for debugging, and the
# tagged CI job in .github/workflows/android-build.yml uses it directly.
cp "$TMP/scaffold/android/gradlew" "$HERE/android/gradlew"
cp "$TMP/scaffold/android/gradlew.bat" "$HERE/android/gradlew.bat"
chmod +x "$HERE/android/gradlew"
echo "Copied gradle-wrapper.jar, gradlew and gradlew.bat into android/."
