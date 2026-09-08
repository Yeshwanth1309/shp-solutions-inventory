# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# SHP Solutions — Inventory
# Multi-stage build producing a minimal, non-root runtime image.
# ---------------------------------------------------------------------------

FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- deps: install once, reused by build ------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- build: compile the Next.js standalone output ---------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A DATABASE_URL is required only to satisfy env validation at import time;
# no database connection is made during the build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-time-placeholder-not-used-at-runtime-000000000000"
RUN npm run build

# --- runtime: minimal image, non-root user ----------------------------------
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=build --chown=nextjs:nodejs /app/src/server/db ./src/server/db
COPY --from=build --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=build --chown=nextjs:nodejs /app/node_modules/.bin/tsx ./node_modules/.bin/tsx

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
