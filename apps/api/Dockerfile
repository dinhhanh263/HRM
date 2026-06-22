# syntax=docker/dockerfile:1
# Multi-stage build for the @hrm/api service (and the @hrm/worker that shares
# this image). Build context MUST be the repo root: `docker build -f apps/api/Dockerfile .`

# ---- builder ----------------------------------------------------------------
FROM node:20-slim AS builder
# openssl is required by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# Install deps first (cached unless manifests/lockfile change).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# Copy sources and build: shared → prisma client → api.
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @hrm/shared build \
  && pnpm --filter @hrm/api exec prisma generate \
  && pnpm --filter @hrm/api build

# ---- runtime ----------------------------------------------------------------
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# pnpm is needed at runtime by the migrate Cloud Run job (`pnpm --filter @hrm/api
# exec prisma migrate deploy`) and the seed job.
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT (8080); app.ts/server.ts already honour it.

# Copy the built workspace (node_modules incl. generated Prisma client + dist).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Needed so `pnpm --filter @hrm/api ...` resolves the workspace at runtime.
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
# Prisma schema + migrations are needed by the migrate job (`prisma migrate deploy`).
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

EXPOSE 8080
# Default command = HTTP API. The worker service overrides this with
# `node apps/api/dist/worker.js` at deploy time.
CMD ["node", "apps/api/dist/server.js"]
