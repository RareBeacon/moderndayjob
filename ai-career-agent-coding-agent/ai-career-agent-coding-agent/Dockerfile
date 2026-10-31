# Isolated worker image — multi-arch (linux/amd64 + linux/arm64) for Oracle
# Always Free Ampere A1 (primary) and Render Free Docker (emergency standby).
#
# Why Docker: Render's native Node runtime cannot install Chromium's system
# deps (`npx playwright install --with-deps` runs `su`/`sudo` inside the build,
# which fails with "su: Authentication failure"). The official Playwright image
# ships Chromium + all system libraries pre-installed at /ms-playwright
# (PLAYWRIGHT_BROWSERS_PATH), so the build never needs apt or root escalation
# for browser dependencies.

# Pin to the exact Playwright version resolved in package.json / package-lock.json
# (1.62.1) so the npm package and the baked-in browser binaries always match.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

# Install matching Node 22 LTS ("engines": ">=20 <23") and refresh OS CA
# certificates (including Oct 2026 eMudhra TLS trust store updates).
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer cache). `--include=dev` keeps tsx
# (a devDependency that runs the worker) even if NODE_ENV=production is set.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy only runtime source files. .env* is intentionally NOT copied — workers
# receive secrets from runtime environment variables only, never baked in.
COPY tsconfig.json ./
COPY packages ./packages
COPY workers ./workers
COPY lib ./lib

# Run as the non-root pwuser the image already provides (defense-in-depth for
# the browser process). Ports >=1024 are bindable without root.
USER pwuser

# Build-time invariant: fail image build immediately if the npm `playwright`
# package version ever drifts from the baked-in /ms-playwright Chromium binary.
RUN node -e "const fs = require('node:fs'); const { chromium } = require('playwright'); const p = chromium.executablePath(); if (!p || !fs.existsSync(p)) { console.error('FATAL: Playwright Chromium binary missing at ' + p); process.exit(1); } console.log('Verified Playwright Chromium binary:', p);"

CMD ["npm", "run", "browser"]
