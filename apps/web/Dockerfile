# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20
ARG DISTROLESS_NODE_IMAGE=gcr.io/distroless/nodejs${NODE_VERSION}-debian12

# ============================================
# Stage 1: Alpine base with pnpm and turbo
# ============================================
# Pinned to BUILDPLATFORM so the JS toolchain never runs under QEMU. Every
# artifact this base produces is architecture-independent JavaScript, which the
# per-arch runtime stage consumes unchanged — the existing musl (alpine) to
# glibc (distroless) hop already depended on that being true.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS alpine

ENV PNPM_STORE=/pnpm/store

RUN apk add --no-cache libc6-compat && \
    corepack enable && \
    corepack prepare pnpm@9.14.2 --activate && \
    npm install turbo@2.3.1 --global && \
    pnpm config set store-dir "$PNPM_STORE"

# ============================================
# Stage 2: Prune the monorepo
# ============================================
FROM alpine AS pruner

WORKDIR /app
COPY . .

RUN turbo prune --scope=@kan/web --scope=@kan/db --docker

# ============================================
# Stage 3: Install dependencies
# ============================================
FROM alpine AS deps
WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

ENV CI=true

# The cache mount target must be absolute: BuildKit does not expand `~`, so a
# `target=~/.pnpm-store` never lines up with pnpm's own store path and every
# build re-downloads the entire dependency tree.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# ============================================
# Stage 4: Build the web application
# ============================================
FROM alpine AS builder

# Empty rather than "unknown" so builds without a version stamp hide the version
# in the UI instead of rendering a broken release link.
ARG APP_VERSION=""

WORKDIR /app

COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ .

# Force standalone output for production Docker image
ENV NEXT_PUBLIC_USE_STANDALONE_OUTPUT=true
ENV CI=true

# Invoke turbo directly instead of the root `build` script: that script filters
# out @kan/docs, which turbo prune strips from this workspace, and turbo >=2.5
# hard-errors on a filter naming a package it cannot find.
#
# .next/cache and .turbo are cache mounts carrying Next's incremental compiler
# state between builds; being mounts, they never land in the image.
RUN --mount=type=cache,id=next-cache,target=/app/apps/web/.next/cache,sharing=locked \
    --mount=type=cache,id=turbo-cache,target=/app/.turbo,sharing=locked \
    NEXT_PUBLIC_APP_VERSION="$APP_VERSION" pnpm exec turbo run build --filter=@kan/web

# ============================================
# Stage 5: Migration image (run-once container)
# ============================================
# Deliberately not pinned to BUILDPLATFORM: drizzle-kit pulls in a
# platform-specific esbuild binary, so this stage has to install on the
# architecture it will actually run on.
FROM node:${NODE_VERSION}-alpine AS migrate
WORKDIR /db

COPY packages/db/drizzle.config.ts ./drizzle.config.ts
COPY packages/db/migrations/ ./migrations/

# /root/.npm is a cache mount here, so it must not be deleted at the end of the
# layer the way a plain directory would be.
RUN --mount=type=cache,id=npm-cache,target=/root/.npm,sharing=locked \
    npm init -y && \
    npm install drizzle-kit drizzle-orm pg --save-exact && \
    # Strip unnecessary files from node_modules
    find node_modules -type f \( \
      -name '*.d.ts' -o \
      -name '*.d.mts' -o \
      -name '*.d.cts' -o \
      -name '*.map' -o \
      -name '*.md' -o \
      -name '*.txt' -o \
      -name 'LICENSE*' -o \
      -name 'CHANGELOG*' -o \
      -name 'README*' -o \
      -name '.eslint*' -o \
      -name '.prettier*' -o \
      -name 'tsconfig*.json' \
    \) -delete && \
    find node_modules -type d -empty -delete && \
    rm -rf /tmp/*

CMD ["npx", "drizzle-kit", "migrate"]

# ============================================
# Stage 6: Production web image (distroless)
# ============================================
FROM ${DISTROLESS_NODE_IMAGE} AS web
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy the standalone Next.js server
COPY --chown=1000:1000 --from=builder /app/apps/web/.next/standalone/ ./
# Copy static assets and public files
COPY --chown=1000:1000 --from=builder /app/apps/web/.next/static/ ./apps/web/.next/static/
COPY --chown=1000:1000 --from=builder /app/apps/web/public/ ./apps/web/public/

# Copy bootstrap script for runtime env var injection
COPY --chown=1000:1000 apps/web/bootstrap.cjs ./bootstrap.cjs

USER 1000:1000

EXPOSE 3000
CMD ["bootstrap.cjs"]
