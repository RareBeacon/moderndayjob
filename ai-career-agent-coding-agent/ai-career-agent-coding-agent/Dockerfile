# Isolated browser worker — containerised so it runs on Render's FREE plan.
#
# Why Docker: Render's native Node runtime cannot install Chromium's system
# deps (`npx playwright install --with-deps` runs `su`/`sudo` inside the build,
# which fails with "su: Authentication failure"). The official Playwright image
# ships Chromium + all system libraries pre-installed at /ms-playwright
# (PLAYWRIGHT_BROWSERS_PATH), so the build never needs apt or root escalation.

# Pin to the exact Playwright version resolved in package-lock.json (1.62.1) so
# the npm package and the baked-in browser binaries always match.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

# The image ships Node 24; the app declares "engines": ">=20 <23". Install the
# matching Node 22 LTS so the worker runs on the same major the rest of the app
# targets (this is the same nodesource mechanism the base image itself uses).
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer cache). `--include=dev` keeps tsx
# (a devDependency that runs the worker) even if NODE_ENV is ever set.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Only the files the worker needs. .env* is intentionally NOT copied — the
# worker gets BROWSER_WORKER_SECRET from Render's runtime env vars, never baked
# into the image.
COPY tsconfig.json ./
COPY workers ./workers
COPY lib ./lib

# Run as the non-root pwuser the image already provides (defense-in-depth for
# the browser process). Ports >=1024 (Render's injected PORT) are bindable.
USER pwuser

CMD ["npm", "run", "browser"]
