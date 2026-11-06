#!/usr/bin/env bash
# Vercel Ignored Build Step
# Exit 0 = Skip the build (no build server spun up, 0 bytes function storage used)
# Exit 1 = Proceed with build (production deployment or app files modified)

set -e

echo "[vercel-ignore-build] Evaluating whether to build commit ${VERCEL_GIT_COMMIT_SHA:-HEAD}..."

# 1. Always build Production deployments
if [ "$VERCEL_ENV" = "production" ]; then
  echo "[vercel-ignore-build] VERCEL_ENV is production -> Building."
  exit 1
fi

# 2. Check commit message for standard skip directives
COMMIT_MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "")
if [[ "$COMMIT_MSG" =~ \[(skip[ _-]ci|skip[ _-]vercel|skip[ _-]preview)\] ]]; then
  echo "[vercel-ignore-build] Commit message contains skip flag -> Skipping build."
  exit 0
fi

# 3. If no previous commit or diff cannot be computed, safely build
PREV_SHA="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
if ! git rev-parse --verify "$PREV_SHA" >/dev/null 2>&1; then
  echo "[vercel-ignore-build] Previous commit $PREV_SHA not available in clone -> Building safely."
  exit 1
fi

# 4. Check if files in this app directory changed
# Note: In Vercel, Root Directory is ai-career-agent-coding-agent/ai-career-agent-coding-agent.
# We check if anything in the app directory changed since the previous deployment commit.
if git diff --quiet "$PREV_SHA" HEAD -- .; then
  echo "[vercel-ignore-build] No changes detected in project root since $PREV_SHA -> Skipping build."
  exit 0
fi

# 5. Check if ONLY non-production assets (docs, tests, reports, zap, etc.) changed
CHANGED_FILES=$(git diff --name-only "$PREV_SHA" HEAD -- .)
APP_CHANGES=$(echo "$CHANGED_FILES" | grep -v -E '^(\.zap/|tests/|docs/|ops/|test-results/|playwright/|playwright-report/|.*\.md$|.*\.test\.[jt]sx?$|.*\.spec\.[jt]sx?$)') || true

if [ -z "$APP_CHANGES" ]; then
  echo "[vercel-ignore-build] Changes are limited to tests, docs, or non-production files -> Skipping build."
  exit 0
fi

echo "[vercel-ignore-build] App files modified -> Building."
exit 1
