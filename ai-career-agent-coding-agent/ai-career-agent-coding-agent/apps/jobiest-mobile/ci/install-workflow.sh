#!/usr/bin/env bash
# Installs the Flutter Android CI workflow into .github/workflows/ and pushes it.
#
# GitHub only runs workflows that live in .github/workflows/, and the automation
# account that authored this branch does not hold the repository's `workflows`
# permission — so a maintainer has to run this once.
#
#   ./apps/jobiest-mobile/ci/install-workflow.sh
#
# After it runs, the next push or pull request that touches the app builds the
# APK and uploads it as the `jobiest-android-apk` artifact.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SRC="$ROOT/ai-career-agent-coding-agent/ai-career-agent-coding-agent/apps/jobiest-mobile/ci/flutter-android.workflow.yml"
DEST="$ROOT/.github/workflows/flutter-android.yml"

if [ ! -f "$SRC" ]; then
  echo "ERROR: workflow template not found at $SRC" >&2
  exit 1
fi

if [ -f "$DEST" ]; then
  echo "Workflow already installed at .github/workflows/flutter-android.yml — updating it."
fi

mkdir -p "$ROOT/.github/workflows"
cp "$SRC" "$DEST"

cd "$ROOT"
git add .github/workflows/flutter-android.yml
git commit -m "ci: build the Flutter Android APK"
git push

echo
echo "Done. The workflow now runs on pushes/PRs that touch apps/jobiest-mobile."
echo "APK artifact name: jobiest-android-apk"
echo "Download it from the run page, or: gh run download <run-id> -n jobiest-android-apk"
